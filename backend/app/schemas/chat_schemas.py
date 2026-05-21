from pydantic import BaseModel
from typing import List, Optional

class ChatRequest(BaseModel):
    session_id: str
    message: str
    user_id: Optional[str] = None
    metadata: Optional[dict] = None

class ClarifyingQuestion(BaseModel):
    question: str
    options: Optional[List[str]] = None
    type: str # 'options' or 'open-ended'

class ChatResponse(BaseModel):
    intent_resolved: bool
    message: Optional[str] = None
    clarifying_questions: Optional[List[ClarifyingQuestion]] = None
    recommended_providers: Optional[List[dict]] = None
    booking_confirmation: Optional[dict] = None
    fallback_used: bool = False
    session_id: Optional[str] = None
