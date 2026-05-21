from pydantic import BaseModel
from typing import Any, Optional


class RetellCallRequest(BaseModel):
    session_id: str
    to_number: str
    user_id: Optional[str] = None
    provider_name: Optional[str] = None
    booking_message: Optional[str] = None
    customer_name: Optional[str] = None
    service_type: Optional[str] = None
    location: Optional[str] = None
    preferred_date: Optional[str] = None
    preferred_time: Optional[str] = None
    alternative_times: Optional[str] = None
    booking_id: Optional[str] = None
    dynamic_variables: Optional[dict[str, Any]] = None


class RetellCallResponse(BaseModel):
    success: bool
    message: str
    call_id: Optional[str] = None
    call_status: Optional[str] = None
    agent_id: Optional[str] = None
    dynamic_variables_preview: Optional[dict[str, str]] = None
