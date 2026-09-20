# 台股公允價值對齊：根因、模型研究與未發布進度

狀態：進行中，**不是已完成對齊／已上線聲明**。基底 Git `74660c3d03ebdd99be42553ce15da8f776a7905c`；原有 Sites project／網址／owner-only 存取不變。

## 第四輪：每日流程整合（Rev. 2026.09.20.6）

- 完整收集台美股後，才建立同一交易日的 TW 同行／業務群證據；TW 擷取階段不先計算舊啟發式估值。保留最多 400 根實際 K 線，僅重算價值趨勢訊號，US 數學模型不變。
- `dailyValuationState` 統一 API、排名、技術與 rotation 的估值資格。財報 `ready` 與流動性 `eligible` 不改意義；無模型／待覆核的 `upside` 寫入 SQL NULL，不是零元、−100% 或假低估。四因子研究保留財務資料。
- 新 manifest／stock 需相同 version、runId、policy。伺服器驗證 ready／unavailable 的 OHLC 日期、身份、價格，封存完整批次後重建同行倍數；錯倍數、錯業務群、混批均不得切換 head。遲到 batch 不能修改已封存資料，舊 run 不能覆蓋較新 head。
- 舊版 head 的 TW 估值暫停，但 OHLC、純技術與 US 保留。瀏覽器不持久化 daily inputs，依 active run／version 過濾；保留手動資料、觀察清單與無估值股票的獨立 K 線入口。失敗或遲到的 lookup／status 不得使舊估值復活。
- Frozen operating-v2 重播：1,952 檔 TW，1,786 財報 ready；227 無模型、782 模型待覆核、777 通過估值檢查。與原流動性資格交集為 490，低估超過 5% 有 230、高估超過 5% 有 212。**這是離線同一輸入的流程驗證，不是目前 production 名單或準確率。**
- 驗證：`npm test` 357/357（含 build、103 張 PNG 無損像素驗證及 Worker default.fetch）；ESLint 0 errors／9 既有 warnings；TypeScript 通過。10 項新 generation 測試涵蓋 UTF-8 payload、完整 cohort、輸入順序、400 bars、NULL、錯倍數、舊 head、遲到 batch 及本機 cache。
- 本機唯讀市場 fixture 的瀏覽器 QA：2451 顯示待覆核、沒有 FV／upside，K 線可載入；加入觀察後 reload 仍保留技術入口。3036 顯示 FV 288.55；rotation 的 2451 363.02 明示僅供差異研究，四因子仍可見。測試來源是 ignored frozen capture，不是正式站資料；未把測試 server 或 capture 包入 artifact。QA 發現舊同行／平滑說明不適用新 TW policy，已改為實際規則。
- 部署是下一個獨立步驟；本段程式提交本身不宣稱已上線。仍缺授權且口徑完整的前瞻共識資料、部分非營業資產橋接及跨期間獨立驗證，不能宣稱完整重現外部模型或 AI。
- 來源界線：保留既有 `sourceNote`，未新增機器可驗證的財報公告時間；financial period end 不等於當時已公開時間，本流程不是 point-in-time 回測。

## 第三輪：官方業務同業與前瞻研究契約

