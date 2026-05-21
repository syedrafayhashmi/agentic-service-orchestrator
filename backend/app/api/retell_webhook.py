import json
import hashlib
import hmac
import logging
import re
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from app.core.config import RETELL_API_KEY
from app.core.supabase_store import save_retell_call_event

router = APIRouter()
logger = logging.getLogger(__name__)


def _manual_verify_signature(raw_body: str, api_key: str, signature: str) -> bool:
    """
    Retell signature format: v={timestamp},d={hex_digest}
    digest = HMAC-SHA256(raw_body + timestamp, api_key)
    """
    match = re.search(r"v=(\d+),d=(.*)", signature)
    if not match:
        return False

    timestamp = int(match.group(1))
    digest = match.group(2)
    now = int(time.time() * 1000)

    # Reject stale signatures (>5 minutes) to limit replay attacks.
    if abs(now - timestamp) > 5 * 60 * 1000:
        return False

    computed = hmac.new(
        api_key.encode("utf-8"),
        f"{raw_body}{timestamp}".encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(computed, digest)


def _verify_signature(raw_body: str, signature: str | None) -> bool:
    if not RETELL_API_KEY or not signature:
        return False

    # SDK compatibility:
    # 1) Older docs show Retell.verify(...)
    # 2) Newer Python SDKs expose retell.lib.webhook_auth.verify(...)
    # 3) Fall back to manual HMAC verification per Retell docs.
    try:
        from retell import Retell  # type: ignore

        verify_attr = getattr(Retell, "verify", None)
        if callable(verify_attr):
            return bool(verify_attr(raw_body, api_key=RETELL_API_KEY, signature=signature))
    except Exception:
        pass

    try:
        from retell.lib.webhook_auth import verify as retell_verify  # type: ignore

        return bool(retell_verify(raw_body, RETELL_API_KEY, signature))
    except Exception:
        return _manual_verify_signature(raw_body, RETELL_API_KEY, signature)


def _event_summary(event_type: str, call: dict[str, Any]) -> str:
    call_id = call.get("call_id", "unknown call")
    if event_type == "call_started":
        return f"Retell call started for {call_id}."
    if event_type == "call_ended":
        reason = call.get("disconnection_reason", "ended")
        return f"Retell call ended for {call_id} ({reason})."
    if event_type == "call_analyzed":
        analysis = call.get("call_analysis", {}) or {}
        summary = analysis.get("call_summary") or "Call analysis completed."
        return f"Retell analysis for {call_id}: {summary}"
    if event_type == "transcript_updated":
        return f"Retell transcript updated for {call_id}."
    if event_type.startswith("transfer_"):
        return f"Retell transfer event {event_type} for {call_id}."
    return f"Retell event {event_type} received for {call_id}."


# Support both webhook URL variants to avoid dashboard/config drift.
@router.post("/retell")
@router.post("/retell/webhook")
async def handle_retell_webhook(request: Request):
    raw_body = (await request.body()).decode("utf-8")
    signature = request.headers.get("x-retell-signature")

    if not _verify_signature(raw_body, signature):
        raise HTTPException(status_code=401, detail="Invalid Retell webhook signature.")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        # Signature passed but body is not valid JSON.
        raise HTTPException(status_code=400, detail="Invalid webhook payload.")

    event_type = payload.get("event", "unknown")
    call = payload.get("call", {}) or {}
    metadata = call.get("metadata", {}) or {}
    session_id = metadata.get("session_id")
    call_id = call.get("call_id")

    try:
        save_retell_call_event(
            session_id=session_id,
            call_id=call_id,
            event_type=event_type,
            event_summary=_event_summary(event_type, call),
            payload=payload,
        )
    except Exception:
        logger.exception(
            "Retell webhook persistence failed: event=%s call_id=%s session_id=%s",
            event_type,
            call_id,
            session_id,
        )

    return Response(status_code=204)
