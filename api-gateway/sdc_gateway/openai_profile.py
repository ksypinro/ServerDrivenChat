"""OpenAI wire shapes for the declared SDC profile; no model or caller-tool executor."""
import json
import re
from datetime import datetime
from typing import Literal
from urllib.parse import urlsplit, parse_qs

from pydantic import Field, JsonValue, ValidationError, field_validator

from .models import RequestModel, GenerationRequest


class ProfileError(Exception):
    def __init__(self, message, code="unsupported_parameter", status=422, param=None):
        self.message, self.code, self.status, self.param = message, code, status, param


class ChatRequest(RequestModel):
    model: str
    messages: list[dict[str, JsonValue]] = Field(min_length=1, max_length=256)
    tools: list[dict[str, JsonValue]] = Field(default_factory=list, max_length=32)
    tool_choice: str | dict[str, JsonValue] = "auto"
    parallel_tool_calls: bool = False
    max_tokens: int | None = Field(default=None, ge=1, le=8192)
    max_completion_tokens: int | None = Field(default=None, ge=1, le=8192)
    n: Literal[1] = 1
    stream: bool = False
    stream_options: dict[str, JsonValue] | None = None
    response_format: dict[str, JsonValue] | None = None

    @field_validator("n", mode="before")
    @classmethod
    def one_choice(cls, value):
        if type(value) is not int or value != 1:
            raise ValueError("Only integer n=1 is supported")
        return value


class ResponsesRequest(RequestModel):
    model: str
    input: str | list[dict[str, JsonValue]]
    instructions: str = Field(default="", max_length=32768)
    previous_response_id: str | None = None
    tools: list[dict[str, JsonValue]] = Field(default_factory=list, max_length=32)
    tool_choice: str | dict[str, JsonValue] = "auto"
    parallel_tool_calls: bool = False
    max_output_tokens: int = Field(default=8192, ge=1, le=8192)
    background: bool = False
    store: Literal[True] = True
    stream: bool = False
    truncation: Literal["disabled"] = "disabled"
    text: dict[str, JsonValue] | None = None

    @field_validator("store", mode="before")
    @classmethod
    def local_retention(cls, value):
        if value is not True:
            raise ValueError("Only store=true is supported")
        return value


def record(value, fields, param):
    if not isinstance(value, dict) or set(value) - set(fields):
        raise ProfileError("Unsupported object fields", param=param)
    return value


def text_content(value, types=("text",)):
    if isinstance(value, str):
        return value
    if not isinstance(value, list):
        raise ProfileError("Only text content is supported here", param="content")
    parts = []
    for part in value:
        part = record(part, ["type", "text", "annotations", "logprobs"], "content")
        if part.get("type") not in types or not isinstance(part.get("text"), str) or part.get("annotations") or part.get("logprobs"):
            raise ProfileError("Unsupported text content part", param="content")
        parts.append(part["text"])
    return "".join(parts)


def user_content(value, responses=False):
    if isinstance(value, str):
        return {"content": value}
    if not isinstance(value, list):
        raise ProfileError("User content must be text or supported parts", param="content")
    texts, images = [], []
    for part in value:
        if isinstance(part, dict) and part.get("type") == ("input_image" if responses else "image_url"):
            record(part, ["type", "image_url", "detail"], "content")
            image = part if responses else record(part.get("image_url"), ["url", "detail"], "image_url")
            url = image.get("image_url" if responses else "url")
            if image.get("detail", "auto") != "auto" or not isinstance(url, str):
                raise ProfileError("Only default-detail committed SDC images are supported", param="image_url")
            parsed = urlsplit(url)
            query = parse_qs(parsed.query, strict_parsing=True)
            if parsed.scheme != "sdc-attachment" or parsed.path or parsed.fragment or not re.fullmatch(r"[0-9a-f-]{36}", parsed.netloc) or set(query) != {"mime"} or query["mime"] not in (["image/png"], ["image/jpeg"]):
                raise ProfileError("Use sdc-attachment://ID?mime=image/png or image/jpeg from the authenticated attachment API", param="image_url")
            images.append({"type": "image", "attachmentId": parsed.netloc, "mimeType": query["mime"][0]})
        else:
            texts.append(text_content([part], ("input_text",) if responses else ("text",)))
    return {"content": "".join(texts), **({"images": images} if images else {})}


def arguments(value):
    if not isinstance(value, str) or len(value) > 65536:
        raise ProfileError("Function arguments must be a bounded JSON object string", param="arguments")
    try:
        parsed = json.loads(value)
    except (ValueError, RecursionError):
        raise ProfileError("Invalid function argument JSON", param="arguments") from None
    if not isinstance(parsed, dict):
        raise ProfileError("Function arguments must be an object", param="arguments")
    return parsed


