"""Restricted Anthropic wire normalization; no vendor runtime or model execution."""
import re
from pydantic import BaseModel, ConfigDict, Field


class AnthropicRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    model: str
    messages: list[dict]
    max_tokens: int = Field(ge=1, le=8192)
    system: str | list[dict] = ""
    stream: bool = False
    tools: list[dict] = []
    tool_choice: dict | None = None
    metadata: dict | None = None
    temperature: float | None = None
    top_p: float | None = None
    top_k: int | None = None
    stop_sequences: list[str] = []
    thinking: dict | None = None
    output_config: dict | None = None
    service_tier: str | None = None
    betas: list[str] | None = None
    container: dict | None = None


class CountTokensRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    model: str
    messages: list[dict]
    system: str | list[dict] = ""
    tools: list[dict] = []
    tool_choice: dict | None = None
    metadata: dict | None = None


class AnthropicError(Exception):
    def __init__(self, message, code="invalid_request", status=400):
        self.message, self.code, self.status = message, code, status


def normalize(body, context_mode="exclusive", generation=True):
    if body.model != "sdc-default":
        raise AnthropicError("Only the authorized SDC service alias is supported", "model_not_found", 404)
    if generation and (body.temperature is not None or body.top_p is not None or body.top_k is not None or body.stop_sequences or body.thinking is not None or body.output_config is not None or body.service_tier is not None or body.container is not None or body.betas):
        raise AnthropicError("Requested provider control is outside the supported SDC profile")
    if isinstance(body.system, str):
        instructions = body.system
    else:
        if any(not isinstance(block, dict) or set(block) != {"type", "text"} or block.get("type") != "text" or not isinstance(block.get("text"), str) for block in body.system):
            raise AnthropicError("System accepts text blocks only")
        instructions = "\n".join(block["text"] for block in body.system)
    tools, names = [], set()
    for item in body.tools:
        if set(item) - {"name", "description", "input_schema", "strict"} or not isinstance(item.get("input_schema"), dict):
            raise AnthropicError("Tool definition is unsupported")
        name = item.get("name")
        if not isinstance(name, str) or not name or name in names:
            raise AnthropicError("Tool names must be unique")
        names.add(name)
        strict = item.get("strict", False)
        if type(strict) is not bool: raise AnthropicError("Tool strict must be Boolean")
        tools.append({"name": name, "description": item.get("description", ""), "schema": item["input_schema"], "strict": strict})
    choice, parallel = "auto", True
    if body.tool_choice is not None:
        kind = body.tool_choice.get("type")
        allowed = {"auto": {"type", "disable_parallel_tool_use"}, "none": {"type"}, "any": {"type", "disable_parallel_tool_use"}, "tool": {"type", "name", "disable_parallel_tool_use"}}
        if not isinstance(kind, str) or kind not in allowed or set(body.tool_choice) - allowed[kind]: raise AnthropicError("tool_choice contains unsupported fields")
        if kind == "auto": choice = "auto"
        elif kind == "none": choice = "none"
        elif kind == "any": choice = "required"
        elif kind == "tool" and isinstance(body.tool_choice.get("name"), str) and body.tool_choice["name"] in names: choice = {"name": body.tool_choice["name"]}
        else: raise AnthropicError("tool_choice is unsupported")
        parallel = not body.tool_choice.get("disable_parallel_tool_use", False)
        if type(body.tool_choice.get("disable_parallel_tool_use", False)) is not bool:
            raise AnthropicError("disable_parallel_tool_use must be Boolean")
    history = []
    for message in body.messages:
        if set(message) - {"role", "content"} or message.get("role") not in ("user", "assistant"):
            raise AnthropicError("Message role or fields are unsupported")
        content = message.get("content")
        if not isinstance(content, (str, list)) or isinstance(content, list) and not content:
            raise AnthropicError("Message content must be text or nonempty content blocks")
        blocks = content if isinstance(content, list) else [{"type": "text", "text": content}]
        texts, calls, results, images = [], [], [], []
        saw_tool_use = False
        for block in blocks:
            if not isinstance(block, dict):
                raise AnthropicError("Content block must be an object")
            kind = block.get("type")
            allowed = {"text": {"type", "text"}, "tool_use": {"type", "id", "name", "input"}, "tool_result": {"type", "tool_use_id", "content", "is_error"}, "image": {"type", "source"}}
            if not isinstance(kind, str) or kind not in allowed or set(block) - allowed[kind]: raise AnthropicError("Content block contains unsupported fields")
            if kind == "text" and isinstance(block.get("text"), str):
                if saw_tool_use: raise AnthropicError("Assistant text must precede tool calls")
                texts.append(block["text"])
            elif kind == "tool_use" and message["role"] == "assistant" and isinstance(block.get("input"), dict):
                if not isinstance(block.get("id"), str) or not re.fullmatch(r"[A-Za-z0-9._:-]{1,256}", block["id"]) or not isinstance(block.get("name"), str) or not block["name"]:
                    raise AnthropicError("Tool use needs a valid issued ID and name")
                saw_tool_use = True
                calls.append({"callId": block["id"], "name": block["name"], "arguments": block["input"]})
            elif kind == "tool_result" and message["role"] == "user":
                if "is_error" in block and type(block["is_error"]) is not bool: raise AnthropicError("is_error must be Boolean")
                if not isinstance(block.get("tool_use_id"), str) or not re.fullmatch(r"[A-Za-z0-9._:-]{1,256}", block["tool_use_id"]):
                    raise AnthropicError("Tool result needs a valid issued ID")
                content = block.get("content", "")
                if isinstance(content, list):
                    if any(not isinstance(part, dict) or set(part) != {"type", "text"} or part.get("type") != "text" or not isinstance(part.get("text"), str) for part in content):
                        raise AnthropicError("Tool results accept text blocks only")
                    content = "".join(part["text"] for part in content)
                if not isinstance(content, str): raise AnthropicError("Tool result content must be text")
                results.append({"role": "tool", "content": content, "callId": block["tool_use_id"], **({"resultStatus": "error"} if block.get("is_error") is True else {})})
            elif kind == "image" and message["role"] == "user":
                source = block.get("source", {})
                if not isinstance(source, dict) or set(source) != {"type", "url"} or source.get("type") != "url" or not isinstance(source.get("url"), str) or not source["url"].startswith("sdc-attachment://"):
                    raise AnthropicError("Only committed sdc-attachment image references are supported")
                matched = re.fullmatch(r"sdc-attachment://([0-9a-fA-F-]{36})\?mime=(image/png|image/jpeg)", source["url"])
                if not matched: raise AnthropicError("Attachment reference is malformed")
                images.append({"type": "image", "attachmentId": matched.group(1), "mimeType": matched.group(2)})
            else: raise AnthropicError("Content block is outside the supported profile")
        if results and (texts or images): raise AnthropicError("Tool results must be a separate user message")
        if results: history.extend(results)
        else: history.append({"role": message["role"], "content": "".join(texts), **({"calls": calls} if calls else {}), **({"images": images} if images else {})})
    value = {"model": "sdc-default", "history": history, "instructions": instructions,
             "contextMode": context_mode, "tools": tools, "toolChoice": choice,
             "parallelTools": parallel, "budget": {"inputUnits": 32768, "outputUnits": body.max_tokens if generation else 8192, "deadlineSeconds": 600}, "background": True}
    return value


