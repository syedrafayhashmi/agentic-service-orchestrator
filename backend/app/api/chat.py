import json

from fastapi import APIRouter, HTTPException, Request
from langchain_core.messages import SystemMessage, HumanMessage

from app.schemas.chat_schemas import ChatRequest, ChatResponse
from app.core.config import sessions, llm
from app.agents.main_agent import run_main_agent
from app.core.supabase_store import fetch_session_messages, save_chat_turn, save_execution_event, supabase_enabled
from app.core.auth import get_user_id_from_auth_header

router = APIRouter()


def _history_text(message: str) -> dict:
    return {"role": "user", "parts": [{"text": message}]}


SUMMARY_PREFIX = "Conversation summary:"
MAX_HISTORY_MESSAGES = 24
MAX_HISTORY_CHARS = 8000
SUMMARY_KEEP_MESSAGES = 12
SUMMARY_MAX_CHARS = 1200
HISTORY_LOAD_LIMIT = 120


def _get_part_text(msg: dict) -> str:
    parts = msg.get("parts") or []
    if isinstance(parts, list) and parts:
        first = parts[0]
        if isinstance(first, dict):
            return str(first.get("text", ""))
        return str(first)
    return ""


def _content_to_text(content) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, dict):
        if "text" in content:
            return _content_to_text(content.get("text"))
        return str(content)
    if isinstance(content, list):
        return "".join(_content_to_text(item) for item in content)
    return str(content)


def _strip_existing_summary(history: list[dict]) -> list[dict]:
    cleaned: list[dict] = []
    for msg in history:
        text = _get_part_text(msg)
        if msg.get("role") == "system" and text.startswith(SUMMARY_PREFIX):
            continue
        cleaned.append(msg)
    return cleaned


def _history_to_text(history: list[dict]) -> str:
    lines: list[str] = []
    for msg in history:
        text = _get_part_text(msg)
        if not text:
            continue
        role = msg.get("role")
        if role == "user":
            prefix = "User"
        elif role == "model":
            prefix = "Assistant"
        else:
            prefix = "Context"
        lines.append(f"{prefix}: {text}")
    return "\n".join(lines)


