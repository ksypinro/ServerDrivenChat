"""Pinned Aider 0.86.2 entry point with a stable key for each model send.

Aider retries `Coder.send` inside `Coder.send_message`. The messages list is
reused on that retry path. The key remains pending after transport failure and
is removed only after `send` finishes successfully. A later, identical user
submission receives a new list and a new key. This shim is limited to the
documented SDC service alias; it never changes server deduplication policy.
"""

import contextvars
import uuid

from aider import main
from aider.coders.base_coder import Coder
from aider.models import Model


CURRENT_KEY = contextvars.ContextVar("sdc_aider_idempotency_key", default=None)
original_send = Coder.send
original_completion = Model.send_completion


def send_with_key(self, messages, model=None, functions=None):
    pending = self.__dict__.setdefault("_sdc_pending_requests", [])
    request = next((entry for entry in pending if entry[0] is messages), None)
    if request is None:
        request = (messages, "aider-" + uuid.uuid4().hex)
        pending.append(request)
    key = request[1]
    token = CURRENT_KEY.set(key)
    try:
        yield from original_send(self, messages, model=model, functions=functions)
    except BaseException:
        raise
    else:
        pending.remove(request)
    finally:
        CURRENT_KEY.reset(token)


def completion_with_key(self, messages, functions, stream, temperature=None):
    if self.name not in ("openai/sdc-default", "anthropic/sdc-default"):
        raise RuntimeError("This M30 client profile supports only the two SDC aliases")
    key = CURRENT_KEY.get()
    if key is None:
        raise RuntimeError("SDC model call has no retry-scoped request key")
    previous = self.extra_params
    current = dict(previous or {})
    headers = dict(current.get("extra_headers") or {})
    if "Idempotency-Key" in headers or "idempotency-key" in headers:
        raise RuntimeError("Static idempotency headers conflict with the retry-scoped key")
    headers["Idempotency-Key"] = key
    headers["X-SDC-Context-Mode"] = "shared-task"
    current["extra_headers"] = headers
    current["num_retries"] = 0
    self.extra_params = current
    try:
        return original_completion(self, messages, functions, stream, temperature)
    finally:
        self.extra_params = previous


Coder.send = send_with_key
Model.send_completion = completion_with_key

if __name__ == "__main__":
    main.main()
