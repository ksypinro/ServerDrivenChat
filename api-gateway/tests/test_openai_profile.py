"""Official SDK consumers over real HTTP/PostgreSQL and explicitly scripted native events."""
import asyncio
from contextlib import asynccontextmanager
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time

import httpx
from openai import AsyncOpenAI, APIStatusError
from anthropic import AsyncAnthropic
import pytest

from sdc_gateway.app import create_app
from sdc_gateway.openai_profile import ChatRequest, ResponsesRequest, normalize, ProfileError
from importlib.metadata import version

ROOT = Path(__file__).resolve().parents[2]

class FixtureInfo(dict):
    def __repr__(self):
        return repr({**self, "credential": "[redacted disposable key]"})


@pytest.mark.parametrize("option", [
    {"temperature": 0}, {"stop": ["end"]}, {"top_p": 1}, {"seed": 1}, {"logprobs": True},
    {"n": 2}, {"response_format": {"type": "json_object"}}, {"max_tokens": 1, "max_completion_tokens": 1},
    {"stream_options": {"include_usage": True}}, {"tools": [{"type": "web_search"}]},
])
@pytest.mark.asyncio
async def test_unsupported_chat_fields_fail_before_dispatch(option):
    calls = []
    async def upstream(request):
        calls.append(request)
        return httpx.Response(500)
    app = create_app(transport=httpx.MockTransport(upstream))
    async with app.router.lifespan_context(app), httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/openai/v1/chat/completions", json={"model": "sdc-default", "messages": [{"role": "user", "content": "private"}], **option},
            headers={"authorization": "Bearer fixture", "idempotency-key": "one"})
        assert response.status_code == 422
        assert response.json()["error"]["type"] == "invalid_request_error"
        assert "private" not in response.text
        assert not calls


def test_committed_image_refs_and_current_instruction_normalization():
    assert version("openai") == "3.26.0"
    uri = "sdc-attachment://12345678-1234-1234-1234-123456789abc?mime=image/png"
    value = normalize(ChatRequest(model="sdc-default", messages=[{"role": "system", "content": "first"}, {"role": "developer", "content": "second"},
        {"role": "user", "content": [{"type": "text", "text": "look"}, {"type": "image_url", "image_url": {"url": uri}}]}]), "exclusive")
    assert value["instructions"] == "SYSTEM:\nfirst\n\nDEVELOPER:\nsecond"
    assert value["history"][0]["images"][0]["mimeType"] == "image/png"
    response = normalize(ResponsesRequest(model="sdc-default", input=[{"role": "user", "content": [{"type": "input_image", "image_url": uri}]}]), "exclusive")
    assert response["history"][0]["images"] == value["history"][0]["images"]
    current = normalize(ResponsesRequest(model="sdc-default", instructions="current", input=[{"role": "developer", "content": "policy"}, {"role": "user", "content": "go"}]), "exclusive")
    assert current["instructions"] == "DEVELOPER:\npolicy\n\ncurrent"
    assert len(current["history"]) == 1
    with pytest.raises(ProfileError):
        normalize(ChatRequest(model="sdc-default", messages=[{"role": "user", "content": [{"type": "image_url", "image_url": {"url": "https://example.com/image.png"}}]}]), "exclusive")


