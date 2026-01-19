from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from sqlalchemy.orm import selectinload
from typing import List

from .database import get_db
from .models import User, Friendship
from .schemas import (
    FriendRequestCreate,
    FriendRequestResponse,
    FriendshipResponse,
    FriendUserResponse,
    FriendRequestAction,
    FriendRequestSentResponse,
)
from .auth import require_user
from .email import send_friend_invitation

router = APIRouter(prefix="/api/friends", tags=["friends"])


@router.get("", response_model=List[FriendshipResponse])
async def get_friends(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all accepted friends for the current user."""
    result = await db.execute(
        select(Friendship)
        .options(selectinload(Friendship.requester), selectinload(Friendship.addressee))
        .where(
            and_(
                or_(
                    Friendship.requester_id == user.id,
                    Friendship.addressee_id == user.id
                ),
                Friendship.status == "accepted"
            )
        )
    )
    friendships = result.scalars().all()

    # Transform to include the "other" user as friend
    response = []
    for f in friendships:
        friend = f.addressee if f.requester_id == user.id else f.requester
        response.append(FriendshipResponse(
            id=f.id,
            friend=FriendUserResponse.model_validate(friend),
            created_at=f.created_at
        ))

    return response


@router.get("/requests/pending", response_model=List[FriendRequestResponse])
async def get_pending_requests(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Get pending friend requests received by the current user."""
    result = await db.execute(
        select(Friendship)
        .options(selectinload(Friendship.requester))
        .where(
            Friendship.addressee_id == user.id,
            Friendship.status == "pending"
        )
        .order_by(Friendship.created_at.desc())
    )
    friendships = result.scalars().all()

    return [
        FriendRequestResponse(
            id=f.id,
            requester=FriendUserResponse.model_validate(f.requester),
            status=f.status,
            created_at=f.created_at
        )
        for f in friendships
    ]


@router.post("/request", response_model=FriendRequestSentResponse, status_code=201)
async def send_friend_request(
    request_data: FriendRequestCreate,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a friend request to another user by email."""
    email = request_data.email.lower().strip()

    # Find addressee by email
    result = await db.execute(
        select(User).where(User.email == email)
    )
    addressee = result.scalar_one_or_none()

    # If user not found, send email invitation
    if not addressee:
        from_name = user.name or user.email.split("@")[0]
        await send_friend_invitation(email, from_name)
        return FriendRequestSentResponse(
            message="Invitation sent! They'll see your request when they join.",
            invited=True
        )

    if addressee.id == user.id:
        raise HTTPException(status_code=400, detail="Cannot add yourself as a friend")

    # Check if friendship already exists (in either direction)
    result = await db.execute(
        select(Friendship).where(
            or_(
                and_(
                    Friendship.requester_id == user.id,
                    Friendship.addressee_id == addressee.id
                ),
                and_(
                    Friendship.requester_id == addressee.id,
                    Friendship.addressee_id == user.id
                )
            )
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        if existing.status == "accepted":
            raise HTTPException(status_code=400, detail="Already friends")
        elif existing.status == "pending":
            # If the other person already sent us a request, auto-accept
            if existing.requester_id == addressee.id:
                existing.status = "accepted"
                await db.commit()
                return FriendRequestSentResponse(
                    message="Friend request accepted! They had already sent you a request."
                )
            raise HTTPException(status_code=400, detail="Friend request already pending")
        elif existing.status == "declined":
            # Allow re-requesting after decline
            existing.status = "pending"
            existing.requester_id = user.id
            existing.addressee_id = addressee.id
            await db.commit()
            return FriendRequestSentResponse(message="Friend request sent!")

    # Create new friendship request
    friendship = Friendship(
        requester_id=user.id,
        addressee_id=addressee.id,
        status="pending"
    )
    db.add(friendship)
    await db.commit()

    return FriendRequestSentResponse(message="Friend request sent!")


@router.patch("/request/{friendship_id}", response_model=FriendRequestResponse)
async def respond_to_friend_request(
    friendship_id: str,
    action: FriendRequestAction,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Accept or decline a friend request."""
    result = await db.execute(
        select(Friendship)
        .options(selectinload(Friendship.requester))
        .where(
            Friendship.id == friendship_id,
            Friendship.addressee_id == user.id,
            Friendship.status == "pending"
        )
    )
    friendship = result.scalar_one_or_none()

    if not friendship:
        raise HTTPException(status_code=404, detail="Friend request not found")

    friendship.status = "accepted" if action.accept else "declined"
    await db.commit()
    await db.refresh(friendship)

    return FriendRequestResponse(
        id=friendship.id,
        requester=FriendUserResponse.model_validate(friendship.requester),
        status=friendship.status,
        created_at=friendship.created_at
    )


@router.delete("/{friendship_id}", status_code=204)
async def remove_friend(
    friendship_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a friend (delete the friendship)."""
    result = await db.execute(
        select(Friendship).where(
            Friendship.id == friendship_id,
            or_(
                Friendship.requester_id == user.id,
                Friendship.addressee_id == user.id
            )
        )
    )
    friendship = result.scalar_one_or_none()

    if not friendship:
        raise HTTPException(status_code=404, detail="Friendship not found")

    await db.delete(friendship)
    await db.commit()
