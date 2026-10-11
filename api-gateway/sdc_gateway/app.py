import asyncio
from contextlib import asynccontextmanager
import json
import os
import re
from urllib.parse import quote, urlsplit

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from .openai_http import mount_openai, error_response
from .anthropic_http import mount_anthropic, error_response as anthropic_error_response

from .models import (Prompt, CredentialRequest, CredentialIssued, Control, Decision, Operation,
                     SignInStart, SignInExchange, SignInRefresh, PairingStart, PairingConfirm, AttachmentCommit, Transcript,
                     Health, Identity, Capabilities, Sessions, Models, ModelAlias, SessionDetails, SessionCapabilities,
                     Credentials, Revoked, DeviceRevoked, ControlRecorded, ApprovalRecorded, CommandReceipt, Snapshot,
                     SignInStarted, SignInTokens, PairingStarted, PairingConfirmed, AttachmentUploaded, AttachmentCommitted, ApiError, GenerationRequest, Generation, Conversation, InputCountRequest, InputCount)

MAX_JSON_BYTES = 1_048_576
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
MAX_RESPONSE_BYTES = 36 * 1024 * 1024
MAX_FRAME_BYTES = 1_048_576 + 4096
MAX_RELAYS = 64
MAX_CONTROL_RELAYS = 32
bearer = HTTPBearer(auto_error=True)

