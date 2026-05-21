import json
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from app.schemas.history_schemas import HistoryMessage, SessionHistoryResponse
from app.core.config import SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL
from app.core.auth import get_user_id_from_auth_header
import requests

router = APIRouter()


def _headers() -> dict[str, str]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return {}
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    }


def _as_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        return text or None
    if isinstance(value, (int, float, bool)):
        return str(value)
    return None


def _normalize_status(value: Any) -> str | None:
    text = _as_text(value)
    if not text:
        return None
    candidate = text.upper()
    if candidate in {"CONFIRMED", "NEEDS_FOLLOW_UP", "REJECTED"}:
        return candidate
    return None


def _coerce_raw_response(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return {}
    return {}


def _build_chat_cards_from_raw_response(raw_response: dict[str, Any]) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []

    providers = raw_response.get("recommended_providers")
    if isinstance(providers, list):
        for provider in providers:
            if isinstance(provider, dict):
                cards.append({"type": "provider", "data": provider})

    booking_confirmation = raw_response.get("booking_confirmation")
    if isinstance(booking_confirmation, dict):
        cards.append(
            {
                "type": "booking",
                "data": {
                    "label": str(booking_confirmation.get("label") or "Booking update"),
                    "time": str(booking_confirmation.get("time") or raw_response.get("message") or "Confirmed"),
                },
            }
        )

    clarifying_questions = raw_response.get("clarifying_questions")
    if isinstance(clarifying_questions, list):
        questions: list[str] = []
        for question in clarifying_questions:
            if isinstance(question, dict):
                text = _as_text(question.get("question"))
                if text:
                    questions.append(text)
            else:
                text = _as_text(question)
                if text:
                    questions.append(text)
        if questions:
            cards.append({"type": "clarifying", "data": {"questions": questions}})

    return cards


def _extract_booking_status_card(row: dict[str, Any]) -> dict[str, Any] | None:
    payload = row.get("payload")
    if not isinstance(payload, dict):
        return None

    call = payload.get("call")
    if not isinstance(call, dict):
        return None

    call_analysis = call.get("call_analysis")
    if not isinstance(call_analysis, dict):
        call_analysis = {}

    custom_analysis = call_analysis.get("custom_analysis_data")
    if not isinstance(custom_analysis, dict):
        custom_analysis = {}

    status = _normalize_status(custom_analysis.get("status"))
    if not status:
        call_successful = call_analysis.get("call_successful")
        if isinstance(call_successful, bool):
            status = "CONFIRMED" if call_successful else "NEEDS_FOLLOW_UP"

    confirmed_date = _as_text(custom_analysis.get("confirmed_date"))
    confirmed_time = _as_text(custom_analysis.get("confirmed_time"))
    provider_notes = _as_text(custom_analysis.get("provider_notes"))
    short_call_summary = _as_text(custom_analysis.get("short_call_summary")) or _as_text(
        call_analysis.get("call_summary")
    )
    detected_language = _as_text(custom_analysis.get("detected_language"))

    if not any([status, confirmed_date, confirmed_time, provider_notes, short_call_summary, detected_language]):
        return None

    return {
        "type": "booking_status",
        "data": {
            "status": status,
            "confirmed_date": confirmed_date,
            "confirmed_time": confirmed_time,
            "provider_notes": provider_notes,
            "short_call_summary": short_call_summary,
            "detected_language": detected_language,
        },
    }


@router.get("/history")
def list_sessions(request: Request):
    """
    Returns a list of chat sessions with title (first user message)
    and preview (latest assistant message) for the sidebar.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=400, detail="Supabase is not configured.")

    user_id = get_user_id_from_auth_header(request.headers.get("Authorization"))
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing or invalid auth token.")

    base_url = SUPABASE_URL.rstrip('/')

    # Fetch all messages ordered ascending so first row per session = first user message
    resp = requests.get(
        f"{base_url}/rest/v1/chat_messages"
        f"?select=session_id,user_message,assistant_message,created_at"
        f"&user_id=eq.{user_id}"
        f"&order=created_at.asc",
        headers={**_headers(), "Accept": "application/json"},
        timeout=10,
    )
    resp.raise_for_status()
    rows = resp.json()

    # Group by session_id: keep first user_message as title, latest assistant_message as preview
    session_map: dict[str, dict] = {}
    for row in rows:
        sid = row.get("session_id")
        if not sid:
            continue
        if sid not in session_map:
            session_map[sid] = {
                "session_id": sid,
                "user_message": row.get("user_message", ""),
                "assistant_message": row.get("assistant_message", ""),
                "created_at": row.get("created_at", ""),
            }
        else:
            # Overwrite with latest assistant message & timestamp
            if row.get("assistant_message"):
                session_map[sid]["assistant_message"] = row["assistant_message"]
            if row.get("created_at", "") > session_map[sid]["created_at"]:
                session_map[sid]["created_at"] = row["created_at"]

    # Sort most-recent first
    sessions = sorted(session_map.values(), key=lambda s: s["created_at"], reverse=True)
    return sessions[:30]


@router.get("/history/{session_id}", response_model=SessionHistoryResponse)
def get_session_history(session_id: str, request: Request):
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=400, detail="Supabase is not configured.")

    user_id = get_user_id_from_auth_header(request.headers.get("Authorization"))
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing or invalid auth token.")

    base_url = SUPABASE_URL.rstrip('/')

    session_response = requests.get(
        f"{base_url}/rest/v1/chat_sessions?id=eq.{session_id}&select=id,user_id",
        headers={**_headers(), "Content-Type": "application/json", "Accept": "application/json"},
        timeout=10,
    )
    session_response.raise_for_status()
    session_rows = session_response.json()
    if not session_rows or session_rows[0].get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Session not found.")

    messages_response = requests.get(
        f"{base_url}/rest/v1/chat_messages?session_id=eq.{session_id}&user_id=eq.{user_id}&order=created_at.asc",
        headers={**_headers(), "Content-Type": "application/json", "Accept": "application/json"},
        timeout=10,
    )
    messages_response.raise_for_status()

    events_response = requests.get(
        f"{base_url}/rest/v1/retell_call_events?session_id=eq.{session_id}&order=created_at.asc",
        headers={**_headers(), "Content-Type": "application/json", "Accept": "application/json"},
        timeout=10,
    )
    events_response.raise_for_status()

    combined: list[HistoryMessage] = []

    for row in messages_response.json():
        raw_response = _coerce_raw_response(row.get("raw_response"))
        chat_cards = _build_chat_cards_from_raw_response(raw_response)
        combined.append(
            HistoryMessage(
                id=f"msg-{row['id']}",
                kind="chat",
                role="user",
                text=row.get("user_message", ""),
                created_at=row.get("created_at"),
            )
        )
        if row.get("assistant_message"):
            combined.append(
                HistoryMessage(
                    id=f"msg-assistant-{row['id']}",
                    kind="chat",
                    role="assistant",
                    text=row.get("assistant_message", ""),
                    created_at=row.get("created_at"),
                    cards=chat_cards or None,
                )
            )

    for row in events_response.json():
        cards = [
            {
                "type": "retell_event",
                "data": {
                    "event_type": row.get("event_type"),
                    "call_id": row.get("call_id"),
                },
            }
        ]
        booking_status_card = _extract_booking_status_card(row)
        if booking_status_card:
            cards.append(booking_status_card)

        combined.append(
            HistoryMessage(
                id=f"event-{row['id']}",
                kind="retell-event",
                role="system",
                text=row.get("event_summary", "Retell event"),
                created_at=row.get("created_at"),
                cards=cards,
            )
        )

    combined.sort(key=lambda item: item.created_at or "")
    return SessionHistoryResponse(session_id=session_id, messages=combined)
