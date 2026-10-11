import httpx
import httpx2
import pytest
import socket
import subprocess
import threading
import time
from pathlib import Path
import uvicorn
from anthropic import AsyncAnthropic

from sdc_gateway.app import create_app
from sdc_gateway.anthropic_profile import AnthropicError, AnthropicRequest, CountTokensRequest, encode, normalize


def test_server_owned_normalization_retains_tool_error_and_maps_policy():
    body = AnthropicRequest(model="sdc-default", max_tokens=64, system="current", tools=[{"name": "lookup", "input_schema": {"type": "object", "properties": {}}}],
        tool_choice={"type": "tool", "name": "lookup", "disable_parallel_tool_use": True}, messages=[
            {"role": "assistant", "content": [{"type": "tool_use", "id": "call-1", "name": "lookup", "input": {"q": "x"}}]},
            {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "call-1", "content": "missing", "is_error": True}]},
        ])
    normalized = normalize(body, "shared-task")
    assert normalized["instructions"] == "current"
    assert normalized["toolChoice"] == {"name": "lookup"}
    assert normalized["parallelTools"] is False
    assert normalized["history"][0]["calls"][0]["callId"] == "call-1"
    assert normalized["history"][1]["resultStatus"] == "error"
    assert normalized["background"] is True


def test_rejects_unsupported_provider_options_and_bad_attachment_before_dispatch():
    body = AnthropicRequest(model="sdc-default", max_tokens=2, temperature=0, messages=[{"role": "user", "content": "private"}])
    with pytest.raises(AnthropicError): normalize(body)
    image = AnthropicRequest(model="sdc-default", max_tokens=2, messages=[{"role": "user", "content": [{"type": "image", "source": {"type": "url", "url": "https://example.test/a.png"}}]}])
    with pytest.raises(AnthropicError): normalize(image)


@pytest.mark.parametrize("content", [
    {}, ["not-a-block"], [{"type": "text"}], [{"type": []}],
    [{"type": "image", "source": "not-an-object"}],
    [{"type": "tool_result", "tool_use_id": "call-1", "content": [{"type": "text", "text": 1}]}],
])
def test_malformed_content_is_a_client_error_before_dispatch(content):
    body = AnthropicRequest(model="sdc-default", max_tokens=8, messages=[{"role": "user", "content": content}])
    with pytest.raises(AnthropicError):
        normalize(body)


def test_interleaved_assistant_tool_blocks_cannot_be_silently_reordered():
    body = AnthropicRequest(model="sdc-default", max_tokens=8, messages=[{"role": "assistant", "content": [
        {"type": "tool_use", "id": "call-1", "name": "lookup", "input": {}},
        {"type": "text", "text": "after"},
    ]}])
    with pytest.raises(AnthropicError):
        normalize(body)


def test_malformed_tool_choice_is_a_client_error():
    body = AnthropicRequest(model="sdc-default", max_tokens=8, messages=[{"role": "user", "content": "x"}],
        tool_choice={"type": []})
    with pytest.raises(AnthropicError):
        normalize(body)


def test_message_encoding_uses_estimates_and_canonical_tool_ids():
    result = encode({"generationId": "12345678-1234-1234-1234-123456789abc", "result": {"status": "completed", "outcome": "caller_tools", "text": "ok", "calls": [{"callId": "call_server", "name": "lookup", "arguments": {"q": "x"}}], "usage": {"inputUnits": 8, "outputUnits": 5, "estimator": "sdc-text-v1", "scope": "estimated"}}})
    assert result["id"] == "msg_12345678123412341234123456789abc"
    assert result["stop_reason"] == "tool_use"
    assert result["content"][1]["id"] == "call_server"
    assert result["usage"]["sdc"]["source"] == "estimated"


def test_message_encoding_rejects_missing_usage_instead_of_reporting_zero():
    with pytest.raises(AnthropicError):
        encode({"generationId": "12345678-1234-1234-1234-123456789abc", "result": {"status": "completed", "text": "ok", "calls": [], "outcome": "stop"}})


