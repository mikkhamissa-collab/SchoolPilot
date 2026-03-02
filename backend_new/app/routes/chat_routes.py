# chat_routes.py — Chat endpoints with SSE streaming.
import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from app.auth import get_current_user
from app.chat.engine import ChatEngine
from app.memory.store import MemoryStore

logger = logging.getLogger(__name__)
router = APIRouter()


class ChatRequest(BaseModel):
    conversation_id: Optional[str] = None
    message: str
    personality: str = "coach"


class ConversationCreate(BaseModel):
    title: Optional[str] = None


@router.post("/send")
async def send_message(body: ChatRequest, user_id: str = Depends(get_current_user)):
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
        engine.stream_response(conversation_id, body.message, body.personality),
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
    db.table("conversations").delete().eq("id", conversation_id).eq("user_id", user_id).execute()
    return {"status": "deleted"}
