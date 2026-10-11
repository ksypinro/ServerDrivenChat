"""Real gateway -> TypeScript HTTP -> PostgreSQL, with explicitly simulated native events."""
import asyncio
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sdc_gateway.app import create_app
from sdc_gateway.models import (Operation, Transcript, Health, Identity, Capabilities, Sessions, Models,
                                ModelAlias, SessionDetails, SessionCapabilities, Snapshot, Credentials,
                                CredentialIssued, ControlRecorded, CommandReceipt)

ROOT = Path(__file__).resolve().parents[2]
pytestmark = pytest.mark.skipif(not os.environ.get("M27_TEST_DATABASE_URL"), reason="requires disposable PostgreSQL and built TypeScript server")

@pytest.fixture
def server():
    proc = subprocess.Popen([os.environ.get("SDC_TEST_NODE", "node"), str(ROOT / "tests/helpers/m27-gateway-server.mjs")], cwd=ROOT,
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        info = json.loads(proc.stdout.readline())
        yield proc, info["baseUrl"]
    finally:
        proc.stdin.close()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.terminate()
            proc.wait(timeout=10)
        assert proc.returncode == 0

@pytest.mark.asyncio
async def test_real_two_gateway_workers_retry_wait_and_restart(server):
    proc, base = server
    apps = [create_app(base), create_app(base)]
    headers = {"authorization": "Bearer owner", "idempotency-key": "exact-original"}
    body = {"model": "sdc.b-session", "content": [{"type": "text", "text": "M27 disposable integration"}]}
    async with apps[0].router.lifespan_context(apps[0]), apps[1].router.lifespan_context(apps[1]):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=apps[0]), base_url="http://gateway-a") as a, httpx.AsyncClient(transport=httpx.ASGITransport(app=apps[1]), base_url="http://gateway-b") as b:
            replies = await asyncio.gather(a.post("/api/v1/sessions/session/prompts", json=body, headers=headers), b.post("/api/v1/sessions/session/prompts", json=body, headers=headers))
            assert all(r.status_code == 202 for r in replies)
            op = replies[0].json()
            assert op["operationId"] == replies[1].json()["operationId"]
            rejected = await b.post("/api/v1/sessions/session/prompts", json={**body, "tools": []}, headers=headers)
            assert rejected.status_code == 422
            competing = await b.post("/api/v1/sessions/session/prompts", json=body, headers={**headers, "idempotency-key": "new-call"})
            assert competing.status_code == 409
            waiting = asyncio.create_task(a.post("/api/v1/sessions/session/prompts", json=body, headers={**headers, "prefer": "wait=2"}))
            await asyncio.sleep(0.05)
            proc.stdin.write(json.dumps({"action": "complete", "operationId": op["operationId"]}) + "\n"); proc.stdin.flush()
            assert json.loads(await asyncio.to_thread(proc.stdout.readline))["ok"]
            result = await waiting
            assert result.status_code == 200
            assert result.json()["result"]["answer"] == "SIMULATED gateway fixture answer"
            assert result.json()["result"]["items"][0]["nativeCategory"] == "completion_result"
            Operation.model_validate(result.json())
            transcript = await a.get("/api/v1/sessions/session/transcript", headers={"authorization": "Bearer owner"})
            assert transcript.status_code == 200
            Transcript.model_validate(transcript.json())
            for route, model in (("health", Health), ("identity", Identity), ("capabilities", Capabilities),
                                 ("sessions", Sessions), ("models", Models), ("models/sdc.b-session", ModelAlias),
                                 ("sessions/session", SessionDetails), ("sessions/session/capabilities", SessionCapabilities),
                                 ("sessions/session/snapshot", Snapshot), ("credentials", Credentials),
                                 ("sessions/session/commands/" + op["commandId"], CommandReceipt)):
                response = await a.get("/api/v1/" + route, headers={"authorization": "Bearer owner"})
                assert response.status_code == 200
                model.model_validate(response.json())
            control = await a.post("/api/v1/sessions/session/controls", headers={"authorization": "Bearer owner"},
                                   json={"type": "session.disable", "commandId": "typed-control", "reason": "disposable fixture"})
            assert control.status_code == 202
            ControlRecorded.model_validate(control.json())
    # A new gateway has no operation database or cache. It retrieves the original server state.
    restart = create_app(base)
    async with restart.router.lifespan_context(restart):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=restart), base_url="http://restarted") as client:
            result = await client.get("/api/v1/operations/" + op["operationId"], headers={"authorization": "Bearer owner"})
            assert result.status_code == 200
            assert result.json()["status"] == "completed"

