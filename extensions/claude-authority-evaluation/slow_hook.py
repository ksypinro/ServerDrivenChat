"""Second parallel UserPromptSubmit handler for the stale-check race test."""

from __future__ import annotations

import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import time

MARKERS = ("SDC-MB05-FENCE:", "SDC-MB05-AUTH:")
PRIVATE_DIR = Path(tempfile.gettempdir()) / "sdc-mb05-authority-evaluation"
TRACE_PATH = PRIVATE_DIR / "trace.jsonl"
DELAY_SECONDS = 8


def trace(event: str, label: str) -> None:
    PRIVATE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    directory = PRIVATE_DIR.lstat()
    if not stat.S_ISDIR(directory.st_mode) or directory.st_uid != os.getuid():
        raise OSError("unsafe diagnostic directory")
    os.chmod(PRIVATE_DIR, 0o700)
    record = {"at_unix_ms": int(time.time() * 1000), "event": event,
              "label": label[:24]}
    fd = os.open(TRACE_PATH, os.O_WRONLY | os.O_CREAT | os.O_APPEND |
                 getattr(os, "O_NOFOLLOW", 0), 0o600)
    info = os.fstat(fd)
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid():
        os.close(fd)
        raise OSError("unsafe diagnostic trace")
    with os.fdopen(fd, "a", encoding="utf-8") as stream:
        stream.write(json.dumps(record, separators=(",", ":")) + "\n")


def main() -> None:
    raw = sys.stdin.buffer.read(65_537)
    if len(raw) > 65_536:
        return
    try:
        event = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return
    prompt = event.get("prompt") if isinstance(event, dict) else None
    if not isinstance(prompt, str):
        return
    marker = next((item for item in MARKERS if prompt.startswith(item)), None)
    if marker is None:
        return
    label = prompt[len(marker):].split(" ", 1)[0]
    trace("slow-hook-start", label)
    time.sleep(DELAY_SECONDS)
    trace("slow-hook-end", label)


if __name__ == "__main__":
    main()