def _fallback_summary(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    user_lines = [line[5:].strip() for line in lines if line.startswith("User:")]
    assistant_lines = [line[10:].strip() for line in lines if line.startswith("Assistant:")]

    parts: list[str] = []
    if user_lines:
        parts.append("User requests: " + "; ".join(user_lines[-3:]))
    if assistant_lines:
        parts.append("Assistant replies: " + "; ".join(assistant_lines[-3:]))

    summary = " ".join(parts).strip()
    if not summary:
        summary = text
    return summary[:SUMMARY_MAX_CHARS].rstrip()


def _summarize_text(history: list[dict]) -> str:
    text = _history_to_text(history)
    if not text:
        return "No prior conversation."

    if llm is None:
        return _fallback_summary(text)

    try:
        response = llm.invoke([
            SystemMessage(
                content=(
                    "Summarize the prior conversation for continuity. "
                    "Include user intent, constraints, locations, providers, and decisions. "
                    f"Keep it under {SUMMARY_MAX_CHARS} characters."
                )
            ),
            HumanMessage(content=text),
        ])
        summary = _content_to_text(response.content)
        return summary[:SUMMARY_MAX_CHARS].rstrip() if summary else _fallback_summary(text)
    except Exception:
        return _fallback_summary(text)


def _maybe_summarize_history(history: list[dict]) -> list[dict]:
    cleaned = _strip_existing_summary(history)
    total_chars = sum(len(_get_part_text(msg)) for msg in cleaned)
    if len(cleaned) <= MAX_HISTORY_MESSAGES and total_chars <= MAX_HISTORY_CHARS:
        return cleaned
    if len(cleaned) <= SUMMARY_KEEP_MESSAGES:
        return cleaned

    prior = cleaned[:-SUMMARY_KEEP_MESSAGES]
    keep = cleaned[-SUMMARY_KEEP_MESSAGES:]
    summary = _summarize_text(prior)
    if not summary:
        return keep
    summary_msg = {"role": "system", "parts": [{"text": f"{SUMMARY_PREFIX} {summary}"}]}
    return [summary_msg, *keep]


def _hydrate_history_from_rows(rows: list[dict]) -> list[dict]:
    history: list[dict] = []
    for row in rows:
        user_text = row.get("user_message")
        if user_text:
            history.append(_history_text(user_text))
        raw_response = row.get("raw_response")
        if isinstance(raw_response, dict) and raw_response:
            history.append({"role": "model", "parts": [{"text": json.dumps(raw_response)}]})
            continue
        assistant_text = row.get("assistant_message")
        if assistant_text:
            history.append({"role": "model", "parts": [{"text": assistant_text}]})
    return history

@router.post("/chat", response_model=ChatResponse)
def chat_endpoint(req: ChatRequest, request: Request):
    user_id = get_user_id_from_auth_header(request.headers.get("Authorization")) or req.user_id
    # Discovery sessions are ephemeral — skip history persistence entirely
    is_discovery = req.session_id.startswith("discovery-")

    # 1. Session Management (skip for discovery sessions)
    if not is_discovery:
        if req.session_id not in sessions:
            sessions[req.session_id] = []
        session_history = sessions[req.session_id]
        if not session_history and user_id and supabase_enabled():
            rows = fetch_session_messages(session_id=req.session_id, user_id=user_id, limit=HISTORY_LOAD_LIMIT)
            session_history.extend(_hydrate_history_from_rows(rows))
        session_history = _maybe_summarize_history(session_history)
        sessions[req.session_id] = session_history
    else:
        session_history = []

    location = (req.metadata or {}).get("location")
    if location and not any("User location:" in str(m) for m in session_history):
        insert_at = 0
        if session_history and session_history[0].get("role") == "system":
            if _get_part_text(session_history[0]).startswith(SUMMARY_PREFIX):
                insert_at = 1
        session_history.insert(insert_at, {"role": "user", "parts": [{"text": f"User location: {location}"}]})
        session_history.insert(insert_at + 1, {"role": "model", "parts": [{"text": "Understood. I will use this location when searching for nearby services."}]})

    session_history.append(_history_text(req.message))

    # 2. Call Autonomous Main Agent
    try:
        agent_output, raw_model_text = run_main_agent(session_history)
        if not is_discovery:
            session_history.append({"role": "model", "parts": [{"text": raw_model_text}]})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Main Agent Error: {str(e)}")

    # 3. Formulate Response based on Agent's output
    intent_resolved = agent_output.get("intent_resolved", False)
    response_message = agent_output.get("message", "I need a few more details to find the best provider for you.")

    response = ChatResponse(
        intent_resolved=intent_resolved,
        message=response_message,
        clarifying_questions=agent_output.get("clarifying_questions"),
        recommended_providers=agent_output.get("recommended_providers"),
        booking_confirmation=agent_output.get("booking_confirmation"),
        fallback_used=agent_output.get("fallback_used", False),
        session_id=req.session_id,
    )

    # Skip Supabase persistence for discovery sessions
    if not is_discovery and supabase_enabled() and user_id:
        try:
            save_chat_turn(
                session_id=req.session_id,
                user_id=user_id,
                user_message=req.message,
                assistant_message=response_message,
                raw_response=agent_output,
                request_metadata=req.metadata,
            )
            save_execution_event(
                session_id=req.session_id,
                user_id=user_id,
                request_message=req.message,
                event_type="complete",
                payload={"type": "complete", "data": agent_output},
            )
        except Exception as storage_error:
            print(f"Supabase persistence error: {storage_error}")
    
    return response

from fastapi.responses import StreamingResponse

@router.post("/chat/stream")
async def chat_stream_endpoint(req: ChatRequest, request: Request):
    user_id = get_user_id_from_auth_header(request.headers.get("Authorization")) or req.user_id
    # Discovery sessions are ephemeral — skip history persistence entirely
    is_discovery = req.session_id.startswith("discovery-")

    # 1. Session Management (skip for discovery sessions)
    if not is_discovery:
        if req.session_id not in sessions:
            sessions[req.session_id] = []
        session_history = sessions[req.session_id]
        if not session_history and user_id and supabase_enabled():
            rows = fetch_session_messages(session_id=req.session_id, user_id=user_id, limit=HISTORY_LOAD_LIMIT)
            session_history.extend(_hydrate_history_from_rows(rows))
        session_history = _maybe_summarize_history(session_history)
        sessions[req.session_id] = session_history
    else:
        session_history = []

    location = (req.metadata or {}).get("location")
    if location and not any("User location:" in str(m) for m in session_history):
        insert_at = 0
        if session_history and session_history[0].get("role") == "system":
            if _get_part_text(session_history[0]).startswith(SUMMARY_PREFIX):
                insert_at = 1
        session_history.insert(insert_at, {"role": "user", "parts": [{"text": f"User location: {location}"}]})
        session_history.insert(insert_at + 1, {"role": "model", "parts": [{"text": "Understood. I will use this location when searching for nearby services."}]})

    session_history.append(_history_text(req.message))

    from app.agents.main_agent import stream_main_agent
    
    async def sse_generator():
        try:
            async for chunk in stream_main_agent(session_history):
                for line in chunk.split('\n'):
                    stripped = line.strip()
                    if not stripped.startswith("data:"):
                        continue
                    try:
                        data_json = json.loads(stripped[5:].strip())
                    except Exception as e:
                        print(f"Error parsing stream event: {e}")
                        continue

                    event_type = data_json.get("type")
                    if (
                        not is_discovery
                        and supabase_enabled()
                        and user_id
                        and event_type in {"tool_start", "tool_end", "sub_step", "complete", "error"}
                    ):
                        try:
                            save_execution_event(
                                session_id=req.session_id,
                                user_id=user_id,
                                request_message=req.message,
                                event_type=str(event_type),
                                payload=data_json,
                            )
                        except Exception as storage_error:
                            print(f"Supabase execution event persistence error: {storage_error}")

                    if event_type == "complete":
                        try:
                            agent_output = data_json.get("data", {})
                            if not isinstance(agent_output, dict):
                                agent_output = {}
                            response_message = agent_output.get("message", "")
                            if not is_discovery:
                                # Save to session history in backend memory
                                session_history.append({"role": "model", "parts": [{"text": json.dumps(agent_output)}]})
                                # Save to supabase
                                if supabase_enabled() and user_id:
                                    save_chat_turn(
                                        session_id=req.session_id,
                                        user_id=user_id,
                                        user_message=req.message,
                                        assistant_message=response_message,
                                        raw_response=agent_output,
                                        request_metadata=req.metadata,
                                    )
                        except Exception as e:
                            print(f"Error parsing complete chunk for history: {e}")
                yield chunk
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            
    return StreamingResponse(sse_generator(), media_type="text/event-stream")
