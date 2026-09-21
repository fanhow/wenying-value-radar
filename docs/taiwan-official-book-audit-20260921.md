# 台股官方每股參考淨值：季度交叉核對

研究日期：2026-09-21。本輪新增唯讀研究工具，不改正式估值引擎，不把官方參考淨值直接覆寫到所有每股欄位。

## 來源、期間與單位

- 供應商凍結輸入：`outputs/taiwan-model-audit/operating-v2/inputs.json`，1952筆；2026-09-20T20:40:03.474Z擷取、報價截止2026-09-18。SHA256 `43c2bca489c504ededead8c4f25f0b560d8b78a609537e85eb2184ef4b905c1a`。
- [TWSE 一般業季度資料](https://openapi.twse.com.tw/v1/opendata/t187ap07_L_ci)：1048列，2026-09-21T01:01:40.140Z擷取；原文SHA256 `b8e7fa55466cad299171ad0dc7d8b4ce3274702cf930c06227a1482ebede3e9f`。
- [TPEx 一般業季度資料](https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap07_O_ci)：884列，2026-09-21T01:01:40.598Z擷取；原文SHA256 `c943d0469849dd76d30f865265f72e8c2f3937d8ad48bf58b80fde942a302e0b`。
- 單位證據來自正常 [MOPS 彙總資產負債表](https://mops.twse.com.tw/mops/#/web/t163sb05)「上市／上櫃、115年、第二季」結果的明示新台幣仟元，以及同季度樣本跨介面核對，詳 `taiwan-pb-business-audit-20260921.md`。API本身沒有unit欄位，不能宣稱自帶單位契約。
- 金額採TWD×1000；每股參考淨值維持原表兩位小數。它的精確分母調整未完整核證，不由BVPS反推股數。
- 出表日不是首次公告日；現在取得的表不能當成9/18當時可得的歷史 point-in-time 版本。本研究是當前資料口徑診斷，不是前瞻回測或股票建議。

## 核對規格

板別、公司、財報截止日、TWD 必須一致；供應商為ready且BVPS正值。重複鍵、錯季度、無效精度與無法比較的值均列出，不強制填入。參考淨值差為 `(vendor BVPS / official reference BVPS - 1) × 100%`，保留正負方向。

每股參考淨值與母公司權益是兩項獨立診斷。母權益缺失不代表BVPS缺失；缺失的母權益保留null，不取總權益替代，也不猜測合併／個體範圍。供應商母權益僅能重建為`vendor BVPS × vendor shares`，明示它不是獨立擷取的raw equity驗證。

工具：`scripts/audit-taiwan-official-book.mjs`；合成測試：`tests/taiwan-official-book-audit.test.mjs`。僅擷取兩個固定公開端點，每端點一次、不重試；離線重播不再抓資料。輸出使用排他建立，不覆寫既有研究。

```powershell
node scripts/audit-taiwan-official-book.mjs --replay outputs/taiwan-model-audit/official-book-20260921.json --out outputs/taiwan-model-audit/official-book-another-replay.json
```

## 完整覆蓋與差異

採用 `taiwan-official-book-v2`。完整原文與結果保存在私人產物 `outputs/taiwan-model-audit/official-book-20260921-v2.json`；SHA256 `792abe784d4867dc7522afe97fdc27df3f34c1fd00acca15012b2ebc348cc5e1`。

| 檢查 | 結果 |
|---|---:|
| 凍結輸入總筆數 | 1952 |
| 其中ready | 1786 |
| 同板別／同季可比較reference BVPS | 1760 |
| 未配對 | 192 |
| 同時可比較母權益 | 1625 |
| 可比BVPS但官方母權益缺失 | 135 |
| BVPS絕對差在兩位小數捨入範圍 ±0.005 元內 | 1482 / 1760 |
| vendor BVPS較reference高逾1% | 67 / 1760 |
| vendor BVPS較reference低逾1% | 89 / 1760 |
| BVPS相對差絕對值逾10% | 41 / 1760 |
| BVPS相對差絕對值逾50% | 9 / 1760 |
| 可比母權益的相對差絕對值逾1% | 0 / 1625 |

192筆未配對包含166筆原已unavailable，另26筆ready：21筆未在所選一般業端點找到、4筆供應商仍是2026Q1而官方為Q2、1筆板別缺失。理由欄位非互斥，不能把各理由次數再加總為總數。一般業端點沒有某公司不代表所有官方報表都沒有該公司。

| 股票 | vendor BVPS | 官方reference BVPS | 相對差 |
|---|---:|---:|---:|
| 3592 瑞鼎 | 150.137276 | 150.14 | -0.0018% |
| 6176 瑞儀 | 105.160433 | 78.87 | +33.3339% |
| 8213 志超 | 64.295310 | 62.66 | +2.6098% |
| 1580 新麥 | 63.125777 | 63.13 | -0.0067% |
| 8183 精星 | 34.855181 | 34.86 | -0.0138% |

這五檔重建的vendor母權益都與官方金額一致（僅浮點誤差）。**上述差異不是供應商錯誤率，也不是改善公允價值的幅度**：財報期末股數、現行生效股數、減資／面額異動及價格調整可能屬不同基礎。尤其瑞儀33%差異須先查公司行動，不能看到官方數字便直接替換，讓股價與每股數的基礎反而錯配。

## 獨立檢查與修正紀錄

第一版原結果 `official-book-20260921.json` 保留不變。它把母權益缺失同時排除BVPS，故只有1625筆joint comparison；v2將兩項可用性分開，135筆有reference BVPS但缺母權益的記錄因此納入BVPS診斷，並非補造資料。兩版本captured rawBody逐一確認完全一致，沒有因結果差異再抓另一批來源。

獨立review發現並修正：HTTP200空陣列未明確拒絕、2dp浮點epsilon可放過極小尾數／溢位、vendor空白ticker可逃過重複鍵。v2以嚴格小數精度／安全cents、canonical ticker、明示空表失敗補上；亦防止null被JS轉成0及股數乘積下溢。29/29 synthetic與獨立原始反例通過，沒有外部FV目標或模型參數調整。

## 決策

不接入 production、不改 `lib/valuation.ts`，不更改原始股數或任何財報值。下一步優先核對重大公司行動，使財報期末／現行股數與quote基礎能被分開標示；之後才評估官方reference BVPS作P/B專用欄位的資料契約。PE、PS、NCI、WACC不得因P/B欄位替換而被隱式改動。

## 瑞儀後續補證：33%差異有已生效的公司行動背景

官方原始來源（不是新聞轉載）：

- [MOPS 2026-06-30 減資基準日公告](https://mopsov.twse.com.tw/mops/web/ajax_t05st01?step=2&firstin=true&off=1&year=115&month=06&b_date=30&e_date=30&TYPEK=sii&co_id=6176&spoke_date=20260630&spoke_time=163401&seq_no=1)：減資基準日2026-07-01。
- [MOPS 2026-07-21 現金減資換股公告](https://mopsov.twse.com.tw/mops/web/ajax_t05st01?step=2&firstin=true&off=1&year=115&month=07&b_date=21&e_date=21&TYPEK=sii&co_id=6176&spoke_date=20260721&spoke_time=170553&seq_no=8)：現金減資25%、每1000股換750股、每股退還NT$2.5，新舊面額都NT$10；不是單純拆股或面額異動。
- [TWSE 2026-08-24 恢復買賣資料](https://www.twse.com.tw/rwd/zh/reducation/TWTAUU?startDate=20260824&endDate=20260824&response=html)：確認6176於8/24恢復買賣，原因為退還股款。

舊股最後交易8/12，停牌8/13–8/21，換股基準日8/21，新股8/24上市，退款8/31發放。因此本次9/18報價已是減資後交易基準。減資基準日7/1與換股基準日8/21不可混同。

| 公告股數口徑 | 減資前 | 減資後 |
|---|---:|---:|
| 已發行普通股 | 465,027,263 | 348,770,447 |
| 流通在外（已發行減庫藏） | 460,241,263 | 345,180,947 |

凍結vendor `sharesOutstanding=345180947` **正好等於公告的減資後流通數**，但record財報截止日仍是6/30，程式標籤仍寫`period-end-ordinary`。母權益36,299,378,000除公告減資前流通数460,241,263為78.870325，與官方Q2 reference78.87相符；除公告減資後345,180,947為105.160433。這識別出**股數基礎不同及現行標籤過度確定**，不是證明公司淨值突然增長33%。

公告另外列出的BVPS78.48→104.64採2026Q1財報，不可冒充Q2的78.87→105.16。公告時的股數也不是9/18庫藏股已完整重查的證明。來源尚不足以裁定vendor權益分子是否適當反映退款，亦不能把raw財報日期當股數未經調整的保證。不能直接用舊股basis的官方BVPS替換減資後價格對應的全部每股數；也不能單凭股數吻合便宣布vendor current BVPS正確。

可落地的下一步是把 **provider-as-of 股數、經官方核證的財報期末股數、公司行動後股數** 分成不同狀態，保留原始值與事件來源；待跨期現金／股數調節完整後才改計算，不為追特定FV反推股數。
