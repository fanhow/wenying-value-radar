import test from 'node:test';
import assert from 'node:assert/strict';
import {resumeResearchSnapshot} from '../scripts/materialize-research-snapshot.mjs';
import {DAILY_VALUATION_VERSION} from '../lib/daily-valuation-state.ts';

const runId='synthetic_snapshot_resume_run',token='SYNTHETIC_RESUME_TOKEN',key='SYNTHETIC_RESUME_KEY';
const expectedSessions={TW:'2026-10-23',US:'2026-10-23'};
const status=()=>({runId,state:'partial',expectedSessions,valuationVersion:DAILY_VALUATION_VERSION,
  taiwanValuationCurrent:true,sourcePolicyCurrent:true,coverage:{TW:{ready:2}}});

test('manual snapshot resume reads the explicit accepted financial head without collecting or finalizing',async()=>{
  const calls=[];const fetcher=async()=>{throw Error('NO_UNMOCKED_NETWORK');};
  const result=await resumeResearchSnapshot({runId,token,key,fetcher,
    readStatus:async options=>{calls.push('status');assert.equal(options.token,token);assert.equal(options.fetcher,fetcher);return status();},
    materialize:async options=>{
      calls.push('materialize');assert.deepEqual(options.expectedSessions,expectedSessions);
      assert.equal(options.runId,runId);assert.equal(options.token,token);assert.equal(options.key,key);
      assert.equal(options.expectedCount,2);assert.equal(options.expectedValuationVersion,DAILY_VALUATION_VERSION);
      assert.equal(options.fetcher,fetcher);return {published:true};
    }});
  assert.deepEqual(calls,['status','materialize']);assert.deepEqual(result,{published:true});
});

test('manual snapshot resume never silently chooses a different head or stale policy',async()=>{
  for(const change of [s=>s.runId='synthetic_other_head',s=>s.state='running',s=>s.valuationVersion='old',
    s=>s.sourcePolicyCurrent=false,s=>s.taiwanValuationCurrent=false]) {
    const current=status();change(current);let materializations=0;
    await assert.rejects(resumeResearchSnapshot({runId,token,key,readStatus:async()=>current,
      materialize:async()=>{materializations++;}}));
    assert.equal(materializations,0);
  }
});

test('manual snapshot resume validates explicit identity and credentials before any read',async()=>{
  for(const override of [{runId:undefined},{runId:'bad'},{token:''},{key:''}]) {
    let reads=0;
    await assert.rejects(resumeResearchSnapshot({runId,token,key,...override,readStatus:async()=>{reads++;return status();}}));
    assert.equal(reads,0);
  }
});
