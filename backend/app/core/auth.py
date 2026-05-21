from __future__ import annotations

from typing import Optional

import requests

from app.core.config import SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL


def get_user_id_from_auth_header(auth_header: str | None) -> Optional[str]:
    if not auth_header:
        return None

    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None

    token = parts[1].strip()
    if not token or not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None

    try:
        response = requests.get(
            f"{SUPABASE_URL.rstrip('/')}/auth/v1/user",
            headers={
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {token}",
            },
            timeout=10,
        )
        if not response.ok:
            return None
        payload = response.json()
    except Exception:
        return None

    return payload.get("id") or payload.get("sub")
