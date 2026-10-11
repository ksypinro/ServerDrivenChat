import { ActionDigestInput } from "./contracts.js";

function assertJson(value: unknown, path = "$", seen = new Set<object>()): asserts value is null | boolean | number | string | unknown[] | Record<string, unknown> {
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (!hasWellFormedUnicode(value)) throw new TypeError(`${path}: unpaired UTF-16 surrogate is not valid I-JSON`);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path}: non-finite numbers are not JSON values`);
    return;
  }
  if (typeof value !== "object") throw new TypeError(`${path}: value is not JSON-compatible`);
  if (seen.has(value)) throw new TypeError(`${path}: cyclic values are not JSON-compatible`);
  seen.add(value);
  if (Array.isArray(value)) {
    for (const key of Reflect.ownKeys(value)) {
      if (key === "length") continue;
      if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
        throw new TypeError(`${path}: arrays cannot contain custom or symbol properties`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) throw new TypeError(`${path}[${key}]: array entries must be enumerable data properties`);
    }
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) throw new TypeError(`${path}[${index}]: sparse arrays are not JSON-compatible`);
      assertJson(value[index], `${path}[${index}]`, seen);
    }
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${path}: only plain objects are supported`);
    const record = value as Record<string, unknown>;
    const ownKeys = Reflect.ownKeys(record);
    if (ownKeys.some((key) => typeof key !== "string")) throw new TypeError(`${path}: symbol keys are not JSON properties`);
    for (const key of ownKeys as string[]) {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) throw new TypeError(`${path}.${key}: properties must be enumerable data properties`);
      if (!hasWellFormedUnicode(key)) throw new TypeError(`${path}: object key contains an unpaired UTF-16 surrogate`);
      if (record[key] === undefined) throw new TypeError(`${path}.${key}: undefined is not JSON-compatible`);
      assertJson(record[key], `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

function hasWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

/** RFC 8785-compatible canonical JSON for the supported, finite IEEE-754 JSON subset. */
export function canonicalJson(value: unknown): string {
  assertJson(value);
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serialize).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${serialize(record[key])}`).join(",")}}`;
}

function sortedUnique<T>(values: T[]): T[] {
  const byCanonical = new Map(values.map((value) => [canonicalJson(value), value]));
  return [...byCanonical.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([, value]) => value);
}

/** Permission/choice/checksum lists are sets; action argument and command arrays retain order. */
export function normalizeActionDigestInput(input: ActionDigestInput): ActionDigestInput {
  canonicalJson(input);
  const action = structuredClone(input.action);
  if (action.attachmentChecksums) action.attachmentChecksums = sortedUnique(action.attachmentChecksums);
  if (action.artifactChecksums) action.artifactChecksums = sortedUnique(action.artifactChecksums);
  return {
    ...structuredClone(input),
    action,
    requestedPermissions: sortedUnique(input.requestedPermissions),
    availableDecisions: sortedUnique(input.availableDecisions)
  };
}

export async function computeActionDigest(input: ActionDigestInput): Promise<string> {
  const canonical = canonicalJson(normalizeActionDigestInput(input));
  const bytes = new TextEncoder().encode(canonical);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
