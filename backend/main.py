from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:
    from backend.config import Settings, get_settings
except ImportError:
    from config import Settings, get_settings



# Route Handlers

health_router = APIRouter(tags=["Health"])

@health_router.get(
    "/health",
    summary="Service Health Check",
    description="Check the operational health status of the SETU API service.",
)
async def health_check() -> dict:
    """Return the health status of the service."""
    return {"status": "ok", "service": "setu"}



# Application Setup & Registration

def configure_cors(app: FastAPI, settings: Settings) -> None:
    """Configure Cross-Origin Resource Sharing (CORS) based on environment settings."""
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


def register_routers(app: FastAPI) -> None:
    """Register active API routers with the FastAPI application.

    Note: Future domain routers (needs, ngos, volunteers, assignments)
    will be imported and registered here once implemented. Only implemented
    routers are mounted to avoid broken imports.
    """
    app.include_router(health_router)


def create_app(settings: Settings | None = None) -> FastAPI:
    """Application factory that initializes and configures the SETU FastAPI instance."""
    app_settings = settings or get_settings()

    app = FastAPI(
        title=app_settings.app_name,
        version=app_settings.app_version,
        debug=app_settings.debug,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    configure_cors(app, app_settings)
    register_routers(app)

    return app


# Expose default application instance for ASGI servers like uvicorn
app = create_app()
