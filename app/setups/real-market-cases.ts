import usdJpyCaseJson from "../../data/real_cases/usd_jpy_lower_wick_adr.json" with { type: "json" };
import avgoCaseJson from "../../data/real_cases/avgo_reversal.json" with { type: "json" };
import usdJpyAnnotationsJson from "../../data/real_cases/annotations/usd_jpy_lower_wick_adr.json" with { type: "json" };
import avgoAnnotationsJson from "../../data/real_cases/annotations/avgo_reversal.json" with { type: "json" };

// Generated real-market cases for all 10 setup patterns (Phase 6 & 7)
import eurusdFalseBreakCaseJson from "../../data/real_cases/generated/eurusd_false_break_20260105.json" with { type: "json" };
import cadchfFalseBreak1CaseJson from "../../data/real_cases/generated/cadchf_false_break_20260227.json" with { type: "json" };
import cadchfFalseBreak2CaseJson from "../../data/real_cases/generated/cadchf_false_break_20260112.json" with { type: "json" };

import usdjpyFlatPbCaseJson from "../../data/real_cases/generated/usdjpy_flat_pb_20260306.json" with { type: "json" };
import gbpjpyFlatPbCaseJson from "../../data/real_cases/generated/gbpjpy_flat_pb_20260824.json" with { type: "json" };
import audusdFlatPbCaseJson from "../../data/real_cases/generated/audusd_flat_pb_20260225.json" with { type: "json" };

import audnzdFirstPbCaseJson from "../../data/real_cases/generated/audnzd_first_pb_20260210.json" with { type: "json" };
import eurusdFirstPbCaseJson from "../../data/real_cases/generated/eurusd_first_pb_20260201.json" with { type: "json" };
import eurjpyFirstPbCaseJson from "../../data/real_cases/generated/eurjpy_first_pb_20251211.json" with { type: "json" };

import usdchfFailedMtopCaseJson from "../../data/real_cases/generated/usdchf_failed_mtop_20260215.json" with { type: "json" };
import gbpusdFailedMtopCaseJson from "../../data/real_cases/generated/gbpusd_failed_mtop_20251102.json" with { type: "json" };
import eurjpyFailedMtopCaseJson from "../../data/real_cases/generated/eurjpy_failed_mtop_20260809.json" with { type: "json" };

import usdjpyFailedWbot1CaseJson from "../../data/real_cases/generated/usdjpy_failed_wbot_20260730.json" with { type: "json" };
import usdjpyFailedWbot2CaseJson from "../../data/real_cases/generated/usdjpy_failed_wbot_20260125.json" with { type: "json" };
import audnzdFailedWbotCaseJson from "../../data/real_cases/generated/audnzd_failed_wbot_20260709.json" with { type: "json" };

import usdchfExhaustCaseJson from "../../data/real_cases/generated/usdchf_exhaust_20251114.json" with { type: "json" };
import cadchfExhaustCaseJson from "../../data/real_cases/generated/cadchf_exhaust_20251114.json" with { type: "json" };
import gbpjpyExhaustCaseJson from "../../data/real_cases/generated/gbpjpy_exhaust_20260129.json" with { type: "json" };

import cadchfLwAdrCaseJson from "../../data/real_cases/generated/cadchf_lw_adr_20260415_0800.json" with { type: "json" };
import eurgbpLwAdrCaseJson from "../../data/real_cases/generated/eurgbp_lw_adr_20260710_0700.json" with { type: "json" };
import usdchfLwAdrCaseJson from "../../data/real_cases/generated/usdchf_lw_adr_20260415_0800.json" with { type: "json" };

import audnzdMstarCaseJson from "../../data/real_cases/generated/audnzd_mstar_20260601.json" with { type: "json" };

import eurusdMtopRt1CaseJson from "../../data/real_cases/generated/eurusd_mtop_rt_20260531.json" with { type: "json" };
import eurusdMtopRt2CaseJson from "../../data/real_cases/generated/eurusd_mtop_rt_20260605.json" with { type: "json" };
import gbpusdMtopRtCaseJson from "../../data/real_cases/generated/gbpusd_mtop_rt_20260605.json" with { type: "json" };

