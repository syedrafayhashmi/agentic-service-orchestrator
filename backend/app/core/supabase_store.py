import json
from datetime import datetime
from typing import Any, Optional

import requests

from app.core.config import SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL


def _headers() -> dict[str, str]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return {}
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


def supabase_enabled() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)


def insert_row(table: str, payload: dict[str, Any]) -> None:
    if not supabase_enabled():
        return

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}"
    response = requests.post(url, headers=_headers(), data=json.dumps(payload), timeout=10)
    response.raise_for_status()


def upsert_session(*, session_id: str, user_id: Optional[str], metadata: Optional[dict[str, Any]] = None) -> None:
    if not supabase_enabled():
        return

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/chat_sessions?on_conflict=id"
    payload = {
        "id": session_id,
        "metadata": metadata or {},
    }
    # Never overwrite an existing session owner with null user_id.
    if user_id is not None:
        payload["user_id"] = user_id

    response = requests.post(
        url,
        headers={**_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"},
        data=json.dumps(payload),
        timeout=10,
    )
    response.raise_for_status()


def fetch_session_messages(*, session_id: str, user_id: Optional[str], limit: int = 120) -> list[dict[str, Any]]:
    if not supabase_enabled() or not user_id:
        return []

    base_url = SUPABASE_URL.rstrip('/')
    response = requests.get(
        f"{base_url}/rest/v1/chat_messages"
        f"?session_id=eq.{session_id}"
        f"&user_id=eq.{user_id}"
        f"&order=created_at.asc"
        f"&limit={limit}",
        headers={**_headers(), "Accept": "application/json"},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()


def fetch_latest_chat_turn(*, session_id: str) -> dict[str, Any]:
    if not supabase_enabled():
        return {}

    base_url = SUPABASE_URL.rstrip('/')
    response = requests.get(
        f"{base_url}/rest/v1/chat_messages"
        f"?session_id=eq.{session_id}"
        f"&select=id,raw_response,request_metadata,created_at"
        f"&order=created_at.desc"
        f"&limit=1",
        headers={**_headers(), "Accept": "application/json"},
        timeout=10,
    )
    response.raise_for_status()
    rows = response.json()
    if not isinstance(rows, list) or not rows:
        return {}
    first = rows[0]
    return first if isinstance(first, dict) else {}


def save_chat_turn(
    *,
    session_id: str,
    user_id: Optional[str],
    user_message: str,
    assistant_message: str,
    raw_response: dict[str, Any],
    request_metadata: Optional[dict[str, Any]] = None,
) -> None:
    upsert_session(session_id=session_id, user_id=user_id, metadata=request_metadata)
    insert_row(
        "chat_messages",
        {
            "session_id": session_id,
            "user_id": user_id,
            "user_message": user_message,
            "assistant_message": assistant_message,
            "raw_response": raw_response,
            "request_metadata": request_metadata or {},
        },
    )


def save_retell_call_event(
    *,
    session_id: Optional[str],
    call_id: Optional[str],
    event_type: str,
    event_summary: str,
    payload: dict[str, Any],
) -> None:
    if not session_id:
        return

    upsert_session(session_id=session_id, user_id=None, metadata={"retell_call_id": call_id} if call_id else {})
    insert_row(
        "retell_call_events",
        {
            "session_id": session_id,
            "call_id": call_id,
            "event_type": event_type,
            "event_summary": event_summary,
            "payload": payload,
        },
    )


def fetch_google_tokens(*, user_id: str) -> Optional[dict[str, Any]]:
    if not supabase_enabled():
        return None

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/user_google_tokens?user_id=eq.{user_id}&limit=1"
    response = requests.get(url, headers={**_headers(), "Accept": "application/json"}, timeout=10)
    response.raise_for_status()
    rows = response.json()
    return rows[0] if rows else None


def update_google_access_token(*, user_id: str, access_token: str) -> None:
    if not supabase_enabled():
        return

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/user_google_tokens?user_id=eq.{user_id}"
    response = requests.patch(
        url,
        headers={**_headers(), "Prefer": "return=minimal"},
        data=json.dumps({"access_token": access_token, "updated_at": datetime.utcnow().isoformat() + "Z"}),
        timeout=10,
    )
    response.raise_for_status()


def save_execution_event(
    *,
    session_id: str,
    user_id: Optional[str],
    request_message: str,
    event_type: str,
    payload: dict[str, Any],
) -> None:
    upsert_session(session_id=session_id, user_id=user_id, metadata={})
    try:
        insert_row(
            "execution_events",
            {
                "session_id": session_id,
                "user_id": user_id,
                "request_message": request_message,
                "event_type": event_type,
                "payload": payload,
            },
        )
    except requests.HTTPError as exc:
        status_code = getattr(exc.response, "status_code", None)
        # Some environments don't have the optional execution_events table yet.
        # Avoid spamming logs for every streamed event in that case.
        if status_code == 404:
            return
        raise
