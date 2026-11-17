/**
 * Issuer corrections for BIN ranges where the public list only stores the parent bank.
 * Enpara is QNB Finansbank's digital brand and must be shown as Enpara on the card screen.
 */
export const BIN_ISSUER_OVERRIDES: Record<
  string,
  { issuer: string; network: string; type: string; category: string }
> = {
  '515483': { issuer: 'ENPARA BANK A.S.', network: 'MASTERCARD', type: 'DEBIT', category: 'COMMERCIAL' },
  '521448': { issuer: 'ENPARA BANK A.S.', network: 'MASTERCARD', type: 'CREDIT', category: 'BUSINESS' },
  '526911': { issuer: 'ENPARA BANK A.S.', network: 'MASTERCARD', type: 'CREDIT', category: 'PLATINUM' },
  '547800': { issuer: 'ENPARA BANK A.S.', network: 'MASTERCARD', type: 'CREDIT', category: 'PREFERRED BUSINESS' },
};
