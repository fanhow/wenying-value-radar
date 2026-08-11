import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SEC_HEADERS = {
  Accept: "application/json, application/xml, text/xml, */*",
  "User-Agent": "WenYing Value Radar fanhow@hotmail.com",
};

const managers = [
  { rank: 1, slug: "citadel", name: "Citadel Advisors", cik: "1423053", cumulativeGainBn: 90.4, gain2025Bn: 7.4 },
  { rank: 2, slug: "de-shaw", name: "D. E. Shaw", cik: "1009207", cumulativeGainBn: 79.9, gain2025Bn: 12.7 },
  { rank: 3, slug: "bridgewater", name: "Bridgewater Associates", cik: "1350694", cumulativeGainBn: 79.1, gain2025Bn: 15.6 },
  { rank: 4, slug: "millennium", name: "Millennium Management", cik: "1273087", cumulativeGainBn: 73.4, gain2025Bn: 7.9 },
  { rank: 5, slug: "tci", name: "TCI Fund Management", cik: "1647251", cumulativeGainBn: 68.4, gain2025Bn: 18.9 },
  { rank: 6, slug: "elliott", name: "Elliott Investment Management", cik: "1791786", cumulativeGainBn: 59.5, gain2025Bn: 5.7 },
];

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const TAIWAN_ISSUER = /TAIWAN|TAIWANESE|UNITED MICROELECTRONICS|ASE TECHNOLOGY|CHUNGHWA TELECOM|HIMAX|SILICON MOTION/i;
const TAIWAN_TICKERS = new Set(["TSM", "UMC", "ASX", "CHT", "HIMX", "SIMO"]);

async function secFetch(url, responseType = "json") {
  await delay(120);
  const response = await fetch(url, { headers: SEC_HEADERS });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return responseType === "text" ? response.text() : response.json();
}

function xmlText(block, tag) {
  const match = block.match(new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`, "i"));
  return match?.[1]
    ?.replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", "\"")
    .trim() ?? "";
}

function parseInformationTable(xml) {
  const positions = new Map();
  for (const block of xml.match(/<(?:[\w-]+:)?infoTable>[\s\S]*?<\/(?:[\w-]+:)?infoTable>/gi) ?? []) {
    if (xmlText(block, "putCall")) continue;
    if (xmlText(block, "sshPrnamtType").toUpperCase() !== "SH") continue;
    const cusip = xmlText(block, "cusip");
    const shares = Number(xmlText(block, "sshPrnamt"));
    const value = Number(xmlText(block, "value"));
    if (!cusip || !Number.isFinite(shares) || !Number.isFinite(value) || shares <= 0 || value <= 0) continue;
    const existing = positions.get(cusip);
    positions.set(cusip, {
      cusip,
      issuer: xmlText(block, "nameOfIssuer"),
      titleOfClass: xmlText(block, "titleOfClass"),
      shares: shares + (existing?.shares ?? 0),
      value: value + (existing?.value ?? 0),
    });
  }
  return positions;
}

async function filingInformationTable(cik, filing) {
  const accession = filing.accessionNumber.replaceAll("-", "");
  const base = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession}`;
  const index = await secFetch(`${base}/index.json`);
  const informationFile = index.directory?.item?.find((item) => /infotable.*\.xml$/i.test(item.name))?.name
    ?? index.directory?.item?.find((item) => /\.xml$/i.test(item.name) && !/^primary_doc\.xml$/i.test(item.name))?.name;
  if (!informationFile) throw new Error(`No information table found for ${filing.accessionNumber}`);
  const xml = await secFetch(`${base}/${informationFile}`, "text");
  return {
    positions: parseInformationTable(xml),
    sourceUrl: `${base}/${informationFile}`,
  };
}

async function managerFilings(manager) {
  const submissions = await secFetch(`https://data.sec.gov/submissions/CIK${manager.cik.padStart(10, "0")}.json`);
  const recent = submissions.filings?.recent ?? {};
  const filings = [];
  for (let index = 0; index < (recent.form?.length ?? 0); index += 1) {
    if (recent.form[index] !== "13F-HR") continue;
    filings.push({
      accessionNumber: recent.accessionNumber[index],
      filingDate: recent.filingDate[index],
      reportDate: recent.reportDate[index],
    });
    if (filings.length === 2) break;
  }
  if (filings.length < 2) throw new Error(`Two 13F-HR filings not found for ${manager.name}`);
  const current = await filingInformationTable(manager.cik, filings[0]);
  const previous = await filingInformationTable(manager.cik, filings[1]);
  return { filings, current, previous, legalName: submissions.name };
}

async function mapCusips(cusips, availableTickers) {
  const mappings = new Map();
  for (let start = 0; start < cusips.length; start += 10) {
    const batch = cusips.slice(start, start + 10);
    const response = await fetch("https://api.openfigi.com/v3/mapping", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(batch.map((cusip) => ({ idType: "ID_CUSIP", idValue: cusip }))),
    });
    if (!response.ok) throw new Error(`OpenFIGI returned ${response.status}`);
    const results = await response.json();
    results.forEach((result, index) => {
      const candidates = result.data ?? [];
      const match = candidates.find((candidate) =>
        candidate.exchCode === "US"
        && candidate.marketSector === "Equity"
        && availableTickers.has(candidate.ticker),
      ) ?? candidates.find((candidate) =>
        candidate.marketSector === "Equity"
        && availableTickers.has(candidate.ticker),
      );
      if (match?.ticker) mappings.set(batch[index], match.ticker);
    });
    await delay(120);
  }
  return mappings;
}

