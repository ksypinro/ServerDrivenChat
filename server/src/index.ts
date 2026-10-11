import { protocolModule } from "@server-driven-chat/protocol";
export * from "./storage/index.js";
export * from "./auth/index.js";
export * from "./http/index.js";
export * from "./leases/index.js";
export * from "./approvals/index.js";
export * from "./attachments/index.js";
export * from "./public-api/index.js";
export { NATIVE_PUBLIC_PROFILE } from "./public-api/http.js";

/** Framework-independent server services and PostgreSQL storage; transport remains owned by M09. */
export const serverModule = "server" as const;
export const serverProtocolDependency = protocolModule;

export * from "./public-api/policy.js";
export * from "./public-api/conversations.js";