class BodyLimit:
    """Bound bytes before FastAPI/Pydantic decode, including chunked requests."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope["headers"])
        limit = MAX_ATTACHMENT_BYTES if scope["path"] == "/api/v1/attachments" else MAX_JSON_BYTES
        error = None
        if b"content-encoding" in headers:
            error = (415, "UNSUPPORTED_ENCODING")
        raw_length = headers.get(b"content-length")
        if raw_length is not None:
            if not raw_length.isdigit():
                error = (400, "INVALID_LENGTH")
            elif int(raw_length) > limit:
                error = (413, "PAYLOAD_TOO_LARGE")
        chunks, size = [], 0
        if not error:
            try:
                async with asyncio.timeout(15):
                    while True:
                        frame = await receive()
                        if frame["type"] == "http.disconnect":
                            return
                        body = frame.get("body", b"")
                        size += len(body)
                        if size > limit:
                            error = (413, "PAYLOAD_TOO_LARGE")
                            break
                        chunks.append(body)
                        if not frame.get("more_body", False):
                            break
            except TimeoutError:
                error = (408, "REQUEST_TIMEOUT")
        if error:
            if scope["path"].startswith("/openai/v1/"):
                return await error_response("Request body is not supported", error[1].lower(), error[0])(scope, receive, send)
            if scope["path"].startswith("/anthropic/v1/"):
                return await anthropic_error_response("Request body is not supported", error[1].lower(), error[0])(scope, receive, send)
            return await JSONResponse({"error": {"code": error[1], "message": "Request body is not supported"}}, status_code=error[0])(scope, receive, send)
        delivered = False
        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
            return await receive()
        await self.app(scope, replay, send)


def create_app(server_url: str | None = None, transport: httpx.AsyncBaseTransport | None = None) -> FastAPI:
    upstream_url = server_url or os.environ.get("SDC_SERVER_URL", "http://127.0.0.1:3000")
    parsed = urlsplit(upstream_url)
    trusted_http_origins = {origin.strip().rstrip("/") for origin in os.environ.get("SDC_TRUSTED_HTTP_UPSTREAMS", "").split(",") if origin.strip()}
    loopback_http = parsed.scheme == "http" and parsed.hostname in ("localhost", "127.0.0.1", "::1")
    explicitly_trusted_http = parsed.scheme == "http" and f"{parsed.scheme}://{parsed.netloc}" in trusted_http_origins
    if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/") or not parsed.hostname or not (parsed.scheme == "https" or loopback_http or explicitly_trusted_http):
        raise ValueError("SDC_SERVER_URL must be an HTTPS origin, loopback HTTP origin, or explicitly trusted private-network HTTP origin")
    client = httpx.AsyncClient(base_url=upstream_url.rstrip("/"), transport=transport, follow_redirects=False,
                               trust_env=False, timeout=httpx.Timeout(35, connect=5, pool=5, write=10),
                               limits=httpx.Limits(max_connections=128, max_keepalive_connections=32))
    active_relays = 0
    active_controls = 0

    @asynccontextmanager
    async def lifespan(_):
        yield
        await client.aclose()

    app = FastAPI(responses={status: {"model": ApiError} for status in (400, 401, 403, 404, 408, 409, 410, 413, 415, 422, 429, 501, 502)}, title="Server Driven Chat REST", version="0.1.0", lifespan=lifespan,
                  description="Authenticated server-owned task API plus restricted OpenAI-shaped and Anthropic-shaped SDC profiles. Durable state, routing and authority belong to the TypeScript server; provider formats are gateway encodings only.")
    app.add_middleware(BodyLimit)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        # Pydantic input/errors can contain credential or private prompt values.
        if request.url.path.startswith("/openai/v1/"):
            return error_response("Request does not match the supported SDC schema", "invalid_request", 422)
        if request.url.path.startswith("/anthropic/v1/"):
            return anthropic_error_response("Request does not match the supported SDC schema", "invalid_request", 422)
        return JSONResponse({"error": {"code": "INVALID_REQUEST", "message": "Request does not match the declared supported schema", "fields": [".".join(map(str, e["loc"])) for e in exc.errors()]}}, status_code=422)

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        if request.url.path.startswith("/openai/v1/"):
            return error_response(str(exc.detail), "gateway_error", exc.status_code)
        if request.url.path.startswith("/anthropic/v1/"):
            return anthropic_error_response(str(exc.detail), "gateway_error", exc.status_code)
        return JSONResponse({"error": {"code": "GATEWAY_ERROR", "message": str(exc.detail)}}, status_code=exc.status_code)

    def segment(value: str) -> str:
        if not re.fullmatch(r"[A-Za-z0-9._:-]{1,256}", value):
            raise HTTPException(422, "Invalid resource identifier")
        return quote(value, safe="")

    async def token(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> str:
        return credentials.credentials

    def headers(credential: str | None, incoming: Request) -> dict[str, str]:
        result = {"accept-encoding": "identity"}
        if credential:
            result["authorization"] = f"Bearer {credential}"
        request_id = incoming.headers.get("x-request-id", "")
        if re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", request_id):
            result["x-request-id"] = request_id
        return result

    async def relay(request: Request, path: str, credential: str | None, *, body=None, data: bytes | None = None, extra: dict | None = None) -> Response:
        nonlocal active_relays, active_controls
        control = path.endswith(("/controls", "/decisions", "/revoke"))
        if control:
            if active_controls >= MAX_CONTROL_RELAYS:
                raise HTTPException(429, "Gateway control capacity is full")
            active_controls += 1
        else:
            if active_relays >= MAX_RELAYS:
                raise HTTPException(429, "Gateway request capacity is full")
            active_relays += 1
        try:
            forwarded = headers(credential, request)
            forwarded.update(extra or {})
            try:
                async with client.stream(request.method, path, headers=forwarded, json=body, content=data) as upstream:
                    chunks, size = [], 0
                    async for chunk in upstream.aiter_bytes():
                        size += len(chunk)
                        if size > MAX_RESPONSE_BYTES:
                            raise HTTPException(502, "Upstream response exceeded the declared bound")
                        chunks.append(chunk)
                    response_body = b"".join(chunks)
                    response_type = upstream.headers.get("content-type", "application/json")
                    if "json" in response_type:
                        try:
                            json.loads(response_body)
                        except (ValueError, UnicodeError):
                            raise HTTPException(502, "Upstream returned invalid JSON") from None
                    elif not path.startswith("/v2/public/attachments/"):
                        raise HTTPException(502, "Upstream returned an unexpected response type")
                    copied = {k: v for k, v in upstream.headers.items() if k in ("location", "preference-applied", "x-request-id", "content-disposition", "x-attachment-sha256", "x-attachment-filename")}
                    copied["cache-control"] = "no-store"
                    return Response(response_body, status_code=upstream.status_code, media_type=response_type, headers=copied)
            except httpx.HTTPError:
                # No automatic retry: acceptance may have committed before the connection failed.
                raise HTTPException(502, "Server connection failed; retrieve the original operation or retry the identical idempotency key") from None
        finally:
            if control:
                active_controls -= 1
            else:
                active_relays -= 1

    @app.get("/api/v1/health", response_model=Health)
    async def health(request: Request):
        return await relay(request, "/v2/health", None)

    @app.get("/api/v1/identity", response_model=Identity)
    async def identity(request: Request, credential: str = Depends(token)):
        return await relay(request, "/v2/public/identity", credential)

    @app.get("/api/v1/capabilities", response_model=Capabilities)
    async def capabilities(request: Request, credential: str = Depends(token)):
        return await relay(request, "/v2/public/capabilities", credential)

    @app.get("/api/v1/sessions", response_model=Sessions)
    async def sessions(request: Request, credential: str = Depends(token)):
        return await relay(request, "/v2/public/sessions", credential)

    @app.get("/api/v1/models", response_model=Models)
    async def models(request: Request, credential: str = Depends(token)):
        return await relay(request, "/v2/public/models", credential)

    @app.get("/api/v1/models/{model_id}", response_model=ModelAlias)
    async def model(model_id: str, request: Request, credential: str = Depends(token)):
        return await relay(request, f"/v2/public/models/{segment(model_id)}", credential)

    @app.get("/api/v1/sessions/{session_id}", response_model=SessionDetails)
    async def session(session_id: str, request: Request, credential: str = Depends(token)):
        return await relay(request, f"/v2/public/sessions/{segment(session_id)}", credential)

    @app.get("/api/v1/sessions/{session_id}/capabilities", response_model=SessionCapabilities)
    async def session_capabilities(session_id: str, request: Request, credential: str = Depends(token)):
        return await relay(request, f"/v2/public/sessions/{segment(session_id)}/capabilities", credential)

    @app.post("/api/v1/credentials", response_model=CredentialIssued, status_code=201)
    async def create_credential(request: Request, body: CredentialRequest, credential: str = Depends(token)):
        return await relay(request, "/v2/public/credentials", credential, body=body.model_dump())

    @app.get("/api/v1/credentials", response_model=Credentials)
    async def credentials(request: Request, credential: str = Depends(token)):
        return await relay(request, "/v2/public/credentials", credential)

    @app.post("/api/v1/credentials/{credential_id}/revoke", response_model=Revoked)
    async def revoke_credential(credential_id: str, request: Request, credential: str = Depends(token)):
        return await relay(request, f"/v2/public/credentials/{segment(credential_id)}/revoke", credential, body={})

    @app.post("/api/v1/sessions/{session_id}/prompts", response_model=Operation, status_code=202, responses={200: {"model": Operation}, 409: {"description": "Conflict or outstanding native turn"}})
    async def prompt(session_id: str, body: Prompt, request: Request, credential: str = Depends(token),
                     idempotency_key: str = Header(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._:-]+$"),
                     prefer: str | None = Header(default=None, pattern=r"^wait=(0|[1-9][0-9]?)$")):
        extra = {"idempotency-key": idempotency_key}
        if prefer:
            extra["prefer"] = prefer
        return await relay(request, f"/v2/public/sessions/{segment(session_id)}/prompts", credential, body=body.model_dump(), extra=extra)

    @app.post("/api/v1/generations", response_model=Generation, status_code=202)
    async def generate(body: GenerationRequest, request: Request, credential: str = Depends(token),
                       idempotency_key: str = Header(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._:-]+$")):
        return await relay(request, "/v2/public/generations", credential,
                           body=body.model_dump(by_alias=True, exclude_none=True), extra={"idempotency-key": idempotency_key})

    @app.post("/api/v1/input-counts", response_model=InputCount)
    async def count_input(body: InputCountRequest, request: Request, credential: str = Depends(token)):
        value = {**body.model_dump(by_alias=True, exclude_none=True), "budget": {"inputUnits": 32768, "outputUnits": 8192, "deadlineSeconds": 600}, "background": False}
        return await relay(request, "/v2/public/input-counts", credential,
                           body=value)

    @app.get("/api/v1/generations/{generation_id}", response_model=Generation)
    async def generation(generation_id: str, request: Request, credential: str = Depends(token)):
        return await relay(request, f"/v2/public/generations/{segment(generation_id)}", credential)

    @app.post("/api/v1/generations/{generation_id}/cancel", response_model=Generation)
    async def cancel_generation(generation_id: str, request: Request, credential: str = Depends(token)):
        return await relay(request, f"/v2/public/generations/{segment(generation_id)}/cancel", credential, body={})

    @app.get("/api/v1/conversations/{conversation_id}", response_model=Conversation)
    async def conversation(conversation_id: str, request: Request, credential: str = Depends(token)):
        return await relay(request, f"/v2/public/conversations/{segment(conversation_id)}", credential)

    @app.get("/api/v1/operations/{operation_id}", response_model=Operation)
    async def operation(operation_id: str, request: Request, credential: str = Depends(token)):
        return await relay(request, f"/v2/public/operations/{segment(operation_id)}", credential)

    @app.get("/api/v1/sessions/{session_id}/snapshot", response_model=Snapshot)
    async def snapshot(session_id: str, request: Request, credential: str = Depends(token)):
        return await relay(request, f"/v2/public/sessions/{segment(session_id)}/snapshot", credential)

    @app.get("/api/v1/sessions/{session_id}/transcript", response_model=Transcript)
    async def transcript(session_id: str, request: Request, credential: str = Depends(token)):
        return await relay(request, f"/v2/public/sessions/{segment(session_id)}/transcript", credential)

    @app.post("/api/v1/sessions/{session_id}/controls", response_model=ControlRecorded, status_code=202)
    async def control(session_id: str, body: Control, request: Request, credential: str = Depends(token)):
        return await relay(request, f"/v2/public/sessions/{segment(session_id)}/controls", credential, body=body.model_dump(exclude_none=True))

    @app.post("/api/v1/sessions/{session_id}/approvals/{request_id}/decisions", response_model=ApprovalRecorded, status_code=202)
    async def decision(session_id: str, request_id: str, body: Decision, request: Request, credential: str = Depends(token)):
        return await relay(request, f"/v2/public/sessions/{segment(session_id)}/approvals/{segment(request_id)}/decisions", credential, body=body.model_dump())

    @app.get("/api/v1/sessions/{session_id}/commands/{command_id}", response_model=CommandReceipt)
    async def receipt(session_id: str, command_id: str, request: Request, credential: str = Depends(token)):
        return await relay(request, f"/v2/public/sessions/{segment(session_id)}/commands/{segment(command_id)}", credential)

    @app.post("/api/v1/devices/{device_id}/revoke", response_model=DeviceRevoked)
    async def revoke_device(device_id: str, request: Request, credential: str = Depends(token)):
        return await relay(request, f"/v2/public/devices/{segment(device_id)}/revoke", credential, body={})

    @app.get("/api/v1/sessions/{session_id}/events", response_class=StreamingResponse, responses={200: {"content": {"text/event-stream": {"schema": {"type": "string"}}}}})
    async def events(session_id: str, request: Request, credential: str = Depends(token),
                     after: int = 0, last_event_id: str | None = Header(default=None)):
        nonlocal active_relays
        if after < 0 or after > 9007199254740991 or last_event_id is not None and not re.fullmatch(r"(0|[1-9][0-9]{0,15})", last_event_id):
            raise HTTPException(422, "Invalid replay cursor")
        if active_relays >= MAX_RELAYS:
            raise HTTPException(429, "Gateway relay capacity is full")
        active_relays += 1
        forwarded = headers(credential, request)
        if last_event_id is not None:
            forwarded["last-event-id"] = last_event_id
        upstream = None
        try:
            upstream = await client.send(client.build_request("GET", f"/v2/public/sessions/{segment(session_id)}/events?after={after}", headers=forwarded), stream=True)
            if upstream.status_code != 200 or not upstream.headers.get("content-type", "").startswith("text/event-stream"):
                data = await bounded_read(upstream, MAX_JSON_BYTES)
                if upstream.status_code == 200:
                    raise HTTPException(502, "Upstream did not return an event stream")
        except httpx.HTTPError:
            if upstream is not None:
                await upstream.aclose()
            active_relays -= 1
            raise HTTPException(502, "Event relay connection failed") from None
        except BaseException:
            if upstream is not None:
                await upstream.aclose()
            active_relays -= 1
            raise
        if upstream.status_code != 200:
            await upstream.aclose()
            active_relays -= 1
            # Error response was already constructed above; return after releasing capacity.
            return Response(data, status_code=upstream.status_code, media_type="application/json", headers={"cache-control": "no-store"})

        async def stream():
            nonlocal active_relays
            pending = b""
            try:
                async for chunk in upstream.aiter_bytes():
                    pending += chunk
                    while b"\n\n" in pending:
                        frame, pending = pending.split(b"\n\n", 1)
                        if len(frame) > MAX_FRAME_BYTES:
                            raise ValueError("Event frame exceeded limit")
                        yield frame + b"\n\n"
                    if len(pending) > MAX_FRAME_BYTES:
                        raise ValueError("Event frame exceeded limit")
            finally:
                await upstream.aclose()
                active_relays -= 1
        return StreamingResponse(stream(), media_type="text/event-stream", headers={"cache-control": "no-cache, no-transform", "x-accel-buffering": "no"})

    @app.post("/api/v1/auth/signin/start", response_model=SignInStarted)
    async def signin_start(body: SignInStart, request: Request):
        return await relay(request, "/v2/auth/oidc/start", None, body=body.model_dump())

    @app.post("/api/v1/auth/signin/exchange", response_model=SignInTokens)
    async def signin_exchange(body: SignInExchange, request: Request):
        return await relay(request, "/v2/auth/oidc/exchange", None, body=body.model_dump())

    @app.post("/api/v1/auth/signin/refresh", response_model=SignInTokens)
    async def signin_refresh(body: SignInRefresh, request: Request):
        return await relay(request, "/v2/auth/oidc/refresh", None, body=body.model_dump())

    @app.post("/api/v1/pairings", response_model=PairingStarted, status_code=201)
    async def pairing(body: PairingStart, request: Request, credential: str = Depends(token)):
        return await relay(request, "/v2/pairings", credential, body=body.model_dump())

    @app.post("/api/v1/pairings/{pairing_id}/confirm", response_model=PairingConfirmed)
    async def pairing_confirm(pairing_id: str, body: PairingConfirm, request: Request, credential: str = Depends(token)):
        return await relay(request, f"/v2/pairings/{segment(pairing_id)}/confirm", credential, body=body.model_dump())

    @app.post("/api/v1/attachments", response_model=AttachmentUploaded, status_code=202,
              openapi_extra={"requestBody": {"required": True, "content": {mime: {"schema": {"type": "string", "format": "binary"}} for mime in ("image/png", "image/jpeg")}}})
    async def upload(request: Request, credential: str = Depends(token), x_session_id: str = Header(), x_file_name: str = Header(), x_content_sha256: str = Header(), content_type: str = Header()):
        data = await request.body()
        return await relay(request, "/v2/public/attachments", credential, data=data,
                           extra={"x-session-id": x_session_id, "x-file-name": x_file_name, "x-content-sha256": x_content_sha256, "content-type": content_type, "content-length": str(len(data))})

    @app.post("/api/v1/attachments/{attachment_id}/commit", response_model=AttachmentCommitted)
    async def commit(attachment_id: str, body: AttachmentCommit, request: Request, credential: str = Depends(token)):
        return await relay(request, f"/v2/public/attachments/{segment(attachment_id)}/commit", credential, body=body.model_dump())

    @app.get("/api/v1/attachments/{attachment_id}", response_class=Response, responses={200: {"content": {mime: {"schema": {"type": "string", "format": "binary"}} for mime in ("image/png", "image/jpeg")}}})
    async def download(attachment_id: str, request: Request, credential: str = Depends(token)):
        return await relay(request, f"/v2/public/attachments/{segment(attachment_id)}", credential)

    def reserve_provider(control):
        nonlocal active_relays, active_controls
        if control:
            if active_controls >= MAX_CONTROL_RELAYS:
                return False
            active_controls += 1
        else:
            if active_relays >= MAX_RELAYS:
                return False
            active_relays += 1
        return True

    def release_provider(control):
        nonlocal active_relays, active_controls
        if control:
            active_controls -= 1
        else:
            active_relays -= 1

    mount_openai(app, client, reserve_provider, release_provider)
    mount_anthropic(app, client, reserve_provider, release_provider)
    return app


async def bounded_read(response: httpx.Response, limit: int) -> bytes:
    chunks, size = [], 0
    async for chunk in response.aiter_bytes():
        size += len(chunk)
        if size > limit:
            raise HTTPException(502, "Upstream error exceeded limit")
        chunks.append(chunk)
    return b"".join(chunks)
