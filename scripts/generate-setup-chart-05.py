"""
Script to generate the updated Charlie A+ Setup Library: Setup 05 (Failed M Top to Bullish Reversal)
Generates both public/setup-library/failed_m_top.svg and public/setup-library/failed_m_top.png
"""
import os
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import matplotlib.lines as lines

def create_setup_05_chart(output_svg_path, output_png_path):
    # Set Matplotlib style parameters
    plt.rcParams["font.sans-serif"] = ["DejaVu Sans", "Arial", "Helvetica"]
    plt.rcParams["axes.edgecolor"] = "#d0d7de"
    plt.rcParams["axes.linewidth"] = 0.8
    plt.rcParams["text.color"] = "#24292e"
    plt.rcParams["axes.labelcolor"] = "#68737d"
    plt.rcParams["xtick.color"] = "#68737d"
    plt.rcParams["ytick.color"] = "#68737d"

    # 1440 x 900 pt figure (20 x 12.5 in at 72 dpi)
    fig = plt.figure(figsize=(20, 12.5), dpi=72)
    fig.patch.set_facecolor("#ffffff")

    # Global Header
    fig.text(0.052, 0.945, "05  Failed M Top to Bullish Reversal", fontsize=23, fontweight="bold", color="#24292e")
    fig.text(0.052, 0.922, "CHARLIE A+ SETUP LIBRARY   |   LOCATION FIRST, PATTERN SECOND", fontsize=11, color="#68737d")
    fig.text(0.950, 0.922, "LONG  /  SYNTHETIC H1", fontsize=10, color="#68737d", ha="right")

    # Palette
    c_up_stroke = "#c5424f"       # Hollow red
    c_up_fill = "#ffffff"
    c_down_stroke = "#18836d"     # Solid green
    c_down_fill = "#18836d"
    c_ema15 = "#c68a12"           # Gold/Amber
    c_ema50 = "#77679b"           # Purple
    c_stop = "#ad345d"            # Red/Magenta
    c_trail = "#096e72"           # Teal
    c_entry = "#1467a6"           # Blue
    c_neutral = "#68737d"
    c_dark = "#24292e"
    c_adr = "#727c31"

    # Helper: draw Japanese candlesticks
    def draw_candles(ax, ohlc, width=0.55):
        for i, (op, hi, lo, cl) in enumerate(ohlc):
            if cl >= op:
                # Up candle (hollow red body)
                ax.plot([i, i], [lo, hi], color=c_up_stroke, linewidth=1.1, zorder=3)
                rect = patches.Rectangle((i - width/2, op), width, max(cl - op, 0.08),
                                         facecolor=c_up_fill, edgecolor=c_up_stroke, linewidth=1.1, zorder=4)
                ax.add_patch(rect)
            else:
                # Down candle (solid green body)
                ax.plot([i, i], [lo, hi], color=c_down_stroke, linewidth=1.1, zorder=3)
                rect = patches.Rectangle((i - width/2, cl), width, max(op - cl, 0.08),
                                         facecolor=c_down_fill, edgecolor=c_down_stroke, linewidth=1.1, zorder=4)
                ax.add_patch(rect)

    def calculate_ema(prices, span):
        alpha = 2.0 / (span + 1.0)
        ema = [prices[0]]
        for p in prices[1:]:
            ema.append(alpha * p + (1 - alpha) * ema[-1])
        return np.array(ema)

    # ==========================================
    # PANEL 1: 01 CONTEXT (Failed M Top Overview)
    # ==========================================
    ax1 = fig.add_axes([0.055, 0.567, 0.401, 0.235])
    ax1.set_facecolor("#ffffff")
    ax1.set_title("01  CONTEXT", loc="left", fontsize=13, fontweight="bold", pad=12, color="#24292e")

    # Construct OHLC for Panel 1
    # Rally -> Left Peak (110) -> Neckline (105) -> Right Peak (110) -> Breakdown -> Major Support (100)
    p1_ohlc = [
        (101.5, 103.5, 101.0, 103.0),
        (103.0, 105.5, 102.5, 105.0),
        (105.0, 107.5, 104.5, 107.0),
        (107.0, 109.8, 106.8, 109.5), # Left Peak
        (109.5, 110.2, 108.0, 108.2),
        (108.0, 108.5, 105.5, 105.8),
        (105.8, 106.5, 104.8, 105.2), # Neckline touch
        (105.2, 107.5, 105.0, 107.2),
        (107.2, 109.5, 106.8, 109.0),
        (109.0, 110.1, 108.5, 109.8), # Right Peak (Obvious M)
        (109.8, 110.0, 107.2, 107.5),
        (107.5, 107.8, 105.2, 105.5),
        (105.5, 105.8, 103.2, 103.5), # Neckline breakdown
        (103.5, 104.0, 101.5, 101.8),
        (101.8, 102.2, 99.8, 100.2),  # Drops into Major Support
    ]
    draw_candles(ax1, p1_ohlc)
    p1_closes = [x[3] for x in p1_ohlc]
    ax1.plot(range(len(p1_ohlc)), calculate_ema(p1_closes, 5), color=c_ema15, linewidth=1.5, label="EMA 15", zorder=2)

    # Horizontal structural levels with clean backdrops
    ax1.axhline(110.0, color=c_neutral, linestyle="--", linewidth=0.8, alpha=0.8)
    ax1.text(len(p1_ohlc)+0.2, 110.0, "Resistance 110.0", color=c_neutral, fontsize=8.5, va="center",
             bbox=dict(fc="#ffffff", ec="none", pad=1.5))

    ax1.axhline(105.0, color=c_dark, linestyle="--", linewidth=1.1)
    ax1.text(len(p1_ohlc)+0.2, 105.0, "Neckline 105.0", color=c_dark, fontsize=8.5, va="center", fontweight="bold",
             bbox=dict(fc="#ffffff", ec="none", pad=1.5))

    ax1.axhline(100.0, color=c_neutral, linestyle="--", linewidth=0.8, alpha=0.8)
    ax1.text(len(p1_ohlc)+0.2, 100.0, "Major Support 100.0", color=c_neutral, fontsize=8.5, va="center",
             bbox=dict(fc="#ffffff", ec="none", pad=1.5))

    # Annotations
    ax1.annotate("Left peak", xy=(3, 109.8), xytext=(3, 112.5),
                 ha="center", fontsize=9.5, color=c_dark,
                 arrowprops=dict(arrowstyle="->", color=c_dark, lw=0.9))
    ax1.annotate("Right peak: obvious M", xy=(9, 110.0), xytext=(9, 112.5),
                 ha="center", fontsize=9.5, color=c_dark,
                 arrowprops=dict(arrowstyle="->", color=c_dark, lw=0.9))
    ax1.annotate("Neckline breakdown", xy=(12, 104.5), xytext=(12, 107.8),
                 ha="center", fontsize=9.2, color=c_stop, fontweight="bold",
                 arrowprops=dict(arrowstyle="->", color=c_stop, lw=0.9))

    ax1.set_ylim(97.5, 114.5)
    ax1.set_xlim(-1, len(p1_ohlc) + 3.8)
    ax1.set_xticks([0, 3, 6, 9, 12, 14])
    ax1.set_xticklabels(["26 Jan\n00:00", "26 Jan\n06:00", "26 Jan\n12:00", "26 Jan\n18:00", "27 Jan\n00:00", "27 Jan\n04:00"], fontsize=8.5)
    ax1.set_yticks([100.0, 102.5, 105.0, 107.5, 110.0, 112.5])
    ax1.set_yticklabels(["100.0", "102.5", "105.0", "107.5", "110.0", "112.5"], fontsize=8.5)
    ax1.set_xlabel("An obvious M creates a bearish continuation expectation; price falls toward major support.", fontsize=9.5, color=c_dark, loc="left", labelpad=8)
    ax1.grid(True, linestyle=":", alpha=0.4)

    # ==========================================
    # PANEL 2: 02 TRIGGER / ENTRY (Morning Doji Star Reversal)
    # ==========================================
    ax2 = fig.add_axes([0.551, 0.567, 0.401, 0.235])
    ax2.set_facecolor("#ffffff")
    ax2.set_title("02  TRIGGER / ENTRY", loc="left", fontsize=13, fontweight="bold", pad=12, color="#24292e")

    # Construct OHLC for Panel 2:
    p2_ohlc = [
        (104.8, 105.2, 103.6, 103.8),
        (103.8, 104.0, 102.4, 102.6),
        (102.6, 102.8, 100.2, 100.3), # 1: Bearish Exhaustion
        (100.12, 100.35, 99.25, 100.10), # 2: True DOJI at Major Support
        (101.65, 103.50, 101.40, 103.25), # 3: Next Session Bullish Gap Open & Rally!
        (103.25, 104.60, 102.90, 104.50),
        (104.50, 105.50, 104.20, 105.20),
    ]
    draw_candles(ax2, p2_ohlc)

    # Structural levels with backdrops
    ax2.axhline(105.0, color=c_dark, linestyle="--", linewidth=1.1)
    ax2.text(len(p2_ohlc)+0.2, 105.0, "Neckline / Future Resistance 105.0", color=c_dark, fontsize=8.5, va="center",
             bbox=dict(fc="#ffffff", ec="none", pad=1.5))

    ax2.axhline(100.0, color=c_neutral, linestyle="--", linewidth=0.9)
    ax2.text(len(p2_ohlc)+0.2, 100.0, "Major Support 100.0", color=c_neutral, fontsize=8.5, va="center",
             bbox=dict(fc="#ffffff", ec="none", pad=1.5))

    # Stop Loss Line below Doji lower wick
    ax2.axhline(99.00, color=c_stop, linestyle="-.", linewidth=1.2)
    ax2.text(len(p2_ohlc)+0.2, 99.00, "Initial Stop 99.00 (Below Doji Wick)", color=c_stop, fontsize=8.5, va="center", fontweight="bold",
             bbox=dict(fc="#ffffff", ec="none", pad=1.5))

    # Annotations on Panel 2
    ax2.annotate("1. Bearish\nExhaustion", xy=(2, 101.5), xytext=(1.0, 106.0),
                 ha="center", fontsize=9.0, color=c_down_stroke, fontweight="bold",
                 arrowprops=dict(arrowstyle="->", color=c_down_stroke, lw=1.0))
    ax2.annotate("2. Doji (Long Lower Wick)\nMorning Doji Star Candidate", xy=(3, 99.25), xytext=(2.6, 96.2),
                 ha="center", fontsize=9.0, color=c_dark, fontweight="bold",
                 arrowprops=dict(arrowstyle="->", color=c_dark, lw=1.0))
    ax2.annotate("ALERT AT DOJI CLOSE\n(Watch for Bullish Gap)", xy=(3, 100.15), xytext=(3.0, 107.8),
                 ha="center", fontsize=9.2, color=c_stop, fontweight="bold",
                 bbox=dict(boxstyle="round,pad=0.35", fc="#fff1f3", ec=c_stop, lw=1.1),
                 arrowprops=dict(arrowstyle="->", color=c_stop, lw=1.1))
    ax2.annotate("Bullish Gap ↑", xy=(3.5, 100.9), xytext=(4.1, 98.0),
                 ha="center", fontsize=9.0, color="#b05d00", fontweight="bold",
                 arrowprops=dict(arrowstyle="->", color="#b05d00", lw=0.9))

    # 5. PRIMARY ENTRY at Bullish Gap Open
    ax2.plot(4, 101.65, marker="^", markersize=10, color=c_entry, zorder=6)
    ax2.annotate("PRIMARY ENTRY 101.65\n(Tight Stop = High Asymmetry)", xy=(4, 101.65), xytext=(4.8, 102.20),
                 va="center", fontsize=9.2, color=c_entry, fontweight="bold",
                 bbox=dict(boxstyle="round,pad=0.35", fc="#f0f7ff", ec=c_entry, lw=1.1),
                 arrowprops=dict(arrowstyle="->", color=c_entry, lw=1.1))

    ax2.set_ylim(94.8, 110.2)
    ax2.set_xlim(-0.8, len(p2_ohlc) + 4.8)
    ax2.set_xticks([0, 1, 2, 3, 4, 5, 6])
    ax2.set_xticklabels(["26 Jan\n20:00", "26 Jan\n22:00", "27 Jan\n00:00", "27 Jan\n02:00", "27 Jan\n04:00", "27 Jan\n06:00", "27 Jan\n08:00"], fontsize=8.5)
    ax2.set_yticks([96.0, 98.0, 100.0, 102.0, 104.0, 106.0, 108.0])
    ax2.set_yticklabels(["96.0", "98.0", "100.0", "102.0", "104.0", "106.0", "108.0"], fontsize=8.5)
    ax2.set_xlabel("Morning Doji Star candidate alerts at Doji close. Bullish gap at next open triggers early entry.\nPre-entry ADR: 28% used / 72% left | ADR High 115.80 / ADR Low 96.50.", fontsize=9.0, color=c_dark, loc="left", labelpad=8)
    ax2.grid(True, linestyle=":", alpha=0.4)

    # ==========================================
    # PANEL 3: 03 TRADE MANAGEMENT (Higher Low Trailing Stops)
    # ==========================================
    ax3 = fig.add_axes([0.055, 0.155, 0.401, 0.235])
    ax3.set_facecolor("#ffffff")
    ax3.set_title("03  TRADE MANAGEMENT", loc="left", fontsize=13, fontweight="bold", pad=12, color="#24292e")

    # Construct OHLC for Panel 3: In-trade management with Higher Lows
    p3_ohlc = [
        (102.6, 102.8, 100.2, 100.3), # 0: Exhaustion
        (100.12, 100.35, 99.25, 100.10), # 1: Doji
        (101.65, 103.50, 101.40, 103.25), # 2: Entry
        (103.25, 104.50, 102.60, 104.20), # 3
        (104.20, 104.80, 102.70, 103.00), # 4: Pullback to HL1 (102.70)
        (103.00, 105.60, 102.90, 105.40), # 5: Break Neckline
        (105.40, 106.80, 105.00, 106.50), # 6
        (106.50, 107.00, 104.80, 105.20), # 7: Pullback to HL2 (104.80)
        (105.20, 108.40, 105.10, 108.00), # 8: Push to EMA50
        (108.00, 109.20, 107.20, 107.50), # 9: Pullback to HL3 (107.20)
        (107.50, 110.20, 107.40, 109.80), # 10: Reach Major Resistance
    ]
    draw_candles(ax3, p3_ohlc)
    p3_closes = [x[3] for x in p3_ohlc]
    ax3.plot(range(len(p3_ohlc)), calculate_ema(p3_closes, 4), color=c_ema15, linewidth=1.5, label="EMA 15", zorder=2)
    ax3.plot(range(len(p3_ohlc)), calculate_ema(p3_closes, 8), color=c_ema50, linewidth=1.5, label="EMA 50", zorder=2)

    # Levels
    ax3.axhline(105.0, color=c_dark, linestyle="--", linewidth=1.0, alpha=0.7)
    ax3.text(len(p3_ohlc)+0.2, 105.0, "Neckline (Reclaimed)", color=c_dark, fontsize=8.0, va="center",
             bbox=dict(fc="#ffffff", ec="none", pad=1.5))
    ax3.axhline(100.0, color=c_neutral, linestyle="--", linewidth=0.8, alpha=0.7)

    # Initial Stop
    ax3.plot([1, 4], [99.00, 99.00], color=c_stop, linestyle="-.", linewidth=1.2)
    ax3.text(1.2, 98.2, "Initial Stop 99.00", color=c_stop, fontsize=8.0, fontweight="bold")

    # Higher Low 1 & Trail Stop 1
    ax3.annotate("Higher Low 1\n(HL1 102.70)", xy=(4, 102.70), xytext=(4, 99.8),
                 ha="center", fontsize=8.2, color=c_trail, fontweight="bold",
                 arrowprops=dict(arrowstyle="->", color=c_trail, lw=0.9))
    ax3.plot([4, 7], [102.30, 102.30], color=c_trail, linestyle="-", linewidth=1.2)
    ax3.text(5.5, 101.6, "Trail Stop 1 (102.30)", color=c_trail, fontsize=7.8, fontweight="bold", ha="center",
             bbox=dict(fc="#ffffff", ec="none", pad=1.0))

    # Higher Low 2 & Trail Stop 2
    ax3.annotate("Higher Low 2\n(HL2 104.80)", xy=(7, 107.00), xytext=(7, 109.8),
                 ha="center", fontsize=8.2, color=c_trail, fontweight="bold",
                 arrowprops=dict(arrowstyle="->", color=c_trail, lw=0.9))
    ax3.plot([7, 9], [104.40, 104.40], color=c_trail, linestyle="-", linewidth=1.2)
    ax3.text(8.0, 103.6, "Trail Stop 2 (104.40)", color=c_trail, fontsize=7.8, fontweight="bold", ha="center",
             bbox=dict(fc="#ffffff", ec="none", pad=1.0))

    # Higher Low 3 & Trail Stop 3
    ax3.annotate("Higher Low 3\n(HL3 107.20)", xy=(9, 109.20), xytext=(9, 112.0),
                 ha="center", fontsize=8.2, color=c_trail, fontweight="bold",
                 arrowprops=dict(arrowstyle="->", color=c_trail, lw=0.9))
    ax3.plot([9, len(p3_ohlc)], [106.80, 106.80], color=c_trail, linestyle="-", linewidth=1.2)
    ax3.text(10.1, 106.0, "Trail Stop 3 (106.80)", color=c_trail, fontsize=7.8, fontweight="bold", ha="center",
             bbox=dict(fc="#ffffff", ec="none", pad=1.0))

    ax3.set_ylim(97.0, 114.0)
    ax3.set_xlim(-0.8, len(p3_ohlc) + 4.5)
    ax3.set_xticks([0, 2, 4, 6, 8, 10])
    ax3.set_xticklabels(["27 Jan\n00:00", "27 Jan\n04:00", "27 Jan\n08:00", "27 Jan\n12:00", "27 Jan\n16:00", "27 Jan\n20:00"], fontsize=8.5)
    ax3.set_yticks([98.0, 100.0, 102.5, 105.0, 107.5, 110.0])
    ax3.set_yticklabels(["98.0", "100.0", "102.5", "105.0", "107.5", "110.0"], fontsize=8.5)
    ax3.set_xlabel("Protect risk as structural higher lows confirm; do not trail below every individual candle.", fontsize=9.5, color=c_dark, loc="left", labelpad=8)
    ax3.grid(True, linestyle=":", alpha=0.4)

    # ==========================================
    # PANEL 4: 04 EXIT (Target / Trail Hit)
    # ==========================================
    ax4 = fig.add_axes([0.551, 0.155, 0.401, 0.235])
    ax4.set_facecolor("#ffffff")
    ax4.set_title("04  EXIT", loc="left", fontsize=13, fontweight="bold", pad=12, color="#24292e")

    # Construct OHLC for Panel 4: Reaching Resistance -> Reversal -> Trailing stop hit
    p4_ohlc = [
        (105.20, 108.40, 105.10, 108.00),
        (108.00, 109.20, 107.20, 107.50), # HL3
        (107.50, 110.20, 107.40, 109.80), # Hits Resistance 110.0
        (109.80, 110.50, 108.60, 108.90), # Exhaustion at Resistance
        (108.90, 109.10, 106.60, 106.70), # Breaches Trail Stop 3 (106.80) -> EXIT!
        (106.70, 107.00, 105.00, 105.40), # Falls back toward Neckline
    ]
    draw_candles(ax4, p4_ohlc)
    p4_closes = [x[3] for x in p4_ohlc]
    ax4.plot(range(len(p4_ohlc)), calculate_ema(p4_closes, 3), color=c_ema15, linewidth=1.5, label="EMA 15", zorder=2)

    # Levels with backdrops
    ax4.axhline(110.0, color=c_neutral, linestyle="--", linewidth=0.9)
    ax4.text(len(p4_ohlc)+0.2, 110.0, "Resistance / ADR Target 110.0", color=c_neutral, fontsize=8.5, va="center",
             bbox=dict(fc="#ffffff", ec="none", pad=1.5))
    ax4.axhline(106.80, color=c_trail, linestyle="-", linewidth=1.2)
    ax4.text(len(p4_ohlc)+0.2, 106.80, "Trail Stop 106.80", color=c_trail, fontsize=8.5, va="center", fontweight="bold",
             bbox=dict(fc="#ffffff", ec="none", pad=1.5))

    # Annotations
    ax4.annotate("Target / Resistance reached\n(110.20)", xy=(2, 110.20), xytext=(1.5, 112.6),
                 ha="center", fontsize=9.0, color=c_dark, fontweight="bold",
                 arrowprops=dict(arrowstyle="->", color=c_dark, lw=0.9))
    ax4.plot(4, 106.80, marker="v", markersize=10, color=c_stop, zorder=6)
    ax4.annotate("EXIT 106.80\n(Structural Trailing Stop Hit)\nCaptured +5.15 pts (~2.2R)", xy=(4, 106.80), xytext=(4.1, 103.8),
                 ha="left", fontsize=9.2, color=c_stop, fontweight="bold",
                 bbox=dict(boxstyle="round,pad=0.35", fc="#fff1f3", ec=c_stop, lw=1.1),
                 arrowprops=dict(arrowstyle="->", color=c_stop, lw=1.1))

    ax4.set_ylim(102.8, 114.5)
    ax4.set_xlim(-0.8, len(p4_ohlc) + 4.2)
    ax4.set_xticks([0, 1, 2, 3, 4, 5])
    ax4.set_xticklabels(["27 Jan\n16:00", "27 Jan\n18:00", "27 Jan\n20:00", "27 Jan\n22:00", "28 Jan\n00:00", "28 Jan\n02:00"], fontsize=8.5)
    ax4.set_yticks([104.0, 106.0, 108.0, 110.0, 112.0, 114.0])
    ax4.set_yticklabels(["104.0", "106.0", "108.0", "110.0", "112.0", "114.0"], fontsize=8.5)
    ax4.set_xlabel("Exit when trailing stop is hit or major resistance is reached. Favourable asymmetric R achieved early.", fontsize=9.5, color=c_dark, loc="left", labelpad=8)
    ax4.grid(True, linestyle=":", alpha=0.4)

    # ==========================================
    # Global Legend and Footer
    # ==========================================
    # Add custom legend at bottom center
    legend_elements = [
        lines.Line2D([0], [0], color=c_up_stroke, marker="s", markerfacecolor=c_up_fill, markeredgecolor=c_up_stroke, markersize=8, label="Up: hollow red"),
        lines.Line2D([0], [0], color=c_down_stroke, marker="s", markerfacecolor=c_down_fill, markeredgecolor=c_down_stroke, markersize=8, label="Down: solid green"),
        lines.Line2D([0], [0], color=c_ema15, lw=2, label="EMA 15"),
        lines.Line2D([0], [0], color=c_ema50, lw=2, label="EMA 50"),
        lines.Line2D([0], [0], color=c_trail, lw=2, label="Structural stop"),
        lines.Line2D([0], [0], color=c_adr, lw=2, linestyle=":", label="ADR(20): contextual band"),
    ]
    fig.legend(handles=legend_elements, loc="lower center", bbox_to_anchor=(0.5, 0.040), ncol=6, frameon=False, fontsize=9.0)

    fig.text(0.052, 0.015, "Synthetic teaching data only. No live prices, backtest, win-rate claim or investment recommendation.", fontsize=8, color="#68737d")
    fig.text(0.950, 0.015, "UTC sessions | Independently scaled views | Stops active one bar after confirmation", fontsize=8, color="#68737d", ha="right")

    # Save SVG and PNG
    os.makedirs(os.path.dirname(output_svg_path), exist_ok=True)
    fig.savefig(output_svg_path, format="svg", facecolor=fig.get_facecolor(), edgecolor="none")
    fig.savefig(output_png_path, format="png", dpi=140, facecolor=fig.get_facecolor(), edgecolor="none")
    plt.close(fig)
    print(f"Generated: {output_svg_path} and {output_png_path}")

if __name__ == "__main__":
    svg_out = os.path.abspath("public/setup-library/failed_m_top.svg")
    png_out = os.path.abspath("public/setup-library/failed_m_top.png")
    create_setup_05_chart(svg_out, png_out)
