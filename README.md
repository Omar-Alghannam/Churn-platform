# Churn Intelligence — Developer Guide

## Project Structure

```
c:\Eand\
├── backend/
│   ├── main.py              ← FastAPI entrypoint
│   ├── models.py            ← SQLAlchemy ORM (sessions, customers, chat)
│   ├── schemas.py           ← Pydantic request/response schemas
│   ├── database.py          ← DB engine + get_db() dependency
│   ├── config.py            ← Settings loaded from .env
│   ├── routers/
│   │   ├── sessions.py      ← Session CRUD + stats + chat history
│   │   ├── customers.py     ← Customer list, detail, status update
│   │   ├── upload.py        ← CSV upload → ML score → store
│   │   └── chat.py          ← Azure OpenAI chat with tool-calling
│   ├── ml/
│   │   ├── predict.py       ← predict_risk() (path-resolved version)
│   │   └── predictor.py     ← explain_risk() via SHAP TreeExplainer
│   ├── ml_artifacts/        ← churn_model.pkl, churn_scaler.pkl, churn_columns.pkl
│   ├── requirements.txt
│   └── .env.example         ← Template — copy to .env and fill in
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js
│   │   ├── index.css        ← Full design system
│   │   └── components/
│   │       ├── Sidebar.jsx
│   │       ├── StatCards.jsx
│   │       ├── UploadPanel.jsx
│   │       ├── CustomerTable.jsx
│   │       ├── CustomerDetail.jsx   ← SHAP drawer + contact status
│   │       └── ChatPanel.jsx        ← AI chat with tool-call loop
│   ├── package.json
│   ├── vite.config.js
│   └── .env
├── docker-compose.yml        ← Postgres + pgAdmin for local dev
└── .gitignore
```

---

## 1. First-Time Setup

### Prerequisites
- Python 3.10+
- Node.js 18+
- Docker Desktop (for local Postgres)

### Step 1 — Copy the ML artifacts

The pkl files should already be in `backend/ml_artifacts/`. If not, run:
```powershell
Copy-Item churn_model.pkl backend\ml_artifacts\
Copy-Item churn_scaler.pkl backend\ml_artifacts\
Copy-Item churn_columns.pkl backend\ml_artifacts\
```

### Step 2 — Create the backend .env

```powershell
Copy-Item backend\.env.example backend\.env
```
Then open `backend\.env` and fill in:
- `AZURE_OPENAI_ENDPOINT` — your Azure OpenAI resource endpoint
- `AZURE_OPENAI_API_KEY` — Key 1 from the Azure Portal
- `MODEL_AUC` — the AUC value from your Colab training notebook (e.g. `0.84`)

The `DATABASE_URL` is already set for local Docker Compose.

### Step 3 — Start Postgres (Docker)

```powershell
docker-compose up -d
```

pgAdmin available at: http://localhost:5050  
(Email: `admin@local.dev` / Password: `admin`)

### Step 4 — Install Python dependencies

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### Step 5 — Start the backend

```powershell
# From the c:\Eand directory (NOT inside backend/)
cd c:\Eand
backend\.venv\Scripts\activate
uvicorn backend.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

### Step 6 — Install frontend dependencies

```powershell
cd c:\Eand\frontend
npm install
```

### Step 7 — Start the frontend

```powershell
cd c:\Eand\frontend
npm run dev
```

App available at: http://localhost:5173

---

## 2. Azure OpenAI Setup

See the [Implementation Plan](./implementation_plan.md) for the full walkthrough. Summary:

1. Request access at https://aka.ms/oai/access
2. Create Azure OpenAI resource in East US, Standard S0
3. Deploy `gpt-4o-mini` in AI Foundry → Deployments
4. Copy endpoint + key to `backend/.env`

---

## 3. Using the App

1. **Create a session** — click "New Session" in the sidebar
2. **Upload a CSV** — go to "Upload Data" tab, drop your Telco CSV
3. **View dashboard** — stat cards update automatically, customer table is sortable/filterable
4. **Open a customer** — click any row to see the SHAP explanation and set contact status
5. **Chat** — ask the AI assistant anything about the session data

### Example chat questions
- "Who are my top 5 highest-value at-risk customers?"
- "Why is customer 7590-VHVEG at risk?"
- "How risky are my month-to-month contract customers?"
- "Suggest a next action for my riskiest customer"

---

## 4. Contact Status Workflow

Each customer has a status: **Not Contacted → Contacted → Converted / Lost**

Update inline from the table dropdown, or from the customer detail drawer.  
The AI assistant is also aware of current statuses.

---

## 5. Azure Deployment (Demo Mode)

When ready to demo, set up Azure Postgres:
```bash
az postgres flexible-server create \
  --resource-group churn-intelligence-rg \
  --name churn-db-<yourname> \
  --location eastus \
  --admin-user churnadmin \
  --admin-password <STRONG_PASSWORD> \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --version 16
```

Then update `DATABASE_URL` in `.env` to the Azure connection string.

**To stop billing after a demo:**
```bash
# Stop the Postgres server (stops compute billing)
az postgres flexible-server stop \
  --name churn-db-<yourname> \
  --resource-group churn-intelligence-rg

# Stop the web app (if using App Service)
az webapp stop --name churn-app-<yourname> --resource-group churn-intelligence-rg
```

---

## 6. API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/sessions/` | List all sessions |
| POST | `/sessions/` | Create new session |
| GET | `/sessions/{id}/stats` | Stat card data |
| GET | `/sessions/{id}/chat-history` | Full chat history |
| GET | `/customers/session/{id}` | Paginated customer list |
| GET | `/customers/{id}` | Customer detail + SHAP |
| PATCH | `/customers/{id}/status` | Update contact status |
| POST | `/upload/` | CSV upload + score |
| POST | `/chat/{session_id}` | Send chat message |
