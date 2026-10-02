import test from 'node:test';
import assert from 'node:assert/strict';
import {measuredDatabase,loadScaleAllowed,loadScalePreflight,nativeLoadOutput,LOCAL_BUDGETS} from '../scripts/validate-refresh-load-local.mjs';

test('local load instrumentation measures executed SQLite stock page bytes and query counts',async()=>{
  let sampled=0;const db=measuredDatabase(()=>sampled++);
  try {
    await db.prepare('CREATE TABLE stocks(ticker TEXT,stock TEXT)').run();
    await db.batch([db.prepare('INSERT INTO stocks VALUES(?,?)').bind('A','繁體'),db.prepare('INSERT INTO stocks VALUES(?,?)').bind('B','abc')]);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM stocks').first()).n,2);
    const page=await db.prepare('WITH research_integrity_candidates AS (SELECT * FROM stocks) SELECT * FROM research_integrity_candidates').all();
    assert.equal(page.results.length,2);assert.equal(db.metrics.queries,5);assert.equal(sampled,5);
    assert.equal(db.metrics.queryStockBytes,Buffer.byteLength('繁體abc'));
    assert.equal(db.metrics.maxQueryStockBytes,9);assert.equal(db.metrics.maxQueryStockRows,2);
    assert.equal(db.metrics.integrityPages,1);assert.equal(db.metrics.maxIntegrityPageBytes,9);
  }finally {db.raw.close();}
});

test('only successful completed local measurements with independent heap RSS and time headroom permit scaling',()=>{
  const prior={measurement:{status:'passed',processKernelMaxRssBytes:100*1048576,sampledPeakHeapBytes:50*1048576},
    observedWorkerSampledPeakRssBytes:120*1048576,wallMilliseconds:1000,stopReason:null};
  assert.equal(loadScaleAllowed(prior),true);
  for(const status of ['failed','aborted','skipped','running'])assert.equal(loadScaleAllowed({...prior,measurement:{...prior.measurement,status}}),false);
  assert.equal(loadScaleAllowed({...prior,stopReason:'LOCAL_TIMEOUT'}),false);
  assert.equal(loadScaleAllowed({...prior,observedWorkerSampledPeakRssBytes:LOCAL_BUDGETS.rssMiB*1048576}),false);
  assert.equal(loadScaleAllowed({...prior,measurement:{...prior.measurement,processKernelMaxRssBytes:LOCAL_BUDGETS.rssMiB*1048576}}),false);
  assert.equal(loadScaleAllowed({...prior,measurement:{...prior.measurement,sampledPeakHeapBytes:LOCAL_BUDGETS.heapMiB*1048576}}),false);
  assert.equal(loadScaleAllowed({...prior,wallMilliseconds:LOCAL_BUDGETS.timeoutSeconds*1000}),false);
  assert.equal(loadScaleAllowed(undefined),false);
  assert.equal(LOCAL_BUDGETS.workerConceptMiB,128);
  assert.notEqual(LOCAL_BUDGETS.heapMiB,LOCAL_BUDGETS.workerConceptMiB);
});


test('market-shaped final level is not run when its measured stock/history RSS preflight exceeds the local budget',()=>{
  const prior={measurement:{status:'passed',level:{twCount:740,usCount:8},processKernelMaxRssBytes:300*1048576,
    sampledPeakHeapBytes:100*1048576,storedStockBytesByMarket:{TW:100*1048576,US:16000},
    storedHistoryBytesByMarket:{TW:8*1048576,US:80000}},observedWorkerSampledPeakRssBytes:300*1048576,
    wallMilliseconds:1000,stopReason:null};
  const next={id:'usefulReady6165',twCount:1850,usCount:4315};
  const denied=loadScalePreflight(prior,next);assert.equal(denied.allowed,false);
  assert.ok(denied.projectedLocalRssBytes>LOCAL_BUDGETS.rssMiB*1048576);
  assert.equal(denied.reason,'CONSERVATIVE_LOCAL_RSS_PREFLIGHT');
  assert.deepEqual(loadScalePreflight({...prior,measurement:{...prior.measurement,storedStockBytesByMarket:undefined}},next),
    {allowed:false,reason:'MISSING_MEASURED_FOOTPRINT'});
  assert.deepEqual(loadScalePreflight(prior,{id:'groups740'}),{allowed:true});
  const safe=loadScalePreflight({...prior,measurement:{...prior.measurement,processKernelMaxRssBytes:100*1048576,
    storedStockBytesByMarket:{TW:1,US:1},storedHistoryBytesByMarket:{TW:1,US:1}}},next);
  assert.equal(safe.allowed,true);
});


test('native proof includes actual model values and ranges, detecting equal-center model changes',()=>{
  const record={market:'TW',ticker:'7184'},state={hasModel:true,rankingEligible:false,stock:{fairValue:100,upside:.4,
    valuationConfidence:'low',valuationReviewRequired:false,models:[{id:'pe',value:80,rangeLow:70,rangeHigh:90,weight:.5},
      {id:'pb',value:120,rangeLow:110,rangeHigh:130,weight:.5}]}};
  const original=nativeLoadOutput(record,state),swapped=nativeLoadOutput(record,{...state,stock:{...state.stock,
    models:state.stock.models.map(model=>({...model,value:model.id==='pe'?120:80}))}});
  assert.deepEqual(original.models.map(model=>model.value),[80,120]);
  assert.deepEqual(original.models.map(model=>[model.rangeLow,model.rangeHigh]),[[70,90],[110,130]]);
  assert.equal(original.nativeFairValue,swapped.nativeFairValue);
  assert.notDeepEqual(original,swapped);
});
