import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
let esbuild;
try {esbuild=require('esbuild');}
catch(error) {
  if(error?.code!=='MODULE_NOT_FOUND')throw error;
  const explicit=process.env.WENYING_TEST_ESBUILD_PATH;
  if(!explicit||!path.isAbsolute(explicit)||!explicit.replaceAll('\\','/').endsWith('/esbuild/lib/main.js'))
    throw new Error('Install the declared esbuild dependency or explicitly set WENYING_TEST_ESBUILD_PATH to an existing esbuild/lib/main.js. No dependency is downloaded by this loader.');
  esbuild=require(explicit);
}

// Engineering controls only. No provider, production DB, credentials, or stock
// directory is accessed. Request, runner, and safety diagnostics are REAL source.
const root=fileURLToPath(new URL('../',import.meta.url));
const generated=path.join(root,'test-support','.generated');
const stubs={
  'daily-refresh-data.ts': `
    export function isoDate(v) {
      return typeof v==='string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(v)
        && Number.isFinite(Date.parse(v+'T00:00:00Z'))
        && new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v ? v : null;
    }
    export async function fetchRefreshRecord(){throw new Error('SYNTHETIC_FETCH_MUST_BE_INJECTED');}
    export async function expectedSession(){throw new Error('SYNTHETIC_SESSION_MUST_BE_INJECTED');}
  `,
  'daily-refresh-generation.ts': `
    export function prepareTaiwanRefreshGeneration(records) {
      if(records.some(r=>r.syntheticPrepareFailure))throw new Error('SYNTHETIC_PRIVATE_SENTINEL');
      return records;
    }
  `,
  'verified-held-refresh-scope.ts': 'export const VERIFIED_HELD_REFRESH_TARGETS=[];',
  'daily-valuation-state.ts': "export const DAILY_VALUATION_VERSION='tw-comparables-2026-10-03-method-notes-v4';",
};
const cache=new Map();
function financialBoundary(used) {
  return {name:'explicit-synthetic-financial-boundary',setup(build){
    build.onResolve({filter:/\/(daily-refresh-data|daily-refresh-generation|verified-held-refresh-scope|daily-valuation-state)\.ts$/},args=>{
      const name=path.basename(args.path);used.add(name);return {path:name,namespace:'engineering-control'};
    });
    build.onLoad({filter:/.*/,namespace:'engineering-control'},args=>({contents:stubs[args.path],loader:'js'}));
  }};
}
async function atomicBundle(output,contents) {
  const temporary=output+'.'+process.pid+'.tmp';
  await writeFile(temporary,contents);await rename(temporary,output);
}
export async function loadCandidate(entry) {
  if(!['request','runner'].includes(entry))throw new Error('Unknown engineering entry');
  if(cache.has(entry))return cache.get(entry);
  const promise=(async()=>{
    const used=new Set();
    const source=path.join(root,'scripts',entry==='request'?'daily-refresh-request.mjs':'daily-refresh.mjs');
    const bundle=await esbuild.build({entryPoints:[source],bundle:true,write:false,platform:'node',format:'esm',
      logLevel:'silent',metafile:true,plugins:[financialBoundary(used)]});
    await mkdir(generated,{recursive:true});
    const output=path.join(generated,entry+'-engine.mjs');
    await atomicBundle(output,bundle.outputFiles[0].contents);
    const module=await import(pathToFileURL(output).href);
    return {module,entrySource:source,stubbedModules:[...used].sort(),sourceInputs:Object.keys(bundle.metafile.inputs)};
  })();
  cache.set(entry,promise);return promise;
}

export async function bundleRegressionTest(name) {
  if(!['daily-refresh-collector-diagnostics.test.mjs','daily-refresh-finalize-timeout.test.mjs'].includes(name))
    throw new Error('Unknown engineering regression entry');
  await loadCandidate('runner');
  const used=new Set(),source=path.join(root,'tests',name),runnerSource=path.join(root,'scripts','daily-refresh.mjs');
  const bundle=await esbuild.build({entryPoints:[source],bundle:true,write:false,platform:'node',format:'esm',
    logLevel:'silent',plugins:[{name:'preserve-runner-module-identity',setup(build){
      // Keep the real runner as a separately compiled module. Merging its CLI
      // guard with a test entry would make import.meta.url equal argv[1].
      build.onResolve({filter:/\/scripts\/daily-refresh\.mjs$/},args=>
        path.resolve(args.resolveDir,args.path)===runnerSource
          ?{path:path.join(generated,'runner-engine.mjs'),external:true}:undefined);
    }},financialBoundary(used)]});
  const output=path.join(generated,'regression-'+name);
  await atomicBundle(output,bundle.outputFiles[0].contents);
  return {output,source,stubbedModules:[...used].sort()};
}
