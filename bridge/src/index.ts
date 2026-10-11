import { protocolModule } from "@server-driven-chat/protocol";

/** Empty bridge boundary; transport and durable work begin in later milestones. */
export const bridgeModule = "bridge" as const;
export const bridgeProtocolDependency = protocolModule;
export { BridgeStore, BridgeStorageConflict, BridgeStorageCapacity, DEFAULT_BRIDGE_STORAGE_LIMITS } from "./storage/index.js";
export type { BridgeStorageLimits } from "./storage/index.js";
export type { AttemptState, BridgeLane, CommandInput, DispatchState, FaultPoint, OutputInput, RecoveryState, ServerAckState } from "./storage/index.js";
export { BridgeRuntime, parseSse, reconnectDelay } from "./runtime/index.js";
export type { BridgeRuntimeOptions, BridgeRuntimeState } from "./runtime/index.js";
export { createApprovalDecisionHandler } from "./approvals/index.js";
export type { ApprovalHandlerOptions } from "./approvals/index.js";
