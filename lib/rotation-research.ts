export type RotationProfile = {
  id: string;
  market: "TW" | "US";
  name: string;
  englishName: string;
  holdings: number;
  frequency: "monthly" | "quarterly";
  universe: string;
  limits: string;
  verification: "detail" | "overview";
};

export const RESEARCH_REVIEWED_AT = "2026-09-20";
export const METHODOLOGY_URL = "https://hk.investing.com/pro/propicks/methodology";
export const RATIONALE_URL = "https://www.investing.com/blog/propicks-ai-understanding-the-why-behind-every-stock-pick-335";
export const strategySource = (id: string) => `https://hk.investing.com/pro/propicks/${id}`;

// Public strategy specifications, not paid holdings or reconstructed ML weights.
// Overview-only profiles deliberately do not imply a complete eligibility filter.
export const ROTATION_PROFILES: RotationProfile[] = [
  { id: "taiwan-chip-champions", market: "TW", name: "台灣科技供應鏈", englishName: "Taiwan technology supply chain", holdings: 15, frequency: "monthly", universe: "台灣資訊科技：半導體、電子製造、零組件；中型與大型股。", limits: "原頁未列成交量或股價數值限制；市值分類的數值分界未公開。不能只篩半導體，也不能自行補上低本益比門檻。", verification: "detail" },
  { id: "beat-taiex", market: "TW", name: "台股大型股", englishName: "Taiwan large caps", holdings: 10, frequency: "monthly", universe: "台灣大型股，目標相對台灣加權指數。", limits: "概覽層級；未完整核對數值門檻。", verification: "overview" },
  { id: "taiwan-mid-cap-movers", market: "TW", name: "台灣中型成長", englishName: "Taiwan mid-cap growth", holdings: 20, frequency: "monthly", universe: "台灣中型企業，科技與製造、成長與動能。", limits: "概覽層級；中型股數值界線尚未核對，不能套用美股美元分界。", verification: "overview" },
  { id: "taiwan-value", market: "TW", name: "台股價值研究", englishName: "Taiwan value", holdings: 15, frequency: "monthly", universe: "概覽列出本益比 5–35 倍、正現金流及穩健 ROE。", limits: "現金流口徑與 ROE 精確門檻未核對；不假定是自由現金流或 ROE ≥ 15%。", verification: "overview" },
  { id: "beat-sp-500", market: "US", name: "美股大盤精選", englishName: "S&P 500 selection", holdings: 20, frequency: "monthly", universe: "S&P 500 成分股；不同板塊的相對排名。", limits: "詳情顯示市值 > US$25B、日均成交量 > 1K；價格不限。需當期成分股資料；不能拿所有美國大股替代。", verification: "detail" },
  { id: "dominate-the-dow", market: "US", name: "道瓊藍籌研究", englishName: "Dow blue chips", holdings: 10, frequency: "monthly", universe: "道瓊 30 檔成分股中選取 10 檔。", limits: "概覽層級；需要當期指數名單，其他門檻未完整核對。", verification: "overview" },
  { id: "tech-titans", market: "US", name: "美國科技研究", englishName: "US technology", holdings: 15, frequency: "monthly", universe: "美國資訊科技股；不是只含巨型科技股。", limits: "詳情顯示市值 > US$1B、日均成交量 > 1K、未調整收盤價 > US$10。原頁未給日均量計算視窗。", verification: "detail" },
  { id: "midcap-movers", market: "US", name: "美國中型成長", englishName: "US mid caps", holdings: 20, frequency: "monthly", universe: "概覽列市值 US$2–10B 的中型股。", limits: "概覽層級；邊界是否含等號、其餘條件未完整核對。", verification: "overview" },
  { id: "top-value-stocks", market: "US", name: "美股價值研究", englishName: "US value", holdings: 20, frequency: "monthly", universe: "美國價值股票；2026-09-20 詳情頁描述寫 P/E < 15，策略主題卻寫 P/E < 35，存在矛盾。", limits: "已核對詳情但未釐清本益比門檻／口徑；現持股也非全數 P/E < 15。不把 15 倍當成已確認硬門檻；亦不自行宣稱 35 倍就是完整規則。", verification: "detail" },
  { id: "best-of-buffett", market: "US", name: "巴菲特持股研究", englishName: "Buffett holdings", holdings: 15, frequency: "quarterly", universe: "Berkshire Hathaway 已公開申報持股；市值 > US$1B、日均成交量 > 1K，股價不限。", limits: "季度更新；基準為 S&P 500 Pure Value。需以申報公開日判斷可得資訊，不以季末日期冒充公告日；日均量視窗與確切更新時刻未公開。", verification: "detail" },
  { id: "healthcare-heroes", market: "US", name: "美國醫療研究", englishName: "US healthcare", holdings: 15, frequency: "monthly", universe: "製藥、生技、醫療設備與醫療服務。", limits: "概覽層級；數值門檻未完整核對。", verification: "overview" },
  { id: "energy-elite", market: "US", name: "美國能源研究", englishName: "US energy", holdings: 15, frequency: "monthly", universe: "油氣、再生能源及能源基礎設施。", limits: "概覽層級；數值門檻未完整核對。", verification: "overview" },
  { id: "financial-fortresses", market: "US", name: "美國金融研究", englishName: "US financials", holdings: 15, frequency: "monthly", universe: "銀行、保險與金融服務。", limits: "概覽層級；不可將工業公司的現金流門檻直接套在銀行。", verification: "overview" },
  { id: "small-cap-sprinters", market: "US", name: "美國小型成長", englishName: "US small caps", holdings: 20, frequency: "monthly", universe: "美國小型股，關注成長、動能與流動性。", limits: "概覽顯示每月；不能因為宣傳文字寫『本日』而當作日內策略。", verification: "overview" },
  { id: "quality-compounders", market: "US", name: "美股品質複利", englishName: "US quality", holdings: 15, frequency: "monthly", universe: "ROE 與現金創造能力較強的美國公司。", limits: "概覽層級；完整 ROE／現金流門檻未公開核對。", verification: "overview" },
  { id: "dividend-us", market: "US", name: "美國股息研究", englishName: "US dividends", holdings: 15, frequency: "quarterly", universe: "美國派息股；概覽稱使用 45 項財務健康指標。", limits: "季度更新；不能套用月度交易日規則。具體 45 項指標及權重未完整公開。", verification: "overview" },
];

