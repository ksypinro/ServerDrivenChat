"""MB-05 developer probe. No network, file access, or model invocation.

Only specially marked prompts in the already selected disposable session enter
failure injection. This is not an authority service or a production hook.
"""
import hashlib
import json
import sys
import time

PREFIX = "SDC-MB05-FENCE:"
SESSION_DIGEST = "763571110b7e7f52"
MAX_BYTES = 65536


def block(reason):
    print(json.dumps({"decision": "block", "reason": reason,
                      "hookSpecificOutput": {"hookEventName": "UserPromptSubmit",
                                             "suppressOriginalPrompt": True}}))


def main():
    raw = sys.stdin.buffer.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        block("SDC evaluation input exceeds bound")
        return
    event = json.loads(raw)
    if not isinstance(event, dict) or event.get("hook_event_name") != "UserPromptSubmit":
        block("SDC evaluation received an unexpected event")
        return
    prompt = event.get("prompt")
    if not isinstance(prompt, str):
        block("SDC evaluation requires text")
        return
    if not prompt.startswith(PREFIX):
        return
    session = event.get("session_id", "")
    if not isinstance(session, str) or hashlib.sha256(session.encode()).hexdigest()[:16] != SESSION_DIGEST:
        block("SDC evaluation is restricted to the selected conversation")
        return
    mode = prompt[len(PREFIX):].split(" ", 1)[0]
    if mode == "crash":
        # No event data in exception output.
        raise RuntimeError("SDC injected hook failure")
    if mode == "malformed":
        # Braces force Claude's JSON parsing path; incomplete braces can instead
        # be treated as ordinary additional-context text by a classic hook.
        print('{"decision": }')
        return
    if mode == "timeout":
        time.sleep(5)  # Native configuration bounds this to one second.
        block("SDC timeout probe unexpectedly completed")
        return
    # Even unknown/allow-shaped modes refuse: this package cannot authorize input.
    block("SDC evaluation deliberately refused this marked prompt")


if __name__ == "__main__":
    main()
