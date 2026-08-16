"use client";

import { useEffect, useRef } from "react";
import type { DailyCandle } from "../lib/price-history";
import type { TechnicalAnalysis } from "../lib/technical-analysis";
import { detectTrendStructure, trendBoundaryValue, type TrendBoundary } from "../lib/trend-structure";
import type { Language } from "./language-context";

type ChartTimeframe = "daily" | "weekly" | "monthly";

function movingAverage(candles: DailyCandle[], period: number) {
  return candles.map((_, index) => {
    if (index + 1 < period) return null;
    const window = candles.slice(index + 1 - period, index + 1);
    return window.reduce((sum, candle) => sum + candle.close, 0) / period;
  });
}

function formatIndicator(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(value >= 100 ? 1 : 2);
}

function timeframeLabel(timeframe: "daily" | "weekly" | "monthly", language: Language) {
  if (timeframe === "daily") return language === "zh" ? "日線" : "daily";
  if (timeframe === "weekly") return language === "zh" ? "週線" : "weekly";
  return language === "zh" ? "月線" : "monthly";
}

function boundarySeries(name: string, boundary: TrendBoundary, candles: DailyCandle[], color: string) {
  return {
    name,
    type: "line",
    showSymbol: false,
    symbol: "none",
    connectNulls: false,
    data: candles.map((candle, index) => index < boundary.startIndex ? null : [candle.date, trendBoundaryValue(boundary, index)]),
    lineStyle: { color, width: 1.5, type: "dashed" },
    emphasis: { disabled: true },
    z: 3,
  };
}

