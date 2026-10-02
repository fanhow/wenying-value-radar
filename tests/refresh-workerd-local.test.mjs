import test from 'node:test';
import assert from 'node:assert/strict';
import {localWorkerdOptions,validateWorkerdLevels,workerdScaleAllowed,localWorkerSource,
  preparedPeerDigest,WORKERD_COMPATIBILITY_DATE} from '../scripts/validate-refresh-workerd-local.mjs';
import {buildRefreshLoadFixture} from '../scripts/refresh-load-fixture.mjs';
import {prepareTaiwanRefreshGeneration} from '../lib/daily-refresh-generation.ts';

test('local workerd options have no persistent or remote binding and block outbound fetches',async()=>{
  const blocked={count:0},options=localWorkerdOptions('/tmp/local-core.mjs',blocked);
  assert.equal(options.host,'127.0.0.1');assert.equal(options.port,0);assert.equal(options.inspectorPort,0);
  assert.equal(options.modulesRoot,'/tmp');assert.equal(options.cf,false);assert.equal(options.d1Persist,false);
  assert.equal(options.unsafeInspectorProxy,false);assert.equal(options.compatibilityDate,WORKERD_COMPATIBILITY_DATE);
  assert.deepEqual(options.compatibilityFlags,['nodejs_compat']);
  assert.equal(Object.keys(options.d1Databases).length,1);assert.match(options.d1Databases.DB,/^synthetic-local-/);
  assert.notEqual(options.d1Databases.DB,localWorkerdOptions('/tmp/other.mjs').d1Databases.DB);
  const refused=await options.outboundService(new Request('https://example.invalid/'));
  assert.equal(refused.status,503);assert.equal(await refused.text(),'LOCAL_NETWORK_DISABLED');assert.equal(blocked.count,1);
});

test('local engine scale rejects unbounded fixtures and checkpoint-only headroom',()=>{
  assert.deepEqual(validateWorkerdLevels(['dense185']),['dense185']);
  assert.deepEqual(validateWorkerdLevels(['dense185','groups740']),['dense185','groups740']);
  for(const levels of [[],['groups740'],['dense185','scale6000'],['dense185','groups740','scale4000']])assert.throws(()=>validateWorkerdLevels(levels));
  assert.equal(workerdScaleAllowed({status:'passed',isolatePeakHeapBytes:10*1048576}),false);
  assert.equal(workerdScaleAllowed({status:'passed',isolatePeakHeapVerified:false,isolatePeakHeapBytes:10*1048576}),false);
  assert.equal(workerdScaleAllowed({status:'failed',isolatePeakHeapVerified:true,isolatePeakHeapBytes:10*1048576}),false);
  assert.equal(workerdScaleAllowed({status:'passed',isolatePeakHeapVerified:true,isolatePeakHeapBytes:65*1048576}),false);
  assert.equal(workerdScaleAllowed({status:'passed',isolatePeakHeapVerified:true,isolatePeakHeapBytes:10*1048576}),true);
});

test('engine parity digest binds actual selected peers and refuses equivalent-count evidence changes',()=>{
  const fixture=buildRefreshLoadFixture('dense185'),records=prepareTaiwanRefreshGeneration(fixture.records,fixture.meta.runId);
  const expected=preparedPeerDigest(records);assert.match(expected,/^[0-9a-f]{64}$/);
  assert.equal(preparedPeerDigest(structuredClone(records)),expected);
  const tampered=structuredClone(records);tampered[0].stock.comparableMultiples.taiwanApplicabilityEvidence.models.pe.observations[0].value+=.01;
  assert.notEqual(preparedPeerDigest(tampered),expected);
  const source=localWorkerSource();assert.match(source,/globalThis\.fetch=async\(\)=>\{throw/);
  assert.match(source,/LOCALHOST_ONLY/);assert.match(source,/LOCAL_KEY_REQUIRED/);
  assert.doesNotMatch(source,/process\.env|remoteProxyConnectionString|database_id|wrangler/);
});
