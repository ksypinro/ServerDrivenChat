from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, JsonValue

Identifier = Annotated[str, Field(min_length=1, max_length=256, pattern=r"^[A-Za-z0-9._:-]+$")]

class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

class TextBlock(RequestModel):
    type: Literal["text"]
    text: Annotated[str, Field(min_length=1, max_length=262144)]

class ImageBlock(RequestModel):
    type: Literal["image"]
    attachmentId: Identifier
    mimeType: Literal["image/png", "image/jpeg"]

class Prompt(RequestModel):
    model: Identifier
    content: Annotated[list[Annotated[TextBlock | ImageBlock, Field(discriminator="type")]], Field(min_length=1, max_length=32)]
    delivery: Literal["queue"] = "queue"

class CredentialRequest(RequestModel):
    sessionId: Identifier
    label: Annotated[str, Field(min_length=1, max_length=120)]
    scopes: Annotated[list[Literal["view", "prompt", "approve", "administer"]], Field(min_length=1, max_length=4)]
    expiresAt: str

class CredentialIssued(BaseModel):
    credentialId: str
    credential: str
    expiresAt: str

class Cancel(RequestModel):
    type: Literal["turn.cancel"]
    commandId: Identifier
    turnId: Identifier
    reason: Annotated[str | None, Field(max_length=1000)] = None

class Answer(RequestModel):
    type: Literal["input.respond"]
    commandId: Identifier
    turnId: Identifier
    requestId: Identifier
    requestRevision: Annotated[int, Field(ge=1)]
    answer: Annotated[str, Field(min_length=1, max_length=16384)]

class Disable(RequestModel):
    type: Literal["session.disable"]
    commandId: Identifier
    reason: Annotated[str, Field(min_length=1, max_length=1000)]

Control = Annotated[Cancel | Answer | Disable, Field(discriminator="type")]

class PermissionGrant(RequestModel):
    resource: str
    operation: str
    scope: dict

class Decision(RequestModel):
    decisionId: Identifier
    requestRevision: Annotated[int, Field(ge=1)]
    actionDigest: str
    choiceId: Identifier
    grantedPermissions: Annotated[list[PermissionGrant], Field(max_length=64)]
    policyRevision: Identifier
    expiresAt: str

class OperationResult(BaseModel):
    items: list[dict]
    partialItems: list[dict]
    toolActivity: list[dict]
    answer: str | None
    selection: str

class Operation(BaseModel):
    operationId: str
    commandId: str
    promptId: str
    turnId: str
    sessionId: str
    bindingId: str
    bindingRevision: int
    leaseGeneration: int
    status: Literal["queued", "dispatching", "running", "waiting_for_approval", "waiting_for_input", "completed", "failed", "cancelled", "rejected", "reconciliation_required"]
    commandState: str
    expiresAt: str
    watermark: int
    terminalEvidence: dict | None = None
    result: OperationResult

class SignInStart(RequestModel):
    redirectUri: str

class SignInExchange(RequestModel):
    state: str
    code: str

class SignInRefresh(RequestModel):
    userId: Identifier
    refreshToken: str

class PairingStart(RequestModel):
    label: str
    localConfirmationSecret: str

class PairingConfirm(RequestModel):
    pairingCode: str

class AttachmentCommit(RequestModel):
    sha256: Annotated[str, Field(pattern=r"^sha256:[a-f0-9]{64}$")]

class ProjectedOutput(BaseModel):
    itemId: str
    turnId: str
    kind: Literal["assistant_message", "user_message", "tool_activity", "status", "other"]
    revision: int
    source: Literal["native_event", "accessibility", "dom", "screen_observation"]
    partial: bool
    content: list[dict]
    observedAt: str
    nativeCategory: str | None = None
    completed: bool
    evidence: Literal["observed", "partial", "unknown"]

class Transcript(BaseModel):
    sessionId: str
    watermark: int
    items: list[ProjectedOutput]
    artifacts: list[dict]
    pendingApprovals: list[dict]
    interactionStates: dict[str, str]
    turnStates: dict[str, str]
    completion: dict[str, Literal["verified", "unknown"]]
    needsRepair: bool
    repairAfter: int | None


