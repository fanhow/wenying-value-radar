import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDirectEpsEvidence, evaluatePeEvidenceBranch, researchHistoricalForwardPe} from '../lib/forward-earnings-evidence.ts';

// All values, issuers and sources below are explicitly synthetic test fixtures.
// example.com identifies fixtures, not a claimed market-data supplier or feed.
const instrument = ticker => ({ticker, exchange:'TWSE', securityType:'ordinary-share'});
const cutoff = '2026-09-18T05:30:00Z';
const context = () => ({instrument:instrument('1000'), valuationAsOf:cutoff,
  evaluatedAt:'2026-09-20T00:00:00Z', mode:'point-in-time-replay', splitBasisDate:'2026-09-18',
  maxSourceAgeDays:{historical:400, forward:30}, maxHistoricalPeriodAgeDays:550, minimumPeerCount:2});
const source = (kind, sourceAsOf) => ({provider:'Synthetic fixture; not market data',
  url:'https://example.com/synthetic-fixture', field:'synthetic-value', kind, sourceAsOf,
  retrievedAt:'2026-09-19T00:00:00Z', pointInTime:true});
const period = role => role === 'historical'
  ? {kind:'annual', fiscalPeriodStart:'2025-01-01', fiscalPeriodEnd:'2025-12-31', providerPeriodKey:'FY2025'}
  : {kind:'annual', fiscalPeriodStart:'2027-01-01', fiscalPeriodEnd:'2027-12-31',
    providerPeriodKey:'TwoFiscalYearsForward', relativeFiscalYear:2,
    anchorFiscalPeriodEnd:'2025-12-31', anchorPublishedAt:'2026-03-20T00:00:00Z'};
const eps = (role, ticker='1000', value=role === 'historical' ? 4 : 10) => ({id:`fixture-${role}-${ticker}`,
  instrument:instrument(ticker), metric:'direct-eps', role, value, unit:'currency-per-ordinary-share', scale:1,
  period:period(role), basis:{currency:'TWD', accounting:'reported', dilution:'diluted',
    attribution:'parent-ordinary-equity', operations:'total', splitBasisDate:'2026-09-18'},
  source:source(role === 'historical' ? 'company-filing' : 'analyst-consensus',
    role === 'historical' ? '2026-03-20T00:00:00Z' : '2026-09-17T00:00:00Z'),
  ...(role === 'forward' ? {consensus:{statistic:'mean', analystCount:3}} : {})});
const peer = (role, ticker, price, value) => ({kind:'observed-price-over-eps', instrument:instrument(ticker),
  price, value:price/value, source:source('market-quote', cutoff), eps:eps(role,ticker,value)});
const branch = role => ({expectedPeriod:period(role), eps:eps(role), observedMultiples:[
  peer(role,'1001',100,role === 'historical' ? 5 : 10),
  peer(role,'1002',120,role === 'historical' ? 6 : 10)]});
const input = () => ({historical:branch('historical'), forward:branch('forward')});
const clone = value => structuredClone(value);
function excluded(result, reason) {assert.equal(result.status,'excluded'); assert.ok(result.reasons.includes(reason), JSON.stringify(result));}

test('verified direct EPS and observed ratios produce independent historical/forward branches and mean',()=>{
  const data=input(), before=clone(data), c=context(), result=researchHistoricalForwardPe(data,c);
  assert.equal(result.historical.observedMultiple,20); assert.equal(result.historical.value,80);
  assert.equal(result.forward.observedMultiple,11); assert.equal(result.forward.value,110);
  assert.equal(result.combined.value,95); assert.equal(result.combined.method,'equal-mean-two-verified-branches');
  assert.deepEqual(data,before); assert.deepEqual(c,context());
});

test('missing forward evidence leaves the historical branch available without a fake mean',()=>{
  const data=input(); delete data.forward.eps;
  const r=researchHistoricalForwardPe(data,context()); assert.equal(r.historical.status,'applied');
  excluded(r.forward,'MISSING_EPS'); excluded(r.combined,'TWO_VALID_BRANCHES_REQUIRED');
  assert.equal('value' in r.combined,false);
});

