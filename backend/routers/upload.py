"""
upload.py — CSV ingestion router.

POST /upload
  - Accepts a multipart CSV file
  - Optional query param: session_id (append) or session_name (create new)
  - Runs predict_risk() + explain_risk() on each row
  - Stores all results in the DB
"""
import io
import uuid
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.database import get_db
from backend import models, schemas
from backend.ml.predictor import predict_batch
from backend.routers.auth import require_manager

router = APIRouter(prefix="/upload", tags=["upload"])

# Columns we try to extract from the CSV for fast access
_NUMERIC_COLS = {"MonthlyCharges": "monthly_charges",
                 "TotalCharges": "total_charges",
                 "tenure": "tenure"}

# The column in the CSV that holds a pre-existing customer identifier (optional)
_CUSTOMER_ID_COL = "customerID"


def _safe_float(val) -> Optional[float]:
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _safe_int(val) -> Optional[int]:
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return None


@router.post("/", status_code=201)
async def upload_csv(
    file: UploadFile = File(...),
    session_id: Optional[int] = Form(None),
    session_name: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager),
):
    """
    Upload a CSV file and score every row with the churn model using vectorized batch inference.
    Only managers can perform batch data ingestion.
    """
    # ── Resolve / create session ──────────────────────────────────────────────
    if session_id:
        session = db.query(models.Session).filter(models.Session.id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    else:
        name = session_name or file.filename or "Unnamed Session"
        session = models.Session(name=name, created_by_id=current_user.id)
        db.add(session)
        db.flush()  # get the id without committing

    # ── Parse CSV ─────────────────────────────────────────────────────────────
    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse CSV: {e}")

    if df.empty:
        raise HTTPException(status_code=422, detail="CSV file is empty")

    # Drop any completely-null rows
    df = df.dropna(how="all")

    # ── Vectorized Batch Scoring ──────────────────────────────────────────────
    try:
        scores = predict_batch(df)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"ML scoring error: {e}")

    # Prepare records for direct C-level bulk SQL insertion
    records_df = df.where(pd.notna(df), None)
    rows_data = records_df.to_dict(orient="records")

    mappings = []
    chunk_size = 5000
    total_processed = len(rows_data)

    for i, row_dict in enumerate(rows_data):
        cust_id = str(row_dict.get(_CUSTOMER_ID_COL) or f"auto-{uuid.uuid4().hex[:8]}")
        monthly = _safe_float(row_dict.get("MonthlyCharges"))
        total = _safe_float(row_dict.get("TotalCharges"))
        tenure_val = _safe_int(row_dict.get("tenure"))

        mappings.append({
            "session_id": session.id,
            "customer_id": cust_id,
            "monthly_charges": monthly,
            "total_charges": total,
            "tenure": tenure_val,
            "raw_data": row_dict,
            "risk_score": float(scores[i]),
            "shap_values": None,
            "contact_status": models.ContactStatusEnum.not_contacted,
        })

        if len(mappings) >= chunk_size:
            db.bulk_insert_mappings(models.Customer, mappings)
            db.commit()
            mappings = []

    if mappings:
        db.bulk_insert_mappings(models.Customer, mappings)
        db.commit()

    return {
        "session_id": session.id,
        "session_name": session.name,
        "rows_processed": total_processed,
        "rows_failed": 0,
        "errors": [],
    }


