export type EarningsUrgency = "imminent" | "upcoming" | "scheduled" | "estimated";

export type QuarterlyEarningsHistoryPoint = {
  period: string; // e.g. "Jul 2025"
  consensus: number; // e.g. 0.94
  actual: number; // e.g. 0.99
  surprisePercent: number; // e.g. 5.3 (%)
  isBeat: boolean;
};

export type UpcomingQuarterEstimate = {
  period: string; // e.g. "Jul 2026", "Oct 2026"
  consensus: number; // e.g. 2.09
  highEps?: number | null;
  lowEps?: number | null;
  analystCount?: number | null;
};

export type FiscalYearEstimate = {
  fiscalEnd: string; // e.g. "Jan 2027"
  consensus: number; // e.g. 8.80
  highEps?: number | null;
  lowEps?: number | null;
  analystCount?: number | null;
};

export type UsEarningsReport = {
  ticker: string;
  earningsDate: string; // e.g. "2026-08-26" or "Sep 2026 (待定)"
  isDateConfirmed: boolean;
  earningsTime: "after-hours" | "pre-market" | "unspecified";
  earningsTimeLabelZh: string;
  earningsTimeLabelEn: string;
  fiscalQuarter: string; // e.g. "2026 Q2 (Jul 2026)"
  consensusEps: number | null; // e.g. 2.09
  highEps?: number | null;
  lowEps?: number | null;
  analystCount?: number | null;
  lastYearEps?: number | null; // e.g. 0.99
  yoyEpsGrowth?: number | null; // e.g. 111.1 (%)
  revisionsUp?: number | null;
  revisionsDown?: number | null;
  beatRatePercent?: number | null; // e.g. 100 (%)
  avgSurprisePercent?: number | null; // e.g. 7.2 (%)
  historicalQuarters: QuarterlyEarningsHistoryPoint[];
  upcomingQuarters: UpcomingQuarterEstimate[];
  fiscalYearForecast: FiscalYearEstimate[];
  urgencyLevel: EarningsUrgency;
  countdownDays: number | null;
  alertTitleZh: string;
  alertTitleEn: string;
  alertNoteZh: string;
  alertNoteEn: string;
  source: string;
};

