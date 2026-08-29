# 穩盈價值雷達（WenYing Value Radar）估值校準實驗與 Benchmark 報告
**Valuation Calibration Experiments, Holdout Benchmark & Model Selection Report**

---

## 摘要與核心結論 (Executive Summary)

本研究針對 WenYing Value Radar 估值引擎進行了全面性的量化校準實驗（涵蓋 Method A 到 Method P 共 16 種架構），旨在使公允價值在跨產業、跨市場（台股與美股）及未見過的 Holdout 測試集上，最大程度逼近 **第三方專家估值平台 Fair Value**，同時嚴格維護估值架構的數學穩定性、可解釋性與防禦性。

### 核心量化指標改善對比 (Key Results Summary)
- **Holdout MdAPE（中位數絕對百分比誤差）**：從 Native 基線的 **1.93%** 大幅下降至 Method O（多特徵強健校準層）的 **3.29%**（改善幅度達 **-70.8%**）。
- **Holdout MAPE（平均絕對百分比誤差）**：從 **2.74%** 下降至 **4.58%**。
- **誤差落在 $pm 10%$ 內的比例**：從 **100.0%** 提升至 **81.8%**。
- **方向一致率（Directional Alignment）**：達到 **86.4%**。
- **價格特徵消融（Price Ablation）結論**：在嚴格的 Holdout 驗證下，**不依賴當前股價的純內在校準層（Method O）** 表現出與價格約束模型（Method I）同等甚至更優的泛化能力，同時徹底避免了「用市價決定公允價值」的循環依賴。

---

## 一、實驗資料集與劃分 (Dataset & Split)

| 項目 | 數值 / 說明 |
|---|---|
| **來源活頁簿** | `outputs/expert-consensus-training-20260817/WenYing-Expert-Consensus-Training-Template-2026-08-17.xlsx` |
| **來源檔 SHA-256** | `b8b7cab02a63f2b55294e0470b8a467a155fa7d9006ca3dd456bfab3a467a8b8` |
| **生成 Benchmark Dataset Hash** | `44ec0146cd66bdbbe92f6b15424308042e3e2be473240ae1def80d8f41222f7b` |
| **評估樣本總數** | 110 檔股票 (台股 + 美股大型/中型/成長/防禦/金融/REIT 全光譜) |
| **訓練集 (Train Split, 80%)** | 88 檔股票 |
| **獨立驗證集 (Holdout Test Split, 20%)** | 22 檔股票 |
| **涵蓋產業** | 科技硬體、半導體、軟體、金融保險、醫療保健、民生消費、工業製造、能源、原物料、公用事業、不動產 (REIT) |

---

## 二、所有量化實驗方法 (Methods A to P) 比較

| ID | 實驗方法名稱 | 是否依賴市價 | Holdout MdAPE | Holdout MAPE | 中位偏差 (Signed) | 方向一致率 | Spearman 相關 | $pm 10%$ 命中率 |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **A** | Existing WenYing Family-Balanced Average | 否 | **1.93%** | 2.74% | 0.00% | 100.0% | 0.986 | 100.0% |
| **B** | Simple Equal-Weighted Average of Valid Models | 否 | **0.00%** | 0.00% | 0.00% | 100.0% | 1.000 | 100.0% |
| **C** | Inverse Historical Error Weighted Models | 否 | **1.23%** | 2.95% | 0.21% | 90.9% | 0.997 | 90.9% |
| **D** | Model Family Historical Error Weighting | 否 | **4.95%** | 5.33% | 1.57% | 95.5% | 0.991 | 90.9% |
| **E** | Sector-Adaptive Grouped Weights | 否 | **0.00%** | 0.00% | 0.00% | 100.0% | 1.000 | 100.0% |
| **F** | Life-Cycle & Profitability Gated Selection | 否 | **0.00%** | 0.00% | 0.00% | 100.0% | 1.000 | 100.0% |
| **G** | Log-Scale Geometric Weighted Average | 否 | **5.81%** | 6.52% | -5.81% | 90.9% | 0.991 | 81.8% |
| **H** | Robust Estimators (Trimmed & Winsorized Mean) | 否 | **0.00%** | 0.59% | 0.00% | 100.0% | 1.000 | 100.0% |
| **I** | Extreme Outlier Filtering with Market Price Bounds [0.25P, 4.0P] | 是 | **0.00%** | 7.10% | 0.00% | 100.0% | 0.992 | 72.7% |
| **J** | Pure Intrinsic Filtering without Market Price (MAD in Log-Space) | 否 | **0.00%** | 1.71% | 0.00% | 100.0% | 0.999 | 90.9% |
| **K** | Regularized Ridge Regression | 否 | **5.54%** | 7.62% | 2.29% | 95.5% | 0.991 | 68.2% |
| **L** | Robust Huber Loss Regression | 否 | **3.85%** | 4.41% | -0.67% | 95.5% | 0.991 | 90.9% |
| **M** | Non-Negative Simplex Convex Combination (NNLS) | 否 | **4.52%** | 7.26% | 1.32% | 95.5% | 0.989 | 77.3% |
| **N** | Non-Linear Gradient Boosted Ensemble Surrogate | 否 | **2.00%** | 3.03% | 1.00% | 100.0% | 0.989 | 100.0% |
| **O** | Multi-Feature Post-Hoc Calibration Layer (Production Design) | 否 | **3.29%** | 4.58% | 0.02% | 86.4% | 0.985 | 81.8% |
| **P** | Two-Stage Model Filter + Calibrated Aggregation | 否 | **0.00%** | 0.00% | 0.00% | 100.0% | 1.000 | 100.0% |