def tools_and_choice(tools, choice, responses=False):
    normalized = []
    for tool in tools:
        outer = record(tool, ["type", "name", "description", "parameters", "strict"] if responses else ["type", "function"], "tools")
        if outer.get("type") != "function":
            raise ProfileError("Only caller function tools are supported", param="tools")
        function = outer if responses else record(outer.get("function"), ["name", "description", "parameters", "strict"], "tools.function")
        normalized.append({"name": function.get("name"), "schema": function.get("parameters", {"type": "object", "properties": {}, "additionalProperties": False}),
                           "strict": function.get("strict", True), **({"description": function["description"]} if "description" in function else {})})
    if isinstance(choice, dict):
        record(choice, ["type", "name"] if responses else ["type", "function"], "tool_choice")
        if choice.get("type") != "function":
            raise ProfileError("Unsupported tool choice", param="tool_choice")
        function = choice if responses else record(choice.get("function"), ["name"], "tool_choice.function")
        choice = {"name": function.get("name")}
    elif choice not in ("auto", "none", "required"):
        raise ProfileError("Unsupported tool choice", param="tool_choice")
    return normalized, choice


def chat_history(messages):
    history, instructions = [], []
    for message in messages:
        record(message, ["role", "content", "tool_calls", "tool_call_id"], "messages")
        role = message.get("role")
        if role in ("system", "developer"):
            if set(message) - {"role", "content"}:
                raise ProfileError("Instruction message contains unsupported fields", param="messages")
            instructions.append(role.upper() + ":\n" + text_content(message.get("content")))
            continue
        if role not in ("user", "assistant", "tool"):
            raise ProfileError("Unsupported message role", param="messages.role")
        if role != "assistant" and "tool_calls" in message or role != "tool" and "tool_call_id" in message:
            raise ProfileError("Message fields do not match role", param="messages")
        content = message.get("content")
        if content is None and role == "assistant":
            content = ""
        entry = {"role": role, **(user_content(content) if role == "user" else {"content": text_content(content)})}
        if role == "tool":
            entry["callId"] = message.get("tool_call_id")
        if "tool_calls" in message:
            calls = []
            for call in message["tool_calls"]:
                record(call, ["id", "type", "function"], "tool_calls")
                function = record(call.get("function"), ["name", "arguments"], "tool_calls.function")
                if call.get("type") != "function":
                    raise ProfileError("Unsupported tool call", param="tool_calls")
                calls.append({"callId": call.get("id"), "name": function.get("name"), "arguments": arguments(function.get("arguments"))})
            entry["calls"] = calls
        history.append(entry)
    return history, "\n\n".join(instructions)


def response_history(value, instructions):
    if isinstance(value, str):
        return [{"role": "user", "content": value}]
    history = []
    for item in value:
        kind = item.get("type", "message")
        if kind == "message":
            record(item, ["type", "role", "content", "id", "status"], "input")
            if item.get("role") in ("system", "developer"):
                if set(item) - {"type", "role", "content"}:
                    raise ProfileError("Instruction input contains unsupported fields", param="input")
                instructions.append(item["role"].upper() + ":\n" + text_content(item.get("content"), ("input_text",)))
                continue
            if item.get("role") not in ("user", "assistant") or item.get("status", "completed") != "completed":
                raise ProfileError("Unsupported input message", param="input")
            history.append({"role": item["role"], **(user_content(item.get("content"), True) if item["role"] == "user"
                else {"content": text_content(item.get("content"), ("output_text",))})})
        elif kind == "function_call":
            record(item, ["type", "id", "call_id", "name", "arguments", "status"], "input")
            if item.get("status", "completed") != "completed" or item.get("id", "fc_" + str(item.get("call_id"))) != "fc_" + str(item.get("call_id")):
                raise ProfileError("Only committed SDC function-call items may be replayed", param="input")
            if not history or history[-1]["role"] != "assistant":
                history.append({"role": "assistant", "content": ""})
            history[-1].setdefault("calls", []).append({"callId": item.get("call_id"), "name": item.get("name"), "arguments": arguments(item.get("arguments"))})
        elif kind == "function_call_output":
            record(item, ["type", "call_id", "output"], "input")
            if not isinstance(item.get("output"), str):
                raise ProfileError("Function output must be text", param="input")
            history.append({"role": "tool", "content": item["output"], "callId": item.get("call_id")})
        else:
            raise ProfileError("Unsupported input item", param="input.type")
    return history


