// Offline native-engine before/after on the already-fixed synthetic protocol.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {syntheticApplicabilityStocks,validationIssuerSplit,VALIDATION_PROTOCOL} from './validate-taiwan-applicability.mjs';
import {buildTaiwanComparableMap} from '../lib/taiwan-comparables.ts';
import {calculateStock} from '../lib/valuation.ts';
import {dailyValuationState,DAILY_VALUATION_VERSION} from '../lib/daily-valuation-state.ts';

const BASELINE_COMMIT='ccc6d1d08612edf051b1b552b445bb1301745068';
const BASELINE_HASHES={
  'lib/valuation.ts':'e6039ad2c98fdfc05177c4940e0dfe066a6b94f92401eb24eeb697efabf473d3',
  'lib/taiwan-comparables.ts':'982a702e0f1183d470f0283348af306bae574eeda9ebe43ffb57484a8fbfb910',
  'lib/daily-valuation-state.ts':'691bba7e5ca1c7fbfa4db62219cc4d424946484d201f26350ea4db86aff9f576',
};
const IDS=['pe','pb','p-sales','ev-revenue','ev-ebitda','ev-ebit'];
const sha=v=>createHash('sha256').update(v).digest('hex');
function evaluate(engine,target,cohort) {
  const comparableMultiples=engine.buildTaiwanComparableMap(cohort).get(target.ticker);
  const input={...target,comparableMultiples,valuationPolicy:'tw-comparables-v1',
    dailyValuationVersion:engine.DAILY_VALUATION_VERSION,dailyRunId:'fixed-synthetic-local-comparison'};
  const state=engine.dailyValuationState(input,input.dailyRunId),stock=state.stock;
  const direct=engine.calculateStock(input);
  assert.deepEqual(stock.models,direct.models);
  return {ticker:target.ticker,synthetic:true,price:target.price,modelIds:stock.models.map(m=>m.id),
    nativeFairValue:state.hasModel?stock.fairValue:null,displayedFairValue:state.hasModel?(stock.calibratedFairValue??stock.fairValue):null,
    nativeConfidence:stock.valuationConfidence,calibrationConfidence:stock.calibrationConfidence,
    reviewRequired:stock.valuationReviewRequired===true,rankingEligible:state.rankingEligible,rankingIssues:state.issues,
    applicabilityEvidencePresent:!!comparableMultiples?.taiwanApplicabilityEvidence};
}
function summary(rows) {
  return {targets:rows.length,calculable:rows.filter(r=>r.nativeFairValue!==null).length,
    rankingEligible:rows.filter(r=>r.rankingEligible).length,reviewRequired:rows.filter(r=>r.reviewRequired).length,
    nativeLowConfidence:rows.filter(r=>r.nativeConfidence==='low').length,
    calibrationLowConfidence:rows.filter(r=>r.calibrationConfidence==='low').length,
    modelCoverage:Object.fromEntries(IDS.map(id=>[id,rows.filter(r=>r.modelIds.includes(id)).length])),
    applicabilityEvidencePresent:rows.filter(r=>r.applicabilityEvidencePresent).length};
}
async function main(args) {
  const options={};
  for(let i=0;i<args.length;i+=2) {
    if(!['--baseline-dir','--out'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('Usage: --baseline-dir EXTRACTED_COMMIT_DIR --out NEW_RESULT.json');
    options[args[i]]=args[i+1];
  }
  if(!options['--baseline-dir']||!options['--out'])throw new Error('BASELINE_DIRECTORY_AND_NEW_OUTPUT_REQUIRED');
  const baselineDir=resolve(options['--baseline-dir']);
  for(const [file,hash] of Object.entries(BASELINE_HASHES))assert.equal(sha(await readFile(resolve(baselineDir,file))),hash,'Pinned baseline source hash mismatch: '+file);
  const oldComparable=await import(pathToFileURL(resolve(baselineDir,'lib/taiwan-comparables.ts')).href);
  const oldValuation=await import(pathToFileURL(resolve(baselineDir,'lib/valuation.ts')).href);
  const oldDaily=await import(pathToFileURL(resolve(baselineDir,'lib/daily-valuation-state.ts')).href);
  const oldEngine={...oldComparable,...oldValuation,...oldDaily};
  const newEngine={buildTaiwanComparableMap,calculateStock,dailyValuationState,DAILY_VALUATION_VERSION};
  const panels=[];
  for(const quoteDate of VALIDATION_PROTOCOL.quoteDates) {
    const stocks=syntheticApplicabilityStocks(quoteDate),raw=JSON.stringify(stocks);
    const train=stocks.filter(s=>validationIssuerSplit(s.ticker)==='train'),holdout=stocks.filter(s=>validationIssuerSplit(s.ticker)==='holdout');
    assert.equal(train.length,870);assert.equal(holdout.length,230);
    const rows=holdout.map(target=>{
      const cohort=[...train.filter(s=>s.industry===target.industry),target];
      const baseline=evaluate(oldEngine,structuredClone(target),structuredClone(cohort));
      const current=evaluate(newEngine,structuredClone(target),structuredClone(cohort));
      return {ticker:target.ticker,baseline,current};
    });
    assert.equal(JSON.stringify(stocks),raw);
    panels.push({quoteDate,synthetic:true,train:train.length,holdout:holdout.length,inputSha256:sha(raw),
      baseline:summary(rows.map(r=>r.baseline)),current:summary(rows.map(r=>r.current)),
      transitions:{bothCalculable:rows.filter(r=>r.baseline.nativeFairValue!==null&&r.current.nativeFairValue!==null).length,
        baselineOnlyCalculable:rows.filter(r=>r.baseline.nativeFairValue!==null&&r.current.nativeFairValue===null).length,
        currentOnlyCalculable:rows.filter(r=>r.baseline.nativeFairValue===null&&r.current.nativeFairValue!==null).length,
        removedFromRanking:rows.filter(r=>r.baseline.rankingEligible&&!r.current.rankingEligible).length,
        addedToRanking:rows.filter(r=>!r.baseline.rankingEligible&&r.current.rankingEligible).length},
      prespecifiedExamples:rows.slice(0,5),rows});
  }
  const currentFiles=['lib/taiwan-comparables.ts','lib/taiwan-multiple-applicability.ts','lib/valuation.ts','lib/daily-valuation-state.ts'];
  const currentHashes=Object.fromEntries(await Promise.all(currentFiles.map(async p=>[p,sha(await readFile(new URL('../'+p,import.meta.url)))])));
  const result={version:'synthetic-native-engine-comparison-v1',protocol:VALIDATION_PROTOCOL,baselineCommit:BASELINE_COMMIT,
    baselineDir,baselineHashes:BASELINE_HASHES,currentHashes,panels,
    realData:{status:'NOT_RUN',reason:'Current and historical complete frozen real-source captures are unavailable locally.'},
    limitations:['Both arms use unchanged synthetic issuer split and training-only peers plus one holdout target.',
      'The old production baseline accepts supplier as-of share metadata but has no new per-model applicability evidence.',
      'Different fair values/coverage and ranking abstention are behavior changes, not evidence of valuation accuracy.',
      'No external fair value, selected multiple or target price is used.']};
  const bytes=JSON.stringify(result,null,2)+'\n';await writeFile(resolve(options['--out']),bytes,{flag:'wx'});
  process.stdout.write(JSON.stringify({...result,panels:panels.map(({rows,...panel})=>({...panel,rowCount:rows.length})),outputPath:resolve(options['--out']),outputSha256:sha(bytes)},null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
