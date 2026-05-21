import json
import logging
from typing import Any

from fastapi import APIRouter, HTTPException

from app.core.retell import RetellAPIError, create_outbound_call, retell_enabled
from app.core.config import sessions
from app.core.supabase_store import fetch_latest_chat_turn, supabase_enabled
from app.core.supabase_store import upsert_session
from app.schemas.call_schemas import RetellCallRequest, RetellCallResponse

router = APIRouter()
logger = logging.getLogger(__name__)

PLACEHOLDER_VALUES = {
    "requested service",
    "the requested location",
    "the requested date",
    "the requested time",
    "any nearby available slot",
    "customer",
    "the provider",
    "unknown",
    "n/a",
    "na",
}


def _clean_json_text(text: str) -> str:
    clean = text.strip()
    if clean.startswith("```json"):
        clean = clean[len("```json"):].strip()
        if clean.endswith("```"):
            clean = clean[:-3].strip()
    elif clean.startswith("```"):
        clean = clean[len("```"):].strip()
        if clean.endswith("```"):
            clean = clean[:-3].strip()
    return clean


def _extract_first_json_object(text: str) -> str:
    start = text.find("{")
    if start == -1:
        return text

    depth = 0
    in_string = False
    escape = False

    for i in range(start, len(text)):
        ch = text[i]

        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]

    return text


def _latest_agent_output(session_id: str) -> dict[str, Any]:
    history = sessions.get(session_id, [])
    for msg in reversed(history):
        if msg.get("role") != "model":
            continue
        parts = msg.get("parts", [])
        if not isinstance(parts, list) or not parts:
            continue
        part0 = parts[0] if isinstance(parts[0], dict) else {}
        text = part0.get("text", "")
        if not isinstance(text, str) or not text.strip():
            continue

        clean = _clean_json_text(text)
        for candidate in (clean, _extract_first_json_object(clean)):
            try:
                parsed = json.loads(candidate)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                return parsed
    if supabase_enabled():
        try:
            latest_row = fetch_latest_chat_turn(session_id=session_id)
            raw_response = latest_row.get("raw_response")
            if isinstance(raw_response, dict):
                return raw_response
        except Exception:
            pass
    return {}


def _latest_request_metadata(session_id: str) -> dict[str, Any]:
    if not supabase_enabled():
        return {}
    try:
        latest_row = fetch_latest_chat_turn(session_id=session_id)
    except Exception:
        return {}
    metadata = latest_row.get("request_metadata")
    return metadata if isinstance(metadata, dict) else {}


def _as_string(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        items = [_as_string(item) for item in value]
        return ", ".join(item for item in items if item)
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=True)
    return str(value)


def _pick_first_non_empty(*values: Any) -> str:
    for value in values:
        string_value = _as_string(value)
        if string_value:
            return string_value
    return ""


def _is_placeholder_value(value: Any) -> bool:
    text = _as_string(value).strip().lower()
    return bool(text and text in PLACEHOLDER_VALUES)


def _pick_first_meaningful(*values: Any) -> str:
    for value in values:
        if _is_placeholder_value(value):
            continue
        string_value = _as_string(value)
        if string_value:
            return string_value
    return ""


