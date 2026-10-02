# 穩盈估值改善：本機交付與驗證（2026-10-02）

本機版本 `Rev. 2026.10.02.2` 將同業倍數適用性、研究試算與正式排名分開。低信心資料可透過獨立研究排行排序、篩選、搜尋及分頁；正式榜、輪動與價值共振維持資格檢查。沒有外部目標價擬合，沒有降低 35% 分歧門檻，尚未正式發布。

## Checkout 與授權

已讀 repo `AGENTS.md`、本機語言規範及存在的移轉 `memory_summary.md`。本 checkout 無 `.agents/`。已登錄 `/Users/charlie/Documents/穩盈400` 為空，移轉備份沒有完整當前 Git checkout；保留原檔，從已核對 `fanhow/wenying-value-radar` 建立獨立乾淨 checkout。

- 目錄：`/Users/charlie/Documents/Codex/2026-10-02/task/wenying-value-radar`。
- 分支：`codex/taiwan-valuation-applicability-20261002`；起點 `ccc6d1d08612edf051b1b552b445bb1301745068`，當時 remote main／HEAD 相同，無未提交修改。
- 第一階段本機 commit `0c1eb0fdbe063b3b2baf6b6bb1d8f3c952184982`；本文件以第二階段最終程式與結果為準。
- 頁尾中英文紀錄、HTML 與輪動渲染測試同步 `.2`。
- 沒有 push、部署、正式 D1 寫入、秘密讀取、儲值或計費變更。使用者只授權本機；未執行 AGENTS 的 push 步驟。

## 模型與資料處理

`lib/taiwan-multiple-applicability.ts` 與 `taiwan-comparables.ts` 留存逐模型 peer ticker、原始分子／分母、財報／股數／ROE／利潤率 profile 與分類原因。同報價日、同財報截止日與同股數口徑；排除自己、至少五家、原倍數上限及 Q3/Q1 ≤4。已分類業務群不得回退廣產業，固定六家 PCB 不直接改成正式群。

- PE：正 EPS；非金融需可核對的正歸母淨利率與營業利率，peer/target 各在 0.5–2。不再以 ROE 比例或平均權益缺漏直接拒絕可用 EPS。金融 PE 維持原金融分類及來源限制，並未核證成長、配息、信用風險可比性。
- PB：正歸母淨利／平均權益 ROE、peer/target 0.5–2，非金融另要求正營業利率。平均口徑無法確認則 PB 棄權，不以 EPS/BVPS 代替。
- PS：正歸母及營業利率各在 0.5–2，已知非控制權益且不超過母權益 25%。
- 倍數限制與 NCI 25% 都是固定、尚未驗證最優的研究假設；不是 CFA 或業界規定。PE 成長／風險與 PB 的 ROE 經濟依據及本次修正詳見[驗證規格](taiwan-applicability-validation-20261002.md)。

原因區分 `source-data`（缺欄、口徑或觀察不一致）、`peer-comparability`（匹配不足／分散）與 `assumption`（已知非正獲利、NCI 超界等模型限制），UI 中英文列出原因。相同代碼不意味相同根本原因；EV 仍需核證企業價值橋接，這次 provider-only capture 皆未提供，不能把 EV 零覆蓋解讀成產業經濟不適用。

Evidence 核對日期、分子／分母、倍數、中位數、樣本數、分類及理由一致性，拒絕 sparse、負 NCI、極小值等異常。它檢查內部一致性，不認證原始財報。保留原生等權值、未擬合校準與外部比較的差異；PE／PS 變體不增加獨立資訊群數。無模型不回填歷史外部值、股價或精準 FV，內部占位 0 不顯示成零元／−100%；分歧為 null。

原问题的 8213 模型分歧為 34.8649347%，小於 35%；舊 UI 四捨五入顯示 35% 不證明漏判。本版顯示至兩位小數，仍以原精度判定 ≥35%。外部平台五檔價值僅為診斷比較，不改為本站估值目標，也不以缺 DCF 單獨解釋原差額。

## 可使用的研究排行

`hasModel`、`rankingEligible`、native research gap 分離。原生或校準 low、待覆核與無模型均不進正式榜；單股低信心可回 200 研究試算，無模型回 422 原因。價值共振及輪動失格清除，純技術資料保留。

