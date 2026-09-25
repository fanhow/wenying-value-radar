/**
 * Explicit, source-reviewed unresolved cases; not a full-US earnings screen,
 * a ratio threshold, a permanent stock blacklist, or a valuation adjustment.
 * Callers own manual/ARK exceptions. Missing/new dates never clear a case.
 */
export const US_EARNINGS_REVIEW_VERSION = 'us-earnings-review-2026-09-25-v2';
// Retain the existing wire issue and earningsReview response key for API
// compatibility. The optional basis distinguishes earnings from cash-flow cases.
export const US_EARNINGS_REVIEW_ISSUE = 'US_EARNINGS_BASIS_REVIEW_REQUIRED';

export type UsEarningsReviewSource = Readonly<{
  url: string;
  publicationDate: string | null;
  descriptionZh: string;
}>;

export type UsEarningsReviewResolution = Readonly<{
  action: 'clear-review';
  caseId: string;
  issuerCik: string;
  reviewedOn: string;
  reasonZh: string;
  sources: readonly UsEarningsReviewSource[];
}>;

export type UsEarningsReviewCase = Readonly<{
  caseId: string;
  market: 'US';
  ticker: string;
  issuerName: string;
  issuerCik: string;
  basis?: 'earnings' | 'cash-flow';
  disposition: 'unresolved' | 'resolved';
  reviewedOn: string;
  reasonZh: string;
  eventDate: string;
  reportedPeriodEnd: string;
  sources: readonly UsEarningsReviewSource[];
  resolution?: UsEarningsReviewResolution;
}>;

export type UsEarningsReview = Readonly<{
  issue: typeof US_EARNINGS_REVIEW_ISSUE;
  reasonZh: string;
  caseId: string;
  issuerName: string;
  issuerCik: string;
  basis?: 'earnings' | 'cash-flow';
  sourceUrls: readonly string[];
  sources: readonly UsEarningsReviewSource[];
  reviewedOn: string;
  eventDate: string;
  reportedPeriodEnd: string;
  reviewVersion: typeof US_EARNINGS_REVIEW_VERSION;
}>;

const visnSources: readonly UsEarningsReviewSource[] = Object.freeze([
  Object.freeze({
    url: 'https://ir.vistancenetworks.com/news-releases/news-release-details/commscope-completes-divestiture-connectivity-and-cable-solutions',
    publicationDate: '2026-01-12',
    descriptionZh: '公司公告 CCS 處分於 2026-01-09 完成；COMM 更名 VISN 於 2026-01-14 生效。',
  }),
  Object.freeze({
    url: 'https://www.sec.gov/Archives/edgar/data/1517228/000119312526072523/visn-20251231.htm',
    publicationDate: null,
    descriptionZh: 'SEC 年報封面核對 Vistance Networks, Inc.、CIK 1517228 與 Nasdaq 普通股身分；本次未單獨核證申報日。',
  }),
  Object.freeze({
    url: 'https://vistancenetworks.gcs-web.com/news-releases/news-release-details/vistance-networks-reports-second-quarter-2026-results/',
    publicationDate: '2026-08-06',
    descriptionZh: '公司 2026 年第二季業績公告，涵蓋截至 2026-06-30 之報表。',
  }),
  Object.freeze({
    url: 'https://www.sec.gov/Archives/edgar/data/1517228/000119312526336708/R2.htm',
    publicationDate: null,
    descriptionZh: 'SEC 2026 年上半年損益表分列 continuing／discontinued 淨利及 EPS；未將其視為獨立申報的 TTM 或共同股數基礎。',
  }),
  Object.freeze({
    url: 'https://www.sec.gov/Archives/edgar/data/1517228/000119312526336708/R35.htm',
    publicationDate: null,
    descriptionZh: 'SEC CCS 處分附註列示處分利益與所得稅；本次未單獨核證該 accession 的申報日。',
  }),
]);

const kodkSources: readonly UsEarningsReviewSource[] = Object.freeze([
  Object.freeze({
    url: 'https://investor.kodak.com/node/21211',
    publicationDate: '2026-03-12',
    descriptionZh: '公司 FY2025 現金流量表：營業現金流 480 百萬美元，含 KRIP 現金返還 618 百萬美元；資本支出 34 百萬美元。不能直接扣除返還額推定正常化 FCF。',
  }),
  Object.freeze({
    url: 'https://investor.kodak.com/node/21436',
    publicationDate: '2026-08-04',
    descriptionZh: '公司 2026 上半年現金流量表提供 H1 2025／H1 2026 比較，可橋接截至 2026-06-30 的 TTM；投資贖回 87 百萬美元列於投資活動，不再從 CFO 扣除。',
  }),
  Object.freeze({
    url: 'https://www.sec.gov/Archives/edgar/data/31235/000119312525305285/kodk-20251126.htm',
    publicationDate: '2025-12-02',
    descriptionZh: 'SEC 8-K 核證 2025-11-26 KRIP 資產返還事件及相關稅項、債務支出；事件日金額與年末現金流表有時點差異，未據此完成正常化現金流。',
  }),
  Object.freeze({
    url: 'https://www.sec.gov/Archives/edgar/data/31235/000119312526332861/0001193125-26-332861-index.htm',
    publicationDate: '2026-08-04',
    descriptionZh: 'SEC 申報索引核對 Eastman Kodak Company、CIK 31235 及 2026-08-04 申報日。',
  }),
]);