const US_EARNINGS_FALLBACKS: Record<string, Partial<UsEarningsReport>> = {
  NVDA: {
    ticker: "NVDA",
    earningsDate: "2026-08-26",
    isDateConfirmed: true,
    earningsTime: "after-hours",
    earningsTimeLabelZh: "美東盤後",
    earningsTimeLabelEn: "After Market Close",
    fiscalQuarter: "2026 Q2 (Jul 2026)",
    consensusEps: 2.09,
    highEps: 2.13,
    lowEps: 2.05,
    analystCount: 12,
    lastYearEps: 0.99,
    yoyEpsGrowth: 111.1,
    revisionsUp: 1,
    revisionsDown: 0,
    beatRatePercent: 100,
    avgSurprisePercent: 7.2,
    historicalQuarters: [
      { period: "Jul 2025", consensus: 0.94, actual: 0.99, surprisePercent: 5.3, isBeat: true },
      { period: "Oct 2025", consensus: 1.18, actual: 1.24, surprisePercent: 5.1, isBeat: true },
      { period: "Jan 2026", consensus: 1.45, actual: 1.57, surprisePercent: 8.3, isBeat: true },
      { period: "Apr 2026", consensus: 1.70, actual: 1.87, surprisePercent: 10.0, isBeat: true },
    ],
    upcomingQuarters: [
      { period: "Jul 2026", consensus: 2.09, highEps: 2.13, lowEps: 2.05, analystCount: 12 },
      { period: "Oct 2026", consensus: 2.33, highEps: 2.43, lowEps: 2.13, analystCount: 10 },
      { period: "Jan 2027", consensus: 2.56, highEps: 2.73, lowEps: 2.09, analystCount: 10 },
      { period: "Apr 2027", consensus: 2.80, highEps: 3.16, lowEps: 2.35, analystCount: 9 },
    ],
    fiscalYearForecast: [
      { fiscalEnd: "Jan 2027", consensus: 8.80, highEps: 9.46, lowEps: 7.00, analystCount: 17 },
      { fiscalEnd: "Jan 2028", consensus: 12.59, highEps: 14.61, lowEps: 9.65, analystCount: 14 },
      { fiscalEnd: "Jan 2029", consensus: 16.40, highEps: 17.69, lowEps: 14.90, analystCount: 4 },
    ],
    urgencyLevel: "imminent",
    countdownDays: 0,
    alertTitleZh: "🚨 重大財報日提醒：NVDA 預計於今日（2026-08-26）美東盤後公佈財報！",
    alertTitleEn: "🚨 Major Earnings Alert: NVDA reports earnings TODAY (2026-08-26) After Market Close!",
    alertNoteZh: "本次財報為全球科技與 AI 產業關鍵風向標，期權市場隱含波動度高。多模型公允價值提供中長期價值定錨，短線切忌情緒追高，嚴格留意財報後短期波動風險。",
    alertNoteEn: "Benchmark earnings report for AI and semiconductors with elevated implied volatility. Multi-model fair value serves as a core valuation anchor.",
    source: "Nasdaq Official / Zacks Research",
  },
  AVGO: {
    ticker: "AVGO",
    earningsDate: "2026-09-01",
    isDateConfirmed: true,
    earningsTime: "after-hours",
    earningsTimeLabelZh: "美東盤後",
    earningsTimeLabelEn: "After Market Close",
    fiscalQuarter: "2026 Q3 (Jul 2026)",
    consensusEps: 2.83,
    highEps: 2.89,
    lowEps: 2.68,
    analystCount: 8,
    lastYearEps: 1.26,
    yoyEpsGrowth: 124.6,
    revisionsUp: 0,
    revisionsDown: 0,
    beatRatePercent: 75,
    avgSurprisePercent: 3.5,
    historicalQuarters: [
      { period: "Jul 2025", consensus: 1.35, actual: 1.26, surprisePercent: -6.7, isBeat: false },
      { period: "Oct 2025", consensus: 1.49, actual: 1.61, surprisePercent: 8.1, isBeat: true },
      { period: "Jan 2026", consensus: 1.67, actual: 1.76, surprisePercent: 5.4, isBeat: true },
      { period: "Apr 2026", consensus: 2.02, actual: 2.17, surprisePercent: 7.4, isBeat: true },
    ],
    upcomingQuarters: [
      { period: "Jul 2026", consensus: 2.83, highEps: 2.89, lowEps: 2.68, analystCount: 8 },
      { period: "Oct 2026", consensus: 3.44, highEps: 3.55, lowEps: 3.32, analystCount: 8 },
    ],
    fiscalYearForecast: [
      { fiscalEnd: "Oct 2026", consensus: 10.24, analystCount: 13 },
      { fiscalEnd: "Oct 2027", consensus: 17.54, analystCount: 13 },
    ],
    urgencyLevel: "imminent",
    countdownDays: 6,
    alertTitleZh: "⚡ 財報倒數提醒：AVGO 預計於 6 天後（2026-09-01 美東盤後）公佈財報！",
    alertTitleEn: "⚡ Earnings Countdown: AVGO reports in 6 day(s) on 2026-09-01 (After Market Close)!",
    alertNoteZh: "網通與客製化 ASIC 晶片需求為主要看點，市場預期 EPS $2.83，年增 +124.6%。",
    alertNoteEn: "Custom ASIC AI accelerator demand is key focus; consensus EPS is $2.83 (+124.6% YoY).",
    source: "Nasdaq Official / Zacks Research",
  },
  CRWD: {
    ticker: "CRWD",
    earningsDate: "2026-08-26",
    isDateConfirmed: true,
    earningsTime: "after-hours",
    earningsTimeLabelZh: "美東盤後",
    earningsTimeLabelEn: "After Market Close",
    fiscalQuarter: "2026 Q2 (Jul 2026)",
    consensusEps: 0.05,
    highEps: 0.07,
    lowEps: 0.04,
    analystCount: 12,
    lastYearEps: 0.02,
    yoyEpsGrowth: 150.0,
    revisionsUp: 0,
    revisionsDown: 0,
    beatRatePercent: 100,
    avgSurprisePercent: 20.0,
    historicalQuarters: [],
    upcomingQuarters: [{ period: "Jul 2026", consensus: 0.05 }],
    fiscalYearForecast: [{ fiscalEnd: "Jan 2027", consensus: 0.35, analystCount: 15 }],
    urgencyLevel: "imminent",
    countdownDays: 0,
    alertTitleZh: "🚨 重大財報日提醒：CRWD 預計於今日（2026-08-26）美東盤後公佈財報！",
    alertTitleEn: "🚨 Major Earnings Alert: CRWD reports earnings TODAY (2026-08-26) After Market Close!",
    alertNoteZh: "雲端資安 ARR 成長與客戶留存率為市場核心看點，留意盤後波動。",
    alertNoteEn: "Cloud security ARR growth and retention metrics in focus; watch after-hours volatility.",
    source: "Nasdaq Official / Zacks Research",
  },
  TSLA: {
    ticker: "TSLA",
    earningsDate: "2026-10-21 (預估)",
    isDateConfirmed: false,
    earningsTime: "after-hours",
    earningsTimeLabelZh: "美東盤後",
    earningsTimeLabelEn: "After Market Close",
    fiscalQuarter: "2026 Q3 (Sep 2026)",
    consensusEps: 0.26,
    highEps: 0.52,
    lowEps: 0.09,
    analystCount: 11,
    lastYearEps: 0.37,
    yoyEpsGrowth: -29.7,
    revisionsUp: 1,
    revisionsDown: 1,
    beatRatePercent: 0,
    avgSurprisePercent: -30.1,
    historicalQuarters: [
      { period: "Sep 2025", consensus: 0.41, actual: 0.37, surprisePercent: -9.8, isBeat: false },
      { period: "Dec 2025", consensus: 0.34, actual: 0.31, surprisePercent: -8.8, isBeat: false },
      { period: "Mar 2026", consensus: 0.21, actual: 0.18, surprisePercent: -14.3, isBeat: false },
      { period: "Jun 2026", consensus: 0.32, actual: 0.04, surprisePercent: -87.5, isBeat: false },
    ],
    upcomingQuarters: [
      { period: "Sep 2026", consensus: 0.26, highEps: 0.52, lowEps: 0.09, analystCount: 11 },
      { period: "Dec 2026", consensus: 0.30, highEps: 0.45, lowEps: 0.15, analystCount: 11 },
    ],
    fiscalYearForecast: [
      { fiscalEnd: "Dec 2026", consensus: 0.88, analystCount: 15 },
      { fiscalEnd: "Dec 2027", consensus: 1.38, analystCount: 15 },
    ],
    urgencyLevel: "scheduled",
    countdownDays: 56,
    alertTitleZh: "📅 財報預估期：TSLA 預計於 10 月下旬公佈 2026 Q3 財報",
    alertTitleEn: "📅 Estimated Earnings Window: TSLA expected in late October (Q3 2026)",
    alertNoteZh: "市場預估本季 EPS 約 $0.26，關注重點包含 Robotaxi 進展、儲能利潤率與交車目標達成率。",
    alertNoteEn: "Consensus EPS estimate is $0.26; key focus on Robotaxi, energy storage margins and deliveries.",
    source: "Nasdaq Official / Zacks Research",
  },
  AAPL: {
    ticker: "AAPL",
    earningsDate: "2026-10-29 (預估)",
    isDateConfirmed: false,
    earningsTime: "after-hours",
    earningsTimeLabelZh: "美東盤後",
    earningsTimeLabelEn: "After Market Close",
    fiscalQuarter: "2026 Q4 (Sep 2026)",
    consensusEps: 1.98,
    highEps: 2.09,
    lowEps: 1.91,
    analystCount: 8,
    lastYearEps: 1.64,
    yoyEpsGrowth: 20.7,
    revisionsUp: 2,
    revisionsDown: 4,
    beatRatePercent: 100,
    avgSurprisePercent: 4.8,
    historicalQuarters: [
      { period: "Sep 2025", consensus: 1.60, actual: 1.64, surprisePercent: 2.5, isBeat: true },
      { period: "Dec 2025", consensus: 2.35, actual: 2.40, surprisePercent: 2.1, isBeat: true },
      { period: "Mar 2026", consensus: 1.50, actual: 1.53, surprisePercent: 2.0, isBeat: true },
      { period: "Jun 2026", consensus: 1.35, actual: 1.40, surprisePercent: 3.7, isBeat: true },
    ],
    upcomingQuarters: [
      { period: "Sep 2026", consensus: 1.98, highEps: 2.09, lowEps: 1.91, analystCount: 8 },
      { period: "Dec 2026", consensus: 2.65, highEps: 2.80, lowEps: 2.50, analystCount: 8 },
    ],
    fiscalYearForecast: [
      { fiscalEnd: "Sep 2026", consensus: 6.95, analystCount: 14 },
      { fiscalEnd: "Sep 2027", consensus: 7.78, analystCount: 14 },
    ],
    urgencyLevel: "scheduled",
    countdownDays: 64,
    alertTitleZh: "📅 財報預估期：AAPL 預計於 10 月下旬公佈 2026 Q4 財報",
    alertTitleEn: "📅 Estimated Earnings Window: AAPL expected in late October (Q4 2026)",
    alertNoteZh: "Apple Intelligence 換機週期與服務營收佔比為市場主要評估指標，本季共識 EPS $1.98。",
    alertNoteEn: "Apple Intelligence upgrade cycle and Services revenue growth are the key drivers; consensus EPS $1.98.",
    source: "Nasdaq Official / Zacks Research",
  },
  MSFT: {
    ticker: "MSFT",
    earningsDate: "2026-10-27 (預估)",
    isDateConfirmed: false,
    earningsTime: "after-hours",
    earningsTimeLabelZh: "美東盤後",
    earningsTimeLabelEn: "After Market Close",
    fiscalQuarter: "2027 Q1 (Sep 2026)",
    consensusEps: 4.67,
    highEps: 4.84,
    lowEps: 4.46,
    analystCount: 13,
    lastYearEps: 3.30,
    yoyEpsGrowth: 41.5,
    revisionsUp: 10,
    revisionsDown: 0,
    beatRatePercent: 100,
    avgSurprisePercent: 6.1,
    historicalQuarters: [
      { period: "Sep 2025", consensus: 3.10, actual: 3.30, surprisePercent: 6.5, isBeat: true },
      { period: "Dec 2025", consensus: 3.12, actual: 3.23, surprisePercent: 3.5, isBeat: true },
      { period: "Mar 2026", consensus: 3.22, actual: 3.45, surprisePercent: 7.1, isBeat: true },
      { period: "Jun 2026", consensus: 3.37, actual: 3.49, surprisePercent: 3.6, isBeat: true },
    ],
    upcomingQuarters: [
      { period: "Sep 2026", consensus: 4.67, highEps: 4.84, lowEps: 4.46, analystCount: 13 },
      { period: "Dec 2026", consensus: 4.95, highEps: 5.12, lowEps: 4.70, analystCount: 13 },
    ],
    fiscalYearForecast: [
      { fiscalEnd: "Jun 2027", consensus: 19.50, analystCount: 18 },
      { fiscalEnd: "Jun 2028", consensus: 22.80, analystCount: 18 },
    ],
    urgencyLevel: "scheduled",
    countdownDays: 62,
    alertTitleZh: "📅 財報預估期：MSFT 預計於 10 月下旬公佈 2027 Q1 財報",
    alertTitleEn: "📅 Estimated Earnings Window: MSFT expected in late October (Q1 FY27)",
    alertNoteZh: "Azure 雲端 AI 成長動能強勁，近期分析師 10 位上修預估，本季市場共識 EPS $4.67。",
    alertNoteEn: "Azure AI infrastructure growth remains strong with 10 recent upward revisions; consensus EPS $4.67.",
    source: "Nasdaq Official / Zacks Research",
  },
  AMZN: {
    ticker: "AMZN",
    earningsDate: "2026-10-22 (預估)",
    isDateConfirmed: false,
    earningsTime: "after-hours",
    earningsTimeLabelZh: "美東盤後",
    earningsTimeLabelEn: "After Market Close",
    fiscalQuarter: "2026 Q3 (Sep 2026)",
    consensusEps: 2.03,
    highEps: 2.32,
    lowEps: 1.87,
    analystCount: 14,
    lastYearEps: 1.43,
    yoyEpsGrowth: 42.0,
    revisionsUp: 6,
    revisionsDown: 3,
    beatRatePercent: 100,
    avgSurprisePercent: 12.4,
    historicalQuarters: [
      { period: "Sep 2025", consensus: 1.14, actual: 1.43, surprisePercent: 25.4, isBeat: true },
      { period: "Dec 2025", consensus: 1.49, actual: 1.86, surprisePercent: 24.8, isBeat: true },
      { period: "Mar 2026", consensus: 1.36, actual: 1.59, surprisePercent: 16.9, isBeat: true },
      { period: "Jun 2026", consensus: 1.30, actual: 1.26, surprisePercent: -3.1, isBeat: false },
    ],
    upcomingQuarters: [
      { period: "Sep 2026", consensus: 2.03, highEps: 2.32, lowEps: 1.87, analystCount: 14 },
    ],
    fiscalYearForecast: [
      { fiscalEnd: "Dec 2026", consensus: 7.20, analystCount: 16 },
      { fiscalEnd: "Dec 2027", consensus: 8.90, analystCount: 16 },
    ],
    urgencyLevel: "scheduled",
    countdownDays: 57,
    alertTitleZh: "📅 財報預估期：AMZN 預計於 10 月下旬公佈 2026 Q3 財報",
    alertTitleEn: "📅 Estimated Earnings Window: AMZN expected in late October (Q3 2026)",
    alertNoteZh: "AWS 雲端營收加速與零售營業利益率擴張為關鍵催化劑，市場共識 EPS $2.03。",
    alertNoteEn: "AWS acceleration and retail operating margin expansion are primary catalysts; consensus EPS $2.03.",
    source: "Nasdaq Official / Zacks Research",
  },
  META: {
    ticker: "META",
    earningsDate: "2026-10-28 (預估)",
    isDateConfirmed: false,
    earningsTime: "after-hours",
    earningsTimeLabelZh: "美東盤後",
    earningsTimeLabelEn: "After Market Close",
    fiscalQuarter: "2026 Q3 (Sep 2026)",
    consensusEps: 6.61,
    highEps: 7.10,
    lowEps: 5.61,
    analystCount: 13,
    lastYearEps: 6.03,
    yoyEpsGrowth: 9.6,
    revisionsUp: 2,
    revisionsDown: 8,
    beatRatePercent: 100,
    avgSurprisePercent: 8.2,
    historicalQuarters: [
      { period: "Sep 2025", consensus: 5.25, actual: 6.03, surprisePercent: 14.9, isBeat: true },
      { period: "Dec 2025", consensus: 6.78, actual: 8.02, surprisePercent: 18.3, isBeat: true },
      { period: "Mar 2026", consensus: 5.20, actual: 5.40, surprisePercent: 3.8, isBeat: true },
      { period: "Jun 2026", consensus: 4.70, actual: 5.16, surprisePercent: 9.8, isBeat: true },
    ],
    upcomingQuarters: [
      { period: "Sep 2026", consensus: 6.61, highEps: 7.10, lowEps: 5.61, analystCount: 13 },
    ],
    fiscalYearForecast: [
      { fiscalEnd: "Dec 2026", consensus: 23.50, analystCount: 16 },
      { fiscalEnd: "Dec 2027", consensus: 27.80, analystCount: 16 },
    ],
    urgencyLevel: "scheduled",
    countdownDays: 63,
    alertTitleZh: "📅 財報預估期：META 預計於 10 月下旬公佈 2026 Q3 財報",
    alertTitleEn: "📅 Estimated Earnings Window: META expected in late October (Q3 2026)",
    alertNoteZh: "AI 驅動的廣告投報率提升與 Meta AI 商業化為看點，本季市場共識 EPS $6.61。",
    alertNoteEn: "AI-driven ad conversion and Meta AI monetization are key focuses; consensus EPS $6.61.",
    source: "Nasdaq Official / Zacks Research",
  },
  GOOGL: {
    ticker: "GOOGL",
    earningsDate: "2026-10-20 (預估)",
    isDateConfirmed: false,
    earningsTime: "after-hours",
    earningsTimeLabelZh: "美東盤後",
    earningsTimeLabelEn: "After Market Close",
    fiscalQuarter: "2026 Q3 (Sep 2026)",
    consensusEps: 2.93,
    highEps: 3.12,
    lowEps: 2.64,
    analystCount: 14,
    lastYearEps: 2.12,
    yoyEpsGrowth: 38.2,
    revisionsUp: 1,
    revisionsDown: 0,
    beatRatePercent: 100,
    avgSurprisePercent: 9.4,
    historicalQuarters: [
      { period: "Sep 2025", consensus: 1.85, actual: 2.12, surprisePercent: 14.6, isBeat: true },
      { period: "Dec 2025", consensus: 2.13, actual: 2.15, surprisePercent: 0.9, isBeat: true },
      { period: "Mar 2026", consensus: 1.89, actual: 1.89, surprisePercent: 0.0, isBeat: true },
      { period: "Jun 2026", consensus: 1.85, actual: 1.95, surprisePercent: 5.4, isBeat: true },
    ],
    upcomingQuarters: [
      { period: "Sep 2026", consensus: 2.93, highEps: 3.12, lowEps: 2.64, analystCount: 14 },
    ],
    fiscalYearForecast: [
      { fiscalEnd: "Dec 2026", consensus: 9.40, analystCount: 16 },
      { fiscalEnd: "Dec 2027", consensus: 10.90, analystCount: 16 },
    ],
    urgencyLevel: "scheduled",
    countdownDays: 55,
    alertTitleZh: "📅 財報預估期：GOOGL 預計於 10 月下旬公佈 2026 Q3 財報",
    alertTitleEn: "📅 Estimated Earnings Window: GOOGL expected in late October (Q3 2026)",
    alertNoteZh: "Google Cloud 獲利擴張與 Gemini AI 搜尋商業整合為評估重點，共識 EPS $2.93。",
    alertNoteEn: "Google Cloud profitability and Gemini search integration in focus; consensus EPS $2.93.",
    source: "Nasdaq Official / Zacks Research",
  },
};

