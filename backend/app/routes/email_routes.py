"""Email briefing endpoints."""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from typing import Optional
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.auth import get_current_user
from app.memory.store import MemoryStore

logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


class EmailPreferences(BaseModel):
    daily_briefing_enabled: Optional[bool] = None
    email_briefings: Optional[bool] = None
    briefing_time: Optional[str] = Field(default=None, pattern=r"^\d{2}:\d{2}$")


@router.post("/briefing")
@limiter.limit("3/hour")
async def send_briefing_now(request: Request, user_id: str = Depends(get_current_user)):
    from app.routes.plan_routes import send_plan_email
    return await send_plan_email(user_id=user_id)


@router.put("/preferences")
@limiter.limit("30/minute")
async def update_email_preferences(request: Request, body: EmailPreferences, user_id: str = Depends(get_current_user)):
    memory = MemoryStore(user_id)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"status": "no changes"}
    await memory.update_profile(updates)
    return {"status": "updated"}
