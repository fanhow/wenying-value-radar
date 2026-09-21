import type { StockInput } from './valuation.ts';

/** Display-only correction for current and legacy provider records; never changes inputs. */
export function valuationSourceNote(stock: Pick<StockInput, 'market' | 'source' | 'sourceNote' | 'financialMetrics'>, language: 'zh' | 'en') {
  const manual = stock.source === '手動輸入';
  const base = language === 'zh'
    ? stock.sourceNote || (manual
      ? '這是你手動建立的估值，請在財報更新後重新輸入基礎數據。'
      : '公開資料可能延遲或不完整；模型價格是研究起點，不代表即時報價或投資建議。')
    : manual
      ? 'This is a manually created valuation. Update the inputs when new financial statements are available.'
      : 'Public data may be delayed or incomplete. Model values are a research starting point, not a live quote or investment advice.';
  if (manual || stock.market !== 'TW' || !stock.financialMetrics) return base;
  // Earlier generations called provider-as-of observations "period-end" without
  // checking corporate actions. Do not keep that assurance in the visible note.
  const corrected = base.replaceAll('每股流量採期末普通股', '每股流量採供應商普通股數（期末基礎未核證）');
  const caution = language === 'zh'
    ? '股數口徑提醒：供應商日期標籤不代表已核證的期末股數；每股淨值與流量可能已按公司行動調整。EPS 另保留供應商稀釋口徑，不能只憑它與淨利／普通股數的差異判定資料錯誤。'
    : 'Share-basis caution: a provider date label does not verify period-end shares. Per-share book value and flows may be corporate-action adjusted. EPS retains the provider diluted basis; a difference from net income divided by ordinary shares is not, by itself, proof of an error.';
  return `${corrected} ${caution}`;
}