# Native/protocol metadata uses explicit JSON boundaries; response envelopes are typed.
class Health(BaseModel):
    version: int
    requestId: str

class Identity(BaseModel):
    userId: str
    kind: Literal["human", "scoped_key"]
    sessionId: str | None
    scopes: list[Literal["view", "prompt", "approve", "administer"]]

class NativeProfile(BaseModel):
    id: str
    nativeVersion: str
    companionBaseline: str
    providerReady: Literal[False]
    fields: dict[str, Literal["native-supported", "gateway-defined", "unsupported", "unverified"]]
    evidence: str
    blockers: list[str]

class Capabilities(BaseModel):
    serverPolicy: dict[str, JsonValue]
    profile: NativeProfile
    limits: dict[str, int]

class SessionSummary(BaseModel):
    sessionId: str
    state: str
    bindingId: str | None
    native: JsonValue

class Sessions(BaseModel):
    sessions: list[SessionSummary]

class ModelAlias(BaseModel):
    id: str
    sessionId: str
    bindingId: str
    profile: str
    providerReady: Literal[False]

class Models(BaseModel):
    models: list[ModelAlias]

class BindingDetails(BaseModel):
    bindingId: str
    state: str
    leaseExpiresAt: str | None = None
    native: dict[str, JsonValue]

class SessionDetails(BaseModel):
    sessionId: str
    state: str
    binding: BindingDetails | None

class SessionCapabilities(BaseModel):
    serverPolicy: dict[str, JsonValue]
    sessionId: str
    bindingId: str | None
    operations: dict[str, JsonValue]
    capabilityReport: JsonValue
    providerReady: Literal[False]

class CredentialMetadata(BaseModel):
    credentialId: str
    sessionId: str
    bindingId: str
    scopes: list[str]
    label: str
    expiresAt: str
    revokedAt: str | None

class Credentials(BaseModel):
    credentials: list[CredentialMetadata]

class Revoked(BaseModel):
    state: Literal["revoked"]

class DeviceRevoked(Revoked):
    nativeCancellationConfirmed: Literal[False]

class ControlRecorded(BaseModel):
    commandId: str
    laneSeq: int
    state: Literal["recorded"]
    nativeApplied: Literal[False]

class ApprovalRecorded(BaseModel):
    disposition: Literal["recorded", "identical"]
    state: Literal["decision_recorded"]
    decisionId: str
    commandId: str
    laneSeq: int
    requestId: str
    requestRevision: int
    assertion: str
    grants: list[dict[str, JsonValue]]

class CommandReceipt(BaseModel):
    commandId: str
    state: Literal["received", "applied", "rejected", "unknown", "reconciliation_required"] | None
    payload: JsonValue

class SessionRecord(BaseModel):
    sessionId: str
    ownerUserId: str
    state: str

class BindingRecord(BaseModel):
    bindingId: str
    sessionId: str
    deviceId: str
    bindingRevision: int
    leaseGeneration: int
    state: str
    payload: JsonValue

class EventRecord(BaseModel):
    eventId: str
    sessionId: str
    bridgeEpoch: str
    producerSeq: int
    sessionSeq: int
    payload: JsonValue
    disposition: str

class InteractionRecord(BaseModel):
    interactionId: str
    sessionId: str
    requestId: str
    requestRevision: int
    kind: str
    state: str
    payload: JsonValue

class Watermark(BaseModel):
    prompt: int
    control: int
    sessionSeq: int

class Snapshot(BaseModel):
    session: SessionRecord
    bindings: list[BindingRecord]
    events: list[EventRecord]
    interactions: list[InteractionRecord]
    watermark: Watermark
    projection: Transcript

class SignInStarted(BaseModel):
    authorizationUrl: str
    state: str
    expiresAt: str

class SignedInUser(BaseModel):
    userId: str
    email: str

class SignInTokens(SignedInUser):
    accessToken: str
    refreshToken: str | None = None
    expiresAt: str
    user: SignedInUser | None = None

class PairingStarted(BaseModel):
    pairingId: str
    deviceId: str
    pairingCode: str
    expiresAt: str

class PairingConfirmed(BaseModel):
    pairingId: str
    expiresAt: str

class AttachmentUploaded(BaseModel):
    attachmentId: str
    state: Literal["pending_commit"]
    sha256: str
    sizeBytes: int

