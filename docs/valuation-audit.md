# 穩盈價值雷達（WenYing Value Radar）估值引擎全方位審視報告
**Valuation Engine Audit & 第三方專家估值平台 Methodology Comparative Analysis**

---

## 摘要 (Executive Summary)

本報告對「穩盈價值雷達（WenYing Value Radar）」現有估值架構進行全面性的量化審查，並與 **第三方專家估值平台 Fair Value**（包含其 14–17 種獨立估值模型、極端值排除機制、產業適配規則及不確定性區間計算）進行系統性對照。

審查發現：
1. **模型覆蓋度與架構完整性**：WenYing 已具備 13+ 項核心模型（DCF 家族、倍數家族、資產與剩餘收益家族、股利折現家族及基金持股層），已能覆蓋多數標準型企業。
2. **與 第三方專家估值平台 估值差異的核心根源**：
   - **終值退出法（Terminal Exit Multiples）的基準差異**：第三方專家估值平台 採用多組特定產業截尾倍數（EBITDA Multiple, Revenue Multiple, Gordon Growth），WenYing 原先對於無獨立同業倍數時的 Heuristic 預設較保守。
   - **負債調節（Net Debt Adjustment）的次數與處理方式**：Enterprise Value 模型在扣除淨負債（Net Debt）時，對於現金充裕但負債極低的輕資產科技股（如 AAPL, MSFT）易產生溢價或折價偏離。
   - **週期股與獲利低谷（Cyclical Trough）的正常化處理**：WenYing 內建了歷史中位數 EPS 正常化（`normalizeEarningsPerShare`），而 第三方專家估值平台 主要依賴多模型分散（如 EV/Sales、P/B）來平滑週期。
   - **聚合機制（Aggregation Mechanism）**：第三方專家估值平台 採用有效模型的截尾均值（Trimmed / Filtered Mean），而 WenYing 原先採用家族平衡加權（Family-Balanced Average）。
3. **建議改進架構**：建立純粹、可重現的 **第三方專家估值平台 Calibration Layer（校準層）**，採用強健的 Huber-Loss / Non-negative Simplex 凸組合優化，同時保留內部 Native Fair Value，並在前端提供雙軌對照、校準信心及 OOD（分布外）預警。

---

## 一、現有估值模型完整盤點 (Model Inventory)

