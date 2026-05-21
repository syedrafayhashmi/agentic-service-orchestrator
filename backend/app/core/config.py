import os
from dotenv import load_dotenv, dotenv_values
from langchain_google_genai import ChatGoogleGenerativeAI

# Load .env (prefer backend/app/.env, fallback to backend/.env) regardless of launch cwd
APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKEND_DIR = os.path.dirname(APP_DIR)
ENV_CANDIDATES = [os.path.join(APP_DIR, ".env"), os.path.join(BACKEND_DIR, ".env")]
ENV_PATH = next((p for p in ENV_CANDIDATES if os.path.exists(p)), ENV_CANDIDATES[0])
load_dotenv(ENV_PATH)


def _get_env_value_case_insensitive(name: str):
    """Return (value, key_name, source) where source is 'system' or '.env' or None."""
    # Exact getenv first
    val = os.getenv(name)
    if val:
        return val, name, "system"
    # Case-insensitive lookup in os.environ (covers Windows)
    for k, v in os.environ.items():
        if k.lower() == name.lower():
            return v, k, "system"
    # Check .env file values
    env_vals = dotenv_values(ENV_PATH)
    for k, v in env_vals.items():
        if k and k.lower() == name.lower():
            return v, k, ".env"
    return None, None, None


# Load important env vars with source detection
GEMINI_API_KEY, GEMINI_KEY_NAME, GEMINI_KEY_SOURCE = _get_env_value_case_insensitive("GEMINI_API_KEY")
GOOGLE_API_KEY, _, _ = _get_env_value_case_insensitive("GOOGLE_API_KEY")
GOOGLE_CLOUD_PROJECT, _, _ = _get_env_value_case_insensitive("GOOGLE_CLOUD_PROJECT")
if not GOOGLE_CLOUD_PROJECT:
    GOOGLE_CLOUD_PROJECT, _, _ = _get_env_value_case_insensitive("GCLOUD_PROJECT")
GOOGLE_CLOUD_LOCATION, _, _ = _get_env_value_case_insensitive("GOOGLE_CLOUD_LOCATION")
GEMINI_MODEL, _, _ = _get_env_value_case_insensitive("GEMINI_MODEL")
GOOGLE_MAPS_API_KEY, _, _ = _get_env_value_case_insensitive("GOOGLE_MAPS_API_KEY")
SUPABASE_URL, _, _ = _get_env_value_case_insensitive("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY, _, _ = _get_env_value_case_insensitive("SUPABASE_SERVICE_ROLE_KEY")
RETELL_API_KEY, _, _ = _get_env_value_case_insensitive("RETELL_API_KEY")
RETELL_AGENT_ID, _, _ = _get_env_value_case_insensitive("RETELL_AGENT_ID")
RETELL_FROM_NUMBER, _, _ = _get_env_value_case_insensitive("RETELL_FROM_NUMBER")
GOOGLE_CLIENT_ID, _, _ = _get_env_value_case_insensitive("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET, _, _ = _get_env_value_case_insensitive("GOOGLE_CLIENT_SECRET")

GOOGLE_CLOUD_LOCATION = GOOGLE_CLOUD_LOCATION or "us-central1"
GEMINI_MODEL = GEMINI_MODEL or "gemini-2.5-flash"
GENAI_API_KEY = GOOGLE_API_KEY or GEMINI_API_KEY
# If set to true, allow falling back to legacy Gemini API key. Default: true
USE_LEGACY_API_KEY = str(os.getenv("USE_LEGACY_API_KEY", "true")).lower() in ("1", "true", "yes", "on")

# Initialize LLM (prefer Agent Platform / Vertex AI)
llm = None

if GOOGLE_CLOUD_PROJECT or os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
    try:
        vertex_kwargs = {
            "model": GEMINI_MODEL,
            "location": GOOGLE_CLOUD_LOCATION,
            "temperature": 0.1,
            "vertexai": True,
            "thinking": {"thinking_budget": 1024},
        }
        if GOOGLE_CLOUD_PROJECT:
            vertex_kwargs["project"] = GOOGLE_CLOUD_PROJECT

        llm = ChatGoogleGenerativeAI(**vertex_kwargs)
        print(f"INFO: Using Agent Platform (Vertex AI) for model='{GEMINI_MODEL}'")
    except Exception as e:
        print(f"ERROR: Failed to initialize Vertex AI client: {e}")
        if not USE_LEGACY_API_KEY:
            raise

if llm is None and USE_LEGACY_API_KEY and GENAI_API_KEY:
    llm = ChatGoogleGenerativeAI(
        model=GEMINI_MODEL,
        api_key=GENAI_API_KEY,
        temperature=0.1,
        thinking={"thinking_budget": 1024},
    )

if llm is None:
    print(
        "WARNING: LLM not configured. Set GOOGLE_CLOUD_PROJECT or GOOGLE_APPLICATION_CREDENTIALS for Agent Platform auth, or set USE_LEGACY_API_KEY=true with GOOGLE_API_KEY/GEMINI_API_KEY for API-key auth."
    )


# In-memory session store (Session ID -> List of messages)
sessions = {}
