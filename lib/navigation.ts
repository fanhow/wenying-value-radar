export function stockDetailHref(ticker: string) {
  return `/?ticker=${encodeURIComponent(ticker.trim().toUpperCase())}#valuation-detail`;
}
