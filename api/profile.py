from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from .database import get_db
from .models import User
from .schemas import UserUpdate, UserResponse
from .auth import require_user

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.patch("", response_model=UserResponse)
async def update_profile(
    profile_data: UserUpdate,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the current user's profile (birthday, etc.)"""

    # Validate birthday day for the given month
    if profile_data.birthday_month is not None and profile_data.birthday_day is not None:
        days_in_month = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        max_days = days_in_month[profile_data.birthday_month - 1]
        if profile_data.birthday_day > max_days:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid day {profile_data.birthday_day} for month {profile_data.birthday_month}"
            )

    # Allow clearing birthday by setting both to None
    if profile_data.birthday_month is None or profile_data.birthday_day is None:
        user.birthday_month = None
        user.birthday_day = None
    else:
        user.birthday_month = profile_data.birthday_month
        user.birthday_day = profile_data.birthday_day

    await db.commit()
    await db.refresh(user)
    return user
