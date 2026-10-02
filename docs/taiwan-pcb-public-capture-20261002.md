# 志超與 PCB 公開資料：固定有界擷取（2026-10-02）

在擷取財報與看倍數結果前，固定候選為 8213、5469、3044、2355、2367、2368、2313、2316、6191、4927，共十家。前六家公司沿用 `taiwan-pcb-business-evidence-20260921.md` 的官方年報證據與全部 scope／衝突限制；後四家先查官方業務頁，才列為擷取候選，不依價格、FV 或倍數增刪名單。

| 新候選 | 官方來源 | 可支持與限制 |
| --- | --- | --- |
| 2313 華通 | https://www.compeq.com.tw/product01.php | PCB 製造為主要業務，包含一般多層、HDI、HLC、FPC、Rigid-Flex；另有 SMT。不能稱為純裸板或與志超終端相同。 |
| 2316 楠梓電 | https://www.wus.com.tw/index.php/zh-tw/?lang=zh | 官方稱專業 PCB 製造，涵蓋工業、通訊、汽車、醫療等；未取得明示當期收入細分。 |
| 6191 精成科 | https://www.gbm.com.tw/ | 官方稱 PCB 產銷及 EMS；頁面營收例子為 2012 年，不能拿來當 2026 收入占比。 |
| 4927 泰鼎-KY | https://www.apex-intl.com.tw/about/group-history | 官方稱本公司及子公司主要為單面、雙面與多層 PCB 製造及銷售；未假定每個終端收入組合相同。 |

沒有納入 3715 定穎投控：搜尋到的 `dynamicpcb.com` 現在指向超穎電子，無足夠同一 issuer／控股合併範圍證據。沒有因其他平台 benchmark 就加入佳邦、致伸或其他非 PCB 主業。

本擷取是 **真實、有界、現時擷取的診斷樣本**，不是全市場、point-in-time backtest 或正式業務 registry。價格固定使用 2026-10-01；財報截止日與 provider as-of 股數直接來自既有 `fetchRefreshRecord`／`quarterlyInputs`，不補 metadata、不把最新價改標 10/1。所有候選成功、缺值與棄權都保留。

保存 Yahoo chart／timeseries、TWSE 基本資料／一般業季度資料與志超月成交表的 response body bytes、requested/final URL、HTTP status、擷取時間與 SHA256。僅使用公開未登入端點，無 cookie／token；只寫本機 ignored outputs。官方 current issued shares 是現況，季度 reference BVPS 是 P/B 專用口徑，均不得直接覆蓋供應商股數、EPS 或 SPS。

估值只呼叫原生 `buildTaiwanComparableMap`／`calculateStock`。仍需同 session／financial cutoff／share basis、各分支適用性、五筆有效 peers 與 IQR gate。十家候選不等於九筆可比觀察；PCB 大類不等於相同板種、終端或 EMS 範圍。不足則輸出棄權，不能以這個診斷 pool 宣稱正式 target price。

## 獨立記憶體流程：擷取前固定名單

PCB 十家公司保持全部結果，不加有利的新 peer。另開一份獨立 capture，完整採既有 `TAIWAN_BUSINESS_GROUPS` 的七家 memory registry（版本 `2026-09-20-memory-v1`）：2451、3135、3260、4967、4973、8088、8271。該 registry 的原官方年報證據、scope 與混合 EMS 限制保持不變；沒有按這次 FV 結果挑成員。

交易市場先以當次 TWSE 基本資料與 TPEx 官方上櫃股票目錄核對，不默認 TWSE。`withTaiwanBusinessGroup` 只用於分析副本；原 collector records、年度 EPS、股數與來源 body 不修改。每個 target 都須通過原生適用性與五家觀察 gate，所有成功／棄權保留。若沒有任何可算值，報告仍完整交付，不能放寬規則來創造正向案例。

## 實際擷取與原始資料重建

PCB capture 的 observedAt 為 `2026-10-02T08:01:25.309Z`；記憶體為 `2026-10-02T08:10:49.855Z`。前者 27 個、後者 19 個 response body 均為 HTTP 200。兩批共 17 家 `ready`，價格日期全部為 **2026-10-01**，財報截止日全部為 **2026-06-30**，普通股口徑全部為 `provider-as-of-ordinary`、shareAsOfDate 為 2026-06-30。這是 10/2 現時擷取所得的 10/1 價格與 6/30 財務資料；沒有核證每筆財報在 10/1 以前的實際公布時間，不能當成無未來資訊的歷史回測。