- 新增 `taiwan-business-groups.ts`：根據七家 2025 官方年報的主業，區分記憶體／儲存產品與廣義半導體。商丞因系統方案為主排除，品安保留 mixed-EMS 註記；這是事前指定研究群，不宣稱完整產業覆蓋。
- `taiwan-comparables.ts` 保留 industry bins，另建 business bins；已分類成員仍留在其他標的的原產業池。明確無效 ref、版本、target／peer 成員不符不得 fallback。`null`／空物件與未指定 ref 的重複輸入也須衝突排除，與順序無關。
- 同一 1,786 筆凍結輸入，**只有 7 家模型數值改變**。創見由 1,208.58 變 363.02（外部 394.47）；原十檔 discovery 平均絕對差距由 37.2954% 變 17.4548%，仍是已用過案例的觀察，不是準確率。
- 事前固定的七個額外案例，有模型 6、同價 4、日期＋價格皆驗證 3。這三筆平均絕對差距由 387.9242% 變 34.5738%；十銓仍 +82.8711%，不能宣稱全組對齊。品安在同價但日期未驗證的比較反而由 +52.8410% 變 −55.5613%，不隱藏反例。
- 詳細[事前規則與結果](taiwan-memory-peer-protocol-20260920.md)、[必要來源觀察](taiwan-memory-peer-observations-20260920.json)。重播：`node --experimental-strip-types scripts/audit-taiwan-models.mjs --capture operating-v2 --replay --business-groups`；再執行 `node scripts/compare-taiwan-memory-peers.mjs`。兩者只寫 ignored research outputs，不更新正式資料。
- 新增 `forward-earnings-evidence.ts` 純函式：明確 annual／LTM／NTM、FY2 財年末、source as-of、TWD、reported／adjusted、basic／diluted、股份调整基準及觀測 PE。拒絕 NI÷期末股數冒充 EPS；兩支各自有效及口徑一致才平均，缺值不補零。只有合成測試，沒有供應商 adapter 或 production 匯入。
- 前瞻方法依據：[IAS 33](https://www.ifrs.org/issued-standards/list-of-standards/ias-33-earnings-per-share/)、[FactSet FY1/FY2](https://go.factset.com/hubfs/Website_Downloads/Statistical%20Package%20Integration/Docs%203.0/estimates-ondemand.pdf)、[NTM 官方 SDK 文件](https://www.nuget.org/packages/FactSet.SDK.FactSetEstimates/3.3.0)。通過契約不等於來源可信度／授權已成立。MVP 只接受完整 12 個日曆月，52／53 週及季度近似未支援。

正式接線下一步：完整 TW generation 擷取後一次建 peerMap，再計算及上傳；`status` 保留財報可用性、`eligible` 保留流動性，新增共用估值資格將無模型／待覆核的 DB upside 設 NULL。排名、rotation top10、valuation API、純技術與 valueTrend 必須一致；四因子研究不因 peer 不足而刪除財務資料。history 保存實際最多 400 bars，僅重新判定 valueTrend。首頁 localStorage 旧 daily inputs 必須在 422／版本不符時失效，不能讓舊高估值繼續顯示。完成這些邊界前，不啟用 `tw-comparables-v1` 到正式榜。

第三輪最終驗證：`npm test` **347/347**（含 vinext build、103 張 PNG 像素一致壓縮及 Sites Worker artifact 驗證）；ESLint **0 errors／9 個既有 warnings**；`npx tsc --noEmit` 通過。獨立審查發現的分類重複、malformed 時間、NaN/null 衝突、比較重複身份、雙側日期／價格及溢位問題均已補測並關閉；最後独立前瞻測試 34/34、比較測試 6/6 通過。

研究 revision **Rev. 2026.09.20.5**；本輪沒有供應商前瞻 feed、沒有正式 collector 接線、沒有 Sites save/deploy。Sites 管理狀態重新確認 active／version 81／custom owner-only（1 位使用者、0 群組、0 外部訪客），正式仍為 Rev. 2026.09.20.2／原即時每日流程，並非快照。這不是部署權限不足，而是正式估值接線尚未完成。本輪未另做完整瀏覽器互動 QA；通過的是程式／渲染測試和研究來源 UI 核對。統一 `build-site.mjs` 本輪未重跑；下文保留第二輪 Windows npm shim 失敗紀錄，專案既有建置路徑本輪已成功。

## 資料與比較範圍

- 2026-09-20 公開資料收集，最近完成報價日 2026-09-18。
- 全目錄 1,952 檔台股，原始可用 1,797；11 檔每股 EPS／歸母淨利／股數口徑重大不符需覆核，剩 1,786。不是假設這 11 檔都同一錯誤。
- 同日同產業研究原型有同業資料 1,559 檔；模型不足、重大非控制權益、本業／盈餘背離或盈餘基礎轉變標記待覆核，不把沒有模型的 0 當成公允價值。
- 本機原始 capture：`outputs/taiwan-model-audit/inputs.json`；重播：`node --experimental-strip-types scripts/audit-taiwan-models.mjs --replay`。此指令不寫入正式資料庫。
- 新增營業 EBITDA capture：`outputs/taiwan-model-audit/operating-v2/inputs.json`，擷取時間 `2026-09-20T20:40:03.474Z`；同樣為 9/18 股價、主要 6/30 財報。重播加上 `--capture operating-v2 --replay`。原始檔禁止覆寫；輸出附 input/model SHA-256，外部比較只在 audit script 使用。
- 先前正式數值留在 `outputs/value-audit-20260920/after-release.json`。新增資料、模型及同業範圍都有改動，因此下表是系統版本比較，不是單一因素因果效果。

## 已證實根因

1. **金融分類**：每日台股 sector 實為上市／上櫃板別，實際產業在 industry。致和證、美好證曾被當一般企業，使用營收／ROE 自訂高 P/E。
2. **收益基礎與倍數**：吉祥全相同 TTM EPS 31.99，在本站套高倍數與剩餘收益，得到 650.76；外部 7 模型均值 52.89。外部 P/E 模板使用 LTM 1.6x 與 forward 15.6x，後者淨利 117 百萬元（與最新年度一致），並非本站的單一高倍數。選定倍數如何自動形成尚未完整公開，不硬編個股答案。
3. **官方非經常性／週期區分**：吉祥全 H1 FVTPL 利益 3,321,735 仟元、營業損失 138,908 仟元；券商評價利益屬其營業項目；群聯與創見本業實際增長，不能把全部高 EPS 判為一次性。
4. **真正單位錯誤**：6194 育富官方 2026 Q2 已發行股數 48,000 **千股**，即 48,000,000 股；Yahoo 回傳 48,000 股，使 BVPS 40.66027 變成 40,660.27083。TTM 歸母淨利 56,077,000 本身吻合官方年度＋當期半年－前期半年；供應商 EPS 93.931917 的形成路徑仍未查清，不猜測乘除係數。
5. **模型重複計票**：智邦的三個共用 FCF 模型曾使獨立 P/E 模型被 MAD 過濾；其低信心又被校準升級。台股修為按獨立資料群檢查、保留原生信心，不增加 2% 品質溢價。
6. **合併與母公司橋接**：EV 以合併營業利益估值，必須考慮非控制權益。研究原型揭露小額帳面 NCI 近似；NCI 超過母公司權益 25% 時停用 EV／合併營收倍數、要求覆核。25% 是本站研究治理假設，不是外部平台的規則；帳面 NCI 也不是市場價值。
7. **EBITDA 口徑混用**：和碩 Yahoo TTM EBIT 29,210.333 百萬元，加 D&A 15,441.956 百萬元，得到供應商 EBITDA 44,652.289 百萬元；其 OperatingIncome 實為 14,681.885 百萬元。本站台股改用 OperatingIncome＋同期間現金流 D&A＝30,123.841 百萬元，保留所有原值。外部顯示 29,336 百萬元仍有約 2.7% 差異，不硬配。吉祥全同口徑 EBITDA 由含業外 3,421.672 百萬元轉為營業基礎 -170.408 百萬元。
8. **銷售倍數的利潤率可比性**：同大類產業中，低毛利代工與高毛利企業不能不加區別共用 P/S／EV/S。研究版只取正利潤率在 target 0.5–2 倍內的同業：P/S 用歸母淨利率、EV/S 用營業利益率，各至少五筆，無通用倍數回填。倍數保持原觀測中位數、不乘利潤率縮放；2 倍為本站研究假設，未依外部 FV 調參。同業實際代碼、target margin 與口徑寫入證據，target 變更時拒用舊集合。

## 不支持的說法

- 尚未發現本站把半年累計當單季再重複加總的證據。1102、2344 抽樣的 Yahoo 季度／歸母口徑可對上官方。
- 不能把外部公允價值當財務真值；來源之間本身也有差異。
- 不宣稱知道外部 ProPicks AI 的私有特徵、權重、訓練集或未公開規則。
- 不使用舊 benchmark ticker 固定值、外部 target、或將 fair value 限制為某個市價倍數來製造對齊。

## 同業原型重播結果（全部十檔，含待覆核）

外部參考值沿用 2026-09-20 已記錄、同 9/18 報價的十檔比較；不是重新抓取每一檔即時外部版本。

| 代碼 | 外部 FV | 本機原型 FV | 絕對相對差距 |
|---|---:|---:|---:|
| 8069 | 218.89 | 171.80 | 21.51% |
| 8299 | 3024.67 | 4156.58 | 37.42% |
| 3036 | 288.90 | 288.55 | 0.12% |
| 2451 | 394.47 | 1208.58 | 206.38% |
| 2610 | 27.16 | 34.61 | 27.42% |
| 4938 | 120.74 | 127.58 | 5.67% |
| 2344 | 235.54 | 222.81 | 5.41% |
| 2345 | 2404.01 | 1075.71 | 55.25% |
| 1102 | 45.16 | 39.47 | 12.60% |
| 2382 | 437.52 | 432.37 | 1.18% |

平均絕對相對差距 **37.30%**，中位數 **17.05%**，同日同價 10/10；包含所有待覆核案例，沒有用 review flag 移除不利數字。既有版本約 81.68%；第一個廣類同業版曾為 44.95%，新增營業 EBITDA 與對稱 peer eligibility 後為 55.70%，再加固定利潤率可比性為本表。保留此演進，避免只報最好的一次。

這十檔已參與研究，**不是 holdout**，不能把改善宣稱為未見資料準確率。創見惡化為 +206.38%，智邦仍 -55.25%；群聯、創見、華邦電、智邦因盈餘基礎／模型分歧等待覆核，亞泥只剩 P/B 同樣待覆核。全體 1,786 筆中僅 778 未觸發研究 review gate；這不是推薦名單。相似利潤率不等於相同成長、槓桿、週期或投資需求。

另於稍後外部和碩頁面看到 FV 124.85，模板內價格也可能與頁首不同；本表不偷偷更新原 120.74 比較基準。下一輪需重新同步外部觀察時間及模型輸入。

## 第二輪：創見／智邦逐模型拆解（9/20 21:16 UTC 前完成觀察）

本節是訂閱帳戶可見頁面的必要比較事實；不是複製完整付費模板，也不把外部選定倍數寫成本站生產常數。兩個公司頁的 FV／股價仍與原凍結基準一致。

| PE 模型比較 | 2451 創見 | 2345 智邦 |
|---|---:|---:|
| 本站原型 PE | 1,646.90 | 1,343.27 |
| 本站大類產業 PE 中位數 | 28.63765x | 21.21622x |
| 外部 Selected LTM PE（畫面四捨五入） | 8.2x | 33.4x |
| 外部 LTM PE 分支結果 | 472.93 | 2,125.35 |
| 外部 Selected Forward PE（畫面四捨五入） | 5.5x | 18.4x |
| 外部前瞻歸母淨利（百萬元） | 29,139 | 64,921 |
| 外部 forward PE 分支結果 | 373.86 | 2,141.71 |

- 外部 PE 採用 LTM／forward 兩分支平均。創見畫面結論 423.39，與 `(472.93 + 373.86) / 2` 的差僅顯示精度；智邦畫面結論取整顯示 2,134。**不要反推未公開精確倍數或把四捨五入誤差當程式錯誤。**
- 兩頁 Financials 均標明 Latest Fiscal Year=Dec-25、LTM=Jun-26；forward 使用 **Two Fiscal Years Forward（2027 財年）**。創見 FY2026 淨利 45,699M 與 FY2027 29,139M 不同；智邦分別為 47,434M 與 64,921M。這不是 NTM，也不能以目前 EPS 直接取代。外部數值只能作本次比較，尚無可持續授權的自動共識資料 feed。
- 創見 peer 範圍包括記憶體相關企業；本站大類 PE 的 148 筆中心卻落在宏觀／台積電。外部 peer median 9.8x、historical median 15.5x，selected 8.2x 也不等於任一中位數。只有改用同業中位數仍不等於原廠模型。
- 智邦外部 peer 含廣達、光通訊、啟碁及 NVIDIA；本站「通信網路業」會排除廣達與境外公司，啟碁在本次 capture 財報不足。本站 PB 2.0961x 對出 258.92，是五模型平均的重要下拉項；外部 PB 模型約 1,946。沒有證據可直接把產業 PB 乘任意係數修正。
- 本站兩股的乘除、五模型平均與輸入 hash 可重現；NI／期末股數與供應商稀釋 EPS 只差 +0.051%／−0.535%，不是主要落差。**本輪未修改估值倍數，十檔誤差統計仍是上節的研究結果。**

智邦官方核對（2025 FY＋2026 H1−2025 H1）：營收 310,622.779M、歸母 NI 35,576.883M、D&A 2,345.024M、CFO 13,091.212M、CapEx 7,043.064M、FCF 6,048.148M 皆吻合凍結输入。營業利益官方 42,492.947M，供應商 42,476.088M，差約 0.04%；即使改正也不足以解釋千元以上 FV 差距。H1 存貨及應收占用使現金流降低，不等於淨利輸入錯誤。

其 cash 欄位實際包含現金＋短期金融投資，共 43,407.340M，不能再把相同流動投資加一次。非流動金融／權益法投資合計 2,693.202M，約 4.82 元／股；尚須辨識營運用途，亦遠不足以解釋大型差距。FVOCI 處分利益轉保留盈餘而非當期 EPS，不能補入淨利。

來源：[創見 PE](https://hk.investing.com/pro/TWSE:2451/models/pe-multiples)、[智邦 PE](https://hk.investing.com/pro/TWSE:2345/models/pe-multiples)（需訂閱）；[智邦 2026 H1 官方財報](https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=A&co_id=2345&filename=202602_2345_AI1.pdf) p5–10、16–17、28、30–31、35；[智邦 2025 年度官方財報](https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=A&co_id=2345&filename=202504_2345_AI1.pdf) p9–13。

## 第二輪的必要資料隔離修正

- 已確認 11 筆每股口徑待覆核個股都有有效 9/18 報價，但舊失敗邊界連已取得 OHLC 都丟掉。本輪把 quote 與 financial 可用性分開：保留有來源／日期／身分驗證的 history，不建立假 EPS／零價 Stock。
- 財報不可用者 `/api/valuation` 仍 422、不進估值榜；`/api/price-history` 可回傳真實 K 線。符合既有流動性條件者可進純技術掃描，FV/upside 為 null，UI 中性顯示待覆核；美股財報缺漏且无法確認市值門檻時仍不列技術榜，不臆造股數。
- `detectValueTrendResonance` 原本缺少估值會預設 +20%，本輪改為 null／undefined／非有限值時不產生價值共振。純 K 線判斷不變。
- 技術結果不再依估值 upside 排序，各市場按代碼取最多 125 筆後交錯，避免台股占滿 250 筆而遮蔽美股；各型態 20 筆顯示上限保留，**這不是預期報酬高低的技術排名**。
- 沒有變更 D1 schema、既有 project、網址或存取權限。研究版核心 `tw-comparables-v1` 仍未接入正式 collector。
- 範圍限制：本輪處理個股財報失敗的 partial generation；原先整批最低財務覆蓋／原子切換門檻保留，未把全市場財報服務中斷改判為成功。

## 程式範圍與下一步

- `company-classification.ts`：共用金融分類，不把板別當產業。
- `daily-refresh-data.ts`：年度 EPS 負值／零保留、分段合併／衝突拒絕、TWD/12M/年末限制、平均權益 ROE、營業 EBITDA、明確單位及每股口徑校驗。
- `taiwan-comparables.ts`：同日／同產業、至少五個獨立同業、逐模型異質性檢查、完整來源日期／群組驗證、現金／負債／NCI 橋接。
- `valuation.ts`：`tw-comparables-v1` 是 **audit-only opt-in**。不得在呈現／API／排序接線完成前加入正式 collector。只比較可追溯相對估值，不將缺少前瞻輸入的歷史 DCF／DDM 外推混充外部模型。
- `valuation-calibration.ts`：目前每日台股回傳原生結果與真實信心；新版本未訓練，精度指標為 null，不沿用舊 4.42% 數字。
- `taiwan-valuation-evidence.ts`：共用年度證據清理及 target／peer 一致的資格判斷；重複年、衝突、無效或過舊日期不增加 historyCount。相關 PE/PS 與 EV 變體不增加獨立資訊群數或製造窄信心區間。
- 未完成：更細的業務可比群組（例如 EMS 與其他電腦企業、記憶體模組與廣義半導體）；前瞻盈餘／現金流來源；獨立 holdout；nullable 呈現與排名／技術價值共振一致性；完整發布驗證。
- 不要只把 `valuationPolicy` 塞進 collector：模型不足時 raw FV=0 只是內部不可用值，若 UI／SQL 未先處理會變成錯誤 -100% 高估榜。純技術訊號應保留，只有價值判斷需可靠性。

## 後續資料來源檢查結果

- 官方價值鏈 [D000](https://ic.tpex.org.tw/introduce.php?ic=D000)／[F000](https://ic.tpex.org.tw/introduce.php?ic=F000) 在半導體及電腦週邊 303 個有資料標的中覆蓋 292 個（96.37%），但不是估值同業已足夠的證明。D160「記憶體控制 IC」只有三家當期上市櫃公司（3259、6485、8299），不足五個 peer，不應強配全部 IC 設計。DA00「IC 模組」和 F500「記憶體」包含不同業務，亦不能整包作創見同業。
- 官方基本資料 JSONP 有 MAIN_BUSINESS1/2/3，抽查 9/9 可取，但和碩為法定營業項目，仍須公司 IR 主業資料佐證 EMS。JSONP 只能抽取 JSON，不執行 JavaScript。
- 現有台股程式沒有 analyst forward EPS；TWSE／TPEx 財測資料是少數公司自行申報，不是分析師共識。Twelve Data 官方 [2330 analysis](https://twelvedata.com/markets/655047/stock/twse/2330/analysis) 及 [earnings estimate 文件](https://twelvedata.com/docs#earning-estimate) 證實來源存在，但授權、consensus as-of、財年末、EPS 幣別及 basic/diluted 仍待驗證。沒有購買方案或聲稱已接線；不以歷史 EPS 外推冒充前瞻資料。
- EV 橋接仍缺非營業投資的可驗證分拆：和碩外部模板另有 Investments & Other 67,995 百萬元，不能用未知口徑的 Yahoo 金融資產直接代替，也不能忽略後宣稱完整對齊。

## 主要來源

第二輪提交前驗證：`npm test` **297/297**（含 build／artifact 驗證）通過；ESLint **0 errors、9 個既有 warnings**；`npx tsc --noEmit` 通過。另有獨立相關程式審查與 44/44 針對性測試。十檔重播差距未變；這是程式驗證，不是估值準確率驗證。`/technical` 本機 HTTP 200 且 HTML 包含 Rev. 2026.09.20.4；未做完整互動式瀏覽器 QA。本輪未儲存 Sites version／未部署；正式 Sites 已重新讀取，仍為 active、latest version 81、custom owner-only（1 位使用者、0 群組、0 外部訪客），正式 revision 仍 Rev. 2026.09.20.2。

Sites 統一 `build-site.mjs` 在 PowerShell 與 Git Bash 均因 Windows npm shim 尋找專案下不存在的 `node_modules/npm/bin/npm-prefix.js`／`npm-cli.js` 失敗；没有修改 plugin 或安裝額外套件掩蓋。專案既有 `npm test → npm run build → build-verified.sh` 使用 Git Bash 已成功產生並驗證 Sites 相容 Worker artifact；兩者結果分別記錄。此建置工具問題不是 Sites 權限不足，也不代表 deployment 曾開始。

- [外部公允價值公開方法](https://www.investing.com/blog/know-the-best-timing-to-buy-or-sell-with-investingpros-fair-value-323)：多模型平均、產業適用性及假設檢查；不是全部公司固定同模型。
- [外部資料及假設說明](https://www.investing-support.com/hc/en-us/articles/5921093968657-InvestingPro-s-Fair-Value)：S&P Global 資料、可用時採分析師預估。
- [吉祥全 P/E 模型（需訂閱）](https://hk.investing.com/pro/TWSE:2491/models/pe-multiples)、[群聯 P/E（需訂閱）](https://hk.investing.com/pro/TPEX:8299/models/pe-multiples)、[美好證（需訂閱）](https://hk.investing.com/pro/TPEX:6021)。僅記錄必要比較事實，不複製付費完整模板或持股內容。
- [育富官方 2026 Q2](https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=A&co_id=6194&filename=202602_6194_AI1.pdf)：印刷頁 28（千股）、37（EPS）。
- [育富官方 2025 年報 iXBRL](https://mopsov.twse.com.tw/server-java/t164sb01?step=1&CO_ID=6194&SYEAR=2025&SSEASON=4&REPORT_ID=C)。
- [吉祥全官方 Q2 iXBRL](https://mopsov.twse.com.tw/server-java/t164sb01?step=1&CO_ID=2491&SYEAR=2026&SSEASON=2&REPORT_ID=C)。
- [群聯官方 2Q26 法說](https://www.phison.com/wp-content/uploads/2026/08/2Q26_Phison-Earnings-Call_EN_Official_uploaded-version.pdf)：投資利益與存貨跌價影響需與本業區分。
- [Damodaran：企業價值轉股權價值](https://pages.stern.nyu.edu/adamodar/New_Home_Page/littlebook/valuepershare.htm)：合併現金流需扣除非控制權益市場價值；帳面近似有局限。
- [Damodaran：估值倍數與基本面](https://pages.stern.nyu.edu/adamodar/New_Home_Page/littlebook/multiples.htm)：銷售倍數受利潤率影響；不支持任何固定「2 倍」通用標準。
- [和碩外部 EV／營收模型（需訂閱）](https://hk.investing.com/pro/TWSE:4938/models/revenue-multiples)：已核對 LTM／forward 分開、selected multiple 不等於 peer median、投資資產及股權橋接差異。