export type LocalizedText = { zh: string; en: string };

export type RealCaseAggregateMetrics = {
  sample_size: number | null;
  win_rate_percent: number | null;
  average_r: number | null;
  expectancy_r: number | null;
  profit_factor: number | null;
  max_losing_streak: number | null;
  max_drawdown_percent: number | null;
};

export const EMPTY_AGGREGATE_METRICS: RealCaseAggregateMetrics = {
  sample_size: null,
  win_rate_percent: null,
  average_r: null,
  expectancy_r: null,
  profit_factor: null,
  max_losing_streak: null,
  max_drawdown_percent: null,
};

export const ANNOTATION_KINDS = [
  "Support", "Resistance", "Neckline", "EMA15", "EMA50", "ADR High", "ADR Low",
  "Entry", "Initial Stop", "Trail Stop 1", "Trail Stop 2", "Trail Stop 3", "Exit",
  "Long Lower Wick", "Liquidity Sweep", "Reclaim", "Morning Star", "Breakout", "Retest",
  "Higher Low", "Lower High",
] as const;

export type AnnotationKind = typeof ANNOTATION_KINDS[number];

export type NullablePriceEvent = {
  price: number | null;
  candle_index: number | null;
  reason: LocalizedText;
};

export type RealCaseAnnotation = {
  id: string;
  kind: AnnotationKind;
  label: LocalizedText;
  x: number;
  y: number;
  x2?: number | null;
  y2?: number | null;
};

export type AnnotationBundle = {
  case_id: string;
  source_image: string | null;
  image_width: number | null;
  image_height: number | null;
  annotations: RealCaseAnnotation[];
};

