export type ThemeSource = {
  title: string;
  url: string;
};

export type StructuralTheme = {
  id: string;
  nameZh: string;
  nameEn: string;
  growthLow: number;
  growthBase: number;
  growthHigh: number;
  asOf: string;
  reviewAfter: string;
  evidenceZh: string;
  evidenceEn: string;
  sources: ThemeSource[];
};

type ThemeDefinition = StructuralTheme & {
  tickers: ReadonlySet<string>;
  descriptor: RegExp;
};

export const THEME_SNAPSHOT_AS_OF = "2026-08-11";
export const THEME_REVIEW_AFTER = "2026-09-11";

const set = (...tickers: string[]) => new Set(tickers.map((ticker) => ticker.toUpperCase()));

const definitions: ThemeDefinition[] = [
  {
    id: "ai-infrastructure",
    nameZh: "AI 基礎設施",
    nameEn: "AI Infrastructure",
    growthLow: 0.08,
    growthBase: 0.10,
    growthHigh: 0.12,
    asOf: THEME_SNAPSHOT_AS_OF,
    reviewAfter: THEME_REVIEW_AFTER,
    evidenceZh: "IEA 與美國能源部資料顯示，資料中心的電力與設備需求具多年擴張壓力；成長區間是本模型的保守推導。",
    evidenceEn: "IEA and U.S. DOE data indicate multi-year expansion pressure in data-center power and equipment demand. The growth range is a conservative model inference.",
    sources: [
      { title: "IEA — Energy and AI", url: "https://www.iea.org/reports/energy-and-ai" },
      { title: "U.S. DOE — Data Center Electricity Demand", url: "https://www.energy.gov/articles/doe-releases-new-report-evaluating-increase-electricity-demand-data-centers" },
    ],
    tickers: set("NVDA", "AMD", "AVGO", "TSM", "ASML", "AMAT", "LRCX", "KLAC", "MU", "ANET", "VRT", "DELL", "SMCI", "MRVL", "ORCL", "MSFT", "AMZN", "GOOGL", "2330", "2454", "2308", "2382", "3231", "6669", "3017", "2317", "2345", "2376", "2357", "3037"),
    descriptor: /\b(data[ -]?cent(?:er|re)|semiconductor equipment|advanced packaging|ai accelerator|gpu|asic|server systems?|network switches?|optical networking|liquid cooling|power distribution unit)\b/i,
  },
  {
    id: "space-economy",
    nameZh: "太空經濟",
    nameEn: "Space Economy",
    growthLow: 0.04,
    growthBase: 0.055,
    growthHigh: 0.07,
    asOf: THEME_SNAPSHOT_AS_OF,
    reviewAfter: THEME_REVIEW_AFTER,
    evidenceZh: "ESA 與 Space Foundation 的年度資料顯示，衛星通訊、地球觀測、導航及發射服務持續形成商業需求；成長區間是本模型的保守推導。",
    evidenceEn: "Annual ESA and Space Foundation data show continuing commercial demand across satellite communications, Earth observation, navigation, and launch services. The range is a conservative model inference.",
    sources: [
      { title: "ESA — 2026 Space Economy Report", url: "https://www.esa.int/About_Us/Business_with_ESA/ESA_releases_2026_Space_Economy_Report" },
      { title: "Space Foundation — The Space Report 2025 Q2", url: "https://www.spacefoundation.org/2025/07/22/the-space-report-2025-q2/" },
    ],
    tickers: set("RKLB", "ASTS", "LUNR", "RDW", "PL", "BKSY", "IRDM", "VSAT", "GSAT", "SPIR", "MDA"),
    descriptor: /\b(space systems?|satellites?|launch services?|earth observation|geospatial|orbital|spacecraft|ground station)\b/i,
  },
  {
    id: "healthy-aging",
    nameZh: "人口老化與醫療",
    nameEn: "Healthy Aging & Care",
    growthLow: 0.03,
    growthBase: 0.045,
    growthHigh: 0.06,
    asOf: THEME_SNAPSHOT_AS_OF,
    reviewAfter: THEME_REVIEW_AFTER,
    evidenceZh: "WHO 與聯合國的人口資料顯示，高齡人口及慢性照護需求長期增加；成長區間是本模型的保守推導，不套用到尚未商業化的研發公司。",
    evidenceEn: "WHO and UN population data show a durable rise in older populations and chronic-care demand. The range is a conservative model inference and is not applied to pre-commercial research companies.",
    sources: [
      { title: "WHO — Ageing and health", url: "https://www.who.int/news-room/fact-sheets/detail/ageing-and-health" },
      { title: "United Nations — World Population Prospects 2024", url: "https://www.un.org/sustainabledevelopment/blog/2024/07/press-release-wpp2024/" },
    ],
    tickers: set("UNH", "ELV", "HUM", "CVS", "CI", "ISRG", "MDT", "ABT", "BSX", "SYK", "EW", "DXCM", "TMO", "DHR", "IQV", "LLY", "NVO"),
    descriptor: /\b(long[ -]?term care|home health|geriatric|medical devices?|diagnostics?|rehabilitation|assistive technology|senior housing|managed care|surgical robotics?)\b/i,
  },
  {
    id: "grid-electrification",
    nameZh: "電網與電氣化",
    nameEn: "Grid & Electrification",
    growthLow: 0.06,
    growthBase: 0.08,
    growthHigh: 0.10,
    asOf: THEME_SNAPSHOT_AS_OF,
    reviewAfter: THEME_REVIEW_AFTER,
    evidenceZh: "IEA 指出用電成長、併網排隊及輸配電投資缺口仍大；成長區間聚焦設備與工程需求，屬本模型的保守推導。",
    evidenceEn: "IEA data show persistent electricity-demand growth, interconnection queues, and a grid-investment gap. The inferred range focuses on equipment and engineering demand.",
    sources: [
      { title: "IEA — Electricity 2026: Grids", url: "https://www.iea.org/reports/electricity-2026/grids" },
      { title: "IEA — Global electricity demand to 2030", url: "https://www.iea.org/news/global-electricity-demand-is-set-to-grow-strongly-to-2030-underscoring-need-for-investments-in-grids-and-flexibility" },
    ],
    tickers: set("GEV", "ETN", "PWR", "HUBB", "NVT", "ABB", "VRT", "CARR", "JCI", "TT", "EME", "FLNC", "2308", "1504", "1513", "1519", "1605"),
    descriptor: /\b(switchgear|transformers?|power grid|electrification|hvdc|substations?|grid automation|smart meters?|transmission equipment|distribution equipment|power management)\b/i,
  },
  {
    id: "cybersecurity",
    nameZh: "網路安全",
    nameEn: "Cybersecurity",
    growthLow: 0.04,
    growthBase: 0.055,
    growthHigh: 0.07,
    asOf: THEME_SNAPSHOT_AS_OF,
    reviewAfter: THEME_REVIEW_AFTER,
    evidenceZh: "ENISA、CISA 與 NIST 的事件、關鍵基礎設施及人才資料顯示安全需求具持續性；成長區間是本模型的保守推導。",
    evidenceEn: "ENISA, CISA, and NIST evidence on incidents, critical infrastructure, and workforce shortages supports persistent security demand. The range is a conservative model inference.",
    sources: [
      { title: "ENISA — Threat Landscape 2025", url: "https://www.enisa.europa.eu/publications/enisa-threat-landscape-2025" },
      { title: "CISA — Cybersecurity Strategic Plan", url: "https://www.cisa.gov/news-events/news/cisa-cybersecurity-strategic-plan-shifting-arc-national-risk-create-safer-future" },
      { title: "NIST — Cybersecurity workforce data", url: "https://www.nist.gov/news-events/news/2024/10/new-data-cybersecurity-workforce" },
    ],
    tickers: set("PANW", "CRWD", "FTNT", "ZS", "OKTA", "NET", "CYBR", "CHKP", "QLYS", "TENB", "RBRK"),
    descriptor: /\b(cybersecurity|cyber security|zero trust|endpoint security|cloud security|identity security|network security|threat intelligence|security operations)\b/i,
  },
  {
    id: "robotics-automation",
    nameZh: "機器人與自動化",
    nameEn: "Robotics & Automation",
    growthLow: 0.05,
    growthBase: 0.065,
    growthHigh: 0.08,
    asOf: THEME_SNAPSHOT_AS_OF,
    reviewAfter: THEME_REVIEW_AFTER,
    evidenceZh: "IFR 的實際安裝統計顯示工業與服務機器人長期擴張；成長區間是本模型的保守推導，並保留資本支出循環風險。",
    evidenceEn: "IFR installation statistics show long-run expansion in industrial and service robotics. The inferred range retains a conservative allowance for capital-spending cycles.",
    sources: [
      { title: "IFR — World Robotics 2025", url: "https://ifr.org/worldrobotics/report-2025" },
      { title: "IFR — Global robot demand doubles over 10 years", url: "https://ifr.org/ifr-press-releases/global-robot-demand-in-factories-doubles-over-10-years" },
    ],
    tickers: set("ISRG", "ROK", "TER", "ABB", "FANUY", "CGNX", "ZBRA", "PATH", "SYM", "2049", "1590"),
    descriptor: /\b(industrial robots?|collaborative robots?|cobots?|machine vision|motion control|warehouse automation|autonomous mobile robots?|surgical robots?|factory automation)\b/i,
  },
];

function publicTheme(theme: ThemeDefinition): StructuralTheme {
  return {
    id: theme.id,
    nameZh: theme.nameZh,
    nameEn: theme.nameEn,
    growthLow: theme.growthLow,
    growthBase: theme.growthBase,
    growthHigh: theme.growthHigh,
    asOf: theme.asOf,
    reviewAfter: theme.reviewAfter,
    evidenceZh: theme.evidenceZh,
    evidenceEn: theme.evidenceEn,
    sources: theme.sources,
  };
}

export function matchStructuralThemes(input: { ticker: string; name: string; sector: string }) {
  const ticker = input.ticker.trim().toUpperCase();
  const descriptor = `${input.name} ${input.sector}`;
  return definitions
    .filter((theme) => theme.tickers.has(ticker) || theme.descriptor.test(descriptor))
    .map(publicTheme);
}

export function structuralThemeSnapshot() {
  return definitions.map(publicTheme);
}