class AttachmentCommitted(BaseModel):
    attachmentId: str
    state: Literal["committed"]
    sha256: str
    sizeBytes: int
    retentionExpiresAt: str

class ErrorDetail(BaseModel):
    code: str
    message: str
    requestId: str | None = None
    fields: list[str] | None = None
    retryable: bool | None = None

class ApiError(BaseModel):
    error: ErrorDetail

class CallerCall(RequestModel):
    callId: Identifier
    name: str
    arguments: dict[str, JsonValue]

class HistoryMessage(RequestModel):
    role: Literal["user", "assistant", "tool"]
    content: Annotated[str, Field(max_length=131072)]
    callId: Identifier | None = None
    resultStatus: Literal["error"] | None = None
    calls: Annotated[list[CallerCall], Field(max_length=16)] | None = None
    images: list[ImageBlock] | None = None

class CallerTool(RequestModel):
    name: Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")]
    description: Annotated[str, Field(max_length=4096)] | None = None
    schema_: dict[str, JsonValue] = Field(alias="schema")
    strict: bool = True

class Budget(RequestModel):
    inputUnits: Annotated[int, Field(ge=1, le=32768)] = 32768
    outputUnits: Annotated[int, Field(ge=1, le=8192)] = 8192
    deadlineSeconds: Annotated[int, Field(ge=1, le=600)] = 600

class GenerationRequest(RequestModel):
    model: str = "sdc-default"
    sessionId: Identifier | None = None
    conversationId: Identifier | None = None
    parentId: Identifier | None = None
    history: Annotated[list[HistoryMessage], Field(min_length=1, max_length=256)]
    instructions: Annotated[str, Field(max_length=32768)] = ""
    contextMode: Literal["exclusive", "shared-task"] = "exclusive"
    tools: Annotated[list[CallerTool], Field(max_length=32)] = Field(default_factory=list)
    toolChoice: Literal["auto", "none", "required"] | dict[str, str] = "auto"
    parallelTools: bool = False
    budget: Budget = Field(default_factory=Budget)
    background: bool = False

class InputCountRequest(RequestModel):
    model: str = "sdc-default"
    sessionId: Identifier | None = None
    history: Annotated[list[HistoryMessage], Field(min_length=1, max_length=256)]
    instructions: Annotated[str, Field(max_length=32768)] = ""
    contextMode: Literal["exclusive", "shared-task"] = "exclusive"
    tools: Annotated[list[CallerTool], Field(max_length=32)] = Field(default_factory=list)
    toolChoice: Literal["auto", "none", "required"] | dict[str, str] = "auto"
    parallelTools: bool = False

class InputCount(BaseModel):
    inputUnits: int
    withinInputBudget: bool
    source: Literal["estimated"]
    estimator: str
    scope: str
    hiddenNativeContext: Literal["unknown"]
    imageAllowanceUnits: int
    admissionChecked: Literal[False]

class Usage(BaseModel):
    source: Literal["estimated"]
    estimator: str
    inputUnits: int
    outputUnits: int
    observedOutputUnits: int
    scope: str
    hiddenNativeContext: Literal["unknown"]

class GenerationResult(BaseModel):
    status: Literal["completed", "incomplete", "failed", "cancelled"]
    text: str
    calls: list[CallerCall]
    outcome: Literal["stop", "caller_tools", "output_quota", "deadline", "backend_error", "cancelled"]
    error: dict[str, str] | None = None
    usage: Usage

class GenerationParameters(BaseModel):
    instructions: str
    contextMode: Literal["exclusive", "shared-task"]
    tools: list[CallerTool]
    toolChoice: Literal["auto", "none", "required"] | dict[str, str]
    parallelTools: bool
    budget: Budget

class Generation(BaseModel):
    generationId: str
    conversationId: str
    parentId: str | None
    model: str
    createdAt: str
    background: bool
    status: str
    backendStatus: str
    operationId: str
    result: GenerationResult | None
    expiresAt: str
    parameters: GenerationParameters

class Conversation(BaseModel):
    conversationId: str
    contextMode: Literal["exclusive", "shared-task"]
    history: list[HistoryMessage]
    version: int
    latestGenerationId: str | None
    expiresAt: str