主頁有正式／研究切換及各自的市場、篩選、排序狀態。研究區以原生 FV／價格差距排序，明示低信心、待覆核與「差距不代表投資機會」；可以搜尋、查看單股、依市場載入更多。當當批台股無正式候選但有研究值，預設導向台股研究区，避免估值功能只剩空榜。

研究 API 使用完整當批資料而非先取字典序二十檔再排序。每日完成程序由 server 生成版本化 cache；封存後讀取先核對整市場獨立 seal，再套 SQL 篩選／全池排序／分頁，當頁再重算狀態。舊 generation 未具研究 cache／seal 或任一頁外資料遭改動，整市場回 `refresh_required`；不以舊 snapshot 冒稱 current。這需要正常下一次 refresh 生成新封存，這次沒有在正式資料執行。seal 證明封存完整性，不認證資料供應商或估值正確。

目前自動台股同業模式仍維持 low，故正式估值榜仍可能沒有台股。新增研究榜保留完整研究用途；沒有把不具證據的值升成 medium。資格函式不是按 TW 一律拒絕：實際 `calculateStock` 的合成手動台股八模型 high 與美股 medium 正向控制均保留原合格行為，不能把它們視為真實來源核證。

## 真實公開資料重播

固定名單後擷取、全樣本保留，不按 FV 增刪公司。10/2 公開擷取、10/1 價格、6/30 財報，Yahoo raw bytes／URL／retrievedAt／SHA256 留存；使用原 collector 離線重建每筆 record，與保存 JSON 比較，無網路 fallback。這是當期公開擷取，不是歷史申報時點的 point-in-time 證據。

| 固定公開群 | ready | raw bodies 核對 | 可算／正式 | 結果 |
| --- | ---: | ---: | --- | --- |
| 十家 PCB 候選 | 10/10 | 27 | 0／0 | 資料 metadata 可用，匹配不足；不強塞新群、不放寬五家 |
| 既有七家記憶體 registry | 7/7 | 19 | 3／0 | 凌航三模型，十銓與宇瞻只 PB，其餘棄權 |

8213 志超重新取得股價 34、EPS 1.96、BVPS 64.295310、SPS 73.174912，與問題輸入一致。平均權益 ROE 3.429771% 與 share metadata 有效，不能說供應商永缺資料。固定十家候選內 PE／PB／PS 僅 1／2／1 家匹配，棄權。此有界 pool 不是原 184 檔電子零組件完整 production pool，不能把棄權當作新目標價或把舊 103.16 重標為已修準。

凌航 3135 為真實來源、可計算的完整功能正向案例：PE／PB／PS 各五家，值依序 123.439939／140.171174／223.999244，等權原生 FV 162.536786，股價 157、研究差距 +3.5266%，low，正式資格 false。它是資料匯入、peer 及分類流程通過，**不是 FV 或股數已核證**：provider 6/30 股數 89,721,491 對官方 current 97,158,956 有日期差；官方同季參考 BVPS 47.98 對 provider 51.771688（+7.9026%），官方母權益欄缺值。完整原因、peers、source hashes 與數字在[公開 capture 報告](taiwan-pcb-public-capture-20261002.md)。

8213 同季官方母權益 16,996,626,000 與 vendor 相符；參考 BVPS 62.66 對 64.295310（+2.6098%），官方 10/1 已發行股數 271,242,488 對 6/30 provider 264,352,500。不同日期／P/B 參考分母只作診斷，不覆寫 EPS／BVPS／SPS。平均 ROE 與普通股數不是永久不可滿足的 gate：十家實抓皆具 metadata／average ROE；移除年初權益的反事實 fixture 只讓 PB 降級，移除 ordinary shares 則核心匯入拒絕。

## 相同輸入前後比較

| 樣本 | 可算：舊 ccc6d1d →新 | 正式：舊→新 |
| --- | --- | --- |
| 固定合成 9/18，230 holdout | 230→227 | 166→0 |
| 固定合成 10/1，230 holdout | 230→227 | 167→0 |
| 同一公開 PCB 十檔有界 pool | 7→0 | 2→0 |
| 同一公開記憶體七檔 pool | 7→3 | 0→0 |

合成 seed／1,100 issuer／22群／870 train＋230 holdout 不改，peer 只含 train 加單一 target；兩日期共 21,598 觀察，PE/PB/PS 覆蓋新為 219/219/213。值有升有降，沒有準確率或投資績效結論。真實比較重用相同 capture，沒有把公開當期資料當歷史 holdout。完整全市場 10/1 capture／原 9/18 frozen 仍未取得，全市場 before-after／五個原問題案例完整 pool 重播／未來報酬 = **NOT_RUN**。