export type RealMarketCase = {
  id: string;
  setup_id: string;
  case_type: "executed_trade" | "historical_pattern";
  symbol: string;
  market: string;
  execution_timeframe: string;
  higher_timeframe: string | null;
  trade_date: string | null;
  direction: "long" | "short";
  context: LocalizedText;
  trade_thesis: LocalizedText;
  entry: NullablePriceEvent;
  initial_stop: NullablePriceEvent;
  trailing_method: LocalizedText;
  trailing_stops: NullablePriceEvent[];
  exit: NullablePriceEvent;
  adr: {
    period: number | null;
    completed_at_entry_percent: number | null;
    high: number | null;
    low: number | null;
    target: number | null;
  };
  ema: {
    ema15: number | null;
    ema50: number | null;
    higher_timeframe_ema15: number | null;
    ema15_context: LocalizedText;
    ema50_context: LocalizedText;
  };
  higher_timeframe_context: LocalizedText;
  performance: {
    risk_amount: number | null;
    result_amount: number | null;
    result_percent: number | null;
    result_r: number | null;
  };
  outcome_summary: LocalizedText;
  evidence: {
    status: "executed_account" | "source_backed" | "user_reported";
    method_version: string | null;
    timezone: string | null;
    signal_time: string | null;
    confirmation_time: string | null;
    entry_time: string | null;
    h1_source_sha256: string | null;
    d1_source_sha256: string | null;
    h1_rows: number | null;
    d1_rows: number | null;
    support_distance_adr: number | null;
    lower_wick_atr: number | null;
    next_48h_mfe_r: number | null;
    next_48h_mae_r: number | null;
  };
  notes: LocalizedText[];
  lessons: {
    what_worked: LocalizedText;
    what_was_imperfect: LocalizedText;
    invalidation: LocalizedText;
    a_plus: LocalizedText;
    downgrade: LocalizedText;
  };
  images: {
    original: string | null;
    annotated: string | null;
    annotation_file: string | null;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, path: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
}

function requireLocalizedText(value: unknown, path: string): void {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  requireString(value.zh, `${path}.zh`);
  requireString(value.en, `${path}.en`);
}

function requireNullableFiniteNumber(value: unknown, path: string): void {
  if (value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number or null`);
  }
}

function requirePriceEvent(value: unknown, path: string): void {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  requireNullableFiniteNumber(value.price, `${path}.price`);
  requireNullableFiniteNumber(value.candle_index, `${path}.candle_index`);
  requireLocalizedText(value.reason, `${path}.reason`);
}

export function validateRealMarketCase(value: unknown): asserts value is RealMarketCase {
  if (!isRecord(value)) throw new Error("RealMarketCase must be an object");
  requireString(value.id, "id");
  requireString(value.setup_id, "setup_id");
  if (value.case_type !== "executed_trade" && value.case_type !== "historical_pattern") {
    throw new Error("case_type must be executed_trade or historical_pattern");
  }
  requireString(value.symbol, "symbol");
  requireString(value.market, "market");
  requireString(value.execution_timeframe, "execution_timeframe");
  if (value.higher_timeframe !== null) requireString(value.higher_timeframe, "higher_timeframe");
  if (value.trade_date !== null) requireString(value.trade_date, "trade_date");
  if (value.direction !== "long" && value.direction !== "short") throw new Error("direction must be long or short");
  requireLocalizedText(value.context, "context");
  requireLocalizedText(value.trade_thesis, "trade_thesis");
  requirePriceEvent(value.entry, "entry");
  requirePriceEvent(value.initial_stop, "initial_stop");
  requireLocalizedText(value.trailing_method, "trailing_method");
  if (!Array.isArray(value.trailing_stops)) throw new Error("trailing_stops must be an array");
  value.trailing_stops.forEach((stop, index) => requirePriceEvent(stop, `trailing_stops[${index}]`));
  requirePriceEvent(value.exit, "exit");
  const adr = value.adr as Record<string, unknown>;
  requireNullableFiniteNumber(adr.period, "adr.period");
  requireNullableFiniteNumber(adr.completed_at_entry_percent, "adr.completed_at_entry_percent");
  requireNullableFiniteNumber(adr.high, "adr.high");
  requireNullableFiniteNumber(adr.low, "adr.low");
  requireNullableFiniteNumber(adr.target, "adr.target");
  const ema = value.ema as Record<string, unknown>;
  requireNullableFiniteNumber(ema.ema15, "ema.ema15");
  requireNullableFiniteNumber(ema.ema50, "ema.ema50");
  requireNullableFiniteNumber(ema.higher_timeframe_ema15, "ema.higher_timeframe_ema15");
  requireLocalizedText(ema.ema15_context, "ema.ema15_context");
  requireLocalizedText(ema.ema50_context, "ema.ema50_context");
  requireLocalizedText(value.higher_timeframe_context, "higher_timeframe_context");
  const performance = value.performance as Record<string, unknown>;
  requireNullableFiniteNumber(performance.risk_amount, "performance.risk_amount");
  requireNullableFiniteNumber(performance.result_amount, "performance.result_amount");
  requireNullableFiniteNumber(performance.result_percent, "performance.result_percent");
  requireNullableFiniteNumber(performance.result_r, "performance.result_r");
  requireLocalizedText(value.outcome_summary, "outcome_summary");
  const evidence = value.evidence as Record<string, unknown>;
  if (evidence.status !== "source_backed" && evidence.status !== "user_reported" && evidence.status !== "executed_account") {
    throw new Error("evidence.status is invalid");
  }
  for (const key of ["method_version", "timezone", "signal_time", "confirmation_time", "entry_time", "h1_source_sha256", "d1_source_sha256"]) {
    if (evidence[key] !== null) requireString(evidence[key], `evidence.${key}`);
  }
  for (const key of ["h1_rows", "d1_rows", "support_distance_adr", "lower_wick_atr", "next_48h_mfe_r", "next_48h_mae_r"]) {
    requireNullableFiniteNumber(evidence[key], `evidence.${key}`);
  }
  if (!Array.isArray(value.notes)) throw new Error("notes must be an array");
  value.notes.forEach((note, index) => requireLocalizedText(note, `notes[${index}]`));
  const lessons = value.lessons as Record<string, unknown>;
  for (const key of ["what_worked", "what_was_imperfect", "invalidation", "a_plus", "downgrade"]) requireLocalizedText(lessons[key], `lessons.${key}`);
  const images = value.images as Record<string, unknown>;
  for (const key of ["original", "annotated", "annotation_file"]) {
    if (images[key] !== null) requireString(images[key], `images.${key}`);
  }
}

function requireNormalizedCoordinate(value: unknown, path: string, nullable = false): void {
  if (nullable && value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${path} must be between 0 and 1${nullable ? " or null" : ""}`);
  }
}

