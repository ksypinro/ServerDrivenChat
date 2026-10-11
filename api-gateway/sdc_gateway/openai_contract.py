"""Documented JSON response shapes for the explicitly restricted SDC profile."""
from typing import Literal

from pydantic import BaseModel, JsonValue


class OpenAIError(BaseModel):
    message: str
    type: str
    param: str | None = None
    code: str | None = None


class OpenAIErrorEnvelope(BaseModel):
    error: OpenAIError


class ServiceModel(BaseModel):
    id: Literal["sdc-default"]
    object: Literal["model"]
    created: Literal[0]
    owned_by: Literal["sdc"]
    sdc: dict[str, JsonValue]


class ServiceModels(BaseModel):
    object: Literal["list"]
    data: list[ServiceModel]


class ChatUsage(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    prompt_tokens_details: None
    completion_tokens_details: None
    sdc: dict[str, JsonValue]


class ResponseUsage(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int
    input_tokens_details: None
    output_tokens_details: None
    sdc: dict[str, JsonValue]


class ChatChoice(BaseModel):
    index: Literal[0]
    message: dict[str, JsonValue]
    finish_reason: Literal["stop", "length", "tool_calls"]
    logprobs: None


class ChatCompletion(BaseModel):
    id: str
    object: Literal["chat.completion"]
    created: int
    model: Literal["sdc-default"]
    choices: list[ChatChoice]
    usage: ChatUsage
    sdc: dict[str, JsonValue]


class ResponseObject(BaseModel):
    id: str
    object: Literal["response"]
    created_at: int
    completed_at: None
    status: Literal["queued", "in_progress", "completed", "incomplete", "failed", "cancelled"]
    background: bool
    model: Literal["sdc-default"]
    output: list[dict[str, JsonValue]]
    error: dict[str, JsonValue] | None
    incomplete_details: dict[str, JsonValue] | None
    instructions: str
    max_output_tokens: int
    previous_response_id: str | None
    store: Literal[True]
    parallel_tool_calls: bool
    tool_choice: str | dict[str, JsonValue]
    tools: list[dict[str, JsonValue]]
    text: dict[str, JsonValue]
    truncation: Literal["disabled"]
    metadata: dict[str, JsonValue]
    usage: ResponseUsage | None
    sdc: dict[str, JsonValue]


STREAM_RESPONSE = {200: {"description": "JSON response, or terminal-buffered SSE when stream is true; see docs/openai-api-profile.md",
                         "content": {"text/event-stream": {"schema": {"type": "string"}}}}}
