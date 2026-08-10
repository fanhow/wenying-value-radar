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
export type SecTickerRow = { cik_str: number; ticker: string; title: string };

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
  const neighborhood = lines.slice(Math.max(0, lineIndex), lineIndex + 3).join(" ");
  const afterTicker = neighborhood.split(new RegExp(`\\b${escapeRegExp(ticker)}\\b`))[1] ?? neighborhood;
  return [...afterTicker.matchAll(/(?<![A-Z0-9])\d{1,6}(?:,\d{3})*(?:\.\d+)?/g)]
    .map((match) => numeric(match[0]))
    .filter((value) => value > 0 && value < 1_000_000);
}

function pickScreenshotValues(lines: string[], lineIndex: number, ticker: string, referencePrice: number) {
  const numbers = nearbyNumbers(lines, lineIndex, ticker);
  const plausible = referencePrice
    ? numbers.filter((value) => Math.abs(value - referencePrice) / referencePrice <= 0.45)
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
      const symbol = twSymbols.get(ticker)!;
      found.push({
        id: `${document.fileName}-${ticker}-${lineIndex}`,
        ticker,
        market: "TW",
        capturedName: symbol.name,
        ...pickScreenshotValues(lines, lineIndex, ticker, symbol.price),
        fileName: document.fileName,
      });
    });

    const possibleUs = [...new Set(line.match(/\b[A-Z][A-Z.-]{0,5}\b/g) ?? [])]
      .map((ticker) => ticker.replace(/\.$/, ""))
      .filter((ticker) => usSymbols.has(ticker));
    if (!possibleUs.length) return;

    const best = possibleUs
      .map((ticker) => ({ ticker, score: companyNameScore(line, usSymbols.get(ticker)!.title, ticker) }))
      .sort((a, b) => b.score - a.score)[0];
    if (best.score < 3) return;

    const company = usSymbols.get(best.ticker)!;
    const values = pickScreenshotValues(lines, lineIndex, best.ticker, 0);
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
