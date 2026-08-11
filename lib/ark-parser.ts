export type ArkMarket = "TW" | "US";

export type ArkCandidate = {
  id: string;
  ticker: string;
  market: ArkMarket;
  capturedName?: string;
  capturedPrice?: number;
  capturedNav?: number;
  fileName: string;
};

export type ArkDocument = { fileName: string; text: string };
export type SecTickerRow = { cik_str: number; ticker: string; title: string; price?: number };

function numeric(value: unknown) {
  const parsed = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function words(value: string) {
  return new Set(value.toUpperCase().match(/[A-Z]{2,}/g) ?? []);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function companyNameScore(line: string, title: string, ticker: string) {
  const lineWords = words(line);
  const titleWords = [...words(title)].filter((word) => !["INC", "CORP", "LTD", "PLC", "THE"].includes(word));
  const overlap = titleWords.filter((word) => word !== ticker && lineWords.has(word)).length;
  return overlap * 4 + (new RegExp(`(?:^\\s*${escapeRegExp(ticker)}\\b|\\b${escapeRegExp(ticker)}\\s*$)`).test(line) ? 3 : 0);
}

function nearbyNumbers(lines: string[], lineIndex: number, ticker: string) {
  const tickerPattern = new RegExp(`\\b${escapeRegExp(ticker)}\\b`, "g");
  const currentLine = lines[lineIndex] ?? "";
  const afterTicker = currentLine.split(tickerPattern)[1] ?? "";
  const neighborhood = [afterTicker, ...lines.slice(Math.max(0, lineIndex - 2), lineIndex), ...lines.slice(lineIndex + 1, lineIndex + 3)].join(" ");
  return [...neighborhood.replace(tickerPattern, " ").matchAll(/(?<![A-Z0-9])\d{1,6}(?:,\d{3})*(?:\.\d+)?/g)]
    .map((match) => numeric(match[0]))
    .filter((value) => value > 0 && value < 1_000_000);
}

function pickScreenshotValues(lines: string[], lineIndex: number, ticker: string, referencePrice: number) {
  const numbers = nearbyNumbers(lines, lineIndex, ticker);
  const plausible = referencePrice
    ? numbers
      .flatMap((value) => [value, value / 10, value / 100, value / 1000])
      .filter((value, index, all) => value > 0 && all.findIndex((item) => Math.abs(item - value) < 0.0001) === index)
      .filter((value) => Math.abs(value - referencePrice) / referencePrice <= 0.35)
      .sort((left, right) => Math.abs(left - referencePrice) - Math.abs(right - referencePrice))
    : numbers;
  const capturedPrice = plausible[0];
  const capturedNav = capturedPrice
    ? plausible.slice(1).find((value) => Math.abs(value - capturedPrice) / capturedPrice <= 0.2)
    : undefined;
  return { capturedPrice, capturedNav };
}

export function parseArkDocument(
  document: ArkDocument,
  twSymbols: Map<string, { name: string; price: number }>,
  usSymbols: Map<string, SecTickerRow>,
) {
  const lines = document.text
    .toUpperCase()
    .split(/\r?\n/)
    .map((line) => line.replaceAll("|", " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const found: ArkCandidate[] = [];

  lines.forEach((line, lineIndex) => {
    const twMatches = [...new Set(line.match(/\b(?:\d{4}|00[A-Z0-9]{2,5})\b/g) ?? [])]
      .filter((ticker) => twSymbols.has(ticker));
    twMatches.forEach((ticker) => {
      if (!new RegExp(`^\\s*${escapeRegExp(ticker)}\\b`).test(line)) return;
      const symbol = twSymbols.get(ticker)!;
      const values = pickScreenshotValues(lines, lineIndex, ticker, symbol.price);
      if (!values.capturedPrice) return;
      if (/^00/.test(ticker) && !values.capturedNav) values.capturedNav = values.capturedPrice;
      found.push({
        id: `${document.fileName}-${ticker}-${lineIndex}`,
        ticker,
        market: "TW",
        capturedName: symbol.name,
        ...values,
        fileName: document.fileName,
      });
    });

    const possibleUs = [...new Set(line.match(/\b[A-Z][A-Z.-]{0,5}\b/g) ?? [])]
      .map((ticker) => ticker.replace(/\.$/, ""))
      .filter((ticker) => usSymbols.has(ticker));
    if (!possibleUs.length) return;

    const best = possibleUs
      .map((ticker) => ({
        ticker,
        score: Math.max(
          companyNameScore(line, usSymbols.get(ticker)!.title, ticker),
          companyNameScore(lines.slice(Math.max(0, lineIndex - 2), lineIndex + 1).join(" "), usSymbols.get(ticker)!.title, ticker),
        ),
        startsLine: new RegExp(`^\\s*${escapeRegExp(ticker)}\\b`).test(line),
      }))
      .sort((a, b) => b.score - a.score)[0];
    const company = usSymbols.get(best.ticker)!;
    const values = pickScreenshotValues(lines, lineIndex, best.ticker, company.price ?? 0);
    const hasQuoteSignal = /%|[▲▼△▽]/.test(line);
    if (best.score < 4 && (!best.startsLine || !hasQuoteSignal || !values.capturedPrice)) return;
    found.push({
      id: `${document.fileName}-${best.ticker}-${lineIndex}`,
      ticker: best.ticker,
      market: "US",
      capturedName: company.title,
      capturedPrice: values.capturedPrice,
      fileName: document.fileName,
    });
  });

  return found;
}

export function deduplicateArkCandidates(candidates: ArkCandidate[]) {
  const merged = new Map<string, ArkCandidate>();
  for (const candidate of candidates) {
    const current = merged.get(candidate.ticker);
    if (!current) {
      merged.set(candidate.ticker, candidate);
      continue;
    }
    merged.set(candidate.ticker, {
      ...current,
      ...candidate,
      capturedPrice: candidate.capturedPrice ?? current.capturedPrice,
      capturedNav: candidate.capturedNav ?? current.capturedNav,
    });
  }
  return [...merged.values()];
}
