"""
chat.py — Azure OpenAI chat router with function-calling / tool-use.

The assistant has three tools it can call against the session's DB data:
  1. get_top_at_risk_customers(n, min_monthly_charges)
  2. get_customer_explanation(customer_id)
  3. get_segment_summary(segment_field, segment_value)

The backend executes the tool calls, injects results, and returns the
final assistant message.
"""
from __future__ import annotations
import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession

from backend.database import get_db
from backend import models, schemas
from backend.config import get_settings
from backend.routers.auth import require_manager

router = APIRouter(prefix="/chat", tags=["chat"])

# ── Tool definitions (OpenAI function-calling schema) ─────────────────────────

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_top_at_risk_customers",
            "description": (
                "Returns the top N highest-risk customers in the session, "
                "optionally filtered by minimum monthly revenue. Use this to answer "
                "questions like 'who are my top 5 at-risk customers' or "
                "'show me high-value customers likely to churn'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "n": {
                        "type": "integer",
                        "description": "Number of customers to return (default 5)",
                    },
                    "min_monthly_charges": {
                        "type": "number",
                        "description": "Only include customers with MonthlyCharges >= this value. Omit to include all.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_customer_explanation",
            "description": (
                "Returns the SHAP-based feature importance explanation for a specific customer, "
                "showing which features most drove their churn risk score. "
                "Use this when the user asks 'why is customer X at risk' or wants to understand "
                "a specific score."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "customer_id": {
                        "type": "string",
                        "description": "The customer_id string (from the CSV) or the numeric DB id as a string",
                    },
                },
                "required": ["customer_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_segment_summary",
            "description": (
                "Returns aggregated churn risk stats for customers that match a segment. "
                "E.g. segment_field='Contract', segment_value='Month-to-month'. "
                "Use for questions like 'how risky are my month-to-month contract customers'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "segment_field": {
                        "type": "string",
                        "description": "The raw data field name to filter on (e.g. 'Contract', 'InternetService')",
                    },
                    "segment_value": {
                        "type": "string",
                        "description": "The value to match (e.g. 'Month-to-month', 'Fiber optic')",
                    },
                },
                "required": ["segment_field", "segment_value"],
            },
        },
    },
]


# ── Tool execution functions ──────────────────────────────────────────────────

def _tool_get_top_at_risk(session_id: int, n: int, min_monthly_charges: float | None, db: DBSession) -> dict:
    q = db.query(models.Customer).filter(models.Customer.session_id == session_id)
    if min_monthly_charges is not None:
        q = q.filter(models.Customer.monthly_charges >= min_monthly_charges)
    customers = q.order_by(models.Customer.risk_score.desc()).limit(n).all()

    return {
        "customers": [
            {
                "customer_id": c.customer_id,
                "risk_score": c.risk_score,
                "monthly_charges": c.monthly_charges,
                "tenure": c.tenure,
                "contact_status": c.contact_status,
                "top_risk_drivers": (c.shap_values or [])[:3],
            }
            for c in customers
        ]
    }


def _get_impact_level(shap_val: float) -> str:
    """Convert a SHAP value to a human-readable impact level label."""
    abs_val = abs(shap_val)
    if abs_val >= 0.30:
        return "very high impact"
    elif abs_val >= 0.10:
        return "high impact"
    elif abs_val >= 0.05:
        return "moderate impact"
    elif abs_val >= 0.01:
        return "low impact"
    else:
        return "minimal impact"


