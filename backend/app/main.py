import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.chat import router as chat_router
from app.api.history import router as history_router
from app.api.calls import router as calls_router
from app.api.retell_webhook import router as retell_webhook_router
from app.api.calendar import router as calendar_router

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

app = FastAPI(title="AI Service Orchestrator API (Refactored)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the chat router
# Canonical API routes.
app.include_router(chat_router, prefix="/api")
app.include_router(history_router, prefix="/api")
app.include_router(calls_router, prefix="/api/calls")
app.include_router(retell_webhook_router, prefix="/api/webhooks")
app.include_router(calendar_router, prefix="/api/calendar")

# Compatibility routes for reverse proxies that strip the /api prefix
# before forwarding requests to FastAPI.
app.include_router(chat_router, prefix="")
app.include_router(history_router, prefix="")
app.include_router(calls_router, prefix="/calls")
app.include_router(retell_webhook_router, prefix="/webhooks")
app.include_router(calendar_router, prefix="/calendar")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