test('missing historical evidence leaves the forward branch available without filling history',()=>{
  const r=researchHistoricalForwardPe({forward:branch('forward')},context());
  assert.equal(r.forward.status,'applied'); excluded(r.historical,'MISSING_EPS');
  excluded(r.combined,'TWO_VALID_BRANCHES_REQUIRED');
});

test('FY2 remains absolute FY2027, never NTM or a substituted FY1',()=>{
  const b=branch('forward'); assert.deepEqual(validateDirectEpsEvidence(b.eps,'forward',context()),[]);
  b.expectedPeriod={kind:'ntm',fiscalPeriodStart:'2026-09-19',fiscalPeriodEnd:'2027-09-18'};
  excluded(evaluatePeEvidenceBranch(b,'forward',context()),'REQUESTED_PERIOD_MISMATCH');
  b.expectedPeriod={kind:'annual',fiscalPeriodStart:'2026-01-01',fiscalPeriodEnd:'2026-12-31'};
  excluded(evaluatePeEvidenceBranch(b,'forward',context()),'REQUESTED_PERIOD_MISMATCH');
});

test('relative fiscal years roll on the verified reported-year anchor, not January 1',()=>{
  const c=context(); c.valuationAsOf='2027-01-15T05:30:00Z'; c.evaluatedAt='2027-01-16T00:00:00Z'; c.splitBasisDate='2027-01-15';
  const e=eps('forward'); e.basis.splitBasisDate=c.splitBasisDate;
  e.period={...period('forward'),fiscalPeriodStart:'2026-01-01',fiscalPeriodEnd:'2026-12-31',relativeFiscalYear:1,providerPeriodKey:'FY1'};
  e.source={...e.source,sourceAsOf:'2027-01-14T00:00:00Z',retrievedAt:'2027-01-16T00:00:00Z'};
  assert.deepEqual(validateDirectEpsEvidence(e,'forward',c),[]);
  e.period.relativeFiscalYear=2;
  assert.ok(validateDirectEpsEvidence(e,'forward',c).includes('UNVERIFIED_RELATIVE_FISCAL_PERIOD'));
});

test('unpublished or future fiscal anchors cannot justify a relative FY label',()=>{
  for(const patch of [{anchorFiscalPeriodEnd:undefined},{anchorPublishedAt:undefined},
    {anchorPublishedAt:'2026-09-19T00:00:00Z'},{anchorPublishedAt:'2025-12-30T00:00:00Z'}]) {
    const e=eps('forward'); Object.assign(e.period,patch);
    assert.ok(validateDirectEpsEvidence(e,'forward',context()).includes('UNVERIFIED_RELATIVE_FISCAL_PERIOD'));
  }
});

test('fixed absolute fiscal year needs no guessed relative label',()=>{
  const e=eps('forward'); delete e.period.relativeFiscalYear; delete e.period.anchorFiscalPeriodEnd; delete e.period.anchorPublishedAt;
  assert.deepEqual(validateDirectEpsEvidence(e,'forward',context()),[]);
});

test('ended annual consensus needs an explicit verified unreported-year anchor',()=>{
  const e=eps('forward'); e.period=period('historical');
  assert.ok(validateDirectEpsEvidence(e,'forward',context()).includes('UNVERIFIED_UNREPORTED_PERIOD'));
});

test('explicit direct provider NTM is separate, complete, forward and methodology tagged',()=>{
  const e=eps('forward'); e.period={kind:'ntm',fiscalPeriodStart:'2026-09-19',fiscalPeriodEnd:'2027-09-18',
    providerPeriodKey:'NTMA',ntmMethod:'provider-time-weighted-annual'};
  assert.deepEqual(validateDirectEpsEvidence(e,'forward',context()),[]);
  for(const patch of [{ntmMethod:undefined},{relativeFiscalYear:2},{fiscalPeriodStart:'2026-08-01',fiscalPeriodEnd:'2027-07-31'},
    {fiscalPeriodStart:'2027-09-19',fiscalPeriodEnd:'2028-09-18'}]) {
    const bad=clone(e); Object.assign(bad.period,patch);
    assert.ok(validateDirectEpsEvidence(bad,'forward',context()).includes('INVALID_NTM_PERIOD'));
  }
});

