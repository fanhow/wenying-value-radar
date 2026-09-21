// Legacy experiments are diagnostics, not independent external validation.
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const text = value => String(value ?? 'N/A').replaceAll('|', '\\|').replaceAll('\n', ' ');

export function selectLegacyBenchmarkTarget(stock, suppliedValue) {
  if (positive(suppliedValue)) return {target:suppliedValue, targetKind:'workbook-unverified'};
  const values = stock.models.map(model => model.value).filter(positive);
  const proxy = values.length ? values.reduce((average, value, index) => average + (value - average) / (index + 1), 0) : stock.fairValue;
  return positive(proxy) ? {target:proxy, targetKind:'self-model-proxy'} : {target:null, targetKind:'unavailable'};
}

export function summarizeLegacyTargets(items) {
  const result = {total:items.length, workbookUnverified:0, selfModelProxy:0, unavailable:0};
  for (const item of items) {
    if (positive(item.target) && item.targetKind === 'workbook-unverified') result.workbookUnverified++;
    else if (positive(item.target) && item.targetKind === 'self-model-proxy') result.selfModelProxy++;
    else result.unavailable++;
  }
  return result;
}

export function formatLegacyMetric(value, {percent = false, count} = {}) {
  if (count === 0 || typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
  const scaled = percent ? value * 100 : value;
  if (!Number.isFinite(scaled)) return 'N/A';
  return percent ? `${scaled.toFixed(2)}%` : value.toFixed(3);
}

export function renderLegacyBenchmarkReport(data) {
  const rows = data.holdoutResults ?? [];
  const metric = (row, key, percent = true) => formatLegacyMetric(row?.[key], {percent, count:row?.count});
  const summaries = Object.entries(data.targetProvenance ?? {}).map(([scope, counts]) =>
    `| ${text(scope)} | ${counts.total} | ${counts.workbookUnverified} | ${counts.selfModelProxy} | ${counts.unavailable} |`).join('\n');
  const detail = (groups, label) => Object.entries(groups ?? {}).flatMap(([method, groupsByKey]) =>
    Object.entries(groupsByKey).map(([key, row]) =>
      `| ${text(method)} | ${text(key)} | ${row.count ?? 'N/A'} | ${metric(row, 'mdape')} | ${metric(row, 'mape')} |`)).join('\n') ||
      `| N/A | 無 ${label} 結果 | 0 | N/A | N/A |`;
  return `# 舊估值實驗診斷報告（非外部準確率）

狀態：LEGACY_DIAGNOSTIC_ONLY。此報告不能證明目前台股已對齊外部公允價值，也不能作為正式模型選用依據。

## 必須保留的限制

- 缺外部答案時使用本站模型輸出的平均值或原生值作 proxy，屬自我比較；平均模型對該 proxy 的零誤差不是外部驗證。
- 活頁簿答案只標為 workbook-unverified，沒有在此核證來源、報價日期、幣別、股份基礎或與輸入同步；不得稱 ground truth。
- 舊輸入流程會替缺漏基本面填固定預設值，且 importer 未把台股實際財務表接入計算，採 EPS 5／BVPS 30／FCF 4 等預設。此處沒有重算現行完整 daily generation，也不是現行 TW native-unfitted policy 的準確率。
- 80/20 是輸入順序切片，不是已核證的時間外／獨立 issuer holdout。train slice 沒有執行模型擬合；方法名稱不代表實際訓練了該算法。
- Method O 是舊實驗的固定 heuristic，不等同 production calibrateFairValue。產業與市場表取全樣本，不是 holdout。
- 報表不批准任何方法上線；未驗證價格特徵獨立性、統計顯著性或泛化能力。既有 rank 統計亦未在本次修復中重驗 ties 方法。
- 各方法無效預測會被排除；應查看各列有效筆數，不能把不同 coverage 的誤差當成相同母體比較。

## 資料及答案來源

| 欄位 | 值 |
| --- | --- |
| 活頁簿 SHA256 | ${text(data.fileHash)} |
| Dataset SHA256 | ${text(data.datasetHash)} |
| 全部輸入筆數 | ${data.sampleCount ?? 'N/A'} |
| 前 80% 筆數（未用於擬合） | ${data.trainCount ?? 'N/A'} |
| 後 20% 筆數 | ${data.holdoutCount ?? 'N/A'} |

| 範圍 | 總筆數 | 活頁簿未核證答案 | 本站自產 proxy | 答案不可用 |
| --- | ---: | ---: | ---: | ---: |
${summaries || '| 未記錄 | N/A | N/A | N/A | N/A |'}

## 後 20% 混合答案診斷（不是外部 holdout）

| 方法 ID | 有效筆數 | MdAPE | MAPE | 中位偏差 | 方向相符 | 舊 rank 指標 | 誤差 ≤10% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows.map(row => `| ${text(row.id)} | ${row.count ?? 'N/A'} | ${metric(row, 'mdape')} | ${metric(row, 'mape')} | ${metric(row, 'medianSignedError')} | ${metric(row, 'directionAccuracy')} | ${metric(row, 'spearmanCorr', false)} | ${metric(row, 'within10Pct')} |`).join('\n')}

## 全樣本產業診斷（不是 holdout）

| 方法 ID | 產業 | 有效筆數 | MdAPE | MAPE |
| --- | --- | ---: | ---: | ---: |
${detail(data.sectorBreakdowns, '產業')}

## 全樣本市場診斷（不是 holdout）

| 方法 ID | 市場 | 有效筆數 | MdAPE | MAPE |
| --- | --- | ---: | ---: | ---: |
${detail(data.marketBreakdowns, '市場')}

缺值保留 N/A，真正 0 保留 0；沒有補入固定百分比或樣本數。不能將上述診斷重新命名為外部估值準確率。
`;
}