官方來源：

- TWSE 基本資料：https://openapi.twse.com.tw/v1/opendata/t187ap03_L
- TWSE 一般業季度資料：https://openapi.twse.com.tw/v1/opendata/t187ap07_L_ci
- 志超 2026 年 10 月日成交表：https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20261001&stockNo=8213&response=json
- TPEx 基本資料：https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O
- TPEx 上櫃股票目錄／當日行情：https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes
- TPEx 一般業季度資料：https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap07_O_ci

Yahoo 的每一條 chart／timeseries 完整 URL（包括 symbol、period1、period2、type）、最終 URL、retrievedAt、真實 body SHA256 與 bytes 長度均保存在各批 `captures.json`；原始 bytes 在 `raw/*.body`。raw 檔名是 URL 的 SHA256，**不是 body hash**，核對時應使用 manifest 的 `rawSha256`。官方季度金額單位沿用 9/21 官方帳面值 audit 的 MOPS UI 單位證據，不另猜單位。

離線 evaluate 先逐一核對 body hash，再以當時 observedAt 與官方目錄還原 targets，使用同一 `fetchRefreshRecord`／`quarterlyInputs` 從 frozen raw response 重新產生全部 records。重新產生的 JSON 必須與原 `inputs.json` 的 records 完整相等；查無原 URL 不會回退網路。PCB **10 records／27 bodies PASS**，記憶體 **7 records／19 bodies PASS**。分析副本才增加既有 business reference。

`verify-taiwan-public-source-replay.mjs` 另在 temporary copies 進行七項 regression：同時竄改檔案與 supplied input 的 EPS、價格、shareAsOfDate、observedAt、固定候選名單；只竄改 supplied input；只竄改 raw body。七項都拒絕，且原 inputs／manifest 不變。前五項不是僅比較兩份已處理值，而是強制由原始來源重建或核對固定 protocol。

## PCB 結果：不足同業時棄權

採 `tw-applicability-2026-10-02-v2`：PE 不要求 ROE 相容；非金融 PE 仍要求正 EPS、正營業／淨利率與 0.5–2 倍 margin 相容。PB 使用正的 parent-income-average-equity ROE 及 0.5–2 倍相容；非金融 PB 要求正營業利率。PS 使用相容的正淨利率／營業利率，且 NCI book ratio 必須已知且 ≤25%。所有分支均保持同報價日、同財報截止日、同股數口徑、至少五筆與原 IQR gate。

| 股票 | PE 有效 peers | PB 有效 peers | PS 有效 peers | 新原生試算 | 正式排名 |
| --- | ---: | ---: | ---: | --- | --- |
| 8213 志超 | 1 | 2 | 1 | 棄權 | 否 |
| 5469 瀚宇博 | 1 | 3 | 0 | 棄權 | 否 |
| 3044 健鼎 | 2 | 2 | 2 | 棄權 | 否 |
| 2355 敬鵬 | 1 | 2 | 1 | 棄權 | 否 |
| 2367 燿華 | 0 | 0 | 0 | 棄權 | 否 |
| 2368 金像電 | 1 | 1 | 1 | 棄權 | 否 |
| 2313 華通 | 2 | 2 | 2 | 棄權 | 否 |
| 2316 楠梓電 | 0 | 0 | 0 | 棄權 | 否 |
| 6191 精成科 | 2 | 2 | 1 | 棄權 | 否 |
| 4927 泰鼎-KY | 0 | 0 | 0 | 棄權 | 否 |

志超的 PE／PS 只剩敬鵬；PB 剩敬鵬、瀚宇博。其餘候選不因同為 PCB 就自動通過。瀚宇博的 NCI book ratio 38.14%，PS 棄權；楠梓電淨利率 61.09% 但營業利率 −11.14%，不把業外獲利當作營運利潤相容；燿華、泰鼎為負獲利。全部 EV 分支也因未具備可信的 EV bridge／不足觀察而沒有估值。這十家不足以產生志超新 FV，沒有以其他平台的 44.43 元補值，也沒有稱原先 103.16 元已被證明應改成某個精準數字。