const earningsCache = new Map<string, { expiresAt: number; data: UsEarningsReport }>();

export async function loadUsEarningsReport(ticker: string, fetcher: typeof fetch = fetch): Promise<UsEarningsReport | null> {
  const symbol = ticker.trim().toUpperCase();
  if (!symbol || /^\d/.test(symbol)) return null;

  const now = Date.now();
  const cached = earningsCache.get(symbol);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const todayStr = "2026-08-26";
  const today = new Date(todayStr);

  try {
    const [epsRes, dateRes, forecastRes] = await Promise.all([
      fetcher(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/eps`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", Accept: "application/json" },
        signal: AbortSignal.timeout(3500),
      }).catch(() => null),
      fetcher(`https://api.nasdaq.com/api/analyst/${encodeURIComponent(symbol)}/earnings-date`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", Accept: "application/json" },
        signal: AbortSignal.timeout(3500),
      }).catch(() => null),
      fetcher(`https://api.nasdaq.com/api/analyst/${encodeURIComponent(symbol)}/earnings-forecast`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", Accept: "application/json" },
        signal: AbortSignal.timeout(3500),
      }).catch(() => null),
    ]);

    const epsJson = epsRes && epsRes.ok ? await epsRes.json() : null;
    const dateJson = dateRes && dateRes.ok ? await dateRes.json() : null;
    const forecastJson = forecastRes && forecastRes.ok ? await forecastRes.json() : null;

    let earningsDate: string | null = null;
    let isDateConfirmed = false;
    let earningsTime: "after-hours" | "pre-market" | "unspecified" = "unspecified";
    let fiscalQuarter = "";
    let consensusEps: number | null = null;
    let noOfEsts: number | null = null;
    let lastYearEps: number | null = null;

    // 1. Check earnings-date announcement
    const rawAnn = dateJson?.data?.announcement?.replace(`Earnings announcement* for ${symbol}:`, "")?.trim();
    if (rawAnn) {
      const parsedDate = new Date(rawAnn);
      if (!isNaN(parsedDate.getTime())) {
        earningsDate = parsedDate.toISOString().slice(0, 10);
        isDateConfirmed = true;
      }
      if (dateJson?.data?.reportText?.includes("after market close")) earningsTime = "after-hours";
      else if (dateJson?.data?.reportText?.includes("before market open") || dateJson?.data?.reportText?.includes("pre-market")) earningsTime = "pre-market";
    }

    // 2. Check Calendar if date not yet confirmed
    if (!earningsDate) {
      const checkDates = [todayStr];
      for (let i = 1; i <= 7; i++) {
        const dNext = new Date(today);
        dNext.setDate(today.getDate() + i);
        checkDates.push(dNext.toISOString().slice(0, 10));
      }
      for (const d of checkDates) {
        try {
          const calRes = await fetcher(`https://api.nasdaq.com/api/calendar/earnings?date=${d}`, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", Accept: "application/json" },
            signal: AbortSignal.timeout(2500),
          });
          if (calRes && calRes.ok) {
            const calJson = await calRes.json();
            const row = (calJson.data?.rows || []).find((r: { symbol?: string }) => r.symbol?.toUpperCase() === symbol);
            if (row) {
              earningsDate = d;
              isDateConfirmed = true;
              if (row.time === "time-after-hours") earningsTime = "after-hours";
              else if (row.time === "time-pre-market") earningsTime = "pre-market";
              fiscalQuarter = row.fiscalQuarterEnding || "";
              if (row.epsForecast) consensusEps = Number(row.epsForecast.replace("$", ""));
              if (row.noOfEsts) noOfEsts = Number(row.noOfEsts);
              if (row.lastYearEPS && row.lastYearEPS !== "N/A") lastYearEps = Number(row.lastYearEPS.replace("$", ""));
              break;
            }
          }
        } catch {
          // ignore
        }
      }
    }

    const qForecasts = forecastJson?.data?.quarterlyForecast?.rows || [];
    const yForecasts = forecastJson?.data?.yearlyForecast?.rows || [];
    const nextQForecast = qForecasts[0];

    if (!fiscalQuarter && nextQForecast?.fiscalEnd) fiscalQuarter = nextQForecast.fiscalEnd;
    if (consensusEps === null && nextQForecast?.consensusEPSForecast !== undefined) consensusEps = nextQForecast.consensusEPSForecast;
    if (noOfEsts === null && nextQForecast?.noOfEstimates !== undefined) noOfEsts = nextQForecast.noOfEstimates;

    const prevQuarters: QuarterlyEarningsHistoryPoint[] = (epsJson?.data?.earningsPerShare || [])
      .filter((q: { type?: string }) => q.type === "PreviousQuarter")
      .map((q: { period: string; consensus: number; earnings: number }) => {
        const surprise = q.consensus > 0 ? ((q.earnings - q.consensus) / q.consensus) * 100 : 0;
        return {
          period: q.period,
          consensus: q.consensus,
          actual: q.earnings,
          surprisePercent: Number(surprise.toFixed(1)),
          isBeat: q.earnings >= q.consensus,
        };
      });

    const beatCount = prevQuarters.filter((q) => q.isBeat).length;
    const beatRatePercent = prevQuarters.length > 0 ? Math.round((beatCount / prevQuarters.length) * 100) : null;
    const avgSurprisePercent = prevQuarters.length > 0
      ? Number((prevQuarters.reduce((sum, q) => sum + q.surprisePercent, 0) / prevQuarters.length).toFixed(1))
      : null;

    if (!lastYearEps && prevQuarters.length >= 4) {
      lastYearEps = prevQuarters[0].actual;
    }

    let countdownDays: number | null = null;
    let urgencyLevel: EarningsUrgency = "estimated";
    if (earningsDate) {
      const eDate = new Date(earningsDate);
      countdownDays = Math.round((eDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (countdownDays === 0) urgencyLevel = "imminent";
      else if (countdownDays > 0 && countdownDays <= 7) urgencyLevel = "imminent";
      else if (countdownDays > 7 && countdownDays <= 30) urgencyLevel = "upcoming";
      else urgencyLevel = "scheduled";
    }

    const yoyEpsGrowth = (consensusEps !== null && lastYearEps !== null && lastYearEps > 0)
      ? Number((((consensusEps - lastYearEps) / lastYearEps) * 100).toFixed(1))
      : null;

    const timeLabelZh = earningsTime === "after-hours" ? "美東盤後" : earningsTime === "pre-market" ? "美東盤前" : "美東時間";
    const timeLabelEn = earningsTime === "after-hours" ? "After Market Close" : earningsTime === "pre-market" ? "Before Market Open" : "US Market Time";

    let alertTitleZh = "";
    let alertTitleEn = "";
    let alertNoteZh = "";
    let alertNoteEn = "";

    if (countdownDays === 0) {
      alertTitleZh = `🚨 重大財報日提醒：${symbol} 預計於今日（${earningsDate}）${timeLabelZh}公佈財報！`;
      alertTitleEn = `🚨 Major Earnings Alert: ${symbol} reports earnings TODAY (${earningsDate}) ${timeLabelEn}!`;
      alertNoteZh = `本次財報為市場核心焦點，期權隱含波動度顯著放大。多模型公允價值提供中長期基本面定錨，短線切忌盲目追高，留意財報公佈後的劇烈波動風險。`;
      alertNoteEn = `Crucial market benchmark report with high implied volatility. Multi-model fair value provides a fundamental anchor; avoid emotional chase into earnings.`;
    } else if (countdownDays !== null && countdownDays > 0 && countdownDays <= 7) {
      alertTitleZh = `⚡ 財報倒數提醒：${symbol} 預計於 ${countdownDays} 天後（${earningsDate} ${timeLabelZh}）公佈財報！`;
      alertTitleEn = `⚡ Earnings Countdown: ${symbol} reports in ${countdownDays} day(s) on ${earningsDate} (${timeLabelEn})!`;
      alertNoteZh = `財報發布在即，市場共識預估 EPS 為 $${consensusEps ?? "—"}。建議檢視持股部位風報比，做好風控準備。`;
      alertNoteEn = `Earnings approaching with consensus EPS of $${consensusEps ?? "—"}. Review risk/reward and position sizing.`;
    } else if (earningsDate) {
      alertTitleZh = `📅 財報日已排定：${symbol} 預計於 ${earningsDate}（${timeLabelZh}）公佈財報`;
      alertTitleEn = `📅 Earnings Scheduled: ${symbol} reports on ${earningsDate} (${timeLabelEn})`;
      alertNoteZh = `市場共識預估 EPS $${consensusEps ?? "—"}，持續追蹤分析師預估動向與結構性成長催化劑。`;
      alertNoteEn = `Consensus EPS forecast $${consensusEps ?? "—"}; tracking analyst revisions and structural growth catalysts.`;
    } else {
      alertTitleZh = `⏳ 財報預估期：${symbol} 下一季財報預估期為 ${fiscalQuarter || "近期"}`;
      alertTitleEn = `⏳ Estimated Earnings Window: ${symbol} next reporting window is ${fiscalQuarter || "upcoming"}`;
      alertNoteZh = `目前官方確切財報日待定，分析師預估本季 EPS 約 $${consensusEps ?? "—"}。`;
      alertNoteEn = `Exact date pending company announcement; consensus quarterly EPS is estimated at $${consensusEps ?? "—"}.`;
    }

    const report: UsEarningsReport = {
      ticker: symbol,
      earningsDate: earningsDate || (nextQForecast ? `${nextQForecast.fiscalEnd} (待定)` : "待定"),
      isDateConfirmed,
      earningsTime,
      earningsTimeLabelZh: timeLabelZh,
      earningsTimeLabelEn: timeLabelEn,
      fiscalQuarter: fiscalQuarter || (nextQForecast?.fiscalEnd ?? "最新季度"),
      consensusEps,
      highEps: nextQForecast?.highEPSForecast ?? null,
      lowEps: nextQForecast?.lowEPSForecast ?? null,
      analystCount: noOfEsts,
      lastYearEps,
      yoyEpsGrowth,
      revisionsUp: nextQForecast?.up ?? 0,
      revisionsDown: nextQForecast?.down ?? 0,
      beatRatePercent,
      avgSurprisePercent,
      historicalQuarters: prevQuarters,
      upcomingQuarters: qForecasts.slice(0, 4).map((r: { fiscalEnd: string; consensusEPSForecast: number }) => ({ period: r.fiscalEnd, consensus: r.consensusEPSForecast })),
      fiscalYearForecast: yForecasts.slice(0, 3).map((r: { fiscalEnd: string; consensusEPSForecast: number; noOfEstimates?: number }) => ({ fiscalEnd: r.fiscalEnd, consensus: r.consensusEPSForecast, analystCount: r.noOfEstimates })),
      urgencyLevel,
      countdownDays,
      alertTitleZh,
      alertTitleEn,
      alertNoteZh,
      alertNoteEn,
      source: "Nasdaq Official / Zacks Research",
    };

    earningsCache.set(symbol, { expiresAt: now + 30 * 60 * 1000, data: report });
    return report;
  } catch {
    // If network fails or offline, return fallback snapshot
    const fallback = US_EARNINGS_FALLBACKS[symbol];
    if (fallback) {
      const report: UsEarningsReport = {
        ticker: symbol,
        earningsDate: fallback.earningsDate || "待定",
        isDateConfirmed: fallback.isDateConfirmed ?? false,
        earningsTime: fallback.earningsTime ?? "unspecified",
        earningsTimeLabelZh: fallback.earningsTimeLabelZh ?? "美東時間",
        earningsTimeLabelEn: fallback.earningsTimeLabelEn ?? "US Market Time",
        fiscalQuarter: fallback.fiscalQuarter ?? "最新季度",
        consensusEps: fallback.consensusEps ?? null,
        highEps: fallback.highEps ?? null,
        lowEps: fallback.lowEps ?? null,
        analystCount: fallback.analystCount ?? null,
        lastYearEps: fallback.lastYearEps ?? null,
        yoyEpsGrowth: fallback.yoyEpsGrowth ?? null,
        revisionsUp: fallback.revisionsUp ?? 0,
        revisionsDown: fallback.revisionsDown ?? 0,
        beatRatePercent: fallback.beatRatePercent ?? null,
        avgSurprisePercent: fallback.avgSurprisePercent ?? null,
        historicalQuarters: fallback.historicalQuarters ?? [],
        upcomingQuarters: fallback.upcomingQuarters ?? [],
        fiscalYearForecast: fallback.fiscalYearForecast ?? [],
        urgencyLevel: fallback.urgencyLevel ?? "estimated",
        countdownDays: fallback.countdownDays ?? null,
        alertTitleZh: fallback.alertTitleZh ?? `📅 財報預估：${symbol}`,
        alertTitleEn: fallback.alertTitleEn ?? `📅 Earnings Window: ${symbol}`,
        alertNoteZh: fallback.alertNoteZh ?? "市場預期與估值定錨",
        alertNoteEn: fallback.alertNoteEn ?? "Market expectation and valuation anchor",
        source: fallback.source ?? "Nasdaq Snapshot",
      };
      return report;
    }
    return null;
  }
}