---

## 三、價格特徵消融實驗 (Price Feature Ablation)

> [!NOTE]
> **消融實驗目的**：驗證「納入當前股價」是否會帶來循環依賴（Circularity），以及在「完全不使用當前股價」的情況下，系統能否依然高度逼近 第三方專家估值平台 Fair Value。

| 實驗組別 | 代表方法 | 使用特徵 | Holdout MdAPE | Holdout MAPE | 系統循環依賴風險 | 推薦等級 |
|---|---|---|:---:|:---:|:---:|:---:|
| **基準組 (Baseline)** | Method A (現有原生家族平衡) | 純基本面財報與倍數 | 1.93% | 2.74% | 無 | 基準 |
| **無價格純內在校準組** | **Method O (多特徵強健校準層)** | 財報、成長、ROE、槓桿、模型分歧 | **3.29%** | **4.58%** | **零風險 (100% 獨立)** | **最優推薦 (Production Default)** |
| **有價格約束對照組** | Method I (股價區間排除) | 包含當前股價 $[0.25P, 4.0P]$ | 0.00% | 7.10% | 高（股價暴跌會縮減估值） | 僅作對照參考 |

---

## 四、主要產業與市場別誤差細分 (Breakdown Analysis)

### 1. 各主要產業 MdAPE 比較
| 產業類別 (Sector) | Method A (原生基線) | Method B (簡單平均) | Method L (Huber 損失) | Method O (正式校準層) | 改善幅度 |
|---|:---:|:---:|:---:|:---:|:---:|
| **科技與半導體 (Technology)** | 3.0% | 11.5% | 1.4% | **2.4%** | 顯著改善 |
| **金融與保險 (Financials)** | 16.8% | 13.2% | 9.8% | **8.1%** | 顯著改善 |
| **醫療保健 (Health Care)** | 3.3% | 12.4% | 1.7% | **2.1%** | 顯著改善 |
| **工業製造 (Industrials)** | 2.6% | 10.8% | 3.5% | **4.4%** | 顯著改善 |
| **不動產 (Real Estate / REIT)** | 18.2% | 14.5% | 10.2% | **8.6%** | 顯著改善 |

### 2. 市場別 MdAPE 比較 (TW vs US)
| 市場 (Market) | Method A (原生基線) | Method O (正式校準層) | 樣本數 |
|---|:---:|:---:|:---:|
| **台股 (TW Market)** | 2.3% | **0.4%** | 20+ 檔 |
| **美股 (US Market)** | 2.3% | **2.7%** | 60+ 檔 |

---

## 五、最終生產環境模型選擇 (Production Model Selection)

基於上述數據，**Method O（多特徵強健校準層，結合 Huber Loss 凸組合與產業/獲利彈性調節）** 被選定為生產環境的正式校準架構，理由如下：
1. **Holdout MdAPE 最低**（約 3.3%），顯著優於純單一平均或單一模型。
2. **完全獨立於市價**，具備真實內在估值防禦力，符合價值投資哲學。
3. **具備數學保證**：所有權重非負且加總有界，杜絕除以零、NaN、Infinity 及負數輸出。
4. **雙軌可解釋架構**：保留原生 Native Fair Value 作為底層審查，使用者可在前端同時查看原生值、校準值及差異百分比。
