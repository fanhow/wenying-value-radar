# 台股公允價值對齊：第一輪根因與未發布研究

狀態：進行中，**不是已完成對齊／已上線聲明**。基底 Git `74660c3d03ebdd99be42553ce15da8f776a7905c`；原有 Sites project／網址／owner-only 存取不變。

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

提交前驗證：`npm test` **292/292**（含 Sites build／artifact 驗證）通過；ESLint **0 errors、9 個既有 warnings**；`npx tsc --noEmit` 通過。這是程式驗證，不是估值準確率驗證。本輪未儲存 Sites version／未部署；正式 Sites 仍為 active、latest version 81、custom owner-only（1 位使用者、0 群組、0 外部訪客）。

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