/** Human-reviewed disposition, not vendor-computed classification or exhaustive coverage. */
export const US_EARNINGS_REVIEW_CASES: readonly UsEarningsReviewCase[] = Object.freeze([
  Object.freeze({
    caseId: 'us-visn-ccs-discontinued-earnings-2026',
    market: 'US',
    ticker: 'VISN',
    issuerName: 'Vistance Networks, Inc.',
    issuerCik: '1517228',
    basis: 'earnings',
    disposition: 'unresolved',
    reviewedOn: '2026-09-25',
    reasonZh: 'VISN（Vistance Networks）已核證報告盈餘含重大 CCS 處分相關停業部門收益，尚未完成一致的可持續盈餘口徑覆核；暫停自動估值及財務排序，保留原始 EPS。此為個別人工核證事件，不代表全體美股已檢查。',
    eventDate: '2026-01-09',
    reportedPeriodEnd: '2026-06-30',
    sources: visnSources,
  }),
  Object.freeze({
    caseId: 'us-kodk-krip-cash-flow-2026',
    market: 'US',
    ticker: 'KODK',
    issuerName: 'Eastman Kodak Company',
    issuerCik: '31235',
    basis: 'cash-flow',
    disposition: 'unresolved',
    reviewedOn: '2026-09-25',
    reasonZh: 'KODK（Eastman Kodak Company）已核證報告現金流含 KRIP 計畫資產返還，尚未完成相關稅項、現金支出及可持續每股現金流口徑覆核；暫停自動估值及財務排序，保留原始 FCF、EPS 與 K 線，不推定調整後公允價值。此為個別人工核證事件，不代表全體美股已檢查。',
    eventDate: '2025-11-26',
    reportedPeriodEnd: '2026-06-30',
    sources: kodkSources,
  }),
]);

const isoDate = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value;

function validSource(source: UsEarningsReviewSource, reviewedOn: string) {
  if (!source || typeof source.url !== 'string' || source.url !== source.url.trim()
    || typeof source.descriptionZh !== 'string' || !source.descriptionZh.trim()
    || !isoDate(source.publicationDate) || source.publicationDate > reviewedOn) return false;
  try {
    const url = new URL(source.url);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
}

function explicitlyResolved(review: UsEarningsReviewCase) {
  const resolution = review.resolution;
  return review.disposition === 'resolved' && !!resolution
    && resolution.action === 'clear-review'
    && resolution.caseId === review.caseId && resolution.issuerCik === review.issuerCik
    && isoDate(resolution.reviewedOn) && resolution.reviewedOn >= review.reviewedOn
    && typeof resolution.reasonZh === 'string' && !!resolution.reasonZh.trim()
    && Array.isArray(resolution.sources) && resolution.sources.length > 0
    && resolution.sources.every(source => validSource(source, resolution.reviewedOn));
}

/**
 * Pure evaluator for reviewed registry revisions/tests. Registry entries are
 * trusted, code-reviewed evidence dispositions, never fields supplied by an
 * incoming stock, provider response, browser cache, or untrusted caller.
 * A resolved entry needs an explicit, same-case/source-backed resolution.
 */
export function evaluateUsEarningsReview(
  input: {market: string; ticker: string} | null | undefined,
  cases: readonly UsEarningsReviewCase[],
): UsEarningsReview | null {
  if (input?.market !== 'US' || typeof input.ticker !== 'string') return null;
  const ticker = input.ticker.trim().toUpperCase();
  // An unresolved duplicate must not be hidden by an earlier resolved entry.
  const review = cases.find(item => item.market === 'US' && item.ticker === ticker && !explicitlyResolved(item));
  if (!review) return null;
  const sources = Object.freeze(review.sources.map(source => Object.freeze({...source})));
  return Object.freeze({
    issue: US_EARNINGS_REVIEW_ISSUE,
    reasonZh: review.reasonZh,
    caseId: review.caseId,
    issuerName: review.issuerName,
    issuerCik: review.issuerCik,
    ...(review.basis ? {basis: review.basis} : {}),
    sourceUrls: Object.freeze(sources.map(source => source.url)),
    sources,
    reviewedOn: review.reviewedOn,
    eventDate: review.eventDate,
    reportedPeriodEnd: review.reportedPeriodEnd,
    reviewVersion: US_EARNINGS_REVIEW_VERSION,
  });
}

/** No automatic expiry or input-asserted override; manual/ARK policy belongs to callers. */
export function getUsEarningsReview(input: {market: string; ticker: string} | null | undefined): UsEarningsReview | null {
  return evaluateUsEarningsReview(input, US_EARNINGS_REVIEW_CASES);
}
