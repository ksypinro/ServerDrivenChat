import { spawnSync } from 'node:child_process';
if (!process.env.MI06_TEST_DATABASE_URL) {
  console.error('MI-06 requires MI06_TEST_DATABASE_URL pointing to an explicitly disposable PostgreSQL database.');
  process.exit(2);
}
if (process.env.MI06_TEST_PG_CONTAINER !== 'sdc-mi06-test-pg') { console.error('MI-06 restore requires MI06_TEST_PG_CONTAINER=sdc-mi06-test-pg.'); process.exit(2); }
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=4', '--test-reporter=tap', 'tests/mi06-migration.test.mjs', 'tests/mi06-retention.test.mjs', 'tests/mi06-recovery.test.mjs', 'tests/mi06-runtime-integration.test.mjs', 'tests/mi06-retention-restore.test.mjs', 'tests/mi06-packaged-activation.test.mjs', 'tests/mi06-extra.test.mjs', 'tests/mi06-compatibility.test.mjs', 'tests/mi06-safety.test.mjs', 'tests/mi06-process-matrix.test.mjs', 'tests/mi06-transport-gaps.test.mjs', 'tests/mi06-artifacts.test.mjs'], {encoding:'utf8',maxBuffer:20_000_000,env:process.env});
if (result.error) throw result.error;
process.stdout.write(result.stdout); process.stderr.write(result.stderr);
if (result.status !== 0 || !/^# skipped 0$/m.test(result.stdout)) { console.error('MI-06 gate failed or contained skipped tests.'); process.exit(1); }

const performanceGate=spawnSync(process.execPath,['scripts/measure-mi06.mjs'],{encoding:'utf8',maxBuffer:30_000_000,env:{...process.env,MI06_PERFORMANCE_REPORT:'evidence/MI06/performance.json'}});
process.stdout.write(performanceGate.stdout??'');process.stderr.write(performanceGate.stderr??'');if(performanceGate.error)throw performanceGate.error;if(performanceGate.status!==0)process.exit(performanceGate.status??1);
