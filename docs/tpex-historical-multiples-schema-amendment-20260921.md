# TPEx 歷史欄位補充規格：五欄舊格式

本補充是在第一次真實擷取之後提出，不是事前盲測規格。原規格、十份 raw capture 與 strict 六欄解析的第一次結果全部保留；不重新擷取、不改公司、年份、月份、日期選擇或倍數門檻。

## 發現與固定變更

2026-09-21 02:26:29.153–02:26:32.849 UTC 的十份回應中，兩檔公司 2021–2024 年共八份均有五欄（日期、本益比、殖利率、股利年度、股價淨值比），沒有財報年／季；2025 年兩份為六欄。第一次結果因此僅各保留一個年度，理由 `INVALID_FIELDS`。在解析舊格式倍數結果前，只檢查了欄名、列寬、公司／月份、說明及首末日期。

- 原規格 SHA256：`33f33235799838ae7b40a0c1f377937022bdbb0bd83c976942f58d4178facdba`。
- raw bundle SHA256：`df3830bb4f4d0de47d2af000a725b7fe6e4ffa0caa01e44d9c288c84d5f8ea0d`。
- 原 strict 結果 SHA256：`1f399705419c44f672a45f056cca35c5556d8bfb1c6d213650bdd86e2488d970`。

補充解析只接受兩種精確欄名集合：原六欄，或確實缺少「財報年/季」的上述五欄；列寬須與集合一致。重複、錯誤、任意刪欄及不明欄仍拒絕。不能接受六欄中空白／不合法季度而當成五欄例外。

五欄列的 `financialPeriodEnd`、`rawFinancialPeriod` 一律為 null，另標示 `FINANCIAL_PERIOD_NOT_PUBLISHED_IN_LEGACY_SCHEMA`；不從股利年度或日曆月份推算季度。這個來源缺欄不阻止「交易所當日公布倍數」的描述性摘要，但不得解釋為五年財報口徑已核證，或用來繞過未來正式估值的分母匹配要求。六欄資料仍嚴格驗證季度格式及時間。

## 重播與用途

以 `--replay-amended CAPTURE_PATH ORIGINAL_PROTOCOL_PATH AMENDMENT_PATH` 驗證兩份規格 hash，重播同一原始檔；輸出另存 `tpex-historical-multiples-results-amended-20260921.json`，列明原規格及本補充 hash。普通 `--capture`／`--replay` 繼續維持原六欄 strict 規則，原結果可重現。

摘要依然分開 PE／PB，有效正值數與完整五個年末觀測數各別呈現。未知財報期間數另外列示；五點完整不等於季度／股數／公司行動完整。取樣只作歷史倍數診斷，不產生 FV、upside、production selected multiple 或第三方模型還原聲明。
