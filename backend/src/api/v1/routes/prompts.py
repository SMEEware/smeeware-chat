from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, Response, status

from src.api.deps import ProviderDep
from src.core.exceptions import UnauthorizedError, ValidationError
from src.schemas.prompts import (
    PromptDetail,
    PromptListResponse,
    PromptSummary,
    PromptWrite,
)
from src.services.prompts.library import Prompt

router = APIRouter(prefix="/prompts", tags=["prompts"])

SitzungHeader = Annotated[str | None, Header(alias="X-Session-Id")]


def _angemeldet(provider: ProviderDep, session: str | None) -> None:
    """Lesen darf jeder, schreiben nur angemeldet.

    Ein Prompt ist die Persona des Assistenten -- wer sie aendern kann,
    aendert, was er tut. Das gehoert hinter dieselbe Schranke wie die Chats.
    """
    if provider.sessions.holen(session) is None:
        raise UnauthorizedError("Not signed in.")


@router.get("", response_model=PromptListResponse, summary="Available system prompts")
async def list_prompts(provider: ProviderDep) -> PromptListResponse:
    prompts = provider.prompts.list()
    return PromptListResponse(
        count=len(prompts),
        default=provider.settings.default_prompt,
        prompts=[_summary(p) for p in prompts],
    )


@router.post(
    "",
    response_model=PromptDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Create or overwrite a prompt",
)
async def write_prompt(
    payload: PromptWrite,
    provider: ProviderDep,
    session: SitzungHeader = None,
) -> PromptDetail:
    """Legt eine .md-Datei in prompts/ an -- oder ueberschreibt sie."""
    _angemeldet(provider, session)

    prompt = provider.prompts.save(payload.name, payload.text)
    # Der Agent traegt den Prompt-Text in sich. Ohne dieses Vergessen
    # antwortete er weiter mit der alten Fassung.
    provider.vergiss_agenten(payload.name)

    return PromptDetail(**_summary(prompt).model_dump(), text=prompt.text)


@router.delete(
    "/{name}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete a prompt",
)
async def delete_prompt(
    name: str,
    provider: ProviderDep,
    session: SitzungHeader = None,
) -> Response:
    _angemeldet(provider, session)

    # Das Default darf nicht weg: ohne es haette jeder Chat ohne eigene
    # Wahl keine Persona mehr, und das faellt erst beim naechsten Turn auf.
    if name == provider.settings.default_prompt:
        raise ValidationError(
            f"{name!r} is the default prompt and cannot be deleted. "
            f"Point DEFAULT_PROMPT at another one first."
        )

    if not provider.prompts.delete(name):
        raise ValidationError(f"Prompt {name!r} does not exist.")

    provider.vergiss_agenten(name)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{name}", response_model=PromptDetail, summary="A prompt verbatim")
async def get_prompt(name: str, provider: ProviderDep) -> PromptDetail:
    """Der Rohtext -- mit Platzhaltern, so wie er auf der Platte steht."""
    prompt = provider.prompts.get(name)
    return PromptDetail(
        **_summary(prompt).model_dump(), text=provider.prompts.raw(name)
    )


def _summary(prompt: Prompt) -> PromptSummary:
    return PromptSummary(
        name=prompt.name,
        title=prompt.title,
        variables=list(prompt.variables),
        length=len(prompt.text),
    )
