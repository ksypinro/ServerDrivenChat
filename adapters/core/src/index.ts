import { protocolModule } from "@server-driven-chat/protocol";
import type {
  AdapterMutationContext, AdapterOutcome, AppAdapter, Binding, BindingSelection, CapabilitiesDocument,
  LaneCursor, ProducerCursor, ProtocolCommand, ProtocolEvent, ApprovalRequest, ApprovalDecisionProposal,
  JsonValue, SessionSnapshot
} from "@server-driven-chat/protocol";

/** Vendor-neutral adapter operation contracts. Native IDs remain opaque and outcomes may be unknown. */
export const adapterCoreModule = "adapter-core" as const;
export const adapterProtocolDependency = protocolModule;

export type {
  AdapterMutationContext, AdapterOutcome, AppAdapter, Binding, BindingSelection, CapabilitiesDocument, LaneCursor, ProducerCursor,
  ProtocolCommand, ProtocolEvent, ApprovalRequest, ApprovalDecisionProposal, JsonValue, SessionSnapshot
};

/** Stable operation names used for capability discovery, fault injection, and conformance checks. */
export const ADAPTER_OPERATION_CONTRACTS = {
  probe: "Report supported, unsupported, or unverified operations with evidence.",
  attach: "Bind to the exact user-selected native conversation; preserve its opaque identity.",
  inspect: "Return a snapshot for the supplied binding or an explicit unknown outcome.",
  submit: "Submit a v2 command to the supplied binding and preserve native turn identity.",
  subscribe: "Yield ordered observed events after contiguous per-session/epoch producer checkpoints.",
  respondInput: "Respond to the exact native request ID and revision.",
  resolveApproval: "Resolve the exact native approval request and revision; never infer broad authority.",
  cancel: "Cancel the exact native turn and report confirmed, rejected, unsupported, or unknown.",
  revoke: "Revoke the exact native grant and report confirmed, rejected, unsupported, or unknown.",
  detach: "End this binding without deleting or replacing its native conversation."
} as const;

export function adapterIdentityMatches(binding: Binding, selection: BindingSelection): boolean {
  return binding.appId === selection.appId && binding.appInstanceId === selection.appInstanceId &&
    binding.conversationId === selection.conversationId && binding.accountId === selection.accountId &&
    binding.workspaceId === selection.workspaceId;
}

export function unknownOutcome<T>(reason: string): AdapterOutcome<T> {
  return { outcome: "unknown", reason };
}

/** Stream setup can fail before events exist; keep uncertainty explicit instead of silently ending. */
export class AdapterStreamError extends Error {
  readonly outcome: "rejected" | "unsupported" | "unknown";
  constructor(outcome: "rejected" | "unsupported" | "unknown", reason: string) {
    super(reason);
    this.name = "AdapterStreamError";
    this.outcome = outcome;
  }
}
