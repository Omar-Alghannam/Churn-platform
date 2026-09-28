"""
predict.py — ML inference core (copied from project root, paths resolved to ml_artifacts/).
Do NOT modify the predict_risk() logic. Only the artifact paths differ from the original.
"""
import os
import joblib
import pandas as pd

# ── Resolve paths relative to THIS file, not CWD ─────────────────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))
_ARTIFACTS = os.path.abspath(os.path.join(_HERE, "..", "ml_artifacts"))

model = joblib.load(os.path.join(_ARTIFACTS, "churn_model.pkl"))
scaler = joblib.load(os.path.join(_ARTIFACTS, "churn_scaler.pkl"))
columns = joblib.load(os.path.join(_ARTIFACTS, "churn_columns.pkl"))


def predict_risk(customer: dict) -> float:
    """
    customer: a dict with raw, human-readable fields, e.g.
    {
        "gender": "Male",
        "SeniorCitizen": 0,
        "Partner": "Yes",
        "Dependents": "No",
        "tenure": 2,
        "PhoneService": "Yes",
        "PaperlessBilling": "Yes",
        "MonthlyCharges": 95.0,
        "TotalCharges": 190.0,
        "MultipleLines": "Yes",
        "InternetService": "Fiber optic",
        "OnlineSecurity": "No",
        "OnlineBackup": "No",
        "DeviceProtection": "No",
        "TechSupport": "No",
        "StreamingTV": "Yes",
        "StreamingMovies": "Yes",
        "Contract": "Month-to-month",
        "PaymentMethod": "Electronic check"
    }
    Returns: risk score 0–100 (float)
    """
    df = pd.DataFrame([customer])

    # Step 1: binary Yes/No and gender columns -> 0/1 (same mapping as notebook Cell 38)
    binary_map = {"Yes": 1, "No": 0, "Female": 0, "Male": 1}
    for col in ["gender", "Partner", "Dependents", "PhoneService", "PaperlessBilling"]:
        if col in df.columns:
            df[col] = df[col].map(binary_map)

    # Step 2: one-hot encode the same multi-category columns as training
    multi_cols = [
        "MultipleLines", "InternetService", "OnlineSecurity", "OnlineBackup",
        "DeviceProtection", "TechSupport", "StreamingTV", "StreamingMovies",
        "Contract", "PaymentMethod",
    ]
    df = pd.get_dummies(df, columns=[c for c in multi_cols if c in df.columns])

    # Step 3: force the exact 30 columns, same order, fill missing ones with 0
    df = df.reindex(columns=columns, fill_value=0)

    # Step 4: scale, exactly like training
    scaled = scaler.transform(df)

    # Step 5: predict
    prob = model.predict_proba(scaled)[0][1]
    risk_score = round(float(prob) * 100, 1)
    return risk_score


def get_scaled_array(customer: dict):
    """Returns the scaled numpy array for a single customer (used by SHAP explainer)."""
    df = pd.DataFrame([customer])

    binary_map = {"Yes": 1, "No": 0, "Female": 0, "Male": 1}
    for col in ["gender", "Partner", "Dependents", "PhoneService", "PaperlessBilling"]:
        if col in df.columns:
            df[col] = df[col].map(binary_map)

    multi_cols = [
        "MultipleLines", "InternetService", "OnlineSecurity", "OnlineBackup",
        "DeviceProtection", "TechSupport", "StreamingTV", "StreamingMovies",
        "Contract", "PaymentMethod",
    ]
    df = pd.get_dummies(df, columns=[c for c in multi_cols if c in df.columns])
    df = df.reindex(columns=columns, fill_value=0)
    return scaler.transform(df), columns


def predict_batch(df: pd.DataFrame):
    """
    Vectorized batch prediction for high performance on 10,000 - 100,000+ rows.
    Returns: numpy array of risk scores (0-100 float).
    """
    import numpy as np
    df_work = df.copy()

    # Coerce numeric columns (TotalCharges in Telco dataset contains blank spaces ' ' for 0-tenure rows)
    for num_col in ["TotalCharges", "MonthlyCharges", "tenure", "SeniorCitizen"]:
        if num_col in df_work.columns:
            df_work[num_col] = pd.to_numeric(df_work[num_col], errors="coerce").fillna(0)

    binary_map = {"Yes": 1, "No": 0, "Female": 0, "Male": 1}
    for col in ["gender", "Partner", "Dependents", "PhoneService", "PaperlessBilling"]:
        if col in df_work.columns:
            df_work[col] = df_work[col].map(binary_map).fillna(0)

    multi_cols = [
        "MultipleLines", "InternetService", "OnlineSecurity", "OnlineBackup",
        "DeviceProtection", "TechSupport", "StreamingTV", "StreamingMovies",
        "Contract", "PaymentMethod",
    ]
    existing_multi = [c for c in multi_cols if c in df_work.columns]
    if existing_multi:
        df_work = pd.get_dummies(df_work, columns=existing_multi)

    df_work = df_work.reindex(columns=columns, fill_value=0)
    df_work = df_work.apply(pd.to_numeric, errors="coerce").fillna(0)

    scaled = scaler.transform(df_work)
    probs = model.predict_proba(scaled)[:, 1]
    return np.round(probs * 100, 1)

