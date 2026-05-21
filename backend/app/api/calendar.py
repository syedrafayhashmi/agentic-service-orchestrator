import logging
from datetime import datetime, timedelta

import requests
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.core.auth import get_user_id_from_auth_header
from app.core.config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
from app.core.supabase_store import fetch_google_tokens, update_google_access_token

logger = logging.getLogger(__name__)

router = APIRouter()

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"


class CreateEventRequest(BaseModel):
    title: str
    date_time: str
    time_zone: str = "UTC"


def _refresh_access_token(refresh_token: str) -> str:
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        logger.error("Token refresh aborted: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured")
        raise HTTPException(status_code=500, detail="Google OAuth credentials not configured on server.")

    logger.debug("Token refresh: requesting new access token from Google")
    import time as _time
    _t0 = _time.perf_counter()
    response = requests.post(
        GOOGLE_TOKEN_URL,
        data={
            "grant_type": "refresh_token",
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "refresh_token": refresh_token,
        },
        timeout=10,
    )
    logger.debug("Token refresh: response status=%s elapsed=%.2fs", response.status_code, _time.perf_counter() - _t0)

    if not response.ok:
        logger.error("Google token refresh failed: status=%s body=%s", response.status_code, response.text)
        raise HTTPException(status_code=401, detail="Failed to refresh Google token. Please sign in with Google again.")

    logger.debug("Token refresh: success")
    return response.json()["access_token"]


@router.post("/events")
def create_calendar_event(body: CreateEventRequest, request: Request):
    import time as _time
    _t0 = _time.perf_counter()
    logger.debug("create_calendar_event: received request title=%r date_time=%r time_zone=%r", body.title, body.date_time, body.time_zone)

    try:
        user_id = get_user_id_from_auth_header(request.headers.get("Authorization"))
        if not user_id:
            logger.warning("create_calendar_event: unauthorized request — no valid JWT")
            raise HTTPException(status_code=401, detail="Unauthorized.")
        logger.debug("create_calendar_event: authenticated user_id=%s", user_id)

        tokens = fetch_google_tokens(user_id=user_id)
        if not tokens or not tokens.get("refresh_token"):
            logger.warning("create_calendar_event: no refresh_token found for user_id=%s tokens_found=%s", user_id, bool(tokens))
            raise HTTPException(
                status_code=400,
                detail="No Google refresh token found. Please sign out and sign in with Google again.",
            )
        logger.debug("create_calendar_event: google tokens fetched for user_id=%s", user_id)

        access_token = _refresh_access_token(tokens["refresh_token"])
        update_google_access_token(user_id=user_id, access_token=access_token)

        start = datetime.fromisoformat(body.date_time.replace("Z", "+00:00"))
        end = start + timedelta(hours=1)
        logger.debug("create_calendar_event: creating event start=%s end=%s time_zone=%s", start.isoformat(), end.isoformat(), body.time_zone)

        resp = requests.post(
            f"{GOOGLE_CALENDAR_API}/calendars/primary/events",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={
                "summary": body.title,
                "start": {"dateTime": start.isoformat(), "timeZone": body.time_zone},
                "end": {"dateTime": end.isoformat(), "timeZone": body.time_zone},
            },
            timeout=10,
        )
        logger.debug("create_calendar_event: Google Calendar API response status=%s elapsed=%.2fs", resp.status_code, _time.perf_counter() - _t0)

        if not resp.ok:
            err = resp.json().get("error", {})
            logger.error("Calendar event creation failed: status=%s body=%s", resp.status_code, resp.text)
            raise HTTPException(
                status_code=resp.status_code,
                detail=err.get("message", "Failed to create calendar event."),
            )

        event = resp.json()
        logger.info("Calendar event created: id=%s user_id=%s elapsed=%.2fs", event.get("id"), user_id, _time.perf_counter() - _t0)
        return {"id": event["id"], "htmlLink": event.get("htmlLink")}

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("create_calendar_event: unexpected error: %s", exc)
        raise HTTPException(status_code=500, detail="Internal server error while creating calendar event.")
