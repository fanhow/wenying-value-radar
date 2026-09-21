import type {StockInput} from './valuation.ts';

/** Metadata consistency only: a provider as-of date is not a verified effective date. */
export function validTaiwanShareMetadata(stock:Pick<StockInput,'financialMetrics'|'financialDataDate'>) {
  const metrics=stock.financialMetrics;
  if(!metrics)return true;
  if(metrics.shareBasis===undefined||metrics.shareBasis==='period-end-ordinary') {
    // Read compatibility for old captures; this does not certify period-end shares.
    return metrics.shareAsOfDate===undefined&&metrics.shareSourceField===undefined;
  }
  if(metrics.shareBasis!=='provider-as-of-ordinary')return false;
  const date=metrics.shareAsOfDate;
  return metrics.currency==='TWD'&&metrics.periodBasis==='ltm'
    &&typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)
    &&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date
    &&date===stock.financialDataDate&&metrics.shareSourceField==='quarterlyOrdinarySharesNumber'
    &&typeof metrics.sharesOutstanding==='number'&&Number.isFinite(metrics.sharesOutstanding)&&metrics.sharesOutstanding>0;
}
