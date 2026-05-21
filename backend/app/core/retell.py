from typing import Any, Optional
import re
import logging
import random

import requests

from app.core.config import RETELL_AGENT_ID, RETELL_API_KEY, RETELL_FROM_NUMBER


RETELL_CALL_URL = "https://api.retellai.com/v2/create-phone-call"
E164_RE = re.compile(r"^\+[1-9]\d{7,14}$")
FORCED_RETELL_TO_NUMBERS = (
    "+4917677834094",
    "+4915754779991",
    "+4915213774941",
)
# Backward-compatible alias for older imports/usages.
FORCED_RETELL_TO_NUMBER = FORCED_RETELL_TO_NUMBERS[0]
logger = logging.getLogger(__name__)


class RetellAPIError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def _normalize_phone_number(value: str) -> str:
    raw = (value or "").strip()
    if raw.startswith("00"):
        raw = f"+{raw[2:]}"
    if raw.startswith("+"):
        return "+" + "".join(ch for ch in raw[1:] if ch.isdigit())
    return "".join(ch for ch in raw if ch.isdigit())


def _validate_e164(field_name: str, value: str) -> str:
    normalized = _normalize_phone_number(value)
    if not E164_RE.match(normalized):
        raise RetellAPIError(
            status_code=400,
            message=(
                f"Invalid {field_name}. Retell expects E.164 format like '+12137774445'. "
                f"Received '{value}'."
            ),
        )
    return normalized


def _extract_retell_error(response: requests.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        return response.text[:500] if response.text else "Unknown Retell error"

    if isinstance(data, dict):
        for key in ("message", "error", "detail"):
            val = data.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
            if isinstance(val, dict):
                nested = val.get("message")
                if isinstance(nested, str) and nested.strip():
                    return nested.strip()
        return str(data)
    return str(data)


def retell_enabled() -> bool:
    return bool(RETELL_API_KEY and RETELL_AGENT_ID and RETELL_FROM_NUMBER)


def _pick_forced_to_number() -> str:
    normalized_numbers = [
        _validate_e164("forced_to_number", number)
        for number in FORCED_RETELL_TO_NUMBERS
    ]
    if not normalized_numbers:
        raise RetellAPIError(500, "No forced Retell destination numbers configured.")
    return random.choice(normalized_numbers)


def create_outbound_call(
    *,
    to_number: str,
    session_id: str,
    user_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
    dynamic_variables: Optional[dict[str, str]] = None,
) -> dict[str, Any]:
    if not retell_enabled():
        raise RuntimeError("Retell is not configured. Set RETELL_API_KEY, RETELL_AGENT_ID, and RETELL_FROM_NUMBER.")

    normalized_from_number = _validate_e164("from_number", RETELL_FROM_NUMBER or "")
    forced_to_number = _pick_forced_to_number()
    if _normalize_phone_number(to_number) != forced_to_number:
        logger.info(
            "Retell destination overridden: requested_to=%s forced_to=%s",
            to_number,
            forced_to_number,
        )

    payload: dict[str, Any] = {
        "from_number": normalized_from_number,
        "to_number": forced_to_number,
        "override_agent_id": RETELL_AGENT_ID,
        "metadata": {
            "session_id": session_id,
            "user_id": user_id,
            "requested_to_number": to_number,
            "forced_to_number": forced_to_number,
            **(metadata or {}),
        },
    }

    if dynamic_variables:
        payload["retell_llm_dynamic_variables"] = dynamic_variables

    try:
        response = requests.post(
            RETELL_CALL_URL,
            headers={
                "Authorization": f"Bearer {RETELL_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=15,
        )
    except requests.RequestException as exc:
        raise RetellAPIError(502, f"Retell request failed: {exc}") from exc

    if not response.ok:
        message = _extract_retell_error(response)
        logger.warning(
            "Retell create-phone-call rejected: status=%s message=%s",
            response.status_code,
            message,
        )
        raise RetellAPIError(response.status_code, message)

    result = response.json()
    if isinstance(result, dict):
        result["selected_forced_to_number"] = forced_to_number
    return result
