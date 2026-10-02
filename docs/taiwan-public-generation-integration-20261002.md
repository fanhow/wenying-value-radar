# 固定公開樣本的本機同世代整合驗證（2026-10-02）

本 protocol 在整合結果出爐前固定。只讀既有 PCB 十家、既有記憶體 registry 七家，共 17 家、46 個 raw bodies；原 inputs 與 manifest SHA256 固定在 `PUBLIC_GENERATION_PROTOCOL.sourcePins`，且再次以 frozen raw 經 collector 重建。兩批一起進入完整 TW pool，memory 分組僅採既有 registry，不強制 PCB 為正式 business group。

全程阻止 `fetch`，不讀環境 secrets；呼叫 exact `handleRefreshWrite`／`handleDailyRead`，資料庫僅 `node:sqlite :memory:`，不設 runtime database、不使用 D1、Worker 或正式 URL。合成 US controls 固定為 `SYNLOW`、`SYNFORMAL`、`SYNNONE`；全部明示合成，僅令 manifest 達最低 20 個 targets，預期分別低信心可算、正式合格、無模型。其結果不得當成美股真實資料。

原真實股票仍保留 quote 2026-10-01、financial 2026-06-30、provider-as-of-ordinary shares/asOf 2026-06-30；prepare／batch 後檢查所有原價格、財報、股數與 source fields 完整相等，僅增加原生 derived peer/generation/research metadata。「current」只是同一隔離本機世代的 API 狀態，不意味這些固定價格就是後續重跑日的當日行情。

固定驗證：

1. 完整 cohort prepare 一次，8/8/4 batch 入本機 SQLite，finalize 重建 peer evidence、計算 research cache 並寫 independent seal。
2. 留存舊 head，將舊 derived manifest 標為明示 pre-upgrade version；下一世代上傳中不得替換 head，完成後全部換成新 runId，舊 runId 的研究查詢回 409。
3. 17 真實股票 low／正式資格分開；可算低信心回 researchOnly，無模型 valuation 422，K 線保留且價值共振不得使用未合格估值。
4. 四個 sort、五個 filter、兩市場，在完整 native oracle 過濾／排序後以 limit=1 分頁，逐頁包括空尾頁；價格、native estimated upside、品質與 ticker tie-break 不混入正式 calibrated upside。另檢查 ticker／中文 query 與無匹配 query。
5. 修改 page 外、不具模型的 source input，修改 page 外 cache，重製自洽 replacement cache（含新 inputDigest），均須由 independent cohort seal 拒絕；篡改待 finalize 的 peer group，不可更新 head 或寫 seal。
6. 原 capture 不修改，報告區分 true TW 和三個合成 US controls；不宣稱市場容量、全市場 coverage 或估值準確度。

執行：

```sh
node --experimental-strip-types scripts/validate-taiwan-public-generation.mjs \
  --capture-root outputs/local-validation \
  --out outputs/local-validation/public-generation-integration-NEW.json
node --experimental-strip-types --test tests/daily-public-capture-pipeline.test.mjs
```

## 實際整合結果

第一次 compact finalize freeze 的結果為 **PASS**。17 個 ready 真實股票、46 個 raw bodies 全部重新驗 hash／由 raw 產生 records；20-target manifest 為 17 真實 TW 加 3 合成 US，8/8/4 batches 全部入 isolated SQLite，finalize complete。TW independent seal 覆蓋 17 ready，US seal 覆蓋 3 ready。

整合後真實股票 17 家均 low，3 家有適用模型，正式排名 **0**；research API 回 TW 3 家，合成 US 1 家。以下為 17 真實股票全結果，沒有按可算或上行挑出樣本：

| 股票 | 有效 PE/PB/PS peers | 可算模型 | 原生研究 FV（TWD） | 正式資格 |
| --- | --- | --- | ---: | --- |
| 8213 志超 | 1/2/1 | 無 | 棄權 | 否 |
| 5469 瀚宇博 | 1/3/0 | 無 | 棄權 | 否 |
| 3044 健鼎 | 2/2/2 | 無 | 棄權 | 否 |
| 2355 敬鵬 | 1/2/1 | 無 | 棄權 | 否 |
| 2367 燿華 | 0/0/0 | 無 | 棄權 | 否 |
| 2368 金像電 | 1/1/1 | 無 | 棄權 | 否 |
| 2313 華通 | 2/2/2 | 無 | 棄權 | 否 |
| 2316 楠梓電 | 0/0/0 | 無 | 棄權 | 否 |
| 6191 精成科 | 2/2/1 | 無 | 棄權 | 否 |
| 4927 泰鼎-KY | 0/0/0 | 無 | 棄權 | 否 |
| 2451 創見 | 0/4/0 | 無 | 棄權 | 否 |
| 3135 凌航 | 5/5/5 | PE/PB/PS | 162.54 | 否 |
| 3260 威剛 | 4/4/4 | 無 | 棄權 | 否 |
| 4967 十銓 | 4/5/4 | PB | 349.33 | 否 |
| 4973 廣穎 | 4/3/4 | 無 | 棄權 | 否 |
| 8088 品安 | 1/0/1 | 無 | 棄權 | 否 |
| 8271 宇瞻 | 4/5/4 | PB | 225.13 | 否 |

