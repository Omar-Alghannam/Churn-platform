from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel


# ── Auth & Users ─────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    email: str
    name: str
    password: str
    role: str = "sales_agent"  # manager | sales_agent


class UserLogin(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ── Teams ────────────────────────────────────────────────────────────────────

class TeamCreate(BaseModel):
    name: str


class TeamMemberOut(BaseModel):
    id: int
    user_id: int
    name: str
    email: str
    role: str
    target_quota: Optional[int] = 50
    joined_at: datetime

    model_config = {"from_attributes": True}


class TeamMemberAdd(BaseModel):
    user_id: int
    role: str = "member"
    target_quota: Optional[int] = 50


class RosterUserOut(BaseModel):
    id: int
    email: str
    name: str
    role: str
    team_id: Optional[int] = None
    team_name: Optional[str] = None
    joined_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AgentMetric(BaseModel):
    user_id: int
    name: str
    email: str
    role: str
    target_quota: int = 50
    contacted_count: int = 0
    saved_count: int = 0
    revenue_saved: float = 0.0
    progress_pct: float = 0.0


class TeamMetricsOut(BaseModel):
    team_id: int
    team_name: str
    total_agents: int = 0
    total_assigned: int = 0
    total_contacted: int = 0
    total_saved: int = 0
    team_retention_rate: float = 0.0
    revenue_saved: float = 0.0
    agent_metrics: list[AgentMetric] = []


class TeamOut(BaseModel):
    id: int
    name: str
    created_by_id: Optional[int]
    created_at: datetime
    member_count: int = 0
    members: list[TeamMemberOut] = []

    model_config = {"from_attributes": True}


class InviteCreate(BaseModel):
    email: str
    role: str = "sales_agent"


class InviteOut(BaseModel):
    id: int
    team_id: int
    team_name: Optional[str] = None
    email: str
    role: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Session ───────────────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    team_id: Optional[int] = None


class SessionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    team_id: Optional[int] = None

class SessionAssign(BaseModel):
    user_id: int
    target_quota: Optional[int] = 50
    note: Optional[str] = None


class SessionOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    team_id: Optional[int] = None
    assigned_to_id: Optional[int] = None
    assigned_to_name: Optional[str] = None
    target_quota: Optional[int] = 50
    assignment_note: Optional[str] = None
    created_at: datetime
    customer_count: int = 0

    model_config = {"from_attributes": True}



# ── Customer Creation & Risk Preview ──────────────────────────────────────────

class CustomerCreate(BaseModel):
    session_id: int
    customer_id: Optional[str] = None
    gender: str = "Male"
    SeniorCitizen: int = 0
    Partner: str = "No"
    Dependents: str = "No"
    tenure: int = 6
    PhoneService: str = "Yes"
    MultipleLines: str = "No"
    InternetService: str = "Fiber optic"
    OnlineSecurity: str = "No"
    OnlineBackup: str = "No"
    DeviceProtection: str = "No"
    TechSupport: str = "No"
    StreamingTV: str = "No"
    StreamingMovies: str = "No"
    Contract: str = "Month-to-month"
    PaperlessBilling: str = "Yes"
    PaymentMethod: str = "Electronic check"
    MonthlyCharges: float = 75.0
    TotalCharges: Optional[float] = None


class RiskPreviewRequest(BaseModel):
    gender: str = "Male"
    SeniorCitizen: int = 0
    Partner: str = "No"
    Dependents: str = "No"
    tenure: int = 6
    PhoneService: str = "Yes"
    MultipleLines: str = "No"
    InternetService: str = "Fiber optic"
    OnlineSecurity: str = "No"
    OnlineBackup: str = "No"
    DeviceProtection: str = "No"
    TechSupport: str = "No"
    StreamingTV: str = "No"
    StreamingMovies: str = "No"
    Contract: str = "Month-to-month"
    PaperlessBilling: str = "Yes"
    PaymentMethod: str = "Electronic check"
    MonthlyCharges: float = 75.0
    TotalCharges: Optional[float] = None


class RiskPreviewResponse(BaseModel):
    risk_score: float
    risk_level: str
    churn_probability: float


# ── Customer ──────────────────────────────────────────────────────────────────

class ShapEntry(BaseModel):
    feature: str
    value: Any
    impact: float     # positive → increases churn risk, negative → lowers it


class CustomerOut(BaseModel):
    id: int
    session_id: int
    customer_id: str
    monthly_charges: Optional[float]
    total_charges: Optional[float]
    tenure: Optional[int]
    risk_score: Optional[float]
    contact_status: str
    contact_notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class CustomerDetail(CustomerOut):
    raw_data: dict[str, Any]
    shap_values: Optional[list[ShapEntry]]


# ── Contact status update ─────────────────────────────────────────────────────

class ContactStatusUpdate(BaseModel):
    status: str     # one of ContactStatusEnum values
    notes: Optional[str] = None

class BulkStatusUpdateRequest(BaseModel):
    customer_ids: list[int]
    status: str



# ── Stats ─────────────────────────────────────────────────────────────────────

class SessionStats(BaseModel):
    session_id: int
    total_customers: int
    high_risk_count: int          # risk_score >= 70
    medium_risk_count: int        # 40 <= risk_score < 70
    low_risk_count: int           # risk_score < 40
    revenue_at_risk: float        # sum of monthly_charges for high-risk
    revenue_saved: float          # sum of monthly_charges for converted
    avg_risk_score: float
    model_auc: float
    assigned_agent_id: Optional[int] = None
    assigned_agent_name: Optional[str] = None
    target_quota: Optional[int] = None
    assignment_note: Optional[str] = None
    contacted_count: int = 0
    converted_count: int = 0


# ── Chat ─────────────────────────────────────────────────────────────────────

class ChatMessageIn(BaseModel):
    content: str

class ChatMessageOut(BaseModel):
    id: int
    session_id: int
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Notifications ─────────────────────────────────────────────────────────────

class NotificationOut(BaseModel):
    id: int
    title: str
    message: str
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatResponse(BaseModel):
    reply: str
    history: list[ChatMessageOut]

class BulkCampaignRequest(BaseModel):
    customer_ids: list[int]

class BulkCampaignResponse(BaseModel):
    email_draft: str
