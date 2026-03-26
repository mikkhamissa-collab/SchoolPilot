# chat_routes.py — Chat endpoints with SSE streaming.
import json
import logging
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.auth import get_current_user
from app.chat.engine import ChatEngine
from app.memory.store import MemoryStore

logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


class ChatRequest(BaseModel):
    conversation_id: Optional[str] = None
    message: str = Field(..., max_length=2000, min_length=1)
    personality: str = Field(default="coach", pattern=r"^(coach|friend|mentor|drill_sergeant)$")


class ConversationCreate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)


async def _safe_stream(generator: AsyncGenerator[str, None]) -> AsyncGenerator[str, None]:
    """Wrap an SSE generator with error handling so mid-stream failures send an error event."""
    try:
        async for chunk in generator:
            yield chunk
    except Exception:
        logger.exception("SSE stream interrupted")
        yield f'data: {json.dumps({"type": "error", "message": "Stream interrupted"})}\n\n'
        yield f'data: {json.dumps({"type": "done"})}\n\n'


@router.post("/send")
@limiter.limit("15/minute")
async def send_message(request: Request, body: ChatRequest, user_id: str = Depends(get_current_user)):
    """Send a message and stream the response via SSE."""
    memory = MemoryStore(user_id)
    engine = ChatEngine(user_id)

    # Create conversation if needed
    conversation_id = body.conversation_id
    if not conversation_id:
        conv = await memory.create_conversation()
        conversation_id = conv["id"]

    # Verify the conversation belongs to this user
    if body.conversation_id:
        from app.db import get_db
        db = get_db()
        check = db.table("conversations").select("id").eq("id", conversation_id).eq("user_id", user_id).execute()
        if not check.data:
            raise HTTPException(status_code=404, detail="Conversation not found")

    return StreamingResponse(
        _safe_stream(engine.stream_response(conversation_id, body.message, body.personality)),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Conversation-Id": conversation_id,
        },
    )


@router.get("/conversations")
async def list_conversations(user_id: str = Depends(get_current_user)):
    """List all conversations for the user."""
    memory = MemoryStore(user_id)
    return await memory.get_conversations()


@router.post("/conversations")
async def create_conversation(body: ConversationCreate, user_id: str = Depends(get_current_user)):
    """Create a new conversation."""
    memory = MemoryStore(user_id)
    return await memory.create_conversation(body.title)


@router.get("/conversations/{conversation_id}/messages")
async def get_messages(conversation_id: str, user_id: str = Depends(get_current_user)):
    """Get messages for a conversation."""
    # Verify ownership
    from app.db import get_db
    db = get_db()
    check = db.table("conversations").select("id").eq("id", conversation_id).eq("user_id", user_id).execute()
    if not check.data:
        raise HTTPException(status_code=404, detail="Conversation not found")

    memory = MemoryStore(user_id)
    return await memory.get_conversation_messages(conversation_id)


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, user_id: str = Depends(get_current_user)):
    """Delete a conversation and its messages."""
    from app.db import get_db
    db = get_db()
    result = db.table("conversations").delete().eq("id", conversation_id).eq("user_id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "deleted"}
