#!/usr/bin/env python3
"""
Deterministic FX Pattern Scanner — All 10 Setup Library Patterns
================================================================
Scans preserved D1/H1 CSV archives for real-market examples of every
pattern defined in the Setup Library.

Multi-timeframe Execution Logic:
1. D1 identifies pattern formation and primary setup direction.
2. H1 searches for precise entry trigger within the immediate follow-up window.
3. Sets Entry, Stop Loss, and Take Profit (including ADR when applicable).
4. Strictly prevents look-ahead bias: at candle index i, only candles [0..i]
   are used for setup detection and entry decisions. Future data is used ONLY
   for outcome measurement (MFE, MAE, TP hit, SL hit).

Coverage Alignment:
- D1 / 1440 has ~5100 candles (2010 -> 2026 for most pairs)
- H1 / 60 has ~5200 candles (Oct 2025 -> Aug 2026)
- Overlap period: [max(D1_start, H1_start), min(D1_end, H1_end)]
- Patterns outside H1 coverage are preserved and recorded as D1_PATTERN_OUTSIDE_H1_COVERAGE.
- Patterns within coverage that trigger valid H1 entries are recorded as COMPLETE_REAL_MARKET_CASE.

Usage:
    python scripts/scan-all-patterns.py --data-root /path/to/FX_RESEARCH/data --output-dir data/real_cases/generated --image-output public/real-cases
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
import pandas as pd

# ──────────────────────────────────────────────────────────────
# Constants & Definitions
# ──────────────────────────────────────────────────────────────
COLUMNS = ["date", "time", "open", "high", "low", "close", "volume"]
METHOD_VERSION = "fx-all-patterns-v2"

SETUP_DEFINITIONS = [
    {"id": "false_break_reclaim",     "number": 1,  "direction": "long",  "titleZh": "假跌破與收復",          "titleEn": "False Break + Reclaim"},
    {"id": "flat_pullback",           "number": 2,  "direction": "long",  "titleZh": "平台回調與趨勢延續",    "titleEn": "Flat Pullback + Trend Continuation"},
    {"id": "first_pullback",          "number": 3,  "direction": "long",  "titleZh": "突破後第一次回踩",      "titleEn": "Breakout to First Pullback"},
    {"id": "compression_expansion",   "number": 4,  "direction": "long",  "titleZh": "波動收縮轉擴張",        "titleEn": "Compression to Expansion"},
    {"id": "failed_m_top",            "number": 5,  "direction": "long",  "titleZh": "M 頂失敗後多頭反轉",    "titleEn": "Failed M Top to Bullish Reversal"},
    {"id": "failed_w_bottom",         "number": 6,  "direction": "short", "titleZh": "W 底失敗後空頭反轉",    "titleEn": "Failed W Bottom to Bearish Reversal"},
    {"id": "exhaustion_reversal",     "number": 7,  "direction": "long",  "titleZh": "耗竭跌勢後反轉",        "titleEn": "Exhaustion Move to Reversal"},
    {"id": "lower_wick_adr",          "number": 8,  "direction": "long",  "titleZh": "支撐長下影與 ADR 空間", "titleEn": "Long Lower Wick at Support to ADR"},
    {"id": "morning_star_support",    "number": 9,  "direction": "long",  "titleZh": "主要支撐的早晨之星",    "titleEn": "Morning Star at Major Support"},
    {"id": "mtop_break_retest",       "number": 10, "direction": "short", "titleZh": "M 頂破頸線回測後續跌",  "titleEn": "M-Top Neckline Break, Retest, Short"},
]


# ──────────────────────────────────────────────────────────────
# Data structures
# ──────────────────────────────────────────────────────────────
@dataclass
class SourceProfile:
    symbol: str
    timeframe: str
    path: str
    sha256: str
    rows_raw: int
    rows_complete: int
    start: str
    end: str


@dataclass
class PairCoverage:
    symbol: str
    d1_start: str
    d1_end: str
    d1_rows: int
    h1_start: str
    h1_end: str
    h1_rows: int
    overlap_start: str
    overlap_end: str
    status: str


@dataclass
class Candidate:
    id: str
    symbol: str
    setup_id: str
    direction: Literal["long", "short"]
    d1_setup_date: str
    d1_ohlc: dict
    d1_reasoning: str
    validation_status: Literal[
        "COMPLETE_REAL_MARKET_CASE",
        "D1_PATTERN_OUTSIDE_H1_COVERAGE",
        "D1_PATTERN_NO_H1_TRIGGER",
    ]
    coverage_reason: str
    h1_entry_time: str | None = None
    h1_entry_price: float | None = None
    h1_entry_trigger: str = ""
    stop_loss: float | None = None
    stop_distance: float | None = None
    take_profit: float | None = None
    target_method: str = ""
    risk_reward: float | None = None
    # outcome fields (calculated strictly post-entry)
    tp_hit: bool | None = None
    sl_hit: bool | None = None
    mfe: float | None = None
    mae: float | None = None
    achieved_r: float | None = None
    outcome: str = ""
    score: float = 0.0
    # indices for charting
    d1_setup_index: int = 0
    h1_signal_index: int | None = None
    h1_entry_index: int | None = None
    # technical metrics
    adr20: float | None = None
    adr_used_pct: float | None = None
    h1_ema15_at_entry: float | None = None
    h1_ema50_at_entry: float | None = None
    d1_ema15: float | None = None
    d1_support20: float | None = None
    d1_resist20: float | None = None


# ──────────────────────────────────────────────────────────────
# File Loader & Indicators
# ──────────────────────────────────────────────────────────────
def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_bars(path: Path, symbol: str, timeframe: str) -> tuple[pd.DataFrame, SourceProfile]:
    frame = pd.read_csv(path, names=COLUMNS, header=None)
    raw_count = len(frame)
    frame["timestamp"] = pd.to_datetime(
        frame["date"] + " " + frame["time"], format="%Y.%m.%d %H:%M", errors="raise"
    )
    for col in ["open", "high", "low", "close", "volume"]:
        frame[col] = pd.to_numeric(frame[col], errors="raise")
    # Drop duplicate timestamps, keeping first
    frame = frame.drop_duplicates(subset="timestamp", keep="first")
    # Sanity check OHLC integrity
    valid = (frame["high"] >= frame[["open", "close", "low"]].max(axis=1)) & \
            (frame["low"] <= frame[["open", "close", "high"]].min(axis=1))
    frame = frame[valid].copy()
    # Drop partial off-cadence final row in H1
    if timeframe == "H1" and len(frame) > 0 and frame.iloc[-1]["timestamp"].minute != 0:
        frame = frame.iloc[:-1].copy()
    frame = frame.sort_values("timestamp").reset_index(drop=True)
    profile = SourceProfile(
        symbol=symbol, timeframe=timeframe, path=path.name,
        sha256=sha256_file(path), rows_raw=raw_count, rows_complete=len(frame),
        start=frame.iloc[0]["timestamp"].isoformat() if len(frame) > 0 else "",
        end=frame.iloc[-1]["timestamp"].isoformat() if len(frame) > 0 else "",
    )
    return frame, profile


def ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False, min_periods=span).mean()


def sma(series: pd.Series, window: int) -> pd.Series:
    return series.rolling(window, min_periods=window).mean()


def true_range(frame: pd.DataFrame) -> pd.Series:
    prev_close = frame["close"].shift(1)
    return pd.concat([
        frame["high"] - frame["low"],
        (frame["high"] - prev_close).abs(),
        (frame["low"] - prev_close).abs(),
    ], axis=1).max(axis=1)


def body(row) -> float:
    return abs(row.close - row.open)


def candle_range(row) -> float:
    return row.high - row.low


def is_bullish(row) -> bool:
    return row.close > row.open


def is_bearish(row) -> bool:
    return row.close < row.open


def lower_wick(row) -> float:
    return min(row.open, row.close) - row.low


def upper_wick(row) -> float:
    return row.high - max(row.open, row.close)


def prepare_d1(frame: pd.DataFrame) -> pd.DataFrame:
    d = frame.copy()
    d["ema15"] = ema(d["close"], 15)
    d["ema50"] = ema(d["close"], 50)
    d["sma50"] = sma(d["close"], 50)
    d["sma20"] = sma(d["close"], 20)
    d["adr20"] = (d["high"] - d["low"]).rolling(20, min_periods=20).mean()
    d["atr14"] = true_range(d).rolling(14, min_periods=14).mean()
    d["support20"] = d["low"].rolling(20, min_periods=20).min()
    d["resist20"] = d["high"].rolling(20, min_periods=20).max()
    d["support50"] = d["low"].rolling(50, min_periods=50).min()
    d["resist50"] = d["high"].rolling(50, min_periods=50).max()
    d["vol_ma20"] = d["volume"].rolling(20, min_periods=20).mean()
    return d


def prepare_h1(frame: pd.DataFrame, daily: pd.DataFrame) -> pd.DataFrame:
    h = frame.copy()
    h["ema15"] = ema(h["close"], 15)
    h["ema50"] = ema(h["close"], 50)
    h["atr14"] = true_range(h).rolling(14, min_periods=14).mean()
    # Merge D1 context available at the start of the session (strictly no look-ahead)
    ctx = daily[["timestamp", "ema15", "ema50", "adr20", "atr14", "support20", "resist20", "support50", "resist50"]].copy()
    ctx["available_at"] = ctx["timestamp"].dt.normalize() + pd.Timedelta(days=1)
    ctx = ctx.rename(columns={
        "ema15": "d1_ema15", "ema50": "d1_ema50",
        "adr20": "d1_adr20", "atr14": "d1_atr14",
        "support20": "d1_support20", "resist20": "d1_resist20",
        "support50": "d1_support50", "resist50": "d1_resist50",
    })
    h = pd.merge_asof(
        h.sort_values("timestamp"),
        ctx[["available_at", "d1_ema15", "d1_ema50", "d1_adr20", "d1_atr14",
             "d1_support20", "d1_resist20", "d1_support50", "d1_resist50"]].sort_values("available_at"),
        left_on="timestamp", right_on="available_at", direction="backward",
    )
    h["session_day"] = h["timestamp"].dt.normalize()
    h["day_high_so_far"] = h.groupby("session_day")["high"].cummax()
    h["day_low_so_far"] = h.groupby("session_day")["low"].cummin()
    h["adr_used"] = h["day_high_so_far"] - h["day_low_so_far"]
    return h


def evaluate_outcome(c: Candidate, h1: pd.DataFrame, bars_forward: int = 120) -> None:
    """Evaluate outcome strictly using bars after entry."""
    if c.h1_entry_index is None or c.h1_entry_price is None or c.stop_loss is None:
        return
    start = c.h1_entry_index
    end = min(start + bars_forward, len(h1))
    future = h1.iloc[start:end]
    if len(future) == 0:
        return
    
    entry = c.h1_entry_price
    sl = c.stop_loss
    risk = abs(entry - sl)
    if risk <= 0:
        return
    
    is_long = c.direction == "long"
    if is_long:
        c.mfe = round((future["high"].max() - entry) / risk, 3)
        c.mae = round((future["low"].min() - entry) / risk, 3)
    else:
        c.mfe = round((entry - future["low"].min()) / risk, 3)
        c.mae = round((entry - future["high"].max()) / risk, 3)
    
    tp = c.take_profit
    for _, bar in future.iterrows():
        if is_long:
            if bar.low <= sl:
                c.sl_hit = True
                c.achieved_r = round((sl - entry) / risk, 3)
                c.outcome = "SL hit"
                return
            if tp is not None and bar.high >= tp:
                c.tp_hit = True
                c.achieved_r = round((tp - entry) / risk, 3)
                c.outcome = "TP hit"
                return
        else:
            if bar.high >= sl:
                c.sl_hit = True
                c.achieved_r = round((entry - sl) / risk, 3)
                c.outcome = "SL hit"
                return
            if tp is not None and bar.low <= tp:
                c.tp_hit = True
                c.achieved_r = round((entry - tp) / risk, 3)
                c.outcome = "TP hit"
                return
    
    c.outcome = "neither"
    if is_long:
        c.achieved_r = round((future.iloc[-1]["close"] - entry) / risk, 3)
    else:
        c.achieved_r = round((entry - future.iloc[-1]["close"]) / risk, 3)


# ══════════════════════════════════════════════════════════════
# PATTERN DETECTORS (D1 Setup + H1 Entry Window Alignment)
# ══════════════════════════════════════════════════════════════

def get_h1_window(h1: pd.DataFrame, d1_day: pd.Timestamp, max_days: int = 7) -> tuple[pd.DataFrame, bool]:
    """
    Extract H1 bars immediately following D1 setup.
    Returns (h1_subset, is_within_coverage).
    """
    if len(h1) == 0:
        return pd.DataFrame(), False
    h1_start = h1.iloc[0]["timestamp"].normalize()
    h1_end = h1.iloc[-1]["timestamp"].normalize()
    window_end = d1_day + pd.Timedelta(days=max_days)
    
    # Check if this D1 setup's H1 execution window falls inside H1 coverage
    if d1_day < h1_start or d1_day > h1_end:
        return pd.DataFrame(), False
    
    subset = h1[(h1["timestamp"] > d1_day) & (h1["timestamp"] <= window_end)].copy()
    return subset, True


# ──────────────────────────────────────────────────────────
# Pattern 01: False Break + Reclaim (LONG)
# ──────────────────────────────────────────────────────────
def scan_false_break_reclaim(symbol: str, d1: pd.DataFrame, h1: pd.DataFrame) -> list[Candidate]:
    candidates = []
    if len(d1) < 60:
        return candidates
    
    for i in range(30, len(d1) - 1):
        row = d1.iloc[i]
        if not all(np.isfinite(v) and v > 0 for v in [row.adr20, row.support20, row.atr14]):
            continue
        
        # Support from completed prior bars
        support = d1.iloc[:i]["low"].rolling(20, min_periods=20).min().iloc[-1] if i >= 20 else np.nan
        if not np.isfinite(support):
            continue
        
        if row.low >= support or row.close <= support:
            continue
        lw = lower_wick(row)
        cr = candle_range(row)
        if cr <= 0 or lw < cr * 0.3:
            continue
        
        prior_tests = sum(1 for j in range(max(0, i-20), i) if d1.iloc[j].low <= support * 1.003)
        if prior_tests < 1:
            continue
        
        setup_date = row.timestamp.strftime("%Y-%m-%d")
        d1_day = row.timestamp.normalize()
        
        # H1 window
        h1_after, inside_coverage = get_h1_window(h1, d1_day, max_days=7)
        
        if not inside_coverage:
            candidates.append(Candidate(
                id=f"{symbol.lower()}_false_break_{row.timestamp:%Y%m%d}",
                symbol=symbol, setup_id="false_break_reclaim", direction="long",
                d1_setup_date=setup_date,
                d1_ohlc={"o": round(row.open, 6), "h": round(row.high, 6), "l": round(row.low, 6), "c": round(row.close, 6)},
                d1_reasoning=f"D1 broke below support {support:.5f} (low {row.low:.5f}) and reclaimed at {row.close:.5f}.",
                validation_status="D1_PATTERN_OUTSIDE_H1_COVERAGE",
                coverage_reason="outside H1 historical coverage",
                d1_setup_index=i, d1_support20=round(support, 6), d1_ema15=round(row.ema15, 6) if np.isfinite(row.ema15) else None,
                adr20=round(row.adr20, 6) if np.isfinite(row.adr20) else None,
            ))
            continue
        
        # Look for H1 confirmation trigger within window
        entry_found = False
        for hi in range(min(40, len(h1_after))):
            hbar = h1_after.iloc[hi]
            if hbar.close > row.high and hbar.close > hbar.ema15:
                entry_idx = h1_after.index[hi] + 1
                if entry_idx >= len(h1):
                    continue
                entry_bar = h1.iloc[entry_idx]
                entry_price = entry_bar.open
                sl = row.low - row.atr14 * 0.1
                risk = entry_price - sl
                if risk <= 0:
                    continue
                tp = entry_price + risk * 2.0
                
                c = Candidate(
                    id=f"{symbol.lower()}_false_break_{row.timestamp:%Y%m%d}",
                    symbol=symbol, setup_id="false_break_reclaim", direction="long",
                    d1_setup_date=setup_date,
                    d1_ohlc={"o": round(row.open, 6), "h": round(row.high, 6), "l": round(row.low, 6), "c": round(row.close, 6)},
                    d1_reasoning=f"D1 broke below {support:.5f} support (low {row.low:.5f}) then reclaimed with close {row.close:.5f}. Lower wick {lw:.5f} shows rejection.",
                    validation_status="COMPLETE_REAL_MARKET_CASE",
                    coverage_reason="fully validated",
                    h1_entry_time=entry_bar.timestamp.isoformat(),
                    h1_entry_price=round(entry_price, 6),
                    h1_entry_trigger=f"H1 close above D1 rejection high {row.high:.5f} and EMA15, entry next bar open",
                    stop_loss=round(sl, 6), stop_distance=round(risk, 6),
                    take_profit=round(tp, 6), target_method="2R multiple",
                    risk_reward=2.0, d1_setup_index=i,
                    h1_signal_index=h1_after.index[hi], h1_entry_index=entry_idx,
                    adr20=round(row.adr20, 6) if np.isfinite(row.adr20) else None,
                    d1_support20=round(support, 6), d1_ema15=round(row.ema15, 6) if np.isfinite(row.ema15) else None,
                    h1_ema15_at_entry=round(entry_bar.ema15, 6) if np.isfinite(entry_bar.ema15) else None,
                    h1_ema50_at_entry=round(entry_bar.ema50, 6) if np.isfinite(entry_bar.ema50) else None,
                )
                wick_score = min(lw / row.atr14, 2.0) if row.atr14 > 0 else 0
                support_dist = abs(row.low - support) / row.adr20 if row.adr20 > 0 else 1
                c.score = wick_score * 2 + max(0, 0.15 - support_dist) * 10 + prior_tests * 0.5
                candidates.append(c)
                entry_found = True
                break
        
        if not entry_found:
            candidates.append(Candidate(
                id=f"{symbol.lower()}_false_break_{row.timestamp:%Y%m%d}",
                symbol=symbol, setup_id="false_break_reclaim", direction="long",
                d1_setup_date=setup_date,
                d1_ohlc={"o": round(row.open, 6), "h": round(row.high, 6), "l": round(row.low, 6), "c": round(row.close, 6)},
                d1_reasoning=f"D1 broke below support {support:.5f} and reclaimed at {row.close:.5f}.",
                validation_status="D1_PATTERN_NO_H1_TRIGGER",
                coverage_reason="H1 trigger condition not met within window",
                d1_setup_index=i, d1_support20=round(support, 6),
            ))
    
    return candidates


# ──────────────────────────────────────────────────────────
# Pattern 02: Flat Pullback + Trend Continuation (LONG)
# ──────────────────────────────────────────────────────────
def scan_flat_pullback(symbol: str, d1: pd.DataFrame, h1: pd.DataFrame) -> list[Candidate]:
    candidates = []
    if len(d1) < 60:
        return candidates
    
    for i in range(30, len(d1) - 1):
        row = d1.iloc[i]
        if not all(np.isfinite(v) for v in [row.ema15, row.ema50, row.adr20, row.atr14]):
            continue
        if row.ema15 <= row.ema50 or i < 5:
            continue
        ema15_5ago = d1.iloc[i-5].ema15
        ema50_5ago = d1.iloc[i-5].ema50
        if not (np.isfinite(ema15_5ago) and np.isfinite(ema50_5ago)):
            continue
        if row.ema15 <= ema15_5ago or row.ema50 <= ema50_5ago:
            continue
        
        lookback_start = max(0, i - 25)
        lookback_end = max(0, i - 5)
        if lookback_end <= lookback_start:
            continue
        prior_low = d1.iloc[lookback_start:lookback_end]["low"].min()
        prior_rise = (row.close - prior_low) / prior_low if prior_low > 0 else 0
        if prior_rise < 0.025:
            continue
        
        consol = d1.iloc[max(0, i-7):i+1]
        consol_high = consol["high"].max()
        consol_low = consol["low"].min()
        consol_range = consol_high - consol_low
        if row.adr20 > 0 and consol_range > row.adr20 * 2.5:
            continue
        if row.close <= consol_high * 0.998:
            continue
        
        setup_date = row.timestamp.strftime("%Y-%m-%d")
        d1_day = row.timestamp.normalize()
        
        h1_after, inside_coverage = get_h1_window(h1, d1_day, max_days=7)
        if not inside_coverage:
            candidates.append(Candidate(
                id=f"{symbol.lower()}_flat_pb_{row.timestamp:%Y%m%d}",
                symbol=symbol, setup_id="flat_pullback", direction="long",
                d1_setup_date=setup_date,
                d1_ohlc={"o": round(row.open, 6), "h": round(row.high, 6), "l": round(row.low, 6), "c": round(row.close, 6)},
                d1_reasoning=f"EMA15 > EMA50 rising. Advance {prior_rise*100:.1f}%, tight consolidation {consol_range:.5f}. Breakout above {consol_high:.5f}.",
                validation_status="D1_PATTERN_OUTSIDE_H1_COVERAGE",
                coverage_reason="outside H1 historical coverage",
                d1_setup_index=i, adr20=round(row.adr20, 6), d1_ema15=round(row.ema15, 6),
            ))
            continue
        
        entry_found = False
        for hi in range(min(30, len(h1_after))):
            hbar = h1_after.iloc[hi]
            if hbar.close > consol_high and hbar.close > hbar.ema15:
                entry_idx = h1_after.index[hi] + 1
                if entry_idx >= len(h1):
                    continue
                entry_bar = h1.iloc[entry_idx]
                entry_price = entry_bar.open
                sl = consol_low - row.atr14 * 0.15
                risk = entry_price - sl
                if risk <= 0:
                    continue
                tp = entry_price + risk * 2.5
                
                c = Candidate(
                    id=f"{symbol.lower()}_flat_pb_{row.timestamp:%Y%m%d}",
                    symbol=symbol, setup_id="flat_pullback", direction="long",
                    d1_setup_date=setup_date,
                    d1_ohlc={"o": round(row.open, 6), "h": round(row.high, 6), "l": round(row.low, 6), "c": round(row.close, 6)},
                    d1_reasoning=f"EMA15 {row.ema15:.5f} > EMA50 {row.ema50:.5f}, both rising. Prior {prior_rise*100:.1f}% advance, then tight consolidation {consol_range:.5f}. Breakout above {consol_high:.5f}.",
                    validation_status="COMPLETE_REAL_MARKET_CASE",
                    coverage_reason="fully validated",
                    h1_entry_time=entry_bar.timestamp.isoformat(),
                    h1_entry_price=round(entry_price, 6),
                    h1_entry_trigger=f"H1 breakout above consolidation ceiling {consol_high:.5f}",
                    stop_loss=round(sl, 6), stop_distance=round(risk, 6),
                    take_profit=round(tp, 6), target_method="2.5R multiple",
                    risk_reward=2.5, d1_setup_index=i,
                    h1_signal_index=h1_after.index[hi], h1_entry_index=entry_idx,
                    adr20=round(row.adr20, 6), d1_ema15=round(row.ema15, 6),
                    h1_ema15_at_entry=round(entry_bar.ema15, 6) if np.isfinite(entry_bar.ema15) else None,
                    h1_ema50_at_entry=round(entry_bar.ema50, 6) if np.isfinite(entry_bar.ema50) else None,
                )
                c.score = prior_rise * 100 + min(consol_range / row.adr20, 1.0) * (-2) + 3
                candidates.append(c)
                entry_found = True
                break
        
        if not entry_found:
            candidates.append(Candidate(
                id=f"{symbol.lower()}_flat_pb_{row.timestamp:%Y%m%d}",
                symbol=symbol, setup_id="flat_pullback", direction="long",
                d1_setup_date=setup_date,
                d1_ohlc={"o": round(row.open, 6), "h": round(row.high, 6), "l": round(row.low, 6), "c": round(row.close, 6)},
                d1_reasoning=f"Flat pullback setup on D1, no H1 breakout trigger.",
                validation_status="D1_PATTERN_NO_H1_TRIGGER",
                coverage_reason="H1 trigger condition not met within window",
                d1_setup_index=i,
            ))
    
    return candidates


# ──────────────────────────────────────────────────────────
# Pattern 03: Breakout to First Pullback (LONG)
# ──────────────────────────────────────────────────────────
def scan_first_pullback(symbol: str, d1: pd.DataFrame, h1: pd.DataFrame) -> list[Candidate]:
    candidates = []
    if len(d1) < 60:
        return candidates
    
    for i in range(30, len(d1) - 3):
        row = d1.iloc[i]
        if not all(np.isfinite(v) for v in [row.adr20, row.atr14]):
            continue
        
        lookback = d1.iloc[max(0, i-30):i]
        if len(lookback) < 10:
            continue
        resist_zone = lookback["high"].quantile(0.85)
        tests = sum(1 for _, lb in lookback.iterrows() if abs(lb.high - resist_zone) < row.adr20 * 0.25)
        if tests < 2 or row.close <= resist_zone:
            continue
        breakout_pct = (row.close - resist_zone) / resist_zone
        if breakout_pct < 0.001:
            continue
        
        for pb_offset in range(1, min(6, len(d1) - i)):
            pb_bar = d1.iloc[i + pb_offset]
            if pb_bar.low <= resist_zone * 1.005 and pb_bar.close >= resist_zone * 0.997:
                lw = lower_wick(pb_bar)
                if lw < candle_range(pb_bar) * 0.2:
                    continue
                
                setup_date = pb_bar.timestamp.strftime("%Y-%m-%d")
                d1_day = pb_bar.timestamp.normalize()
                
                h1_after, inside_coverage = get_h1_window(h1, d1_day, max_days=7)
                if not inside_coverage:
                    candidates.append(Candidate(
                        id=f"{symbol.lower()}_first_pb_{pb_bar.timestamp:%Y%m%d}",
                        symbol=symbol, setup_id="first_pullback", direction="long",
                        d1_setup_date=setup_date,
                        d1_ohlc={"o": round(pb_bar.open, 6), "h": round(pb_bar.high, 6), "l": round(pb_bar.low, 6), "c": round(pb_bar.close, 6)},
                        d1_reasoning=f"Resistance {resist_zone:.5f} tested {tests}x, broken then retested as support at {pb_bar.low:.5f}.",
                        validation_status="D1_PATTERN_OUTSIDE_H1_COVERAGE",
                        coverage_reason="outside H1 historical coverage",
                        d1_setup_index=i + pb_offset, adr20=round(row.adr20, 6), d1_resist20=round(resist_zone, 6),
                    ))
                    break
                
                entry_found = False
                for hi in range(min(25, len(h1_after))):
                    hbar = h1_after.iloc[hi]
                    if hbar.close > pb_bar.high:
                        entry_idx = h1_after.index[hi] + 1
                        if entry_idx >= len(h1):
                            continue
                        entry_bar = h1.iloc[entry_idx]
                        entry_price = entry_bar.open
                        sl = pb_bar.low - row.atr14 * 0.1
                        risk = entry_price - sl
                        if risk <= 0:
                            continue
                        tp = entry_price + risk * 2.0
                        
                        c = Candidate(
                            id=f"{symbol.lower()}_first_pb_{pb_bar.timestamp:%Y%m%d}",
                            symbol=symbol, setup_id="first_pullback", direction="long",
                            d1_setup_date=setup_date,
                            d1_ohlc={"o": round(pb_bar.open, 6), "h": round(pb_bar.high, 6), "l": round(pb_bar.low, 6), "c": round(pb_bar.close, 6)},
                            d1_reasoning=f"Resistance {resist_zone:.5f} tested {tests}x, broken on {d1.iloc[i].timestamp:%Y-%m-%d}. Pullback low {pb_bar.low:.5f} holds as support.",
                            validation_status="COMPLETE_REAL_MARKET_CASE",
                            coverage_reason="fully validated",
                            h1_entry_time=entry_bar.timestamp.isoformat(),
                            h1_entry_price=round(entry_price, 6),
                            h1_entry_trigger=f"H1 break above pullback high {pb_bar.high:.5f}",
                            stop_loss=round(sl, 6), stop_distance=round(risk, 6),
                            take_profit=round(tp, 6), target_method="2R from pullback",
                            risk_reward=2.0, d1_setup_index=i + pb_offset,
                            h1_signal_index=h1_after.index[hi], h1_entry_index=entry_idx,
                            adr20=round(row.adr20, 6), d1_resist20=round(resist_zone, 6),
                            d1_ema15=round(pb_bar.ema15, 6) if np.isfinite(pb_bar.ema15) else None,
                            h1_ema15_at_entry=round(entry_bar.ema15, 6) if np.isfinite(entry_bar.ema15) else None,
                            h1_ema50_at_entry=round(entry_bar.ema50, 6) if np.isfinite(entry_bar.ema50) else None,
                        )
                        c.score = tests * 1.5 + breakout_pct * 500 + min(lw / row.atr14, 2) * 1.5
                        candidates.append(c)
                        entry_found = True
                        break
                if not entry_found:
                    candidates.append(Candidate(
                        id=f"{symbol.lower()}_first_pb_{pb_bar.timestamp:%Y%m%d}",
                        symbol=symbol, setup_id="first_pullback", direction="long",
                        d1_setup_date=setup_date,
                        d1_ohlc={"o": round(pb_bar.open, 6), "h": round(pb_bar.high, 6), "l": round(pb_bar.low, 6), "c": round(pb_bar.close, 6)},
                        d1_reasoning=f"Pullback to broken resistance on D1, no H1 trigger.",
                        validation_status="D1_PATTERN_NO_H1_TRIGGER",
                        coverage_reason="H1 trigger condition not met within window",
                        d1_setup_index=i + pb_offset,
                    ))
                break
    
    return candidates


# ──────────────────────────────────────────────────────────
# Pattern 04: Compression to Expansion (LONG)
# ──────────────────────────────────────────────────────────
def scan_compression_expansion(symbol: str, d1: pd.DataFrame, h1: pd.DataFrame) -> list[Candidate]:
    candidates = []
    if len(d1) < 60:
        return candidates
    
    for i in range(20, len(d1) - 1):
        row = d1.iloc[i]
        if not all(np.isfinite(v) for v in [row.adr20, row.atr14]):
            continue
        if i < 7:
            continue
        recent = d1.iloc[i-5:i+1]
        ranges = [(r.high - r.low) for _, r in recent.iterrows()]
        if len(ranges) < 5:
            continue
        avg_range = sum(ranges) / len(ranges)
        if row.adr20 > 0 and avg_range > row.adr20 * 0.8:
            continue
        
        compression_high = d1.iloc[i-5:i]["high"].max()
        compression_low = d1.iloc[i-5:i]["low"].min()
        compression_width = compression_high - compression_low
        if compression_width <= 0 or (row.adr20 > 0 and compression_width > row.adr20 * 1.5):
            continue
        if row.close <= compression_high:
            continue
        breakout_strength = (row.close - compression_high) / compression_width
        if breakout_strength < 0.1:
            continue
        
        setup_date = row.timestamp.strftime("%Y-%m-%d")
        d1_day = row.timestamp.normalize()
        
        h1_after, inside_coverage = get_h1_window(h1, d1_day, max_days=5)
        if not inside_coverage:
            candidates.append(Candidate(
                id=f"{symbol.lower()}_compress_{row.timestamp:%Y%m%d}",
                symbol=symbol, setup_id="compression_expansion", direction="long",
                d1_setup_date=setup_date,
                d1_ohlc={"o": round(row.open, 6), "h": round(row.high, 6), "l": round(row.low, 6), "c": round(row.close, 6)},
                d1_reasoning=f"5-bar compression (range {compression_width:.5f}). Breakout {breakout_strength*100:.1f}% above ceiling {compression_high:.5f}.",
                validation_status="D1_PATTERN_OUTSIDE_H1_COVERAGE",
                coverage_reason="outside H1 historical coverage",
                d1_setup_index=i, adr20=round(row.adr20, 6),
            ))
            continue
        
        entry_found = False
        for hi in range(min(20, len(h1_after))):
            hbar = h1_after.iloc[hi]
            if hbar.close > row.high:
                entry_idx = h1_after.index[hi] + 1
                if entry_idx >= len(h1):
                    continue
                entry_bar = h1.iloc[entry_idx]
                entry_price = entry_bar.open
                sl = compression_low - row.atr14 * 0.1
                risk = entry_price - sl
                if risk <= 0:
                    continue
                tp = entry_price + risk * 2.5
                
                c = Candidate(
                    id=f"{symbol.lower()}_compress_{row.timestamp:%Y%m%d}",
                    symbol=symbol, setup_id="compression_expansion", direction="long",
                    d1_setup_date=setup_date,
                    d1_ohlc={"o": round(row.open, 6), "h": round(row.high, 6), "l": round(row.low, 6), "c": round(row.close, 6)},
                    d1_reasoning=f"5-bar compression (range {compression_width:.5f}), avg candle range {avg_range:.5f} < ADR {row.adr20:.5f}. Breakout {breakout_strength*100:.1f}% above ceiling {compression_high:.5f}.",
                    validation_status="COMPLETE_REAL_MARKET_CASE",
                    coverage_reason="fully validated",
                    h1_entry_time=entry_bar.timestamp.isoformat(),
                    h1_entry_price=round(entry_price, 6),
                    h1_entry_trigger=f"H1 continuation above D1 breakout high {row.high:.5f}",
                    stop_loss=round(sl, 6), stop_distance=round(risk, 6),
                    take_profit=round(tp, 6), target_method="2.5R from compression",
                    risk_reward=2.5, d1_setup_index=i,
                    h1_signal_index=h1_after.index[hi], h1_entry_index=entry_idx,
                    adr20=round(row.adr20, 6), d1_ema15=round(row.ema15, 6) if np.isfinite(row.ema15) else None,
                    h1_ema15_at_entry=round(entry_bar.ema15, 6) if np.isfinite(entry_bar.ema15) else None,
                    h1_ema50_at_entry=round(entry_bar.ema50, 6) if np.isfinite(entry_bar.ema50) else None,
                )
                c.score = breakout_strength * 10 + max(0, 0.8 - avg_range / row.adr20) * 5
                candidates.append(c)
                entry_found = True
                break
        if not entry_found:
            candidates.append(Candidate(
                id=f"{symbol.lower()}_compress_{row.timestamp:%Y%m%d}",
                symbol=symbol, setup_id="compression_expansion", direction="long",
                d1_setup_date=setup_date,
                d1_ohlc={"o": round(row.open, 6), "h": round(row.high, 6), "l": round(row.low, 6), "c": round(row.close, 6)},
                d1_reasoning="Compression breakout on D1, no H1 continuation trigger.",
                validation_status="D1_PATTERN_NO_H1_TRIGGER",
                coverage_reason="H1 trigger condition not met within window",
                d1_setup_index=i,
            ))
    
    return candidates


# ──────────────────────────────────────────────────────────
# Pattern 05: Failed M Top to Bullish Reversal (LONG)
# ──────────────────────────────────────────────────────────
def scan_failed_m_top(symbol: str, d1: pd.DataFrame, h1: pd.DataFrame) -> list[Candidate]:
    candidates = []
    if len(d1) < 60:
        return candidates
    
    for i in range(40, len(d1) - 3):
        row = d1.iloc[i]
        if not all(np.isfinite(v) for v in [row.adr20, row.atr14, row.support50]):
            continue
        
        lookback = d1.iloc[max(0, i-40):i]
        if len(lookback) < 15:
            continue
        highs = lookback["high"]
        peak1_idx = highs.idxmax()
        peak1_val = highs.max()
        
        mask = (highs.index != peak1_idx) & (abs(highs.index - peak1_idx) >= 5)
        if not mask.any():
            continue
        remaining = highs[mask]
        peak2_idx = remaining.idxmax()
        peak2_val = remaining.max()
        if abs(peak1_val - peak2_val) / peak1_val > 0.02:
            continue
        
        between_start = min(peak1_idx, peak2_idx)
        between_end = max(peak1_idx, peak2_idx)
        if between_end - between_start < 3:
            continue
        neckline = d1.iloc[between_start:between_end+1]["low"].min()
        if row.close > neckline * 1.01:
            continue
        
        support = row.support50 if np.isfinite(row.support50) else row.support20
        if not np.isfinite(support) or row.low > support * 1.02:
            continue
        
        for doji_offset in range(0, min(4, len(d1) - i)):
            dbar = d1.iloc[i + doji_offset]
            bd = body(dbar)
            cr = candle_range(dbar)
            if cr <= 0 or bd / cr > 0.35:
                continue
            lw = lower_wick(dbar)
            if lw < cr * 0.3 or dbar.low > support * 1.02:
                continue
            
            setup_date = dbar.timestamp.strftime("%Y-%m-%d")
            d1_day = dbar.timestamp.normalize()
            
            h1_after, inside_coverage = get_h1_window(h1, d1_day, max_days=5)
            if not inside_coverage:
                candidates.append(Candidate(
                    id=f"{symbol.lower()}_failed_mtop_{dbar.timestamp:%Y%m%d}",
                    symbol=symbol, setup_id="failed_m_top", direction="long",
                    d1_setup_date=setup_date,
                    d1_ohlc={"o": round(dbar.open, 6), "h": round(dbar.high, 6), "l": round(dbar.low, 6), "c": round(dbar.close, 6)},
                    d1_reasoning=f"M-top peaks at {peak1_val:.5f}/{peak2_val:.5f}, neckline {neckline:.5f}. Breakdown into support {support:.5f}. Doji-star rejection.",
                    validation_status="D1_PATTERN_OUTSIDE_H1_COVERAGE",
                    coverage_reason="outside H1 historical coverage",
                    d1_setup_index=i + doji_offset, d1_support20=round(support, 6),
                ))
                break
            
            entry_found = False
            for hi in range(min(15, len(h1_after))):
                hbar = h1_after.iloc[hi]
                if hbar.close > dbar.high:
                    entry_idx = h1_after.index[hi]
                    if entry_idx >= len(h1):
                        continue
                    entry_bar = h1.iloc[entry_idx]
                    entry_price = entry_bar.close
                    sl = dbar.low - row.atr14 * 0.05
                    risk = entry_price - sl
                    if risk <= 0:
                        continue
                    tp = neckline
                    rr = (tp - entry_price) / risk if risk > 0 else 0
                    if rr < 1.0:
                        continue
                    
                    c = Candidate(
                        id=f"{symbol.lower()}_failed_mtop_{dbar.timestamp:%Y%m%d}",
                        symbol=symbol, setup_id="failed_m_top", direction="long",
                        d1_setup_date=setup_date,
                        d1_ohlc={"o": round(dbar.open, 6), "h": round(dbar.high, 6), "l": round(dbar.low, 6), "c": round(dbar.close, 6)},
                        d1_reasoning=f"M-top peaks at {peak1_val:.5f}/{peak2_val:.5f}, neckline {neckline:.5f}. Breakdown into support {support:.5f}. Doji-star rejection (body/range {bd/cr:.2f}).",
                        validation_status="COMPLETE_REAL_MARKET_CASE",
                        coverage_reason="fully validated",
                        h1_entry_time=entry_bar.timestamp.isoformat(),
                        h1_entry_price=round(entry_price, 6),
                        h1_entry_trigger=f"H1 close above doji high {dbar.high:.5f}, early reversal entry",
                        stop_loss=round(sl, 6), stop_distance=round(risk, 6),
                        take_profit=round(tp, 6), target_method="neckline recovery",
                        risk_reward=round(rr, 2), d1_setup_index=i + doji_offset,
                        h1_signal_index=h1_after.index[hi], h1_entry_index=entry_idx,
                        adr20=round(row.adr20, 6), d1_support20=round(support, 6),
                        d1_ema15=round(row.ema15, 6) if np.isfinite(row.ema15) else None,
                        h1_ema15_at_entry=round(entry_bar.ema15, 6) if np.isfinite(entry_bar.ema15) else None,
                        h1_ema50_at_entry=round(entry_bar.ema50, 6) if np.isfinite(entry_bar.ema50) else None,
                    )
                    c.score = rr * 2 + min(lw / row.atr14, 2) * 1.5 + max(0, 1 - bd/cr) * 3
                    candidates.append(c)
                    entry_found = True
                    break
            if not entry_found:
                candidates.append(Candidate(
                    id=f"{symbol.lower()}_failed_mtop_{dbar.timestamp:%Y%m%d}",
                    symbol=symbol, setup_id="failed_m_top", direction="long",
                    d1_setup_date=setup_date,
                    d1_ohlc={"o": round(dbar.open, 6), "h": round(dbar.high, 6), "l": round(dbar.low, 6), "c": round(dbar.close, 6)},
                    d1_reasoning="Failed M-top on D1, no H1 confirmation trigger.",
                    validation_status="D1_PATTERN_NO_H1_TRIGGER",
                    coverage_reason="H1 trigger condition not met within window",
                    d1_setup_index=i + doji_offset,
                ))
            break
    
    return candidates


# ──────────────────────────────────────────────────────────
# Pattern 06: Failed W Bottom to Bearish Reversal (SHORT)
# ──────────────────────────────────────────────────────────
def scan_failed_w_bottom(symbol: str, d1: pd.DataFrame, h1: pd.DataFrame) -> list[Candidate]:
    candidates = []
    if len(d1) < 60:
        return candidates
    
    for i in range(40, len(d1) - 3):
        row = d1.iloc[i]
        if not all(np.isfinite(v) for v in [row.adr20, row.atr14]):
            continue
        lookback = d1.iloc[max(0, i-40):i]
        if len(lookback) < 15:
            continue
        lows = lookback["low"]
        trough1_idx = lows.idxmin()
        trough1_val = lows.min()
        mask = (lows.index != trough1_idx) & (abs(lows.index - trough1_idx) >= 5)
        if not mask.any():
            continue
        remaining = lows[mask]
        trough2_idx = remaining.idxmin()
        trough2_val = remaining.min()
        if abs(trough1_val - trough2_val) / trough1_val > 0.02:
            continue
        
        between_start = min(trough1_idx, trough2_idx)
        between_end = max(trough1_idx, trough2_idx)
        if between_end - between_start < 3:
            continue
        neckline = d1.iloc[between_start:between_end+1]["high"].max()
        
        breakout_found = any(d1.iloc[bb].close > neckline for bb in range(max(0, i-5), i))
        if not breakout_found or row.close >= neckline:
            continue
        
        setup_date = row.timestamp.strftime("%Y-%m-%d")
        d1_day = row.timestamp.normalize()
        
        h1_after, inside_coverage = get_h1_window(h1, d1_day, max_days=5)
        if not inside_coverage:
            candidates.append(Candidate(
                id=f"{symbol.lower()}_failed_wbot_{row.timestamp:%Y%m%d}",
                symbol=symbol, setup_id="failed_w_bottom", direction="short",
                d1_setup_date=setup_date,
                d1_ohlc={"o": round(row.open, 6), "h": round(row.high, 6), "l": round(row.low, 6), "c": round(row.close, 6)},
                d1_reasoning=f"W-bottom troughs at {trough1_val:.5f}/{trough2_val:.5f}, neckline {neckline:.5f}. Breakout failed, closed below.",
                validation_status="D1_PATTERN_OUTSIDE_H1_COVERAGE",
                coverage_reason="outside H1 historical coverage",
                d1_setup_index=i, adr20=round(row.adr20, 6),
            ))
            continue
        
        recent_h1_low = h1_after.iloc[:5]["low"].min() if len(h1_after) >= 5 else h1_after["low"].min()
        entry_found = False
        for hi in range(2, min(25, len(h1_after))):
            hbar = h1_after.iloc[hi]
            if hbar.close < recent_h1_low:
                entry_idx = h1_after.index[hi] + 1
                if entry_idx >= len(h1):
                    continue
                entry_bar = h1.iloc[entry_idx]
                entry_price = entry_bar.open
                sl = neckline + row.atr14 * 0.15
                risk = sl - entry_price
                if risk <= 0:
                    continue
                tp = entry_price - risk * 2.0
                
                c = Candidate(
                    id=f"{symbol.lower()}_failed_wbot_{row.timestamp:%Y%m%d}",
                    symbol=symbol, setup_id="failed_w_bottom", direction="short",
                    d1_setup_date=setup_date,
                    d1_ohlc={"o": round(row.open, 6), "h": round(row.high, 6), "l": round(row.low, 6), "c": round(row.close, 6)},
                    d1_reasoning=f"W-bottom troughs at {trough1_val:.5f}/{trough2_val:.5f}, neckline {neckline:.5f}. Breakout failed, close back below at {row.close:.5f}.",
                    validation_status="COMPLETE_REAL_MARKET_CASE",
                    coverage_reason="fully validated",
                    h1_entry_time=entry_bar.timestamp.isoformat(),
                    h1_entry_price=round(entry_price, 6),
                    h1_entry_trigger=f"H1 break below swing low {recent_h1_low:.5f}",
                    stop_loss=round(sl, 6), stop_distance=round(risk, 6),
                    take_profit=round(tp, 6), target_method="2R short target",
                    risk_reward=2.0, d1_setup_index=i,
                    h1_signal_index=h1_after.index[hi], h1_entry_index=entry_idx,
                    adr20=round(row.adr20, 6), d1_ema15=round(row.ema15, 6) if np.isfinite(row.ema15) else None,
                    h1_ema15_at_entry=round(entry_bar.ema15, 6) if np.isfinite(entry_bar.ema15) else None,
                    h1_ema50_at_entry=round(entry_bar.ema50, 6) if np.isfinite(entry_bar.ema50) else None,
                )
                c.score = (neckline - row.close) / row.adr20 * 5 if row.adr20 > 0 else 0
                candidates.append(c)
                entry_found = True
                break
        if not entry_found:
            candidates.append(Candidate(
                id=f"{symbol.lower()}_failed_wbot_{row.timestamp:%Y%m%d}",
                symbol=symbol, setup_id="failed_w_bottom", direction="short",
                d1_setup_date=setup_date,
                d1_ohlc={"o": round(row.open, 6), "h": round(row.high, 6), "l": round(row.low, 6), "c": round(row.close, 6)},
                d1_reasoning="Failed W-bottom on D1, no H1 breakdown trigger.",
                validation_status="D1_PATTERN_NO_H1_TRIGGER",
                coverage_reason="H1 trigger condition not met within window",
                d1_setup_index=i,
            ))
    
    return candidates


# ──────────────────────────────────────────────────────────
# Pattern 07: Exhaustion Move to Reversal (LONG)
# ──────────────────────────────────────────────────────────
def scan_exhaustion_reversal(symbol: str, d1: pd.DataFrame, h1: pd.DataFrame) -> list[Candidate]:
    candidates = []
    if len(d1) < 60:
        return candidates
    
    for i in range(25, len(d1) - 3):
        row = d1.iloc[i]
        if not all(np.isfinite(v) for v in [row.adr20, row.atr14, row.support20]):
            continue
        
        lookback_start = max(0, i - 15)
        prior_high = d1.iloc[lookback_start:i]["high"].max()
        decline = (prior_high - row.low) / prior_high if prior_high > 0 else 0
        if decline < 0.02:
            continue
        bearish_count = sum(1 for j in range(lookback_start, i) if d1.iloc[j].close < d1.iloc[j].open)
        if bearish_count < (i - lookback_start) * 0.5:
            continue
        if row.low > row.support20 * 1.005:
            continue
        lw = lower_wick(row)
        cr = candle_range(row)
        if cr <= 0 or lw < cr * 0.35:
            continue
        
        higher_low_found = False
        for hl_offset in range(1, min(4, len(d1) - i)):
            next_bar = d1.iloc[i + hl_offset]
            if next_bar.low > row.low and next_bar.close > row.close:
                higher_low_found = True
                hl_bar = next_bar
                hl_bar_idx = i + hl_offset
                break
        if not higher_low_found:
            continue
        
        setup_date = hl_bar.timestamp.strftime("%Y-%m-%d")
        d1_day = hl_bar.timestamp.normalize()
        
        h1_after, inside_coverage = get_h1_window(h1, d1_day, max_days=7)
        if not inside_coverage:
            candidates.append(Candidate(
                id=f"{symbol.lower()}_exhaust_{row.timestamp:%Y%m%d}",
                symbol=symbol, setup_id="exhaustion_reversal", direction="long",
                d1_setup_date=setup_date,
                d1_ohlc={"o": round(hl_bar.open, 6), "h": round(hl_bar.high, 6), "l": round(hl_bar.low, 6), "c": round(hl_bar.close, 6)},
                d1_reasoning=f"Extended decline {decline*100:.1f}% into support {row.support20:.5f}. Exhaustion wick {lw:.5f}. Higher low confirmed.",
                validation_status="D1_PATTERN_OUTSIDE_H1_COVERAGE",
                coverage_reason="outside H1 historical coverage",
                d1_setup_index=hl_bar_idx, adr20=round(row.adr20, 6), d1_support20=round(row.support20, 6),
            ))
            continue
        
        swing_high = max(row.high, hl_bar.high)
        entry_found = False
        for hi in range(min(25, len(h1_after))):
            hbar = h1_after.iloc[hi]
            if hbar.close > swing_high:
                entry_idx = h1_after.index[hi] + 1
                if entry_idx >= len(h1):
                    continue
                entry_bar = h1.iloc[entry_idx]
                entry_price = entry_bar.open
                sl = row.low - row.atr14 * 0.08
                risk = entry_price - sl
                if risk <= 0:
                    continue
                tp = entry_price + risk * 2.5
                
                c = Candidate(
                    id=f"{symbol.lower()}_exhaust_{row.timestamp:%Y%m%d}",
                    symbol=symbol, setup_id="exhaustion_reversal", direction="long",
                    d1_setup_date=setup_date,
                    d1_ohlc={"o": round(hl_bar.open, 6), "h": round(hl_bar.high, 6), "l": round(hl_bar.low, 6), "c": round(hl_bar.close, 6)},
                    d1_reasoning=f"Extended decline {decline*100:.1f}% into support {row.support20:.5f}. Exhaustion wick {lw:.5f} at {row.timestamp:%Y-%m-%d}. Higher low confirmed {hl_bar.low:.5f} > {row.low:.5f}.",
                    validation_status="COMPLETE_REAL_MARKET_CASE",
                    coverage_reason="fully validated",
                    h1_entry_time=entry_bar.timestamp.isoformat(),
                    h1_entry_price=round(entry_price, 6),
                    h1_entry_trigger=f"H1 break above swing high {swing_high:.5f}",
                    stop_loss=round(sl, 6), stop_distance=round(risk, 6),
                    take_profit=round(tp, 6), target_method="2.5R from exhaustion low",
                    risk_reward=2.5, d1_setup_index=hl_bar_idx,
                    h1_signal_index=h1_after.index[hi], h1_entry_index=entry_idx,
                    adr20=round(row.adr20, 6), d1_support20=round(row.support20, 6),
                    d1_ema15=round(row.ema15, 6) if np.isfinite(row.ema15) else None,
                    h1_ema15_at_entry=round(entry_bar.ema15, 6) if np.isfinite(entry_bar.ema15) else None,
                    h1_ema50_at_entry=round(entry_bar.ema50, 6) if np.isfinite(entry_bar.ema50) else None,
                )
                c.score = decline * 100 + min(lw / row.atr14, 2) * 2 + (hl_bar.low - row.low) / row.adr20 * 3
                candidates.append(c)
                entry_found = True
                break
        if not entry_found:
            candidates.append(Candidate(
                id=f"{symbol.lower()}_exhaust_{row.timestamp:%Y%m%d}",
                symbol=symbol, setup_id="exhaustion_reversal", direction="long",
                d1_setup_date=setup_date,
                d1_ohlc={"o": round(hl_bar.open, 6), "h": round(hl_bar.high, 6), "l": round(hl_bar.low, 6), "c": round(hl_bar.close, 6)},
                d1_reasoning="Exhaustion setup on D1, no H1 breakout trigger.",
                validation_status="D1_PATTERN_NO_H1_TRIGGER",
                coverage_reason="H1 trigger condition not met within window",
                d1_setup_index=hl_bar_idx,
            ))
    
    return candidates


# ──────────────────────────────────────────────────────────
# Pattern 08: Long Lower Wick at Support to ADR (LONG)
# ──────────────────────────────────────────────────────────
def scan_lower_wick_adr(symbol: str, d1: pd.DataFrame, h1: pd.DataFrame) -> list[Candidate]:
    candidates = []
    if len(h1) < 100:
        return candidates
    
    for idx in range(55, len(h1) - 50):
        row = h1.iloc[idx]
        if not all(np.isfinite(v) and v > 0 for v in [row.atr14, row.d1_adr20, row.d1_support20]):
            continue
        if not np.isfinite(row.d1_ema15) or row.d1_ema15 <= 0:
            continue
        
        cr = row.high - row.low
        bd = body(row)
        lw = lower_wick(row)
        close_pos = (row.close - row.low) / cr if cr > 0 else 0
        support_dist_adr = abs(row.low - row.d1_support20) / row.d1_adr20
        
        wick_ok = lw >= max(bd * 1.5, row.atr14 * 0.28) and close_pos >= 0.60
        support_ok = (row.low <= row.d1_support20 + row.d1_adr20 * 0.18 and
                      row.close >= row.d1_support20 - row.d1_adr20 * 0.05)
        adr_used_pct = row.adr_used / row.d1_adr20 * 100
        adr_ok = adr_used_pct <= 72
        
        if not (wick_ok and support_ok and adr_ok):
            continue
        
        confirm_idx = None
        for probe in range(idx + 1, min(idx + 7, len(h1) - 1)):
            if h1.iloc[probe].close > row.high and h1.iloc[probe].close > h1.iloc[probe].ema15:
                confirm_idx = probe
                break
        if confirm_idx is None:
            continue
        
        entry_idx = confirm_idx + 1
        if entry_idx >= len(h1):
            continue
        entry_bar = h1.iloc[entry_idx]
        entry_price = entry_bar.open
        sl = row.low - row.atr14 * 0.08
        risk = entry_price - sl
        if risk <= 0:
            continue
        
        adr_target = row.day_low_so_far + row.d1_adr20
        tp = adr_target
        rr = (tp - entry_price) / risk if risk > 0 else 0
        
        d1_date = row.timestamp.strftime("%Y-%m-%d")
        d1_match = d1[d1["timestamp"].dt.normalize() <= row.timestamp.normalize()]
        d1_idx = d1_match.index[-1] if len(d1_match) > 0 else 0
        
        c = Candidate(
            id=f"{symbol.lower()}_lw_adr_{row.timestamp:%Y%m%d_%H%M}",
            symbol=symbol, setup_id="lower_wick_adr", direction="long",
            d1_setup_date=d1_date,
            d1_ohlc={"o": 0, "h": 0, "l": 0, "c": 0},
            d1_reasoning=f"H1 low {row.low:.5f} near D1 support {row.d1_support20:.5f} (dist {support_dist_adr:.3f} ADR). Lower wick {lw/row.atr14:.3f} ATR. ADR used {adr_used_pct:.1f}%. D1 EMA15 {row.d1_ema15:.5f} overhead.",
            validation_status="COMPLETE_REAL_MARKET_CASE",
            coverage_reason="fully validated",
            h1_entry_time=entry_bar.timestamp.isoformat(),
            h1_entry_price=round(entry_price, 6),
            h1_entry_trigger=f"H1 momentum confirmation: close above signal high {row.high:.5f} and EMA15",
            stop_loss=round(sl, 6), stop_distance=round(risk, 6),
            take_profit=round(tp, 6), target_method="ADR target",
            risk_reward=round(rr, 2),
            d1_setup_index=d1_idx,
            h1_signal_index=idx, h1_entry_index=entry_idx,
            adr20=round(row.d1_adr20, 6), adr_used_pct=round(adr_used_pct, 2),
            d1_support20=round(row.d1_support20, 6),
            d1_ema15=round(row.d1_ema15, 6),
            h1_ema15_at_entry=round(entry_bar.ema15, 6) if np.isfinite(entry_bar.ema15) else None,
            h1_ema50_at_entry=round(entry_bar.ema50, 6) if np.isfinite(entry_bar.ema50) else None,
        )
        wick_strength = lw / row.atr14
        c.score = (min(wick_strength, 2.0) * 1.8
                   + max(0, 0.20 - support_dist_adr) * 8
                   + max(0, 72 - adr_used_pct) / 30
                   + min(max(rr, 0), 3.0) * 0.5)
        candidates.append(c)
    
    return candidates


# ──────────────────────────────────────────────────────────
# Pattern 09: Morning Star at Major Support (LONG)
# ──────────────────────────────────────────────────────────
def scan_morning_star_support(symbol: str, d1: pd.DataFrame, h1: pd.DataFrame) -> list[Candidate]:
    candidates = []
    if len(d1) < 60:
        return candidates
    
    for i in range(25, len(d1) - 3):
        if not all(np.isfinite(v) for v in [d1.iloc[i].adr20, d1.iloc[i].atr14, d1.iloc[i].support20]):
            continue
        if i < 2:
            continue
        bar1 = d1.iloc[i - 2]
        bar2 = d1.iloc[i - 1]
        bar3 = d1.iloc[i]
        
        if not is_bearish(bar1):
            continue
        body1 = body(bar1)
        if body1 < d1.iloc[i].atr14 * 0.5:
            continue
        body2 = body(bar2)
        range2 = candle_range(bar2)
        if range2 <= 0 or body2 / range2 > 0.4 or bar2.low >= bar1.low:
            continue
        support = d1.iloc[i].support20
        if bar2.low > support * 1.01:
            continue
        recent_low = d1.iloc[max(0, i-25):i-1]["low"].min()
        if bar2.low > recent_low:
            continue
        if not is_bullish(bar3):
            continue
        body3 = body(bar3)
        if body3 < body1 * 0.4:
            continue
        recovery_level = bar1.open - body1 * 0.5
        if bar3.close < recovery_level:
            continue
        
        decline_start = max(0, i - 2 - 15)
        decline_high = d1.iloc[decline_start:i-2]["high"].max()
        decline_pct = (decline_high - bar2.low) / decline_high if decline_high > 0 else 0
        if decline_pct < 0.015:
            continue
        
        setup_date = bar3.timestamp.strftime("%Y-%m-%d")
        d1_day = bar3.timestamp.normalize()
        
        h1_after, inside_coverage = get_h1_window(h1, d1_day, max_days=7)
        if not inside_coverage:
            candidates.append(Candidate(
                id=f"{symbol.lower()}_mstar_{bar3.timestamp:%Y%m%d}",
                symbol=symbol, setup_id="morning_star_support", direction="long",
                d1_setup_date=setup_date,
                d1_ohlc={"o": round(bar3.open, 6), "h": round(bar3.high, 6), "l": round(bar3.low, 6), "c": round(bar3.close, 6)},
                d1_reasoning=f"Morning Star at support {support:.5f}. Bar1 body {body1:.5f}, Star low {bar2.low:.5f}, Bar3 close {bar3.close:.5f} > 50%.",
                validation_status="D1_PATTERN_OUTSIDE_H1_COVERAGE",
                coverage_reason="outside H1 historical coverage",
                d1_setup_index=i, adr20=round(d1.iloc[i].adr20, 6), d1_support20=round(support, 6),
            ))
            continue
        
        entry_found = False
        for hi in range(min(25, len(h1_after))):
            hbar = h1_after.iloc[hi]
            if hbar.close > bar3.high:
                entry_idx = h1_after.index[hi] + 1
                if entry_idx >= len(h1):
                    continue
                entry_bar = h1.iloc[entry_idx]
                entry_price = entry_bar.open
                sl = bar2.low - d1.iloc[i].atr14 * 0.05
                risk = entry_price - sl
                if risk <= 0:
                    continue
                tp = entry_price + risk * 2.5
                rr = 2.5
                
                c = Candidate(
                    id=f"{symbol.lower()}_mstar_{bar3.timestamp:%Y%m%d}",
                    symbol=symbol, setup_id="morning_star_support", direction="long",
                    d1_setup_date=setup_date,
                    d1_ohlc={"o": round(bar3.open, 6), "h": round(bar3.high, 6), "l": round(bar3.low, 6), "c": round(bar3.close, 6)},
                    d1_reasoning=f"Morning Star at support {support:.5f}. Bar1 bearish body {body1:.5f}, Star low {bar2.low:.5f} (new low), Bar3 bullish recovery {bar3.close:.5f} above 50% ({recovery_level:.5f}). Prior decline {decline_pct*100:.1f}%.",
                    validation_status="COMPLETE_REAL_MARKET_CASE",
                    coverage_reason="fully validated",
                    h1_entry_time=entry_bar.timestamp.isoformat(),
                    h1_entry_price=round(entry_price, 6),
                    h1_entry_trigger=f"H1 break above bar3 high {bar3.high:.5f}",
                    stop_loss=round(sl, 6), stop_distance=round(risk, 6),
                    take_profit=round(tp, 6), target_method="2.5R from morning star low",
                    risk_reward=rr, d1_setup_index=i,
                    h1_signal_index=h1_after.index[hi], h1_entry_index=entry_idx,
                    adr20=round(d1.iloc[i].adr20, 6), d1_support20=round(support, 6),
                    d1_ema15=round(d1.iloc[i].ema15, 6) if np.isfinite(d1.iloc[i].ema15) else None,
                    h1_ema15_at_entry=round(entry_bar.ema15, 6) if np.isfinite(entry_bar.ema15) else None,
                    h1_ema50_at_entry=round(entry_bar.ema50, 6) if np.isfinite(entry_bar.ema50) else None,
                )
                c.score = decline_pct * 50 + body3 / body1 * 3 + (bar3.close - recovery_level) / d1.iloc[i].adr20 * 5
                candidates.append(c)
                entry_found = True
                break
        if not entry_found:
            candidates.append(Candidate(
                id=f"{symbol.lower()}_mstar_{bar3.timestamp:%Y%m%d}",
                symbol=symbol, setup_id="morning_star_support", direction="long",
                d1_setup_date=setup_date,
                d1_ohlc={"o": round(bar3.open, 6), "h": round(bar3.high, 6), "l": round(bar3.low, 6), "c": round(bar3.close, 6)},
                d1_reasoning="Morning star on D1, no H1 confirmation trigger.",
                validation_status="D1_PATTERN_NO_H1_TRIGGER",
                coverage_reason="H1 trigger condition not met within window",
                d1_setup_index=i,
            ))
    
    return candidates


# ──────────────────────────────────────────────────────────
# Pattern 10: M-Top Neckline Break, Retest, Short (SHORT)
# ──────────────────────────────────────────────────────────
def scan_mtop_break_retest(symbol: str, d1: pd.DataFrame, h1: pd.DataFrame) -> list[Candidate]:
    candidates = []
    if len(d1) < 60:
        return candidates
    
    for i in range(40, len(d1) - 5):
        row = d1.iloc[i]
        if not all(np.isfinite(v) for v in [row.adr20, row.atr14]):
            continue
        lookback = d1.iloc[max(0, i-40):i]
        if len(lookback) < 15:
            continue
        highs = lookback["high"]
        peak1_idx = highs.idxmax()
        peak1_val = highs.max()
        mask = (highs.index != peak1_idx) & (abs(highs.index - peak1_idx) >= 5)
        if not mask.any():
            continue
        remaining = highs[mask]
        peak2_idx = remaining.idxmax()
        peak2_val = remaining.max()
        if abs(peak1_val - peak2_val) / peak1_val > 0.025:
            continue
        
        between_start = min(peak1_idx, peak2_idx)
        between_end = max(peak1_idx, peak2_idx)
        if between_end - between_start < 3:
            continue
        neckline = d1.iloc[between_start:between_end+1]["low"].min()
        if row.close >= neckline or (neckline - row.close) / row.adr20 < 0.1:
            continue
        
        for rt_offset in range(1, min(6, len(d1) - i)):
            rt_bar = d1.iloc[i + rt_offset]
            if rt_bar.high < neckline * 0.995 or rt_bar.high > neckline * 1.01 or rt_bar.close >= neckline:
                continue
            uw = upper_wick(rt_bar)
            if uw < candle_range(rt_bar) * 0.2:
                continue
            
            setup_date = rt_bar.timestamp.strftime("%Y-%m-%d")
            d1_day = rt_bar.timestamp.normalize()
            
            h1_after, inside_coverage = get_h1_window(h1, d1_day, max_days=7)
            if not inside_coverage:
                candidates.append(Candidate(
                    id=f"{symbol.lower()}_mtop_rt_{rt_bar.timestamp:%Y%m%d}",
                    symbol=symbol, setup_id="mtop_break_retest", direction="short",
                    d1_setup_date=setup_date,
                    d1_ohlc={"o": round(rt_bar.open, 6), "h": round(rt_bar.high, 6), "l": round(rt_bar.low, 6), "c": round(rt_bar.close, 6)},
                    d1_reasoning=f"M-top peaks {peak1_val:.5f}/{peak2_val:.5f}, neckline {neckline:.5f}. Retest failed at {rt_bar.high:.5f}.",
                    validation_status="D1_PATTERN_OUTSIDE_H1_COVERAGE",
                    coverage_reason="outside H1 historical coverage",
                    d1_setup_index=i + rt_offset, adr20=round(row.adr20, 6), d1_resist20=round(neckline, 6),
                ))
                break
            
            entry_found = False
            for hi in range(min(25, len(h1_after))):
                hbar = h1_after.iloc[hi]
                if hbar.close < rt_bar.low:
                    entry_idx = h1_after.index[hi] + 1
                    if entry_idx >= len(h1):
                        continue
                    entry_bar = h1.iloc[entry_idx]
                    entry_price = entry_bar.open
                    sl = neckline + row.atr14 * 0.1
                    risk = sl - entry_price
                    if risk <= 0:
                        continue
                    m_height = peak1_val - neckline
                    tp = neckline - m_height
                    rr = (entry_price - tp) / risk if risk > 0 else 0
                    if rr < 1.0:
                        tp = entry_price - risk * 2.0
                        rr = 2.0
                    
                    c = Candidate(
                        id=f"{symbol.lower()}_mtop_rt_{rt_bar.timestamp:%Y%m%d}",
                        symbol=symbol, setup_id="mtop_break_retest", direction="short",
                        d1_setup_date=setup_date,
                        d1_ohlc={"o": round(rt_bar.open, 6), "h": round(rt_bar.high, 6), "l": round(rt_bar.low, 6), "c": round(rt_bar.close, 6)},
                        d1_reasoning=f"M-top peaks {peak1_val:.5f}/{peak2_val:.5f}, neckline {neckline:.5f}. Broke {row.timestamp:%Y-%m-%d}. Retest high {rt_bar.high:.5f} failed to reclaim, closed {rt_bar.close:.5f}.",
                        validation_status="COMPLETE_REAL_MARKET_CASE",
                        coverage_reason="fully validated",
                        h1_entry_time=entry_bar.timestamp.isoformat(),
                        h1_entry_price=round(entry_price, 6),
                        h1_entry_trigger=f"H1 break below retest low {rt_bar.low:.5f}",
                        stop_loss=round(sl, 6), stop_distance=round(risk, 6),
                        take_profit=round(tp, 6), target_method="measured move or 2R",
                        risk_reward=round(rr, 2), d1_setup_index=i + rt_offset,
                        h1_signal_index=h1_after.index[hi], h1_entry_index=entry_idx,
                        adr20=round(row.adr20, 6), d1_resist20=round(neckline, 6),
                        d1_ema15=round(row.ema15, 6) if np.isfinite(row.ema15) else None,
                        h1_ema15_at_entry=round(entry_bar.ema15, 6) if np.isfinite(entry_bar.ema15) else None,
                        h1_ema50_at_entry=round(entry_bar.ema50, 6) if np.isfinite(entry_bar.ema50) else None,
                    )
                    c.score = rr * 1.5 + min(uw / row.atr14, 2) * 2 + (neckline - rt_bar.close) / row.adr20 * 3
                    candidates.append(c)
                    entry_found = True
                    break
            if not entry_found:
                candidates.append(Candidate(
                    id=f"{symbol.lower()}_mtop_rt_{rt_bar.timestamp:%Y%m%d}",
                    symbol=symbol, setup_id="mtop_break_retest", direction="short",
                    d1_setup_date=setup_date,
                    d1_ohlc={"o": round(rt_bar.open, 6), "h": round(rt_bar.high, 6), "l": round(rt_bar.low, 6), "c": round(rt_bar.close, 6)},
                    d1_reasoning="M-top neckline retest on D1, no H1 breakdown trigger.",
                    validation_status="D1_PATTERN_NO_H1_TRIGGER",
                    coverage_reason="H1 trigger condition not met within window",
                    d1_setup_index=i + rt_offset,
                ))
            break
    
    return candidates


# ══════════════════════════════════════════════════════════════
# Chart Generator
# ══════════════════════════════════════════════════════════════
def draw_candles(ax, frame: pd.DataFrame, width: float = 0.62):
    for x, row in enumerate(frame.itertuples()):
        rising = row.close >= row.open
        color = "#d85b65" if rising else "#218b75"
        ax.vlines(x, row.low, row.high, color=color, linewidth=0.8, alpha=0.9)
        bottom = min(row.open, row.close)
        height = max(abs(row.close - row.open), (row.high - row.low) * 0.015)
        ax.add_patch(plt.Rectangle(
            (x - width / 2, bottom), width, height,
            facecolor="#ffffff" if rising else color,
            edgecolor=color, linewidth=0.9
        ))


def style_axis(ax):
    ax.grid(axis="y", color="#e5e9e7", linewidth=0.7)
    ax.spines[["top", "right", "left"]].set_visible(False)
    ax.tick_params(colors="#66716c", labelsize=8)


def chart_candidate(c: Candidate, h1: pd.DataFrame, d1: pd.DataFrame, output_dir: Path) -> dict:
    images = {}
    
    for annotated in [False, True]:
        fig, axes = plt.subplots(2, 1, figsize=(15, 9),
                                  gridspec_kw={"height_ratios": [0.9, 1.55]},
                                  constrained_layout=True)
        fig.patch.set_facecolor("#f8faf9")
        for ax in axes:
            ax.set_facecolor("#ffffff")
        
        # D1 panel
        d1_end = min(len(d1), c.d1_setup_index + 6)
        d1_start = max(0, c.d1_setup_index - 50)
        d1_slice = d1.iloc[d1_start:d1_end].copy().reset_index(drop=True)
        if len(d1_slice) > 0:
            d1_slice["ema15_plot"] = ema(d1_slice["close"], 15)
            draw_candles(axes[0], d1_slice)
            axes[0].plot(range(len(d1_slice)), d1_slice["ema15_plot"], color="#1f2933",
                        linewidth=1.1, label="D1 EMA15")
            axes[0].set_title(f"{c.symbol} D1 · {c.d1_setup_date}", loc="left",
                            fontsize=11, fontweight="bold", color="#202824")
            axes[0].legend(loc="upper left", frameon=False, fontsize=8)
            style_axis(axes[0])
            
            d1_step = max(1, len(d1_slice) // 7)
            d1_ticks = list(range(0, len(d1_slice), d1_step))
            axes[0].set_xticks(d1_ticks,
                              [d1_slice.iloc[t].timestamp.strftime("%Y-%m-%d") for t in d1_ticks])
        
        # H1 panel
        if c.h1_signal_index is not None and c.h1_signal_index < len(h1):
            h1_start = max(0, c.h1_signal_index - 40)
            h1_end = min(len(h1), c.h1_signal_index + 40)
            h1_slice = h1.iloc[h1_start:h1_end].copy().reset_index(drop=True)
            
            draw_candles(axes[1], h1_slice)
            axes[1].plot(range(len(h1_slice)), h1_slice["ema15"], color="#1f2933",
                        linewidth=1.0, label="H1 EMA15")
            axes[1].plot(range(len(h1_slice)), h1_slice["ema50"], color="#b24555",
                        linewidth=1.0, label="H1 EMA50")
            
            title_setup = [s for s in SETUP_DEFINITIONS if s["id"] == c.setup_id][0]
            axes[1].set_title(
                f"{c.symbol} H1 · {title_setup['titleEn']} · {c.h1_entry_time or ''}",
                loc="left", fontsize=11, fontweight="bold", color="#202824"
            )
            axes[1].legend(loc="upper left", frameon=False, fontsize=8)
            style_axis(axes[1])
            
            if annotated and c.h1_entry_price is not None and c.stop_loss is not None:
                axes[1].axhline(c.h1_entry_price, color="#2676aa", linewidth=1.0,
                              label=f"Entry {c.h1_entry_price:.5f}")
                axes[1].axhline(c.stop_loss, color="#b24555", linewidth=1.0, linestyle="--",
                              label=f"SL {c.stop_loss:.5f}")
                if c.take_profit is not None:
                    axes[1].axhline(c.take_profit, color="#aa7a24", linewidth=1.0, linestyle=":",
                                  label=f"TP {c.take_profit:.5f}")
                if c.d1_support20 is not None:
                    axes[0].axhline(c.d1_support20, color="#26755b", linewidth=1.0, linestyle="--")
                    axes[1].axhline(c.d1_support20, color="#26755b", linewidth=1.0, linestyle="--")
                if c.d1_resist20 is not None:
                    axes[0].axhline(c.d1_resist20, color="#b24555", linewidth=1.0, linestyle="--")
                
                axes[1].legend(loc="upper left", frameon=False, fontsize=7)
            
            h1_step = max(1, len(h1_slice) // 8)
            h1_ticks = list(range(0, len(h1_slice), h1_step))
            axes[1].set_xticks(h1_ticks,
                              [h1_slice.iloc[t].timestamp.strftime("%m-%d\n%H:%M") for t in h1_ticks])
        
        direction_label = "LONG" if c.direction == "long" else "SHORT"
        fig.suptitle(
            f"SOURCE-BACKED HISTORICAL RECONSTRUCTION · {direction_label} · NOT AN EXECUTION RECORD",
            fontsize=9, color="#69736e", y=1.01
        )
        
        suffix = "annotated" if annotated else "original"
        output = output_dir / f"{c.id}_{suffix}.png"
        fig.savefig(str(output), dpi=180, bbox_inches="tight", facecolor=fig.get_facecolor())
        plt.close(fig)
        images[suffix] = str(output.name)
    
    return images


# ══════════════════════════════════════════════════════════════
# JSON Conversion
# ══════════════════════════════════════════════════════════════
def candidate_to_real_case_json(c: Candidate, images: dict, h1_profile: SourceProfile, d1_profile: SourceProfile) -> dict:
    setup_def = [s for s in SETUP_DEFINITIONS if s["id"] == c.setup_id][0]
    
    outcome_zh = "未達到停損或獲利目標" if c.outcome == "neither" else ("觸及獲利目標" if c.outcome == "TP hit" else "觸及停損")
    outcome_en = c.outcome if c.outcome else "neither"
    
    mfe_text = f"+{c.mfe:.3f}R" if c.mfe is not None else "—"
    mae_text = f"{c.mae:.3f}R" if c.mae is not None else "—"
    
    return {
        "id": c.id,
        "setup_id": c.setup_id,
        "case_type": "historical_pattern",
        "symbol": c.symbol,
        "market": "FX",
        "execution_timeframe": "H1",
        "higher_timeframe": "D1",
        "trade_date": c.d1_setup_date,
        "direction": c.direction,
        "context": {
            "zh": f"{c.symbol} {c.d1_setup_date}：{c.d1_reasoning}",
            "en": f"{c.symbol} {c.d1_setup_date}: {c.d1_reasoning}",
        },
        "trade_thesis": {
            "zh": f"D1 {setup_def['titleZh']} 成立，H1 進場觸發：{c.h1_entry_trigger}",
            "en": f"D1 {setup_def['titleEn']} setup confirmed, H1 entry trigger: {c.h1_entry_trigger}",
        },
        "entry": {
            "price": c.h1_entry_price,
            "candle_index": c.h1_entry_index,
            "reason": {
                "zh": f"規則式觀察進場：{c.h1_entry_trigger}，進場價 {c.h1_entry_price}",
                "en": f"Rule-based observation entry: {c.h1_entry_trigger}, entry at {c.h1_entry_price}",
            },
        },
        "initial_stop": {
            "price": c.stop_loss,
            "candle_index": c.h1_signal_index,
            "reason": {
                "zh": f"規則式初始停損設於 {c.stop_loss}，風險距離 {c.stop_distance}",
                "en": f"Rule-based initial stop set at {c.stop_loss}, risk distance {c.stop_distance}",
            },
        },
        "trailing_method": {
            "zh": "依 H1 結構低點/高點逐步移動停損。",
            "en": "Trail stop progressively behind confirmed H1 structural swing points.",
        },
        "trailing_stops": [],
        "exit": {
            "price": None,
            "candle_index": None,
            "reason": {
                "zh": f"歷史型態觀察，MFE {mfe_text}，MAE {mae_text}。{outcome_zh}。",
                "en": f"Historical pattern observation, MFE {mfe_text}, MAE {mae_text}. {outcome_en}.",
            },
        },
        "adr": {
            "period": 20,
            "completed_at_entry_percent": c.adr_used_pct,
            "high": None,
            "low": None,
            "target": c.take_profit if c.target_method == "ADR target" else None,
        },
        "ema": {
            "ema15": c.h1_ema15_at_entry,
            "ema50": c.h1_ema50_at_entry,
            "higher_timeframe_ema15": c.d1_ema15,
            "ema15_context": {
                "zh": f"H1 EMA15 位於 {c.h1_ema15_at_entry}" if c.h1_ema15_at_entry else "資料不足",
                "en": f"H1 EMA15 at {c.h1_ema15_at_entry}" if c.h1_ema15_at_entry else "Insufficient data",
            },
            "ema50_context": {
                "zh": f"H1 EMA50 位於 {c.h1_ema50_at_entry}" if c.h1_ema50_at_entry else "資料不足",
                "en": f"H1 EMA50 at {c.h1_ema50_at_entry}" if c.h1_ema50_at_entry else "Insufficient data",
            },
        },
        "higher_timeframe_context": {
            "zh": f"D1 EMA15 位於 {c.d1_ema15}，D1 關鍵支撐/壓力位於 {c.d1_support20 or c.d1_resist20}" if c.d1_ema15 else "資料不足",
            "en": f"D1 EMA15 at {c.d1_ema15}, D1 key level at {c.d1_support20 or c.d1_resist20}" if c.d1_ema15 else "Insufficient data",
        },
        "performance": {
            "risk_amount": c.stop_distance,
            "result_amount": None,
            "result_percent": None,
            "result_r": c.achieved_r,
        },
        "outcome_summary": {
            "zh": f"規則式觀察：MFE {mfe_text}，MAE {mae_text}，結果 R {c.achieved_r if c.achieved_r is not None else '—'}。{outcome_zh}。這不是實際交易。",
            "en": f"Rule-based observation: MFE {mfe_text}, MAE {mae_text}, achieved R {c.achieved_r if c.achieved_r is not None else '—'}. {outcome_en}. This is not an executed trade.",
        },
        "evidence": {
            "status": "source_backed",
            "method_version": METHOD_VERSION,
            "timezone": "source/broker timezone not documented",
            "signal_time": c.h1_entry_time,
            "confirmation_time": c.h1_entry_time,
            "entry_time": c.h1_entry_time,
            "h1_source_sha256": h1_profile.sha256,
            "d1_source_sha256": d1_profile.sha256,
            "h1_rows": h1_profile.rows_complete,
            "d1_rows": d1_profile.rows_complete,
            "support_distance_adr": None,
            "lower_wick_atr": None,
            "next_48h_mfe_r": c.mfe,
            "next_48h_mae_r": c.mae,
        },
        "notes": [
            {
                "zh": f"本案例由 {METHOD_VERSION} 掃描器從 {c.symbol} D1/H1 歷史 OHLC 自動偵測，完全遵循無未來資料偏差原則。",
                "en": f"This case was auto-detected by {METHOD_VERSION} scanner from {c.symbol} D1/H1 historical OHLC, strictly preventing look-ahead bias.",
            },
        ],
        "lessons": {
            "what_worked": {
                "zh": f"{setup_def['titleZh']} 型態條件明確，H1 出現及時進場動能確認。",
                "en": f"{setup_def['titleEn']} setup was clear, and H1 offered timely momentum confirmation.",
            },
            "what_was_imperfect": {
                "zh": "來源時區未記載；進場與停損為固定規則推導。",
                "en": "Source timezone undocumented; entry and stop are rule-derived.",
            },
            "invalidation": {
                "zh": "價格有效跌破/突破結構停損位。",
                "en": "Price decisively breaches the structural stop level.",
            },
            "a_plus": {
                "zh": f"高階 D1 位置優勢 + H1 早期低風險進場 + 充足 ADR 空間。",
                "en": f"High-tier D1 location advantage + H1 early low-risk entry + ample ADR room.",
            },
            "downgrade": {
                "zh": "型態模糊、進場過慢或上方空間不足。",
                "en": "Unclear pattern, late entry, or insufficient room to major obstacle.",
            },
        },
        "images": {
            "original": f"/real-cases/{images.get('original', '')}" if images.get("original") else None,
            "annotated": f"/real-cases/{images.get('annotated', '')}" if images.get("annotated") else None,
            "annotation_file": None,
        },
    }


# ══════════════════════════════════════════════════════════════
# Scanners Registry & Selector
# ══════════════════════════════════════════════════════════════
SCANNERS = {
    "false_break_reclaim":   scan_false_break_reclaim,
    "flat_pullback":         scan_flat_pullback,
    "first_pullback":        scan_first_pullback,
    "compression_expansion": scan_compression_expansion,
    "failed_m_top":          scan_failed_m_top,
    "failed_w_bottom":       scan_failed_w_bottom,
    "exhaustion_reversal":   scan_exhaustion_reversal,
    "lower_wick_adr":        scan_lower_wick_adr,
    "morning_star_support":  scan_morning_star_support,
    "mtop_break_retest":     scan_mtop_break_retest,
}


def select_best_cases(all_candidates: dict[str, list[Candidate]], max_per_pattern: int = 3) -> dict[str, list[Candidate]]:
    selected = {}
    for setup_id, candidates in all_candidates.items():
        complete = [c for c in candidates if c.validation_status == "COMPLETE_REAL_MARKET_CASE"]
        if not complete:
            selected[setup_id] = []
            continue
        
        ranked = sorted(complete, key=lambda c: c.score, reverse=True)
        picks: list[Candidate] = []
        for c in ranked:
            if len(picks) >= max_per_pattern:
                break
            if any(p.d1_setup_date == c.d1_setup_date and p.symbol == c.symbol for p in picks):
                continue
            picks.append(c)
        
        # Include at least one failed example if available to avoid survivorship bias
        failed = [c for c in ranked if c.sl_hit and c not in picks]
        if failed and not any(c.sl_hit for c in picks):
            if len(picks) >= max_per_pattern:
                picks[-1] = failed[0]
            else:
                picks.append(failed[0])
        
        selected[setup_id] = picks
    return selected


# ══════════════════════════════════════════════════════════════
# Main Entry Point
# ══════════════════════════════════════════════════════════════
def main():
    parser = argparse.ArgumentParser(description="Deterministic FX Pattern Scanner — All 10 Setup Library Patterns")
    parser.add_argument("--data-root", type=Path, required=True, help="Path to FX_RESEARCH/data")
    parser.add_argument("--output-dir", type=Path, required=True, help="Output directory for generated JSONs and audit")
    parser.add_argument("--image-output", type=Path, default=None, help="Output directory for chart PNGs")
    parser.add_argument("--max-per-pattern", type=int, default=3, help="Max cases per pattern selected for website")
    args = parser.parse_args()
    
    args.output_dir.mkdir(parents=True, exist_ok=True)
    if args.image_output:
        args.image_output.mkdir(parents=True, exist_ok=True)
    
    h1_files = sorted(args.data_root.glob("*60.csv"))
    symbols = [
        p.stem.removesuffix("60") for p in h1_files
        if (args.data_root / f"{p.stem.removesuffix('60')}1440.csv").exists()
    ]
    if not symbols:
        raise SystemExit("No paired H1/D1 source files found")
    
    # 1. Load Data & Compute Coverage Alignment
    profiles: list[SourceProfile] = []
    coverages: list[PairCoverage] = []
    prepared: dict[str, tuple[pd.DataFrame, pd.DataFrame, SourceProfile, SourceProfile]] = {}
    total_d1 = 0
    total_h1 = 0
    
    for symbol in symbols:
        h1_frame, h1_profile = load_bars(args.data_root / f"{symbol}60.csv", symbol, "H1")
        d1_frame, d1_profile = load_bars(args.data_root / f"{symbol}1440.csv", symbol, "D1")
        profiles.extend([h1_profile, d1_profile])
        
        total_d1 += d1_profile.rows_complete
        total_h1 += h1_profile.rows_complete
        
        d1_start = d1_frame.iloc[0]["timestamp"] if len(d1_frame) > 0 else pd.NaT
        d1_end = d1_frame.iloc[-1]["timestamp"] if len(d1_frame) > 0 else pd.NaT
        h1_start = h1_frame.iloc[0]["timestamp"] if len(h1_frame) > 0 else pd.NaT
        h1_end = h1_frame.iloc[-1]["timestamp"] if len(h1_frame) > 0 else pd.NaT
        
        overlap_start = max(d1_start, h1_start)
        overlap_end = min(d1_end, h1_end)
        
        coverage = PairCoverage(
            symbol=symbol,
            d1_start=d1_start.strftime("%Y-%m-%d") if pd.notna(d1_start) else "—",
            d1_end=d1_end.strftime("%Y-%m-%d") if pd.notna(d1_end) else "—",
            d1_rows=d1_profile.rows_complete,
            h1_start=h1_start.strftime("%Y-%m-%d %H:%M") if pd.notna(h1_start) else "—",
            h1_end=h1_end.strftime("%Y-%m-%d %H:%M") if pd.notna(h1_end) else "—",
            h1_rows=h1_profile.rows_complete,
            overlap_start=overlap_start.strftime("%Y-%m-%d") if pd.notna(overlap_start) else "—",
            overlap_end=overlap_end.strftime("%Y-%m-%d") if pd.notna(overlap_end) else "—",
            status="ACTIVE_OVERLAP" if overlap_start <= overlap_end else "NO_OVERLAP",
        )
        coverages.append(coverage)
        
        d1 = prepare_d1(d1_frame)
        h1 = prepare_h1(h1_frame, d1)
        prepared[symbol] = (d1, h1, d1_profile, h1_profile)
    
    # Print Coverage Table
    print("\n" + "=" * 120)
    print("FX DATA COVERAGE & MULTI-TIMEFRAME OVERLAP REPORT")
    print("=" * 120)
    print(f"{'PAIR':<8} | {'D1 FROM':<10} | {'D1 TO':<10} | {'H1 FROM':<16} | {'H1 TO':<16} | {'OVERLAP FROM':<12} | {'OVERLAP TO':<12} | {'STATUS'}")
    print("-" * 120)
    for cov in coverages:
        print(f"{cov.symbol:<8} | {cov.d1_start:<10} | {cov.d1_end:<10} | {cov.h1_start:<16} | {cov.h1_end:<16} | {cov.overlap_start:<12} | {cov.overlap_end:<12} | {cov.status}")
    print("=" * 120)
    print(f"Total Symbols Scanned: {len(symbols)}")
    print(f"Total D1 Candles:      {total_d1:,}")
    print(f"Total H1 Candles:      {total_h1:,}")
    
    # 2. Run Scanners Across All Symbols
    all_candidates: dict[str, list[Candidate]] = {s["id"]: [] for s in SETUP_DEFINITIONS}
    
    for symbol in symbols:
        d1, h1, _, _ = prepared[symbol]
        print(f"\nScanning {symbol} (D1: {len(d1):,} bars, H1: {len(h1):,} bars)...", flush=True)
        
        for setup_id, scanner_fn in SCANNERS.items():
            try:
                results = scanner_fn(symbol, d1, h1)
                for c in results:
                    if c.validation_status == "COMPLETE_REAL_MARKET_CASE":
                        evaluate_outcome(c, h1)
                all_candidates[setup_id].extend(results)
                complete_count = sum(1 for c in results if c.validation_status == "COMPLETE_REAL_MARKET_CASE")
                outside_count = sum(1 for c in results if c.validation_status == "D1_PATTERN_OUTSIDE_H1_COVERAGE")
                if results:
                    print(f"  {setup_id:<25}: total {len(results):>3} (validated H1: {complete_count:>2}, outside H1: {outside_count:>3})", flush=True)
            except Exception as e:
                print(f"  {setup_id}: ERROR - {e}", flush=True)
    
    # 3. Overall Multi-timeframe Validation Statistics
    total_d1_detected = sum(len(cands) for cands in all_candidates.values())
    total_complete_cases = sum(sum(1 for c in cands if c.validation_status == "COMPLETE_REAL_MARKET_CASE") for cands in all_candidates.values())
    total_outside_coverage = sum(sum(1 for c in cands if c.validation_status == "D1_PATTERN_OUTSIDE_H1_COVERAGE") for cands in all_candidates.values())
    total_no_h1_trigger = sum(sum(1 for c in cands if c.validation_status == "D1_PATTERN_NO_H1_TRIGGER") for cands in all_candidates.values())
    total_inside_coverage = total_complete_cases + total_no_h1_trigger
    
    print("\n" + "=" * 100)
    print("DETECTION & MULTI-TIMEFRAME VALIDATION SUMMARY")
    print("=" * 100)
    print(f"Total D1 Patterns Detected:                   {total_d1_detected:>5}")
    print(f"  - Patterns Inside H1 Coverage Window:       {total_inside_coverage:>5}")
    print(f"      * Successfully Producing H1 Entries:    {total_complete_cases:>5}")
    print(f"      * No H1 Trigger in Entry Window:        {total_no_h1_trigger:>5}")
    print(f"  - Patterns Outside H1 Coverage Window:      {total_outside_coverage:>5}")
    print("-" * 100)
    print(f"{'#':<3} {'PATTERN':<40} {'TOTAL':<7} {'OUTSIDE H1':<12} {'INSIDE H1':<10} {'VALIDATED H1 (W/L/N)'}")
    print("-" * 100)
    for s in SETUP_DEFINITIONS:
        sid = s["id"]
        cands = all_candidates[sid]
        tot = len(cands)
        out_cov = sum(1 for c in cands if c.validation_status == "D1_PATTERN_OUTSIDE_H1_COVERAGE")
        in_cov = sum(1 for c in cands if c.validation_status != "D1_PATTERN_OUTSIDE_H1_COVERAGE")
        comp = [c for c in cands if c.validation_status == "COMPLETE_REAL_MARKET_CASE"]
        wins = sum(1 for c in comp if c.tp_hit)
        losses = sum(1 for c in comp if c.sl_hit)
        neither = sum(1 for c in comp if c.outcome == "neither")
        print(f"{s['number']:02d}  {s['titleEn']:<40} {tot:>5}   {out_cov:>8}     {in_cov:>8}   {len(comp):>3} (W:{wins} L:{losses} N:{neither})")
    print("=" * 100)
    
    # 4. Selection of Representative Examples for the Website
    selected = select_best_cases(all_candidates, max_per_pattern=args.max_per_pattern)
    
    print("\n" + "=" * 100)
    print("REPRESENTATIVE EXAMPLES SELECTED FOR WEBSITE")
    print("=" * 100)
    
    website_cases = []
    no_case_patterns = []
    
    for s in SETUP_DEFINITIONS:
        sid = s["id"]
        picks = selected[sid]
        if not picks:
            no_case_patterns.append(sid)
            print(f"  {s['number']:02d} {s['titleEn']}: No qualified real-market example found")
            continue
        
        print(f"\n  [{s['number']:02d}] {s['titleEn']} ({s['titleZh']}): {len(picks)} cases")
        for c in picks:
            images = {}
            if args.image_output:
                try:
                    d1_data, h1_data = prepared[c.symbol][0], prepared[c.symbol][1]
                    images = chart_candidate(c, h1_data, d1_data, args.image_output)
                except Exception as e:
                    print(f"    Chart error for {c.id}: {e}")
            
            d1_prof = prepared[c.symbol][2]
            h1_prof = prepared[c.symbol][3]
            
            case_json = candidate_to_real_case_json(c, images, h1_prof, d1_prof)
            website_cases.append(case_json)
            
            res_str = f"R={c.achieved_r}" if c.achieved_r is not None else "—"
            print(f"    * {c.symbol:<6} | Setup Date: {c.d1_setup_date} | Entry Time: {c.h1_entry_time} | Entry: {c.h1_entry_price} | SL: {c.stop_loss} | TP: {c.take_profit} | RR: {c.risk_reward} | Result: {c.outcome} ({res_str})")
    
    # Save individual case JSONs
    for case in website_cases:
        case_path = args.output_dir / f"{case['id']}.json"
        case_path.write_text(json.dumps(case, ensure_ascii=False, indent=2), encoding="utf-8")
    
    # Save audit record
    audit = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "method_version": METHOD_VERSION,
        "source_root": "preserved FX_RESEARCH/data archive",
        "timezone": "source/broker timezone not documented",
        "symbols_scanned": len(symbols),
        "symbols": symbols,
        "total_d1_candles": total_d1,
        "total_h1_candles": total_h1,
        "coverage_by_pair": [asdict(c) for c in coverages],
        "summary": {
            "total_d1_patterns_detected": total_d1_detected,
            "patterns_inside_h1_coverage": total_inside_coverage,
            "patterns_outside_h1_coverage": total_outside_coverage,
            "patterns_with_valid_h1_entry": total_complete_cases,
            "patterns_without_h1_trigger": total_no_h1_trigger,
        },
        "patterns_breakdown": {
            s["id"]: {
                "number": s["number"],
                "titleEn": s["titleEn"],
                "titleZh": s["titleZh"],
                "total_detected": len(all_candidates[s["id"]]),
                "outside_h1_coverage": sum(1 for c in all_candidates[s["id"]] if c.validation_status == "D1_PATTERN_OUTSIDE_H1_COVERAGE"),
                "inside_h1_coverage": sum(1 for c in all_candidates[s["id"]] if c.validation_status != "D1_PATTERN_OUTSIDE_H1_COVERAGE"),
                "validated_h1_entries": sum(1 for c in all_candidates[s["id"]] if c.validation_status == "COMPLETE_REAL_MARKET_CASE"),
                "selected_for_website": len(selected[s["id"]]),
            }
            for s in SETUP_DEFINITIONS
        },
        "selected_case_ids": [c["id"] for c in website_cases],
        "no_case_patterns": no_case_patterns,
    }
    audit_path = args.output_dir / "all_patterns_audit.json"
    audit_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")
    
    # Save manifest
    manifest = {
        "cases": [{"id": c["id"], "setup_id": c["setup_id"], "file": f"{c['id']}.json"} for c in website_cases],
        "no_case_patterns": no_case_patterns,
    }
    manifest_path = args.output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    
    print("\n" + "=" * 100)
    print("EXECUTION COMPLETED")
    print(f"  Total Validated Cases Written: {len(website_cases)}")
    print(f"  Patterns without Qualified Example: {len(no_case_patterns)} ({', '.join(no_case_patterns) if no_case_patterns else 'None'})")
    print(f"  Audit file:   {audit_path}")
    print(f"  Manifest:     {manifest_path}")
    print("=" * 100 + "\n")


if __name__ == "__main__":
    main()