@pytest.fixture
def native_fixture():
    if not os.environ.get("M27_TEST_DATABASE_URL"):
        pytest.skip("requires disposable PostgreSQL and built TypeScript server")
    proc = subprocess.Popen([os.environ.get("SDC_TEST_NODE", "node"), str(ROOT / "tests/helpers/m28-gateway-server.mjs")], cwd=ROOT,
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        line = proc.stdout.readline()
        assert line, proc.stderr.read()
        info = FixtureInfo(json.loads(line))
        def control(action="inspect", **values):
            proc.stdin.write(json.dumps({"action": action, **values}) + "\n")
            proc.stdin.flush()
            result = json.loads(proc.stdout.readline())
            assert result["ok"], result
            return result
        yield info, control
    finally:
        proc.stdin.close()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.terminate()
            proc.wait(timeout=10)
        assert proc.returncode == 0, proc.stderr.read()


@asynccontextmanager
async def sdk_client(info, shared=True):
    app = create_app(info["baseUrl"])
    async with app.router.lifespan_context(app):
        transport = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway")
        async with AsyncOpenAI(api_key=info["credential"], base_url="http://gateway/openai/v1", http_client=transport,
            max_retries=2, default_headers={"x-sdc-context-mode": "shared-task"} if shared else {}) as sdk:
            yield sdk, transport


@pytest.mark.asyncio
async def test_anthropic_sdk_runs_over_tcp_with_server_counting_sync_stream_and_retry(native_fixture):
    info, fixture = native_fixture
    fixture("next", response={"text": "Anthropic committed text"})
    fixture("next", response={"text": "streamed terminal"})
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0)); port = sock.getsockname()[1]
    env = {**os.environ, "SDC_SERVER_URL": info["baseUrl"]}
    gateway = subprocess.Popen([sys.executable, "-m", "uvicorn", "sdc_gateway.app:create_app", "--factory", "--host", "127.0.0.1", "--port", str(port), "--no-access-log", "--log-level", "critical"],
        cwd=ROOT / "api-gateway", env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    try:
        for _ in range(100):
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=0.1): break
            except OSError: time.sleep(0.05)
        import httpx2
        async with httpx2.AsyncClient(base_url=f"http://127.0.0.1:{port}", trust_env=False) as transport:
            async with AsyncAnthropic(api_key=info["credential"], base_url=f"http://127.0.0.1:{port}/anthropic", http_client=transport,
                    max_retries=2, default_headers={"x-sdc-context-mode": "shared-task", "Idempotency-Key": "m29-original"}) as sdk:
                assert [model.id async for model in await sdk.models.list()] == ["sdc-default"]
                count = await sdk.messages.count_tokens(model="sdc-default", messages=[{"role": "user", "content": "count 😀"}])
                assert count.input_tokens > 0
                assert count.model_extra["sdc"]["estimator"] == "sdc-text-v1"
                first = await sdk.messages.create(model="sdc-default", max_tokens=64, messages=[{"role": "user", "content": "hello"}], extra_headers={"Idempotency-Key": "m29-first"})
                assert first.content[0].text == "Anthropic committed text"
                before = fixture()["commands"]
                replay = await sdk.messages.create(model="sdc-default", max_tokens=64, messages=[{"role": "user", "content": "hello"}], extra_headers={"Idempotency-Key": "m29-first"})
                assert replay.id == first.id and fixture()["commands"] == before
                async with sdk.messages.stream(model="sdc-default", max_tokens=64, messages=[{"role": "user", "content": "stream"}], extra_headers={"Idempotency-Key": "m29-stream"}) as stream:
                    events = [event async for event in stream]
                    final = await stream.get_final_message()
                assert final.content[0].text == "streamed terminal"
                assert final.stop_reason == "end_turn"
                assert any(event.type == "content_block_delta" for event in events)
    finally:
        gateway.terminate(); gateway.wait(timeout=10)