function buildEChartsOption({ candles, ticker, language, analysis, timeframe }: { candles: DailyCandle[]; ticker: string; language: Language; analysis: TechnicalAnalysis | null; timeframe: ChartTimeframe }) {
  const trend = detectTrendStructure(candles);
  const timeframeName = timeframeLabel(timeframe, language);
  const keyLevels = (analysis?.keyLevels ?? []).map((level) => ({
    name: language === "zh"
      ? `${timeframeLabel(level.timeframe, language)}${level.kind === "support" ? "支撐" : "壓力"} ${formatIndicator(level.price)}`
      : `${timeframeLabel(level.timeframe, language)} ${level.kind} ${formatIndicator(level.price)}`,
    yAxis: level.price,
    lineStyle: {
      color: level.kind === "support" ? "#a8731d" : "#566f78",
      type: level.timeframe === "daily" ? "dashed" : level.timeframe === "weekly" ? "dotted" : "solid",
      width: level.timeframe === "monthly" ? 2 : 1,
    },
    label: { show: true, position: "insideStartTop", color: level.kind === "support" ? "#8f6817" : "#566f78" },
  }));
  const trendSeries = trend.channel
    ? [
      boundarySeries(language === "zh" ? `${trend.direction === "ascending" ? "上升" : "下降"}通道下緣` : `${trend.direction} channel lower`, trend.channel.lower, candles, "#d06b55"),
      boundarySeries(language === "zh" ? `${trend.direction === "ascending" ? "上升" : "下降"}通道上緣` : `${trend.direction} channel upper`, trend.channel.upper, candles, "#6c78c4"),
    ]
    : trend.trendline
      ? [boundarySeries(language === "zh" ? `${trend.direction === "ascending" ? "上升" : "下降"}趨勢線` : `${trend.direction} trendline`, trend.trendline, candles, "#b45b86")]
      : [];
  const maSeries = (period: number, name: string, color: string) => ({
    name,
    type: "line",
    showSymbol: false,
    symbol: "none",
    connectNulls: false,
    data: movingAverage(candles, period).map((value, index) => value === null ? null : [candles[index].date, value]),
    lineStyle: { color, width: 1.5 },
    emphasis: { disabled: true },
    z: 2,
  });

  return {
    animation: false,
    backgroundColor: "#fbfcfb",
    aria: { enabled: true, decal: { show: false } },
    legend: {
      top: 9,
      left: 14,
      right: 14,
      type: "scroll",
      textStyle: { color: "#566f78", fontSize: 11 },
      data: ["MA5", "MA20", "MA60", ...trendSeries.map((series) => series.name)],
    },
    tooltip: { trigger: "axis", axisPointer: { type: "cross" }, confine: true },
    grid: [
      { left: 52, right: 64, top: 46, height: "62%" },
      { left: 52, right: 64, top: "78%", height: "13%" },
    ],
    xAxis: [
      { type: "category", data: candles.map((candle) => candle.date), boundaryGap: true, axisLine: { lineStyle: { color: "#cbd9d1" } }, axisLabel: { color: "#72858a", fontSize: 10, hideOverlap: true }, axisPointer: { label: { backgroundColor: "#566f78" } } },
      { type: "category", gridIndex: 1, data: candles.map((candle) => candle.date), boundaryGap: true, axisLine: { lineStyle: { color: "#cbd9d1" } }, axisLabel: { color: "#72858a", fontSize: 10, hideOverlap: true } },
    ],
    yAxis: [
      { scale: true, splitLine: { lineStyle: { color: "#e0e8e3" } }, axisLabel: { color: "#72858a", fontSize: 10, formatter: (value: number) => formatIndicator(value) } },
      { gridIndex: 1, scale: true, splitLine: { show: false }, axisLabel: { color: "#72858a", fontSize: 9, formatter: (value: number) => formatIndicator(value) } },
    ],
    dataZoom: [
      { type: "inside", xAxisIndex: [0, 1], filterMode: "filter" },
      { type: "slider", xAxisIndex: [0, 1], bottom: 8, height: 18, borderColor: "#dce6e0", fillerColor: "rgba(71, 118, 104, .14)", handleStyle: { color: "#477668" }, textStyle: { color: "#72858a", fontSize: 9 } },
    ],
    series: [
      {
        name: language === "zh" ? `${ticker} ${timeframeName} K 線` : `${ticker} ${timeframeName} candles`,
        type: "candlestick",
        data: candles.map((candle) => [candle.open, candle.close, candle.low, candle.high]),
        itemStyle: { color: "#d94b45", color0: "#15986c", borderColor: "#d94b45", borderColor0: "#15986c" },
        markLine: { silent: true, symbol: "none", data: keyLevels },
        z: 4,
      },
      maSeries(5, "MA5", "#4ca6e8"),
      maSeries(20, "MA20", "#d9732d"),
      maSeries(60, "MA60", "#6d55c5"),
      {
        name: language === "zh" ? "成交量" : "Volume",
        type: "bar",
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: candles.map((candle) => ({ value: candle.volume, itemStyle: { color: candle.close >= candle.open ? "#e58b86" : "#68bea1" } })),
        barMaxWidth: 12,
        emphasis: { disabled: true },
      },
      ...trendSeries,
    ],
  };
}

export function EChartsCandlestickChart({ candles, ticker, language, analysis, timeframe }: { candles: DailyCandle[]; ticker: string; language: Language; analysis: TechnicalAnalysis | null; timeframe: ChartTimeframe }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timeframeName = timeframeLabel(timeframe, language);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !candles.length) return;
    let disposed = false;
    let disposeChart: (() => void) | null = null;
    let resizeChart: (() => void) | null = null;
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => resizeChart?.());
    const handleResize = () => resizeChart?.();

    void import("echarts").then(({ init }) => {
      if (disposed) return;
      const chart = init(container);
      chart.setOption(buildEChartsOption({ candles, ticker, language, analysis, timeframe }) as Parameters<typeof chart.setOption>[0]);
      resizeChart = () => chart.resize();
      disposeChart = () => chart.dispose();
      resizeObserver?.observe(container);
      window.addEventListener("resize", handleResize);
    }).catch(() => {
      if (!disposed) container.replaceChildren();
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleResize);
      disposeChart?.();
    };
  }, [analysis, candles, language, ticker, timeframe]);

  return <div ref={containerRef} className="public-chart-widget echarts-candlestick-widget" role="img" aria-label={language === "zh" ? `${ticker} ${timeframeName} K 線與趨勢線` : `${ticker} ${timeframeName} candlestick chart with trendlines`} />;
}
