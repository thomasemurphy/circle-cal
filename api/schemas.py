from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class UserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str]
    picture_url: Optional[str]

    class Config:
        from_attributes = True


class EventCreate(BaseModel):
    month: int = Field(ge=1, le=12)
    day: int = Field(ge=1, le=31)
    end_month: Optional[int] = Field(None, ge=1, le=12)
    end_day: Optional[int] = Field(None, ge=1, le=31)
    title: str = Field(min_length=1, max_length=500)
    color: Optional[str] = Field(None, max_length=7)


class EventUpdate(BaseModel):
    month: Optional[int] = Field(None, ge=1, le=12)
    day: Optional[int] = Field(None, ge=1, le=31)
    end_month: Optional[int] = Field(None, ge=1, le=12)
    end_day: Optional[int] = Field(None, ge=1, le=31)
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    color: Optional[str] = Field(None, max_length=7)


class EventResponse(BaseModel):
    id: str
    month: int
    day: int
    end_month: Optional[int]
    end_day: Optional[int]
    title: str
    color: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