志超股數／帳面值核對：

- 官方日成交表明示 115/10/01 收盤 **34.00**，與 collector 相同；該 body SHA256 為 `b916fcf8885ee8b00985bea632d75f61b297b11ba95c511f3070543a16a2c238`。
- 供應商 6/30 ordinary shares **264,352,500**，BVPS **64.2953102392**，SPS **73.1749122857**；EPS **1.96** 保留 provider 的 diluted EPS，沒有以單一股數強制重算。ROE **3.4297707542%** 來自 parent income／average parent equity，metadata 已存在。
- 官方 Q2 歸屬母公司權益 **16,996,626,000 TWD** 與 provider BVPS×provider shares 相符；官方 P/B reference BVPS **62.66**。供應商 BVPS 比 reference BVPS 高 **2.609815%**。
- 10/1 基本資料的 current issued ordinary shares **271,242,488**；不能直接當作 6/30 已驗證 outstanding shares，也不能把四捨五入的 62.66 反推出精確股數。該差異是獨立口徑風險，沒有被「母公司權益一致」解除。

## 記憶體結果：真實可算流程仍退出正式排名

七家全保留。官方上市／上櫃確認如下；本次沒有將 4967 錯標上櫃，也沒有將 3260、4973、8088 默認上市。

| 股票 | 市場 | PE/PB/PS 有效 peers | 可算模型 | 原生低信心試算（TWD） | 正式排名 |
| --- | --- | --- | --- | ---: | --- |
| 2451 創見 | TWSE | 0/4/0 | 無 | — | 否 |
| 3135 凌航 | TWSE | 5/5/5 | PE、PB、PS | 162.54 | 否 |
| 3260 威剛 | TPEx | 4/4/4 | 無 | — | 否 |
| 4967 十銓 | TWSE | 4/5/4 | PB | 349.33 | 否 |
| 4973 廣穎 | TPEx | 4/3/4 | 無 | — | 否 |
| 8088 品安 | TPEx | 1/0/1 | 無 | — | 否 |
| 8271 宇瞻 | TWSE | 4/5/4 | PB | 225.13 | 否 |

凌航 10/1 價格 **157.00**，6/30 LTM diluted EPS **24.08**、BVPS **51.7716875659**、SPS **176.1434058201**，parent-average ROE **74.6873051718%**，營業利率 **17.7762202107%**、淨利率 **14.1939726202%**。

- PE／PS 的五筆是 3260、4967、4973、8088、8271；PB 的五筆是 2451、3260、4967、4973、8271。沒有把各模型錯當同一 peer 集合。
- 原生選取中位倍數為 PE **5.1262433053**、PB **2.7074870643**、PS **1.2716867980**；模型值分別 **123.4399387911**、**140.1711743797**、**223.9992437371**，平均 **162.5367856360**。全精度保存在 evaluation，不以外部 FV 校準。
- 三個可算 targets 的 confidence 全部是 low，正式排名全部不合格，理由包括 `VALUATION_REVIEW_REQUIRED`、`LOW_VALUATION_CONFIDENCE`、`LOW_CALIBRATION_CONFIDENCE`。可算是流程覆蓋，不能解讀為估值準確性、可投資建議或正式推薦。
- 凌航供應商股數為 **89,721,491**、asOf 6/30；官方 current issued ordinary shares 為 **97,158,956**、基本資料出表 10/1。官方 Q2 reference BVPS **47.98**，與 provider BVPS 差 **7.902642%**。
- 官方凌航 Q2 raw 的「歸屬於母公司業主之權益合計」與「非控制權益」均空白；目前 parser 明確回報 `MISSING_OFFICIAL_PARENT_EQUITY`。raw 的權益總計 **4,645,033,000 TWD** 數字與 provider 股數×BVPS 相同，但不能自行將權益總計填成官方 parent equity。raw 另有預收股款約當發行 **7,087,465 股**與庫藏股 **350,000 股**；不能用 current shares 或 reference BVPS 混算來掩蓋股數差異。故這個正向真實流程仍是未完成官方股數／權益核證的研究試算。

