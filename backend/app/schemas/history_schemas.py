from pydantic import BaseModel
from typing import Any, List, Optional


class HistoryMessage(BaseModel):
    id: str
    kind: str
    role: str
    text: str
    created_at: Optional[str] = None
    cards: Optional[List[dict[str, Any]]] = None


class SessionHistoryResponse(BaseModel):
    session_id: str
    messages: List[HistoryMessage]