test('impossible, incomplete and shifted-duration periods fail closed',()=>{
  for(const patch of [{fiscalPeriodEnd:'2027-02-30'},{fiscalPeriodStart:'2027-02-01'},
    {fiscalPeriodEnd:'2027-09-30'},{kind:'quarter'},{providerPeriodKey:''}]) {
    const e=eps('forward'); Object.assign(e.period,patch);
    assert.ok(validateDirectEpsEvidence(e,'forward',context()).includes('INVALID_EARNINGS_PERIOD'));
  }
});

test('sourceAsOf is required, genuinely causal, and never replaced by retrieval time',()=>{
  for(const patch of [{sourceAsOf:undefined},{sourceAsOf:'2026-02-30T00:00:00Z'},
    {sourceAsOf:'2026-09-17'},{sourceAsOf:'2026-09-19T00:00:00Z'},
    {retrievedAt:'2026-09-16T00:00:00Z'},{retrievedAt:'2026-09-21T00:00:00Z'}]) {
    const e=eps('forward'); Object.assign(e.source,patch);
    assert.notDeepEqual(validateDirectEpsEvidence(e,'forward',context()),[]);
  }
});

test('malformed target source timestamps fail closed without invoking date methods',()=>{
  for(const role of ['historical','forward']) {
    for(const field of ['sourceAsOf','retrievedAt'])for(const value of [123,{},[],null,undefined]) {
      const b=branch(role); b.eps.source[field]=value;
      assert.ok(validateDirectEpsEvidence(b.eps,role,context()).includes('INVALID_SOURCE'));
      excluded(evaluatePeEvidenceBranch(b,role,context()),'INVALID_SOURCE');
    }
    for(const value of [null,undefined,123,{}]) {
      const b=branch(role); b.eps.source=value;
      excluded(evaluatePeEvidenceBranch(b,role,context()),'INVALID_SOURCE');
    }
  }
});

test('malformed peer EPS and quote sources exclude that peer without throwing',()=>{
  for(const role of ['historical','forward'])for(const sourceKind of ['eps','quote']) {
    for(const field of ['sourceAsOf','retrievedAt'])for(const value of [123,{},[],null,undefined]) {
      const b=branch(role), p=b.observedMultiples[0];
      (sourceKind === 'eps' ? p.eps.source : p.source)[field]=value;
      excluded(evaluatePeEvidenceBranch(b,role,context()),'INVALID_SOURCE');
    }
    for(const value of [null,undefined,123,{}]) {
      const b=branch(role), p=b.observedMultiples[0];
      if(sourceKind === 'eps')p.eps.source=value; else p.source=value;
      excluded(evaluatePeEvidenceBranch(b,role,context()),'INVALID_SOURCE');
    }
  }
});

test('later retrieval needs explicit point-in-time replay; current snapshots cannot backfill history',()=>{
  const e=eps('forward'); e.source.pointInTime=false;
  assert.ok(validateDirectEpsEvidence(e,'forward',context()).includes('POINT_IN_TIME_EVIDENCE_REQUIRED'));
  const c=context(); c.mode='live'; e.source.pointInTime=true;
  assert.ok(validateDirectEpsEvidence(e,'forward',c).includes('POINT_IN_TIME_EVIDENCE_REQUIRED'));
  e.source.retrievedAt='2026-09-18T05:00:00Z';
  assert.deepEqual(validateDirectEpsEvidence(e,'forward',c),[]);
});

