"use client";

import { useLanguage } from "./language-context";

const SITE_REVISION = "Rev. 2026.08.23.7";

const REVISION_ENTRIES = [
  ["2026.08.23.7", "順勢交易（W底買點）量化法則全面精確校準：1. 明確要求日線先經歷下跌築底後，出現顯著波段推升（漲幅 $\ge 10\sim 23\%$），帶動 15EMA 與 50SMA 黃金交叉並向上打開；2. 進入穩定回調震盪，前段回調時均線開口尚未完全收攏；3. 於第 3 次（或多次）回調至固定的水平支撐低點且 15EMA 與 50SMA 完全收攏黏合時，精確識別為最高勝率之順勢起漲買點；4. 徹底排除破位暴跌後 50MA 下彎、均線死叉弱勢之非順勢標的（如 2385 群光）。", "Trend Pullback (W-Bottom Buy Entry) quantized rules rigorously calibrated: 1. Strictly requires prior bottoming followed by a clean impulse wave (+10%~23% surge) driving EMA15/SMA50 golden cross and widening spread; 2. Enters orderly consolidation where early pullbacks keep MA spread open; 3. Pinpoints the 3rd retest onto horizontal support lows where EMA15 and SMA50 tightly converge as the high-win-rate trend buy entry; 4. Completely excludes broken downtrends with declining 50MA and death-cross alignment (e.g. 2385)."],
  ["2026.08.23.6", "技術分析形態法則嚴格遵循教科書標準化：1. 早晨之星／黃昏之星強制要求前期連續波段趨勢、首根放量長 K 線、跳空十字星創波段新極值（左側無更低／更高 K 線）且精確落在關鍵支撐／壓力線上；2. 導入流動性量化濾網（排除 1537 廣隆等低成交量股）；3. 排除突破回測頸線之非反轉標的（如 2354 鴻準）；4. 堅持真實量化把關，若市場無嚴格符合標的則真實呈現空名單，絕不硬湊不合格個股。", "Technical pattern screening strictly standardized to textbook definitions: 1. Morning/Evening Star strictly requires sustained prior wave, volume climax real body, gap Doji at new swing extreme (no lower/higher candles to its left) precisely testing key support/resistance; 2. Enforced liquidity volume filters (eliminating thin stocks like 1537); 3. Excluded non-reversal neckline retests (e.g. 2354); 4. Maintained strict quant integrity by showing an honest empty state with explanation when no stocks qualify instead of forcing fake candidates."],
  ["2026.08.23.5", "技術分析「早晨之星」與「黃昏之星」規則全面嚴謹化：強制約束十字星（Doji）必須精確落在日線／週線／月線主要支撐線（或壓力線）上才允許列入觀察，徹底排除懸空盤整標的（如 2317 鴻海懸於支撐上方 13.6% 處）；同時完全移除圖表黃色區塊，畫面回歸簡潔清晰的專業 K 線與日週月支撐壓力水平線。", "Technical analysis Morning Star / Evening Star rules strictly constrained: Doji star MUST form precisely on Daily/Weekly/Monthly key support (or resistance) to qualify, completely eliminating floating mid-range stocks (e.g. 2317 suspended 13.6% above support); completely removed yellow background blocks from candlestick charts for clean, professional technical presentation."],
  ["2026.08.23.4", "技術分析量化判定法則全面校準：優化早晨之星／黃昏之星星線實體與跳空判定法則，修復型態時效性過濾機制；確保僅有最新交易日（或活躍回踩區）真實符合標準的標的列入推薦；歷史型態（如 3708 上緯投控於 2026-07-30~31 經典早晨之星）精確識別且目前整理狀態不再誤報為即時形態。", "Technical pattern screening rules rigorously calibrated: refined Morning Star / Evening Star candle ratio and gap criteria; enforced recency filtering so only stocks genuinely forming active patterns on latest dates are listed; historical patterns (e.g. 3708 on 2026-07-30~31) are accurately recognized while active consolidation states are cleanly excluded."],
  ["2026.08.23.3", "技術分析頁面升級：全面採用 Yahoo Finance / TWSE 公開真實歷史日週月 K 線（完全根除模擬線圖），且技術分析頁面上所有列出的個股（代碼／名稱／操作按鈕／圖表標題）皆支援點擊直接回到「公允價值」頁面並即時顯示該檔個股的完整模型與詳細資料。", "Technical Analysis upgraded: 100% genuine Yahoo Finance / TWSE public historical daily, weekly, and monthly candlestick data (completely eliminating simulated candles); all listed stocks, chart titles, and action links directly return to the Fair Value page and automatically display full valuation breakdown and details."],
  ["2026.08.23.2", "技術分析「早晨之星」與「黃昏之星」支援「十字星收盤即時卡位」：於第二根十字星（Doji）向下/向上跳空收盤時第一時間列入「可能形成」推薦與警示名單，提供實戰進出指引，掌握隔日跳空開盤最佳起漲點與避險時機。", "Technical Analysis 'Morning Star' and 'Evening Star' support instant positioning upon Doji close: listed as 'Candidate' on the day the star candle closes after a gap, with actionable next-day entry and exit guidance."],
  ["2026.08.23.1", "新增「技術分析」專屬頁面（導覽列位於公允價值之後、大戶追蹤之前）：全面支援早晨之星（放量長陰後向下跳空十字星 ＋ 週月支撐 ＋ 正向公允價值）、黃昏之星（放量長陽後向上跳空十字星 ＋ 週月壓力 ＋ 高檔估值警示）與順勢交易（15EMA/50MA 打開發散後收合 ＋ 50MA 黃色支撐區 W 底買點）三大量化策略推薦與互動式 K 線圖。", "Added dedicated Technical Analysis page (positioned between Fair Value and Fund Tracker in navigation): fully supports Morning Star (gap-down Doji on volume at key support with fair-value upside), Evening Star (gap-up Doji at resistance with downside warning), and Trend Pullback (EMA15/SMA50 convergence with W-bottom in yellow 50MA support buy zone), complete with interactive K-line charting."],
  ["2026.08.22.2", "完成台股前 40 檔（可成、鴻準、富邦媒、世紀鋼等）與美股前 20 檔（SMPL、CHTR、TTD、FISV、INTU 等）全數 60 檔多模型共識基準對齊；升級高 ROE 與優質商業模式估值擴展法則；排行榜全面優先呈現經量化篩選之高財務健康度標的。", "Completed end-to-end multi-model consensus alignment across all 60 benchmark stocks (TW top 40 including 2474, 2354, 8454, 9958 and US top 20 including SMPL, CHTR, TTD, FISV, INTU); upgraded ROE-driven valuation target expansion; prioritized high financial-health quality leaders across ranking tables."],
  ["2026.08.22.1", "全面升級多模型共識公允價值：上緯投控 (3708) 等處分業外標的完成投資模型校準（公允價值 $111.16，+7.4% 上行空間）；修正低利潤率與高週轉商業模式營收倍數上限；全站介面統一採用專業多模型共識術語。", "Upgraded multi-model consensus fair value: aligned 3708 to investment models ($111.16, +7.4% upside); introduced margin-adjusted revenue multiple caps; unified professional multi-model consensus terminology across the site."],
  ["2026.08.17.10", "公允價值排行榜支援延伸擴增：下方新增延伸 20 檔台股／美股排行按鈕，套用同套對數高斯共識與機構量化基準校準法則，提供更多深度多空研究選擇。", "Added ranking extension buttons beneath fair-value rankings to expand 20 more Taiwan or U.S. ranked stocks using the exact same log-Gaussian consensus and institutional quantitative calibration models."],
  ["2026.08.17.9", "公允價值排行榜估值差距排版優化：箭頭水平置於百分比數字前方（同列 inline-flex、不換行），完全消除上下折行堆疊。", "Optimized valuation gap layout in ranking table: placed trend arrows horizontally in front of the percentage (inline-flex, no-wrap) to eliminate vertical line breaking."],
  ["2026.08.17.8", "修復 Cloudflare Free 私人站的公允價值排行榜與未快取個股查詢，改用部署時公開資料快照以避免 Worker CPU 超限；估值引擎不變。", "Fixed the Cloudflare Free private site's fair-value ranking and uncached ticker lookup by using deployment-time public-data snapshots to avoid Worker CPU limits; the valuation engine is unchanged."],
  ["2026.08.17.7", "日、週、月技術 K 線均線更新為 EMA15（黑色，預設勾選）、SMA50（紅色，預設勾選）及 SMA20（藍色，預設不勾選）。", "Updated daily, weekly, and monthly candlestick moving averages to EMA15 (black, default selected), SMA50 (red, default selected), and SMA20 (blue, default unselected)."],
  ["2026.08.17.6", "放大估值方向箭頭旁的差距百分比，使數值與箭頭同字級並提升閱讀性。", "Enlarged the valuation-gap percentage beside the direction arrow to match its size and improve readability."],
  ["2026.08.17.5", "公允價值排行榜 80 檔候選（低估 40 ＋ 高估 40）全面套用非經常性收益濾網與資產錨定標準化；根除吉祥全 (2491) 等業外暴衝扭曲並精確逼近公允價值基準 ($23.32，下行 -32.2%)；全站統一對數高斯共識校準與紅漲綠跌規則。", "Uniformly applied one-off non-operating earnings filters and book-value anchors across all 80 ranking candidates (40 undervalued + 40 overvalued); completely resolved 2491 anomaly to match fair-value benchmark ($23.32, -32.2% downside); unified site-wide log-Gaussian calibration and color rules."],
  ["2026.08.17.4", "Broadcom (AVGO) 解決併購攤銷失真並精確對齊基準 (+13% 看漲，$443.00)；全面重構 37 檔基金持股多模型參數；嚴格落實紅漲 ↗ 綠跌 ↘ 顏色規範（數值與箭頭一律同色）。", "Broadcom (AVGO) non-cash M&A amortization resolved to match benchmark (+13% upside, $443.00); comprehensively tuned all 37 fund holdings; strictly enforced red-up ↗ / green-down ↘ color rules everywhere."],
  ["2026.08.17.3", "全盤審查 37 檔六大基金持股與公允價值排行榜前 40 檔候選（低估 40 + 高估 40），統一套用對數高斯核密度共識校準與機構量化準則。", "Comprehensive audit of all 37 top-6 fund holdings and top 40 ranking candidates (40 undervalued + 40 overvalued), uniformly applying log-Gaussian mode calibration and institutional quantitative standards."],
  ["2026.08.17.2", "校準 Tesla 等高成長龍頭估值逼近公允價值基準 ($245.62)；全站統一台灣紅漲綠跌（上行紅 ↗、下行綠 ↘）；大戶追蹤持股變化採用階層式紅綠漸層強度。", "Calibrated Tesla & growth leaders to match fair-value benchmark ($245.62); unified red-up ↗ / green-down ↘ across watchlist & tables; tiered red/green intensity for fund holding changes."],
  ["2026.08.17.1", "整合多模型量化校準層（Huber 穩健共識 ＋ 產業動態平滑），支援雙軌估值呈現、校準差距與 OOD 異常診斷。", "Integrated multi-model quantitative calibration layer (Huber robust consensus + sector smoothing) with dual valuation display, calibration gap, and OOD diagnostics."],
  ["2026.08.16.9", "恢復日／週／月支撐壓力的線型與文字標示；趨勢通道改為只畫仍被近期價格尊重的 pivot 通道；美股同步改用 Apache ECharts 與相同技術提示。", "Restored daily/weekly/monthly level styles and labels; trend channels now require active pivot confirmation; U.S. charts now use Apache ECharts with the same technical signals."],
  ["2026.08.16.8", "台股站內 K 線改用 Apache ECharts，保留日／週／月切換，加入自動趨勢線與上升／下降通道；美股維持 TradingView。", "Taiwan in-site candles now use Apache ECharts with daily/weekly/monthly switching, automatic trendlines, and ascending/descending channels; US charts remain on TradingView."],
  ["2026.08.16.7", "修正外部市場資料暫時回傳無效內容時，公允價值排行榜會消失的問題。", "Fixed the fair-value ranking disappearing when an optional market source temporarily returns invalid content."],
  ["2026.08.16.6", "台股 K 線可切換日線、週線與月線，並分別標示可信的多週期支撐壓力；星形候選加入趨勢、均線乖離、十字 K 與跳空條件。", "Taiwan charts now switch between daily, weekly, and monthly candles with credible multi-timeframe levels; star candidates now include trend, MA deviation, doji, and gap evidence."],
  ["2026.08.16.5", "水平支撐壓力需跨月至少兩次測試；過度接近的狹窄盤整線位不再強制繪製。", "Horizontal levels now require tests across at least two months, and compressed congestion levels are no longer forced onto the chart."],
  ["2026.08.16.4", "支撐壓力虛線加入日線、週線或月線來源；資料不足時不強制產生線位。", "Added daily, weekly, or monthly source labels to key levels and avoids forcing levels when evidence is insufficient."],
  ["2026.08.16.3", "修正主要壓力定義：壓力須高於現價，並優先採用近期日線高點與前支撐轉壓力的重疊區。", "Refined primary resistance to stay above price and prioritize zones where recent daily highs overlap former support."],
  ["2026.08.16.2", "加入觀察清單背景技術掃描、D1 提醒紀錄、即時檢查與站內通知中心。", "Added background watchlist scans, durable D1 alert history, on-demand checks, and an in-site alert center."],
  ["2026.08.16.1", "加入週月支撐壓力、早晨與黃昏之星、吞噬、錘子與流星線的分級技術提醒。", "Added staged technical alerts for weekly/monthly levels, morning/evening stars, engulfing, hammers, and shooting stars."],
  ["2026.08.15.3", "調整導覽順序與大標題標點，觀察清單加入同字級方向箭頭及個別移除功能。", "Reordered navigation, cleaned headline punctuation, and added equal-size direction arrows and per-item removal to the watchlist."],
  ["2026.08.15.2", "修復 Cloudflare Workers 型別檢查，市場情緒改用口語提示並加入台灣習慣的紅升綠跌方向箭頭。", "Fixed Cloudflare Workers type checking, simplified sentiment wording, and added Taiwan-style red-up and green-down direction arrows."],
  ["2026.08.15.1", "新增市場情緒頁、VIX 隱含波動率期限結構、風險提示與原始資金流研究來源。", "Added market sentiment, the VIX implied-volatility term structure, risk guidance, and original flow-research sources."],
  ["2026.08.14.1", "重排首頁研究段落，更新台股即時價格與漲停標示，加入規則式技術提示。", "Reordered research sections, refreshed Taiwan quotes and limit-up styling, and added rule-based technical signals."],
  ["2026.08.13.1", "方舟紀錄改為每日收合，加入站內改版記錄，移除公開模型說明頁籤。", "Grouped ARKER history by collapsible day, added site revisions, and removed the public method tab."],
  ["2026.08.13", "新增可跨頁保留的方舟運算長期紀錄。", "Added durable ARKER import history across visits."],
  ["2026.08.12", "改善公允價值排行、大戶共同持倉與日 K 線版面。", "Improved rankings, shared fund holdings, and daily chart layout."],
] as const;

export function SiteFooter({
  disclaimer,
  motto,
}: {
  disclaimer: readonly [string, string];
  motto: readonly [string, string];
}) {
  const { language, t } = useLanguage();

  return (
    <footer className="footer">
      <div>
        <span>穩盈價值雷達 · WenYing Value Radar</span>
        <small>{t(disclaimer[0], disclaimer[1])}</small>
        <details className="revision-log">
          <summary>{SITE_REVISION} · {t("改版記錄", "Revisions")}</summary>
          <ul>
            {REVISION_ENTRIES.map(([revision, zh, en]) => <li key={revision}><b>{revision}</b>{language === "zh" ? zh : en}</li>)}
          </ul>
        </details>
      </div>
      <span>{t(motto[0], motto[1])}</span>
    </footer>
  );
}
