# 每日網站資料更新

- 原站：`https://stable-value.fanhow.chatgpt.site`，維持 Sites owner-only。
- GitHub Actions 每日台灣 06:30、07:30 執行；平台可能延遲，不能保證準秒。
- 每次讀取既有台美股票目錄，取得 Yahoo Finance 最新完成日 K 線、季度及 TTM 財報；不寫入 Git 倉庫、不公開股票資料快照。
- 財報非每日發布。價格、技術日線、財報所屬期間與擷取時間各自保留。貨幣不符、停牌／落後交易日、季度缺漏或超過 180 日的財報不作有效估值。
- 股票目錄沿用現有版本，並非自動納入新上市股票。ADR 若財務幣別與報價不符會排除。
- 每次擷取 TWSE／NYSE 官方休市日曆並與台股 0050、美股 SPY 的已完成 K 線交叉核對。兩者不符（例如供應商延遲或未列入的臨時休市）停止更新並明示失敗，不將擷取日期冒充交易日。
- 估值公式 `lib/valuation.ts` 不變；本管線輸入跳過人工歷史固定目標價，使用原有模型共識。
- 批次全部有結果且各市場達最低覆蓋才原子切換；缺資料股票排除。08:00 後若未有當日成功批次，API 回傳 503 並顯示過期，不靜默退回內建值。
- `/api/daily-status` 提供完成時間及覆蓋率；`/api/market-scan`、`/api/valuation`、`/api/price-history`、`/api/technical-scan` 讀取同一批次。
- 更新入口額外驗證專用寫入密鑰。GitHub Secrets：`WENYING_SITE_TOKEN`、`WENYING_REFRESH_SECRET`；後者同時存入 Sites secret。不可把密鑰寫進原始碼或日誌。
- GitHub Actions 排程需在 default branch，公開倉庫長期無活動可能停用。失敗見 Actions 通知／執行頁；08:00 選股仍須先檢查 daily-status，失敗明確通知使用者。
- 手動重跑：`gh workflow run daily-data-refresh.yml --repo fanhow/wenying-value-radar`。
- 08:00 任務先讀 `/api/daily-status`，再執行 `node --experimental-strip-types scripts/daily-selection-report.mjs --expected-tw YYYY-MM-DD --expected-us YYYY-MM-DD`（網站憑證經 stdin）。報告存入 `outputs/daily-selection/runs/`；核對排行、估值與技術 API 的同一批次 runId，避免更新途中混讀。
- 資料保留最近兩批股票與 OHLC，保留更新紀錄。沒有交易下單功能。
