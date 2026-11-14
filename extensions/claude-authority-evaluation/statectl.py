"""Write synthetic authority for the bounded MB-05 native experiment only."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import tempfile
import time

SESSION_DIGEST = "763571110b7e7f52"
PRIVATE_DIR = Path(tempfile.gettempdir()) / "sdc-mb05-authority-evaluation"
STATE_PATH = PRIVATE_DIR / "authority.json"


def save(active: bool, ttl_seconds: int = 60) -> None:
    """Create or revoke the synthetic state, incrementing its generation."""
    PRIVATE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = PRIVATE_DIR.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid():
        raise SystemExit("Refusing unsafe temporary directory")
    os.chmod(PRIVATE_DIR, 0o700)
    generation = 1
    try:
        previous = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        if previous.get("session_digest") != SESSION_DIGEST:
            raise SystemExit("Refusing to overwrite state for a different session")
        generation = int(previous["generation"]) + 1
    except FileNotFoundError:
        pass
    state = {
        "schema": 1,
        "active": active,
        "generation": generation,
        "session_digest": SESSION_DIGEST,
        "expires_at_unix_ms": int(time.time() * 1000) + (max(1, ttl_seconds) * 1000 if active else 0),
    }
    temporary = STATE_PATH.with_suffix(".tmp")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC |
                 getattr(os, "O_NOFOLLOW", 0), 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        json.dump(state, stream, separators=(",", ":"))
        stream.flush()
        os.fsync(stream.fileno())
    try:
        existing = STATE_PATH.lstat()
        if not stat.S_ISREG(existing.st_mode) or existing.st_uid != os.getuid():
            raise SystemExit("Refusing unsafe existing state file")
    except FileNotFoundError:
        pass
    os.replace(temporary, STATE_PATH)
    os.chmod(STATE_PATH, 0o600)
    print(json.dumps({"active": active, "generation": generation,
                      "session_digest": SESSION_DIGEST,
                      "expires_at_unix_ms": state["expires_at_unix_ms"]}))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    grant = commands.add_parser("grant", help="create a short-lived synthetic permit")
    grant.add_argument("--ttl-seconds", type=int, default=60)
    commands.add_parser("revoke", help="invalidate the synthetic permit")
    args = parser.parse_args()
    save(active=args.action == "grant", ttl_seconds=getattr(args, "ttl_seconds", 60))


if __name__ == "__main__":
    main()
