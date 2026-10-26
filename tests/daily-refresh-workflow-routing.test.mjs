import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const workflow=await readFile(new URL('../.github/workflows/daily-data-refresh.yml',import.meta.url),'utf8');
const steps=workflow.split(/^      - /m).slice(1);
const refresh=steps.find(step=>step.includes('scripts/daily-refresh.mjs'));
const snapshot=steps.find(step=>step.includes('scripts/materialize-research-snapshot.mjs'));
const condition=step=>step.match(/^        if: \$\{\{ (.+) \}\}$/m)?.[1];

// Evaluate only the narrow allowlisted condition grammar used by this route.
// No workflow shell command or arbitrary JavaScript is evaluated here.
function enabled(expression,{event,operation}) {
  return expression.split(' && ').every(clause=>{
    const match=/^(github\.event_name|inputs\.operation) (==|!=) '([a-z_-]+)'$/.exec(clause);
    assert.ok(match,'workflow guard uses the reviewed comparison grammar');
    const value=match[1]==='github.event_name'?event:operation??'';
    return match[2]==='=='?value===match[3]:value!==match[3];
  });
}

test('manual dispatch offers the existing daily default and one snapshot option with optional explicit run identity',()=>{
  assert.match(workflow,/workflow_dispatch:\n    inputs:\n      operation:\n/);
  const inputs=workflow.slice(workflow.indexOf('  workflow_dispatch:'),workflow.indexOf('\npermissions:'));
  assert.match(inputs,/type: choice\n        required: true\n        default: daily-refresh/);
  assert.match(inputs,/options:\n          - daily-refresh\n          - research-snapshot\n/);
  assert.match(inputs,/snapshot_run_id:\n        description: [^\n]+\n        type: string\n        required: false/);
});

test('scheduled and ordinary manual runs keep the daily path; snapshot writes are manual only',()=>{
  assert.ok(refresh);assert.ok(snapshot);
  assert.equal(condition(refresh),"inputs.operation != 'research-snapshot'");
  assert.equal(condition(snapshot),"github.event_name == 'workflow_dispatch' && inputs.operation == 'research-snapshot'");
  for(const [event,operation,daily,snap] of [
    ['schedule',undefined,true,false],
    ['workflow_dispatch','daily-refresh',true,false],
    ['workflow_dispatch',undefined,true,false],
    ['workflow_dispatch','research-snapshot',false,true],
    ['schedule','research-snapshot',false,false],
  ]) {
    assert.equal(enabled(condition(refresh),{event,operation}),daily);
    assert.equal(enabled(condition(snapshot),{event,operation}),snap);
  }
});

test('workflow preserves the schedule, least privilege, pinned actions and shared execution budget',()=>{
  assert.match(workflow,/schedule:\n    - cron: '30 22,23 \* \* \*'/);
  assert.match(workflow,/permissions:\n  contents: read\nconcurrency:\n  group: wenying-daily-data-refresh\n  cancel-in-progress: false/);
  assert.match(workflow,/runs-on: ubuntu-latest\n    timeout-minutes: 55/);
  assert.match(workflow,/actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/);
  assert.match(workflow,/actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/);
  assert.match(workflow,/node-version: '22\.18\.0'/);
  assert.equal(steps.length,4);
  assert.equal((workflow.match(/^permissions:/gm)??[]).length,1);
});

test('snapshot route reuses only existing secrets and keeps caller input out of shell source',()=>{
  const names=[...workflow.matchAll(/secrets\.([A-Z_]+)/g)].map(match=>match[1]);
  assert.deepEqual([...new Set(names)].sort(),['WENYING_REFRESH_SECRET','WENYING_SITE_TOKEN']);
  for(const step of [refresh,snapshot]) {
    assert.match(step,/WENYING_SITE_TOKEN: \$\{\{ secrets\.WENYING_SITE_TOKEN \}\}/);
    assert.match(step,/WENYING_REFRESH_SECRET: \$\{\{ secrets\.WENYING_REFRESH_SECRET \}\}/);
  }
  assert.match(snapshot,/WENYING_SNAPSHOT_RUN_ID: \$\{\{ inputs\.snapshot_run_id \}\}/);
  const run=snapshot.match(/^        run: (.+)$/m)?.[1];
  assert.equal(run,'node --experimental-strip-types scripts/materialize-research-snapshot.mjs "$WENYING_SNAPSHOT_RUN_ID"');
  assert.equal(run.includes('${{'),false);
  assert.equal(snapshot.includes('scripts/daily-refresh.mjs'),false);
  // Replace node with an argument recorder. A hostile synthetic input remains
  // one inert argument; no service, CLI or market collection runs in this test.
  const hostile='$(printf SHELL_INJECTION); " spaces\nsecond-line';
  const probe=spawnSync('bash',['-c',`node() { printf '%s\\0' "$@"; }\n${run}`],{
    env:{...process.env,WENYING_SNAPSHOT_RUN_ID:hostile},encoding:'utf8'});
  assert.equal(probe.status,0);assert.equal(probe.stderr,'');
  assert.deepEqual(probe.stdout.split('\0'),['--experimental-strip-types','scripts/materialize-research-snapshot.mjs',hostile,'']);
});
