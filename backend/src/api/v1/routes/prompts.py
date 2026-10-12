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

SessionHeader = Annotated[str | None, Header(alias="X-Session-Id")]


def _signed_in(provider: ProviderDep, session: str | None) -> None:
    if provider.sessions.fetch(session) is None:
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
    session: SessionHeader = None,
) -> PromptDetail:
    _signed_in(provider, session)

    prompt = provider.prompts.save(payload.name, payload.text)
    provider.forget_agents(payload.name)

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
    session: SessionHeader = None,
) -> Response:
    _signed_in(provider, session)

    if name == provider.settings.default_prompt:
        raise ValidationError(
            f"{name!r} is the default prompt and cannot be deleted. "
            f"Point DEFAULT_PROMPT at another one first."
        )

    if not provider.prompts.delete(name):
        raise ValidationError(f"Prompt {name!r} does not exist.")

    provider.forget_agents(name)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{name}", response_model=PromptDetail, summary="A prompt verbatim")
async def get_prompt(name: str, provider: ProviderDep) -> PromptDetail:
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
