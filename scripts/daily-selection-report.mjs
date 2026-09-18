import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { calculateStock } from '../lib/valuation.ts';

export const BASE = 'https://stable-value.fanhow.chatgpt.site';
const DAY = 86400000;
export function normalizedDate(value) {
  if (typeof value !== 'string') return null;
  let v = value.trim();
  if (/^\d{7}$/.test(v)) v = `${Number(v.slice(0, 3)) + 1911}-${v.slice(3, 5)}-${v.slice(5)}`;
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(v)) return null;
  const date = v.slice(0, 10);
  const ms = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === date ? date : null;
}
export function sessionStatus(value, expected) {
  const actual = normalizedDate(value), target = normalizedDate(expected);
  if (!actual || !target) return 'UNKNOWN';
  return actual < target ? 'STALE' : actual > target ? 'UNCONFIRMED_SESSION' : 'CURRENT_SESSION';
}
export function financialStatus(stock, now) {
  const date = normalizedDate(stock?.financialDataDate);
  if (!date || stock.dataBasis === 'market-ratio' || stock.dataCompleteness === 'limited') return 'UNVERIFIED_BASIS';
  const age = (now.getTime() - Date.parse(date + 'T00:00:00Z')) / DAY;
  if (age < 0) return 'FUTURE_DATE';
  if (age > 240) return 'STALE';
  if (age > 120) return 'AGING';
  return 'RECENT_PERIOD_NOT_LATEST_FILING_VERIFIED';
}
export function evaluate(stock, history, expected, now = new Date()) {
  const issues = [];
  if (!stock) issues.push('VALUATION_READ_FAILED');
  if (!history?.technicalAnalysis || !history?.candles?.length) issues.push('TECHNICAL_READ_FAILED');
  if (stock && (!Number.isFinite(stock.price) || stock.price <= 0)) issues.push('INVALID_PRICE');
  if (history && (!Number.isFinite(history.candles?.at(-1)?.close) || history.candles.at(-1).close <= 0)) issues.push('INVALID_CANDLE_CLOSE');
  const quoteStatus = sessionStatus(stock?.updatedAt, expected);
  const candleStatus = sessionStatus(history?.candles?.at(-1)?.date, expected);
  const signalStatus = sessionStatus(history?.technicalAnalysis?.asOf, expected);
  const finances = financialStatus(stock, now);
  if (quoteStatus !== 'CURRENT_SESSION') issues.push(`QUOTE_${quoteStatus}`);
  if (candleStatus !== 'CURRENT_SESSION') issues.push(`CANDLE_${candleStatus}`);
  if (signalStatus !== 'CURRENT_SESSION') issues.push(`SIGNAL_${signalStatus}`);
  if (finances !== 'RECENT_PERIOD_NOT_LATEST_FILING_VERIFIED') issues.push(`FINANCIAL_${finances}`);
  if (stock?.dataBasis === 'estimated') issues.push('MIXED_PERIOD_ESTIMATE');
  if (/快照|fallback|snapshot|暫時不可用|無法連線/i.test(stock?.sourceNote ?? '')) issues.push('FALLBACK_OR_UNAVAILABLE_SOURCE');
  const close = history?.candles?.at(-1)?.close;
  if (stock && Number.isFinite(close) && Math.abs(stock.price - close) / Math.max(close, 1e-9) > 0.005) issues.push('QUOTE_CANDLE_MISMATCH');
  const fromDaily = stock?.priceSource === 'Yahoo Finance daily close / daily-refresh-v1' && history?.freshness?.runId;
  if (!fromDaily && history?.technicalAnalysis?.valueTrendResonance) issues.push('API_VALUE_TREND_DEFAULT_UPSIDE_IGNORED');
  // The API receives only candles: its default +20% is not valuation evidence.
  const safeTechnical = history?.technicalAnalysis ? { ...history.technicalAnalysis, valueTrendResonance: fromDaily ? history.technicalAnalysis.valueTrendResonance : null } : null;
  const blocking = issues.filter(x => x !== 'API_VALUE_TREND_DEFAULT_UPSIDE_IGNORED');
  let model = null;
  if (stock && !blocking.length) {
    try {
      const calculated = calculateStock(stock);
      const fairValue = calculated.calibratedFairValue ?? calculated.fairValue;
      const upside = calculated.calibratedUpside ?? calculated.upside;
      if (!Number.isFinite(fairValue) || !Number.isFinite(upside)) throw Error();
      model = { fairValue, upside, confidence: calculated.valuationConfidence,
        provenance: 'DEPLOYED_DAILY_MODEL_FROM_SAME_GENERATION_API_INPUTS' };
    } catch { issues.push('MODEL_CALCULATION_FAILED'); }
  }
  return { quoteStatus, candleStatus, signalStatus, financialStatus: finances, issues,
    model, technical: safeTechnical, latestFilingVerified: false,
    status: blocking.length || !model ? 'DATA_WARNING' : 'READY_FOR_SOURCE_REVIEW' };
}