def encode(generation):
    if not isinstance(generation.get("generationId"), str):
        raise AnthropicError("Verified generation identity is unavailable", "upstream_error", 502)
    result = generation.get("result") or {}
    if not isinstance(result, dict) or result.get("status") != "completed" and not (result.get("status") == "incomplete" and result.get("outcome") == "output_quota"):
        raise AnthropicError("Generation did not produce a verified Message", "generation_failed", 502)
    if result.get("outcome") not in ("stop", "caller_tools", "output_quota"):
        raise AnthropicError("Verified Message outcome is unavailable", "upstream_error", 502)
    if not isinstance(result.get("text"), str) or not isinstance(result.get("calls"), list):
        raise AnthropicError("Verified Message content is unavailable", "upstream_error", 502)
    usage = result.get("usage")
    if not isinstance(usage, dict) or any(type(usage.get(field)) is not int or usage[field] < 0 for field in ("inputUnits", "outputUnits")) or not isinstance(usage.get("estimator"), str) or not isinstance(usage.get("scope"), str):
        raise AnthropicError("Verified usage estimate is unavailable", "upstream_error", 502)
    blocks = []
    if result.get("text"): blocks.append({"type": "text", "text": result["text"]})
    for call in result["calls"]:
        if not isinstance(call, dict) or not isinstance(call.get("callId"), str) or not isinstance(call.get("name"), str) or not isinstance(call.get("arguments"), dict):
            raise AnthropicError("Verified caller tool block is unavailable", "upstream_error", 502)
        blocks.append({"type": "tool_use", "id": call["callId"], "name": call["name"], "input": call["arguments"]})
    reason = "tool_use" if result.get("calls") else "max_tokens" if result.get("outcome") == "output_quota" else "end_turn"
    return {"id": "msg_" + generation["generationId"].replace("-", ""), "type": "message", "role": "assistant", "model": "sdc-default", "content": blocks,
            "stop_reason": reason, "stop_sequence": None,
            "usage": {"input_tokens": usage["inputUnits"], "output_tokens": usage["outputUnits"],
                      "sdc": {"source": "estimated", "estimator": usage["estimator"], "scope": usage["scope"], "hidden_native_context": "unknown"}}}
