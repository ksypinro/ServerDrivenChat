import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { apiFixture, command } from './helpers/api-fixture.mjs';

const url = process.env.MI06_TEST_DATABASE_URL;
test('MI-06 migration preserves command payloads and refuses rollback after compaction', { skip: !url && 'requires disposable PostgreSQL' }, async () => {
    const f = await apiFixture(url);
    try {
        const rollback = await readFile(new URL('../server/migrations/rollback/011_command_retention.sql', import.meta.url), 'utf8');
        await f.db.transaction(async client => { await client.query(await readFile(new URL('../server/migrations/rollback/012_command_turn_ownership.sql',import.meta.url),'utf8')); await client.query(rollback); });
        await f.bind('mi06-migration');
        const original = command('mi06-migration', 'mi06-migration-command');
        await f.db.pool.query("INSERT INTO lane_counters(device_id,lane,last_seq) VALUES($1,'prompt',1)", [f.issued.deviceId]);
        await f.db.pool.query("INSERT INTO commands(command_id,session_id,device_id,lane,lane_seq,payload) VALUES($1,$2,$3,'prompt',1,$4::jsonb)", [original.commandId,original.sessionId,f.issued.deviceId,JSON.stringify(original)]);
        await f.db.migrate();
        assert.deepEqual((await f.db.readCommands(f.issued.deviceId, 'prompt', 0))[0].payload, original);
        await assert.rejects(f.db.pool.query('UPDATE commands SET payload=NULL WHERE command_id=$1', [original.commandId]), /command_archive_metadata_valid/);
        await assert.rejects(f.db.pool.query('UPDATE commands SET payload=NULL,archived_at=now(),original_payload_bytes=12 WHERE command_id=$1', [original.commandId]), /command_archive_metadata_valid/);
        await f.db.pool.query('UPDATE commands SET payload=NULL,archived_at=now(),payload_sha256=$2,original_payload_bytes=12 WHERE command_id=$1', [original.commandId, 'a'.repeat(64)]);
        await f.db.pool.query("INSERT INTO command_lane_retention(device_id,lane,archived_through) VALUES($1,'prompt',1)", [f.issued.deviceId]);
        await assert.rejects(f.db.transaction(client => client.query(rollback)), /Refusing rollback/);
        const row = await f.db.pool.query('SELECT archived_at,payload_sha256 FROM commands WHERE command_id=$1', [original.commandId]);
        assert.ok(row.rows[0].archived_at); assert.equal(row.rows[0].payload_sha256, 'a'.repeat(64));
    } finally { await f.close(); }
});

test('MI-06 unused migration can be rolled back without losing payloads', { skip: !url && 'requires disposable PostgreSQL' }, async () => {
    const f = await apiFixture(url);
    try {
        await f.bind('mi06-unused');
        const original = command('mi06-unused', 'mi06-unused-command');
        await f.db.recordCommand({ commandId: original.commandId, sessionId: original.sessionId, deviceId: f.issued.deviceId, lane: 'prompt', payload: original });
        const rollback = await readFile(new URL('../server/migrations/rollback/011_command_retention.sql', import.meta.url), 'utf8');
        await f.db.transaction(async client => { await client.query(await readFile(new URL('../server/migrations/rollback/012_command_turn_ownership.sql',import.meta.url),'utf8')); await client.query(rollback); });
        assert.deepEqual((await f.db.pool.query('SELECT payload FROM commands WHERE command_id=$1', [original.commandId])).rows[0].payload, original);
        assert.equal((await f.db.pool.query('SELECT 1 FROM schema_migrations WHERE version=11')).rowCount, 0);
    } finally { await f.close(); }
});