def _build_dynamic_variables(req: RetellCallRequest) -> dict[str, str]:
    agent_output = _latest_agent_output(req.session_id)
    latest_request_metadata = _latest_request_metadata(req.session_id)
    parameters = agent_output.get("parameters", {})
    extracted = parameters.get("extracted_details", {}) if isinstance(parameters, dict) else {}
    booking_confirmation = agent_output.get("booking_confirmation", {})

    if not isinstance(extracted, dict):
        extracted = {}
    if not isinstance(booking_confirmation, dict):
        booking_confirmation = {}

    dynamic_variables = {
        "customer_name": _pick_first_meaningful(req.customer_name, extracted.get("customer_name")),
        "service_type": _pick_first_meaningful(
            req.service_type,
            extracted.get("service_type"),
            extracted.get("service"),
            parameters.get("intent_type") if isinstance(parameters, dict) else None,
        ),
        "location": _pick_first_meaningful(
            req.location,
            extracted.get("location"),
            extracted.get("area"),
            extracted.get("destination"),
            latest_request_metadata.get("location"),
        ),
        "preferred_date": _pick_first_meaningful(
            req.preferred_date,
            extracted.get("preferred_date"),
            extracted.get("date"),
            booking_confirmation.get("date"),
        ),
        "preferred_time": _pick_first_meaningful(
            req.preferred_time,
            extracted.get("preferred_time"),
            extracted.get("time"),
            booking_confirmation.get("time"),
        ),
        "alternative_times": _pick_first_meaningful(
            req.alternative_times,
            extracted.get("alternative_times"),
            extracted.get("alternative_time"),
            extracted.get("alternatives"),
        ),
        "booking_id": _pick_first_non_empty(req.booking_id, extracted.get("booking_id"), req.session_id),
        "provider_name": _pick_first_meaningful(req.provider_name, extracted.get("provider_name")),
        "booking_message": _pick_first_non_empty(
            req.booking_message,
            "Please confirm availability and booking details on this request.",
        ),
    }

    # Keep non-critical dynamic variables empty if missing instead of injecting fake placeholders.
    for key in ("customer_name", "service_type", "location", "preferred_date", "preferred_time", "alternative_times", "provider_name"):
        if _is_placeholder_value(dynamic_variables.get(key)):
            dynamic_variables[key] = ""

    if req.dynamic_variables:
        for key, value in req.dynamic_variables.items():
            value_text = _as_string(value)
            if key in {
                "customer_name",
                "service_type",
                "location",
                "preferred_date",
                "preferred_time",
                "alternative_times",
                "provider_name",
            } and _is_placeholder_value(value_text):
                continue
            dynamic_variables[key] = value_text

    # Retell requires dynamic variable values to be strings.
    return {key: _as_string(value) for key, value in dynamic_variables.items()}


@router.post("/retell", response_model=RetellCallResponse)
def create_retell_outbound_call(req: RetellCallRequest):
    if not retell_enabled():
        raise HTTPException(
            status_code=400,
            detail="Retell is not configured. Set RETELL_API_KEY, RETELL_AGENT_ID, and RETELL_FROM_NUMBER.",
        )

    try:
        # Ensure session exists with the authenticated user, so /api/history/{session_id}
        # can return call events for execution-prefixed sessions as well.
        if supabase_enabled():
            upsert_session(
                session_id=req.session_id,
                user_id=req.user_id,
                metadata={"provider_name": req.provider_name} if req.provider_name else {},
            )

        dynamic_variables = _build_dynamic_variables(req)
        logger.info(
            "Retell dynamic variables prepared for session_id='%s': values=%s",
            req.session_id,
            dynamic_variables,
        )
        call = create_outbound_call(
            to_number=req.to_number,
            session_id=req.session_id,
            user_id=req.user_id,
            metadata={
                "provider_name": req.provider_name,
                "booking_message": req.booking_message,
                "retell_dynamic_variables": dynamic_variables,
            },
            dynamic_variables=dynamic_variables,
        )

        selected_forced_number = call.get("selected_forced_to_number")
        if not isinstance(selected_forced_number, str) or not selected_forced_number.strip():
            selected_forced_number = "configured destination"

        return RetellCallResponse(
            success=True,
            message=f"Outbound call started to {selected_forced_number}.",
            call_id=call.get("call_id"),
            call_status=call.get("call_status"),
            agent_id=call.get("agent_id"),
            dynamic_variables_preview=dynamic_variables,
        )
    except RetellAPIError as exc:
        raise HTTPException(status_code=exc.status_code, detail=f"Retell call error: {exc.message}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Retell call error: {str(exc)}")
