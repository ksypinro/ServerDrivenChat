"""Script tests only: native onFailure behavior requires the IDE experiment."""
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("sdc_guard", Path(__file__).with_name("guard.py"))
guard = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(guard)


class GuardTests(unittest.TestCase):
    def invoke(self, prompt, session="fixture-session", **overrides):
        event = {"prompt": prompt, "session_id": session, "hook_event_name": "UserPromptSubmit", **overrides}
        out = io.StringIO()
        incoming = io.TextIOWrapper(io.BytesIO(json.dumps(event).encode()))
        digest = guard.hashlib.sha256(b"fixture-session").hexdigest()[:16]
        with patch.object(guard, "SESSION_DIGEST", digest), patch("sys.stdin", incoming), patch("sys.stdout", out):
            guard.main()
        return out.getvalue()

    def test_unmarked_passes_without_output(self):
        self.assertEqual(self.invoke("ordinary local input"), "")

    def test_marked_unknown_and_allow_modes_never_authorize(self):
        for mode in ["refuse", "allow", "", "unknown"]:
            self.assertEqual(json.loads(self.invoke(guard.PREFIX + mode))["decision"], "block")

    def test_wrong_session_does_not_inject_failure(self):
        self.assertEqual(json.loads(self.invoke(guard.PREFIX + "crash", "wrong"))["decision"], "block")

    def test_crash_contains_no_prompt_data(self):
        with self.assertRaisesRegex(RuntimeError, "^SDC injected hook failure$"):
            self.invoke(guard.PREFIX + "crash PRIVATE")

    def test_malformed_deliberately_invalid(self):
        output = self.invoke(guard.PREFIX + "malformed").strip()
        self.assertTrue(output.startswith("{") and output.endswith("}"))
        with self.assertRaises(json.JSONDecodeError):
            json.loads(output)

    def test_timeout_branch_ends_in_refusal_if_not_killed(self):
        with patch.object(guard.time, "sleep") as sleep:
            self.assertEqual(json.loads(self.invoke(guard.PREFIX + "timeout"))["decision"], "block")
            sleep.assert_called_once_with(5)

    def test_unexpected_event_and_nontext_refuse(self):
        self.assertEqual(json.loads(self.invoke("x", hook_event_name="Stop"))["decision"], "block")
        self.assertEqual(json.loads(self.invoke(None))["decision"], "block")


if __name__ == "__main__":
    unittest.main()
