"""Unit tests for the synthetic authority file check; not native acceptance."""

import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "sdc_authority_guard", Path(__file__).with_name("authority_guard.py"))
guard = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(guard)
STATECTL_SPEC = importlib.util.spec_from_file_location(
    "sdc_authority_statectl", Path(__file__).with_name("statectl.py"))
statectl = importlib.util.module_from_spec(STATECTL_SPEC)
STATECTL_SPEC.loader.exec_module(statectl)


class AuthorityGuardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.state_path = self.root / "authority.json"
        self.trace_path = self.root / "trace.jsonl"
        self.session_id = "fixture-session"
        self.digest = hashlib.sha256(self.session_id.encode()).hexdigest()[:16]

    def tearDown(self):
        self.temp.cleanup()

    def event(self, prompt="SDC-MB05-AUTH:queue fixed harmless test", session_id=None):
        return json.dumps({"hook_event_name": "UserPromptSubmit", "prompt": prompt,
                           "session_id": session_id or self.session_id}).encode()

    def write_state(self, **overrides):
        state = {"schema": 1, "active": True, "generation": 4,
                 "session_digest": self.digest, "expires_at_unix_ms": 2000}
        state.update(overrides)
        self.state_path.write_text(json.dumps(state), encoding="utf-8")

    def check(self, raw=None, now_ms=1000, session_id=None):
        if raw is None and session_id is not None:
            raw = self.event(session_id=session_id)
        with patch.object(guard, "SELECTED_SESSION_DIGEST", self.digest):
            return guard.evaluate(raw or self.event(), self.state_path, self.trace_path, now_ms)

    def test_active_matching_authority_passes_and_logs_no_prompt(self):
        self.write_state()
        self.assertEqual(self.check(), "pass:active")
        record = json.loads(self.trace_path.read_text().strip())
        self.assertEqual(record["decision"], "allow")
        self.assertEqual(record["generation"], 4)
        self.assertNotIn("fixed harmless test", self.trace_path.read_text())

    def test_revoked_authority_blocks(self):
        self.write_state(active=False, generation=5)
        self.assertEqual(self.check(), "block:revoked")

    def test_expired_authority_blocks_at_boundary(self):
        self.write_state(expires_at_unix_ms=1000)
        self.assertEqual(self.check(now_ms=1000), "block:expired")

    def test_missing_state_fails_closed(self):
        self.assertEqual(self.check(), "block:state-missing")

    def test_wrong_session_and_wrong_state_binding_block(self):
        other = "other-session"
        self.write_state(session_digest=hashlib.sha256(other.encode()).hexdigest()[:16])
        self.assertEqual(self.check(), "block:wrong-state-session")
        self.write_state()
        self.assertEqual(self.check(session_id=other), "block:wrong-session")

    def test_malformed_and_oversized_authority_block(self):
        self.state_path.write_text("{", encoding="utf-8")
        self.assertTrue(self.check().startswith("block:"))
        self.state_path.write_bytes(b"x" * (guard.MAX_STATE_BYTES + 1))
        self.assertEqual(self.check(), "block:state-too-large")

    def test_unmarked_input_passes_without_reading_authority(self):
        self.assertEqual(self.check(self.event("ordinary local input")), "pass:unmarked")
        self.assertFalse(self.trace_path.exists())

    def test_invalid_event_and_oversized_input_block(self):
        wrong = json.dumps({"hook_event_name": "Stop", "prompt": "x"}).encode()
        self.assertEqual(self.check(wrong), "block:unexpected-event")
        self.assertEqual(self.check(b"x" * (guard.MAX_INPUT_BYTES + 1)), "block:input-too-large")

    def test_symlinked_state_is_not_followed(self):
        outside = self.root / "outside.json"
        outside.write_text("{}", encoding="utf-8")
        self.state_path.symlink_to(outside)
        self.assertTrue(self.check().startswith("block:"))
        self.assertEqual(outside.read_text(encoding="utf-8"), "{}")

    def test_native_hook_entrypoint_emits_block_json_for_revocation(self):
        self.write_state(active=False, generation=5)
        incoming = io.TextIOWrapper(io.BytesIO(self.event()))
        output = io.StringIO()
        with patch.object(guard, "STATE_PATH", self.state_path), \
                patch.object(guard, "TRACE_PATH", self.trace_path), \
                patch.object(guard, "SELECTED_SESSION_DIGEST", self.digest), \
                patch.object(sys, "stdin", incoming), patch.object(sys, "stdout", output):
            guard.main()
        self.assertEqual(json.loads(output.getvalue())["decision"], "block")

    def test_state_helper_grant_then_revoke_increments_generation(self):
        state_path = self.root / "authority.json"
        with patch.object(statectl, "PRIVATE_DIR", self.root), \
                patch.object(statectl, "STATE_PATH", state_path), \
                redirect_stdout(io.StringIO()):
            statectl.save(active=True, ttl_seconds=30)
            granted = json.loads(state_path.read_text(encoding="utf-8"))
            statectl.save(active=False)
        revoked = json.loads(state_path.read_text(encoding="utf-8"))
        self.assertTrue(granted["active"])
        self.assertEqual(revoked["generation"], granted["generation"] + 1)
        self.assertFalse(revoked["active"])


if __name__ == "__main__":
    unittest.main()
