# TPEx 歷史倍數：新麥／精星補充結果

## 結論及邊界

固定兩檔、2021–2025 年各五個 12 月末觀測已取得。新麥的歷史 PB 中位數 **2.41**，高於本站當期同行 **1.709452**；精星為 **2.00**，低於本站同行 **3.013943**。因此不能把「改用自身歷史」視為普遍降低估值的修正，或因為部分案例較接近外部結果就採用。

本段補齊歷史來源，不是公允價值對齊完成。未改正式引擎、排行、權重、revision 或 live 資料流程；没有產生 FV／upside。TPEx 原說明僅稱 PB=收盤價／每股淨值，尚未核證其全歷史分母與 MOPS reference BVPS 等價，也沒有找到官方不回溯承諾。2021–2024 的財報季度為未知，不能抄用 TWSE 的 Q3。

## 擷取及欄位修訂

- 官方[依代碼查詢](https://www.tpex.org.tw/zh-tw/mainboard/trading/info/stock-pe.html)；POST `https://www.tpex.org.tw/www/zh-tw/afterTrading/peQryStock`，form 由固定 ticker／year 產生。
- 十份 HTTP 200，UTC 2026-09-21 02:26:29.153–02:26:32.849；每家公司 2021–2025 月內筆數分別為 22／22／21／22／22。原文、請求、擷取時間、逐份 SHA 全保留。
- 事前原規格 `tpex-historical-multiples-protocol-20260921.md`，SHA `33f33235799838ae7b40a0c1f377937022bdbb0bd83c976942f58d4178facdba`。1580 的 2025 末值此前來源檢查已看過，非盲測。
- 真實八份舊年度回應沒有「財報年/季」欄，原六欄 strict parser 正確拒絕。保留初次結果，不偽稱本來就支援。
- 補充規格 `tpex-historical-multiples-schema-amendment-20260921.md` SHA `bff7bcb7f4c5aae4a4a7c832f5df37e79a7c30b36dbaf418c1bd9bf849aa8dbc`，明示事後發現。只接受兩個精確欄位集合，季度缺欄保留 null 與警示；六欄的錯季度仍整月拒絕。取樣／門檻不變，沒有重新下載或擇日。
- table1 股利輔表可能帶入更晚年度資料；只保留於 raw，未加入歷史觀測。

## 全部觀測

| 公司 | 年份 | 12 月最後觀測日 | 財報季末 | PE | PB |
|---|---:|---|---|---:|---:|
| 1580 新麥 | 2021 | 2021-12-30 | 未提供 | 11.80 | 2.41 |
| 1580 新麥 | 2022 | 2022-12-30 | 未提供 | 9.86 | 1.80 |
| 1580 新麥 | 2023 | 2023-12-29 | 未提供 | 14.29 | 2.77 |
| 1580 新麥 | 2024 | 2024-12-31 | 未提供 | 11.72 | 2.46 |
| 1580 新麥 | 2025 | 2025-12-31 | 2025-09-30 | 10.31 | 2.26 |
| 8183 精星 | 2021 | 2021-12-30 | 未提供 | 21.03 | 3.42 |
| 8183 精星 | 2022 | 2022-12-30 | 未提供 | 8.50 | 2.24 |
| 8183 精星 | 2023 | 2023-12-29 | 未提供 | 11.71 | 2.00 |
| 8183 精星 | 2024 | 2024-12-31 | 未提供 | 12.41 | 1.41 |
| 8183 精星 | 2025 | 2025-12-31 | 2025-09-30 | 13.50 | 1.17 |

兩檔皆 5/5 個 PE、PB 正值，但只有 1/5 觀測具有明示財報期間。「五個年末中位數」不是五年每日平均，也不等於完整期間與公司行動口徑已驗證。

| 公司 | 歷史 PE median | 本站當期同行 PE（家數） | 歷史 PB median | 本站當期同行 PB（家數） |
|---|---:|---:|---:|---:|
| 1580 新麥 | 11.72 | 21.797956（61） | 2.41 | 1.709452（87） |
| 8183 精星 | 12.41 | 21.619486（66） | 2.00 | 3.013943（83） |

本站基準沿用已保存 `historical-peer-baseline-20260921.json`，quote 2026-09-18，method `tw-industry-same-session-median`。新麥 peer 財報季末均 2026-06-30；精星含 2026-03-31–2026-06-30。不同時間與公司集合的比較只識別基準差異，不是因果、FV 準確率或投資績效。

## 可重現資料與檢查

私人研究輸出位於 `outputs/taiwan-model-audit/`；它們不會成為正式站 snapshot，也不複製第三方付費資料作 feed。

| 檔案 | SHA256 |
|---|---|
| tpex-historical-multiples-captures-20260921.json | df3830bb4f4d0de47d2af000a725b7fe6e4ffa0caa01e44d9c288c84d5f8ea0d |
| tpex-historical-multiples-results-20260921.json（strict 原結果） | 1f399705419c44f672a45f056cca35c5556d8bfb1c6d213650bdd86e2488d970 |
| tpex-historical-multiples-results-amended-20260921.json | e26ef9884166511d188f19265311e8b40c3ad1cac8a422cf0c7d25bdbe8cfd15 |
| historical-peer-baseline-20260921.json | 2ee7960fb70ba1c8f70cc13992668724ead5911bf73d77196f1d93d7f440eb9e |

普通 replay 與原 strict 結果 deepEqual；原 TWSE 十五份 replay 與既有結果 deepEqual，沒有把之前的 unsupported 歷程改寫。共享 helper 只共用摘要算術，各交易所保留獨立身分、日期與 schema 驗證。

```powershell
node scripts/study-tpex-historical-multiples.mjs --replay-amended outputs/taiwan-model-audit/tpex-historical-multiples-captures-20260921.json docs/tpex-historical-multiples-protocol-20260921.md docs/tpex-historical-multiples-schema-amendment-20260921.md
node --test tests/tpex-historical-multiples.test.mjs tests/taiwan-historical-multiples.test.mjs
```

下一步真正改變 PB 數值時，target 與 peers 必須使用一致的淨值來源。只換 target 為官方淨值、卻留下 vendor peer median，只能稱單變量敏感度，不能稱完整的官方 PB 模型。自身歷史若採用須獨立命名並固定權重政策，不偽裝成 peer median，也不偷偷增加一個 PB 讓模型權重翻倍。
