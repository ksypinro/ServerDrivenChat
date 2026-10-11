"""Anthropic-shaped HTTP over the existing durable SDC server API."""
import asyncio
import json
import re
import uuid
import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from .anthropic_profile import AnthropicError, AnthropicRequest, CountTokensRequest, encode, normalize
from .anthropic_contract import AnthropicErrorEnvelope, AnthropicMessage, AnthropicModel, AnthropicModelList, AnthropicTokenCount

HEADERS = {"x-sdc-profile": "sdc-anthropic-v1", "x-sdc-usage-source": "estimated",
           "x-sdc-stream-delivery": "terminal-buffered", "cache-control": "no-store"}
VERSION_PARAMETER = {"in": "header", "name": "anthropic-version", "required": True,
                     "schema": {"type": "string", "enum": ["2023-06-01"]}}
CONTEXT_PARAMETER = {"in": "header", "name": "X-SDC-Context-Mode", "required": False,
                     "schema": {"type": "string", "enum": ["exclusive", "shared-task"], "default": "exclusive"}}
KEY_PARAMETER = {"in": "header", "name": "Idempotency-Key", "required": True,
                 "schema": {"type": "string", "pattern": "^[A-Za-z0-9._:-]{1,128}$"}}
MODEL_PARAMETERS = {"parameters": [VERSION_PARAMETER,
    {"in": "query", "name": "after_id", "schema": {"type": "string", "enum": ["sdc-default"]}},
    {"in": "query", "name": "before_id", "schema": {"type": "string", "enum": ["sdc-default"]}},
    {"in": "query", "name": "limit", "schema": {"type": "integer", "minimum": 1, "maximum": 1000}}]}
MESSAGE_PARAMETERS = {"parameters": [VERSION_PARAMETER, CONTEXT_PARAMETER, KEY_PARAMETER]}
COUNT_PARAMETERS = {"parameters": [VERSION_PARAMETER, CONTEXT_PARAMETER]}


def error_type(status):
    return "authentication_error" if status == 401 else "permission_error" if status == 403 else "not_found_error" if status == 404 else "rate_limit_error" if status == 429 else "api_error" if status >= 500 else "invalid_request_error"


def error_response(message, code, status, request_id=None):
    request_id = request_id or "req_" + uuid.uuid4().hex
    return JSONResponse({"type": "error", "error": {"type": error_type(status), "message": message}, "request_id": request_id, "sdc": {"code": code, "usage_source": "estimated"}}, status_code=status, headers={**HEADERS, "request-id": request_id})