test('fresh retrieval cannot make stale consensus or old annual periods fresh',()=>{
  const e=eps('forward'); e.source.sourceAsOf='2026-06-01T00:00:00Z';
  assert.ok(validateDirectEpsEvidence(e,'forward',context()).includes('STALE_SOURCE'));
  const h=eps('historical'); h.period={...h.period,fiscalPeriodStart:'2020-01-01',fiscalPeriodEnd:'2020-12-31'};
  assert.ok(validateDirectEpsEvidence(h,'historical',context()).includes('STALE_HISTORICAL_PERIOD'));
});

test('filing published before the historical fiscal end is not historical evidence',()=>{
  const e=eps('historical'); e.source.sourceAsOf='2025-12-30T00:00:00Z';
  assert.ok(validateDirectEpsEvidence(e,'historical',context()).includes('UNREPORTED_HISTORICAL_PERIOD'));
});

test('NI, period-end shares, scaled amounts and back-solved EPS cannot impersonate direct EPS',()=>{
  for(const patch of [{metric:'net-income',shares:100},{metric:'ni-divided-by-shares'},
    {metric:'price-divided-by-pe'},{scale:1000},{unit:'currency'},{unit:'currency-per-adr'}]) {
    const e={...eps('forward'),...patch};
    assert.ok(validateDirectEpsEvidence(e,'forward',context()).includes('DIRECT_EPS_REQUIRED'));
  }
});

test('unknown basis, NCI, parent preference claims and nonordinary shares are excluded',()=>{
  for(const patch of [{currency:'USD'},{currency:undefined},{accounting:'unknown'},
    {dilution:'unknown'},{dilution:'period-end-ordinary'},{attribution:'including-nci'},
    {attribution:'parent-all-equity'},{operations:'unknown'}]) {
    const e=eps('forward'); Object.assign(e.basis,patch);
    assert.ok(validateDirectEpsEvidence(e,'forward',context()).includes('UNKNOWN_OR_UNSUPPORTED_EPS_BASIS'));
  }
  const e=eps('forward'); e.instrument.securityType='adr';
  assert.ok(validateDirectEpsEvidence(e,'forward',context()).includes('INSTRUMENT_MISMATCH'));
});

test('split basis must be explicit and normalized to the price basis',()=>{
  for(const splitBasisDate of [undefined,'2026-09-17','2027-01-01']) {
    const e=eps('forward'); e.basis.splitBasisDate=splitBasisDate;
    assert.ok(validateDirectEpsEvidence(e,'forward',context()).includes('SHARE_BASIS_MISMATCH'));
  }
});

test('zero/loss is evidence, not a missing value, but cannot enter positive PE',()=>{
  for(const value of [0,-3]) {
    const b=branch('forward'); b.eps.value=value;
    assert.deepEqual(validateDirectEpsEvidence(b.eps,'forward',context()),[]);
    excluded(evaluatePeEvidenceBranch(b,'forward',context()),'NON_POSITIVE_EPS');
  }
  for(const value of [null,undefined,'', '--','10',NaN,Infinity]) {
    const e=eps('forward'); e.value=value;
    assert.ok(validateDirectEpsEvidence(e,'forward',context()).includes('MISSING_OR_INVALID_EPS'));
  }
});

test('consensus needs known aggregation and a positive integral contributor count',()=>{
  for(const consensus of [undefined,{statistic:'mean',analystCount:0},{statistic:'mean',analystCount:1.5},
    {statistic:'unknown',analystCount:5},{statistic:'mean',analystCount:null}]) {
    const e=eps('forward'); e.consensus=consensus;
    assert.ok(validateDirectEpsEvidence(e,'forward',context()).includes('CONSENSUS_METADATA_REQUIRED'));
  }
  for(const kind of ['company-guidance','manual-scenario','market-quote','unknown']) {
    const e=eps('forward'); e.source.kind=kind;
    assert.ok(validateDirectEpsEvidence(e,'forward',context()).includes('SOURCE_KIND_MISMATCH'));
  }
});

