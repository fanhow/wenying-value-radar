import test from 'node:test';
import assert from 'node:assert/strict';
import {access,mkdtemp,cp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validatePublicGeneration} from '../scripts/validate-taiwan-public-generation.mjs';

const root=fileURLToPath(new URL('../outputs/local-validation/',import.meta.url));
async function present(t) {
  try {await access(join(root,'pcb-public-20261002/inputs.json'));await access(join(root,'memory-public-20261002/inputs.json'));return true;}
  catch {t.skip('NOT_RUN: fixed ignored 17-company public captures are absent; no synthetic substitution for true evidence.');return false;}
}
test('17 fixed raw-replayed real stocks traverse prepare, batch, finalize and sealed same-generation research locally',async t=>{
  if(!await present(t))return;
  const report=await validatePublicGeneration(root);
  assert.equal(report.status,'PASS');assert.equal(report.sourceReplay.reduce((n,capture)=>n+capture.rawBodiesHashVerified,0),46);
  assert.equal(report.trueSummary.ready,17);assert.equal(report.trueSummary.rankingEligible,0);
  assert.equal(report.rejectionChecks.length,4);assert.equal(report.syntheticControls.length,3);
});
test('the integrated replay rejects changed real processed input before preparing or publishing any generation',async t=>{
  if(!await present(t))return;
  const scratch=await mkdtemp(join(tmpdir(),'wenying-fixed-pipeline-tamper-'));
  try {
    // Only copied inputs need changing: pinned SHA must reject before reading raw.
    const directory=join(scratch,'pcb-public-20261002');await cp(join(root,'pcb-public-20261002'),directory,{recursive:true});
    const input=JSON.parse(await readFile(join(directory,'inputs.json'),'utf8'));input.records[0].stock.price+=1;
    await writeFile(join(directory,'inputs.json'),JSON.stringify(input));
    await assert.rejects(()=>validatePublicGeneration(scratch),/Original fixed processed input must retain its pinned hash/);
  } finally {await rm(scratch,{recursive:true,force:true});}
});
