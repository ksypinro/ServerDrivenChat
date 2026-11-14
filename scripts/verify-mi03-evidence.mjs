/** Read-only consistency audit of the bounded MI-03 real-native evidence, not a native test runner. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const evidence = new URL('evidence/MI03/', root);
const read = async name => JSON.parse(await readFile(new URL(name, evidence), 'utf8'));
const verification = await read('verification.json');
const api = await read('api-native-2026-11-12.json');
const cleanup = await read('credential-cleanup-2026-11-12.json');
assert.equal(verification.status, 'passed-for-user-selected-bounded-subset');
assert.equal(verification.scopeDecision.userSelection, 'Accept the exact 2–3-window six-case subset; explicitly track broader gaps');
assert.deepEqual(verification.cases.map(item => item.case), [1, 2, 3, 4, 5, 6]);
assert.ok(verification.cases.every(item => item.status.startsWith('passed')));
assert.ok(verification.remainingUnqualified.length >= 8, 'Broader gates must remain explicit');

async function capture(name, count) {
    const result = await read(`sessions-${name}.json`);
    assert.equal(result.expectedLiveTestBindings, count);
    assert.equal(result.liveBindings.length, count);
    assert.equal(result.duplicateLiveTasks, 0);
    assert.ok(result.liveBindings.every(item => item.scoped));
    assert.equal(new Set(result.liveBindings.map(item => item.task)).size, count);
    if (count > 1) assert.equal(new Set(result.liveBindings.map(item => item.device)).size, 1);
    return result.liveBindings;
}
const byWindow = (items, name) => { const result = items.filter(item => item.labels.workspaceLabel === name); assert.equal(result.length, 1); return result[0]; };
const first = await capture('case1', 2);
const third = await capture('case2', 3);
const cancelled = await capture('case3-cancel', 2);
const moved = await capture('case3', 2);
const reloaded = await capture('case4-reload-settled', 1);
const beforeCleanup = await capture('case6-before-cleanup', 2);
await capture('case6', 0);
const fresh = await capture('case6-fresh-pairing', 1);
await capture('final-disconnected', 0);

const originalA = byWindow(first, 'window-a');
assert.equal(byWindow(cancelled, 'window-a').binding, originalA.binding);
assert.equal(byWindow(moved, 'window-b').task, originalA.task);
assert.notEqual(byWindow(moved, 'window-b').binding, originalA.binding);
assert.equal(byWindow(reloaded, 'window-b').binding, byWindow(moved, 'window-b').binding);
const originalC = byWindow(third, 'window-c');
const reopenedC = byWindow(beforeCleanup, 'window-c');
assert.equal(reopenedC.task, originalC.task);
assert.notEqual(reopenedC.host, originalC.host);
assert.equal(fresh[0].task, reopenedC.task);
assert.notEqual(fresh[0].device, reopenedC.device);

const rounds = api.checks.filter(item => item.kind === 'concurrent-public-api-roundtrip');
assert.deepEqual(rounds.map(item => item.turns.length), [2, 3, 2, 2, 1, 2, 1]);
const turns = rounds.flatMap(item => item.turns);
assert.equal(turns.length, 13);
assert.equal(new Set(turns.map(item => item.operation)).size, 13);
assert.ok(turns.every(item => item.status === 'completed' && item.commandState === 'applied' && item.sameKeyRetryIdentical));
for (const round of rounds) {
    assert.ok(round.visibility.every(item => item.ownMarkerPresent && item.foreignMarkersAbsent));
    if (round.turns.length > 1) assert.ok(round.checks.every(item => item.crossSessionReadStatus === 403 && item.ownAliasVisible && !item.otherAliasVisible));
}
for (const label of ['case3', 'case6']) assert.ok(api.checks.some(item => item.kind === 'old-binding-fenced' && item.label === label && item.status === 403));
assert.equal(api.keyCleanup.length, 7);
assert.equal(new Set(api.keyCleanup.map(item => item.credential)).size, 7);
assert.ok(api.keyCleanup.every(item => item.revoked && item.rejectedStatus === 401));
assert.ok(api.endedAt);
assert.equal(api.failures.length, 1, 'Unexpected failed attempts need explicit reconciliation');
assert.equal(api.failures[0].command, 'capture');
assert.equal(api.failures[0].label, 'case4-reload');
assert.match(api.failures[0].reason, /2 !== 1/);

assert.equal(cleanup.status, 'passed');
assert.equal(cleanup.before.liveScopedBindings, 2);
assert.ok(cleanup.before.inboxFilesWithOpenProcesses >= 2);
assert.equal(cleanup.after.perBindingInboxFiles, 0);
assert.equal(cleanup.after.openSqliteHandlesUnderInboxDirectory, 0);
assert.ok(cleanup.finalHandleAudit.isolatedAppProcessesChecked > 0);
assert.equal(cleanup.finalHandleAudit.openInboxSqliteHandlesIncludingUnlinkedFiles, 0);
assert.ok(cleanup.freshPairing.deviceDigestChanged && cleanup.freshPairing.sameNativeTaskDigestPreserved && cleanup.freshPairing.nativeApiEchoCompleted);
assert.equal(cleanup.temporaryApiCredentials.unrevokedMI03TestKeys, 0);
for (const artifact of verification.artifacts) {
    const path = new URL(artifact.file, root);
    assert.ok(path.href.startsWith(root.href), 'Artifact path escaped the repository');
    assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'), artifact.sha256, `Artifact hash changed: ${artifact.file}`);
}
for (const result of [verification.freshChecks.mi02Units, verification.freshChecks.mi01AndMi02Postgres]) {
    assert.equal(result.failed, 0); assert.equal(result.skipped, 0);
}
assert.equal(verification.finalState.liveTestBindings, 0);
assert.equal(verification.finalState.unrevokedMI03TestApiKeys, 0);
console.log('MI-03 bounded evidence coherent: six cases, 13 real-native API turns, seven revoked keys, final zero live bindings/inbox handles. Broader gaps remain unqualified.');
