"""Stateful retry-key checks for the pinned Aider transport shim."""

import importlib.util
import pathlib
import unittest


PATH = pathlib.Path(__file__).with_name("sdc_aider.py")
SPEC = importlib.util.spec_from_file_location("sdc_aider_test_target", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class RetryIdentityTests(unittest.TestCase):
    def test_failure_retry_and_identical_new_submission(self):
        observed = []
        attempts = 0

        def transport(_coder, _messages, model=None, functions=None):
            nonlocal attempts
            observed.append(MODULE.CURRENT_KEY.get())
            attempts += 1
            if attempts == 1:
                raise ConnectionError("lost reply")
            yield "done"

        old = MODULE.original_send
        MODULE.original_send = transport
        try:
            coder = type("CoderFixture", (), {})()
            first = [{"role": "user", "content": "identical"}]
            with self.assertRaises(ConnectionError):
                list(MODULE.send_with_key(coder, first))
            self.assertEqual(list(MODULE.send_with_key(coder, first)), ["done"])
            second = [{"role": "user", "content": "identical"}]
            self.assertEqual(list(MODULE.send_with_key(coder, second)), ["done"])
            self.assertEqual(observed[0], observed[1])
            self.assertNotEqual(observed[1], observed[2])
            self.assertEqual(coder._sdc_pending_requests, [])
        finally:
            MODULE.original_send = old

    def test_header_is_dynamic_and_static_key_is_rejected(self):
        captured = []

        def transport(model, *_args):
            captured.append(model.extra_params.copy())
            return "ok"

        old = MODULE.original_completion
        MODULE.original_completion = transport
        try:
            model = type("ModelFixture", (), {"name": "anthropic/sdc-default", "extra_params": {}})()
            token = MODULE.CURRENT_KEY.set("aider-test-key")
            try:
                self.assertEqual(MODULE.completion_with_key(model, [], None, False), "ok")
                self.assertEqual(captured[0]["extra_headers"]["Idempotency-Key"], "aider-test-key")
                self.assertEqual(captured[0]["extra_headers"]["X-SDC-Context-Mode"], "shared-task")
                self.assertEqual(captured[0]["num_retries"], 0)
                self.assertEqual(model.extra_params, {})
                model.extra_params = {"extra_headers": {"Idempotency-Key": "static"}}
                with self.assertRaises(RuntimeError):
                    MODULE.completion_with_key(model, [], None, False)
            finally:
                MODULE.CURRENT_KEY.reset(token)
        finally:
            MODULE.original_completion = old


if __name__ == "__main__":
    unittest.main()