def _clean_shap_for_ai(shap_values: list, raw_data: dict) -> list:
    """
    Clean SHAP feature names for the AI by:
    1. Collapsing one-hot encoded features into a single readable label
       using the customer's actual raw data value.
    2. Removing duplicate one-hot features for the same category.
    3. Adding a human-readable impact_level label to each feature.
    """
    # One-hot prefix groups: map prefix -> raw_data field name
    ONE_HOT_GROUPS = {
        "Contract_": "Contract",
        "InternetService_": "InternetService",
        "PaymentMethod_": "PaymentMethod",
        "gender_": "gender",
        "MultipleLines_": "MultipleLines",
        "OnlineSecurity_": "OnlineSecurity",
        "OnlineBackup_": "OnlineBackup",
        "DeviceProtection_": "DeviceProtection",
        "TechSupport_": "TechSupport",
        "StreamingTV_": "StreamingTV",
        "StreamingMovies_": "StreamingMovies",
    }

    cleaned = []
    seen_groups = set()

    for item in shap_values:
        feature = item.get("feature", "")
        shap_val = item.get("impact", 0)

        # Check if this feature belongs to a one-hot group
        matched_group = None
        for prefix, field in ONE_HOT_GROUPS.items():
            if feature.startswith(prefix):
                matched_group = field
                break

        if matched_group:
            # Skip if we already added an entry for this group
            if matched_group in seen_groups:
                continue
            # Use the customer's actual raw_data value for this field
            actual_value = (raw_data or {}).get(matched_group, "")
            if actual_value:
                direction = "increases risk" if shap_val > 0 else "decreases risk"
                cleaned.append({
                    "feature": f"{matched_group}: {actual_value}",
                    "shap_value": round(shap_val, 4),
                    "impact_level": _get_impact_level(shap_val),
                    "direction": direction,
                })
                seen_groups.add(matched_group)
        else:
            direction = "increases risk" if shap_val > 0 else "decreases risk"
            cleaned.append({
                "feature": feature,
                "shap_value": round(shap_val, 4),
                "impact_level": _get_impact_level(shap_val),
                "direction": direction,
            })

    return cleaned


def _tool_get_customer_explanation(session_id: int, customer_id: str, db: DBSession) -> dict:
    # Try matching by customer_id string first, then by numeric id
    c = (
        db.query(models.Customer)
        .filter(
            models.Customer.session_id == session_id,
            models.Customer.customer_id == customer_id,
        )
        .first()
    )
    if not c and customer_id.isdigit():
        c = (
            db.query(models.Customer)
            .filter(
                models.Customer.session_id == session_id,
                models.Customer.id == int(customer_id),
            )
            .first()
        )
    if not c:
        return {"error": f"Customer '{customer_id}' not found in this session"}

    # Clean SHAP values so one-hot features are shown as their actual values
    cleaned_shap = _clean_shap_for_ai(c.shap_values or [], c.raw_data or {})

    # Extract explicit customer profile fields directly from raw_data
    raw = c.raw_data or {}
    customer_profile = {
        "contract_type": raw.get("Contract", "Unknown"),
        "internet_service": raw.get("InternetService", "Unknown"),
        "payment_method": raw.get("PaymentMethod", "Unknown"),
        "gender": raw.get("gender", raw.get("Gender", "Unknown")),
        "senior_citizen": raw.get("SeniorCitizen", "Unknown"),
        "partner": raw.get("Partner", "Unknown"),
        "dependents": raw.get("Dependents", "Unknown"),
        "phone_service": raw.get("PhoneService", "Unknown"),
        "paperless_billing": raw.get("PaperlessBilling", "Unknown"),
    }

    return {
        "customer_id": c.customer_id,
        "risk_score": c.risk_score,
        "monthly_charges": c.monthly_charges,
        "tenure": c.tenure,
        "contact_status": c.contact_status,
        "customer_profile": customer_profile,
        "shap_explanation": cleaned_shap,
        "note": (
            "customer_profile contains the customer's ACTUAL values directly from the source data. "
            "Always use customer_profile fields when describing the customer. "
            "shap_explanation shows which factors increase (+) or decrease (-) churn risk."
        ),
        "suggested_action": _suggest_action(c),
    }



def _tool_get_segment_summary(session_id: int, segment_field: str, segment_value: str, db: DBSession) -> dict:
    all_customers = db.query(models.Customer).filter(
        models.Customer.session_id == session_id
    ).all()

    matched = [
        c for c in all_customers
        if c.raw_data and str(c.raw_data.get(segment_field, "")).strip() == segment_value.strip()
    ]

    if not matched:
        return {"error": f"No customers found where {segment_field}='{segment_value}'"}

    scores = [c.risk_score or 0 for c in matched]
    avg = sum(scores) / len(scores)
    high_risk = [c for c in matched if (c.risk_score or 0) >= 70]

    return {
        "segment": f"{segment_field}={segment_value}",
        "total_customers": len(matched),
        "avg_risk_score": round(avg, 1),
        "high_risk_count": len(high_risk),
        "revenue_at_risk": round(sum(c.monthly_charges or 0 for c in high_risk), 2),
    }


