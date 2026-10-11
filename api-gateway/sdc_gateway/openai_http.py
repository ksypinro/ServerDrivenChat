"""Authenticated provider facade. All durable state, routing and authority belong to the server."""
import asyncio
import json
import re
import time

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.security import HTTPBearer

from .openai_profile import (ChatRequest, ResponsesRequest, ProfileError, normalize, response_id,
                             response_object, response_events, chat_object, chat_events)
from .openai_contract import (OpenAIErrorEnvelope, ServiceModel, ServiceModels,
                              ChatCompletion, ResponseObject, STREAM_RESPONSE)

PROFILE_HEADERS = {"x-sdc-profile": "sdc-openai-v1", "x-sdc-usage-source": "estimated",
                   "x-sdc-stream-delivery": "terminal-buffered", "cache-control": "no-store"}
GENERATION_HEADERS = {"parameters": [
    {"in": "header", "name": "Idempotency-Key", "required": True, "schema": {"type": "string", "pattern": "^[A-Za-z0-9._:-]{1,128}$"}},
    {"in": "header", "name": "X-SDC-Context-Mode", "required": False, "schema": {"type": "string", "enum": ["exclusive", "shared-task"], "default": "exclusive"}}
]}
REPLAY_PARAMETERS = {"parameters": [
    {"in": "query", "name": "stream", "schema": {"type": "boolean", "default": False}},
    {"in": "query", "name": "starting_after", "schema": {"type": "integer", "minimum": -1, "maximum": 9999999}},
    {"in": "header", "name": "Last-Event-ID", "schema": {"type": "string"}}
]}


def error_response(message, code, status, param=None):
    kind = "authentication_error" if status == 401 else "rate_limit_error" if status == 429 else "server_error" if status >= 500 else "invalid_request_error"
    return JSONResponse({"error": {"message": message, "type": kind, "param": param, "code": code}}, status_code=status, headers=PROFILE_HEADERS)


class ProviderCapacity:
    """Share first-party relay capacity; retain the slot through the complete SSE response."""
    def __init__(self, app, reserve, release):
        self.app, self.reserve, self.release = app, reserve, release

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith("/openai/v1/"):
            return await self.app(scope, receive, send)
        control = scope["path"].endswith("/cancel")
        if not self.reserve(control):
            return await error_response("Gateway capacity is full", "rate_limit_exceeded", 429)(scope, receive, send)
        try:
            await self.app(scope, receive, send)
        finally:
            self.release(control)