| 模型 ID | 模型名稱 | 模型家族 (Family) | 類別 (Category) | 適用條件 | 主要輸入 | 核心計算公式 | 預設假設 | 排除條件 (Exclusion Rules) | 預設權重 | 與 第三方專家估值平台 差異 | 偏高／偏低風險 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `pe` | 本益比法 | `earnings-relative` | `relative` | EPS > 0, Target PE > 0, 非 REIT | 正常化或報告 EPS, Target PE | $\text{Fair Value} = \text{EPS} \times \text{Target PE}$ | Target PE 由成長率與 ROE 啟發式推導 (8–48x) | EPS $\le 0$, Target PE $\le 0$, 或 REIT | 家族均分 | 第三方專家估值平台 採用同業中位數與歷史 PE，WenYing 結合基本面啟發式與六大基金分位數 | 成長減速時易偏高；週期谷底時若未正常化易偏低 |
| `pe-peer` | 同業本益比法 | `earnings-relative` | `relative` | EPS > 0, 同業筆數 $\ge 5$, 非 REIT | EPS, 同業截尾中位數 PE | $\text{Fair Value} = \text{EPS} \times \text{Peer PE Median}$ | 5%–95% 截尾中位數 | 同業有效樣本 < 5, 或 REIT | 家族均分 | 均採同業中位數，但同業樣本庫範疇與市值門檻不同 | 產業整體泡沫時同業倍數偏高 |
| `p-ffo` | P/FFO 不動產估值法 | `earnings-relative` | `relative` | REIT 標的, FFO/AFFO > 0, P/FFO > 0 | FFO/AFFO per share, Target/Peer P/FFO | $\text{Fair Value} = \text{FFO} \times \text{P/FFO Multiple}$ | 同業或明確指定 P/FFO (1–60x) | 非 REIT, 或缺少 FFO/AFFO 資料 | 家族均分 | 第三方專家估值平台 在 REIT 專屬使用 P/FFO 與 NAV，排除一般企業 DCF | 若資本支出過高導致 AFFO 大減時易偏高 |
| `pb` | 股價淨值比法 | `asset` | `asset` | BVPS > 0, Target PB > 0, 非輕資產 (ROE < 25%) | BVPS, Target PB | $\text{Fair Value} = \text{BVPS} \times \text{Target PB}$ | Target PB 依 ROE 與成長率調節 (0.8–12x) | BVPS $\le 0$, 或高 ROE 輕資產公司 (ROE $\ge 25\%$) | 家族均分 | 第三方專家估值平台 針對金融股主要採 P/B 與 Gordon P/B；WenYing 排除輕資產科技股 | 景氣循環股淨值減損未反映時易偏高 |
| `p-sales` | P/S 同業倍數法 | `sales-relative` | `relative` | 營收 > 0, 同業 P/S > 0, 非金融/REIT | Revenue/sh, Peer P/S Median | $\text{Fair Value} = \text{Rev/sh} \times \text{Peer P/S}$ | 同業截尾中位數 P/S (上限 50x) | 金融業、REIT、或缺少 $\ge 5$ 筆同業 P/S | 家族均分 | 兩者均作為無獲利高成長股的重要參考 | 獲利率下滑但營收高增長時易偏高 |
| `p-fcf` | 自由現金流倍數法 | `cashflow-relative` | `relative` | FCF/sh > 0, Target FCF Multiple > 0, 非金融/REIT | 正常化 FCF/sh, Target FCF Multiple | $\text{Fair Value} = \text{FCF/sh} \times \text{Target Multiple}$ | Heuristic Target Multiple (8–32x) | 金融業、REIT、FCF $\le 0$ | 家族均分 | 第三方專家估值平台 採用同業 P/FCF；WenYing 結合槓桿與成長懲罰 | 資本支出週期變動劇烈時波動較大 |
| `dcf-fcf-5y` | 5 年折現現金流法 | `cashflow-dcf` | `intrinsic` | FCF/sh > 0, $r_e > g$, 非金融/REIT | FCF/sh, CAPM $r_e$, 起始成長 $g_0$, 永續 $g$ | $\sum_{t=1}^5 \frac{\text{FCF}_t}{(1+r_e)^t} + \frac{\text{FCF}_5(1+g)}{(r_e-g)(1+r_e)^5}$ | 成長率逐年線性收斂 (Fading Growth), CAPM 折現 | 金融、REIT、FCF $\le 0$, $r_e \le g$ | 家族均分 | 第三方專家估值平台 採用 5Y Growth Exit；兩者均折現 FCFE | 對折現率 $r_e$ 與永續成長率 $g$ 極度敏感 |
| `dcf-fcf-10y` | 10 年折現現金流法 | `cashflow-dcf` | `intrinsic` | FCF/sh > 0, $r_e > g$, 非金融/REIT | FCF/sh, CAPM $r_e$, 起始成長 $g_0$, 永續 $g$ | $\sum_{t=1}^{10} \frac{\text{FCF}_t}{(1+r_e)^t} + \frac{\text{FCF}_{10}(1+g)}{(r_e-g)(1+r_e)^{10}}$ | 10 年收斂至永續成長率 | 金融、REIT、FCF $\le 0$, $r_e \le g$ | 家族均分 | 第三方專家估值平台 核心基準模型之一 | 長期高成長假設若未收斂易嚴重偏高 |
| `ev-revenue` | EV／營收倍數法 | `enterprise-relative` | `relative` | 營收 > 0, EV/Rev > 0, 非金融/REIT | Rev/sh, EV/Rev Multiple, 淨負債 | $\text{Fair Value} = \text{Rev} \times \text{Multiple} - \text{NetDebt}$ | 獨立同業截尾中位數倍數 | 金融、REIT、缺少同業或營收 $\le 0$ | 家族均分 | 兩者均扣除 Net Debt | 高負債公司若倍數過低可能得出負值 (系統設有下限保護) |
| `ev-ebitda` | EV／EBITDA 倍數法 | `enterprise-relative` | `relative` | EBITDA > 0, EV/EBITDA > 0, 非金融/REIT | EBITDA/sh, EV/EBITDA Multiple, 淨負債 | $\text{Fair Value} = \text{EBITDA} \times \text{Multiple} - \text{NetDebt}$ | 獨立同業截尾中位數倍數 | 金融、REIT、EBITDA $\le 0$ | 家族均分 | 第三方專家估值平台 核心倍數模型之一 | 重資產折舊失真時可能有偏差 |
| `ev-ebit` | EV／EBIT 倍數法 | `enterprise-relative` | `relative` | EBIT > 0, EV/EBIT > 0, 非金融/REIT | EBIT/sh, EV/EBIT Multiple, 淨負債 | $\text{Fair Value} = \text{EBIT} \times \text{Multiple} - \text{NetDebt}$ | 獨立同業截尾中位數倍數 | 金融、REIT、EBIT $\le 0$ | 家族均分 | 第三方專家估值平台 輔助驗證模型 | 營運槓桿高時波動劇烈 |
| `dcf-ebitda-5y/10y` | EBITDA 退出 DCF | `operating-dcf` | `intrinsic` | EBITDA > 0, FCF > 0, 有負債與現金, 非金融/REIT | FCFF/sh 近似值, EBITDA/sh, WACC, EV/EBITDA | $\sum \frac{\text{FCFF}_t}{(1+\text{WACC})^t} + \frac{\text{EBITDA}_N(1+g)\times M}{(1+\text{WACC})^N} - \text{NetDebt}$ | WACC 資本結構加權, 同業 EV/EBITDA 終值倍數 | 金融、REIT、資料不全、EBITDA $\le 0$ | 家族均分 | 第三方專家估值平台 EBITDA Exit 採用分析師預估，WenYing 採公開歷史收斂 | 終值倍數過高時容易主導整體估值 |
| `dcf-revenue-5y/10y` | 營收退出 DCF | `operating-dcf` | `intrinsic` | 營收 > 0, FCF > 0, 有負債與現金, 非金融/REIT | FCFF/sh 近似值, Rev/sh, WACC, EV/Rev | $\sum \frac{\text{FCFF}_t}{(1+\text{WACC})^t} + \frac{\text{Rev}_N(1+g)\times M}{(1+\text{WACC})^N} - \text{NetDebt}$ | WACC 折現, 同業 EV/Revenue 終值倍數 | 金融、REIT、資料不全、營收 $\le 0$ | 家族均分 | 第三方專家估值平台 Revenue Exit 採用預估營收 | 利潤率低的商業模式易被營收倍數高估 |
| `epv` | 盈餘能力價值法 | `cashflow-dcf` | `intrinsic` | 成熟低成長 ($-5\% \le g \le 8\%$), 非輕資產, 非金融/REIT | 正常化 FCF/sh, 股權成本 $r_e$ | $\text{Fair Value} = \frac{\text{Normalized FCF}}{r_e}$ | 零成長前提, 資本支出與折舊平衡 | 成長中企業、輕資產高 ROE、金融、REIT | 家族均分 | 第三方專家估值平台 無直接等價 EPV，但有類似穩態模型 | 對高成長股會嚴重低估 (故設成熟度排除條件) |
| `roe-residual` | ROE 剩餘收益模型 | `residual-income` | `intrinsic` | BVPS > 0, EPS > 0, $\text{ROE} > r_e$, 非 REIT | BVPS, EPS, 股權成本 $r_e$, 永續 $g$ | $\text{BVPS} + \sum \frac{\text{EPS}_t - r_e \text{BVPS}_{t-1}}{(1+r_e)^t} + \text{Terminal}$ | 超額報酬逐年收斂至產業平均 | 虧損、$\text{ROE} \le r_e$、REIT | 家族均分 | 第三方專家估值平台 類似 Residual Income 模型 | 帳面淨值低估無形資產時偏低 |
| `graham` | Graham 防禦估值 | `asset` | `asset` | EPS > 0, BVPS > 0, 負債率 $\le 70\%$, 非輕資產 | EPS, BVPS | $\text{Fair Value} = \sqrt{22.5 \times \text{EPS} \times \text{BVPS}}$ | 經典 Graham 價值投資常數 22.5 | 輕資產、高負債、負獲利、REIT | 家族均分 | 第三方專家估值平台 未採用 Graham 公式 | 僅適用傳統防禦型工業股，現代科技股會嚴重低估 |
| `ddm-stable` | 股利折現模型 | `income` | `income` | 成熟公司, 股利 > 0, 配息率 20%–80%, $r_e > g+2\%$ | 股利, 股利成長率, 股權成本 $r_e$ | $\text{Fair Value} = \frac{D_1}{r_e - g_d}$ | 股利穩態成長 $g_d \le 4\%$ | 不配息、配息率極端、高成長、REIT | 家族均分 | 第三方專家估值平台 包含 Gordon Growth DDM 與 Multi-Stage DDM | 不配息的優質成長股會被自動排除 |
| `etf-inav` | 即時淨值法 | `fund` | `fund` | ETF 標的 | 即時淨值 (iNAV) | $\text{Fair Value} = \text{iNAV}$ | 無企業內在價值折現 | 一般個股不適用 | 100% | 第三方專家估值平台 亦以 NAV 作為 ETF 基準 | 溢折價劇烈時僅反映淨值 |