@pytest.mark.asyncio
async def test_python_sdk_chat_chunks_and_responses_accumulator(native_fixture):
    info, fixture = native_fixture
    async with sdk_client(info) as (sdk, http):
        assert [m.id for m in (await sdk.models.list()).data] == ["sdc-default"]
        assert (await sdk.models.retrieve("sdc-default")).owned_by == "sdc"
        fixture("next", response={"text": "committed 😀", "mutableText": "NEVER PUBLISH THIS"})
        stream = await sdk.chat.completions.create(model="sdc-default", messages=[{"role": "user", "content": "text"}], stream=True,
            stream_options={"include_usage": True}, extra_headers={"Idempotency-Key": "python-chat"})
        events = [event async for event in stream]
        assert "".join(e.choices[0].delta.content or "" for e in events if e.choices) == "committed 😀"
        assert events[-2].choices[0].finish_reason == "stop"
        assert events[-1].choices == [] and events[-1].usage.completion_tokens > 0
        assert events[-1].usage.model_extra["sdc"]["source"] == "estimated"
        fixture("next", response={"text": "response 😀"})
        async with sdk.responses.stream(model="sdc-default", input="text", extra_headers={"Idempotency-Key": "python-response"}) as stream:
            observed = [event async for event in stream]
            final = await stream.get_final_response()
        assert observed[0].type == "response.created" and observed[-1].type == "response.completed"
        assert final.output_text == "response 😀" and final.usage.input_tokens > 0
        replay = await sdk.responses.retrieve(final.id)
        # The stream accumulator adds its local optional `parsed=None` field.
        assert replay.model_dump(exclude_none=True) == final.model_dump(exclude_none=True)
        raw = await http.get("/openai/v1/responses/" + final.id + "?stream=true&starting_after=3", headers={"authorization": "Bearer " + info["credential"]})
        records = [json.loads(line[6:]) for line in raw.text.splitlines() if line.startswith("data: ")]
        assert records[0]["sequence_number"] == 4 and records[-1]["type"] == "response.completed"
        assert raw.headers["x-sdc-usage-source"] == "estimated"
        assert (await http.get("/openai/v1/responses/" + final.id + "?stream=true&starting_after=999999", headers={"authorization": "Bearer " + info["credential"]})).status_code == 409
        replay_by_id = await http.get("/openai/v1/responses/" + final.id + "?stream=true", headers={"authorization": "Bearer " + info["credential"], "last-event-id": final.id + ":3"})
        assert replay_by_id.text == raw.text


@pytest.mark.asyncio
async def test_python_sdk_exclusive_context_current_instructions_and_original_retry(native_fixture):
    info, fixture = native_fixture
    async with sdk_client(info, False) as (sdk, _):
        fixture("next", response={"text": "first"})
        first = await sdk.responses.create(model="sdc-default", input="one", instructions="old", extra_headers={"Idempotency-Key": "first"})
        before = fixture()["commands"]
        retry = await sdk.responses.create(model="sdc-default", input="one", instructions="old", extra_headers={"Idempotency-Key": "first"})
        assert retry.id == first.id and fixture()["commands"] == before
        fixture("next", response={"text": "second"})
        second = await sdk.responses.create(model="sdc-default", input="two", previous_response_id=first.id, instructions="current", extra_headers={"Idempotency-Key": "next"})
        assert second.previous_response_id == first.id and second.instructions == "current"
        assert (await sdk.responses.retrieve(first.id)).instructions == "old"
        with pytest.raises(APIStatusError) as error:
            await sdk.responses.create(model="sdc-default", input="branch", previous_response_id=first.id, extra_headers={"Idempotency-Key": "branch"})
        assert error.value.status_code == 409
        with pytest.raises(APIStatusError) as error:
            await sdk.responses.create(model="sdc-default", input="independent", extra_headers={"Idempotency-Key": "independent"})
        assert error.value.status_code == 409
        assert fixture()["generations"] == 2
    # A new gateway instance reconstructs lineage and options from server state.
    async with sdk_client(info, False) as (restarted, _):
        persisted = await restarted.responses.retrieve(second.id)
        assert persisted.previous_response_id == first.id and persisted.instructions == "current"