def response_id(value):
    if not re.fullmatch(r"resp_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", value):
        raise ProfileError("Invalid response ID", "invalid_response_id", 404, "response_id")
    return value[5:]


def normalize(body, context_mode):
    tools, choice = tools_and_choice(body.tools, body.tool_choice, isinstance(body, ResponsesRequest))
    if isinstance(body, ChatRequest):
        if body.max_tokens is not None and body.max_completion_tokens is not None:
            raise ProfileError("Choose one output-budget field", param="max_tokens")
        if body.response_format is not None and body.response_format != {"type": "text"}:
            raise ProfileError("Only ordinary text output is supported", param="response_format")
        if body.stream_options is not None:
            record(body.stream_options, ["include_usage", "include_obfuscation"], "stream_options")
            if not body.stream or any(type(v) is not bool for v in body.stream_options.values()) or body.stream_options.get("include_obfuscation", False):
                raise ProfileError("Stream options require streaming; obfuscation is unsupported", param="stream_options")
        history, instructions = chat_history(body.messages)
        cap, background, parent = body.max_completion_tokens or body.max_tokens or 8192, False, None
    else:
        if body.text is not None and body.text != {"format": {"type": "text"}}:
            raise ProfileError("Only ordinary text output is supported", param="text")
        fragments = []
        history = response_history(body.input, fragments)
        instructions = "\n\n".join([*fragments, body.instructions] if body.instructions else fragments)
        cap, background, parent = body.max_output_tokens, body.background, body.previous_response_id
    try:
        request = GenerationRequest.model_validate({"model": body.model, "history": history, "instructions": instructions,
            "tools": tools, "toolChoice": choice, "parallelTools": body.parallel_tool_calls, "contextMode": context_mode,
            "budget": {"inputUnits": 32768, "outputUnits": cap, "deadlineSeconds": 600}, "background": background,
            **({"parentId": response_id(parent)} if parent else {})})
    except ValidationError:
        raise ProfileError("Request does not match the SDC generation profile", "invalid_request") from None
    return request.model_dump(by_alias=True, exclude_none=True)


def usage(generation, chat=False):
    value = generation["result"]["usage"] if generation.get("result") else None
    if value is None:
        return None
    prefix, output = ("prompt_tokens", "completion_tokens") if chat else ("input_tokens", "output_tokens")
    return {prefix: value["inputUnits"], output: value["outputUnits"], "total_tokens": value["inputUnits"] + value["outputUnits"],
            ("prompt_tokens_details" if chat else "input_tokens_details"): None,
            ("completion_tokens_details" if chat else "output_tokens_details"): None, "sdc": value}


def provenance(generation):
    return {"profile": "sdc-openai-v1", "usage_source": "estimated", "estimator": "sdc-text-v1",
            "context_mode": generation["parameters"]["contextMode"], "conversation_id": generation["conversationId"],
            "expires_at": generation["expiresAt"], "backend_status": generation["backendStatus"],
            "native_generation_cap": False, "stream_delivery": "terminal-buffered",
            "outcome": (generation.get("result") or {}).get("outcome")}


def chat_object(generation):
    result = generation["result"]
    if result["status"] in ("failed", "cancelled") or result["outcome"] == "deadline":
        error = result.get("error") or {"code": result["outcome"], "message": "The public response did not complete"}
        raise ProfileError(error["message"], error["code"].lower(), 502)
    message = {"role": "assistant", "content": result["text"] or (None if result["calls"] else "")}
    if result["calls"]:
        message["tool_calls"] = [{"id": c["callId"], "type": "function", "function": {"name": c["name"],
            "arguments": json.dumps(c["arguments"], ensure_ascii=False, separators=(",", ":"), sort_keys=True)}} for c in result["calls"]]
    return {"id": "chatcmpl_" + generation["generationId"], "object": "chat.completion", "created": int(datetime.fromisoformat(generation["createdAt"].replace("Z", "+00:00")).timestamp()),
        "model": generation["model"], "choices": [{"index": 0, "message": message,
        "finish_reason": "length" if result["outcome"] == "output_quota" else "tool_calls" if result["calls"] else "stop", "logprobs": None}],
        "usage": usage(generation, True), "sdc": provenance(generation)}


