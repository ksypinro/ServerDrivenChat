"""One real hour of selected production topology observation, without reading secrets."""
import datetime, json, pathlib, subprocess, sys, time
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'evidence/M26/deployed-soak.json')
report = dict(status='running', startedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), samples=[], failures=[], topology='Persistent Docker HTTPS/Keycloak/PostgreSQL/server/gateway and installed isolated native Cline bridge. Native API consumers produce activity; subsequent quiet lease renewal is idle.')
start = time.monotonic()
def run(args):
    return subprocess.check_output(args, text=True, timeout=15).strip()
def save():
    out.write_text(json.dumps(report, indent=2)+'\n')
while time.monotonic()-start < 3600:
    sample = dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(), elapsedSeconds=time.monotonic()-start)
    try:
        sample['healthStatus'] = run(['curl','--ipv4','--fail','--silent','--show-error','--max-time','8','-o','/dev/null','-w','%{http_code}','https://localhost:15943/api/v1/health'])
        sample['native'] = json.loads(run(['docker','exec','sdc-local-postgres-1','psql','-U','sdc_app','-d','sdc','-Atc',"SELECT json_build_object('activeBindings',(SELECT count(*) FROM bindings WHERE state='active' AND lease_expires_at>now()),'commandCount',(SELECT count(*) FROM commands),'eventCount',(SELECT count(*) FROM events),'pendingCommands',(SELECT count(*) FROM commands c LEFT JOIN command_acknowledgements a USING(device_id,lane,lane_seq) WHERE a.state IS NULL OR a.state='received'))"]))
        sample['containers'] = run(['docker','ps','--filter','name=sdc-local-','--format','{{.Names}} {{.Status}}']).splitlines()
        if sample['healthStatus'] != '200': raise RuntimeError('Deployed health failed')
        if sample['native']['activeBindings'] < 1: raise RuntimeError('No unexpired active native binding')
    except Exception as error:
        report['failures'].append(dict(at=sample['at'], reason=str(error)))
    report['samples'].append(sample);save()
    time.sleep(min(30,max(0,3600-(time.monotonic()-start))))
report['actualDurationSeconds'] = time.monotonic()-start
report['endedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
report['status'] = 'passed' if not report['failures'] else 'failed'
save()
print(report['status'])