@pytest.mark.asyncio
async def test_anthropic_routes_require_version_and_accept_one_key_mechanism():
    calls = []
    async def upstream(request):
        calls.append(request)
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"models": [{"id": "sdc-default"}]})
        return httpx.Response(200, json={"id": "sdc-default"})
    app = create_app(transport=httpx.MockTransport(upstream))
    async with app.router.lifespan_context(app), httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        headers = {"x-api-key": "fixture", "anthropic-version": "2023-06-01"}
        response = await client.get("/anthropic/v1/models", headers=headers)
        assert response.status_code == 200
        assert response.json()["data"][0]["id"] == "sdc-default"
        assert response.json()["data"][0]["sdc"]["created_unknown"] is True
        assert calls[-1].headers["authorization"] == "Bearer fixture"
        bad = await client.get("/anthropic/v1/models", headers={"x-api-key": "fixture"})
        assert bad.status_code == 400 and bad.json()["type"] == "error"
        dual = await client.get("/anthropic/v1/models", headers={**headers, "authorization": "Bearer other"})
        assert dual.status_code == 401
        beta = await client.get("/anthropic/v1/models", headers={**headers, "anthropic-beta": "some-beta"})
        assert beta.status_code == 400
        assert len(calls) == 1


@pytest.mark.asyncio
async def test_model_discovery_uses_authorized_aliases_and_validates_cursors():
    models = []
    async def upstream(request):
        return httpx.Response(200, json={"models": models})
    app = create_app(transport=httpx.MockTransport(upstream))
    headers = {"x-api-key": "fixture", "anthropic-version": "2023-06-01"}
    async with app.router.lifespan_context(app), httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        empty = await client.get("/anthropic/v1/models", headers=headers)
        assert empty.status_code == 200 and empty.json()["data"] == [] and empty.json()["first_id"] is None
        models.append({"id": "sdc-default"})
        page = await client.get("/anthropic/v1/models?limit=1", headers=headers)
        assert [item["id"] for item in page.json()["data"]] == ["sdc-default"]
        after = await client.get("/anthropic/v1/models?after_id=sdc-default", headers=headers)
        assert after.status_code == 200 and after.json()["data"] == []
        bad = await client.get("/anthropic/v1/models?after_id=foreign", headers=headers)
        assert bad.status_code == 400
        duplicate = await client.get("/anthropic/v1/models?limit=1&limit=2", headers=headers)
        assert duplicate.status_code == 400


@pytest.mark.asyncio
async def test_official_python_sdk_discovery_count_sync_and_stream_contract():
    async def upstream(request):
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"models": [{"id": "sdc-default"}]})
        if request.url.path.endswith("/input-counts"):
            return httpx.Response(200, json={"inputUnits": 3, "withinInputBudget": True, "source": "estimated", "estimator": "sdc-text-v1", "scope": "composed-input-plus-image-allowance", "hiddenNativeContext": "unknown", "imageAllowanceUnits": 0, "admissionChecked": False})
        if request.url.path.endswith("/generations"):
            return httpx.Response(200, json={"generationId": "12345678-1234-1234-1234-123456789abc", "result": {"status": "completed"}})
        if request.url.path.endswith("/identity"):
            return httpx.Response(200, json={"userId": "fixture"})
        return httpx.Response(200, json={"generationId": "12345678-1234-1234-1234-123456789abc", "result": {"status": "completed", "text": "hello", "calls": [], "outcome": "stop", "usage": {"inputUnits": 3, "outputUnits": 2, "estimator": "sdc-text-v1", "scope": "estimate", "hiddenNativeContext": "unknown"}}})
    app = create_app(transport=httpx.MockTransport(upstream))
    async with app.router.lifespan_context(app):
        transport = httpx2.AsyncClient(transport=httpx2.ASGITransport(app=app), base_url="http://gateway")
        async with AsyncAnthropic(api_key="fixture", base_url="http://gateway/anthropic", http_client=transport, max_retries=0,
                default_headers={"Idempotency-Key": "sdk-original"}) as sdk:
            page = await sdk.models.list()
            assert page.data[0].id == "sdc-default"
            count = await sdk.messages.count_tokens(model="sdc-default", messages=[{"role": "user", "content": "hello"}])
            assert count.input_tokens == 3
            message = await sdk.messages.create(model="sdc-default", max_tokens=64, messages=[{"role": "user", "content": "hello"}])
            assert message.content[0].text == "hello"
            assert message.usage.input_tokens == 3
            async with sdk.messages.stream(model="sdc-default", max_tokens=64, messages=[{"role": "user", "content": "hello"}], extra_headers={"Idempotency-Key": "stream-original"}) as stream:
                final = await stream.get_final_message()
                assert final.content[0].text == "hello"
                assert final.stop_reason == "end_turn"


