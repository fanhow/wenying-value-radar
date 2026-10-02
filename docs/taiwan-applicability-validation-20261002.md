# 台股倍數適用性：固定驗證規格與本機證據（2026-10-02）

最終版本 `tw-applicability-2026-10-02-v2`／daily `tw-comparables-2026-10-02-research-v3`。本文件以 `.2` 最終結果為準，第一階段 commit0c1eb0f／556 tests／PE 211 observations 統計是歷史結果。這是工程、來源口徑及研究使用性驗證，不是公允價值準確率、外部平台複製、正式發布或全市場投資報告。已知五個高上行 InvestingPro 比較不用於參數選擇或通過標準。

## 固定規則與 PE 修正依據

- 使用原生 `buildTaiwanComparableMap`、`calculateStock` 與 `dailyValuationState`，不另寫 FV 公式。
- 自己排除；相同交易報價日／財報截止日／provider 股數口徑；不同日期不補值、不重標。
- PB 才要求正歸母淨利／平均權益 ROE，target/peer ROE 比 0.5–2；非金融 PB 另需正營業利率。
- PE 正 EPS，非金融正歸母淨利率／營業利率各自 0.5–2；不將 PB 的平均權益 ROE 門檻直接套到 PE。金融 PE 仍受分類／來源限制，沒有證實其成長、配息或信用風險可比。
- PS 正歸母及營業利率各自 0.5–2；已知 NCI／母權益 ≤25%。至少五筆、原倍數上限及 Q3/Q1≤4，EV 橋接核證要求維持。
- ROE／利潤率 factor2 與 NCI25% 是未驗證研究假設，不是最優參數／業界規定。不降低原 35% 分歧 gate，不按外部 FV 或此次個股結果重選名單。
- low／review／無模型不具正式资格；有模型仍可研究。無模型不製造 FV／−100% 差距，原生與外部比較分開。

[CFA Institute 原始教材](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/market-based-valuation-price-enterprise-value-multiples) 將 PE 連結預期盈餘成長與要求報酬，PB 連結 ROE 與要求報酬，PS 連結利潤率、成長與要求報酬。沒有提出 0.5–2 倍的硬篩標準。這支持依倍數選擇 relevant fundamentals，但不能證明本專案 factor2 可提升準確率。

[Damodaran 的 PE 原始講義](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/lectures/pe.html) 中，stable justified PE 由 payout、成長與權益成本决定；ROE 透過保留盈餘影響成長。[PB 原始講義](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/lectures/pbv.html) 則直接連結 ROE 與權益成本。據此，第一階段把 ROE factor2 也硬套 PE 的經濟依據不足；第二階段移除 PE 直接 ROE 門檻，保留獲利來源／利潤率研究檢查。它仍不等於取得完整成長／風險匹配，故仍 low。缺平均權益不再單獨使 PE 失效，但缺歸母淨利／營業利率仍讓非金融 PE 棄權。

原因為 `source-data`／`peer-comparability`／`assumption`。數值非正、NCI 超界明示模型假設，不偽稱 provider 漏欄；缺 metadata 才列來源問題。分類與 evidence 一致性有測試，並不認證資料真實性。

## 事前固定工程樣本

1,100 個明示合成 issuer1000–2099、22池、既有 seed `wenying-applicability-engineering-v1|` 不改。SHA256(seed+ticker) 模5固定870 train／230 holdout；peer池不含其他 holdout，只加單一 target。9/18及10/1日期皆搭6/30財報；後一日期只是固定產生器改價，不是歷史實測。

規則修正原因是獨立經濟審核與資料契約反例，未據 FV 誤差選參數。新的 v2 重跑（21,598 筆觀察）核對排列不變、輸入不變、自身／保留樣本隔離、報價／財報／股數口徑隔離、四家peer棄權、缺普通股口徑棄權、low／review 排名隔離；50列合成 capture 契約及9種衝突拒絕。

| 日期 | 可算/230 | PE/PB/PS | review | low | 正式 |
| --- | ---: | --- | ---: | ---: | ---: |
| 2026-09-18 | 227 | 219/219/213 | 19 | 230 | 0 |
| 2026-10-01 | 227 | 219/219/213 | 19 | 230 | 0 |

EV三分支0，fixture未提供核證橋接。與相同基準ccc6d1d輸入比較：舊兩日期230可算、PE/PB/PS227/230/221、formal166/167；新227可算、formal0。變化是適用性／排名行為，不是準確率。原生FV有升有降。

## 真實有界公開重播

固定PCB十家與既有記憶體 registry 七家，名單及來源詳[公開 capture 報告](taiwan-pcb-public-capture-20261002.md)。10/2取得真raw，10/1quote、6/30finance；27＋19 raw bodies 的 SHA/URL/取得時間保存，原 collector 離線重建10＋7 record，無 fallback、與輸入 JSON deepEqual。抓取当期資料不證明當時申報可見性，不當作 point-in-time／日期 holdout。

| 樣本 | ready | 原生可算：舊→新 | 正式：舊→新 |
| --- | --- | --- | --- |
| PCB固定十家 | 10/10 | 7→0 | 2→0 |
| memory固定七家 | 7/7 | 7→3 | 0→0 |

這個 before-after 僅同一有界 pool，不重建原全產業184家／原8213 FV103.16。它也不是選股績效。基準匯出自ccc6d1d，comparison保留完整原輸入與版本。

