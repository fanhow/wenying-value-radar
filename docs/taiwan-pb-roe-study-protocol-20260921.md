# 台股 P/B：已報告 LTM ROE 分層研究事前規格

鎖定：2026-09-21 00:17:40 UTC（更正初稿誤填的預估時間）；結果揭露前固定。研究工具，**不接入正式估值／排行**。

## 問題及可回答範圍

現行 P/B 使用同產業市場倍數中位數，未區分盈利能力。本次只檢驗：加入已報告 LTM ROE 區間，是否更能解釋同一時點、未參與同業中位数估計的公司市場 P/B。**市場價格不是公允價值真值**；本研究不能證明內在價值、投資績效、前瞻 ROE 或複製外部選定倍數。

[CFA Market-Based Valuation](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/market-based-valuation-price-enterprise-value-multiples) 說明 ROE、股權要求報酬及會計因素與 P/B 的關係。[CFA Residual Income Valuation](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/residual-income-valuation) 使用未來預期收益／ROE；本站目前沒有這些已核證前瞻輸入。以下 ROE 桶是待測研究假設，不是 CFA 指定參數。

## 凍結與邊界

- 檔案：`outputs/taiwan-model-audit/operating-v2/inputs.json`；原始位元組 SHA-256 `43c2bca489c504ededead8c4f25f0b560d8b78a609537e85eb2184ef4b905c1a`。2026-09-20 擷取；報價 2026-09-18。不得覆寫原始 inputs／comparison。
- 使用 ready 的 TW 普通股，沿用 TWD、LTM、有效報價／財報日、財報 age 0–180 日、正價格／期末普通股股數、市值至少 TWD 10 億、正 BVPS、有效非空產業。僅 `roeBasis=parent-income-average-equity` 且有限值的 `roe`；ROE 單位為百分點。缺值不當零，期末權益 ROE 不混入。
- 財務公司整批排除本輪（使用既有 `isFinancialCompany`），不能與非金融混合，也不能將本輪結果推及銀行、保險、金控或證券。
- 同業要求同報價日、**同財報截止日**、同 ROE basis。研究 A 因上述共通限制不是 production 原算法的精確重播。
- 名稱／代碼／資料重複處理：四碼 issuer ticker 身分唯一；重複 ticker 直接拒絕整次研究，不靠輸入順序選第一筆。ready record identity 必須與 stock identity 一致。
- 本研究沒有歷年 ROE 序列。「LTM ROE」是 backward-looking，非多年平均。`epsHistory` 只作獨立描述，不能影響分群或結果取捨。
- 分開兩個 panel：primary 固定 accounting industry；secondary 僅限已有有效官方 business group 的公司，以 registry group 分層。各自報數，不混成一個績效。無效的 explicit group reference 前置排除；secondary 不足五家不得回落廣義產業。沿用凍結時的 `2026-09-20-memory-v1` registry，研究期間不擴充。不利用正在研究的 PCB 候選選取／調整樣本。group key 加 `industry:`／`business:` namespace。現有 memory 成員已在 discovery exclusion，secondary 可能沒有可用樣本，照實回報。

## 固定 discovery exclusion 與 split

已個別核對的案例不作本輪 train 或 holdout：

`1102,1580,2344,2345,2382,2451,2491,2610,3036,3135,3260,3413,3484,3592,4915,4938,4967,4973,6021,6176,6279,6669,8069,8088,8183,8213,8271,8277,8299`。

其他 issuer 以 `SHA256("wenying-pb-roe-v1|TW|" + ticker)` 的前 8 個 hex 字元（無號整數）mod 5 決定：0 為 holdout，1–4 為 train。這是四碼普通股 ticker-proxy split，沒有獨立法律實體 ID，不能宣稱完整排除跨證券／集團關聯。固定 seed，不以結果重新切分。A/B 的 median、樣本数、IQR **只用 train**；holdout 公司及 discovery 公司一律不進 peer pool。目標自身永遠排除。

此前整體 cohort 已被讀取／作全市場統計，因此此為新規格的「issuer 留出研究」，不是未被接觸的盲測、跨時間驗證或正式 point-in-time 回測。歷史財報原始公布時間不完整，不能聲稱排除了所有歷史資訊偏差。

## 固定 A/B 定義

- A：同 industry/business group、同日期、同 basis 的 train P/B 中位數。
- B：A 條件再要求相同 LTM ROE 區間：`<=0`、`(0,5]`、`(5,10]`、`(10,15]`、`>15`。使用百分點，邊界不得因結果調整。
- peers 的市場 P/B=`price/bvps` 必須 `>0 && <=30`；至少 5 個不同 issuer。沿用既有 IQR gate：排序後 Q1=index floor((n-1)*.25)，Q3=index ceil((n-1)*.75)，Q3/Q1<=4 才輸出中位數，否則棄權。
- holdout 自己的市場 P/B 只用於計算評估誤差，不傳入 median、bucket 或任何調整係數。target 市值 gate 沿用既有可交易性範圍並明確揭露；不因 target P/B>30 剔除誤差案例。ROE 不含目標市場價格。
- 不用 frozen `comparableMultiples`、`current`／`candidate`、`targetPb`、外部 FV、外部選定倍數、PE、PS、EPS 趨勢或未核證預測調參；全部 train PB 由 raw price/bvps 重建。不把 B 接入引擎。已看過的五檔（8213／8183／3592／6176／1580）可獨立展示診斷，但不能混入 holdout 成效統計；診斷只能是上述固定 discovery exclusion 的子集。

## 必須同時報告的結果

1. 全部 records／ready／共通 eligible／排除原因／discovery／train／holdout 數，輸入與 protocol／script SHA。
2. A、B 各自 coverage、棄權率（分母為 eligible holdout），共同 coverage、A-only、B-only、neither；保留所有 holdout 逐檔結果、原因和 peer ids。B 子群可通過 A 整群未通過的 IQR，因此 B-only 可以合法出現，不強制 B coverage 為 A 的子集。
3. **主要比較只用共同有值樣本**：A/B 的 mean、median `abs(log(predictedPB/observedPB))`、逐檔 paired 差值 `B_error-A_error`，改善／惡化／不變家數。
4. 每產業／business group 與每 ROE 桶同樣報 denominator、coverage、paired 統計，不只挑改善族群；非正 ROE 桶另列零與負值數。不增加資料後挑選最好門檻；本輪不宣稱統計顯著性。
5. train 不列作主要效果，無共同coverage時數值回 null，不回零。coverage 損失不能被較小共同樣本誤差掩蓋。

## 實作／驗收

僅新增 research script 與 synthetic tests，不修改 `lib/valuation.ts`、正式 selector、production data 或前端。CLI 可讀 frozen bytes 並印出結果，無網路、無資料檔覆寫。實跑前主代理確認 protocol 固定。

測試至少涵蓋：missing/NaN/null ROE；平均／期末 basis 隔離；負值與 0/5/10/15 邊界；holdout/discovery 不入 peers；target 價格改動（維持 eligibility）不改 predicted PB；不到五家／IQR 異常棄權；duplicate 拒絕；同業/日期/group 無效隔離；輸入重排結果不變；common coverage/error null handling。

如果 B 較好，仍需獨立來源/跨期/族群覆蓋研究才能建議正式改動；若變差或失去過多 coverage，完整保留負結果，不換 seed 或繼續掃門檻。
