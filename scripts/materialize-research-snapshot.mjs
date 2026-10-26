import {fileURLToPath} from 'node:url';
import {DAILY_VALUATION_VERSION} from '../lib/daily-valuation-state.ts';
import {assertRefreshReadback,readRefreshStatus} from './daily-refresh-request.mjs';
import {materializeResearchSnapshot,safeSnapshotFailure,SnapshotMaterializationError} from './daily-refresh-snapshot.mjs';

// Local manual backfill/resume entry point; it never begins, collects,
// finalizes or fails a financial generation. Credentials come from the same
// environment variables as daily-refresh, never from command-line arguments.
// node --experimental-strip-types scripts/materialize-research-snapshot.mjs RUN_ID
export async function resumeResearchSnapshot({runId,token=process.env.WENYING_SITE_TOKEN,key=process.env.WENYING_REFRESH_SECRET,
  fetcher=fetch,wait,now=Date.now,readStatus=readRefreshStatus,materialize=materializeResearchSnapshot}={}) {
  if(typeof runId!=='string'||!/^[a-zA-Z0-9_-]{8,90}$/.test(runId)||!token||!key)
    throw new SnapshotMaterializationError('SNAPSHOT_INVALID_OPTIONS');
  const status=assertRefreshReadback(await readStatus({token,fetcher,wait,now}),runId);
  if(status.valuationVersion!==DAILY_VALUATION_VERSION||status.sourcePolicyCurrent!==true||status.taiwanValuationCurrent!==true)
    throw new SnapshotMaterializationError('SNAPSHOT_SOURCE_NOT_CURRENT');
  return materialize({runId,token,key,fetcher,wait,now,expectedSessions:status.expectedSessions,
    expectedValuationVersion:DAILY_VALUATION_VERSION,expectedCount:status.coverage?.TW?.ready});
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  resumeResearchSnapshot({runId:process.argv[2]}).then(snapshot=>{
    console.log(JSON.stringify({event:'research_snapshot_published',runId:process.argv[2],financialPublished:true,...snapshot}));
  }).catch(error=>{
    console.error(JSON.stringify({event:'research_snapshot_failed',...safeSnapshotFailure(error)}));
    process.exitCode=1;
  });
}
