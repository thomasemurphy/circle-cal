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
from .profile import router as profile_router
from .friends import router as friends_router

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


# Redirect HTTP to HTTPS and www to non-www in production
@app.middleware("http")
async def https_and_www_redirect(request: Request, call_next):
    if is_production:
        host = request.headers.get("host", "")
        forwarded_proto = request.headers.get("x-forwarded-proto", "https")

        # Redirect www to non-www
        if host.startswith("www."):
            new_host = host[4:]  # Remove "www."
            url = request.url.replace(scheme="https", netloc=new_host)
            return RedirectResponse(url=str(url), status_code=301)

        # Redirect HTTP to HTTPS
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
app.include_router(profile_router)
app.include_router(friends_router)


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


# Serve static files from dist/ directory (built by Vite)
# Falls back to src/ for development if dist/ doesn't exist
project_root = os.path.dirname(os.path.dirname(__file__))
dist_dir = os.path.join(project_root, "dist")
src_dir = os.path.join(project_root, "src")

# Use dist/ if it exists (production), otherwise fall back to src/ (development)
if os.path.isdir(dist_dir) and os.path.isfile(os.path.join(dist_dir, "index.html")):
    static_dir = dist_dir
else:
    static_dir = src_dir


@app.get("/")
async def serve_index():
    index_path = os.path.join(static_dir, "index.html")
    if not os.path.isfile(index_path):
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=500,
            content={"error": "Frontend not built. Run 'npm run build' first, or use 'npm run dev' for development."}
        )
    return FileResponse(index_path)


@app.get("/{filename:path}")
async def serve_static(filename: str):
    file_path = os.path.join(static_dir, filename)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    # Fallback to index.html for SPA routing
    index_path = os.path.join(static_dir, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=500,
        content={"error": "Frontend not built. Run 'npm run build' first, or use 'npm run dev' for development."}
    )
