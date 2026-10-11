import json
from pathlib import Path
import httpx
import pytest
from sdc_gateway.app import create_app, MAX_JSON_BYTES

@pytest.mark.asyncio
async def test_validation_rejects_unsupported_fields_before_dispatch_and_redacts_values():
    calls = []
    async def upstream(request):
        calls.append(request)
        return httpx.Response(202, json={"status": "queued"})
    app = create_app(transport=httpx.MockTransport(upstream))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            body = {"model": "sdc.binding", "content": [{"type": "text", "text": "private-prompt-value"}], "tools": [], "max_tokens": 10}
            response = await client.post("/api/v1/sessions/session/prompts", headers={"authorization": "Bearer fixture", "idempotency-key": "retry"}, json=body)
            assert response.status_code == 422
            assert "private-prompt-value" not in response.text
            assert len(calls) == 0
            body.pop("tools"); body.pop("max_tokens")
            body["content"] = [{"type": "file", "attachmentId": "file", "mimeType": "text/plain"}]
            response = await client.post("/api/v1/sessions/session/prompts", headers={"authorization": "Bearer fixture", "idempotency-key": "retry"}, json=body)
            assert response.status_code == 422
            assert len(calls) == 0

@pytest.mark.asyncio
async def test_body_bounds_before_json_decode_and_encoding_rejection():
    calls = []
    async def upstream(request):
        calls.append(request)
        return httpx.Response(200, json={})
    app = create_app(transport=httpx.MockTransport(upstream))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            async def chunks():
                yield b"x" * (MAX_JSON_BYTES // 2)
                yield b"x" * (MAX_JSON_BYTES // 2 + 1)
            response = await client.post("/api/v1/credentials", content=chunks(), headers={"authorization": "Bearer fixture", "content-type": "application/json"})
            assert response.status_code == 413
            response = await client.post("/api/v1/credentials", content=b"x", headers={"content-encoding": "gzip"})
            assert response.status_code == 415
            assert not calls

@pytest.mark.asyncio
async def test_relay_preserves_principal_key_and_durable_response_without_automatic_retries():
    calls = []
    async def upstream(request):
        calls.append(request)
        assert request.headers["authorization"] == "Bearer scoped-caller"
        assert request.headers["idempotency-key"] == "original"
        assert json.loads(request.content)["delivery"] == "queue"
        return httpx.Response(202, json={"operationId": "original-operation", "status": "queued"}, headers={"location": "/api/v1/operations/original-operation"})
    app = create_app(transport=httpx.MockTransport(upstream))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/v1/sessions/session/prompts", json={"model": "sdc.binding", "content": [{"type": "text", "text": "fixture"}]}, headers={"authorization": "Bearer scoped-caller", "idempotency-key": "original"})
            assert response.status_code == 202
            assert response.json()["operationId"] == "original-operation"
            assert response.headers["location"] == "/api/v1/operations/original-operation"
            assert len(calls) == 1
    failures = []
    async def failed(request):
        failures.append(request)
        raise httpx.ReadError("private credentials should not leak")
    app = create_app(transport=httpx.MockTransport(failed))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/v1/sessions/session/prompts", json={"model": "sdc.binding", "content": [{"type": "text", "text": "fixture"}]}, headers={"authorization": "Bearer scoped-caller", "idempotency-key": "original"})
            assert response.status_code == 502
            assert "private credentials" not in response.text
            assert len(failures) == 1

@pytest.mark.asyncio
async def test_stream_cursor_error_releases_relay_capacity():
    async def upstream(request):
        assert request.headers["last-event-id"] == "7"
        return httpx.Response(409, json={"error": {"code": "CURSOR_AHEAD"}})
    app = create_app(transport=httpx.MockTransport(upstream))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            for _ in range(70):
                response = await client.get("/api/v1/sessions/session/events", headers={"authorization": "Bearer fixture", "last-event-id": "7"})
                assert response.status_code == 409
            assert (await client.get("/api/v1/sessions/session/events?after=-1", headers={"authorization": "Bearer fixture"})).status_code == 422

@pytest.mark.asyncio
async def test_first_party_stream_preserves_revision_event_frames_and_requires_authentication():
    observed = b'id: 8\nevent: event\ndata: {"payload":{"type":"output.item.replaced"}}\n\n'
    async def upstream(request):
        return httpx.Response(200, content=observed, headers={"content-type": "text/event-stream"})
    app = create_app(transport=httpx.MockTransport(upstream))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/sessions/session/events?after=7", headers={"authorization": "Bearer fixture"})
            assert response.content == observed
            assert response.headers["x-accel-buffering"] == "no"
            response = await client.get("/api/v1/identity")
            assert response.status_code in (401, 403)


def test_origin_validation_and_openapi_contract():
    for origin in ("http://example.com", "https://user:secret@example.com", "https://example.com/private", "https://example.com?token=secret"):
        with pytest.raises(ValueError):
            create_app(origin)
    app = create_app()
    schema = app.openapi()
    assert json.loads((Path(__file__).resolve().parents[1] / "openapi.json").read_text()) == schema
    assert len(schema["paths"]) == 42
    assert "/anthropic/v1/messages" in schema["paths"]
    assert "/anthropic/v1/messages/count_tokens" in schema["paths"]
    assert "/api/v1/input-counts" in schema["paths"]
    prompt = schema["components"]["schemas"]["Prompt"]
    assert prompt["additionalProperties"] is False
    assert "HTTPBearer" in schema["components"]["securitySchemes"]
    assert "/openai/v1/chat/completions" in schema["paths"]
    assert "/openai/v1/responses" in schema["paths"]
    assert "/anthropic/v1/models" in schema["paths"]

@pytest.mark.asyncio
async def test_control_relay_has_capacity_independent_of_prompt_waits():
    import asyncio
    from sdc_gateway.app import MAX_RELAYS
    entered, release = asyncio.Event(), asyncio.Event()
    count = 0
    async def upstream(request):
        nonlocal count
        if request.url.path.endswith("/controls"):
            return httpx.Response(202, json={"state": "recorded", "nativeApplied": False})
        count += 1
        if count == MAX_RELAYS:
            entered.set()
        await release.wait()
        return httpx.Response(200, json={"userId": "SIMULATED"})
    app = create_app(transport=httpx.MockTransport(upstream))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            pending = [asyncio.create_task(client.get("/api/v1/identity", headers={"authorization": "Bearer fixture"})) for _ in range(MAX_RELAYS)]
            try:
                await asyncio.wait_for(entered.wait(), timeout=2)
                assert (await client.get("/api/v1/identity", headers={"authorization": "Bearer fixture"})).status_code == 429
                control = await client.post("/api/v1/sessions/session/controls", json={"type": "session.disable", "commandId": "disable", "reason": "fixture"}, headers={"authorization": "Bearer fixture"})
                assert control.status_code == 202
            finally:
                release.set()
                await asyncio.gather(*pending)


def test_private_http_upstream_requires_exact_operator_origin(monkeypatch):
    monkeypatch.setenv("SDC_TRUSTED_HTTP_UPSTREAMS", "http://server:3000")
    create_app("http://server:3000")
    for origin in ("http://server:3001", "http://server.evil:3000", "http://server:3000/path", "http://user:secret@server:3000"):
        with pytest.raises(ValueError):
            create_app(origin)
    monkeypatch.delenv("SDC_TRUSTED_HTTP_UPSTREAMS")
    monkeypatch.setenv("SDC_ALLOW_INSECURE_UPSTREAM", "true")
    with pytest.raises(ValueError):
        create_app("http://server:3000")