@pytest.mark.asyncio
async def test_real_gateway_key_scope_and_live_revocation(server):
    _, base = server
    app = create_app(base)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
            response = await client.post("/api/v1/credentials", json={"sessionId": "session", "label": "disposable integration key", "scopes": ["view"], "expiresAt": (datetime.now(timezone.utc)+timedelta(minutes=5)).isoformat()}, headers={"authorization": "Bearer owner"})
            assert response.status_code == 201
            issued = response.json()
            CredentialIssued.model_validate(issued)
            assert (await client.get("/api/v1/identity", headers={"authorization": "Bearer " + issued["credential"]})).status_code == 200
            denied = await client.post("/api/v1/sessions/session/prompts", json={"model": "sdc.b-session", "content": [{"type": "text", "text": "scope test"}]}, headers={"authorization": "Bearer " + issued["credential"], "idempotency-key": "scope"})
            assert denied.status_code == 403
            revoked = await client.post("/api/v1/credentials/" + issued["credentialId"] + "/revoke", headers={"authorization": "Bearer owner"})
            assert revoked.status_code == 200
            assert (await client.get("/api/v1/identity", headers={"authorization": "Bearer " + issued["credential"]})).status_code == 401

@pytest.mark.asyncio
async def test_real_tcp_sse_replay_and_revocation_close_the_stream(server):
    import socket
    import time
    proc, base = server
    with socket.socket() as candidate:
        candidate.bind(("127.0.0.1", 0))
        port = candidate.getsockname()[1]
    env = {**os.environ, "SDC_SERVER_URL": base}
    gateway = subprocess.Popen([sys.executable, "-m", "uvicorn", "sdc_gateway.app:create_app", "--factory", "--host", "127.0.0.1", "--port", str(port), "--no-access-log", "--log-level", "critical"], cwd=ROOT / "api-gateway", env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{port}", timeout=5) as client:
            for _ in range(100):
                try:
                    if (await client.get("/openapi.json")).status_code == 200:
                        break
                except httpx.ConnectError:
                    await asyncio.sleep(0.05)
            else:
                pytest.fail("Gateway did not start")
            created = await client.post("/api/v1/credentials", json={"sessionId": "session", "label": "SSE scope fixture", "scopes": ["view", "prompt"], "expiresAt": (datetime.now(timezone.utc)+timedelta(minutes=5)).isoformat()}, headers={"authorization": "Bearer owner"})
            assert created.status_code == 201
            key = created.json()
            credential = {"authorization": "Bearer " + key["credential"]}
            result = await client.post("/api/v1/sessions/session/prompts", json={"model": "sdc.b-session", "content": [{"type": "text", "text": "SSE fixture"}]}, headers={**credential, "idempotency-key": "sse"})
            assert result.status_code == 202
            proc.stdin.write(json.dumps({"action": "complete", "operationId": result.json()["operationId"]}) + "\n"); proc.stdin.flush()
            assert json.loads(await asyncio.to_thread(proc.stdout.readline))["ok"]
            async with client.stream("GET", "/api/v1/sessions/session/events", headers={**credential, "last-event-id": "3"}) as stream:
                assert stream.status_code == 200
                chunks = stream.aiter_lines()
                assert await anext(chunks) == "id: 4"
                while await anext(chunks) != "":
                    pass
                revoked = await client.post("/api/v1/credentials/" + key["credentialId"] + "/revoke", headers={"authorization": "Bearer owner"})
                assert revoked.status_code == 200
                # Revocation withdraws access; closing a stream does not cancel native work.
                with pytest.raises((httpx.RemoteProtocolError, StopAsyncIteration)):
                    while True:
                        await anext(chunks)
    finally:
        gateway.terminate()
        gateway.wait(timeout=10)

@pytest.mark.asyncio
async def test_real_server_owned_generation_context_and_estimates(server):
    from sdc_gateway.models import Generation, Conversation
    proc, base = server
    app = create_app(base)
    headers = {"authorization": "Bearer owner", "idempotency-key": "server-context"}
    body = {"model": "sdc-default", "sessionId": "session", "history": [{"role": "user", "content": "remember fixture"}]}
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
            admission = await client.post("/api/v1/generations", json=body, headers=headers)
            assert admission.status_code == 202
            generation = Generation.model_validate(admission.json())
            rejected = await client.post("/api/v1/generations", json={**body, "temperature": 0.1}, headers=headers)
            assert rejected.status_code == 422
            proc.stdin.write(json.dumps({"action": "complete", "operationId": generation.generationId}) + "\n")
            proc.stdin.flush()
            assert json.loads(await asyncio.to_thread(proc.stdout.readline))["ok"]
            response = await client.get("/api/v1/generations/" + generation.generationId, headers=headers)
            result = Generation.model_validate(response.json())
            assert result.status == "completed"
            assert result.result.usage.source == "estimated"
            assert result.result.usage.hiddenNativeContext == "unknown"
            assert result.result.text == "SIMULATED gateway fixture answer"
            context_response = await client.get("/api/v1/conversations/" + generation.conversationId, headers=headers)
            context = Conversation.model_validate(context_response.json())
            assert context.version == 1
            assert context.history[-1].role == "assistant"
            assert (await client.post("/api/v1/generations", json=body, headers=headers)).json()["generationId"] == generation.generationId
