from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from .database import get_db
from .models import User, Event
from .schemas import EventCreate, EventUpdate, EventResponse
from .auth import require_user

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("", response_model=list[EventResponse])
async def get_events(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Event).where(Event.user_id == user.id).order_by(Event.month, Event.day)
    )
    return result.scalars().all()


@router.post("", response_model=EventResponse, status_code=201)
async def create_event(
    event_data: EventCreate,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    event = Event(
        user_id=user.id,
        month=event_data.month,
        day=event_data.day,
        title=event_data.title,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


@router.put("/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: UUID,
    event_data: EventUpdate,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Event).where(Event.id == event_id, Event.user_id == user.id)
    )
    event = result.scalar_one_or_none()

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    if event_data.month is not None:
        event.month = event_data.month
    if event_data.day is not None:
        event.day = event_data.day
    if event_data.title is not None:
        event.title = event_data.title

    await db.commit()
    await db.refresh(event)
    return event


@router.delete("/{event_id}", status_code=204)
async def delete_event(
    event_id: UUID,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Event).where(Event.id == event_id, Event.user_id == user.id)
    )
    event = result.scalar_one_or_none()

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    await db.delete(event)
    await db.commit()
