export type SetupLibraryItem = {
  id: string;
  number: number;
  titleZh: string;
  titleEn: string;
  direction: "long" | "short";
  contextZh: string;
  contextEn: string;
  triggerZh: string;
  triggerEn: string;
  invalidationZh: string;
  invalidationEn: string;
};

export const SETUP_LIBRARY: readonly SetupLibraryItem[] = [
  {
    id: "false_break_reclaim", number: 1, titleZh: "假跌破與收復", titleEn: "False Break + Reclaim", direction: "long",
    contextZh: "主要支撐再次受測，價格短暫刺穿後迅速收回，形成流動性掃單與下影拒絕。",
    contextEn: "Major support is tested again, briefly swept, and quickly reclaimed with a lower-wick rejection.",
    triggerZh: "先收復支撐，再突破拒絕 K 線或鄰近小波段高點。",
    triggerEn: "Reclaim support first, then break the rejection candle or nearby minor swing high.",
    invalidationZh: "收盤明確回到已收復支撐下方。",
    invalidationEn: "A decisive close back below the reclaimed support.",
  },
  {
    id: "flat_pullback", number: 2, titleZh: "平台回調與趨勢延續", titleEn: "Flat Pullback + Trend Continuation", direction: "long",
    contextZh: "強勢上漲後於高檔窄幅橫盤，EMA15 高於 EMA50 且兩者上升，屬時間修正。",
    contextEn: "After a strong advance, price consolidates tightly while EMA15 stays above a rising EMA50.",
    triggerZh: "價格強勢突破整理平台上沿。",
    triggerEn: "A strong break above the consolidation ceiling.",
    invalidationZh: "收盤明確跌破平台下沿。",
    invalidationEn: "A decisive close below the consolidation floor.",
  },
  {
    id: "first_pullback", number: 3, titleZh: "突破後第一次回踩", titleEn: "Breakout to First Pullback", direction: "long",
    contextZh: "多次受測的壓力被動能突破，等待第一次回踩，確認原壓力轉為支撐。",
    contextEn: "Momentum clears repeatedly tested resistance; the first pullback checks whether resistance has become support.",
    triggerZh: "回踩出現拒絕後，再突破鄰近小波段高點；不追第一根突破 K 線。",
    triggerEn: "After pullback rejection, enter on a break of the nearby minor high; do not chase the first breakout candle.",
    invalidationZh: "價格深入舊區間，且收盤無法收回突破位。",
    invalidationEn: "Price closes deep inside the old range and fails to reclaim the breakout level.",
  },
  {
    id: "compression_expansion", number: 4, titleZh: "波動收縮轉擴張", titleEn: "Compression to Expansion", direction: "long",
    contextZh: "K 線範圍與實體逐步縮小，形成窄幅壓縮；進場前 ADR 約完成 20% 至 50%。",
    contextEn: "Candle ranges and bodies contract into a narrow base while roughly 20% to 50% of ADR is used.",
    triggerZh: "強勢突破最後壓縮區上沿。",
    triggerEn: "A forceful break above the final compression boundary.",
    invalidationZh: "突破後立刻失敗，收盤跌回壓縮區內。",
    invalidationEn: "The breakout immediately fails and closes back inside compression.",
  },
  {
    id: "failed_m_top", number: 5, titleZh: "M 頂失敗後多頭反轉", titleEn: "Failed M Top to Bullish Reversal", direction: "long",
    contextZh: "M 頂跌破頸線後無法延續並迅速收復，讓追空部位受困。",
    contextEn: "An M-top breakdown fails to continue and quickly reclaims its neckline, trapping short sellers.",
    triggerZh: "收復頸線後，突破鄰近小波段高點。",
    triggerEn: "After the neckline reclaim, break the nearby minor swing high.",
    invalidationZh: "再次乾淨跌破頸線，且收盤失守。",
    invalidationEn: "A clean second breakdown that closes below the neckline.",
  },
  {
    id: "failed_w_bottom", number: 6, titleZh: "W 底失敗後空頭反轉", titleEn: "Failed W Bottom to Bearish Reversal", direction: "short",
    contextZh: "W 底突破頸線後無法延續並跌回下方，讓追突破買方受困。",
    contextEn: "A W-bottom breakout fails and falls back below its neckline, trapping breakout buyers.",
    triggerZh: "突破失敗後，跌破鄰近小波段低點放空。",
    triggerEn: "After the failed breakout, sell a break of the nearby minor swing low.",
    invalidationZh: "收盤成功站回頸線上方。",
    invalidationEn: "A successful close back above the neckline.",
  },
  {
    id: "exhaustion_reversal", number: 7, titleZh: "耗竭跌勢後反轉", titleEn: "Exhaustion Move to Reversal", direction: "long",
    contextZh: "延伸跌勢抵達主要支撐；先等待賣壓失敗，不在確認前猜底。",
    contextEn: "An extended decline reaches major support; wait for selling pressure to fail instead of guessing the bottom.",
    triggerZh: "長下影、不再有效破低與 Higher Low 出現後，突破小波段高點。",
    triggerEn: "After a long lower wick, no effective new low, and a higher low, break the minor swing high.",
    invalidationZh: "下跌動能恢復並收盤跌回主要支撐下方。",
    invalidationEn: "Downside momentum resumes and closes below major support.",
  },
  {
    id: "lower_wick_adr", number: 8, titleZh: "支撐長下影與 ADR 空間", titleEn: "Long Lower Wick at Support to ADR", direction: "long",
    contextZh: "H1 示意行情抵達 D1 支撐，上方仍有前一完整日的 D1 EMA15。",
    contextEn: "The H1 example reaches D1 support with the prior completed day's D1 EMA15 still overhead.",
    triggerZh: "正確位置出現強烈拒絕後，確認小波段高點突破與動能，並檢查 ADR 空間。",
    triggerEn: "After strong rejection at the right location, confirm a minor-high break, momentum, and remaining ADR room.",
    invalidationZh: "收盤跌回主要支撐下方。",
    invalidationEn: "A close back below major support.",
  },
  {
    id: "morning_star_support", number: 9, titleZh: "主要支撐的早晨之星", titleEn: "Morning Star at Major Support", direction: "long",
    contextZh: "明確跌勢抵達主要支撐，依序形成長陰、創新低小星線、收復首根實體逾半的長陽。",
    contextEn: "A clear decline reaches major support, followed by a long bearish candle, a new-low star, and a bullish candle reclaiming over half the first body.",
    triggerZh: "突破第三根確認 K 線高點或後續小波段高點。",
    triggerEn: "Break the third confirmation candle's high or a later minor swing high.",
    invalidationZh: "跌破反轉型態最低點即失效。",
    invalidationEn: "The setup fails immediately below the reversal pattern low.",
  },
  {
    id: "mtop_break_retest", number: 10, titleZh: "M 頂破頸線回測後續跌", titleEn: "M-Top Neckline Break, Retest, Short", direction: "short",
    contextZh: "成熟 M 頂跌破頸線後小幅反彈回測，收復失敗，再以長陰擴張續跌。",
    contextEn: "A mature M-top breaks its neckline, makes a shallow failed-reclaim retest, then expands lower.",
    triggerZh: "頸線回測出現空方拒絕後，跌破回測小波段低點。",
    triggerEn: "After bearish rejection at the neckline retest, break the retest swing low.",
    invalidationZh: "成功收復頸線並收盤站回其上。",
    invalidationEn: "A successful reclaim and close above the neckline.",
  },
] as const;