export const RESEARCH_FINDINGS = [
  { title: "選股不是公允價值由低到高", body: "官方描述是財報、估值、價格動能、資產效率、盈利趨勢、負債流動性、產業與企業行動等訊號，形成預測評級，再依策略範圍取固定名額。完整特徵、權重與排名沒有公開；現有估值排行榜不能冒充這套模型。", source: METHODOLOGY_URL },
  { title: "月度參考價，不是盤中精準買點", body: "月度 FAQ 指每月首個交易日更新，以該日收盤價作為買入參考；等權持有整個月。月份標籤可能是非交易日。這不證明你在收盤前已拿到名單，也不是回填成交價的授權。", source: METHODOLOGY_URL },
  { title: "調出與看空要分開", body: "名額有限，原持股可能被相對排名更好的標的擠出，或不再符合策略範圍。追蹤模型組合時會移出；個人的賣出決策仍需另行評估。未找到統一固定停損、停利或技術型態確認規則。", source: RATIONALE_URL },
  { title: "展示績效不等於可成交回測", body: "官方說明包含歷史回測與股息再投入，交易成本等可能未完整計入。本頁不搬用其報酬曲線作為穩盈績效；未建立具公告時點、下市股票、企業行動及成本的資料集前，不產生回測報酬。", source: METHODOLOGY_URL },
];

// Transformative case observations only; no paid holdings table or copied rationale text.
export const ROTATION_CASES = [
  { ticker: "6176", label: "瑞儀｜2026-09 納入", lesson: "原頁將價值與未來業務動力並列；近期股價弱勢本身不是絕對排除條件。", source: "taiwan-chip-champions" },
  { ticker: "3653", label: "健策｜2026-09 納入", lesson: "原頁重視動能、利潤率與成長。與瑞儀同時入選，說明不能用單一低本益比門檻解釋整組。", source: "taiwan-chip-champions" },
  { ticker: "3008", label: "大立光｜2026-08 納入 → 09 移出", lesson: "同一家公司可以一個月後被替換；入選不代表至少持有一年，也不能從事後價格推出固定停利比例。", source: "taiwan-chip-champions" },
  { ticker: "3673", label: "TPK-KY｜2026-09 移出", lesson: "即使理由仍提到便宜與上漲空間，也可能因盈利、成長、動能的相對表現而被其他標的取代。", source: "taiwan-chip-champions" },
  { ticker: "EFOR", label: "Everforth｜2026-09 納入", lesson: "美國科技策略把反彈、估值與成長催化並用；新增不只是挑過去一年漲最多的股票。", source: "tech-titans" },
  { ticker: "ARM", label: "Arm｜2026-09 移出", lesson: "原頁同時描述估值、動能及獲利壓力，也保留基本面優勢。不能把移除簡化成一條技術停損。", source: "tech-titans" },
];