---

## 二、特殊產業與極端案例處理機制審查

### 1. 銀行與保險 (Banks & Insurance)
- **第三方專家估值平台 規則**：排除所有 FCF/FCFF DCF、EV/EBITDA 及營收倍數模型；主要啟用 P/B、P/E、DDM 與 Residual Income。
- **WenYing 現況**：
  - `isFinancialCompany` 檢查完整排除 `dcf-fcf-*`、`dcf-ebitda-*`、`dcf-revenue-*`、`ev-*`、`p-fcf` 與 `epv`。
  - 保留 `pe`、`pb`、`roe-residual` 與 `ddm-stable`。
  - WACC 自動設為 100% 股權成本（Debt weight = 0），避免將銀行存款與發行債券視為加權資本負債。
- **審核結論**：處理方向與 第三方專家估值平台 100% 一致。

### 2. 不動產投資信託 (REITs)
- **第三方專家估值平台 規則**：優先採用 P/FFO、P/AFFO 與 NAV 估值，排除常規 EPS P/E 與 EBITDA EV 倍數（因高額不動產折舊扭曲一般 GAAP 淨利潤）。
- **WenYing 現況**：
  - `reit` 識別旗標啟用後，自動排除 `pe`、`pb`、`p-sales`、`p-fcf`、`dcf-*`、`ev-*`、`epv`、`graham`、`ddm-stable`。
  - 當具備公開 FFO/AFFO 資料時，啟動專屬 `p-ffo` 模型。
