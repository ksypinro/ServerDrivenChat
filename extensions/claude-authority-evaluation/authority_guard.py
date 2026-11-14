"""Disposable Claude UserPromptSubmit authority-transition diagnostic.

This is an evaluation fixture, not an SDC credential or production guard.
It reads only the bounded hook JSON and the fixed disposable authority file
under the current user's temporary directory. It does not access the network,
transcript, workspace, or model.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import time

SELECTED_SESSION_DIGEST = "763571110b7e7f52"
MARKERS = ("SDC-MB05-FENCE:", "SDC-MB05-AUTH:")
MAX_INPUT_BYTES = 65_536
MAX_STATE_BYTES = 4_096
PRIVATE_DIR = Path(tempfile.gettempdir()) / "sdc-mb05-authority-evaluation"
STATE_PATH = PRIVATE_DIR / "authority.json"
TRACE_PATH = PRIVATE_DIR / "trace.jsonl"


def _block(reason: str) -> None:
    print(json.dumps({
        "decision": "block",
        "reason": "SDC disposable authority probe refused this prompt: " + reason,
    }))


def _read_private_state(state_path: Path) -> bytes:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(state_path, flags)
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid():
            raise ValueError("unsafe-state-file")
        if info.st_size > MAX_STATE_BYTES:
            raise ValueError("state-too-large")
        return stream.read(MAX_STATE_BYTES + 1)


def evaluate(raw: bytes, state_path: Path = STATE_PATH,
             trace_path: Path = TRACE_PATH, now_ms: int | None = None) -> str:
    """Return ``pass`` or ``block``; non-marked local prompts are untouched."""
    if len(raw) > MAX_INPUT_BYTES:
        return "block:input-too-large"
    try:
        event = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return "block:invalid-hook-json"
    if not isinstance(event, dict) or event.get("hook_event_name") != "UserPromptSubmit":
        return "block:unexpected-event"
    prompt = event.get("prompt")
    if not isinstance(prompt, str):
        return "block:non-text-prompt"
    marker = next((item for item in MARKERS if prompt.startswith(item)), None)
    if marker is None:
        return "pass:unmarked"

    session_id = event.get("session_id")
    if not isinstance(session_id, str) or not session_id:
        _write_trace(trace_path, "block", "unavailable", None, "", "missing-session")
        return "block:missing-session"
    session_digest = hashlib.sha256(session_id.encode("utf-8")).hexdigest()[:16]
    label = prompt[len(marker):].split(" ", 1)[0]
    if session_digest != SELECTED_SESSION_DIGEST:
        _write_trace(trace_path, "block", session_digest, None, label, "wrong-session")
        return "block:wrong-session"

    try:
        state_bytes = _read_private_state(state_path)
        if len(state_bytes) > MAX_STATE_BYTES:
            raise ValueError("state-too-large")
        state = json.loads(state_bytes)
        if not isinstance(state, dict) or state.get("schema") != 1:
            raise ValueError("bad-state-schema")
        generation = state.get("generation")
        if not isinstance(generation, int) or isinstance(generation, bool) or generation < 1:
            raise ValueError("bad-generation")
        if state.get("session_digest") != session_digest:
            raise ValueError("wrong-state-session")
        if state.get("active") is not True:
            raise ValueError("revoked")
        expires = state.get("expires_at_unix_ms")
        if not isinstance(expires, int) or isinstance(expires, bool):
            raise ValueError("bad-expiry")
        current_ms = int(time.time() * 1000) if now_ms is None else now_ms
        if expires <= current_ms:
            raise ValueError("expired")
    except FileNotFoundError:
        _write_trace(trace_path, "block", session_digest, None, label, "state-missing")
        return "block:state-missing"
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        reason = str(error) or "invalid-state"
        _write_trace(trace_path, "block", session_digest, None, label, reason)
        return "block:" + reason

    _write_trace(trace_path, "allow", session_digest, generation, label, "active")
    return "pass:active"


def _write_trace(trace_path: Path, decision: str, session_digest: str,
                 generation: int | None, label: str, reason: str) -> None:
    trace_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    directory = trace_path.parent.lstat()
    if not stat.S_ISDIR(directory.st_mode) or directory.st_uid != os.getuid():
        raise OSError("unsafe diagnostic directory")
    try:
        os.chmod(trace_path.parent, 0o700)
    except OSError:
        pass
    record = {
        "at_unix_ms": int(time.time() * 1000),
        "event": "authority-check",
        "decision": decision,
        "session_digest": session_digest,
        "generation": generation,
        "label": label[:24],
        "reason": reason[:64],
    }
    fd = os.open(trace_path, os.O_WRONLY | os.O_CREAT | os.O_APPEND |
                 getattr(os, "O_NOFOLLOW", 0), 0o600)
    info = os.fstat(fd)
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid():
        os.close(fd)
        raise OSError("unsafe diagnostic trace")
    with os.fdopen(fd, "a", encoding="utf-8") as stream:
        stream.write(json.dumps(record, separators=(",", ":")) + "\n")


def main() -> None:
    raw = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
    outcome = evaluate(raw)
    if outcome.startswith("block:"):
        _block(outcome.split(":", 1)[1])


if __name__ == "__main__":
    main()