8213 真輸入34／EPS1.96／BVPS64.295310／SPS73.174912／average ROE3.429771%，metadata有效，matched PE/PB/PS1/2/1；不能補peer或給替代target。供應商10/10可生成share metadata與average ROE，EV核證橋接0/10，故『平均口徑或股數來源永缺』不成立。quarterlyInputs會產生metadata標籤，provider raw无需直接含相同label。

3135：PE123.439938791／PB140.171174380／PS223.999243737，各5peer，native FV162.536785636／157，+3.5266%、low、formalfalse。4967只PB349.334825164；8271只PB225.131879929；全部七家結果保留，不挑正向结果。這是 ingestion／模型／排名分類功能正向，不是 FV 或官方股數核證正向。

3135 官方同季參考BVPS47.98／provider51.771687566（+7.9026%），official parent equity null；current issued97,158,956／6/30provider89,721,491不同日期。8213同季officialparent16,996,626,000等於vendor，referenceBVPS62.66／provider64.295310239（+2.6098%），currentissued271,242,488／6/30provider264,352,500。診斷只報不同口徑，不由roundedBVPS反推出精準期末股數或覆寫原值。

年度EPS diluted weighted-average shares、季度每股流量的provider-as-of ordinary shares、官方P/B參考分母不同。移除年初權益的反事實 fixture 保留可核對PE，PB列source-data；移除NetIncome／OperatingIncome則PE來源不足；移除OrdinaryShares核心匯入拒絕。它們是契約反例，不是觀察到真供應商缺漏。

raw body／manifest被改或record財務值／身份被改，replay須拒絕。逐檔官方母權益、公司行動、終端業務／segment margin沒有全核證，不把平均值稱精准FV。

## 研究排行封存與產品驗證

全當批 source/cache 由完成程序生成，獨立DB seal綁run／market／cohort，read於SQL LIMIT之前核對整市場完整性。任何頁外sort字段被改都需`refresh_required`，不能先改排序把異常藏到下一頁。頁內再驗daily state／digest；missing seal／cache及舊版本整市場不返回current研究。這是新增additive資料表，沒有替代正式資格或修改正式金融值；需要正常下一次refresh建立封存。本機記憶體DB驗證，未接正式D1。

固定25 TW＋25 US 包含字典序後真第一名，測全池排序、quality/price/nativegap、篩選／查詢／offset、頁外 suppress、source/hash/state竄改、oldcache與無模型／formal controls。seal完整性不等於來源認證，讀取整批JSON有成本；密集185股票、每股票184peer產生原生 evidence 的補充測試，完整讀取15頁、最大2,034,513 bytes、逐筆hash並行1，完整摘要不變；新增完整性頁面採SQL累計2MiB有界，來源cohort不截斷。既有finalize仍全TW重建peer map，正式D1/Worker全量容量NOT_RUN；性能與UI結果在handover最終檢查。

## 缺失證據與 NOT_RUN

本機市場snapshot是8/29，TW universe1952仅價格／交易所倍數，其他dates1150828／1150812／缺值；TPEx1013也舊且含ETF；不可當10/1財務capture。原9/18檔`outputs/taiwan-model-audit/operating-v2/inputs.json`（舊文件SHA43c2bca489c504ededead8c4f25f0b560d8b78a609537e85eb2184ef4b905c1a）未找到。

因此完整10/1／9/18全市場模型before-after、五個已知高上行案例完整當期peer重播、申報可見性與未來報酬均NOT_RUN。新取得17檔有界真資料PASS，不能再說『沒有任何真current來源』，也不能把它改稱完整全市場驗證。

## 重跑與紀錄

```sh
npm test
npm run lint
./node_modules/.bin/tsc --noEmit
node --experimental-strip-types scripts/validate-taiwan-applicability.mjs --out outputs/local-validation/NEW-V2.json
node --experimental-strip-types scripts/compare-taiwan-applicability-local.mjs --baseline-dir outputs/local-validation/baseline --out outputs/local-validation/NEW-COMPARE.json
```

公開capture/replay命令在capture報告。輸出排他建立新檔；原raw及第一階段結果不覆寫。baseline hash pin保持；model source hash隨每次報告保存，程式改動後需新檔重跑。最終582/582 tests、lint零errors/八個既有warnings、typecheck與build/artifact PASS；`npm-test-release-v2.log` SHA256 `0514c9cd6b01b50dd7ca8f5e93be1d43ee8190f50ac940b552bdd76e48f7d214`。第一階段結果不是新程式驗證。

| 最終 artifact | SHA256 |
| --- | --- |
| `taiwan-applicability-final-v2.json` | `9d4fa323ece115379af4e7b28b7cebf2b2a30c5fefddb3e9faf17d95c16a8afb` |
| `taiwan-applicability-comparison-final-v2.json` | `71d878caf6aba43f438ea04a1904fea96b4b77b5e3b8104da07854585ba927a2` |
| `public-bounded-before-after.json` | `7c200b52d55080b711373de7bef72008f06323cf721524342fab1f3517f775de` |
| `source-replay-regression-root-final-v2.json` | `1769b777026c778863f600a984d520df88bff59dde97e798e66ddf2adb7d9c60` |

上述檔均在 `outputs/local-validation/`；capture raw／manifest／final evaluation hashes見公開capture報告。後續修改必須新檔重跑，不以舊hash表示新程式通過。