def mount_anthropic(app, client, reserve, release):
    class RequestId:
        def __init__(self, inner): self.inner = inner
        async def __call__(self, scope, receive, send):
            if scope["type"] != "http" or not scope["path"].startswith("/anthropic/v1/"):
                return await self.inner(scope, receive, send)
            headers = list(scope["headers"])
            existing = next((value.decode("latin1") for name, value in headers if name.lower() == b"x-request-id"), "")
            identifier = existing if re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", existing) else "req_" + uuid.uuid4().hex
            headers = [(name, value) for name, value in headers if name.lower() != b"x-request-id"]
            headers.append((b"x-request-id", identifier.encode()))
            scope["headers"] = headers
            async def send_with_id(message):
                if message["type"] == "http.response.start":
                    replaced = {b"request-id", *(name.encode() for name in HEADERS)}
                    message["headers"][:] = [(name, value) for name, value in message["headers"] if name.lower() not in replaced]
                    message["headers"].append((b"request-id", identifier.encode()))
                    message["headers"].extend((name.encode(), value.encode()) for name, value in HEADERS.items())
                await send(message)
            await self.inner(scope, receive, send_with_id)

    class Capacity:
        def __init__(self, inner): self.inner = inner
        async def __call__(self, scope, receive, send):
            if scope["type"] != "http" or not scope["path"].startswith("/anthropic/v1/"):
                return await self.inner(scope, receive, send)
            if not reserve(False):
                return await error_response("Gateway capacity is full", "rate_limit_exceeded", 429)(scope, receive, send)
            try: await self.inner(scope, receive, send)
            finally: release(False)

    app.add_middleware(Capacity)
    app.add_middleware(RequestId)
    router = APIRouter(prefix="/anthropic/v1", tags=["SDC Anthropic profile"],
                       responses={status: {"model": AnthropicErrorEnvelope} for status in (400, 401, 403, 404, 408, 409, 410, 413, 415, 422, 429, 502, 504)})

    def credential(request):
        keys = request.headers.getlist("x-api-key")
        auths = request.headers.getlist("authorization")
        versions = request.headers.getlist("anthropic-version")
        key = request.headers.get("x-api-key")
        bearer = request.headers.get("authorization", "")
        if len(keys) > 1 or len(auths) > 1 or (len(keys) == 1) == (len(auths) == 1) or len(keys) == 1 and not key or len(auths) == 1 and not re.fullmatch(r"Bearer [^\s]+", bearer):
            raise AnthropicError("Supply exactly one SDC key using x-api-key or Bearer", "unauthorized", 401)
        if len(versions) != 1 or versions[0] != "2023-06-01":
            raise AnthropicError("anthropic-version 2023-06-01 is required", "unsupported_version", 400)
        if request.headers.get("anthropic-beta"):
            raise AnthropicError("Anthropic beta features are unsupported", "unsupported_beta", 400)
        return {"authorization": bearer or "Bearer " + key, "accept-encoding": "identity"}

    async def upstream(request, path, method="GET", body=None, key=None):
        headers = credential(request)
        if key: headers["idempotency-key"] = key
        try:
            async with client.stream(method, "/v2/public" + path, headers=headers, json=body) as response:
                raw = await response.aread()
                if len(raw) > 36 * 1024 * 1024: raise AnthropicError("Server response exceeded its bound", "upstream_error", 502)
                data = json.loads(raw)
                if not isinstance(data, dict):
                    raise AnthropicError("Server returned an invalid response", "upstream_error", 502)
                if not response.is_success:
                    err = data.get("error", {})
                    if not isinstance(err, dict):
                        raise AnthropicError("Server returned an invalid error", "upstream_error", 502)
                    message, code = err.get("message"), err.get("code")
                    if not isinstance(message, str) or not isinstance(code, str):
                        raise AnthropicError("Server returned an invalid error", "upstream_error", 502)
                    raise AnthropicError(message, code.lower(), response.status_code)
                return data
        except AnthropicError: raise
        except (httpx.HTTPError, ValueError, RecursionError):
            raise AnthropicError("Server response could not be verified; retry with the original key", "upstream_error", 502) from None

    async def settled(request, generation):
        end = time.monotonic() + 635
        while not generation.get("result"):
            if time.monotonic() >= end: raise AnthropicError("Response remains pending; retry with original key", "response_pending", 504)
            await asyncio.sleep(2)
            generation = await upstream(request, "/generations/" + generation["generationId"])
        return await upstream(request, "/generations/" + generation["generationId"])

    def retry_key(request):
        keys = request.headers.getlist("idempotency-key")
        if len(keys) != 1: raise AnthropicError("Exactly one stable Idempotency-Key is required", "idempotency_key_required", 400)
        value = keys[0]
        if not re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", value): raise AnthropicError("Stable Idempotency-Key is required", "idempotency_key_required", 400)
        return value

    def no_query(request):
        if request.query_params:
            raise AnthropicError("Unsupported query parameter")

    @router.get("/models", response_model=AnthropicModelList, openapi_extra=MODEL_PARAMETERS)
    async def models(request: Request):
        query = request.query_params
        if any(name not in {"after_id", "before_id", "limit"} for name in query) or any(len(query.getlist(name)) > 1 for name in query):
            raise AnthropicError("Model pagination parameter is unsupported")
        if "after_id" in query and "before_id" in query:
            raise AnthropicError("Select one model cursor")
        for name in ("after_id", "before_id"):
            if name in query and query[name] != "sdc-default":
                raise AnthropicError("Model cursor is unknown")
        if "limit" in query and (not re.fullmatch(r"[1-9][0-9]{0,3}", query["limit"]) or int(query["limit"]) > 1000):
            raise AnthropicError("Model page limit must be 1–1000")
        available = await upstream(request, "/models")
        aliases = available.get("models")
        if not isinstance(aliases, list):
            raise AnthropicError("Server returned an invalid model list", "upstream_error", 502)
        created = datetime(1970, 1, 1, tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
        item = {"type": "model", "id": "sdc-default", "display_name": "SDC default", "created_at": created, "sdc": {"profile": "sdc-anthropic-v1", "vendor_model": None, "created_unknown": True, "usage_source": "estimated"}}
        visible = any(isinstance(alias, dict) and alias.get("id") == "sdc-default" for alias in aliases) and "after_id" not in query and "before_id" not in query
        return {"data": [item] if visible else [], "has_more": False, "first_id": "sdc-default" if visible else None, "last_id": "sdc-default" if visible else None}

    @router.get("/models/{model}", response_model=AnthropicModel, openapi_extra={"parameters": [VERSION_PARAMETER]})
    async def model(request: Request, model: str):
        no_query(request)
        if model != "sdc-default": raise AnthropicError("Service model alias does not exist", "model_not_found", 404)
        await upstream(request, "/models/sdc-default")
        return {"type": "model", "id": model, "display_name": "SDC default", "created_at": "1970-01-01T00:00:00Z", "sdc": {"profile": "sdc-anthropic-v1", "vendor_model": None, "created_unknown": True, "usage_source": "estimated"}}

    @router.post("/messages/count_tokens", response_model=AnthropicTokenCount, openapi_extra=COUNT_PARAMETERS)
    async def count_tokens(request: Request, body: CountTokensRequest):
        no_query(request)
        if body.metadata: raise AnthropicError("Opaque metadata is unsupported")
        normalized = normalize(body, request.headers.get("x-sdc-context-mode", "exclusive"), generation=False)
        result = await upstream(request, "/input-counts", "POST", normalized)
        return {"input_tokens": result["inputUnits"], "sdc": result}

    @router.post("/messages", response_model=AnthropicMessage, responses={200: {"description": "Messages JSON or terminal-buffered Anthropic SSE events"}}, openapi_extra=MESSAGE_PARAMETERS)
    async def messages(request: Request, body: AnthropicRequest):
        no_query(request)
        if body.metadata: raise AnthropicError("Opaque metadata is unsupported")
        key = retry_key(request)
        normalized = normalize(body, request.headers.get("x-sdc-context-mode", "exclusive"))
        estimate = None
        if body.stream:
            estimate = await upstream(request, "/input-counts", "POST", {k: v for k, v in normalized.items() if k != "budget"} | {"budget": {"inputUnits": 32768, "outputUnits": 8192, "deadlineSeconds": 600}})
        generation = await upstream(request, "/generations", "POST", normalized, key)
        if not body.stream:
            final = encode(await settled(request, generation))
            return final

        async def stream():
            try:
                current = generation
                provisional_id = "msg_" + current["generationId"].replace("-", "")
                input_tokens = estimate["inputUnits"] if estimate else 0
                provisional = {"id": provisional_id, "type": "message", "role": "assistant", "model": "sdc-default", "content": [], "stop_reason": None, "stop_sequence": None, "usage": {"input_tokens": input_tokens, "output_tokens": 0, "sdc": {"source": "estimated", "estimator": estimate["estimator"] if estimate else "sdc-text-v1", "scope": estimate["scope"] if estimate else "stream-interim", "hidden_native_context": "unknown"}}}
                await upstream(request, "/identity")
                yield "event: message_start\ndata: " + json.dumps({"type": "message_start", "message": provisional}, separators=(",", ":")) + "\n\n"
                deadline, next_ping = time.monotonic() + 635, time.monotonic() + 15
                while not current.get("result"):
                    if time.monotonic() >= deadline: raise AnthropicError("Response remains pending; retry with original key", "response_pending", 504)
                    await asyncio.sleep(2)
                    current = await upstream(request, "/generations/" + current["generationId"])
                    if time.monotonic() >= next_ping:
                        await upstream(request, "/identity")
                        yield "event: ping\ndata: {\"type\":\"ping\"}\n\n"
                        next_ping = time.monotonic() + 15
                committed = await upstream(request, "/generations/" + current["generationId"])
                final = encode(committed)
                for index, block in enumerate(final["content"]):
                    if block["type"] == "text":
                        await upstream(request, "/identity")
                        yield "event: content_block_start\ndata: " + json.dumps({"type": "content_block_start", "index": index, "content_block": {"type": "text", "text": ""}}) + "\n\n"
                        for offset in range(0, len(block["text"]), 2048):
                            await upstream(request, "/identity")
                            yield "event: content_block_delta\ndata: " + json.dumps({"type": "content_block_delta", "index": index, "delta": {"type": "text_delta", "text": block["text"][offset:offset + 2048]}}, ensure_ascii=False) + "\n\n"
                    else:
                        await upstream(request, "/identity")
                        yield "event: content_block_start\ndata: " + json.dumps({"type": "content_block_start", "index": index, "content_block": {"type": "tool_use", "id": block["id"], "name": block["name"], "input": {}}}) + "\n\n"
                        encoded = json.dumps(block["input"], ensure_ascii=False, separators=(",", ":"))
                        for offset in range(0, len(encoded), 2048):
                            await upstream(request, "/identity")
                            yield "event: content_block_delta\ndata: " + json.dumps({"type": "content_block_delta", "index": index, "delta": {"type": "input_json_delta", "partial_json": encoded[offset:offset + 2048]}}, ensure_ascii=False) + "\n\n"
                    await upstream(request, "/identity")
                    yield "event: content_block_stop\ndata: " + json.dumps({"type": "content_block_stop", "index": index}) + "\n\n"
                await upstream(request, "/identity")
                yield "event: message_delta\ndata: " + json.dumps({"type": "message_delta", "delta": {"stop_reason": final["stop_reason"], "stop_sequence": None}, "usage": {"output_tokens": final["usage"]["output_tokens"]}}) + "\n\n"
                await upstream(request, "/identity")
                yield "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
            except AnthropicError as exc:
                yield "event: error\ndata: " + json.dumps({"type": "error", "error": {"type": error_type(exc.status), "message": exc.message}, "request_id": request.headers.get("x-request-id"), "sdc": {"code": exc.code}}) + "\n\n"
        return StreamingResponse(stream(), media_type="text/event-stream", headers={**HEADERS, "x-accel-buffering": "no"})

    @app.exception_handler(AnthropicError)
    async def anthropic_error(request, exc):
        request_id = request.headers.get("x-request-id", "")
        if not re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", request_id): request_id = "req_" + uuid.uuid4().hex
        return error_response(exc.message, exc.code, exc.status, request_id)

    app.include_router(router)