## 同一有界 pool 的舊版／新版差異

root 另以 production commit `ccc6d1d08612edf051b1b552b445bb1301745068` 的原生 engine 和最終新 engine，輸入完全相同的這兩批 records、相同 business opt-in；不是拿新結果對齊外部目標價。

| 固定 cohort | 舊版可算 | 新版可算 | 舊版正式排名資格 | 新版正式排名資格 |
| --- | ---: | ---: | ---: | ---: |
| PCB 十家 | 7 | 0 | 2 | 0 |
| 記憶體七家 | 7 | 3 | 0 | 0 |

該 PCB baseline 的志超是僅 PE、43.6720593316；因只有這十家，**不能複現全 production pool 的 103.16**。記憶體凌航原生 161.0745639348 → 162.5367856360，不是所有 FV 都下降；其變動與其他樣本棄權皆是 coverage／規則效果，沒有價格真值或事後報酬證據可宣稱準確度提升。完整各股／各模型數值保存在 `outputs/local-validation/public-bounded-before-after.json`。

## 可重跑、可審核 artifacts

`outputs/` 是 ignored 本機產物；原始 body 不會跟隨一般 Git diff。交付時應保留整個資料夾，供下面完全無網路的 replay 使用。

| 批次 | inputs SHA256 | captures manifest SHA256 | evaluation SHA256 |
| --- | --- | --- | --- |
| `outputs/local-validation/pcb-public-20261002` | `fb2df45daba04743f54e443d8c1e6480540bd97b570d20f51d97e5cf0c20a9d1` | `a70f4e17cb716d8cb45e03a9eb6e8e189857deb6f58c3f678f0e1c2ca2034cb8` | `4f64f8d1b2119389045f0379125dad1f4c5589d4833c68bfab21a68cbcd493e5`（`evaluation-final-v2.json`） |
| `outputs/local-validation/memory-public-20261002` | `25055b6d31ef9929efd595d3495f4f9a12ea0a10ed9262960687e29d9e0422d8` | `945b8e6a545606000c4f1b812227c002f0c6f8dbe4c1b06bdc2ab55441ee9702` | `e27338aa33ba083b4858cd2439e0cc1070de56175e7fff094b18056a5657161c`（`evaluation-final-v2.json`） |

最終凍結 engine 再跑的 `evaluation-final-v2.json` 與前一版 evaluation 的 bytes hash 均相同；各版原檔皆保留。記憶體 durable regression 為 `source-replay-regression-final-v2.json`，SHA256 `1769b777026c778863f600a984d520df88bff59dde97e798e66ddf2adb7d9c60`，7/7 PASS，與原 `source-replay-regression-v1.json` 相同。各 evaluation 還保存當時五個 engine／collector 原始碼 hash，方便辨識後續實作造成的重算差異；protocol 固定，不要求後續 engine 版本產出相同 FV。

```sh
# 必須使用新的 output 檔名；腳本使用 wx，不覆蓋既有證據。
node --experimental-strip-types scripts/capture-taiwan-pcb-public.mjs \
  --replay-dir outputs/local-validation/pcb-public-20261002 \
  --out outputs/local-validation/pcb-public-20261002/evaluation-replay-NEW.json
node --experimental-strip-types scripts/capture-taiwan-pcb-public.mjs \
  --replay-dir outputs/local-validation/memory-public-20261002 \
  --out outputs/local-validation/memory-public-20261002/evaluation-replay-NEW.json
node --experimental-strip-types scripts/verify-taiwan-public-source-replay.mjs \
  --input-dir outputs/local-validation/memory-public-20261002 \
  --out outputs/local-validation/memory-public-20261002/source-regression-NEW.json
```

首次網路擷取另用 `--cohort pcb|memory --capture-dir NEW_DIRECTORY`，名單無任意 ticker 參數。公開端點若不可用就留下失敗／缺值，不使用登入或新增帳號。原生 EV filing／effective-share bridge、逐家公司同季股數與公布時間、細分 end-market／EMS segment 盈利、全市場 coverage 與真正歷史 date holdout 仍未完成；後四項 **NOT_RUN／資料不足**。這次 bounded 真實 sample 和固定 synthetic holdout 應分別解讀，不能合併成全市場準確性證明。