@pytest.mark.asyncio
async def test_chat_tool_stream_accumulator_and_append_only_history(native_fixture):
    info, fixture = native_fixture
    function = {"name": "sum", "parameters": {"type": "object", "properties": {"x": {"type": "integer"}}, "required": ["x"], "additionalProperties": False}, "strict": True}
    user = {"role": "user", "content": "sum"}
    async with sdk_client(info, False) as (sdk, _):
        fixture("next", response={"text": json.dumps({"version": "sdc-tool-v1", "text": "proposal", "calls": [{"name": "sum", "arguments": {"x": 3}}]})})
        async with sdk.chat.completions.stream(model="sdc-default", messages=[user], tools=[{"type": "function", "function": function}],
            tool_choice="required", extra_headers={"Idempotency-Key": "chat-function"}) as stream:
            async for _ in stream:
                pass
            answer = await stream.get_final_completion()
        assert answer.choices[0].finish_reason == "tool_calls"
        call = answer.choices[0].message.tool_calls[0]
        assert json.loads(call.function.arguments) == {"x": 3}
        assistant = {"role": "assistant", "content": "proposal", "tool_calls": [{"type": "function", "id": call.id,
            "function": {"name": call.function.name, "arguments": call.function.arguments}}]}
        fixture("next", response={"text": "3"})
        continuation = await sdk.chat.completions.create(model="sdc-default", messages=[user, assistant, {"role": "tool", "tool_call_id": call.id, "content": "3"}],
            extra_headers={"Idempotency-Key": "chat-function-result"})
        assert continuation.choices[0].message.content == "3"
        with pytest.raises(APIStatusError) as error:
            await sdk.chat.completions.create(model="sdc-default", messages=[{"role": "user", "content": "rewritten"}], extra_headers={"Idempotency-Key": "rewind"})
        assert error.value.status_code == 409 and fixture()["generations"] == 2


@pytest.mark.asyncio
async def test_foreign_scoped_key_and_revocation_no_context_leak(native_fixture):
    from datetime import datetime, timedelta, timezone
    info, fixture = native_fixture
    async with sdk_client(info, False) as (sdk, http):
        fixture("next", response={"text": "owned"})
        original = await sdk.responses.create(model="sdc-default", input="one", extra_headers={"Idempotency-Key": "owned"})
        issued = await http.post("/api/v1/credentials", json={"sessionId": "session", "scopes": ["view", "prompt"], "label": "foreign caller",
            "expiresAt": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()}, headers={"authorization": "Bearer owner"})
        assert issued.status_code == 201
        async with sdk_client({**info, "credential": issued.json()["credential"]}, False) as (foreign, _):
            with pytest.raises(APIStatusError) as error:
                await foreign.responses.retrieve(original.id)
            assert error.value.status_code == 404
            with pytest.raises(APIStatusError) as error:
                await foreign.responses.create(model="sdc-default", input="unrelated", extra_headers={"Idempotency-Key": "foreign"})
            assert error.value.status_code == 409 and fixture()["generations"] == 1
        credentials = (await http.get("/api/v1/credentials", headers={"authorization": "Bearer owner"})).json()["credentials"]
        original_key = next(c for c in credentials if c["label"] == "M28 synthetic SDK fixture")
        assert (await http.post("/api/v1/credentials/" + original_key["credentialId"] + "/revoke", headers={"authorization": "Bearer owner"})).status_code == 200
        with pytest.raises(APIStatusError) as error:
            await sdk.responses.retrieve(original.id)
        assert error.value.status_code == 401


