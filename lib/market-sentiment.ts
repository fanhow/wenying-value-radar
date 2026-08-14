export type SentimentPoint = {
  date: string;
  value: number;
};

export type SentimentSeries = {
  symbol: string;
  label: string;
  current: number;
  previousClose: number;
  changePercent: number;
  return20d: number | null;
  history: SentimentPoint[];
};

export type YahooSentimentPayload = {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number; chartPreviousClose?: number };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
};

export type VolatilitySignal = {
  level: "calm" | "normal" | "cautious" | "stressed";
  titleZh: string;
  titleEn: string;
  guidanceZh: string;
  guidanceEn: string;
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseYahooSentimentSeries(payload: YahooSentimentPayload, symbol: string, label: string): SentimentSeries | null {
  const result = payload.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!result?.timestamp || !closes) return null;

  const history = result.timestamp.flatMap((timestamp, index): SentimentPoint[] => {
    const value = closes[index];
    if (!finite(value) || value <= 0) return [];
    return [{ date: new Date(timestamp * 1_000).toISOString().slice(0, 10), value }];
  }).slice(-126);
  if (history.length < 2) return null;

  const current = finite(result.meta?.regularMarketPrice)
    ? result.meta.regularMarketPrice
    : history.at(-1)?.value;
  const previousClose = finite(result.meta?.chartPreviousClose)
    ? result.meta.chartPreviousClose
    : history.at(-2)?.value;
  if (!finite(current) || !finite(previousClose) || previousClose <= 0) return null;

  const base20 = history.length > 20 ? history.at(-21)?.value : null;
  return {
    symbol,
    label,
    current,
    previousClose,
    changePercent: (current / previousClose - 1) * 100,
    return20d: finite(base20) && base20 > 0 ? (current / base20 - 1) * 100 : null,
    history,
  };
}

export function classifyVix(value: number, shortTermRatio: number | null = null): VolatilitySignal {
  if (value >= 30 || (shortTermRatio !== null && shortTermRatio >= 1.15)) {
    return {
      level: "stressed",
      titleZh: "風險壓力高",
      titleEn: "High risk pressure",
      guidanceZh: "優先降低槓桿與單一部位集中度，保留現金，不急著一次抄底。",
      guidanceEn: "Reduce leverage and concentration first; keep cash and avoid one-shot dip buying.",
    };
  }
  if (value >= 20 || (shortTermRatio !== null && shortTermRatio >= 1.05)) {
    return {
      level: "cautious",
      titleZh: "避險需求升高",
      titleEn: "Hedging demand is rising",
      guidanceZh: "新倉宜分批，檢查停損與現金比重；既有持倉以風險預算管理。",
      guidanceEn: "Scale into new positions and review stops and cash; manage holdings by risk budget.",
    };
  }
  if (value >= 15) {
    return {
      level: "normal",
      titleZh: "情緒中性偏穩",
      titleEn: "Neutral to steady",
      guidanceZh: "可維持核心持倉，但仍需配合趨勢、估值與個股風險，不單看 VIX。",
      guidanceEn: "Core holdings may be maintained, but combine VIX with trend, valuation, and stock risk.",
    };
  }
  return {
    level: "calm",
    titleZh: "風險偏好高",
    titleEn: "High risk appetite",
    guidanceZh: "低波動有利持倉，但也可能代表市場過度安心；避免追價與過度加槓桿。",
    guidanceEn: "Low volatility supports holdings but can signal complacency; avoid chasing and excess leverage.",
  };
}

export function volatilityCurveLabel(vix9d: number, vix: number, vix3m: number) {
  const shortTermRatio = vix3m > 0 ? vix9d / vix3m : null;
  if (shortTermRatio !== null && shortTermRatio >= 1.05) {
    return {
      shape: "inverted" as const,
      shortTermRatio,
      zh: "短期波動高於中期，近期事件風險與避險壓力較強。",
      en: "Short-term volatility exceeds medium-term volatility, indicating near-term event and hedging pressure.",
    };
  }
  if (vix < vix3m * 0.97) {
    return {
      shape: "contango" as const,
      shortTermRatio,
      zh: "波動率曲線正常上斜，市場目前相對平穩。",
      en: "The volatility curve slopes normally upward, suggesting a relatively calm current market.",
    };
  }
  return {
    shape: "flat" as const,
    shortTermRatio,
    zh: "波動率曲線接近平坦，市場正從平穩轉向觀望。",
    en: "The volatility curve is nearly flat, suggesting a transition from calm to caution.",
  };
}
