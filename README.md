# SETU - AI-Powered Emergency Coordination Platform

SETU is an AI-powered emergency coordination platform designed for rapid response during disasters and critical situations, connecting victims, NGOs, volunteers, and first responders.

## Current Project Status

- **Task 1: Core Backend Foundation**: Minimal, runnable FastAPI backend with configuration management, CORS support, and health check monitoring.

---

## Getting Started

### Prerequisites

- **Python**: Version 3.10 or higher (Python 3.13 tested)
- **pip**: Package installer for Python

---

### Installation & Environment Setup

1. **Clone the repository and enter the project directory:**
   ```bash
   git clone <repository-url>
   cd setu
   ```

2. **Create and activate a virtual environment (recommended):**

   On Windows (PowerShell):
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```

   On Linux / macOS:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

---

### Environment Configuration

The backend uses environment variables with safe development defaults.

1. Create a local `.env` configuration file from the template:
   ```bash
   cp .env.example .env
   ```
   *(On Windows PowerShell: `Copy-Item .env.example .env`)*

2. Available environment variables:

   | Variable | Description | Default |
   | :--- | :--- | :--- |
   | `APP_NAME` | Title of the FastAPI service | `SETU API` |
   | `APP_VERSION` | Application version | `0.1.0` |
   | `ENVIRONMENT` | Runtime environment (`development`, `production`, etc.) | `development` |
   | `DEBUG` | Enable debug mode | `false` |
   | `ALLOWED_ORIGINS` | Comma-separated or JSON list of CORS origins | `http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173` |
   | `HOST` | Host address for local server binding | `127.0.0.1` |
   | `PORT` | Port number for local server binding | `8000` |

> **Note:** Missing optional environment variables will not prevent startup; defaults are automatically applied.

---

### Starting the Server

From the repository root, start the FastAPI development server with auto-reload:

```bash
uvicorn backend.main:app --reload
```

To specify custom host and port:
```bash
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

---

### Verifying the Service

Once the server is running, verify the endpoints:

1. **Health Check:**
   ```bash
   curl http://127.0.0.1:8000/health
   ```
   **Expected Response:**
   ```json
   {"status": "ok", "service": "setu"}
   ```

2. **Interactive API Documentation:**
   - Swagger UI: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
   - ReDoc: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

---

### Repository Structure

```text
setu/
├── backend/
│   ├── main.py          # FastAPI application factory, CORS, and route registration
│   ├── config.py        # Pydantic-based settings loaded from env/.env
│   ├── models.py        # Database and domain models (upcoming)
│   ├── routes/          # Domain API routers (upcoming)
│   │   ├── needs.py
│   │   ├── ngos.py
│   │   ├── volunteers.py
│   │   └── assignments.py
│   └── services/        # Business logic & AI services (upcoming)
├── database/
│   └── schema.sql       # SQL schemas (upcoming)
├── frontend/            # Web frontend application (upcoming)
├── mobile/              # Mobile application (upcoming)
├── .env.example         # Environment template
├── .gitignore           # Git ignore rules
├── requirements.txt     # Pinned Python dependencies
└── README.md            # Setup and onboarding documentation
```
