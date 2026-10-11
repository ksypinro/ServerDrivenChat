"""Typed successful response contracts for the restricted Anthropic profile."""
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class AnthropicTextBlock(BaseModel):
    type: Literal["text"]
    text: str


class AnthropicToolUseBlock(BaseModel):
    type: Literal["tool_use"]
    id: str
    name: str
    input: dict


AnthropicContent = Annotated[AnthropicTextBlock | AnthropicToolUseBlock, Field(discriminator="type")]


class AnthropicUsage(BaseModel):
    input_tokens: int
    output_tokens: int
    sdc: dict


class AnthropicMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    type: Literal["message"]
    role: Literal["assistant"]
    model: Literal["sdc-default"]
    content: list[AnthropicContent]
    stop_reason: Literal["end_turn", "tool_use", "max_tokens"] | None
    stop_sequence: None
    usage: AnthropicUsage


class AnthropicModel(BaseModel):
    model_config = ConfigDict(extra="allow")
    type: Literal["model"]
    id: Literal["sdc-default"]
    display_name: str
    created_at: datetime
    sdc: dict


class AnthropicModelList(BaseModel):
    data: list[AnthropicModel]
    has_more: bool
    first_id: str | None
    last_id: str | None


class AnthropicTokenCount(BaseModel):
    input_tokens: int
    sdc: dict


class AnthropicErrorDetail(BaseModel):
    type: str
    message: str


class AnthropicErrorEnvelope(BaseModel):
    type: Literal["error"]
    error: AnthropicErrorDetail
    request_id: str
    sdc: dict