- **審核結論**：符合行業標準與 第三方專家估值平台 邏輯。

### 3. 高成長與暫時虧損公司 (High Growth & Unprofitable)
- **第三方專家估值平台 規則**：當 EPS 或 FCF 為負時，自動排除 P/E、P/FCF、DCF FCF；保留 EV/Revenue、DCF Revenue Exit 及同業 P/S。
- **WenYing 現況**：
  - 輸入為負值時，`pe`、`p-fcf`、`dcf-fcf-*` 自動加入 `excludedModels`。
  - 若具有正向營收與同業 P/S，則啟用 `p-sales` 與 `ev-revenue`。
- **審核結論**：健全且符合穩健原則。

### 4. 高 ROE 輕資產公司 (Asset-Light High-ROE)
- **現狀**：排除 `pb`、`epv`、`graham`，避免淨值過小（如 AAPL BVPS 僅 4–5 美元）導致帳面價值模型將公允價值大幅拉低。
- **審核結論**：有效避免系統性低估。

---

## 三、聚合與異常值排除演算法審核

### 1. 模型極端值過濾 (`robustModelFilter`)
- **WenYing 現行公式**：
  - 計算所有適用模型公允價值的對數值：$y_i = \ln(V_i)$
  - 計算對數中位數 $\tilde{y} = \text{median}(y)$ 及中位數絕對偏差 $\text{MAD} = \text{median}(|y_i - \tilde{y}|)$
  - 判定閾值：$\text{Threshold} = \max(3.5 \times 1.4826 \times \text{MAD}, \ln(3))$
  - 偏離超過閾值者自動標記排除。
- **優點**：完全不依賴當前市場股價 $P$，純粹從內在模型群聚程度判定離群值，避免價格循環依賴。
- **與 第三方專家估值平台 差異**：第三方專家估值平台 在部分介面會排除偏離當前股價過遠（如 $>5x$ 或 $<0.2x$）的模型。此處將在實驗階段進行 Price Ablation 測試。

### 2. 模型家族平衡加權 (`Family-Balanced Average`)
- **機制**：將通過過濾的模型歸入 10 大家族（`earnings-relative`, `cashflow-dcf`, `operating-dcf`, `enterprise-relative` 等）。
- 每個有效家族權重為 $\frac{1}{N_{\text{families}}}$，家族內各模型平分該家族權重。
- **優點**：防止同時加入 5Y DCF 與 10Y DCF 導致 DCF 家族權重被重複計算放大。

---

## 四、校準層 (Calibration Layer) 設計建議

為達成「在不同產業、市場及未見過股票上盡可能貼近 第三方專家估值平台 Fair Value」，我們建議保留底層各模型計算的原汁原味，並在模型聚合與輸出端建立 **數學正則化校準層（Calibration Layer）**：

$$\hat{V}_{\text{calibrated}} = \mathcal{F}\left(V_{\text{native}}, \{V_{\text{model}}\}, \mathbf{X}_{\text{features}}\right)$$

其中特徵向量 $\mathbf{X}_{\text{features}}$ 包含：
1. 產業分類（Sector Encoding）
2. 營收成長率（Revenue Growth）
3. 獲利品質指標（ROE, Net Margin）
4. 資本槓桿（Debt Ratio, Net Debt / EBITDA）
5. 不確定性與模型發散度（Model Dispersion & Uncertainty）
6. 價格特徵（僅在 Price-aware 模式下作為消融對照組）

校準模型選用 **Huber-loss Regularized Convex Combination（強健正則化凸組合）** 與 **Non-negative Least Squares (NNLS)**，保證：
- 權重非負且加總為 1（保證數學插值有效性與可解釋性）。
- 無極端值爆炸、無 NaN/Infinity。
- 當輸入股票超出歷史特徵分布時，自動平滑退回原生 Native Fair Value 並發出 OOD 預警。
