# 每日網站資料更新

- 原站：`https://stable-value.fanhow.chatgpt.site`，維持 Sites owner-only。
- GitHub Actions 每日台灣 06:30、07:30 執行；平台可能延遲，不能保證準秒。
- 每次讀取既有台美股票目錄，取得 Yahoo Finance 最新完成日 K 線、季度及 TTM 財報；不寫入 Git 倉庫、不公開股票資料快照。
- 財報非每日發布。價格、技術日線、財報所屬期間與擷取時間各自保留。貨幣不符、停牌／落後交易日、缺少同截止日必要欄位或超過 180 日的財報不作有效估值。同截止日供應商 TTM 可在中間季度缺漏時使用；只有四季連續才允許加總補足，較新但未齊備的 TTM 不與舊資產負債表混用。EBITDA 為可選欄位，有取得才傳入既有模型。
- 股票目錄沿用現有版本，並非自動納入新上市股票。ADR 若財務幣別與報價不符會排除。
- 每次擷取 TWSE／NYSE 官方休市日曆並與台股 0050、美股 SPY 的已完成 K 線交叉核對。交易日上限以後的供應商異常 K 線先排除，仍須有上限當日的實際收盤資料。兩者不符（例如供應商延遲或未列入的臨時休市）停止更新並明示失敗，不將擷取日期冒充交易日。
- 估值公式 `lib/valuation.ts` 不變；本管線輸入跳過人工歷史固定目標價，使用原有模型共識。
- 批次全部有結果且各市場達最低覆蓋才原子切換；缺資料股票排除。08:00 後若未有當日成功批次，API 回傳 503 並顯示過期，不靜默退回內建值。
- `/api/daily-status` 提供完成時間及覆蓋率；`/api/market-scan`、`/api/valuation`、`/api/price-history`、`/api/technical-scan`、`/api/rotation-audit` 讀取同一批次。輪動比較的外部參考是明示日期的研究觀察，絕不作為現行估值或排行榜的輸入。
- 更新入口額外驗證專用寫入密鑰。GitHub Secrets：`WENYING_SITE_TOKEN`、`WENYING_REFRESH_SECRET`；後者同時存入 Sites secret。不可把密鑰寫進原始碼或日誌。
- CI 在送出批次前記錄 `collector_complete`，失敗時記錄 `refresh_failed`：台美市場 total／checked／ready／unavailable／missing、各原因計數與原始／解析／已完成日期分布。固定診斷樣本為 TWSE 1101、TPEx 6488、US AAPL，只記日期、timestamp、OHLC 缺欄計數與棒數，沒有資料時明示 null／unknown，不記完整股票、財務 payload、headers 或憑證。
- `quoteDiagnostics.observedQuoteDate` 是完成時段及 expected session 上限過濾後的末棒日期；`rawLatestDate` 是供應商末 timestamp 的 UTC 日期，`parsedLatestDate` 是 OHLC 解析後末棒日期。診斷不修補 K 線、不轉換日期口徑，也不更改有效性判定；歷史不足、沒有有效棒、日期不符等以獨立 `failureReason` 說明，原 `issues` 錯誤碼維持相容。
- finalize 在缺批次或覆蓋不足時仍回 HTTP 400，增加 `diagnostics`：failingMarket、兩市場 coverage、requiredReady 與 expectedSessions。失敗不切 head、不保存成功 summary；collector 會保存此安全摘要，即使未成功 published 也可診斷。這些紀錄保存在 CI logs；`quoteDiagnostics` 是記憶體中的 non-enumerable 欄位，由 CI 明確投影輸出，不加入原 JSON upload／凍結資料重播 payload。D1 schema 與 records 持久欄位不變，過去失敗批次無法由本修正補回原始日期。
- GitHub Actions 排程需在 default branch，公開倉庫長期無活動可能停用。失敗見 Actions 通知／執行頁；08:00 選股仍須先檢查 daily-status，失敗明確通知使用者。
- 手動重跑：`gh workflow run daily-data-refresh.yml --repo fanhow/wenying-value-radar`。
- 08:00 任務先讀 `/api/daily-status`，再執行 `node --experimental-strip-types scripts/daily-selection-report.mjs --expected-tw YYYY-MM-DD --expected-us YYYY-MM-DD`（網站憑證經 stdin）。報告存入 `outputs/daily-selection/runs/`；核對排行、估值與技術 API 的同一批次 runId，避免更新途中混讀。
- 資料保留最近兩批股票與 OHLC，保留更新紀錄。沒有交易下單功能。
- 部署圖片：`npm run build` 僅處理 `dist/client` 副本，不修改 `public` 原圖。大型案例圖轉為無損 WebP，舊案例 PNG 網址以 307 導向對應 WebP；型態圖庫 PNG 下載與其他 PNG 保留。每張以完整 RGBA 解碼核對尺寸與像素相同，不接受調色盤量化；比較報告位於 `outputs/png-compression-report.json`。
