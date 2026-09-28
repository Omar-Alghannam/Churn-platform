from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.database import get_db
from backend import models, schemas

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("/session/{session_id}", response_model=list[schemas.CustomerOut])
def list_customers(
    session_id: int,
    sort_by: str = Query("risk_score", description="Field to sort by"),
    order: str = Query("desc", description="asc or desc"),
    min_risk: Optional[float] = Query(None),
    max_risk: Optional[float] = Query(None),
    contact_status: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    q = db.query(models.Customer).filter(models.Customer.session_id == session_id)

    if min_risk is not None:
        q = q.filter(models.Customer.risk_score >= min_risk)
    if max_risk is not None:
        q = q.filter(models.Customer.risk_score <= max_risk)
    if contact_status:
        q = q.filter(models.Customer.contact_status == contact_status)

    # Sorting
    col = getattr(models.Customer, sort_by, models.Customer.risk_score)
    q = q.order_by(col.desc() if order == "desc" else col.asc())

    return q.offset(skip).limit(limit).all()


@router.get("/{customer_id}", response_model=schemas.CustomerDetail)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    c = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")

    detail = schemas.CustomerDetail.model_validate(c)
    shap_source = c.shap_values
    if not shap_source and c.raw_data:
        from backend.ml.predictor import explain_risk
        try:
            shap_source = explain_risk(c.raw_data)
            c.shap_values = shap_source
            db.commit()
        except Exception:
            shap_source = []

    if shap_source:
        # Clean one-hot encoded feature names for the frontend UI
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
        
        cleaned_shap = []
        seen_groups = set()
        raw_data = c.raw_data or {}
        
        for e in c.shap_values:
            feat = e.get("feature", "")
            
            matched_group = None
            for prefix, field in ONE_HOT_GROUPS.items():
                if feat.startswith(prefix):
                    matched_group = field
                    break
                    
            if matched_group:
                if matched_group in seen_groups:
                    continue
                actual_value = raw_data.get(matched_group, "")
                if actual_value:
                    e["feature"] = f"{matched_group}: {actual_value}"
                    cleaned_shap.append(e)
                    seen_groups.add(matched_group)
            else:
                cleaned_shap.append(e)

        detail.shap_values = [schemas.ShapEntry(**e) for e in cleaned_shap]
        
    return detail


@router.patch("/bulk_status", response_model=list[schemas.CustomerOut])
def bulk_update_contact_status(
    payload: schemas.BulkStatusUpdateRequest,
    db: Session = Depends(get_db),
):
    customers = db.query(models.Customer).filter(models.Customer.id.in_(payload.customer_ids)).all()
    if not customers:
        raise HTTPException(status_code=404, detail="No customers found")

    for c in customers:
        c.contact_status = payload.status
    db.commit()

    # Refresh and return
    for c in customers:
        db.refresh(c)
    return customers


from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from backend.alerts import send_manager_milestone_alert


@router.patch("/{customer_id}/status", response_model=schemas.CustomerOut)
def update_contact_status(
    customer_id: int,
    payload: schemas.ContactStatusUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    c = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")

    valid_statuses = [e.value for e in models.ContactStatusEnum]
    if payload.status not in valid_statuses:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid status. Must be one of: {valid_statuses}",
        )

    old_status = c.contact_status
    c.contact_status = payload.status
    c.contact_notes = payload.notes
    c.contact_updated_at = datetime.utcnow()
    db.commit()
    db.refresh(c)

    # If converted, notify manager via background alert
    if payload.status == "converted" and old_status != "converted" and (c.monthly_charges or 0) > 0:
        # Find manager email
        manager = db.query(models.User).filter(models.User.role == "manager").first()
        manager_email = manager.email if manager else "oaa5429946@gmail.com"
        background_tasks.add_task(
            send_manager_milestone_alert,
            manager_email,
            "Sales Agent",
            c.customer_id,
            float(c.monthly_charges or 0),
        )

    return c


@router.post("/preview-risk", response_model=schemas.RiskPreviewResponse)
def preview_customer_risk(payload: schemas.RiskPreviewRequest):
    from backend.ml.predict import predict_risk
    
    total_charges = payload.TotalCharges
    if total_charges is None or total_charges <= 0:
        total_charges = round(payload.MonthlyCharges * max(1, payload.tenure), 2)
        
    raw_dict = {
        "gender": payload.gender,
        "SeniorCitizen": payload.SeniorCitizen,
        "Partner": payload.Partner,
        "Dependents": payload.Dependents,
        "tenure": payload.tenure,
        "PhoneService": payload.PhoneService,
        "MultipleLines": payload.MultipleLines,
        "InternetService": payload.InternetService,
        "OnlineSecurity": payload.OnlineSecurity,
        "OnlineBackup": payload.OnlineBackup,
        "DeviceProtection": payload.DeviceProtection,
        "TechSupport": payload.TechSupport,
        "StreamingTV": payload.StreamingTV,
        "StreamingMovies": payload.StreamingMovies,
        "Contract": payload.Contract,
        "PaperlessBilling": payload.PaperlessBilling,
        "PaymentMethod": payload.PaymentMethod,
        "MonthlyCharges": payload.MonthlyCharges,
        "TotalCharges": total_charges,
    }
    
    try:
        score = predict_risk(raw_dict)
    except Exception:
        score = 50.0

    level = "high" if score >= 70 else ("medium" if score >= 40 else "low")
    return schemas.RiskPreviewResponse(
        risk_score=score,
        risk_level=level,
        churn_probability=round(score / 100.0, 3)
    )


@router.post("/", response_model=schemas.CustomerDetail, status_code=201)
def create_single_customer(
    payload: schemas.CustomerCreate,
    db: Session = Depends(get_db),
):
    import random
    from backend.ml.predictor import predict_risk, explain_risk

    session = db.query(models.Session).filter(models.Session.id == payload.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Target session not found.")

    cid = payload.customer_id
    if not cid or not cid.strip():
        cid = f"CUST-{random.randint(1000, 9999)}"

    total_charges = payload.TotalCharges
    if total_charges is None or total_charges <= 0:
        total_charges = round(payload.MonthlyCharges * max(1, payload.tenure), 2)

    raw_dict = {
        "customerID": cid,
        "gender": payload.gender,
        "SeniorCitizen": payload.SeniorCitizen,
        "Partner": payload.Partner,
        "Dependents": payload.Dependents,
        "tenure": payload.tenure,
        "PhoneService": payload.PhoneService,
        "MultipleLines": payload.MultipleLines,
        "InternetService": payload.InternetService,
        "OnlineSecurity": payload.OnlineSecurity,
        "OnlineBackup": payload.OnlineBackup,
        "DeviceProtection": payload.DeviceProtection,
        "TechSupport": payload.TechSupport,
        "StreamingTV": payload.StreamingTV,
        "StreamingMovies": payload.StreamingMovies,
        "Contract": payload.Contract,
        "PaperlessBilling": payload.PaperlessBilling,
        "PaymentMethod": payload.PaymentMethod,
        "MonthlyCharges": payload.MonthlyCharges,
        "TotalCharges": total_charges,
    }

    try:
        score = predict_risk(raw_dict)
    except Exception as e:
        score = 50.0

    try:
        shap_vals = explain_risk(raw_dict)
    except Exception:
        shap_vals = []

    customer = models.Customer(
        session_id=payload.session_id,
        customer_id=cid,
        monthly_charges=payload.MonthlyCharges,
        total_charges=total_charges,
        tenure=payload.tenure,
        risk_score=score,
        contact_status="not_contacted",
        raw_data=raw_dict,
        shap_values=shap_vals,
    )

    db.add(customer)
    db.commit()
    db.refresh(customer)

    return customer

