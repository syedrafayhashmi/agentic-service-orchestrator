import json
import logging
import requests
from langchain_core.tools import tool
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.prebuilt import create_react_agent
from app.core.config import GOOGLE_MAPS_API_KEY, llm

# ---------------------------------------------------------------------------
# Module-level event queue injected by stream_main_agent before each run
# ---------------------------------------------------------------------------
_event_queue: list | None = None

def set_event_queue(queue: list | None):
    global _event_queue
    _event_queue = queue

def _emit(event: dict):
    if _event_queue is not None:
        _event_queue.append(event)

logger = logging.getLogger(__name__)
# Classic Places API (maps.googleapis.com) — no need to enable Places API (New)
PLACES_TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"


def _content_to_text(content) -> str:
    """Flatten provider-specific message content into plain text."""
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


def _extract_api_error(response: requests.Response) -> str:
    """Extract readable error text from Google Places API responses."""
    try:
        body = response.json()
    except ValueError:
        return response.text[:300] if response.text else "Unknown API error"

    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict):
            message = err.get("message")
            if message:
                return str(message)
        return str(body)
    return str(body)

@tool
def search_places(query: str) -> str:
    """
    Search Google Maps for local businesses.
    Returns a JSON string of up to 10 places, including their name, address, rating, and place_id.
    """
    _emit({"type": "sub_step", "step": "search_start", "query": query})

    if not GOOGLE_MAPS_API_KEY:
        logger.warning("Google Places search skipped: GOOGLE_MAPS_API_KEY missing; returning mock results.")
        mock = [
            {"name": "Mock AC Expert 1", "place_id": "mock_1", "rating": 4.5, "address": "123 Main St, Lahore"},
            {"name": "Mock AC Expert 2", "place_id": "mock_2", "rating": 4.8, "address": "456 Gulberg III, Lahore"},
            {"name": "Mock AC Expert 3", "place_id": "mock_3", "rating": 4.2, "address": "789 DHA Phase 5, Lahore"},
        ]
        _emit({"type": "sub_step", "step": "search_done", "count": len(mock), "places": mock})
        return json.dumps(mock)

    logger.info("Google Places text search started: query='%s'", query)
    try:
        response = requests.get(
            PLACES_TEXT_SEARCH_URL,
            params={
                "query": query,
                "key": GOOGLE_MAPS_API_KEY,
            },
            timeout=10,
        )

        if not response.ok:
            error_message = _extract_api_error(response)
            logger.warning(
                "Google Places text search failed: http_status=%s error_message=%s",
                response.status_code,
                error_message,
            )
            _emit({"type": "sub_step", "step": "search_error", "error": error_message})
            return f"Error searching places: status={response.status_code} error_message={error_message}"

        data = response.json()
        if data.get("status") not in ("OK", "ZERO_RESULTS"):
            error_message = data.get("error_message") or data.get("status", "Unknown error")
            logger.warning("Google Places text search error: %s", error_message)
            _emit({"type": "sub_step", "step": "search_error", "error": error_message})
            return f"Error searching places: {error_message}"

        places = data.get("results", [])
        logger.info(
            "Google Places text search completed: http_status=%s total_results=%s",
            response.status_code,
            len(places),
        )

        results = []
        for r in places[:10]:
            results.append({
                "name": r.get("name"),
                "address": r.get("formatted_address"),
                "rating": r.get("rating", 0),
                "place_id": r.get("place_id"),
            })

        _emit({"type": "sub_step", "step": "search_done", "count": len(results), "places": results})
        return json.dumps(results)
    except Exception as e:
        logger.exception("Google Places text search failed: %s", e)
        _emit({"type": "sub_step", "step": "search_error", "error": str(e)})
        return f"Error searching places: {e}"

