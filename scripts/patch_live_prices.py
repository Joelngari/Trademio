from pathlib import Path

path = Path('server.js')
text = path.read_text(encoding='utf-8')
old = """async function getLivePriceSnapshot() {
  const [frankfurter, crypto, aapl, gold] = await Promise.all([
    fetchJson('https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY'),
    fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd'),
    fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1m&range=1d'),
    fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1m&range=1d')
  ]);

  const prices = {};

  if (frankfurter?.rates) {
    prices.EURUSD = Number((1 / frankfurter.rates.EUR).toFixed(5));
    prices.GBPUSD = Number((1 / frankfurter.rates.GBP).toFixed(5));
    prices.USDJPY = Number(frankfurter.rates.JPY.toFixed(3));
  }

  if (crypto?.bitcoin?.usd) prices.BTCUSD = Number(crypto.bitcoin.usd.toFixed(2));
  if (crypto?.ethereum?.usd) prices.ETHUSD = Number(crypto.ethereum.usd.toFixed(2));

  const aaplPrice = aapl?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (typeof aaplPrice === 'number') prices.AAPL = Number(aaplPrice.toFixed(2));
  const goldPrice = gold?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (typeof goldPrice === 'number') prices.XAUUSD = Number(goldPrice.toFixed(2));

  return prices;
}
"""
new = """async function getLivePriceSnapshot() {
  const [frankfurter, crypto, aapl, msft, tsla, gold] = await Promise.all([
    fetchJson('https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,AUD,CAD,CHF,NZD,SGD'),
    fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,binancecoin,cardano,solana,ripple,dogecoin,polkadot&vs_currencies=usd'),
    fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1m&range=1d'),
    fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/MSFT?interval=1m&range=1d'),
    fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/TSLA?interval=1m&range=1d'),
    fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1m&range=1d')
  ]);

  const prices = {};

  if (frankfurter?.rates) {
    const usdTo = frankfurter.rates;
    const eurUsd = 1 / usdTo.EUR;
    const gbpUsd = 1 / usdTo.GBP;
    const audUsd = 1 / usdTo.AUD;
    const nzdUsd = 1 / usdTo.NZD;

    prices.EURUSD = Number(eurUsd.toFixed(5));
    prices.GBPUSD = Number(gbpUsd.toFixed(5));
    prices.USDJPY = Number(usdTo.JPY.toFixed(3));
    prices.AUDUSD = Number(audUsd.toFixed(5));
    prices.USDCAD = Number(usdTo.CAD.toFixed(5));
    prices.USDCHF = Number(usdTo.CHF.toFixed(5));
    prices.NZDUSD = Number(nzdUsd.toFixed(5));
    prices.USDSGD = Number(usdTo.SGD.toFixed(5));

    prices.EURGBP = Number((eurUsd / gbpUsd).toFixed(5));
    prices.EURJPY = Number((eurUsd * usdTo.JPY).toFixed(3));
    prices.EURCHF = Number((eurUsd * usdTo.CHF).toFixed(5));
    prices.GBPJPY = Number((gbpUsd * usdTo.JPY).toFixed(3));
    prices.CADJPY = Number((usdTo.CAD * usdTo.JPY).toFixed(3));
    prices.AUDJPY = Number((audUsd * usdTo.JPY).toFixed(3));
    prices.AUDNZD = Number((audUsd / nzdUsd).toFixed(5));
    prices.GBPCHF = Number((gbpUsd * usdTo.CHF).toFixed(5));
    prices.EURAUD = Number((eurUsd / audUsd).toFixed(5));
    prices.EURCAD = Number((eurUsd / usdTo.CAD).toFixed(5));
  }

  if (crypto?.bitcoin?.usd) prices.BTCUSD = Number(crypto.bitcoin.usd.toFixed(2));
  if (crypto?.ethereum?.usd) prices.ETHUSD = Number(crypto.ethereum.usd.toFixed(2));
  if (crypto?.binancecoin?.usd) prices.BNBUSD = Number(crypto.binancecoin.usd.toFixed(2));
  if (crypto?.cardano?.usd) prices.ADAUSD = Number(crypto.cardano.usd.toFixed(4));
  if (crypto?.solana?.usd) prices.SOLUSD = Number(crypto.solana.usd.toFixed(2));
  if (crypto?.ripple?.usd) prices.XRPUSD = Number(crypto.ripple.usd.toFixed(4));
  if (crypto?.dogecoin?.usd) prices.DOGEUSD = Number(crypto.dogecoin.usd.toFixed(5));
  if (crypto?.polkadot?.usd) prices.DOTUSD = Number(crypto.polkadot.usd.toFixed(2));

  const aaplPrice = aapl?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (typeof aaplPrice === 'number') prices.AAPL = Number(aaplPrice.toFixed(2));

  const msftPrice = msft?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (typeof msftPrice === 'number') prices.MSFT = Number(msftPrice.toFixed(2));

  const tslaPrice = tsla?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (typeof tslaPrice === 'number') prices.TSLA = Number(tslaPrice.toFixed(2));

  const goldPrice = gold?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (typeof goldPrice === 'number') prices.XAUUSD = Number(goldPrice.toFixed(2));

  return prices;
}
"""
if old not in text:
    raise SystemExit('Old block not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('patched')