export async function requestJson(path, token, body, fetcher = fetch) {
  try {
    const response = await fetcher(BASE + path, {
      method: body ? 'POST' : 'GET', redirect: 'manual',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache',
        ...(token ? { 'OAI-Sites-Authorization': `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000),
    });
    const meta = { status: response.status, contentType: response.headers.get('content-type'),
      receivedAt: new Date().toISOString(), path };
    if (!response.ok) return { ...meta, ok: false, error: `HTTP_${response.status}` };
    if (!meta.contentType?.includes('application/json')) return { ...meta, ok: false, error: 'NON_JSON_RESPONSE' };
    const payload = await response.json();
    if (payload?.error) return { ...meta, ok: false, error: 'API_ERROR' };
    return { ...meta, ok: true, payload };
  } catch { return { ok: false, path, receivedAt: new Date().toISOString(), error: 'NETWORK_TIMEOUT_OR_INVALID_JSON' }; }
}

async function main() {
  // Credential arrives via stdin. Never write it to disk, reports or logs.
  let token = '';
  for await (const part of process.stdin) token += part;
  token = token.trim();
  const args = process.argv.slice(2);
  const arg = name => args[args.indexOf(name) + 1];
  const expectedSessions = { TW: args.includes('--expected-tw') ? arg('--expected-tw') : null,
    US: args.includes('--expected-us') ? arg('--expected-us') : null };
  const now = new Date();
  const output = resolve(dirname(fileURLToPath(import.meta.url)), '../outputs/daily-selection/runs', now.toISOString().replaceAll(':', '-'));
  await mkdir(output, { recursive: true });
  const report = { fetchedAt: now.toISOString(), site: BASE, expectedSessions,
    scope: 'API_DEFAULT_UNDERVALUED_ORDER_FIRST_10_PER_MARKET; browser saved filters/overrides not included',
    modelSha256: createHash('sha256').update(await readFile(new URL('../lib/valuation.ts', import.meta.url))).digest('hex'),
    limitations: ['財報期間新近不等於已驗證最新申報，分析前需查官方財報。',
      '排名僅涵蓋當批可用且符合流動性門檻的股票；不等於所有上市股。',
      '不沿用昨日結果；未讀取到的資料保留空值。',
      '每日 API 使用實際模型估值；舊 API 預設值仍排除，最高勝率等文案不是已驗證績效。',
      '估值使用每日部署的原有模型與同批輸入；財報仍需外部核對最新申報。'], rows: [] };
  if (!token) {
    report.status = 'AUTH_UNAVAILABLE';
  } else {
    const probe = await requestJson('/api/market-scan', '');
    report.anonymousAccess = { status: probe.status, ok: probe.ok };
    if (![401, 403, 302, 303, 307, 308].includes(probe.status)) {
      report.status = 'PRIVACY_CHECK_FAILED';
    } else {
      const daily = await requestJson('/api/daily-status', token);
      report.daily = daily.payload ?? { error: daily.error };
      const scan = daily.ok && ['complete','partial'].includes(daily.payload?.state) ? await requestJson('/api/market-scan', token) : {ok:false,error:'DAILY_REFRESH_UNAVAILABLE_OR_STALE'};
      await writeFile(resolve(output, 'market-scan.json'), JSON.stringify(scan, null, 2));
      report.scan = { ok: scan.ok, status: scan.status, error: scan.error, snapshotRun: scan.payload?.snapshotRun ?? null };
      if (!scan.ok || !Array.isArray(scan.payload?.candidates)) report.status = 'SCAN_READ_FAILED';
      else {
        const selected = ['TW', 'US'].flatMap(market => scan.payload.candidates.filter(s => s.market === market).slice(0, 10)
          .map((stock, i) => ({ stock, rank: i + 1 })));
        const identities = new Set();
        for (const { stock: candidate, rank } of selected) {
          const { market, ticker } = candidate;
          if (!/^[A-Z0-9.-]{1,12}$/.test(ticker) || identities.has(`${market}:${ticker}`)) {
            report.rows.push({ market, ticker, rank, status: 'INVALID_OR_DUPLICATE_CANDIDATE' }); continue;
          }
          identities.add(`${market}:${ticker}`);
          const [valuation, history] = await Promise.all([
            requestJson('/api/valuation', token, { ticker, market, refresh: true }),
            requestJson(`/api/price-history?ticker=${encodeURIComponent(ticker)}&market=${market}`, token),
          ]);
          let stock = valuation.ok ? valuation.payload?.stock : null;
          let technical = history.ok ? history.payload : null;
          if (stock?.ticker !== ticker || stock?.market !== market) stock = null;
          if (technical?.ticker !== ticker || technical?.market !== market) technical = null;
          const assessment = evaluate(stock, technical, expectedSessions[market], now);
          const generation=scan.payload.freshness?.runId;
          if(!generation || valuation.payload?.freshness?.runId!==generation || history.payload?.freshness?.runId!==generation) {assessment.issues.push('GENERATION_MISMATCH');assessment.model=null;assessment.status='DATA_WARNING';}
          const row = { market, ticker, name: stock?.name ?? candidate.name, rank,
            rankingDate: normalizedDate(candidate.updatedAt), rankingStatus: sessionStatus(candidate.updatedAt, expectedSessions[market]),
            quoteDate: normalizedDate(stock?.updatedAt), financialDate: normalizedDate(stock?.financialDataDate),
            signalDate: normalizedDate(technical?.technicalAnalysis?.asOf), price: stock?.price ?? null,
            valuationHttpStatus: valuation.status ?? null, technicalHttpStatus: history.status ?? null,
            sourceNote: stock?.sourceNote ?? null, dataBasis: stock?.dataBasis ?? null, ...assessment };
          if (row.rankingStatus !== 'CURRENT_SESSION') { row.issues.push(`RANKING_${row.rankingStatus}`); row.status = 'DATA_WARNING'; }
          report.rows.push(row);
          await writeFile(resolve(output, `${market}-${ticker}.json`), JSON.stringify({ candidate, valuation, history, assessment: row }, null, 2));
          console.log(`${market}:${ticker} ${row.status} quote=${row.quoteDate} financial=${row.financialDate}`);
        }
        report.status = report.rows.length === 20 && report.rows.every(r => r.status === 'READY_FOR_SOURCE_REVIEW') ? 'READY_FOR_SOURCE_REVIEW' : 'PARTIAL_OR_DATA_WARNING';
      }
    }
  }
  token = '';
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  const lines = ['# 穩盈每日選股 API 驗證', '', `執行時間：${report.fetchedAt}`, `狀態：${report.status}`, '',
    ...report.limitations.map(s => `- ${s}`), '',
    '|市場|原名次|代碼|名稱|股價日|財報期間|技術日|狀態／問題|', '|---|---:|---|---|---|---|---|---|',
    ...report.rows.map(r => `|${r.market}|${r.rank}|${r.ticker}|${r.name}|${r.quoteDate ?? '未取得'}|${r.financialDate ?? '未取得'}|${r.signalDate ?? '未取得'}|${r.status}: ${(r.issues ?? []).join(', ')}|`)];
  await writeFile(resolve(output, 'report.md'), lines.join('\n'));
  console.log(JSON.stringify({ report: resolve(output, 'report.json'), status: report.status, count: report.rows.length }));
  if (['AUTH_UNAVAILABLE', 'PRIVACY_CHECK_FAILED', 'SCAN_READ_FAILED'].includes(report.status)) process.exitCode = 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('RUN_FAILED: no prior report may be reused'); process.exitCode = 2; });
}
