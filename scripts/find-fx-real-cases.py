#!/usr/bin/env python3
"""Find source-backed FX examples from the preserved D1/H1 CSV archive."""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


COLUMNS = ["date", "time", "open", "high", "low", "close", "volume"]
METHOD_VERSION = "fx-location-wick-v1"


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
    incomplete_rows_removed: int


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_bars(path: Path, symbol: str, timeframe: str, latest_h1_day: pd.Timestamp | None = None):
    frame = pd.read_csv(path, names=COLUMNS, header=None)
    raw_count = len(frame)
    frame["timestamp"] = pd.to_datetime(frame["date"] + " " + frame["time"], format="%Y.%m.%d %H:%M", errors="raise")
    for column in ["open", "high", "low", "close", "volume"]:
        frame[column] = pd.to_numeric(frame[column], errors="raise")
    if frame["timestamp"].duplicated().any():
        raise ValueError(f"Duplicate timestamps in {path}")
    valid_ohlc = (
        (frame["high"] >= frame[["open", "close", "low"]].max(axis=1))
        & (frame["low"] <= frame[["open", "close", "high"]].min(axis=1))
    )
    if not bool(valid_ohlc.all()):
        raise ValueError(f"OHLC rule violation in {path}")
    if timeframe == "H1":
        # The source uses a recurring :10 session offset for several valid hourly bars.
        # Only the final partial row is excluded when it is off the regular session cadence.
        if frame.iloc[-1]["timestamp"].minute != 0:
            frame = frame.iloc[:-1].copy()
    elif latest_h1_day is not None:
        frame = frame[frame["timestamp"].dt.normalize() < latest_h1_day].copy()
    frame = frame.sort_values("timestamp").reset_index(drop=True)
    profile = SourceProfile(
        symbol=symbol,
        timeframe=timeframe,
        path=path.name,
        sha256=sha256_file(path),
        rows_raw=raw_count,
        rows_complete=len(frame),
        start=frame.iloc[0]["timestamp"].isoformat(),
        end=frame.iloc[-1]["timestamp"].isoformat(),
        incomplete_rows_removed=raw_count - len(frame),
    )
    return frame, profile


def ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False, min_periods=span).mean()


def true_range(frame: pd.DataFrame) -> pd.Series:
    previous_close = frame["close"].shift(1)
    return pd.concat(
        [frame["high"] - frame["low"], (frame["high"] - previous_close).abs(), (frame["low"] - previous_close).abs()],
        axis=1,
    ).max(axis=1)


def prepare_daily(frame: pd.DataFrame) -> pd.DataFrame:
    daily = frame.copy()
    daily["ema15"] = ema(daily["close"], 15)
    daily["adr20"] = (daily["high"] - daily["low"]).rolling(20, min_periods=20).mean()
    daily["support20"] = daily["low"].rolling(20, min_periods=20).min()
    daily["available_at"] = daily["timestamp"].dt.normalize() + pd.Timedelta(days=1)
    return daily


def prepare_h1(frame: pd.DataFrame, daily: pd.DataFrame) -> pd.DataFrame:
    hourly = frame.copy()
    hourly["ema15"] = ema(hourly["close"], 15)
    hourly["ema50"] = ema(hourly["close"], 50)
    hourly["atr14"] = true_range(hourly).rolling(14, min_periods=14).mean()
    context = daily[["available_at", "ema15", "adr20", "support20"]].rename(
        columns={"ema15": "d1_ema15", "adr20": "d1_adr20", "support20": "d1_support20"}
    )
    hourly = pd.merge_asof(
        hourly.sort_values("timestamp"),
        context.sort_values("available_at"),
        left_on="timestamp",
        right_on="available_at",
        direction="backward",
    )
    hourly["session_day"] = hourly["timestamp"].dt.normalize()
    hourly["day_high_so_far"] = hourly.groupby("session_day")["high"].cummax()
    hourly["day_low_so_far"] = hourly.groupby("session_day")["low"].cummin()
    hourly["adr_used"] = hourly["day_high_so_far"] - hourly["day_low_so_far"]
    return hourly


