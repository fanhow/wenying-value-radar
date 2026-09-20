import type { StockInput } from './valuation.ts';

export type TaiwanBusinessGroupReference = { id: string; registryVersion: string };
export const TAIWAN_BUSINESS_REGISTRY_VERSION = '2026-09-20-memory-v1';
const MEMORY_GROUP = 'tw-memory-module-storage-products';

/**
 * Current research classification, independently checked against issuer reports.
 * Not a complete industry universe or a point-in-time backtest classification.
 * No external fair values, target prices, selected multiples or AI weights.
 */
export const TAIWAN_BUSINESS_GROUPS = [{
  id: MEMORY_GROUP,
  label: '記憶體模組／Flash 儲存產品製造',
  reviewedAt: '2026-09-20',
  fiscalPeriodEnd: '2025-12-31',
  scope: 'Prespecified current-research cohort; not complete market coverage',
  definition: 'Majority DRAM/module or Flash product revenue with issuer-confirmed manufacturing/brand/ODM activity; exclude controller design, wafer fabs, pure distribution and storage-system solutions.',
  members: [
    { ticker: '2451', name: '創見', role: 'brand-manufacturer',
      revenueEvidence: 'Flash＋DRAM 82.47%；兩類未分拆。',
      sourceUrl: 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=2451&filename=2025_2451_20260617F04.pdf', printedPages: '61', pdfPages: '64' },
    { ticker: '3135', name: '凌航', role: 'memory-products-odm-brand',
      revenueEvidence: 'DRAM 80.92%、Flash 18.98%；DRAM 桶含 IC／模組，不能視為全數模組。',
      sourceUrl: 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=3135&filename=2025_3135_20260624F04.pdf', printedPages: '49', pdfPages: '53',
      businessSourceUrl: 'https://www.goldkey.com.tw/about_tw_1.php' },
    { ticker: '3260', name: '威剛', role: 'brand-manufacturer',
      revenueEvidence: 'DRAM 60.73%；Flash 及其他 39.27% 是混合桶，不全列為 Flash。',
      sourceUrl: 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=3260&filename=2025_3260_20260522F04.pdf', printedPages: '79', pdfPages: '83' },
    { ticker: '4967', name: '十銓', role: 'brand-manufacturer',
      revenueEvidence: 'DRAM 70.94%、NAND Flash 26.97%。',
      sourceUrl: 'https://file.teamgroupinc.com/about/shareholders-meeting-information/114/annual-report.pdf', printedPages: '49', pdfPages: '52' },
    { ticker: '4973', name: '廣穎', role: 'brand-manufacturer',
      revenueEvidence: 'NAND Flash 68.17%、DRAM 模組 22.81%。',
      sourceUrl: 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=4973&filename=2025_4973_20260618F04.pdf', printedPages: '56', pdfPages: '59' },
    { ticker: '8088', name: '品安', role: 'module-manufacturer-mixed-ems',
      revenueEvidence: '模組相關產品 61.71%、代工 35.91%；代工業務為重要差異，未猜測細分。',
      sourceUrl: 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=8088&filename=2025_8088_20260612F04.pdf', printedPages: '58', pdfPages: '62' },
    { ticker: '8271', name: '宇瞻', role: 'brand-manufacturer',
      revenueEvidence: '模組 50.48%、Flash 48.14%；含消費、工控及伺服器用途。',
      sourceUrl: 'https://www.apacer.com/upload/media/investor/shareholdermeeting1/2025_Annual%20report_TC.pdf', printedPages: '70', pdfPages: '74' },
  ],
  excluded: [{ ticker: '8277', reason: '記憶體事業 16.55%；54.47% 儲存事業是 RAID／NAS／系統方案，不等於 Flash 產品。',
    sourceUrl: 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=8277&filename=2025_8277_20260609F04.pdf', printedPages: '96–98', pdfPages: '100–102' }],
}] as const;

export function taiwanBusinessGroupHasMember(reference: TaiwanBusinessGroupReference | undefined, ticker: string) {
  return !!reference && reference.registryVersion === TAIWAN_BUSINESS_REGISTRY_VERSION
    && TAIWAN_BUSINESS_GROUPS.some(g => g.id === reference.id && g.members.some(m => m.ticker === ticker));
}

export function validTaiwanBusinessGroupReference(stock: Pick<StockInput, 'market' | 'ticker' | 'taiwanBusinessGroup'>) {
  return stock.market === 'TW' && taiwanBusinessGroupHasMember(stock.taiwanBusinessGroup, stock.ticker);
}

/** Audit opt-in only. An explicit invalid reference is preserved to fail closed. */
export function withTaiwanBusinessGroup(stock: StockInput): StockInput {
  if(stock.market !== 'TW' || stock.taiwanBusinessGroup !== undefined)return stock;
  const group = TAIWAN_BUSINESS_GROUPS.find(g => g.members.some(m => m.ticker === stock.ticker));
  return group ? { ...stock, taiwanBusinessGroup: { id: group.id, registryVersion: TAIWAN_BUSINESS_REGISTRY_VERSION } } : stock;
}
