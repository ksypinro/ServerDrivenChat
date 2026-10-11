import { ApprovalState, TurnState } from "./contracts.js";
import { canonicalJson } from "./canonical.js";

const turnTransitions: Record<TurnState, readonly TurnState[]> = {
  queued: ["dispatching", "cancelled", "failed", "reconciliation_required"],
  dispatching: ["running", "failed", "reconciliation_required"],
  running: ["waiting_for_input", "waiting_for_approval", "completed", "failed", "cancelled", "completion_unverified", "reconciliation_required"],
  waiting_for_input: ["running", "failed", "cancelled", "reconciliation_required"],
  waiting_for_approval: ["running", "failed", "cancelled", "reconciliation_required"],
  completion_unverified: ["completed", "failed", "cancelled", "reconciliation_required"],
  reconciliation_required: ["queued", "dispatching", "running", "waiting_for_input", "waiting_for_approval", "completed", "failed", "cancelled", "completion_unverified"],
  completed: [], failed: [], cancelled: []
};

const approvalTransitions: Record<ApprovalState, readonly ApprovalState[]> = {
  pending: ["decision_recorded", "denied", "expired", "superseded", "resolved_elsewhere"],
  decision_recorded: ["applying", "expired", "superseded", "resolved_elsewhere", "reconciliation_required"],
  applying: ["applied", "denied", "apply_failed", "reconciliation_required", "resolved_elsewhere"],
  reconciliation_required: ["applied", "denied", "expired", "superseded", "resolved_elsewhere", "apply_failed"],
  applied: [], denied: [], expired: [], superseded: [], resolved_elsewhere: [], apply_failed: []
};

export function canTransitionTurn(from: TurnState, to: TurnState, reconciliationEvidence = false): boolean {
  if (from === "reconciliation_required" && !reconciliationEvidence) return false;
  return turnTransitions[from].includes(to);
}

export function canTransitionApproval(from: ApprovalState, to: ApprovalState, reconciliationEvidence = false): boolean {
  if (from === "reconciliation_required" && !reconciliationEvidence) return false;
  return approvalTransitions[from].includes(to);
}

export function sequenceAdvance(lastContiguous: number, received: number): "next" | "duplicate" | "stale" | "gap" {
  if (!Number.isSafeInteger(lastContiguous) || lastContiguous < 0 || !Number.isSafeInteger(received) || received < 1) throw new RangeError("Sequence values must be positive safe integers (cursor may be zero)");
  if (received === lastContiguous + 1) return "next";
  if (received === lastContiguous) return "duplicate";
  return received < lastContiguous ? "stale" : "gap";
}

export function retryDisposition<T>(stored: T, incoming: T): "identical" | "conflict" {
  return canonicalJson(stored) === canonicalJson(incoming) ? "identical" : "conflict";
}

/** v2.0 is accepted explicitly; callers must negotiate a future minor schema rather than guessing. */
export function supportsProtocolVersion(version: string): boolean {
  return version === "2.0";
}

export function isExpiredAt(expiresAt: string, now: string): boolean {
  if (!isValidRfc3339Timestamp(expiresAt) || !isValidRfc3339Timestamp(now)) throw new TypeError("Expiry and comparison time must be valid RFC 3339 timestamps");
  const expiry = Date.parse(expiresAt);
  const current = Date.parse(now);
  return current >= expiry;
}

export function isValidRfc3339Timestamp(value: string): boolean {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!parts) return false;
  const [, ys, mos, ds, hs, mis, ss, , , offsetHours, offsetMinutes] = parts;
  const year = Number(ys); const month = Number(mos); const day = Number(ds);
  const hour = Number(hs); const minute = Number(mis); const second = Number(ss);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) return false;
  if (offsetHours !== undefined && (Number(offsetHours) > 23 || Number(offsetMinutes) > 59)) return false;
  return Number.isFinite(Date.parse(value));
}