def scan_long_lower_wick(symbol: str, hourly: pd.DataFrame) -> list[dict]:
    candidates: list[dict] = []
    for index in range(55, len(hourly) - 50):
        row = hourly.iloc[index]
        required = [row.atr14, row.d1_adr20, row.d1_support20, row.d1_ema15]
        if not all(np.isfinite(value) and value > 0 for value in required):
            continue
        candle_range = row.high - row.low
        body = abs(row.close - row.open)
        lower_wick = min(row.open, row.close) - row.low
        close_position = (row.close - row.low) / candle_range if candle_range > 0 else 0
        support_distance_adr = abs(row.low - row.d1_support20) / row.d1_adr20
        wick_ok = lower_wick >= max(body * 1.5, row.atr14 * 0.28) and close_position >= 0.60
        support_ok = row.low <= row.d1_support20 + row.d1_adr20 * 0.18 and row.close >= row.d1_support20 - row.d1_adr20 * 0.05
        adr_used_percent = row.adr_used / row.d1_adr20 * 100
        adr_ok = adr_used_percent <= 72
        if not (wick_ok and support_ok and adr_ok):
            continue

        confirmation_index = None
        for probe in range(index + 1, min(index + 7, len(hourly) - 1)):
            if hourly.iloc[probe].close > row.high and hourly.iloc[probe].close > hourly.iloc[probe].ema15:
                confirmation_index = probe
                break
        if confirmation_index is None:
            continue
        entry_index = confirmation_index + 1
        entry = hourly.iloc[entry_index]
        initial_stop = row.low - row.atr14 * 0.08
        risk = entry.open - initial_stop
        if risk <= 0:
            continue
        future = hourly.iloc[entry_index : min(entry_index + 49, len(hourly))]
        mfe_r = (future.high.max() - entry.open) / risk
        mae_r = (future.low.min() - entry.open) / risk
        adr_target = row.day_low_so_far + row.d1_adr20
        ema_room_r = (row.d1_ema15 - entry.open) / risk
        wick_strength = lower_wick / row.atr14
        momentum_r = (hourly.iloc[confirmation_index].close - row.high) / risk
        score = (
            min(wick_strength, 2.0) * 1.8
            + max(0, 0.20 - support_distance_adr) * 8
            + max(0, 72 - adr_used_percent) / 30
            + min(max(momentum_r, 0), 1.0)
            + min(max(mfe_r, 0), 3.0) * 0.35
        )
        candidates.append(
            {
                "id": f"{symbol.lower()}_{row.timestamp:%Y%m%d_%H%M}",
                "symbol": symbol,
                "setup_id": "lower_wick_adr",
                "case_type": "historical_pattern",
                "signal_time": row.timestamp.isoformat(),
                "confirmation_time": hourly.iloc[confirmation_index].timestamp.isoformat(),
                "entry_time": entry.timestamp.isoformat(),
                "signal_index": int(index),
                "confirmation_index": int(confirmation_index),
                "entry_index": int(entry_index),
                "signal_open": round(float(row.open), 6),
                "signal_high": round(float(row.high), 6),
                "signal_low": round(float(row.low), 6),
                "signal_close": round(float(row.close), 6),
                "entry_price": round(float(entry.open), 6),
                "initial_stop": round(float(initial_stop), 6),
                "d1_support": round(float(row.d1_support20), 6),
                "d1_ema15": round(float(row.d1_ema15), 6),
                "h1_ema15_at_entry": round(float(entry.ema15), 6),
                "h1_ema50_at_entry": round(float(entry.ema50), 6),
                "adr20": round(float(row.d1_adr20), 6),
                "adr_used_at_signal_percent": round(float(adr_used_percent), 2),
                "adr_target": round(float(adr_target), 6),
                "support_distance_adr": round(float(support_distance_adr), 4),
                "lower_wick_atr": round(float(wick_strength), 3),
                "d1_ema15_room_r": round(float(ema_room_r), 3),
                "next_48h_mfe_r": round(float(mfe_r), 3),
                "next_48h_mae_r": round(float(mae_r), 3),
                "score": round(float(score), 4),
            }
        )
    return sorted(candidates, key=lambda item: item["score"], reverse=True)


def draw_candles(axis, frame: pd.DataFrame, width: float = 0.62):
    for x, row in enumerate(frame.itertuples()):
        rising = row.close >= row.open
        color = "#d85b65" if rising else "#218b75"
        axis.vlines(x, row.low, row.high, color=color, linewidth=0.8, alpha=0.9)
        bottom = min(row.open, row.close)
        height = max(abs(row.close - row.open), (row.high - row.low) * 0.015)
        axis.add_patch(plt.Rectangle((x - width / 2, bottom), width, height, facecolor="#ffffff" if rising else color, edgecolor=color, linewidth=0.9))