@pytest.mark.asyncio
async def test_stream_failure_is_error_eof_without_success_terminal():
    async def upstream(request):
        if request.url.path.endswith("/input-counts"):
            return httpx.Response(200, json={"inputUnits": 1, "estimator": "sdc-text-v1", "scope": "estimate"})
        if request.url.path.endswith("/generations"):
            return httpx.Response(200, json={"generationId": "failed-id", "result": {"status": "failed"}})
        if request.url.path.endswith("/identity"):
            return httpx.Response(200, json={"userId": "fixture"})
        return httpx.Response(200, json={"generationId": "failed-id", "result": {"status": "failed", "text": "", "calls": [], "outcome": "backend_error"}})
    app = create_app(transport=httpx.MockTransport(upstream))
    async with app.router.lifespan_context(app), httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        response = await client.post("/anthropic/v1/messages", json={"model": "sdc-default", "max_tokens": 32, "stream": True, "messages": [{"role": "user", "content": "x"}]},
            headers={"x-api-key": "fixture", "anthropic-version": "2023-06-01", "Idempotency-Key": "failure"})
        assert response.status_code == 200
        assert "event: error" in response.text
        assert "event: message_stop" not in response.text


@pytest.mark.asyncio
async def test_stream_revocation_reports_authentication_error_before_terminal():
    identity_checks = 0
    async def upstream(request):
        nonlocal identity_checks
        if request.url.path.endswith("/input-counts"):
            return httpx.Response(200, json={"inputUnits": 1, "estimator": "sdc-text-v1", "scope": "estimate"})
        if request.url.path.endswith("/identity"):
            identity_checks += 1
            if identity_checks > 1:
                return httpx.Response(401, json={"error": {"code": "CREDENTIAL_REVOKED", "message": "Credential was revoked"}})
            return httpx.Response(200, json={"userId": "fixture"})
        return httpx.Response(200, json={"generationId": "12345678-1234-1234-1234-123456789abc", "result": {
            "status": "completed", "outcome": "stop", "text": "hello", "calls": [],
            "usage": {"inputUnits": 1, "outputUnits": 2, "estimator": "sdc-text-v1", "scope": "estimate"}}})
    app = create_app(transport=httpx.MockTransport(upstream))
    async with app.router.lifespan_context(app), httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        response = await client.post("/anthropic/v1/messages", json={"model": "sdc-default", "max_tokens": 32, "stream": True, "messages": [{"role": "user", "content": "x"}]},
            headers={"x-api-key": "fixture", "anthropic-version": "2023-06-01", "Idempotency-Key": "revoked"})
        assert response.status_code == 200
        assert "event: message_start" in response.text
        assert '"type": "authentication_error"' in response.text
        assert "event: message_stop" not in response.text


def test_official_node_sdk_over_local_tcp():
    async def upstream(request):
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"models": [{"id": "sdc-default"}]})
        if request.url.path.endswith("/input-counts"):
            return httpx.Response(200, json={"inputUnits": 3, "withinInputBudget": True, "source": "estimated", "estimator": "sdc-text-v1", "scope": "composed-input-plus-image-allowance", "hiddenNativeContext": "unknown", "imageAllowanceUnits": 0, "admissionChecked": False})
        if request.url.path.endswith("/generations"):
            return httpx.Response(200, json={"generationId": "12345678-1234-1234-1234-123456789abc", "result": {"status": "completed"}})
        if request.url.path.endswith("/identity"):
            return httpx.Response(200, json={"userId": "fixture"})
        return httpx.Response(200, json={"generationId": "12345678-1234-1234-1234-123456789abc", "result": {"status": "completed", "text": "hello", "calls": [], "outcome": "stop", "usage": {"inputUnits": 3, "outputUnits": 2, "estimator": "sdc-text-v1", "scope": "estimate", "hiddenNativeContext": "unknown"}}})
    app = create_app(transport=httpx.MockTransport(upstream))
    sock = socket.socket()
    try:
        sock.bind(("127.0.0.1", 0))
    except PermissionError:
        sock.close()
        pytest.skip("sandbox does not permit local TCP listeners; run the M29 TCP acceptance in an authorized environment")
    sock.listen(128)
    base_url = "http://127.0.0.1:" + str(sock.getsockname()[1]) + "/anthropic"
    server = uvicorn.Server(uvicorn.Config(app, log_level="critical", access_log=False))
    thread = threading.Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True); thread.start()
    try:
        for _ in range(100):
            if server.started: break
            time.sleep(0.05)
        assert server.started
        script = Path(__file__).with_name("anthropic-sdk-consumer.mjs")
        result = subprocess.run(["node", str(script), base_url], cwd=Path(__file__).resolve().parents[2], capture_output=True, text=True, timeout=30)
        assert result.returncode == 0, result.stderr
        assert '"streamed":"hello"' in result.stdout
    finally:
        server.should_exit = True; thread.join(timeout=10); sock.close()
