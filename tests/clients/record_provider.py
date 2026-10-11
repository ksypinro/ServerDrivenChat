"""Disposable loopback recorder for a named client's OpenAI wire shape."""

import json
import os
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


OUTPUT = Path(os.environ["SDC_CLIENT_WIRE_OUTPUT"])
PORT = int(os.environ.get("SDC_CLIENT_WIRE_PORT", "59330"))
FAIL_ONCE = os.environ.get("SDC_CLIENT_WIRE_FAIL_ONCE") == "1"
SEEN = set()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        return

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length))
        headers = {name.lower(): value for name, value in self.headers.items()}
        request_key = headers.get("idempotency-key")
        record = {
            "method": "POST",
            "path": self.path,
            "headers": {name: headers.get(name) for name in (
                "content-type", "user-agent"
            ) if name in headers},
            "idempotency_key_digest": hashlib.sha256(request_key.encode()).hexdigest()[:16] if request_key else None,
            "body": body,
        }
        with OUTPUT.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(record, ensure_ascii=False) + "\n")
        if self.path not in ("/openai/v1/chat/completions", "/anthropic/v1/messages"):
            status = 404
            result = {"error": {"message": "Unexpected client path", "type": "invalid_request_error", "code": "unexpected_path"}}
        elif not request_key:
            status = 400
            result = {"error": {"message": "Idempotency-Key required", "type": "invalid_request_error", "code": "idempotency_key_required"}}
        elif FAIL_ONCE and request_key not in SEEN:
            SEEN.add(request_key)
            status = 502
            result = {"error": {"message": "Injected retryable 502", "type": "server_error", "code": "upstream_error"}}
        elif self.path == "/anthropic/v1/messages":
            status = 200
            result = {"id": "msg_m30recorder", "type": "message", "role": "assistant",
                      "model": "sdc-default", "content": [{"type": "text", "text": "RECORDER_OK"}],
                      "stop_reason": "end_turn", "stop_sequence": None,
                      "usage": {"input_tokens": 1, "output_tokens": 1}}
        else:
            status = 200
            result = {"id": "chatcmpl-m30recorder", "object": "chat.completion", "created": 0,
                      "model": "sdc-default", "choices": [{"index": 0, "finish_reason": "stop",
                      "message": {"role": "assistant", "content": "RECORDER_OK"}}],
                      "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}}
        encoded = json.dumps(result).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
