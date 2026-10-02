# 更新流程與發布準備交接（2026-10-02，Rev. 2026.10.02.3）

本輪接續 `f969a894c8dc453dd59a3080e42e3c106f8c2296`，改善 finalize 的同行重建成本。使用者後續已授權測試通過及有回復方案後更新既有 Site；沒有變更分享權限、計費、密鑰、正式資料或另建網站。

## 實作與等價性

`compactTaiwanComparableSource` 保存選取、去重、衝突、日期、股數及倍數所需原生欄位；`createTaiwanComparableIndex` 僅持有這些精簡來源、分組與適用性 profile。原 `buildTaiwanComparableMap` 保留 collector 介面及完全相同的輸出。

finalize 第一遍由 SQL `json_remove` 去除 `comparableMultiples`／`dailyResearch` 衍生欄，再按投影位元組大小讀取；第二遍讀完整 stock，逐檔產生、核對並釋放同行證據。兩遍均採 2 MiB／最多 500 列的有界頁面，單筆超限仍可前進；之後仍核對全部 ready stock 的完整來源與快取 seal，沒有抽樣、截短同行或只檢查回傳頁面。

模型、最低同行數、日期／股數口徑、業務 registry、35% 分歧門檻、研究及正式資格完全不變。741 組前後等價反例、固定 `f969a89` 同序 golden 及來源投影回歸通過；真實 17 家的來源、財報、估值、資格與 seal 亦完全相同。

## 有界實測

兩臂使用同一 seed、報價日 10/1、財報截止日 6/30，對照的是具有相同估值規則的 `f969a89`，**不是正式 `ccc6d1d` 的效能基準**。全部股票與歷史明示合成。

| 本機 Node／SQLite 層級 | f969a89 | 本輪候選 |
|---|---|---|
| 185 TW＋8 US | 完整流程通過；finalize 914.6 ms、取樣 heap 183.43 MiB、32 SQL | 完整流程通過；finalize 978.5 ms、取樣 heap 90.28 MiB、48 SQL |
| 740 TW＋8 US | prepare／upload 完成，finalize 觸及 256 MiB heap 上限，SIGABRT | 完整流程通過；finalize 3,846.9 ms、取樣 heap 177.63 MiB、141 SQL |
| 1,850 TW＋4,315 US | NOT_RUN | NOT_RUN：740 的 kernel maxRSS 531.05 MiB 超過預設 640 MiB 預算的 80% 升級門檻 |

185 的 finalize 取樣 heap 減少約 51%，以額外驗證頁面換取較低常駐記憶體；wall time 並未改善。候選 740 的全池研究排序／分頁檢查耗時 76.19 秒，單次 research request 最多 70 SQL；這是多次請求的測試總時間，不能當作單次請求耗時。該 stage 的 3,082 SQL 亦不能當作單次 invocation 查詢数。

Node／SQLite 的 process RSS 包括 collector、TypeScript loader、SQLite 與尚未回收的配置；取樣 heap 是下界。這些數值不等於 Worker isolate 的必要 live heap，也不證明正式 128 MB／CPU 或 D1 quota 通過。負載規則、版本與實際輸出見 [負載協定](refresh-load-protocol-20261002.md)，本機 engine 限制另見 [workerd 驗證報告](refresh-workerd-local-validation-20261002.md)。

固定公開 17 家、46 raw 的 prepare→batch→finalize→seal→read 整合通過。17 家皆 low、3 家有研究試算、0 家正式資格；四排序×五篩選×兩市場含空尾頁共 92 頁及五 query 通過。新 head 取代舊 head、舊 runId 409、頁外來源／假快取／假同行拒絕與 K 線保留亦通過，詳 [真實整合報告](taiwan-public-generation-integration-20261002.md)。

本機 UI（11 合成＋7 真記憶體樣本，非完整市場）確認凌航 162.54／+3.5% 僅為低信心研究，正式 0；1280 與 390 px 版面無水平溢出，真 K 線正常。本輪未增加 UI 功能，僅同步中英文版本紀錄。

## 發布前狀態與本輪發布決策

唯讀查核：既有 Site `appgprj_6a7a06ab40608191a76944e15c6b0500`，URL `https://stable-value.fanhow.chatgpt.site`，目前成功發布版本 **89**，來源 **`ccc6d1d08612edf051b1b552b445bb1301745068`**。回復 saved version 為 `appgprj_6a7a06ab40608191a76944e15c6b0500~appgver_6d5ec4cfa57481919f9c7a071f6684ea`，可使用既有 archive，SHA256 `75341a7a803d09352e5bc73651a2c29cba7c50f9c974dfdd89cb751412eec7f6`。存取模式 custom、policy revision 5，保持原有權限。