@pytest.mark.asyncio
async def test_python_sdk_strict_tools_results_invalid_reply_and_quota(native_fixture):
    info, fixture = native_fixture
    tool = {"type": "function", "name": "sum", "parameters": {"type": "object", "properties": {"x": {"type": "integer"}}, "required": ["x"], "additionalProperties": False}, "strict": True}
    async with sdk_client(info) as (sdk, _):
        fixture("next", response={"text": json.dumps({"version": "sdc-tool-v1", "text": "", "calls": [{"name": "sum", "arguments": {"x": 3}}]})})
        async with sdk.responses.stream(model="sdc-default", input="sum", tools=[tool], tool_choice={"type": "function", "name": "sum"}, extra_headers={"Idempotency-Key": "tool"}) as stream:
            events = [event async for event in stream]
            call = await stream.get_final_response()
        assert any(e.type == "response.function_call_arguments.done" for e in events)
        assert call.output[0].type == "function_call" and json.loads(call.output[0].arguments) == {"x": 3}
        fixture("next", response={"text": "3"})
        answer = await sdk.responses.create(model="sdc-default", previous_response_id=call.id,
            input=[{"type": "function_call_output", "call_id": call.output[0].call_id, "output": "3"}], extra_headers={"Idempotency-Key": "tool-result"})
        assert answer.output_text == "3"
        with pytest.raises(APIStatusError) as error:
            await sdk.responses.create(model="sdc-default", previous_response_id=answer.id,
                input=[{"type": "function_call_output", "call_id": call.output[0].call_id, "output": "changed"}], extra_headers={"Idempotency-Key": "changed-result"})
        assert error.value.status_code == 409
        fixture("next", response={"text": "not valid JSON"})
        invalid = await sdk.responses.create(model="sdc-default", input="sum", tools=[tool], tool_choice="required", extra_headers={"Idempotency-Key": "invalid"})
        assert invalid.status == "failed" and invalid.output == [] and invalid.error.code == "backend_contract_error"
        fixture("next", response={"text": "0123456789abcdefEXCESS"})
        quota = await sdk.chat.completions.create(model="sdc-default", messages=[{"role": "user", "content": "quota"}], max_completion_tokens=4,
            extra_headers={"Idempotency-Key": "quota"})
        assert quota.choices[0].finish_reason == "length" and quota.choices[0].message.content == "0123456789abcdef"
        assert quota.model_extra["sdc"]["native_generation_cap"] is False


@pytest.mark.asyncio
async def test_background_cancel_and_credential_authentication(native_fixture):
    info, fixture = native_fixture
    async with sdk_client(info) as (sdk, http):
        fixture("next", response={"hold": True})
        pending = await sdk.responses.create(model="sdc-default", input="hold", background=True, extra_headers={"Idempotency-Key": "background"})
        assert pending.status in ("queued", "in_progress") and pending.output == [] and pending.usage is None
        await sdk.responses.cancel(pending.id)
        final = None
        for _ in range(100):
            final = await sdk.responses.retrieve(pending.id)
            if final.status == "cancelled":
                break
            await asyncio.sleep(0.05)
        assert final.status == "cancelled"
        assert (await sdk.responses.cancel(pending.id)).id == pending.id
        assert fixture()["generations"] == 1
        missing = await http.get("/openai/v1/models")
        assert missing.status_code == 401 and missing.json()["error"]["type"] == "authentication_error"
        before = fixture()["commands"]
        for body in [{"store": False}, {"reasoning": {"effort": "low"}}, {"text": {"format": {"type": "json_object"}}}]:
            response = await http.post("/openai/v1/responses", json={"model": "sdc-default", "input": "no dispatch", **body},
                headers={"authorization": "Bearer " + info["credential"], "idempotency-key": "unsupported"})
            assert response.status_code == 422
        assert fixture()["commands"] == before


def test_node_official_sdk_on_real_tcp_gateway(native_fixture):
    info, fixture = native_fixture
    fixture("next", response={"text": "NODE CHAT"})
    fixture("next", response={"text": "NODE RESPONSE", "mutableText": "UNCOMMITTED"})
    fixture("next", response={"text": "NODE STREAM"})
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    env = {**os.environ, "SDC_SERVER_URL": info["baseUrl"]}
    gateway = subprocess.Popen([sys.executable, "-m", "uvicorn", "sdc_gateway.app:create_app", "--factory", "--host", "127.0.0.1", "--port", str(port), "--no-access-log"],
        cwd=ROOT / "api-gateway", env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    try:
        for _ in range(100):
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=0.1):
                    break
            except OSError:
                time.sleep(0.05)
        result = subprocess.run([os.environ.get("SDC_TEST_NODE", "node"), str(ROOT / "tests/helpers/m28-sdk-node.mjs")], cwd=ROOT,
            env={**env, "SDC_GATEWAY_URL": f"http://127.0.0.1:{port}/openai/v1", "SDC_TEST_KEY": info["credential"]}, capture_output=True, text=True, timeout=60)
        assert result.returncode == 0, result.stderr
        assert json.loads(result.stdout)["status"] == "passed"
        assert fixture()["generations"] == 3
    finally:
        gateway.terminate()
        gateway.wait(timeout=10)


