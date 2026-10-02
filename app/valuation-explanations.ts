/** Presentation only: preserve the engine/API's original audit evidence. */
export function displayValuationReasons(reasons:string[]) {
  const cleaned=reasons.map(reason=>reason
    .replace(/^MODEL_APPLICABILITY:[^:]+:[A-Z0-9_]+[：:]\s*/, '')
    .replace(/^EARNINGS_BASE_SHIFT[：:]\s*/, '')
    .trim()).filter(Boolean);
  return [...new Set(cleaned)];
}

export type ValuationReasonCategory='source-data'|'peer-comparability'|'assumption';
export function valuationReasonCategory(reason:string):ValuationReasonCategory {
  if(/INSUFFICIENT_MATCHED_PEERS|PEER_MULTIPLE_DISPERSION|同業少於 5 家|中間 50%.*高低比/.test(reason))return 'peer-comparability';
  if(/非資料來源缺漏|屬模型適用限制|歸屬假設|尚未驗證|研究假設/.test(reason))return 'assumption';
  if(/缺少|未知|無效|尚未有同期間申報證據|待核證|欄位不完整|資料日期/.test(reason))return 'source-data';
  return 'assumption';
}

/** Explain the actual TW applicability rejection before generic model fallbacks. */
export function englishApplicabilityReason(reason:string):string|null {
  const rules:Array<[RegExp,string]>=[
    [/歸母淨利／平均權益口徑.*LTM ROE/, 'Positive LTM ROE based on parent-company net income and average equity is unavailable. EPS divided by closing book value or a different ROE basis cannot substitute.'],
    [/缺少(?:正數且)?同財報期間的營業利益率/, 'Operating margin from the same financial period is unavailable, so this multiple cannot be validated.'],
    [/缺少(?:正數)?歸母淨利率/, 'Parent-company net margin is unavailable. Multiples from peers with different profitability cannot substitute.'],
    [/已知歸母平均權益 ROE 不是正數/, 'Observed ROE based on parent-company net income and average equity is non-positive. The positive-profitability assumption for the book multiple does not apply; this is not a missing-source-data issue.'],
    [/已知營業利益率不是正數/, 'Observed operating margin is non-positive. The positive operating-profit assumption does not apply; this is not a missing-source-data issue.'],
    [/已知歸母淨利率不是正數/, 'Observed parent-company net margin is non-positive. The positive earnings assumption does not apply; this is not a missing-source-data issue.'],
    [/非控制權益未知或帳面比例無效/, 'Minority interests are unknown or the book-equity ratio is invalid. Consolidated sales cannot be treated as wholly attributable to ordinary shareholders.'],
    [/已知非控制權益超過歸母帳面權益 25%/, 'Observed minority interests exceed 25% of parent-company book equity. The attribution assumption for consolidated-sales P/S needs shareholder-level profit separation; this is not missing source data.'],
    [/非控制權益未知或超過歸母帳面權益 25%/, 'Minority interests are unknown or exceed 25% of parent-company book equity. Consolidated sales cannot be treated as wholly attributable to ordinary shareholders.'],
    [/同報價日、同財報截止日與股數口徑/, 'Fewer than five peers pass the profitability checks and share the quote date, financial period and share basis. Unmatched broad-industry observations are excluded.'],
    [/中間 50%.*高低比超過 4/, 'The upper-to-lower quartile ratio of peer multiples exceeds four. Dispersion is too large to provide a reliable industry multiple.'],
    [/空白或無效倍數/, 'Peer observations contain missing or invalid multiples. Array length is not treated as the valid sample count.'],
    [/缺少完整同日同業證據/, 'Complete current-session peer evidence is unavailable or inconsistent. Manual multiples and historical fixed targets are excluded.'],
    [/同期間營業利益加折舊攤銷口徑/, 'EBITDA based on operating income plus depreciation and amortization for the same period is unavailable. A provider total including non-operating items cannot substitute.'],
    [/現金分類、應收帳款讓售／受限資產排除/, 'Same-period evidence for cash classification, restricted assets, lease liabilities or minority-interest adjustments is incomplete. EV models are excluded; missing values are not zero.'],
    [/合併營收含重大非控制權益/, 'Material minority interests are included in consolidated sales. The parent-company share price cannot be compared directly with sales attributable to all shareholders.'],
    [/本業營業虧損但淨利為正/, 'Operating losses conflict with positive reported net income. Sustainable earnings are unverified, so reported EPS is retained for research without applying a standard earnings multiple.'],
    [/缺少逐年前瞻現金流／股利/, 'Year-by-year forward cash flows or dividends and verifiable terminal assumptions are unavailable. Historical growth projections are excluded from the current peer-model center.'],
  ];
  const matched=rules.filter(([pattern])=>pattern.test(reason)).map(([,copy])=>copy);
  return matched.length?[...new Set(matched)].join(' '):null;
}
