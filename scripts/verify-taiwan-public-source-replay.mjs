// Offline regression companion for fixed public captures. No network or source edits.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cp,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {evaluatePublicCapture} from './capture-taiwan-pcb-public.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const mutations=[
  {id:'processed-eps',change:input=>{input.records.find(r=>r.status==='ready').stock.eps+=1;},pattern:/Frozen raw bodies must reproduce/},
  {id:'processed-price',change:input=>{input.records.find(r=>r.status==='ready').stock.price+=10;},pattern:/Frozen raw bodies must reproduce/},
  {id:'processed-share-asof',change:input=>{input.records.find(r=>r.status==='ready').stock.financialMetrics.shareAsOfDate='2026-03-31';},pattern:/Frozen raw bodies must reproduce/},
  {id:'capture-observed-at',change:input=>{input.observedAt='2026-09-30T00:00:00.000Z';},pattern:/Capture observation time must match/},
  {id:'fixed-cohort-members',change:input=>{input.boundedCandidates.pop();},pattern:/Fixed candidate list must not change/},
];

export async function verifyPublicSourceReplay(sourceDirectory) {
  const directory=resolve(sourceDirectory),inputBytes=await readFile(join(directory,'inputs.json'));
  const manifestBytes=await readFile(join(directory,'captures.json')),input=JSON.parse(inputBytes),manifest=JSON.parse(manifestBytes);
  const baseline=await evaluatePublicCapture(directory,input);
  assert.equal(baseline.sourceReplay.status,'PASS');
  const cases=[];
  const scratch=await mkdtemp(join(tmpdir(),'wenying-public-source-regression-'));
  try {
    for(const mutation of mutations) {
      const copy=join(scratch,mutation.id);await cp(directory,copy,{recursive:true});
      const altered=structuredClone(input);mutation.change(altered);
      // Change both persisted and supplied processed input. Raw replay must still
      // catch corruption, beyond merely comparing two copies of processed data.
      await writeFile(join(copy,'inputs.json'),JSON.stringify(altered,null,2)+'\n');
      await assert.rejects(()=>evaluatePublicCapture(copy,altered),mutation.pattern);
      cases.push({id:mutation.id,status:'PASS',expected:'REJECTED'});
    }
    const suppliedOnly=structuredClone(input);suppliedOnly.records.find(r=>r.status==='ready').stock.eps+=1;
    await assert.rejects(()=>evaluatePublicCapture(directory,suppliedOnly),/Evaluation input differs from the persisted capture/);
    cases.push({id:'supplied-input-only',status:'PASS',expected:'REJECTED'});
    const copy=join(scratch,'raw-body');await cp(directory,copy,{recursive:true});
    const raw=manifest.captures.find(c=>c.rawPath);
    const rawBytes=await readFile(join(copy,raw.rawPath));
    await writeFile(join(copy,raw.rawPath),Buffer.concat([rawBytes,Buffer.from(' ')]));
    await assert.rejects(()=>evaluatePublicCapture(copy,input),{code:'ERR_ASSERTION'});
    cases.push({id:'raw-body-hash',status:'PASS',expected:'REJECTED'});
  } finally {await rm(scratch,{recursive:true,force:true});}
  assert.equal(sha(await readFile(join(directory,'inputs.json'))),sha(inputBytes));
  assert.equal(sha(await readFile(join(directory,'captures.json'))),sha(manifestBytes));
  return {version:'taiwan-public-source-regression-v1',status:'PASS',sourceDirectory:directory,
    quoteDate:baseline.quoteDate,observedAt:baseline.observedAt,cohort:baseline.cohort,
    inputSha256:sha(inputBytes),captureManifestSha256:sha(manifestBytes),
    baselineSourceReplay:baseline.sourceReplay,baselineSummary:baseline.summary,
    sourceModelHashes:baseline.modelHashes,cases,networkFallback:false,originalSourceUnchanged:true};
}

async function main(args) {
  const options={};
  for(let i=0;i<args.length;i+=2) {
    if(!['--input-dir','--out'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('Usage: --input-dir FIXED_CAPTURE_DIRECTORY --out NEW_RESULT.json');
    options[args[i]]=args[i+1];
  }
  if(!options['--input-dir']||!options['--out'])throw new Error('INPUT_DIRECTORY_AND_NEW_RESULT_REQUIRED');
  const result=await verifyPublicSourceReplay(options['--input-dir']);
  const bytes=JSON.stringify(result,null,2)+'\n',out=resolve(options['--out']);
  await writeFile(out,bytes,{flag:'wx'});
  process.stdout.write(JSON.stringify({outputPath:out,outputSha256:sha(bytes),status:result.status,cases:result.cases.length,sourceReplay:result.baselineSourceReplay})+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
