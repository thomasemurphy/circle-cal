from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime
from typing import Optional


class UserResponse(BaseModel):
    id: UUID
    email: str
    name: Optional[str]
    picture_url: Optional[str]

    class Config:
        from_attributes = True


class EventCreate(BaseModel):
    month: int = Field(ge=1, le=12)
    day: int = Field(ge=1, le=31)
    title: str = Field(min_length=1, max_length=500)


class EventUpdate(BaseModel):
    month: Optional[int] = Field(None, ge=1, le=12)
    day: Optional[int] = Field(None, ge=1, le=31)
    title: Optional[str] = Field(None, min_length=1, max_length=500)


class EventResponse(BaseModel):
    id: UUID
    month: int
    day: int
    title: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