研究按 native estimated upside 排序為十銓 **+28.431921%**、宇瞻 **+12.005910%**、凌航 **+3.526615%**。三者正式 upside 都是 null；這些百分比是原生低信心模型輸出，不代表預測報酬或正式推薦。原始季度與股數核對限制見 `taiwan-pcb-public-capture-20261002.md`，其中凌航官方 parent/NCI 空值及股份差異尚未解決。

四個 sorts × 五個 filters × 兩個 markets、逐筆及空尾頁共 **92** 次 API paging 檢查 PASS；五個 query 檢查 PASS（3135、凌航、記憶體、SYNLOW、無匹配字串）。「記憶體」沒有匹配 source name/sector/industry 字串，結果 0，沒有額外替使用者補分類詞。

舊 derived head 在新批次上傳中保持不動並明示 refresh_required；完成後全部 research caches 使用 `public_real_current_run`，舊 runId query 回 **409 DATA_GENERATION_CHANGED**。再 finalize 已完成的舊 run 不得取代新 head。17 家 valuation 回 200 researchOnly 或 422 無模型；17 家 K 線保留，valueTrendResonance 都為 null。

四項 DB 派生資料竄改均拒絕：頁外無模型股票價格、空查詢結果外的 cache、帶新 inputDigest 的自洽假 cache，以及待 finalize 的假 peerGroup。前三項返回 refresh_required／`RESEARCH_COHORT_INTEGRITY_MISMATCH`；最後一項返回 400／`GENERATION_PEER_EVIDENCE_MISMATCH`，未寫 seal、未替換新 head，還原後研究頁正常。原 input、manifest、body bytes 都不改。

第一次完整輸出：`outputs/local-validation/public-generation-integration-compact-v1.json`，SHA256 `d4882032c3a55bafc042e4a722fcad7a39645e8043c4dbba8193453be877a05f`；該次 store SHA256 `40b1bee476c7966a29d9a65de49453140c8e53ab0451bb0cb99ccc04664dc1a7`，comparables SHA256 `d611cdad354a953207cd1cfcc5be891cdfa6ac0a63bce99573c792b216c7e3f3`。報告保存各 engine 檔案 hash 與所有真實財務／股數原值。

新增測試 `daily-public-capture-pipeline.test.mjs` **2/2 PASS、0 skipped**：完整真實流水線，以及更改 copied real processed input 在 prepare 前被 source pin 拒絕。腳本／測試 `node --check`、targeted ESLint 通過。

最終 source projection freeze 已另保存 `outputs/local-validation/public-generation-integration-final-v2.json`，SHA256 **`89c227c2a220fdc4f78e905590238b9852bceb84655e5d12def0cf5114410f2d`**，全流程再次 PASS，原 report 不覆蓋。最終 store SHA256 **`5858b89707abbe23f2e42aba1db0852fb4eac5814a8602ed3ebe75fe94ec066c`**；comparables SHA256 保持 `d611cdad354a953207cd1cfcc5be891cdfa6ac0a63bce99573c792b216c7e3f3`。

逐欄 deep equality 比較前後整份報告，唯一差異是 store code hash；全部 source proofs、原財務／股數、17 家模型數值／資格、seals、92 pages／5 queries、control 結果與 rejection checks 均完全相同。這支持此有界樣本上 source projection 保持輸出語意；不能外推為全市場容量或 latency 保證。最終 targeted tests 再跑 **2/2 PASS、0 skipped**，輸出保存在 `public-generation-integration-final-v2-tests.log`。

限制：本機資料 17 家為有界現時擷取，股數尚未逐家核證生效日，官方 parent/NCI、庫藏股與預收股款核對未完成；缺乏公布時間證據，真正歷史日期 holdout 仍 NOT_RUN。CI 若沒有 ignored raw capture，真實整合測試明確 skip／NOT_RUN，不拿 synthetic 股票替代真實驗證。