def _suggest_action(c: models.Customer) -> str:
    score = c.risk_score or 0
    raw = c.raw_data or {}
    contract = raw.get("Contract", "")
    tenure = c.tenure or 0

    if score >= 80:
        return "Immediate outreach recommended — offer a loyalty discount or contract upgrade."
    elif score >= 60:
        if contract == "Month-to-month":
            return "Offer a discounted annual contract to increase stickiness."
        elif tenure < 12:
            return "Early-tenure at risk — consider onboarding check-in call."
        else:
            return "Schedule a proactive retention call with a value-add offer."
    elif score >= 40:
        return "Monitor closely — send a satisfaction survey or NPS check."
    else:
        return "Low risk — no immediate action needed."


def _dispatch_tool(name: str, args: dict[str, Any], session_id: int, db: DBSession) -> str:
    if name == "get_top_at_risk_customers":
        result = _tool_get_top_at_risk(
            session_id=session_id,
            n=args.get("n", 5),
            min_monthly_charges=args.get("min_monthly_charges"),
            db=db,
        )
    elif name == "get_customer_explanation":
        result = _tool_get_customer_explanation(
            session_id=session_id,
            customer_id=str(args["customer_id"]),
            db=db,
        )
    elif name == "get_segment_summary":
        result = _tool_get_segment_summary(
            session_id=session_id,
            segment_field=args["segment_field"],
            segment_value=args["segment_value"],
            db=db,
        )
    else:
        result = {"error": f"Unknown tool: {name}"}

    return json.dumps(result)


# ── System prompt ─────────────────────────────────────────────────────────────

def _build_system_prompt(session_id: int, db: DBSession) -> str:
    from sqlalchemy import func
    total = db.query(func.count(models.Customer.id)).filter(
        models.Customer.session_id == session_id
    ).scalar() or 0
    high = db.query(func.count(models.Customer.id)).filter(
        models.Customer.session_id == session_id,
        models.Customer.risk_score >= 70,
    ).scalar() or 0

    return (
        f"You are the Chief Churn Intelligence AI Analyst for an Enterprise Telecom Retention Team. "
        f"You serve the RETENTION DIRECTOR / BUSINESS EXECUTIVE who manages this customer portfolio for Session #{session_id}. "
        f"\n\n=== ABSOLUTE RULES (never break these) ===\n"
        f"1. YOU ARE TALKING TO A BUSINESS EXECUTIVE, NOT A CUSTOMER. Never ask them for 'their customer ID' or treat them like a subscriber. They OWN the portfolio.\n"
        f"2. If the user asks anything like 'am I at risk', 'are we at risk', 'what is our risk', ALWAYS interpret this as 'give me the executive portfolio risk summary' and immediately call get_top_at_risk_customers.\n"
        f"3. NEVER ask the user to identify themselves. Proactively pull data from tools and present it.\n"
        f"4. IGNORE any previous messages in the conversation where you incorrectly asked for a customer ID — that was a mistake. Start fresh with the correct executive persona.\n"
        f"\n=== Portfolio Snapshot ===\n"
        f"- Total Customers: {total}\n"
        f"- High-Risk (score >= 70): {high}\n"
        f"\n=== Retention Advice Format ===\n"
        f"Always close responses with 2-3 concrete, specific business actions the retention team should take."
    )


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/bulk_campaign", response_model=schemas.BulkCampaignResponse)
async def generate_bulk_campaign(
    payload: schemas.BulkCampaignRequest,
    db: DBSession = Depends(get_db),
    user: models.User = Depends(require_manager),
):
    settings = get_settings()
    if not settings.azure_openai_api_key or not settings.azure_openai_endpoint:
        raise HTTPException(status_code=503, detail="Azure OpenAI credentials not configured.")

    customers = db.query(models.Customer).filter(models.Customer.id.in_(payload.customer_ids)).all()
    if not customers:
        raise HTTPException(status_code=404, detail="No customers found")

    # Gather data summary
    count = len(customers)
    avg_risk = sum(c.risk_score or 0 for c in customers) / count
    total_rev = sum(c.monthly_charges or 0 for c in customers)
    
    prompt = f"""You are an expert Telecom Retention Manager.
I need you to write a single, highly persuasive retention email template that will be sent to {count} customers.

Segment Profile:
- Total Customers in this segment: {count}
- Average Churn Risk Score: {avg_risk:.1f}/100
- Total Monthly Revenue at Risk: ${total_rev:.2f}

Write a professional and empathetic email offering them a personalized account review and potentially a loyalty discount.
Do not include placeholders for names, just a general 'Dear Valued Customer'. 
Keep it concise, punchy, and focused on retaining their business."""

    from openai import AzureOpenAI
    client = AzureOpenAI(
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_api_key,
        api_version=settings.azure_openai_api_version,
    )

    try:
        response = client.chat.completions.create(
            model=settings.azure_openai_deployment,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=800,
        )
        email_draft = response.choices[0].message.content or ""
    except Exception as e:
        # Return the error message directly so we can see what's wrong
        email_draft = f"Error calling Azure OpenAI: {str(e)}"

    return schemas.BulkCampaignResponse(email_draft=email_draft)