export function validateAnnotationBundle(value: unknown): asserts value is AnnotationBundle {
  if (!isRecord(value)) throw new Error("Annotation bundle must be an object");
  requireString(value.case_id, "case_id");
  if (value.source_image !== null) requireString(value.source_image, "source_image");
  requireNullableFiniteNumber(value.image_width, "image_width");
  requireNullableFiniteNumber(value.image_height, "image_height");
  if (!Array.isArray(value.annotations)) throw new Error("annotations must be an array");
  value.annotations.forEach((annotation, index) => {
    if (!isRecord(annotation)) throw new Error(`annotations[${index}] must be an object`);
    requireString(annotation.id, `annotations[${index}].id`);
    if (!ANNOTATION_KINDS.includes(annotation.kind as AnnotationKind)) throw new Error(`annotations[${index}].kind is not supported`);
    requireLocalizedText(annotation.label, `annotations[${index}].label`);
    requireNormalizedCoordinate(annotation.x, `annotations[${index}].x`);
    requireNormalizedCoordinate(annotation.y, `annotations[${index}].y`);
    if ("x2" in annotation) requireNormalizedCoordinate(annotation.x2, `annotations[${index}].x2`, true);
    if ("y2" in annotation) requireNormalizedCoordinate(annotation.y2, `annotations[${index}].y2`, true);
  });
}

const caseInputs: unknown[] = [
  usdJpyCaseJson,
  avgoCaseJson,
  eurusdFalseBreakCaseJson,
  cadchfFalseBreak1CaseJson,
  cadchfFalseBreak2CaseJson,
  usdjpyFlatPbCaseJson,
  gbpjpyFlatPbCaseJson,
  audusdFlatPbCaseJson,
  audnzdFirstPbCaseJson,
  eurusdFirstPbCaseJson,
  eurjpyFirstPbCaseJson,
  usdchfFailedMtopCaseJson,
  gbpusdFailedMtopCaseJson,
  eurjpyFailedMtopCaseJson,
  usdjpyFailedWbot1CaseJson,
  usdjpyFailedWbot2CaseJson,
  audnzdFailedWbotCaseJson,
  usdchfExhaustCaseJson,
  cadchfExhaustCaseJson,
  gbpjpyExhaustCaseJson,
  cadchfLwAdrCaseJson,
  eurgbpLwAdrCaseJson,
  usdchfLwAdrCaseJson,
  audnzdMstarCaseJson,
  eurusdMtopRt1CaseJson,
  eurusdMtopRt2CaseJson,
  gbpusdMtopRtCaseJson,
];

caseInputs.forEach(validateRealMarketCase);
export const REAL_MARKET_CASES = caseInputs as RealMarketCase[];

const annotationInputs: unknown[] = [usdJpyAnnotationsJson, avgoAnnotationsJson];
annotationInputs.forEach(validateAnnotationBundle);
export const REAL_CASE_ANNOTATIONS = Object.fromEntries(
  (annotationInputs as AnnotationBundle[]).map((bundle) => [bundle.case_id, bundle]),
) as Record<string, AnnotationBundle>;

export function realCasesForSetup(setupId: string, cases: readonly RealMarketCase[] = REAL_MARKET_CASES): RealMarketCase[] {
  return cases.filter((marketCase) => marketCase.setup_id === setupId);
}

export function formatNullableMetric(value: number | null, suffix = "", digits = 1): string {
  return value === null ? "—" : `${value.toFixed(digits)}${suffix}`;
}
