// Formats a KSh amount with commas — e.g. KSh 12,000.00
export function formatKSh(amount) {
  return `KSh ${Number(amount || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

// Formats in any currency the trader selects
export function formatCurrency(amount, currencyCode = 'KES', exchangeRates = { KES: 1 }) {
  // All internal balances are in KES
  // Convert from KES to target currency
  const rate = exchangeRates[currencyCode] || 1;
  const convertedAmount = amount * rate;

  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2
  }).format(convertedAmount);
}