const usSnapshotPath = fileURLToPath(new URL("../lib/us-market-snapshot.json", import.meta.url));
const availableTickers = new Set(JSON.parse(await readFile(usSnapshotPath, "utf8")).map((row) => row.ticker));
const rawManagers = [];
for (const manager of managers) {
  const data = await managerFilings(manager);
  rawManagers.push({ manager, ...data });
  console.log(`Downloaded ${manager.name} ${data.filings[0].reportDate} and ${data.filings[1].reportDate}`);
}

const topCusips = [...new Set(rawManagers.flatMap(({ current }) => {
  const positions = [...current.positions.values()].sort((left, right) => right.value - left.value);
  return [
    ...positions.slice(0, 30).map((position) => position.cusip),
    ...positions.filter((position) => TAIWAN_ISSUER.test(position.issuer)).map((position) => position.cusip),
  ];
}))];
const tickerByCusip = await mapCusips(topCusips, availableTickers);

const funds = rawManagers.map(({ manager, legalName, filings, current, previous }) => {
  const totalValue = [...current.positions.values()].reduce((sum, position) => sum + position.value, 0);
  const mappedHoldings = [...current.positions.values()]
    .sort((left, right) => right.value - left.value)
    .flatMap((position) => {
      const ticker = tickerByCusip.get(position.cusip);
      if (!ticker) return [];
      const prior = previous.positions.get(position.cusip);
      const changePercent = prior?.shares
        ? ((position.shares - prior.shares) / prior.shares) * 100
        : null;
      const changeType = !prior
        ? "new"
        : changePercent > 1
          ? "increased"
          : changePercent < -1
            ? "reduced"
            : "unchanged";
      return [{
        ticker,
        issuer: position.issuer,
        titleOfClass: position.titleOfClass,
        cusip: position.cusip,
        shares: position.shares,
        previousShares: prior?.shares ?? 0,
        valueUsd: position.value,
        portfolioWeight: totalValue > 0 ? (position.value / totalValue) * 100 : 0,
        changePercent,
        changeType,
        significantChange: changeType === "new" || Math.abs(changePercent ?? 0) >= 10,
        taiwanExposure: TAIWAN_TICKERS.has(ticker) || TAIWAN_ISSUER.test(position.issuer),
      }];
    });
  const holdings = mappedHoldings.slice(0, 10);
  for (const position of mappedHoldings.filter((holding) => holding.taiwanExposure)) {
    if (holdings.some((holding) => holding.cusip === position.cusip)) continue;
    holdings.push(position);
    if (holdings.length >= 12) break;
  }

  return {
    ...manager,
    legalName,
    reportDate: filings[0].reportDate,
    filingDate: filings[0].filingDate,
    previousReportDate: filings[1].reportDate,
    sourceUrl: current.sourceUrl,
    reportedLongValueUsd: totalValue,
    holdings,
  };
});

const output = {
  generatedAt: new Date().toISOString(),
  rankingAsOf: "2025-12-31",
  rankingMethod: "LCH / Edmond de Rothschild estimated cumulative net gains since inception, after fees",
  rankingSourceUrl: "https://www.institutionalinvestor.com/article/chris-hohns-tci-tops-hedge-fund-gains-2025",
  holdingsSource: "SEC Form 13F-HR",
  funds,
};

const outputPath = fileURLToPath(new URL("../lib/fund-holdings-snapshot.json", import.meta.url));
await writeFile(outputPath, `${JSON.stringify(output)}\n`, "utf8");
console.log(`Saved ${funds.length} funds and ${funds.reduce((sum, fund) => sum + fund.holdings.length, 0)} holdings to ${outputPath}`);