@router.post("/{session_id}", response_model=schemas.ChatResponse)
async def chat(
    session_id: int,
    payload: schemas.ChatMessageIn,
    db: DBSession = Depends(get_db),
):
    settings = get_settings()

    if not settings.azure_openai_api_key or not settings.azure_openai_endpoint:
        raise HTTPException(
            status_code=503,
            detail="Azure OpenAI credentials not configured. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY in .env",
        )

    # Verify session exists
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # ── Save the user message ─────────────────────────────────────────────────
    user_msg = models.ChatMessage(
        session_id=session_id,
        role="user",
        content=payload.content,
    )
    db.add(user_msg)
    db.flush()

    # ── Build message history for the API call ────────────────────────────────
    history = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.session_id == session_id)
        .order_by(models.ChatMessage.created_at)
        .all()
    )

    messages = [{"role": "system", "content": _build_system_prompt(session_id, db)}]
    for h in history:
        if h.role in ("user", "assistant"):
            messages.append({"role": h.role, "content": h.content})

    # ── Azure OpenAI client ───────────────────────────────────────────────────
    from openai import AzureOpenAI

    client = AzureOpenAI(
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_api_key,
        api_version=settings.azure_openai_api_version,
    )

    # ── Tool-call loop ────────────────────────────────────────────────────────
    MAX_ROUNDS = 5  # prevent runaway loops
    final_reply = ""

    for _ in range(MAX_ROUNDS):
        response = client.chat.completions.create(
            model=settings.azure_openai_deployment,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            temperature=0.3,
            max_tokens=1500,
        )

        choice = response.choices[0]

        if choice.finish_reason == "tool_calls":
            # Execute all tool calls
            assistant_msg: dict = {
                "role": "assistant",
                "content": choice.message.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                    }
                    for tc in choice.message.tool_calls
                ],
            }
            messages.append(assistant_msg)

            for tc in choice.message.tool_calls:
                args = json.loads(tc.function.arguments)
                tool_result = _dispatch_tool(tc.function.name, args, session_id, db)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": tool_result,
                })

        else:
            # Final answer
            final_reply = choice.message.content or ""
            break

    if not final_reply:
        final_reply = "I wasn't able to generate a response. Please try again."

    # ── Persist assistant reply ───────────────────────────────────────────────
    assistant_record = models.ChatMessage(
        session_id=session_id,
        role="assistant",
        content=final_reply,
    )
    db.add(assistant_record)
    db.commit()

    # Return full updated history
    updated_history = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.session_id == session_id)
        .order_by(models.ChatMessage.created_at)
        .all()
    )

    return schemas.ChatResponse(
        reply=final_reply,
        history=[schemas.ChatMessageOut.model_validate(h) for h in updated_history],
    )