@pytest.mark.asyncio
async def test_official_sdk_ambiguous_admission_retry_preserves_one_generation(native_fixture):
    info, fixture = native_fixture
    fixture("next", response={"text": "retry settled"})
    admissions = 0
    wire = httpx.AsyncHTTPTransport()
    async def lose_first_response(request):
        nonlocal admissions
        response = await wire.handle_async_request(request)
        if request.method == "POST" and request.url.path == "/v2/public/generations":
            admissions += 1
            if admissions == 1:
                await response.aread()
                await response.aclose()
                raise httpx.ReadError("SIMULATED loss after committed admission", request=request)
        return response
    app = create_app(info["baseUrl"], httpx.MockTransport(lose_first_response))
    try:
        async with app.router.lifespan_context(app):
            async with AsyncOpenAI(api_key=info["credential"], base_url="http://gateway/openai/v1", max_retries=2,
                http_client=httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway"),
                default_headers={"x-sdc-context-mode": "shared-task"}) as sdk:
                result = await sdk.responses.create(model="sdc-default", input="retry", extra_headers={"Idempotency-Key": "ambiguous"})
                assert result.output_text == "retry settled"
                assert admissions == 2 and fixture()["generations"] == 1 and fixture()["commands"] == 1
    finally:
        await wire.aclose()


@pytest.mark.asyncio
async def test_provider_capacity_shared_with_rest_and_control_reserve(native_fixture, monkeypatch):
    import sdc_gateway.app as gateway_module
    monkeypatch.setattr(gateway_module, "MAX_RELAYS", 1)
    info, fixture = native_fixture
    fixture("next", response={"hold": True})
    waiting, release = asyncio.Event(), asyncio.Event()
    wire = httpx.AsyncHTTPTransport()
    async def hold_discovery(request):
        if request.url.path == "/v2/public/models":
            waiting.set()
            await release.wait()
        return await wire.handle_async_request(request)
    app = create_app(info["baseUrl"], httpx.MockTransport(hold_discovery))
    headers = {"authorization": "Bearer " + info["credential"]}
    try:
        async with app.router.lifespan_context(app), httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
            pending = await client.post("/openai/v1/responses", json={"model": "sdc-default", "input": "hold", "background": True},
                headers={**headers, "idempotency-key": "reserved-cancel", "x-sdc-context-mode": "shared-task"})
            assert pending.status_code == 200
            occupied = asyncio.create_task(client.get("/openai/v1/models", headers=headers))
            await asyncio.wait_for(waiting.wait(), 5)
            try:
                assert (await client.get("/api/v1/identity", headers=headers)).status_code == 429
                assert (await client.get("/openai/v1/models", headers=headers)).status_code == 429
                cancelled = await client.post("/openai/v1/responses/" + pending.json()["id"] + "/cancel", json={}, headers=headers)
                assert cancelled.status_code == 200
            finally:
                release.set()
                assert (await occupied).status_code == 200
            assert (await client.get("/api/v1/identity", headers=headers)).status_code == 200
    finally:
        await wire.aclose()