test('adjusted EPS requires an explicit method; matching peers still cannot blend with reported history',()=>{
  const data=input(), method={id:'synthetic-adjustments-v1',methodologyUrl:'https://example.com/synthetic-methodology'};
  const all=[data.forward.eps,...data.forward.observedMultiples.map(p=>p.eps)];
  for(const e of all)e.basis.accounting='adjusted';
  assert.ok(validateDirectEpsEvidence(all[0],'forward',context()).includes('ADJUSTMENT_METHOD_REQUIRED'));
  for(const e of all)e.basis.adjustmentMethod=method;
  const r=researchHistoricalForwardPe(data,context()); assert.equal(r.forward.status,'applied');
  excluded(r.combined,'CROSS_BRANCH_EPS_BASIS_MISMATCH');
});

test('basic/diluted and continuing/total differences cannot be averaged across branches',()=>{
  for(const patch of [{dilution:'basic'},{operations:'continuing'}]) {
    const data=input(); for(const e of [data.forward.eps,...data.forward.observedMultiples.map(p=>p.eps)])Object.assign(e.basis,patch);
    const r=researchHistoricalForwardPe(data,context()); assert.equal(r.forward.status,'applied');
    excluded(r.combined,'CROSS_BRANCH_EPS_BASIS_MISMATCH');
  }
});

test('observed multiple must reconcile to independently supplied price/direct EPS',()=>{
  for(const patch of [{kind:'target-pe'},{value:999},{price:-1},{decimalPlaces:100}]) {
    const b=branch('forward'); Object.assign(b.observedMultiples[0],patch);
    excluded(evaluatePeEvidenceBranch(b,'forward',context()),'INSUFFICIENT_VALID_OBSERVED_MULTIPLES');
  }
  const b=branch('forward'); b.observedMultiples[0].eps.value=3;
  b.observedMultiples[0].value=33.33; b.observedMultiples[0].decimalPlaces=2;
  assert.equal(evaluatePeEvidenceBranch(b,'forward',context()).status,'applied');
  delete b.observedMultiples[0].decimalPlaces;
  excluded(evaluatePeEvidenceBranch(b,'forward',context()),'OBSERVED_MULTIPLE_RECONCILIATION_FAILED');
});

test('peer quote session, EPS period, basis and identity must all match',()=>{
  const edits=[r=>r.source.sourceAsOf='2026-09-17T05:30:00Z',r=>r.eps.period.fiscalPeriodEnd='2026-12-31',
    r=>r.eps.basis.dilution='basic',r=>r.eps.instrument.ticker='9999',
    r=>{r.instrument=instrument('1000');r.eps.instrument=instrument('1000');}];
  for(const edit of edits){const b=branch('forward');edit(b.observedMultiples[0]);
    excluded(evaluatePeEvidenceBranch(b,'forward',context()),'INSUFFICIENT_VALID_OBSERVED_MULTIPLES');}
});

test('forward target and peers cannot mix mean and median consensus EPS',()=>{
  const b=branch('forward'); b.observedMultiples[0].eps.consensus.statistic='median';
  excluded(evaluatePeEvidenceBranch(b,'forward',context()),'PEER_CONSENSUS_STATISTIC_MISMATCH');
});

test('duplicate peers never inflate coverage and conflicts are excluded independent of order',()=>{
  const b=branch('forward'), first=b.observedMultiples[0];
  b.observedMultiples=[first,clone(first)];
  excluded(evaluatePeEvidenceBranch(b,'forward',context()),'INSUFFICIENT_VALID_OBSERVED_MULTIPLES');
  const conflict=clone(first); conflict.price=110; conflict.value=11;
  const a={...branch('forward'),observedMultiples:[first,conflict,branch('forward').observedMultiples[1]]};
  const reverse={...a,observedMultiples:[...a.observedMultiples].reverse()};
  assert.deepEqual(evaluatePeEvidenceBranch(a,'forward',context()),evaluatePeEvidenceBranch(reverse,'forward',context()));
  excluded(evaluatePeEvidenceBranch(a,'forward',context()),'CONFLICTING_PEER_OBSERVATIONS');
});

