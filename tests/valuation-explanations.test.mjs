import test from 'node:test';
import assert from 'node:assert/strict';
import {displayValuationReasons,englishApplicabilityReason,valuationReasonCategory} from '../app/valuation-explanations.ts';

test('research notices remove internal applicability prefixes and duplicate reasons without altering audit evidence',()=>{
  const reason='同報價日、同財報截止日與股數口徑，並通過獲利能力適用性檢查的同業少於 5 家；不回退未匹配的廣產業樣本。';
  const source=['MODEL_APPLICABILITY:ev-revenue:INSUFFICIENT_MATCHED_PEERS：'+reason,
    'MODEL_APPLICABILITY:ev-ebitda:INSUFFICIENT_MATCHED_PEERS：'+reason,
    'MODEL_APPLICABILITY:ev-ebit:INSUFFICIENT_MATCHED_PEERS：'+reason,
    'EARNINGS_BASE_SHIFT：當期 EPS 基礎需覆核。'];
  const before=structuredClone(source),display=displayValuationReasons(source);
  assert.deepEqual(display,[reason,'當期 EPS 基礎需覆核。']);assert.deepEqual(source,before);
  assert.doesNotMatch(display.join(' '),/MODEL_APPLICABILITY|INSUFFICIENT_MATCHED_PEERS|EARNINGS_BASE_SHIFT/);
});

test('English exclusions explain the actual ROE, profit margin, period/share, sample and dispersion failures',()=>{
  const roe='缺少正數、歸母淨利／平均權益口徑的 LTM ROE；不以 EPS／期末淨值或不同 ROE 口徑替代。';
  const peers='同報價日、同財報截止日與股數口徑，並通過獲利能力適用性檢查的同業少於 5 家；不回退未匹配的廣產業樣本。';
  const translated=englishApplicabilityReason(roe+' '+peers);
  assert.match(translated,/parent-company net income and average equity/);
  assert.match(translated,/Fewer than five/);assert.match(translated,/quote date, financial period and share basis/);
  assert.match(englishApplicabilityReason('缺少正數且同財報期間的營業利益率，無法確認倍數適用性。'),/operating margin/i);
  assert.match(englishApplicabilityReason('缺少正數歸母淨利率，不能借用不同獲利能力的同業倍數。'),/parent-company net margin/i);
  assert.match(englishApplicabilityReason('同業倍數中間 50% 的高低比超過 4；不製造精準產業倍數。'),/quartile.*exceeds four/);
  assert.equal(englishApplicabilityReason('每股 FCF 或目標倍數不是正數。'),null);
});


test('known non-positive inputs are model assumptions while genuinely absent sources and peer evidence remain distinct',()=>{
  const cases=[
    ['缺少正數、歸母淨利／平均權益口徑的 LTM ROE；不以 EPS／期末淨值或不同 ROE 口徑替代。','source-data',/average equity is unavailable/],
    ['缺少同財報期間的營業利益率，無法確認倍數適用性。','source-data',/Operating margin.*is unavailable/],
    ['缺少歸母淨利率，不能確認不同獲利能力的同業倍數是否適用。','source-data',/Parent-company net margin is unavailable/],
    ['非控制權益未知或帳面比例無效；合併營收不能直接視為全屬普通股股東。','source-data',/unknown.*invalid/],
    ['已知歸母平均權益 ROE 不是正數；傳統獲利倍數的正獲利前提不成立，屬模型適用限制，非資料來源缺漏。','assumption',/Observed ROE.*non-positive/],
    ['已知營業利益率不是正數；傳統營運倍數的正本業獲利前提不成立，屬模型適用限制，非資料來源缺漏。','assumption',/Observed operating margin is non-positive/],
    ['已知歸母淨利率不是正數；傳統獲利倍數的正盈餘前提不成立，屬模型適用限制，非資料來源缺漏。','assumption',/Observed parent-company net margin is non-positive/],
    ['已知非控制權益超過歸母帳面權益 25%；直接套用合併營收 P/S 的歸屬假設尚不適用，待拆分股東損益，非資料來源缺漏。','assumption',/Observed minority interests exceed 25%/],
    ['同報價日、同財報截止日與股數口徑，並通過獲利能力適用性檢查的同業少於 5 家；不回退未匹配的廣產業樣本。','peer-comparability',/Fewer than five/],
    ['同業倍數中間 50% 的高低比超過 4；不製造精準產業倍數。','peer-comparability',/quartile.*exceeds four/],
  ];
  for(const [reason,category,translation] of cases) {
    assert.equal(valuationReasonCategory(reason),category);
    const display=englishApplicabilityReason(reason);assert.match(display,translation);
    if(category==='assumption')assert.doesNotMatch(display,/is unavailable|are unknown/);
  }
  assert.equal(valuationReasonCategory('獲利能力 0.5–2 倍是尚未驗證的研究假設。'),'assumption');
});