@pytest.mark.asyncio
async def test_sdk_failed_incomplete_and_cancelled_streams(native_fixture):
    info, fixture = native_fixture
    async with sdk_client(info) as (sdk, http):
        fixture("next", response={"fail": True})
        events = [e async for e in await sdk.responses.create(model="sdc-default", input="fail", stream=True, extra_headers={"Idempotency-Key": "response-fail"})]
        assert events[-1].type == "response.failed" and events[-1].response.output == []
        fixture("next", response={"text": "0123456789abcdefEXCESS"})
        async with sdk.responses.stream(model="sdc-default", input="quota", max_output_tokens=4, extra_headers={"Idempotency-Key": "response-quota"}) as stream:
            events = [e async for e in stream]
            # This SDK helper requires completed; an incomplete event is still a
            # truthful typed terminal response and must never be renamed completed.
            with pytest.raises(RuntimeError, match="response.completed"):
                await stream.get_final_response()
            final = events[-1].response
        assert events[-1].type == "response.incomplete" and final.output_text == "0123456789abcdef"
        assert final.incomplete_details.reason == "max_output_tokens"
        fixture("next", response={"fail": True})
        headers = {"authorization": "Bearer " + info["credential"], "idempotency-key": "chat-fail", "x-sdc-context-mode": "shared-task"}
        failed = await http.post("/openai/v1/chat/completions", json={"model": "sdc-default", "messages": [{"role": "user", "content": "fail"}], "stream": True}, headers=headers)
        assert '"error"' in failed.text and "[DONE]" not in failed.text and "finish_reason" not in failed.text
        fixture("next", response={"hold": True})
        pending = await sdk.responses.create(model="sdc-default", input="cancel", background=True, extra_headers={"Idempotency-Key": "stream-cancel"})
        await sdk.responses.cancel(pending.id)
        for _ in range(100):
            if (await sdk.responses.retrieve(pending.id)).status == "cancelled":
                break
            await asyncio.sleep(0.05)
        stream = await sdk.responses.retrieve(pending.id, stream=True)
        events = [e async for e in stream]
        assert events[-1].type == "error" and events[-1].code == "sdc_cancelled"
        assert not any(e.type == "response.completed" for e in events)


@pytest.mark.asyncio
async def test_stream_revocation_before_buffered_output(native_fixture):
    info, fixture = native_fixture
    fixture("next", response={"text": "SECRET COMMITTED CONTENT"})
    wire = httpx.AsyncHTTPTransport()
    revoked = False
    async def revoke_during_poll(request):
        nonlocal revoked
        if request.method == "GET" and request.url.path.startswith("/v2/public/generations/") and not revoked:
            revoked = True
            async with httpx.AsyncClient(base_url=info["baseUrl"], trust_env=False) as owner:
                credentials = (await owner.get("/v2/public/credentials", headers={"authorization": "Bearer owner"})).json()["credentials"]
                key = next(c for c in credentials if c["label"] == "M28 synthetic SDK fixture")
                assert (await owner.post("/v2/public/credentials/" + key["credentialId"] + "/revoke", headers={"authorization": "Bearer owner"}, json={})).status_code == 200
        return await wire.handle_async_request(request)
    app = create_app(info["baseUrl"], httpx.MockTransport(revoke_during_poll))
    try:
        async with app.router.lifespan_context(app), httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
            result = await client.post("/openai/v1/responses", json={"model": "sdc-default", "input": "one", "stream": True},
                headers={"authorization": "Bearer " + info["credential"], "idempotency-key": "revoke-stream", "x-sdc-context-mode": "shared-task"})
            assert revoked and result.status_code == 200
            records = [json.loads(line[6:]) for line in result.text.splitlines() if line.startswith("data: ")]
            assert records[-1]["type"] == "error" and records[-1]["code"] == "unauthorized"
            assert "SECRET COMMITTED CONTENT" not in result.text and '"type":"response.completed"' not in result.text
            assert fixture()["generations"] == 1
    finally:
        await wire.aclose()


@pytest.mark.asyncio
async def test_expired_response_and_retry_remain_tombstones(native_fixture):
    info, fixture = native_fixture
    async with sdk_client(info) as (sdk, _):
        fixture("next", response={"text": "retained"})
        original = await sdk.responses.create(model="sdc-default", input="one", extra_headers={"Idempotency-Key": "expired-original"})
        before = fixture()["commands"]
        fixture("expire", generationId=original.id.removeprefix("resp_"))
        with pytest.raises(APIStatusError) as expired:
            await sdk.responses.retrieve(original.id)
        assert expired.value.status_code == 410
        with pytest.raises(APIStatusError) as retry:
            await sdk.responses.create(model="sdc-default", input="one", extra_headers={"Idempotency-Key": "expired-original"})
        assert retry.value.status_code == 410
        assert fixture()["generations"] == 1 and fixture()["commands"] == before
