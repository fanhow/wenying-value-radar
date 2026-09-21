# 台股自身歷史倍數研究：固定取樣規格

初稿於 2026-09-21 01:47:52 UTC；批次擷取前更正市場身分：凍結輸入確認 1580 新麥為 TPEx，不是 TWSE。原草稿 SHA `9a312510a7dafc89f42ca6f4bacf868e159ea5b1a6c722e37e48cc9fa9bb18e8`，只修正板別與請求數，沒有檢視新歷史結果或替換公司。最終固定三檔 × 五年 TWSE 擷取、兩檔 TPEx 未覆蓋。此為已看過異常案例的診斷研究，**不是盲測、投資回測或正式估值公式**。

## 問題與固定樣本

比較本站當期同行市場倍數與同一公司的五個年末參考倍數，確認是否把兩種不同基準混在一起。固定上市普通股 `6176 瑞儀、8213 志超、3592 瑞鼎`；上櫃 `1580 新麥、8183 精星` 保留為 TPEx historical source not verified，不使用上市來源替代。固定 2021–2025 五個已完成曆年，不因結果刪年、換年或換公司。

已揭露資料：6176 外部模型歷史五點及 TWSE 2025 年 12 月末列已先讀取。外部顯示值與未知選定倍數算法僅作診斷背景，不進入擷取、缺值處理、選樣、計算或權重。外部模型選定倍數不是可自由引用的公式，不能依其結果擬合折扣。

## 來源與取樣

- 使用 TWSE 官方 `https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU`，每次指定 `date=YYYY1231&stockNo=TICKER&response=json`，取得該年 12 月的全月資料。保存完整回應、來源 URL、擷取 UTC、HTTP status、SHA-256；覆寫既有擷取檔一律拒絕。
- 每公司每年選取當月**最大有效日期的原始列**，不是最後一筆有正數 PE 的列。PE 缺值時仍保留該日，不退回前一日。選到的日期稱「12 月最後觀測日」，不冒稱已獨立驗證交易所全年最後交易日。
- 嚴格驗證來源、請求年／ticker、JSON status/date、欄位、公司名稱、列寬、日期、資料筆數及重複日期。欄位可依名稱對應，不能靠固定欄號猜。結構或日期異常整個 capture 不參與統計；同一公司／年重複 capture 拒絕，不能依輸入順序挑一份。
- 原始 PE／PB 值與財報年季一併保存。空值或非正／非有限／不能解析的倍數回 null 及原因，不當零、不裁切極端值、不補推估數字。其他年度仍保留；未知標記不猜測原因。財報季度在觀測日之後為無效；缺財報期別不能稱已知口徑。

## 統計與禁止事項

- 每股分開列出五年 PE／PB、有效年數及有效值中位數（明確標示 partial descriptive median）。「完整五年中位數」只在五個年度都有有效值時提供；未滿五年則 null。沒有門檻掃描、winsorization、trim 或挑最低值。
- PE 與 PB 可有不同有效年度數；每個年度的缺值及解析異常都保留，不能透過共同交集掩蓋遺失。
- 當期同行倍數若另行並列，使用凍結 `operating-v2/inputs.json` 原始 SHA `43c2bca489c504ededead8c4f25f0b560d8b78a609537e85eb2184ef4b905c1a`，標明其自身日期及樣本。歷史資訊不得改寫該檔。
- 不以 PE × current EPS、PB × current BVPS 產生 FV；不推導 EPS、淨利或股數；不把年度列偽裝成不同 peer 公司；不改 `lib/valuation.ts`、`forward-earnings-evidence.ts`、production selector 或正式排行榜。

## 定義及限制

[TWSE 官方計算說明](https://accessibility.twse.com.tw/zh/trading/historical/bwibbu.html) 的 PE 使用參考盈餘／參考股數、PB 使用最近季每股參考淨值；財報年季不是年度 EPS，也不是發布時間。無實際收盤價時官方可能依營業細則使用替代價。官方聲明依當時 MOPS 公告資料計算且不回溯，不等於 API 永不勘誤或完整可重建 point-in-time：原始發布時間、修訂紀錄及逐日替代價旗標仍 unknown。

本資料不能直接認定與第三方 `market cap / common income excluding extra items`、基本／稀釋 EPS 或企業行動調整相同；完整五年中位數仍只是一個描述性基準，不是公允價值真值、預期報酬或可立即採用的 production multiple。沒有 TPEx 歷史來源就明列未覆蓋，不以缺值忽略該市場。
