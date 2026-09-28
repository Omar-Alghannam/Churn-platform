"""
predictor.py — ML inference + SHAP explainability layer.

Exposes:
  predict_risk(customer_dict) -> float          (0-100 risk score)
  explain_risk(customer_dict) -> list[dict]     (top SHAP feature drivers)
"""
from __future__ import annotations
import numpy as np
import shap

from backend.ml.predict import model, predict_risk, predict_batch, get_scaled_array  # noqa: F401 (re-export)

# Build the SHAP explainer once at import time (fast for TreeExplainer)
_explainer = shap.TreeExplainer(model)


def explain_risk(customer: dict, top_n: int = 8) -> list[dict]:
    """
    Returns the top-N most influential SHAP features for a single customer.

    Each entry: {
        "feature":  "Contract_Month-to-month",
        "value":    1,                          # the actual feature value post-encoding
        "impact":   0.42                        # SHAP value — positive means ↑ churn risk
    }
    """
    scaled_arr, feature_names = get_scaled_array(customer)

    # shap_values for a binary classifier: index [1] = churn class
    sv = _explainer.shap_values(scaled_arr)

    # Some XGBoost versions return list[array], others return array
    if isinstance(sv, list):
        churn_shap = sv[1][0]           # shape: (n_features,)
    else:
        churn_shap = sv[0]

    # Pair feature names with their scaled values and SHAP impacts
    pairs = [
        {
            "feature": feat,
            "value": float(scaled_arr[0][i]),
            "impact": round(float(churn_shap[i]), 4),
        }
        for i, feat in enumerate(feature_names)
    ]

    # Sort by |impact| descending, return top_n
    pairs.sort(key=lambda x: abs(x["impact"]), reverse=True)
    return pairs[:top_n]