發布前 current head 為 `daily_2819f992-6c59-4eb8-ac6a-e2b81dc30a14`、partial：6267 target，TW 1952／ready1770，US4315／ready2691；兩交易日 10/1。正式 DB 尚無 research seal table；新表由新版正常 `begin` additive 建立，沒有 ALTER、刪表或破壞性 migration。未注入測試資料、未回填舊批次為新估值、未觸發正式刷新。

**來源同步已具備權限**：Mac Git CLI 的 HTTPS／SSH 未配置登入，但既有 GitHub connector 已成功核驗 `fanhow/wenying-value-radar` 的 push 權限，無須新增金鑰、host key 或持續權限。原先僅根據 CLI 檢查推論不能同步，已修正。GitHub 與 Sites 是不同 remote；發布時兩者必须指向相同內容，collector 與 Worker 的 valuationVersion 亦一致。

GitHub Git Data API 無 author／committer timestamp 參數，重建 commit 的 SHA 會與本機不同；以精確 Git tree／blob SHA 證明內容相同，保留原本機分支及三階段審核歷史，不假稱原 commit SHA 已推播。canonical baseline 為 `28d543cf162a7944286716652ce014d84d7cc5a8`，其 tree 精確等於固定 `f969a89` 的 `2b9f1b681cec31aa6fa34ea84d3f2099d5574abc`。負載 harness 優先使用本機基準、在新 clone 使用 canonical 別名，兩者均核對 exact tree 與 `lib`＋collector digest `516efe0154b05c64ceb2c159c050dd9d1e37c3859fb694457c1c9b15cd1aeb86`。

本輪採**可回復且明示限制的發布**：603/603 測試、lint（0 errors，8 既有 warnings）、typecheck、正式 artifact build、本機 workerd endpoint／隔離 DB、真實 17 家整合及桌面／手機 UI 已完成基本檢查。正式全市場與並行容量仍未認證；不將研究試算當推薦、不替旧批次補造 seal、不注入合成資料。部署後舊台股批次應明確要求刷新並退出正式榜，現有 K 線及相容美股功能保留；在正常新批次成功前，不宣稱正式研究榜已完成驗收。

Mac 沒有 Sites bundled `site-workflow.mjs`；已搜尋本機技能與 Documents，沒有找到，不冒稱跑過該 helper。必要的 source provenance、建置驗證及 archive 準備使用現有 Git／repo scripts 和 native Sites 操作，暫時憑證只在 session memory／stdin，不寫檔。发布的 exact commit、archive、saved version、deployment 与 readback 结果另写 ignored `outputs/local-validation/release-publication-20261002.json`，避免事後改動已建置來源。

## 下一步與回復邊界

1. 使用既有 GitHub connector 正常 fast-forward 同步測過的 source，確認 GitHub collector 與 Sites source 的 exact commit／tree 相同，再發布既有 Site，維持原 custom audience。已保存版本89與來源 `ccc6d1d` 作回復基準。
2. 透過既有每日工作流程完成正常新批次並核對 batch/finalize／研究讀取；若現有工具沒有 dispatch 或瀏覽器未登入，據實回報具體下一步，不新增觸發器或取出 secrets。沒有建立付費環境；正式帳戶方案、CPU／記憶體強制限制、完整市場及並行請求容量仍 NOT_RUN。若需新收費資源或權限擴張，另行確認。固定密集 740 finalize141／read70 超過 D1 Free50，但低於 Paid1000，不能據此推定本 Site 方案。[D1 limits](https://developers.cloudflare.com/d1/platform/limits/)、[Worker limits](https://developers.cloudflare.com/workers/platform/limits/)
3. 發布後核對 native saved commit／version、實際 footer3、現有 share policy、正式榜與研究區、缺資料理由；成功新 batch 須同時通過 seal、全池排序／分頁、K 線及價值共振資格。旧 batch 缺 seal 時研究明确 refresh_required，不把舊排序當新研究。
4. 若更新失敗，先保存日志與 generation狀態，回復89及相容 collector。既有正式流程的 latest failed 會使 daily API 503，單回 Worker 或 head 不一定解除；必要時用原正常相容 refresh 成功建立 head，或經授權核對 generation復原。舊版不能把 v3 當 v1，不能刪失敗紀錄來掩蓋問題。可捕獲 research SQL／parse 例外僅使研究區失效；硬 CPU/OOM 終止不保證 fallback。

來源可信度／股數核證、平均權益 PB ROE 比例與 margin factor2 仍為研究限制，歷史日期 holdout 尚未完成；本輪沒有將外部價格視為真理，也沒有宣稱全市場估值已精確。