def style_axis(axis):
    axis.grid(axis="y", color="#e5e9e7", linewidth=0.7)
    axis.spines[["top", "right", "left"]].set_visible(False)
    axis.tick_params(colors="#66716c", labelsize=8)


def chart_case(hourly: pd.DataFrame, daily: pd.DataFrame, candidate: dict, output_dir: Path, annotated: bool) -> Path:
    signal_index = candidate["signal_index"]
    start = max(0, signal_index - 45)
    end = min(len(hourly), signal_index + 36)
    h1 = hourly.iloc[start:end].copy().reset_index(drop=True)
    signal_x = signal_index - start
    entry_x = candidate["entry_index"] - start
    signal_day = pd.Timestamp(candidate["signal_time"]).normalize()
    d1 = daily[daily.timestamp.dt.normalize() <= signal_day].tail(55).copy().reset_index(drop=True)
    d1["ema15_plot"] = ema(d1.close, 15)

    fig, axes = plt.subplots(2, 1, figsize=(15, 9), gridspec_kw={"height_ratios": [0.9, 1.55]}, constrained_layout=True)
    fig.patch.set_facecolor("#f8faf9")
    for axis in axes:
        axis.set_facecolor("#ffffff")
    draw_candles(axes[0], d1)
    axes[0].plot(range(len(d1)), d1.ema15_plot, color="#1f2933", linewidth=1.1, label="D1 EMA15")
    axes[0].set_title(f"{candidate['symbol']} D1 CONTEXT", loc="left", fontsize=11, fontweight="bold", color="#202824")
    axes[0].legend(loc="upper left", frameon=False, fontsize=8)
    style_axis(axes[0])

    draw_candles(axes[1], h1)
    axes[1].plot(range(len(h1)), h1.ema15, color="#1f2933", linewidth=1.0, label="H1 EMA15")
    axes[1].plot(range(len(h1)), h1.ema50, color="#b24555", linewidth=1.0, label="H1 EMA50")
    axes[1].set_title(f"{candidate['symbol']} H1 · {candidate['signal_time'].replace('T', ' ')}", loc="left", fontsize=12, fontweight="bold", color="#202824")
    axes[1].legend(loc="upper left", frameon=False, fontsize=8)
    style_axis(axes[1])

    if annotated:
        axes[0].axhline(candidate["d1_support"], color="#26755b", linewidth=1.0, linestyle="--")
        axes[0].text(len(d1) - 1, candidate["d1_support"], f" D1 support {candidate['d1_support']:.3f}", va="bottom", ha="right", color="#26755b", fontsize=8)
        axes[1].axhline(candidate["d1_support"], color="#26755b", linewidth=1.0, linestyle="--")
        axes[1].axhline(candidate["entry_price"], color="#2676aa", linewidth=1.0)
        axes[1].axhline(candidate["initial_stop"], color="#b24555", linewidth=1.0, linestyle="--")
        axes[1].axhline(candidate["adr_target"], color="#aa7a24", linewidth=1.0, linestyle=":")
        confirmation_x = candidate["confirmation_index"] - start
        axes[1].annotate("Long lower wick at D1 support", xy=(signal_x, candidate["signal_low"]), xytext=(signal_x - 18, candidate["signal_low"] - candidate["adr20"] * 0.14), arrowprops={"arrowstyle": "->", "color": "#26755b"}, fontsize=8, color="#26755b")
        axes[1].annotate("Momentum confirmation", xy=(confirmation_x, hourly.iloc[candidate["confirmation_index"]].close), xytext=(confirmation_x + 7, candidate["signal_high"] + candidate["adr20"] * 0.42), arrowprops={"arrowstyle": "->", "color": "#2676aa"}, fontsize=8, color="#2676aa")
        axes[1].text(entry_x + 1, candidate["entry_price"] + candidate["adr20"] * 0.10, f"Rule-based entry {candidate['entry_price']:.3f}", color="#2676aa", fontsize=8, va="bottom")
        axes[1].text(entry_x + 1, candidate["initial_stop"], f"Initial stop {candidate['initial_stop']:.3f}", color="#b24555", fontsize=8, va="top")
        axes[1].text(len(h1) - 1, candidate["adr_target"], f"ADR target {candidate['adr_target']:.3f}", color="#aa7a24", fontsize=8, va="bottom", ha="right")
        axes[1].text(len(h1) - 1, candidate["d1_support"], f"D1 support {candidate['d1_support']:.3f}", color="#26755b", fontsize=8, va="bottom", ha="right")

    step = max(1, len(h1) // 8)
    h1_ticks = list(range(0, len(h1), step))
    axes[1].set_xticks(h1_ticks, [h1.iloc[i].timestamp.strftime("%m-%d\n%H:%M") for i in h1_ticks])
    d1_step = max(1, len(d1) // 7)
    d1_ticks = list(range(0, len(d1), d1_step))
    axes[0].set_xticks(d1_ticks, [d1.iloc[i].timestamp.strftime("%Y-%m-%d") for i in d1_ticks], rotation=0)
    fig.suptitle("SOURCE-BACKED HISTORICAL RECONSTRUCTION · NOT AN EXECUTION RECORD", fontsize=9, color="#69736e", y=1.01)

    suffix = "annotated" if annotated else "original"
    output = output_dir / f"{candidate['id']}_{suffix}.png"
    fig.savefig(output, dpi=180, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--audit-output", type=Path, required=True)
    parser.add_argument("--image-output", type=Path, required=True)
    args = parser.parse_args()
    args.audit_output.parent.mkdir(parents=True, exist_ok=True)
    args.image_output.mkdir(parents=True, exist_ok=True)

    h1_files = sorted(args.data_root.glob("*60.csv"))
    symbols = [path.stem.removesuffix("60") for path in h1_files if (args.data_root / f"{path.stem.removesuffix('60')}1440.csv").exists()]
    if not symbols:
        raise SystemExit("No paired H1/D1 source files found")

    profiles: list[SourceProfile] = []
    all_candidates: list[dict] = []
    prepared: dict[str, tuple[pd.DataFrame, pd.DataFrame]] = {}
    for symbol in symbols:
        h1, h1_profile = load_bars(args.data_root / f"{symbol}60.csv", symbol, "H1")
        latest_h1_day = h1.iloc[-1].timestamp.normalize()
        d1, d1_profile = load_bars(args.data_root / f"{symbol}1440.csv", symbol, "D1", latest_h1_day)
        profiles.extend([h1_profile, d1_profile])
        daily = prepare_daily(d1)
        hourly = prepare_h1(h1, daily)
        prepared[symbol] = (hourly, daily)
        all_candidates.extend(scan_long_lower_wick(symbol, hourly))

    ranked = sorted(all_candidates, key=lambda item: item["score"], reverse=True)
    usd_candidates = [item for item in ranked if item["symbol"] == "USDJPY"]
    selected = usd_candidates[0] if usd_candidates else None
    images = None
    if selected:
        hourly, daily = prepared["USDJPY"]
        original = chart_case(hourly, daily, selected, args.image_output, annotated=False)
        annotated = chart_case(hourly, daily, selected, args.image_output, annotated=True)
        images = {"original": str(original), "annotated": str(annotated)}

    audit = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "method_version": METHOD_VERSION,
        "source_root": "preserved FX_RESEARCH/data archive",
        "timezone": "source/broker timezone not documented",
        "criteria": {
            "location": "H1 low within 0.18 D1 ADR above prior completed D1 20-day support",
            "wick": "lower wick >= 1.5 body and >= 0.28 H1 ATR14; close in upper 40%",
            "momentum": "close above signal high and H1 EMA15 within six completed H1 bars",
            "adr": "intraday range used <= 72% of prior completed D1 ADR20",
            "incomplete_bar_rule": "drop only the final off-cadence H1 row and the D1 row for the latest H1 calendar day; preserve recurring :10 source-session bars",
        },
        "sources": [asdict(profile) for profile in profiles],
        "candidate_count": len(ranked),
        "top_candidates": ranked[:100],
        "selected_usdjpy": selected,
        "selected_images": images,
    }
    args.audit_output.write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"symbols": symbols, "candidate_count": len(ranked), "selected_usdjpy": selected, "images": images}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
