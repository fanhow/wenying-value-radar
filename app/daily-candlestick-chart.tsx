"use client";

import { useEffect, useRef, useState } from "react";
import type { DailyCandle } from "../lib/price-history";
import type { Language } from "./language-context";

type Props = { ticker: string; market: "TW" | "US"; language: Language };

function drawChart(canvas: HTMLCanvasElement, candles: DailyCandle[]) {
  const bounds = canvas.getBoundingClientRect();
  const width = Math.max(Math.floor(bounds.width), 320);
  const height = 270;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.scale(ratio, ratio);

  const pad = { top: 16, right: 52, bottom: 34, left: 10 };
  const volumeHeight = 42;
  const priceBottom = height - pad.bottom - volumeHeight - 12;
  const visible = candles.slice(-90);
  const minPrice = Math.min(...visible.map((row) => row.low));
  const maxPrice = Math.max(...visible.map((row) => row.high));
  const priceRange = Math.max(maxPrice - minPrice, maxPrice * 0.02, 0.01);
  const maxVolume = Math.max(...visible.map((row) => row.volume), 1);
  const plotWidth = width - pad.left - pad.right;
  const slot = plotWidth / visible.length;
  const candleWidth = Math.max(2, Math.min(slot * 0.62, 8));
  const y = (value: number) => pad.top + ((maxPrice - value) / priceRange) * (priceBottom - pad.top);

  context.clearRect(0, 0, width, height);
  context.font = "10px system-ui, sans-serif";
  context.textAlign = "right";
  context.textBaseline = "middle";
  for (let index = 0; index <= 4; index += 1) {
    const value = maxPrice - (priceRange * index) / 4;
    const lineY = pad.top + ((priceBottom - pad.top) * index) / 4;
    context.strokeStyle = "#e7eee9";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(pad.left, lineY);
    context.lineTo(width - pad.right, lineY);
    context.stroke();
    context.fillStyle = "#81938b";
    context.fillText(value.toFixed(value >= 100 ? 1 : 2), width - 4, lineY);
  }

  visible.forEach((row, index) => {
    const center = pad.left + slot * index + slot / 2;
    const rising = row.close >= row.open;
    const color = rising ? "#c95b4a" : "#2c9872";
    context.strokeStyle = color;
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(center, y(row.high));
    context.lineTo(center, y(row.low));
    context.stroke();
    const top = Math.min(y(row.open), y(row.close));
    const bodyHeight = Math.max(Math.abs(y(row.open) - y(row.close)), 1.5);
    if (rising) context.fillRect(center - candleWidth / 2, top, candleWidth, bodyHeight);
    else context.strokeRect(center - candleWidth / 2, top, candleWidth, bodyHeight);

    const volumeTop = height - pad.bottom - (row.volume / maxVolume) * volumeHeight;
    context.globalAlpha = 0.34;
    context.fillRect(center - candleWidth / 2, volumeTop, candleWidth, height - pad.bottom - volumeTop);
    context.globalAlpha = 1;
  });

  const movingAverage = visible.map((_, index) => index < 19
    ? null
    : visible.slice(index - 19, index + 1).reduce((sum, row) => sum + row.close, 0) / 20);
  context.strokeStyle = "#b28a31";
  context.lineWidth = 1.5;
  context.beginPath();
  movingAverage.forEach((value, index) => {
    if (value === null) return;
    const center = pad.left + slot * index + slot / 2;
    if (index === 19) context.moveTo(center, y(value)); else context.lineTo(center, y(value));
  });
  context.stroke();

  context.fillStyle = "#81938b";
  context.textAlign = "left";
  context.textBaseline = "top";
  [0, Math.floor((visible.length - 1) / 2), visible.length - 1].forEach((index) => {
    const row = visible[index];
    if (!row) return;
    const x = pad.left + slot * index;
    context.fillText(row.date.slice(5), Math.min(x, width - pad.right - 28), height - 22);
  });
}

export function DailyCandlestickChart({ ticker, market, language }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [candles, setCandles] = useState<DailyCandle[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "empty">("loading");

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setCandles([]);
    void fetch(`/api/price-history?ticker=${encodeURIComponent(ticker)}&market=${market}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { candles?: DailyCandle[] };
        const rows = Array.isArray(payload.candles) ? payload.candles : [];
        setCandles(rows);
        setState(response.ok && rows.length >= 20 ? "ready" : "empty");
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setState("empty");
      });
    return () => controller.abort();
  }, [market, ticker]);

  useEffect(() => {
    if (state !== "ready" || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const render = () => drawChart(canvas, candles);
    render();
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [candles, state]);

  const latest = candles.at(-1);
  const change = latest && candles.length > 1 ? latest.close / candles[candles.length - 2].close - 1 : null;
  return (
    <section className="detail-section price-chart-section" aria-label={language === "zh" ? `${ticker} 日 K 線` : `${ticker} daily candlestick chart`}>
      <div className="detail-section-title chart-title-row"><div><h3>{language === "zh" ? "技術日 K 線" : "Daily Candlestick Chart"}</h3><span>{language === "zh" ? "近 6 個月 · 顯示 90 個交易日 · 黃線 MA20" : "6 months · 90 sessions · yellow MA20"}</span></div>{latest && <strong className={change !== null && change >= 0 ? "chart-up" : "chart-down"}>{latest.close.toFixed(latest.close >= 100 ? 1 : 2)} {change !== null ? `${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)}%` : ""}</strong>}</div>
      {state === "loading" && <div className="chart-state">{language === "zh" ? "正在載入日 K 線…" : "Loading daily candles…"}</div>}
      {state === "empty" && <div className="chart-state">{language === "zh" ? "目前無法取得歷史 K 線，估值資料不受影響" : "Price history is temporarily unavailable; valuation is unaffected"}</div>}
      <canvas ref={canvasRef} className={state === "ready" ? "price-chart-canvas" : "price-chart-canvas is-hidden"} />
      <p className="chart-footnote">{language === "zh" ? "紅漲綠跌 · K 線僅供技術型態判讀，不納入公允價值計算" : "Red up, green down · chart patterns are not included in fair-value calculations"}</p>
    </section>
  );
}

