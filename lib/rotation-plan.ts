import { ROTATION_PROFILES } from "./rotation-research.ts";

export type RotationPlanInput = {
  profileId: string;
  period: string;
  previous: string;
  proposed: string;
  initialBasket: boolean;
  membershipConfirmed: boolean;
  scheduleConfirmed: boolean;
  sourceObservedAt: string;
  preparedAt: string;
};

export type RotationPlan = {
  schema: "wenying-rotation-review-v1";
  profileId: string;
  period: string;
  preparedAt: string;
  sourceObservedAt: string;
  retrospective: boolean;
  status: "review-only";
  rows: Array<{ ticker: string; action: "add" | "retain" | "remove"; targetWeight: number }>;
  added: number;
  retained: number;
  removed: number;
};

export function parseRotationTickers(text: string, market: "TW" | "US") {
  const errors: string[] = [];
  if (text.length > 10_000) return { tickers: [], errors: ["名單過長，請只貼股票代碼。"] };
  const tokens = text.trim() ? text.trim().split(/[\s,，;；、]+/) : [];
  const tickers: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const uppercase = token.toUpperCase();
    const ticker = market === "TW" ? uppercase.replace(/\.(TW|TWO)$/, "") : uppercase;
    const valid = market === "TW" ? /^(?!00)\d{4}$/.test(ticker) : /^[A-Z][A-Z0-9]*(?:[.-][A-Z0-9]+)?$/.test(ticker) && ticker.length <= 10;
    if (!valid) { errors.push(`代碼格式不符 ${market}：${token.slice(0, 40)}`); continue; }
    if (seen.has(ticker)) { errors.push(`重複代碼：${ticker}`); continue; }
    seen.add(ticker);
    tickers.push(ticker);
  }
  return { tickers, errors };
}

function instant(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
  const calendar = value.slice(0, 10);
  const date = new Date(`${calendar}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== calendar) return NaN;
  return Date.parse(value);
}

function marketPeriod(time: number, market: "TW" | "US") {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: market === "TW" ? "Asia/Taipei" : "America/New_York", year: "numeric", month: "2-digit" }).formatToParts(new Date(time));
  return `${parts.find((part) => part.type === "year")!.value}-${parts.find((part) => part.type === "month")!.value}`;
}

// This compares complete, user-confirmed baskets. It neither invents ML scores
// nor silently turns a missing/partial feed into a sell-all instruction.
export function buildRotationPlan(input: RotationPlanInput): { plan: RotationPlan | null; errors: string[] } {
  const errors: string[] = [];
  const profile = ROTATION_PROFILES.find((item) => item.id === input.profileId);
  if (!profile) return { plan: null, errors: ["未知策略，請重新選擇。"] };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period)) errors.push("更新期必須是 YYYY-MM。季度策略填實際更新月份，不自動推定季初。" );
  const preparedAt = instant(input.preparedAt);
  const sourceObservedAt = instant(input.sourceObservedAt);
  if (!Number.isFinite(preparedAt) || !Number.isFinite(sourceObservedAt)) errors.push("來源核對與決策時間必須有效且包含時區。" );
  else {
    if (sourceObservedAt > preparedAt) errors.push("來源資訊晚於決策時間，不可使用未來資料。" );
    if (input.period > marketPeriod(preparedAt, profile.market)) errors.push("不可把尚未到來的更新期當作已知名單。" );
    if (input.period > marketPeriod(sourceObservedAt, profile.market)) errors.push("來源核對時間早於本期更新月份，不能確認為本期名單。" );
  }
  const previous = parseRotationTickers(input.previous, profile.market);
  const proposed = parseRotationTickers(input.proposed, profile.market);
  errors.push(...previous.errors, ...proposed.errors);
  if (proposed.tickers.length !== profile.holdings) errors.push(`請提供完整本期 ${profile.holdings} 檔名單；不自動補滿、截短或放大剩餘持股權重。`);
  if (input.initialBasket && previous.tickers.length) errors.push("首次建組不能同時填入上期持股。" );
  if (!input.initialBasket && previous.tickers.length !== profile.holdings) errors.push(`請提供完整上期 ${profile.holdings} 檔名單；首次建立請勾選首次建組。`);
  if (!input.membershipConfirmed) errors.push("請先核對市場、策略範圍與完整名單。此工具不驗證模型排名或成分股資格。" );
  if (!input.scheduleConfirmed) errors.push("請先核對原頁更新日期與當地交易日曆；不猜測假日或季度調整月份。" );
  if (errors.length) return { plan: null, errors };
  const prior = new Set(previous.tickers);
  const next = new Set(proposed.tickers);
  const rows: RotationPlan["rows"] = proposed.tickers.map((ticker) => ({ ticker, action: prior.has(ticker) ? "retain" : "add", targetWeight: 1 / proposed.tickers.length }));
  for (const ticker of previous.tickers) if (!next.has(ticker)) rows.push({ ticker, action: "remove", targetWeight: 0 });
  return { errors: [], plan: {
    schema: "wenying-rotation-review-v1", profileId: profile.id, period: input.period,
    preparedAt: input.preparedAt, sourceObservedAt: input.sourceObservedAt,
    retrospective: input.period < marketPeriod(preparedAt, profile.market),
    status: "review-only", rows,
    added: rows.filter((row) => row.action === "add").length,
    retained: rows.filter((row) => row.action === "retain").length,
    removed: rows.filter((row) => row.action === "remove").length,
  } };
}