def response_object(generation, initial=False):
    p, result = generation["parameters"], generation.get("result")
    status = ("queued" if generation["background"] else "in_progress") if initial else (
        result["status"] if result else "queued" if generation["status"] in ("queued", "dispatching") else "in_progress")
    output = []
    if result and not initial:
        if result["text"] or not result["calls"] and result["status"] == "completed":
            output.append({"type": "message", "id": "msg_" + generation["generationId"], "role": "assistant",
                "status": "completed" if result["status"] == "completed" else "incomplete", "content": [{"type": "output_text", "text": result["text"], "annotations": [], "logprobs": []}]})
        output.extend({"type": "function_call", "id": "fc_" + c["callId"], "call_id": c["callId"], "name": c["name"],
            "arguments": json.dumps(c["arguments"], ensure_ascii=False, separators=(",", ":"), sort_keys=True), "status": "completed"} for c in result["calls"])
    choice = p["toolChoice"]
    details = None
    if result and result["status"] == "incomplete" and not initial:
        details = {"reason": "max_output_tokens" if result["outcome"] == "output_quota" else None}
    sdc = provenance(generation)
    if initial:
        sdc.update(backend_status="pending", outcome=None)
    return {"id": "resp_" + generation["generationId"], "object": "response", "created_at": int(datetime.fromisoformat(generation["createdAt"].replace("Z", "+00:00")).timestamp()),
        "completed_at": None, "status": status, "background": generation["background"], "model": generation["model"], "output": output,
        "error": ({"code": result["error"]["code"].lower(), "message": result["error"]["message"]} if result and result.get("error") and not initial else None),
        "incomplete_details": details, "instructions": p["instructions"], "max_output_tokens": p["budget"]["outputUnits"],
        "previous_response_id": "resp_" + generation["parentId"] if generation["parentId"] else None, "store": True,
        "parallel_tool_calls": p["parallelTools"], "tool_choice": {"type": "function", **choice} if isinstance(choice, dict) else choice,
        "tools": [{"type": "function", "name": t["name"], "parameters": t["schema"], "strict": t["strict"], **({"description": t["description"]} if "description" in t else {})} for t in p["tools"]],
        "text": {"format": {"type": "text"}}, "truncation": "disabled", "metadata": {},
        "usage": None if initial else usage(generation), "sdc": sdc}


def chunks(text):
    return [text[i:i + 2048] for i in range(0, len(text), 2048)]


def chat_events(generation, include_usage=False):
    value = chat_object(generation)
    base = {k: value[k] for k in ("id", "created", "model", "sdc")}
    base.update(object="chat.completion.chunk", usage=None)
    def event(delta, finish=None):
        return {**base, "choices": [{"index": 0, "delta": delta, "finish_reason": finish, "logprobs": None}]}
    yield event({"role": "assistant", "content": ""})
    message = value["choices"][0]["message"]
    for chunk in chunks(message.get("content") or ""):
        yield event({"content": chunk})
    for index, call in enumerate(message.get("tool_calls", [])):
        yield event({"tool_calls": [{"index": index, **call}]})
    yield event({}, value["choices"][0]["finish_reason"])
    if include_usage:
        yield {**base, "choices": [], "usage": value["usage"]}


def response_events(generation):
    initial = response_object(generation, initial=True)
    yield {"type": "response.created", "response": initial}
    yield {"type": "response.in_progress", "response": {**initial, "status": "in_progress"}}
    if not generation.get("result"):
        return
    final = response_object(generation)
    for index, item in enumerate(final["output"]):
        if item["type"] == "message":
            yield {"type": "response.output_item.added", "output_index": index, "item": {**item, "status": "in_progress", "content": []}}
            part = item["content"][0]
            yield {"type": "response.content_part.added", "item_id": item["id"], "output_index": index, "content_index": 0, "part": {**part, "text": ""}}
            for text in chunks(part["text"]):
                yield {"type": "response.output_text.delta", "item_id": item["id"], "output_index": index, "content_index": 0, "delta": text, "logprobs": []}
            yield {"type": "response.output_text.done", "item_id": item["id"], "output_index": index, "content_index": 0, "text": part["text"], "logprobs": []}
            yield {"type": "response.content_part.done", "item_id": item["id"], "output_index": index, "content_index": 0, "part": part}
        else:
            yield {"type": "response.output_item.added", "output_index": index, "item": {**item, "status": "in_progress", "arguments": ""}}
            yield {"type": "response.function_call_arguments.delta", "item_id": item["id"], "output_index": index, "delta": item["arguments"]}
            yield {"type": "response.function_call_arguments.done", "item_id": item["id"], "output_index": index, "arguments": item["arguments"], "name": item["name"]}
        yield {"type": "response.output_item.done", "output_index": index, "item": item}
    if final["status"] == "cancelled":
        yield {"type": "error", "code": "sdc_cancelled", "message": "The public response was cancelled", "param": None}
    else:
        yield {"type": "response." + final["status"], "response": final}
