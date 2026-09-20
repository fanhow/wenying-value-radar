/** Shared accounting classification. A Taiwan listing board is not an industry. */
export type CompanyDescriptor = { name?: string; sector?: string; industry?: string };
export function companyDescriptor(input: CompanyDescriptor) {
  return [input.name, input.sector, input.industry].filter(Boolean).join(' ');
}
export function isFinancialCompany(input: CompanyDescriptor) {
  return /bank|finance|financial|insurance|reinsurance|mortgage|reit|銀行|金控|保險|證券|金融/i.test(companyDescriptor(input));
}
export function isReitCompany(input: CompanyDescriptor) {
  return /reit|real estate investment trust|property trust|不動產投資信託/i.test(companyDescriptor(input));
}
