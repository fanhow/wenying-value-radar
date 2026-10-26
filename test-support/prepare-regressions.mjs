import {bundleRegressionTest} from './load-candidate.mjs';
const prepared=[];
for(const name of ['daily-refresh-collector-diagnostics.test.mjs','daily-refresh-finalize-timeout.test.mjs'])
  prepared.push(await bundleRegressionTest(name));
console.log(JSON.stringify({mode:'offline-engineering-regression-preparation',prepared}));
