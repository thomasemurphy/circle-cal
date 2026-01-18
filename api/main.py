from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from starlette.middleware.sessions import SessionMiddleware
from contextlib import asynccontextmanager
import os

from .config import get_settings
from .database import init_db
from .auth import router as auth_router
from .events import router as events_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="Circle Calendar API",
    description="API for the circular year calendar",
    version="1.0.0",
    lifespan=lifespan,
)

# Session middleware for OAuth
# Use https_only=True in production for secure cookies
is_production = settings.frontend_url.startswith("https")
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.jwt_secret,
    https_only=is_production,
    same_site="lax",
)


# Redirect HTTP to HTTPS in production and add security headers
@app.middleware("http")
async def https_redirect_and_security(request: Request, call_next):
    if is_production:
        # Heroku sets x-forwarded-proto header
        forwarded_proto = request.headers.get("x-forwarded-proto", "https")
        if forwarded_proto == "http":
            url = request.url.replace(scheme="https")
            return RedirectResponse(url=str(url), status_code=301)

    response = await call_next(request)

    # Add HSTS header to tell browsers to always use HTTPS
    if is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    return response

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:8000", "http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth_router)
app.include_router(events_router)


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


# Serve static files in development
static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "")


@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(static_dir, "index.html"))


@app.get("/{filename:path}")
async def serve_static(filename: str):
    file_path = os.path.join(static_dir, filename)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    # Fallback to index.html for SPA routing
    return FileResponse(os.path.join(static_dir, "index.html"))
