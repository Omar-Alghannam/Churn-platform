# B2B Churn Intelligence & Retention Platform

An enterprise-grade, full-stack intelligence platform that bridges **predictive machine learning**, **explainable AI (XAI)**, and **frontline retention operations**. Built to identify at-risk enterprise accounts early, uncover root risk drivers, and equip retention squads with real-time AI copilots during active customer calls.

---

## The Problem & Business Impact
In enterprise telecom and B2B SaaS, customer churn is silent and expensive:
1. **Lagging Indicators:** Companies often realize a customer is leaving only after they request cancellation.
2. **The "Black-Box" ML Problem:** Traditional machine learning models output a churn percentage (e.g. *82% risk*) but give account executives zero context on *why* or what offer could save the contract.
3. **Frontline Disconnect:** High-level executive reports rarely translate into actionable, daily workflows for support and retention agents on the phones.

**How This Platform Solves It:**
* **Predicts** churn probability before contract expiry using an optimized **XGBoost** classification model.
* **Explains** root cause drivers for every customer individually using **SHAP (Shapley Additive exPlanations)**.
* **Operationalizes** retention with role-based access control (RBAC), a real-time call queue, live quota tracking, and an **in-call GenAI copilot**.

---

## System Architecture & Workflow

```text
┌────────────────────────┐       ┌─────────────────────────┐       ┌────────────────────────┐
│   Enterprise Telemetry │ ───►  │  FastAPI Inference Core │ ───►  │  Explainable AI (SHAP) │
│ (Usage, Tenure, Bills) │       │    (XGBoost Classifier) │       │   Feature Attributions │
└────────────────────────┘       └────────────┬────────────┘       └───────────┬────────────┘
                                              │                                │
                                              ▼                                ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                                   React Frontend Engine                                   │
├───────────────────────────────────────────┬───────────────────────────────────────────────┤
│          Executive / Manager View         │             Frontline Agent View              │
│  • Portfolio ARR at Risk                  │  • Assigned Priority Call Queue               │
│  • Team Performance & Lead Dispatch       │  • Live Quota & Revenue Recovery Tracker      │
│  • Interactive Risk Analytics             │  • In-Call GenAI Copilot (Battle-cards)       │
└───────────────────────────────────────────┴───────────────────────────────────────────────┘
```

---

## Core Capabilities

### 1. Executive & Manager Intelligence
* **Portfolio Risk Distribution:** Visualizes revenue at risk, churn percentages, and high-risk accounts across enterprise contracts.
* **SHAP Factor Attribution Drawer:** Transparently explains why a customer was flagged (e.g., impact of month-to-month contracts, tenure, lack of technical support, or billing hikes).
* **Workforce & Squad Management:** Manage retention squads, balance lead workloads across agents, and track team conversion metrics and recovered ARR.

### 2. Frontline Agent Experience & Live Call Queue
* **Intelligent Call Queue:** Automatically prioritized worklist showing assigned high-risk accounts with one-click status transitions (*Not Contacted → Contacted → Converted / Lost*).
* **Live Quota Reconciliation:** Real-time progress tracker reflecting agent targets and recovered customer revenue.
* **In-Call GenAI Retention Copilot:** Built-in LLM copilot that digests customer telemetry and SHAP risk drivers to generate instant talking points, objection handling, and tailored retention offers during active customer calls.

---

## Tech Stack & Technical Deep-Dive

| Layer | Technologies | Purpose |
|---|---|---|
| **Machine Learning** | `XGBoost`, `SHAP`, `Scikit-Learn`, `Pandas` | Churn prediction & individual feature attribution |
| **Backend API** | `FastAPI`, `Python 3.10+`, `Pydantic v2` | High-throughput async REST endpoints & model serving |
| **Database & ORM** | `PostgreSQL`, `SQLAlchemy`, `Docker Compose` | Relational persistence for accounts, sessions, & team state |
| **GenAI / Copilot** | `Azure OpenAI (gpt-4o-mini)`, Tool Calling | Context-grounded live negotiation battle-cards |
| **Frontend** | `React`, `Vite`, Modular Design System | Responsive, low-latency UI for managers and agents |

---

## Getting Started (Local Setup)

### Prerequisites
* **Docker Desktop** (for PostgreSQL)
* **Python 3.10+**
* **Node.js 18+**

### 1. Database
```powershell
docker-compose up -d
```
*(Postgres runs on port `5432`; pgAdmin runs on `http://localhost:5050`)*

### 2. Backend Setup
```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# Copy environment template
cp .env.example .env
```
> Edit `backend/.env` to configure your database connection and Azure OpenAI keys.

Start the FastAPI server:
```powershell
cd ..
uvicorn backend.main:app --reload --port 8000
```
Interactive Swagger API docs will be live at: **`http://localhost:8000/docs`**

### 3. Frontend Setup
```powershell
cd frontend
npm install
npm run dev
```
Open the web application at: **`http://localhost:5173`**

---

## API Reference Highlights

* `GET /sessions/` — List all intelligence sessions and high-level risk summaries.
* `GET /sessions/{id}/stats` — Fetch calculated portfolio stats (ARR at risk, conversion rates).
* `GET /customers/session/{id}` — Filtered and paginated customer risk records.
* `GET /customers/{id}` — Detailed customer profile with calculated **SHAP feature impacts**.
* `PATCH /customers/{id}/status` — Update outreach status (*Contacted / Converted / Lost*).
* `POST /upload/` — CSV ingestion pipeline with automated feature encoding and inference.
* `POST /chat/{session_id}` — In-session AI Copilot with tool-calling support.

---

## Demo Credentials
For testing and demonstrations, mock roles are pre-configured:
* **Manager Role:** `sarah.director@telecom.com` | Password: `demo123`
* **Agent Role:** `alex.agent@telecom.com` | Password: `demo123`

---

## License
This project is open-source and available under the **MIT License**.
