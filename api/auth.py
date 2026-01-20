from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from authlib.integrations.starlette_client import OAuth
from jose import jwt, JWTError
from datetime import datetime, timedelta

from .database import get_db
from .models import User, PendingInvitation, Friendship
from .schemas import UserResponse
from .config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

oauth = OAuth()
if settings.google_client_id and settings.google_client_secret:
    oauth.register(
        name="google",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )

JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 30


def create_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(days=JWT_EXPIRATION_DAYS)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM)


def verify_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[JWT_ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


async def get_current_user(
    request: Request, db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    token = request.cookies.get("auth_token")
    if not token:
        return None

    user_id = verify_token(token)
    if not user_id:
        return None

    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def require_user(
    request: Request, db: AsyncSession = Depends(get_db)
) -> User:
    user = await get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


@router.get("/google")
async def google_login(request: Request):
    if not settings.google_client_id:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")
    redirect_uri = f"{settings.frontend_url}/auth/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/callback")
async def google_callback(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"OAuth error: {str(e)}")

    user_info = token.get("userinfo")
    if not user_info:
        raise HTTPException(status_code=400, detail="Failed to get user info")

    google_id = user_info["sub"]
    email = user_info["email"]
    name = user_info.get("name")
    picture = user_info.get("picture")

    # Find or create user
    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            google_id=google_id,
            email=email,
            name=name,
            picture_url=picture,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        # Convert any pending invitations to friend requests
        pending_result = await db.execute(
            select(PendingInvitation).where(PendingInvitation.invited_email == email.lower())
        )
        pending_invitations = pending_result.scalars().all()

        for invitation in pending_invitations:
            # Create a friendship request from the inviter to the new user
            friendship = Friendship(
                requester_id=invitation.inviter_id,
                addressee_id=user.id,
                status="pending"
            )
            db.add(friendship)
            await db.delete(invitation)

        if pending_invitations:
            await db.commit()
    else:
        # Update user info
        user.email = email
        user.name = name
        user.picture_url = picture
        await db.commit()

    # Create JWT and set cookie
    auth_token = create_token(str(user.id))
    response = RedirectResponse(url=settings.frontend_url)
    response.set_cookie(
        key="auth_token",
        value=auth_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=JWT_EXPIRATION_DAYS * 24 * 60 * 60,
    )
    return response


@router.get("/me", response_model=Optional[UserResponse])
async def get_me(user: Optional[User] = Depends(get_current_user)):
    return user


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("auth_token")
    return {"message": "Logged out"}
