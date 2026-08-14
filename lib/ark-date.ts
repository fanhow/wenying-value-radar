const ARK_TIME_ZONE = "Asia/Taipei";

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return Number(parts.find((item) => item.type === type)?.value ?? NaN);
}

/**
 * Returns the research date used by ARKER imports.
 *
 * Taiwan time is used deliberately so grouping does not change with the
 * browser's locale.  06:00 is the date boundary: an upload between midnight
 * and 05:59 belongs to the previous research date, including the overnight
 * 18:00–06:00 upload window.
 */
export function arkResearchDate(value: Date | string | number = new Date()): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ARK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const year = part(parts, "year");
  const month = part(parts, "month");
  const day = part(parts, "day");
  const hour = part(parts, "hour");
  if (![year, month, day, hour].every(Number.isFinite)) return null;

  const adjusted = new Date(Date.UTC(year, month - 1, day - (hour < 6 ? 1 : 0)));
  return `${adjusted.getUTCFullYear()}-${String(adjusted.getUTCMonth() + 1).padStart(2, "0")}-${String(adjusted.getUTCDate()).padStart(2, "0")}`;
}

export function arkResearchDateLabel(researchDate: string, language: "zh" | "en") {
  const date = new Date(`${researchDate}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return researchDate;
  return new Intl.DateTimeFormat(language === "zh" ? "zh-TW" : "en-US", {
    dateStyle: "full",
    timeZone: ARK_TIME_ZONE,
  }).format(date);
}
