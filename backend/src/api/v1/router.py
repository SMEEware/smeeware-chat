"""Sammelt alle Routen der v1-API."""

from __future__ import annotations

from fastapi import APIRouter

from src.api.v1.routes import (
    account,
    apikeys,
    chat,
    chats,
    events,
    fs,
    health,
    models,
    notifications,
    prompts,
    public,
    tools,
    transcribe,
    tts,
    uploads,
    vision,
)

router = APIRouter()
router.include_router(health.router)
router.include_router(account.router)
router.include_router(apikeys.router)
router.include_router(events.router)
router.include_router(fs.router)
router.include_router(notifications.router)
router.include_router(chat.router)
# /chat und /chats kollidieren nicht -- getrennte Prefixe.
router.include_router(chats.router)
# Geteilte Chats. Liegt unter /public/chats und nicht unter /chats, damit an
# der Adresse ablesbar ist, dass hier keine Anmeldung verlangt wird.
router.include_router(public.router)
router.include_router(models.router)
router.include_router(tools.router)
router.include_router(vision.router)
# Anhaenge liegen neben dem Vision-Dienst, der sie spaeter ansieht.
router.include_router(uploads.router)
router.include_router(transcribe.router)
router.include_router(tts.router)
router.include_router(prompts.router)

__all__ = ["router"]
