# 研究排行快取完整性與讀取成本（2026-10-02）

研究列表使用同一個完成批次的原生 `estimatedUpside`，正式 `eligible`／`upside` 不因此放寬。快取、封存摘要均為伺服器產出的衍生資料，不構成新的財報、同業或外部公允價值證據。

## 封存與讀取規則

1. 每次 batch 在伺服器計算 `dailyValuationState`，覆寫 collector 傳入的 `dailyResearch`。快取記錄原生／校準估值、信心、模型與排名資格、品質、風險及原因，並綁定整份輸入 SHA256、批次、報價日、模型與美股覆核版本。
2. finalize 先封閉 batch 上傳，重建並核對完整台股同業證據，再重新核對每個 ready 股票的快取與當前模型結果。兩市場均成功後，才更新公開 head。
3. 獨立 `daily_refresh_research_seals` 表保存每個批次／市場的封存版本、ready 數與整個 cohort 的 SHA256。摘要包含每筆股票全部輸入與快取欄位，不信任同一份 JSON 自報的 `inputDigest`。seal 與原 stock JSON 分開，collector API 不能指定它；已存在 seal 只容許完全一致的重試，不能覆寫。
4. 每次研究讀取先核對全市場快取結構與版本，再讀遍全部 ready 股票，重算完整 cohort 摘要並比對獨立 seal，之後才回傳任何數量、排序、篩選或分頁結果。每個完整性頁面由 SQL 先取最多 500 個代碼／JSON 位元組長度，對這個有界候選集合累計大小，僅連接讀取累計不超過 2 MiB 的股票 JSON；若第一筆單獨超限，仍只取該筆以確保游標前進。逐筆解析與雜湊，同一市場的 canonical hash 並行度為 1；不並行解析 500 個完整 JSON。此完整讀取不載入 OHLC，也不重新計算所有模型；回傳頁面仍額外重算資格與輸入摘要。
5. 頁外抑制估值、改變排序／篩選字段、模型或正式資格旗標、原始輸入，都使該市場回傳 `refresh_required`、空研究列表與零研究數。沒有補位或舊批次回退。
6. 舊資料庫沒有新表、或批次缺少獨立 seal 時，只有研究排行要求刷新；現行正式排名依原規則繼續驗證。`begin` 的現有 schema 建立程序會建立新表。這次工作沒有修改正式資料庫或執行正式刷新。

## 本機成本與限制

2026-10-02，在 Node／記憶體 SQLite 中，以 185 筆原生台股合成輸入產生每檔 184 家同業的真實 applicability evidence 結構。最大股票 JSON 為 156,501 bytes；完整核對分為 15 頁，最大頁面 2,034,513 bytes，低於 2 MiB；同時執行的 canonical hash 最大值為 1。完整摘要與逐筆獨立生成的預期摘要相同，證明 byte 分頁沒有截斷 cohort 或改變 seal 語義。

該密集 fixture 的完整性核對耗時 282 ms；Node 取樣 heap 增量為 57.8 MiB，包含尚未回收的暫存配置，並非 Worker 峰值記憶體保證。測試另驗證單一超限列仍可前進及研究查詢資源例外時保留已驗證的正式榜，研究排行回傳 `refresh_required`／空陣列。紀錄為 `/tmp/wenying-research-bounded-tests.log`。沒有執行 6,267 筆全密集 payload 的測試。

較早的稀疏 6,267 筆、18.52 MiB fixture 耗時 233–260 ms，採用修正前的 500 筆並行 hash，僅保留為歷史基準，不能當成目前逐筆有界處理的延遲證據。其紀錄為 `/tmp/wenying-research-seal-benchmark.json`。

每次請求仍須讀取並雜湊全市場 ready JSON，成本隨資料量與內容複雜度增加；2 MiB 上限與逐筆 hash 控制每頁的活動資料，但增加查詢次數與往返。Cloudflare 官方規範目前每次 Worker invocation 的 D1 查詢上限為 Free 50、Workers Paid 1,000；個別字串／BLOB／資料列上限為 2,000,000 bytes。密集的大市場有可能超過查詢次數、CPU 或記憶體限制；錯誤時研究排行失效，不縮小 integrity 範圍換取假完整結果。[Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

目前未核驗正式帳戶方案、D1 網路延遲、正式密集全市場查詢數或 Worker CPU／GC／峰值記憶體；上述本機量測不提供正式負載保證。正式環境仍須經核准刷新與量測；沒有變更方案、費用、正式資料或部署。既有 TW finalize 同業證據重建仍有原來 500 筆讀取，本次沒有改動該來源驗證流程；新增的 finalize／read integrity 均使用上述 byte 上限與逐筆處理。

既有 finalize 會重建完整 TW peer map，其記憶體與 Worker 成本同樣尚未以正式 4,000 筆以上的原生密集同業 pool 驗證；本次有界本機測試不能當作全量 Worker 發布保證。這是正式發布前仍需核驗的負載限制，並未在本次擴充或改寫 finalize 同業建構邏輯。

獨立 DB seal 證明批次源輸入與伺服器衍生快取在封存後沒有改變，不能證明公開資料商的數字真實或財報口徑適用，也不能防止具完整資料庫管理權限的人同時重寫所有內容與 seal。可信度、股數、財報口徑與同業可比性仍由既有來源／模型規則決定。