## 最終工程檢查

| 檢查 | 最終結果與本機證據 |
| --- | --- |
| `npm test`（包含 vinext build／全套 tests） | **582/582 PASS、0 fail、0 skipped**；`npm-test-release-v2.log` |
| `npm run lint` | PASS：0 errors、8 個未修改檔案的既有 unused-vars warnings；`lint-release-v2.log` |
| `tsc --noEmit` | PASS、exit0；`typecheck-release-v2.log` 無錯誤输出 |
| Artifact | ESM Worker／default.fetch／hosting manifest PASS；103 PNG allPixelsIdentical，原 public 圖檔不變 |
| 合成 holdout／同輸入 baseline | PASS：21,598 observations、50 capture records／9種拒絕；`taiwan-applicability-final-v2.json`／`taiwan-applicability-comparison-final-v2.json` |
| 真公開來源 | PASS：PCB10/27、memory7/19離線 raw重建；兩批 `evaluation-final-v2.json`，七項 tamper 7/7 |
| 研究 API／UI 競態 | 全套包含 global sort/filter/search/paging、off-page suppress、seal、無seal legacy及慢請求失敗／分頁失效回歸 |
| 密集同業完整性 | 185股票、每檔184 peers、15頁、最大頁2,034,513 bytes≤2MiB、canonical hash並行1，完整digest不變 |
| 本機 UI | 桌面排序／篩選／搜尋3135／正式空榜、三模型原生162.54與low警示、中英文、無模型1002；390px手機documentWidth=viewport=390 |
| 本機 proxy HTTP | 34個唯讀契約PASS；`proxy-http-contract-final-v2.log`；其他API503、不轉送正式來源 |
| 完整全市場 current／historical／正式D1容量 | **NOT_RUN**，不能以本機合成及17檔真有界樣本替代 |

八個 lint warnings 僅在 `lib/technical-analysis.ts` 四項與 `scripts/analyze-80-candidates.mjs` 四項。build 保留既有 bundle大小與vinext靜態路由分類提醒，編譯及artifact仍通過。為讓原repo在Mac運行，第一階段加入bash腳本啟動、Node bounded timeout fallback（超時exit124）及SVG CRLF canonicalization；原圖檔未修改。

每次研究讀取仍須核對整當批JSON，**正式D1／Worker容量與帳戶方案尚未核驗**。2MiB/逐筆hash只限制新增完整性讀取，finalize的完整TW peer map重建仍有全cohort記憶體成本；不得把本機185密集樣本当4k+正式refresh保証。D1查詢／CPU／記憶體資源錯誤時保留可讀正式榜，研究区失效，不縮小驗證範圍。详[封存與成本報告](research-ranking-integrity-20261002.md)。

UI使用ignored純本機proxy，11筆明示合成＋7筆真公開capture，各自peer pool独立；真行情直接原399 candles、財務值不改。截圖為`ui-phase2-real-3135-desktop.jpg`、`ui-phase2-real-3135-mobile.jpg`、`ui-phase2-research-ranking-desktop.jpg`、`ui-phase2-no-model-mobile.jpg`與最終`ui-final-research-ranking.jpg`。合成K線僅查不可用fallback，真3135日週月控制及圖表載入可见；不把synthetic當行情核證。輸出在Git ignored `outputs/local-validation/`，保留新檔名，不覆寫第一階段結果。臨時分頁與本機伺服器於交付前關閉。

## 審核與重跑

完整可審核 patch 包含新增檔，基準為 ccc6d1d。所有修改只保留本機。固定來源／規則／結果與 hash 在[驗證規格](taiwan-applicability-validation-20261002.md)。

```sh
npm test
npm run lint
./node_modules/.bin/tsc --noEmit
node --experimental-strip-types scripts/validate-taiwan-applicability.mjs --out outputs/local-validation/NEW-RUN.json
node --experimental-strip-types scripts/compare-taiwan-applicability-local.mjs --baseline-dir outputs/local-validation/baseline --out outputs/local-validation/NEW-COMPARISON.json
```

公開捕捉與離線重播指令見 capture 報告；沒有秘密、雲端寫入或外部 FV。正式發布與資料重建需另行授權，這次未執行。
