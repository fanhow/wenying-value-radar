# 同日官方 PB 與淨值基礎核對

## 本輪決策

**不能把官方當日 PB 視為已替本站解決公司行動調整。** 2026-09-18 瑞儀直接官方收盤 96.10、公布 PB 1.22；96.10／Q2 參考淨值 78.87＝1.218461，落在公布兩位小數的半單位範圍內；96.10／供應商淨值 105.160433＝0.913842，則不相容。

這證明目前兩個 PB 基礎不同，並支持官方公布值與季度參考淨值的算術相容性，**不是證明某個分母就是報價日減資後的正確經濟淨值**。瑞儀已知現金減資仍須處理股份與權益變化，不能只因來源官方便覆寫本站全部 BVPS，或用 `price/currentPB×historyPB` 宣稱已修正。也不能反過來因為供應商值不同，就宣稱交易所計算錯誤。

這段研究排除一條未被證據支持的替換方案；沒有改正式估值、排行、live 流程或 `lib/valuation.ts`，也不將診斷工具視為估值對齊完成。

## 固定比較與來源

承接原五檔已揭露案例，固定比較日 2026-09-18、財報期末 2026-06-30；不是隨結果挑股票或調參。原 frozen、官方季度資料不重抓也不覆寫。

- [TWSE 個股 PB 月表及計算說明](https://accessibility.twse.com.tw/zh/trading/historical/bwibbu.html)，本次月表 GET `/rwd/zh/afterTrading/BWIBBU?date=20260918&stockNo=...&response=json`。
- [TPEx 依代碼 PB 月表](https://www.tpex.org.tw/zh-tw/mainboard/trading/info/stock-pe.html)，POST `peQryStock`，`date=2026/09/01&code=...&response=json`。只取 table0，非股利輔表。
- [TWSE 官方成交資訊](https://www.twse.com.tw/zh/trading/historical/stock-day.html)，[6176 原始月表](https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20260901&stockNo=6176&response=json)、[8213 原始月表](https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20260901&stockNo=8213&response=json)。直接取「收盤價」，不是由 PB 反算價格。
- 季度 reference BVPS 沿用 `taiwan-official-book-audit-20260921.md` 的已保存 TWSE／TPEx MOPS ci 原文；其出表日不是首次公告日，現時擷取不能當完整 PIT。
- 五份 PB 原文擷取 UTC 02:41:59.434–02:42:01.376，兩份正式保存的直接收盤原文擷取 UTC 02:45:37.384–02:45:37.664；均 2026-09-21、HTTP 200。獨立 agent 提前取得相同兩份收盤 raw hash，root 再保存原文，並非兩個獨立資料供應商。

## 全五檔結果

| 公司 | 價格 | 價格驗證 | 官方 PB | 季度參考 BVPS | 供應商 BVPS | 價格／官方 BVPS | 價格／供應商 BVPS |
|---|---:|---|---:|---:|---:|---:|---:|
| 6176 瑞儀 | 96.10 | TWSE 直接收盤核對 | 1.22 | 78.87 | 105.160433 | 1.218461 | 0.913842 |
| 8213 志超 | 33.00 | TWSE 直接收盤核對 | 0.53 | 62.66 | 64.295310 | 0.526652 | 0.513257 |
| 3592 瑞鼎 | 224.50 | frozen Yahoo | 1.50 | 150.14 | 150.137276 | 1.495271 | 1.495298 |
| 1580 新麥 | 98.400002 | frozen Yahoo | 1.56 | 63.13 | 63.125777 | 1.558688 | 1.558793 |
| 8183 精星 | 28.049999 | frozen Yahoo | 0.80 | 34.86 | 34.855181 | 0.804647 | 0.804758 |

五檔「價格／官方 reference」都在公布 PB ±0.005 倍內；瑞儀、志超的 vendor 版本不在此區間，其餘三檔兩者皆相容。這只是顯示精度範圍核對，不驗證精確分母、rounding 規則、當期有效普通股數或企業行動；沒有把四捨五入相容率報成 FV 準確率。其他三檔收盤來源仍只有 frozen Yahoo，不能稱五檔都做了獨立官方價格核對。

本檢查固定使用已報導的 BVPS 數字，沒有額外展開 BVPS 本身 ±0.005 元的潛在顯示誤差。因此單一 `false` 不能普遍推論為口徑錯誤；本輪瑞儀／志超的來源差別另有前述股數／減資研究支持，不將這個簡單旗標接成 production 自動修補條件。

## 對工程設計的影響

1. target 和 peers 應採相同 PB 基礎；不能只換 target 官方淨值卻保留不同口徑的 peer median，再稱完整官方模型。
2. 現金減資不是單純拆股；目前資料不能自動證明報價日分母、現金退款後權益完整匹配。不要以官方 current PB 反算出一個「已核證」book 值繞過這個問題。
3. 官方 parent equity 與「已觀測股數×reference BVPS」的兩位小數算術相容 gate 可以抓衝突，卻不能證明沒有公司行動；也會排除志超這類待釐清個案。不得放寬百分比專門讓已知案例通過。
4. 本站目前台股 collector 只請求 quarterly/trailing/annual reported series，沒有可接線的 forward consensus。`revenueGrowth` 是實績 YoY，`netIncomePerShare` 是歷史 NI／普通股數，不能充當預估。研究用 `forward-earnings-evidence.ts` 尚無 provider adapter。這仍是與外部模型前瞻分支不同的實質缺口。

## Selected multiple 的可見性檢查

官方 [Working With Financial Models](https://pro.investing-support.com/hc/en-us/articles/4408949549969-Working-With-Financial-Models)（2025-10-13 更新）說明可以把模型匯出試算表並保留公式，但未說 selected PE/PB 必定是公式而非預設假設。正常登入畫面檢查中，原模型及未修改的 saved 副本均未顯示匯出按鈕；未取得 Excel，不能宣稱已核對其隱藏選擇算法。只保留私人研究紀錄，未分享、未把付費資料接成 production feed。已向 Charlie 提出非阻塞的原始 Excel 提供請求。

## 重播及輸出

`scripts/audit-taiwan-current-pb-basis.mjs` 是固定輸入的離線研究工具：驗證四份輸入 hash，分開交易所／收盤 schema，選精確日期，拒絕重複及季度錯配，沒有取最近一筆來補值。輸出只能排他建立新檔，不修改來源。

```powershell
node scripts/audit-taiwan-current-pb-basis.mjs --out outputs/taiwan-model-audit/current-pb-basis-another-replay.json
node --test tests/taiwan-current-pb-basis.test.mjs
```

| 私人輸出檔 | SHA256 |
|---|---|
| current-pb-source-captures-20260921.json | 527c69226d9159c66ab4a31dac186a50785363d6b7d8f846668cfb035ee54742 |
| current-pb-official-close-captures-20260921.json | 16bb058ce74290130e58980059adc03497b82e3d86f164d28d526bcab2c0cdbe |
| current-pb-basis-results-20260921.json | 3eb81f0bac2cb0ed1ef3af1bccd6edc74d8608f86cbf302fd01ea91714143eea |

Frozen source SHA `43c2bca489c504ededead8c4f25f0b560d8b78a609537e85eb2184ef4b905c1a`；官方季度 v2 SHA `792abe784d4867dc7522afe97fdc27df3f34c1fd00acca15012b2ebc348cc5e1`。原始資料與結果留在既有私人研究資料夾，不部署成排行榜 snapshot。
