import json
import logging
import time as _time
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.prebuilt import create_react_agent
from app.core.config import llm
from app.agents.google_agent import run_google_agent

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
You are the Main Triage Agent for an AI Service Orchestrator app in Pakistan.
Your job is to parse the user's request and determine its intent (e.g., booking a service like Plumbing, or booking a tour).

Step 1: Identify what information is missing based on the intent:
- For a booking/service, you need: time and location.
- For a tour, you need: destination and source.
- For other requests, determine the logical required parameters.

Step 2: If ANY of these required details are missing or unclear, you MUST set "intent_resolved": false and provide "clarifying_questions" to ask the user. DO NOT use search tools yet.

Step 3: If ALL required information is clearly provided, check if the request is for a local service.
If it is a service, use the `run_google_agent` tool to find a provider.
If it is not a service, you do not need to use the tool.

Avoid generic greetings in the final response. Only greet if the user greeting is the entire request.

FINAL STEP: You MUST return a final response that is valid JSON matching this exact schema and NOTHING ELSE (no markdown blocks, just the raw JSON):
{
  "intent_resolved": boolean,
  "clarifying_questions": [
    {
      "question": "string",
      "options": ["string"],
      "type": "options or open-ended"
    }
  ],
  "parameters": {
    "intent_type": "string",
    "extracted_details": "object containing the dynamically extracted details like location, time, destination, etc."
  },
  "recommended_providers": [
    {
      "name": "string",
      "address": "string",
      "phone_number": "string",
      "rating": 0,
      "reviews_summary": "string"
    }
  ] or null,
  "booking_confirmation": {
    "label": "string (e.g. AC Repair Booking)",
    "time": "string (human-readable display, e.g. Tomorrow at 3:00 PM)",
    "confirmed_date": "YYYY-MM-DD or null if the user has not provided a specific date",
    "confirmed_time": "HH:MM in 24-hour format or null if the user has not provided a specific time"
  } or null,
  "message": "A friendly message to the user"
}
"""


def _content_to_text(content) -> str:
  """Flatten provider-specific message content into plain text."""
  if content is None:
    return ""
  if isinstance(content, str):
    return content
  if isinstance(content, dict):
    # Some providers send a dict with a `text` field.
    if "text" in content:
      return _content_to_text(content.get("text"))
    return str(content)
  if isinstance(content, list):
    return "".join(_content_to_text(item) for item in content)
  return str(content)


def _extract_json_object(text: str) -> str:
    """Return the first balanced JSON object found in text, or original text if none."""
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

def _build_system_prompt() -> str:
    from datetime import date
    return SYSTEM_PROMPT + f"\n\nToday's date is {date.today().isoformat()}. Use this when populating confirmed_date."


def run_main_agent(session_history: list) -> dict:
    if not llm:
        raise Exception("Gemini client (Langchain) is not initialized.")

    tools = [run_google_agent]
    agent_executor = create_react_agent(llm, tools)

    # Format the chat history
    messages = [SystemMessage(content=_build_system_prompt())]
    for msg in session_history:
        role = msg.get("role", "user")
        parts = msg.get("parts", [])
        text = parts[0].get("text", "") if parts else ""
        if role == "system":
            messages.append(SystemMessage(content=text))
        elif role == "user":
            messages.append(HumanMessage(content=text))
        else:
            messages.append(AIMessage(content=text))
            
    # Add an explicit final instruction
    messages.append(HumanMessage(content="Process the request and output your final JSON response based on the defined schema."))
    
    try:
        response_obj = agent_executor.invoke({"messages": messages})
        final_messages = response_obj["messages"]
        raw_content = final_messages[-1].content
        response_text = _content_to_text(raw_content)
        
        # Clean up the output in case the LLM returned markdown code blocks
        clean_text = response_text.strip()
        if clean_text.startswith("```json"):
            clean_text = clean_text[len("```json"):].strip()
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3].strip()
        elif clean_text.startswith("```"):
            clean_text = clean_text[len("```"):].strip()
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3].strip()
            
        try:
          agent_output = json.loads(clean_text)
        except json.JSONDecodeError:
          extracted = _extract_json_object(clean_text)
          agent_output = json.loads(extracted)
        if not isinstance(agent_output, dict):
          agent_output = {"intent_resolved": False, "message": "Unexpected response format.", "recommended_providers": agent_output if isinstance(agent_output, list) else None}
        return agent_output, response_text
    except Exception as e:
        # Fallback if parsing fails or something goes wrong
        print(f"Agent failed: {e}")
        fallback_res = {
            "intent_resolved": False,
            "clarifying_questions": [],
            "message": "I encountered an error processing your request."
        }
        return fallback_res, json.dumps(fallback_res)

async def stream_main_agent(session_history: list):
    """Asynchronous version of main agent that yields SSE formatted strings for streaming."""
    import asyncio
    from app.agents.google_agent import set_event_queue

    if not llm:
        raise Exception("Gemini client (Langchain) is not initialized.")

    # Shared in-process queue for synchronous sub-tool events
    sub_events: list = []
    set_event_queue(sub_events)

    tools = [run_google_agent]
    agent_executor = create_react_agent(llm, tools)

    # Format the chat history
    messages = [SystemMessage(content=_build_system_prompt())]
    for msg in session_history:
        role = msg.get("role", "user")
        parts = msg.get("parts", [])
        text = parts[0].get("text", "") if parts else ""
        if role == "system":
            messages.append(SystemMessage(content=text))
        elif role == "user":
            messages.append(HumanMessage(content=text))
        else:
            messages.append(AIMessage(content=text))

    # Add an explicit final instruction
    messages.append(HumanMessage(content="Process the request and output your final JSON response based on the defined schema."))

    def _drain_sub_events():
        """Yield and clear any sub-events queued by google_agent tools."""
        while sub_events:
            yield sub_events.pop(0)

    _stream_start = _time.perf_counter()
    logger.debug("stream_main_agent: starting SSE stream, history_len=%d", len(session_history))
    try:
        async for event in agent_executor.astream_events({"messages": messages}, version="v2"):
            kind = event["event"]
            logger.debug("stream_main_agent: event kind=%s name=%s elapsed=%.2fs", kind, event.get("name"), _time.perf_counter() - _stream_start)

            # --- Drain sub-events after every LangGraph event ---
            for sub in _drain_sub_events():
                yield f"data: {json.dumps({'type': 'sub_step', **sub})}\n\n"

            if kind == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                content = chunk.content
                if content:
                    yield f"data: {json.dumps({'type': 'token', 'content': _content_to_text(content)})}\n\n"

            elif kind == "on_tool_start":
                tool_name = event["name"]
                tool_input = event["data"].get("input", {})
                logger.debug("stream_main_agent: tool_start tool=%s input=%s", tool_name, str(tool_input)[:200])
                yield f"data: {json.dumps({'type': 'tool_start', 'tool': tool_name, 'input': tool_input})}\n\n"

            elif kind == "on_tool_end":
                tool_name = event["name"]
                tool_output = event["data"].get("output")
                logger.debug("stream_main_agent: tool_end tool=%s output_preview=%s elapsed=%.2fs", tool_name, str(tool_output)[:200], _time.perf_counter() - _stream_start)
                # Drain sub-events one final time right after the tool finishes
                for sub in _drain_sub_events():
                    yield f"data: {json.dumps({'type': 'sub_step', **sub})}\n\n"
                yield f"data: {json.dumps({'type': 'tool_end', 'tool': tool_name})}\n\n"

            elif kind == "on_chain_end" and event["name"] == "LangGraph" and not event.get("parent_ids"):
                logger.debug("stream_main_agent: LangGraph chain_end received, total elapsed=%.2fs", _time.perf_counter() - _stream_start)
                output = event["data"].get("output", {})
                if "messages" in output:
                    final_content = output["messages"][-1].content
                    response_text = _content_to_text(final_content)

                    clean_text = response_text.strip()
                    if clean_text.startswith("```json"):
                        clean_text = clean_text[len("```json"):].strip()
                        if clean_text.endswith("```"):
                            clean_text = clean_text[:-3].strip()
                    elif clean_text.startswith("```"):
                        clean_text = clean_text[len("```"):].strip()
                        if clean_text.endswith("```"):
                            clean_text = clean_text[:-3].strip()

                    try:
                        agent_output = json.loads(clean_text)
                    except json.JSONDecodeError:
                        extracted = _extract_json_object(clean_text)
                        try:
                            agent_output = json.loads(extracted)
                        except Exception:
                            agent_output = {"intent_resolved": False, "message": "Failed to parse final output."}

                    if not isinstance(agent_output, dict):
                        agent_output = {"intent_resolved": False, "message": "Unexpected response format.", "recommended_providers": agent_output if isinstance(agent_output, list) else None}

                    yield f"data: {json.dumps({'type': 'complete', 'data': agent_output})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    finally:
        set_event_queue(None)