test('semantically identical object-key ordering does not create a duplicate conflict',()=>{
  const b=branch('forward'), p=b.observedMultiples[0];
  b.observedMultiples.push(Object.fromEntries(Object.entries(clone(p)).reverse()));
  const r=evaluatePeEvidenceBranch(b,'forward',context()); assert.equal(r.status,'applied'); assert.equal(r.peerTickers.length,2);
});

test('nonfinite and null duplicate precisions conflict identically in either order',()=>{
  for(const role of ['historical','forward'])for(const value of [NaN,Infinity,-Infinity]) {
    const b=branch(role), invalid=clone(b.observedMultiples[0]), missing=clone(invalid);
    invalid.decimalPlaces=value; missing.decimalPlaces=null;
    const a={...b,observedMultiples:[invalid,missing,b.observedMultiples[1]]};
    const reverse={...a,observedMultiples:[...a.observedMultiples].reverse()};
    const first=evaluatePeEvidenceBranch(a,role,context()), second=evaluatePeEvidenceBranch(reverse,role,context());
    excluded(first,'CONFLICTING_PEER_OBSERVATIONS'); assert.deepEqual(first,second);
    const c={...context(),minimumPeerCount:1};
    const available=evaluatePeEvidenceBranch(a,role,c);
    assert.deepEqual(available,evaluatePeEvidenceBranch(reverse,role,c));
    assert.equal(available.status,'applied'); assert.deepEqual(available.peerTickers,['1002']);
  }
});

test('individually reconciled but contradictory shared peer prices cannot be averaged',()=>{
  const data=input(); data.forward.observedMultiples[0].price=200; data.forward.observedMultiples[0].value=20;
  const r=researchHistoricalForwardPe(data,context()); assert.equal(r.forward.status,'applied');
  excluded(r.combined,'CROSS_BRANCH_PEER_PRICE_CONFLICT');
});

test('invalid extra peer rows are excluded without throwing or hiding valid branches',()=>{
  const data=input();
  for(const b of [data.historical,data.forward])b.observedMultiples.push(null,undefined,{});
  const r=researchHistoricalForwardPe(data,context());
  assert.equal(r.combined.status,'applied'); assert.equal(r.combined.value,95);
  assert.equal(r.historical.excludedPeers.length,3); assert.equal(r.forward.excludedPeers.length,3);
  assert.ok(r.forward.excludedPeers.every(p=>p.reasons.includes('INVALID_PEER')));
});

test('invalid evidence URLs and credential-bearing source URLs fail closed',()=>{
  for(const url of ['', 'not-a-url','http://example.com/data','https://user:password@example.com/',
    'https://example.com/?api_key=synthetic','https://example.com/?crumb=synthetic']) {
    const e=eps('forward');e.source.url=url;
    assert.ok(validateDirectEpsEvidence(e,'forward',context()).includes('INVALID_SOURCE'));
  }
});

test('invalid policy clocks, security identifiers and thresholds do not run a branch',()=>{
  for(const patch of [{valuationAsOf:'2026-09-31T00:00:00Z'},{evaluatedAt:'2026-09-01T00:00:00Z'},
    {minimumPeerCount:0},{minimumPeerCount:1.5},{maxSourceAgeDays:{historical:400,forward:-1}},
    {instrument:{...instrument('1000'),ticker:1000}},{splitBasisDate:'2026-09-17'}]) {
    excluded(evaluatePeEvidenceBranch(branch('forward'),'forward',{...context(),...patch}),'INVALID_CONTEXT');
  }
});

test('IEEE overflow is excluded rather than emitted as an available valuation',()=>{
  const b=branch('forward'); b.eps.value=Number.MAX_VALUE;
  excluded(evaluatePeEvidenceBranch(b,'forward',context()),'NON_FINITE_MODEL_VALUE');
});