@tool
def get_place_reviews(place_id: str) -> str:
    """
    Get the phone number and user reviews for a specific Google Maps place_id.
    Returns a JSON string with 'phone_number' and a list of 'reviews' (author, rating, text).
    """
    _emit({"type": "sub_step", "step": "reviews_start", "place_id": place_id})

    if not GOOGLE_MAPS_API_KEY or place_id.startswith("mock"):
        logger.warning("Google Place details skipped for place_id='%s'; using mock details.", place_id)
        result = {
            "phone_number": "0300-0000000",
            "reviews": [{"rating": 5, "text": "Great service!"}, {"rating": 4, "text": "Good but expensive."}]
        }
        _emit({"type": "sub_step", "step": "reviews_done", "place_id": place_id, "review_count": len(result["reviews"])})
        return json.dumps(result)

    logger.info("Google Place details started: place_id='%s'", place_id)
    try:
        response = requests.get(
            PLACES_DETAILS_URL,
            params={
                "place_id": place_id,
                "fields": "name,formatted_phone_number,international_phone_number,reviews",
                "key": GOOGLE_MAPS_API_KEY,
            },
            timeout=10,
        )

        if not response.ok:
            error_message = _extract_api_error(response)
            logger.warning(
                "Google Place details failed: place_id=%s http_status=%s error_message=%s",
                place_id,
                response.status_code,
                error_message,
            )
            _emit({"type": "sub_step", "step": "reviews_error", "place_id": place_id, "error": error_message})
            return f"Error fetching reviews: status={response.status_code} error_message={error_message}"

        data = response.json()
        if data.get("status") not in ("OK",):
            error_message = data.get("error_message") or data.get("status", "Unknown error")
            logger.warning("Google Place details error: place_id=%s %s", place_id, error_message)
            _emit({"type": "sub_step", "step": "reviews_error", "place_id": place_id, "error": error_message})
            return f"Error fetching reviews: {error_message}"

        result = data.get("result", {})
        logger.info(
            "Google Place details completed: http_status=%s review_count=%s",
            response.status_code,
            len(result.get("reviews", [])),
        )
        reviews = []
        for rev in result.get("reviews", [])[:3]:
            reviews.append({
                "rating": rev.get("rating"),
                "text": rev.get("text", "")[:200],
            })
        out = {
            "phone_number": result.get("international_phone_number") or result.get("formatted_phone_number", "N/A"),
            "reviews": reviews,
        }
        _emit({"type": "sub_step", "step": "reviews_done", "place_id": place_id, "review_count": len(reviews)})
        return json.dumps(out)
    except Exception as e:
        logger.exception("Google Place details failed for place_id='%s': %s", place_id, e)
        _emit({"type": "sub_step", "step": "reviews_error", "place_id": place_id, "error": str(e)})
        return f"Error fetching reviews: {e}"

@tool
def run_google_agent(service_type: str, location: str) -> list:
    """
    Search Google Maps for a local business or service provider, read reviews, and return the top 3 recommended businesses.
    Use this tool ONLY if the user request is for a service (e.g. plumbing, AC repair).
    
    Args:
        service_type: The type of service requested
        location: The location for the service
    """
    logger.info("Google sub-agent invoked: service_type='%s', location='%s'", service_type, location)
    if not llm:
        logger.error("Google sub-agent aborted: LLM not configured.")
        return [{"error": "LLM not configured."}]

    sub_agent_tools = [search_places]
    agent_executor = create_react_agent(llm, sub_agent_tools)

    system_prompt = f"""
    You are an expert Google Maps evaluator. The user is looking for '{service_type}' in '{location}'.
    
    Step 1: Use the `search_places` tool to find up to 10 local businesses.
    Step 2: Select the TOP 3 absolute best businesses.

    
    FINAL RESPONSE MUST BE STRICT VALID JSON MATCHING THIS SCHEMA:
    [
      {{
        "name": "string",
        "address": "string",
        "phone_number": "string",
        "rating": number,
        "reviews_summary": "A 1-sentence summary of what the reviews say."
      }}
    ]
    Do not include any markdown formatting like ```json ... ```. Just return the raw JSON array.
    """

    try:
        logger.debug("Google sub-agent: invoking LLM to select top 3 from search results")
        import time as _time
        _t0 = _time.perf_counter()
        response_obj = agent_executor.invoke({"messages": [
            SystemMessage(content=system_prompt),
            HumanMessage(content="Find the best 3 businesses and output the final JSON array.")
        ]})
        _elapsed = _time.perf_counter() - _t0
        logger.debug("Google sub-agent: LLM selection call completed in %.2fs", _elapsed)

        raw_content = response_obj["messages"][-1].content
        final_text = _content_to_text(raw_content)
        logger.debug("Google sub-agent raw LLM output: %s", final_text[:500])

        # Clean up the output in case the LLM returned markdown code blocks
        clean_text = final_text.strip()
        if clean_text.startswith("```json"):
            clean_text = clean_text[7:-3].strip()
        elif clean_text.startswith("```"):
            clean_text = clean_text[3:-3].strip()

        try:
            parsed = json.loads(clean_text)
            logger.info("Google sub-agent completed successfully: recommended_count=%s", len(parsed) if isinstance(parsed, list) else 0)
            return parsed
        except json.JSONDecodeError:
            logger.warning("Google sub-agent output is not valid JSON: %s", clean_text)
            return [{"error": "Failed to extract valid JSON", "raw": clean_text}]
    except Exception as e:
        logger.exception("Google sub-agent error: %s", e)
        return []