def mount_openai(app, client, reserve, release):
    def auth(request: Request, credentials=Depends(HTTPBearer(auto_error=False))):
        value = request.headers.get("authorization", "")
        if not re.fullmatch(r"Bearer [^\s]+", value):
            raise ProfileError("SDC bearer credential is required", "unauthorized", 401)
        return {"authorization": value, "accept-encoding": "identity"}

    router = APIRouter(prefix="/openai/v1", tags=["SDC OpenAI profile"],
                      dependencies=[Depends(auth)],
                      responses={status: {"model": OpenAIErrorEnvelope} for status in (400, 401, 403, 404, 408, 409, 410, 413, 415, 422, 429, 501, 502, 504)})
    app.add_middleware(ProviderCapacity, reserve=reserve, release=release)

    @app.exception_handler(ProfileError)
    async def profile_error(_, exc):
        return error_response(exc.message, exc.code, exc.status, exc.param)

    async def upstream(request, path, method="GET", body=None, key=None):
        headers = auth(request)
        if key is not None:
            headers["idempotency-key"] = key
        request_id = request.headers.get("x-request-id", "")
        if re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", request_id):
            headers["x-request-id"] = request_id
        try:
            async with client.stream(method, "/v2/public" + path, headers=headers, json=body) as response:
                parts, size = [], 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > 36 * 1024 * 1024:
                        raise ProfileError("Server response exceeded its bound", "upstream_error", 502)
                    parts.append(chunk)
                data = json.loads(b"".join(parts))
                if not response.is_success:
                    error = data.get("error", {})
                    raise ProfileError(error.get("message", "Server request failed"), error.get("code", "upstream_error").lower(), response.status_code)
                return data
        except (httpx.HTTPError, ValueError, RecursionError):
            raise ProfileError("Server request could not be verified; retry with the original key", "upstream_error", 502) from None

    def no_query(request, supported=()):
        if set(request.query_params) - set(supported):
            raise ProfileError("Unsupported query parameter", param="query")

    def retry_key(request):
        key = request.headers.get("idempotency-key", "")
        if not re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", key):
            raise ProfileError("A stable Idempotency-Key is required for generation retries", "idempotency_key_required", 400)
        return key

    def model_alias(alias):
        return {"id": alias["id"], "object": "model", "created": 0, "owned_by": "sdc",
                "sdc": {"profile": "sdc-openai-v1", "usage_source": "estimated", "created_unknown": True}}

    @router.get("/models", response_model=ServiceModels)
    async def models(request: Request):
        no_query(request)
        result = await upstream(request, "/models")
        return JSONResponse({"object": "list", "data": [model_alias(m) for m in result["models"] if m["id"] == "sdc-default"]}, headers=PROFILE_HEADERS)

    @router.get("/models/{model}", response_model=ServiceModel)
    async def model(request: Request, model: str):
        no_query(request)
        if model != "sdc-default":
            raise ProfileError("Service model alias does not exist", "model_not_found", 404, "model")
        return JSONResponse(model_alias(await upstream(request, "/models/sdc-default")), headers=PROFILE_HEADERS)

    async def admit(request, body):
        no_query(request)
        key = retry_key(request)
        if body.model != "sdc-default":
            raise ProfileError("Service model alias does not exist", "model_not_found", 404, "model")
        try:
            normalized = normalize(body, request.headers.get("x-sdc-context-mode", "exclusive"))
        except (TypeError, ValueError, KeyError, RecursionError):
            raise ProfileError("Invalid request content", "invalid_request") from None
        return await upstream(request, "/generations", "POST", normalized, key)

    async def finished(request, generation):
        # The server's durable deadline reconciler settles independently of this gateway/request.
        end = time.monotonic() + 635
        while not generation.get("result"):
            if time.monotonic() >= end:
                raise ProfileError("Response is still pending; retrieve or retry its original identity", "response_pending", 504)
            # Leave rate capacity for per-frame authority checks after a long native turn.
            await asyncio.sleep(2)
            generation = await upstream(request, "/generations/" + generation["generationId"])
        # Recheck the live credential before returning any buffered result.
        return await upstream(request, "/generations/" + generation["generationId"])

    async def keepalive(request, generation):
        waiting = asyncio.create_task(finished(request, generation))
        try:
            while not waiting.done():
                _, pending = await asyncio.wait([waiting], timeout=15)
                if pending:
                    await upstream(request, "/identity")
                    yield None
            yield await waiting
        finally:
            if not waiting.done():
                waiting.cancel()
            await asyncio.gather(waiting, return_exceptions=True)

    def frame(value, event=None, identifier=None):
        prefix = ("id: " + identifier + "\n" if identifier is not None else "") + ("event: " + event + "\n" if event else "")
        return prefix + "data: " + json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n\n"

    @router.post("/chat/completions", response_model=ChatCompletion, responses=STREAM_RESPONSE, openapi_extra=GENERATION_HEADERS)
    async def chat(request: Request, body: ChatRequest):
        generation = await admit(request, body)
        if not body.stream:
            return JSONResponse(chat_object(await finished(request, generation)), headers=PROFILE_HEADERS)
        async def stream():
            try:
                async for settled in keepalive(request, generation):
                    if settled is None:
                        yield ": heartbeat\n\n"
                for value in chat_events(settled, (body.stream_options or {}).get("include_usage", False)):
                    await upstream(request, "/identity")
                    yield frame(value)
                await upstream(request, "/identity")
                yield "data: [DONE]\n\n"
            except ProfileError as exc:
                yield frame({"error": {"message": exc.message, "type": "server_error", "code": exc.code, "param": exc.param}})
        return StreamingResponse(stream(), media_type="text/event-stream", headers={**PROFILE_HEADERS, "x-accel-buffering": "no"})

    def cursor(request, identifier):
        value = request.query_params.get("starting_after", "-1")
        last = request.headers.get("last-event-id")
        if last is not None:
            if "starting_after" in request.query_params or not last.startswith(identifier + ":"):
                raise ProfileError("Replay cursor must address this response", "invalid_cursor", 400)
            value = last[len(identifier) + 1:]
        if not re.fullmatch(r"-1|0|[1-9][0-9]{0,6}", value):
            raise ProfileError("Invalid event replay cursor", "invalid_cursor", 400)
        return int(value)

    def response_stream(request, generation, after=-1):
        async def stream():
            try:
                # Created/progress records are deterministic even when replayed after completion.
                for sequence, value in enumerate(response_events({**generation, "result": None})):
                    if sequence > after:
                        await upstream(request, "/identity")
                        yield frame({**value, "sequence_number": sequence}, value["type"], "resp_" + generation["generationId"] + ":" + str(sequence))
                async for settled in keepalive(request, generation):
                    if settled is None:
                        yield ": heartbeat\n\n"
                for sequence, value in enumerate(response_events(settled)):
                    if sequence <= 1 or sequence <= after:
                        continue
                    await upstream(request, "/identity")
                    yield frame({**value, "sequence_number": sequence}, value["type"], "resp_" + generation["generationId"] + ":" + str(sequence))
            except ProfileError as exc:
                yield frame({"type": "error", "code": exc.code, "message": exc.message, "param": exc.param}, "error")
        return StreamingResponse(stream(), media_type="text/event-stream", headers={**PROFILE_HEADERS, "x-accel-buffering": "no"})

    @router.post("/responses", response_model=ResponseObject, responses=STREAM_RESPONSE, openapi_extra=GENERATION_HEADERS)
    async def responses(request: Request, body: ResponsesRequest):
        if request.headers.get("last-event-id"):
            raise ProfileError("Use response retrieval for event replay", "invalid_cursor", 400)
        generation = await admit(request, body)
        if body.stream:
            return response_stream(request, generation)
        if not body.background:
            generation = await finished(request, generation)
        return JSONResponse(response_object(generation), headers=PROFILE_HEADERS)

    @router.get("/responses/{identifier}", response_model=ResponseObject, responses=STREAM_RESPONSE, openapi_extra=REPLAY_PARAMETERS)
    async def retrieve(request: Request, identifier: str):
        no_query(request, ("stream", "starting_after"))
        stream = request.query_params.get("stream", "false")
        if stream not in ("true", "false"):
            raise ProfileError("stream must be true or false", param="stream")
        generation = await upstream(request, "/generations/" + response_id(identifier))
        after = cursor(request, identifier)
        if stream == "false":
            if after != -1:
                raise ProfileError("Replay cursor requires streaming", "invalid_cursor", 400)
            return JSONResponse(response_object(generation), headers=PROFILE_HEADERS)
        if generation.get("result") and after >= sum(1 for _ in response_events(generation)):
            raise ProfileError("Replay cursor is ahead of this response", "invalid_cursor", 409)
        if not generation.get("result") and after > 1:
            raise ProfileError("Terminal replay is not yet available", "response_pending", 409)
        return response_stream(request, generation, after)

    @router.post("/responses/{identifier}/cancel", response_model=ResponseObject)
    async def cancel(request: Request, identifier: str):
        no_query(request)
        raw = await request.body()
        if raw not in (b"", b"{}"):
            raise ProfileError("Cancellation takes no options", param="body")
        generation = await upstream(request, "/generations/" + response_id(identifier) + "/cancel", "POST", {})
        return JSONResponse(response_object(generation), headers=PROFILE_HEADERS)

    app.include_router(router)
