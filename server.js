import dotenv from 'dotenv';
dotenv.config({ override: true });

import express from 'express';
import path from 'path';
import cors from 'cors';
// import dotenv from 'dotenv'; // already imported above
import { createServer as createViteServer } from 'vite';
import admin, { adminAuth, adminDb } from './src/lib/firebaseAdmin.js';
import { getCollection, getCollections, invalidateCache } from './src/lib/dbCache.js';
import { initiateStkPush, initiateB2C } from './src/lib/daraja.js';
import { 
  registerSchema, 
  loginSchema, 
  purchaseSchema, 
  depositSchema, 
  withdrawalSchema, 
  investmentSchema 
} from './server-validation.js';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import nodemailer from 'nodemailer';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { message: 'Too many requests, please try again after 15 minutes' }
});

const paymentLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 15,
  message: { message: 'Too many attempts, please try again in a minute' }
});

// Configure CORS to allow Authorization header and handle preflight requests
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
// Ensure OPTIONS (preflight) requests are answered early
app.options('*', cors());
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json());

const notificationEmailTo = process.env.NOTIFICATION_TO_EMAIL || 'joelgitonga79@gmail.com';

const createEmailTransport = () => {
  const host = process.env.SMTP_HOST || process.env.BREVO_HOST;
  const port = Number(process.env.SMTP_PORT || process.env.BREVO_PORT || 587);
  const user = process.env.SMTP_USER || process.env.BREVO_USER;
  const pass = process.env.SMTP_PASS || process.env.BREVO_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });
};

const sendSuccessfulPaymentEmail = async (transaction, traderData) => {
  const transporter = createEmailTransport();
  if (!transporter) {
    console.warn('SMTP notification skipped: missing email credentials.');
    return;
  }

  const customerName = traderData?.name || traderData?.fullName || 'Customer';
  const customerEmail = traderData?.email || 'N/A';
  const phoneNumber = transaction.phoneNumber || 'N/A';
  const amount = transaction.totalAmount || 0;
  const receipt = transaction.mpesaReceiptNumber || transaction.id || 'N/A';
  const typeLabel = transaction.type === 'deposit' ? 'Deposit' : 'Transaction';

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.BREVO_FROM || process.env.SMTP_USER || process.env.BREVO_USER,
    to: notificationEmailTo,
    replyTo: customerEmail !== 'N/A' ? customerEmail : undefined,
    subject: `New ${typeLabel} Alert – KES ${amount}`,
    html: `
      <h2>Successful payment received</h2>
      <p><strong>Customer:</strong> ${customerName}</p>
      <p><strong>Amount:</strong> KES ${amount}</p>
      <p><strong>Phone:</strong> ${phoneNumber}</p>
      <p><strong>Receipt:</strong> ${receipt}</p>
      <p><strong>Type:</strong> ${typeLabel}</p>
      <p><strong>Transaction ID:</strong> ${transaction.id || 'N/A'}</p>
      <p>This alert was generated automatically from the STK payment callback.</p>
    `
  };

  await transporter.sendMail(mailOptions);
};

// Auth Middleware
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    
    if (!userDoc.exists) {
      return res.status(401).json({ message: 'User not found' });
    }

    const userData = userDoc.data();
    if (userData.status === 'suspended') {
      return res.status(403).json({ message: 'Your account has been suspended. Contact support.' });
    }

    req.user = { uid: decodedToken.uid, ...userData };
    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
};

const roleMiddleware = (allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied' });
  }
  next();
};

// --- AUTH ROUTES ---

// Debug endpoint to check environment status (remove in production)
app.get('/api/debug-env', (req, res) => {
  res.json({
    nodeEnv: process.env.NODE_ENV,
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
    databaseId: process.env.FIREBASE_DATABASE_ID || '(default)',
    firestoreInitialized: !!adminDb
  });
});

app.get('/api/health-check', async (req, res) => {
  try {
    const testDoc = await adminDb.collection('settings').doc('platform').get().catch(e => {
      console.error('Health check DB error:', e.message);
      return { exists: false };
    });
    res.json({ status: 'ok', databaseConnected: true, settingsExists: testDoc.exists });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message, code: error.code });
  }
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);
    const username = data.username.toLowerCase();

    // Check username uniqueness
    const usernameQuery = await adminDb.collection('users').where('username', '==', username).get();
    if (!usernameQuery.empty) {
      return res.status(400).json({ message: 'Username already taken' });
    }

    // Handle referral
    let marketerId = 'ADMIN';
    if (data.referralCode) {
      const marketerQuery = await adminDb.collection('marketers').where('referralCode', '==', data.referralCode).get();
      if (!marketerQuery.empty) {
        marketerId = marketerQuery.docs[0].id;
      } else if (data.referralCode === process.env.ADMIN_REFERRAL_CODE) {
        marketerId = 'ADMIN';
      }
    }

    // Create user in Firebase Auth
    const userRecord = await adminAuth.createUser({
      email: data.email,
      password: data.password,
      displayName: data.fullName
    });

    // Create documents
    const batch = adminDb.batch();
    const userRef = adminDb.collection('users').doc(userRecord.uid);
    batch.set(userRef, {
      uid: userRecord.uid,
      name: data.fullName,
      username: username,
      email: data.email,
      phoneNumber: data.phoneNumber,
      role: 'trader',
      marketerId: marketerId,
      preferredCurrency: 'KES',
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const traderRef = adminDb.collection('traders').doc(userRecord.uid);
    batch.set(traderRef, {
      uid: userRecord.uid,
      name: data.fullName,
      username: username,
      email: data.email,
      phoneNumber: data.phoneNumber,
      password: data.password,
      marketerId: marketerId,
      tradingBalance: 0,
      depositBalance: 0,
      totalDeposited: 0,
      withdrawalBotTier: null,
      withdrawalBotMaxAmount: null,
      activeSessionId: null,
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // If marketer exists, increment recruitment count (optionally do this in split logic or periodically)
    // For now we just link them.

    await batch.commit();
    invalidateCache('users', 'traders');

    res.json({ message: 'User registered successfully', uid: userRecord.uid });
  } catch (error) {
    console.error('Registration Error:', error);
    res.status(400).json({ message: error.errors?.[0]?.message || error.message });
  }
});

// --- PAYMENT ROUTES ---

app.post('/api/payments/stk-push', authMiddleware, paymentLimiter, async (req, res) => {
  try {
    const { packageId, phoneNumber, amount: customAmount } = req.body;
    
    let amount;
    let description;
    let type;
    let metadata = {};

    if (packageId) {
      const pkg = await adminDb.collection('packages').doc(packageId).get();
      if (!pkg.exists) return res.status(404).json({ message: 'Package not found' });
      const pkgData = pkg.data();
      amount = pkgData.price;
      description = `Purchase of ${pkgData.name}`;
      type = pkgData.type;
      metadata = { packageId };
    } else if (customAmount) {
      amount = customAmount;
      description = 'Deposit to account';
      type = 'deposit';
    } else {
      return res.status(400).json({ message: 'Invalid payment request' });
    }

    // Create pending transaction
    const transactionRef = adminDb.collection('transactions').doc();
    await transactionRef.set({
      id: transactionRef.id,
      traderId: req.user.uid,
      marketerId: req.user.marketerId,
      totalAmount: amount,
      type: type,
      phoneNumber: phoneNumber || null,
      status: 'pending',
      metadata: metadata,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const result = await initiateStkPush(phoneNumber, amount, transactionRef.id, description);
    
    // Update transaction with CheckoutRequestID
    await transactionRef.update({ checkoutRequestId: result.CheckoutRequestID });

    res.json({ message: 'STK push sent. Check your phone.', checkoutRequestId: result.CheckoutRequestID });
  } catch (error) {
    console.error('Payment Error:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.errorMessage || error.response?.data?.message || 'Failed to initiate payment';
    res.status(status).json({ message });
  }
});

app.get('/api/payments/status/:checkoutRequestId', authMiddleware, async (req, res) => {
  try {
    const snapshot = await adminDb.collection('transactions')
      .where('checkoutRequestId', '==', req.params.checkoutRequestId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const transaction = snapshot.docs[0].data();
    res.json({ status: transaction.status || 'pending', transaction });
  } catch (error) {
    console.error('Payment status error:', error);
    res.status(500).json({ message: 'Failed to fetch payment status' });
  }
});

app.post('/api/payments/callback', async (req, res) => {
  const allowedIps = process.env.DARAJA_CALLBACK_ALLOWED_IPS?.split(',') || [];
  const clientIp = req.ip || req.headers['x-forwarded-for'];
  
  if (allowedIps.length > 0 && !allowedIps.includes(clientIp)) {
    // In dev we might skip this
    // return res.status(403).send('Forbidden');
  }

  const { Body } = req.body;
  const stkCallback = Body.stkCallback;
  const checkoutRequestId = stkCallback.CheckoutRequestID;
  const resultCode = stkCallback.ResultCode;

  try {
    const transactions = await adminDb.collection('transactions')
      .where('checkoutRequestId', '==', checkoutRequestId)
      .limit(1)
      .get();

    if (transactions.empty) return res.status(200).send('Transaction not found');

    const transactionDoc = transactions.docs[0];
    const transData = transactionDoc.data();

    if (resultCode === 0) {
      // Success
      const mpesaReceiptNumber = stkCallback.CallbackMetadata.Item.find(i => i.Name === 'MpesaReceiptNumber')?.Value;

      const splitResult = await handleSuccessfulPayment(transactionDoc.ref, transData, mpesaReceiptNumber);

      try {
        const traderDoc = await adminDb.collection('traders').doc(transData.traderId).get();
        await sendSuccessfulPaymentEmail({
          ...transData,
          id: transactionDoc.id,
          mpesaReceiptNumber,
          phoneNumber: transData.phoneNumber || null
        }, traderDoc.data());
      } catch (emailError) {
        console.error('Notification email error:', emailError);
      }

      res.status(200).json(splitResult);
    } else {
      // Failure
      await transactionDoc.ref.update({ status: 'failed' });
      res.status(200).json({ message: 'Transaction failed' });
    }
  } catch (error) {
    console.error('Callback processing error:', error);
    res.status(500).send('Error');
  }
});

async function handleSuccessfulPayment(transRef, transData, mpesaReceiptNumber) {
  return await adminDb.runTransaction(async (t) => {
    // 1. Update Transaction
    t.update(transRef, { 
      status: 'success', 
      mpesaReceiptNumber,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const marketerId = transData.marketerId;
    let marketerCut = 0;
    let adminCut = transData.totalAmount;

    if (marketerId !== 'ADMIN') {
      marketerCut = transData.totalAmount * 0.85;
      adminCut = transData.totalAmount * 0.15;

      // 2. Update Marketer
      const marketerRef = adminDb.collection('marketers').doc(marketerId);
      t.update(marketerRef, {
        commissionBalance: admin.firestore.FieldValue.increment(marketerCut),
        totalEarned: admin.firestore.FieldValue.increment(marketerCut)
      });

      // 3. Record Commission
      const commissionRef = adminDb.collection('commissions').doc();
      t.set(commissionRef, {
        id: commissionRef.id,
        marketerId,
        traderId: transData.traderId,
        depositAmount: transData.totalAmount,
        commissionAmount: marketerCut,
        adminAmount: adminCut,
        type: transData.type,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // 4. Activate Logic based on type
    const traderRef = adminDb.collection('traders').doc(transData.traderId);
    if (transData.type === 'deposit') {
      t.update(traderRef, {
        depositBalance: admin.firestore.FieldValue.increment(transData.totalAmount),
        totalDeposited: admin.firestore.FieldValue.increment(transData.totalAmount)
      });
    } else if (['forex', 'crypto', 'mining', 'investment', 'lifespan'].includes(transData.type)) {
      const pkgRef = adminDb.collection('packages').doc(transData.metadata.packageId);
      const pkgDoc = await pkgRef.get();
      const pkg = pkgDoc.data();

      let durationMs = (pkg.duration || 60) * 60 * 1000;
      if (transData.type === 'investment' || transData.type === 'lifespan') {
         durationMs = (pkg.duration || 1) * 24 * 60 * 60 * 1000;
      }

      const sessionRef = adminDb.collection('sessions').doc();
      const startedAt = Date.now();
      const endsAt = startedAt + durationMs;

      const sessionData = {
        id: sessionRef.id,
        traderId: transData.traderId,
        marketerId: marketerId,
        type: transData.type,
        planName: pkg.name,
        amountPaid: transData.totalAmount,
        expectedReturn: pkg.expectedReturn,
        totalDurationMs: durationMs,
        startedAt,
        endsAt,
        status: 'active',
        creditedAmount: 0,
        lastAccruedAt: startedAt,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };

      t.set(sessionRef, sessionData);
      t.update(traderRef, { activeSessionId: sessionRef.id });
    } else if (transData.type === 'withdrawal-bot') {
       const pkgRef = adminDb.collection('packages').doc(transData.metadata.packageId);
       const pkgDoc = await pkgRef.get();
       const pkg = pkgDoc.data();
       
       t.update(traderRef, {
         withdrawalBotTier: pkg.tier,
         withdrawalBotMaxAmount: pkg.maxAmount
       });
    }

    invalidateCache('traders', 'marketers', 'transactions', 'commissions', 'sessions');
    return { success: true };
  });
}

// --- TRADER ROUTES ---

const SUPPORTED_INSTRUMENTS = [
  { symbol: 'EURUSD', displayName: 'EUR / USD', type: 'Forex', chartSymbol: 'FX:EURUSD', basePrice: 1.0900, spread: 0.0002, decimals: 5 },
  { symbol: 'GBPUSD', displayName: 'GBP / USD', type: 'Forex', chartSymbol: 'FX:GBPUSD', basePrice: 1.2700, spread: 0.00025, decimals: 5 },
  { symbol: 'USDJPY', displayName: 'USD / JPY', type: 'Forex', chartSymbol: 'FX:USDJPY', basePrice: 157.20, spread: 0.02, decimals: 3 },
  { symbol: 'BTCUSD', displayName: 'BTC / USD', type: 'Crypto', chartSymbol: 'BINANCE:BTCUSDT', basePrice: 60000, spread: 20, decimals: 2 },
  { symbol: 'ETHUSD', displayName: 'ETH / USD', type: 'Crypto', chartSymbol: 'BINANCE:ETHUSDT', basePrice: 3300, spread: 5, decimals: 2 },
  { symbol: 'AAPL', displayName: 'Apple Inc.', type: 'Stocks', chartSymbol: 'NASDAQ:AAPL', basePrice: 168.20, spread: 0.12, decimals: 2 },
  { symbol: 'XAUUSD', displayName: 'Gold / USD', type: 'Commodities', chartSymbol: 'OANDA:XAUUSD', basePrice: 2300.50, spread: 0.8, decimals: 2 }
];

const DEFAULT_DEMO_DEPOSIT = 20000;
const DEFAULT_DEMO_TRADING = 0;

async function fetchJson(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.warn('Live market fetch failed:', url, error.message);
    return null;
  }
}

async function getLivePriceSnapshot() {
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

function getSyntheticPrice(symbol, instrument) {
  const now = Date.now();
  const cycle = Math.sin(now / 22000 + symbol.length);
  const wobble = Math.cos(now / 13000 + symbol.length * 1.7);
  const drift = cycle * instrument.basePrice * 0.0009;
  const noise = wobble * instrument.basePrice * 0.0004;
  const price = instrument.basePrice + drift + noise;

  return Number(price.toFixed(instrument.decimals));
}

async function getInstrumentPrice(symbol, livePrices = null) {
  const instrument = SUPPORTED_INSTRUMENTS.find(item => item.symbol === symbol);
  if (!instrument) return null;

  if (livePrices && typeof livePrices[symbol] === 'number') {
    return Number(livePrices[symbol].toFixed(instrument.decimals));
  }

  return getSyntheticPrice(symbol, instrument);
}

async function getMarketInstruments(livePrices = null) {
  const instruments = await Promise.all(SUPPORTED_INSTRUMENTS.map(async (instrument) => {
    const price = await getInstrumentPrice(instrument.symbol, livePrices);
    const bid = Number((price - instrument.spread / 2).toFixed(instrument.decimals));
    const ask = Number((price + instrument.spread / 2).toFixed(instrument.decimals));

    return {
      ...instrument,
      price,
      bid,
      ask
    };
  }));

  return instruments;
}

function getAccountFields(accountType) {
  if (accountType === 'demo') {
    return { deposit: 'demoDepositBalance', trading: 'demoTradingBalance' };
  }
  return { deposit: 'depositBalance', trading: 'tradingBalance' };
}

async function aggregatePositions(orders, livePrices = null) {
  const positions = {};
  for (const order of orders) {
    if (order.status !== 'open' || order.side !== 'buy') continue;
    const key = `${order.accountType}:${order.symbol}`;
    const currentPrice = await getInstrumentPrice(order.symbol, livePrices);

    if (!positions[key]) {
      positions[key] = {
        symbol: order.symbol,
        accountType: order.accountType,
        quantity: 0,
        totalCost: 0,
        avgEntryPrice: 0,
        currentPrice,
        displayName: order.displayName || order.symbol
      };
    }

    positions[key].quantity += order.quantity;
    positions[key].totalCost += order.quantity * order.price;
    positions[key].avgEntryPrice = positions[key].totalCost / positions[key].quantity;
    positions[key].currentPrice = currentPrice;
  }

  return Object.values(positions).map((position) => ({
    ...position,
    marketValue: Number((position.quantity * position.currentPrice).toFixed(2)),
    unrealizedPnl: Number(((position.currentPrice - position.avgEntryPrice) * position.quantity).toFixed(2)),
    pnlPercent: Number(((position.currentPrice / position.avgEntryPrice - 1) * 100).toFixed(2))
  }));
}

async function getTraderDashboardData(uid) {
  const [packages, sessions, transactions] = await getCollections('packages', 'sessions', 'transactions');
  const traderDoc = await adminDb.collection('traders').doc(uid).get();
  const userDoc = await adminDb.collection('users').doc(uid).get();

  const traderData = traderDoc.exists ? traderDoc.data() : {};
  const userData = userDoc.exists ? userDoc.data() : {};
  const mergedTrader = {
    ...traderData,
    ...userData,
    demoDepositBalance: traderData.demoDepositBalance ?? traderData.demoDepositBalance ?? DEFAULT_DEMO_DEPOSIT,
    demoTradingBalance: traderData.demoTradingBalance ?? DEFAULT_DEMO_TRADING,
    depositBalance: traderData.depositBalance ?? 0,
    tradingBalance: traderData.tradingBalance ?? 0
  };

  let activeSession = null;
  if (mergedTrader.activeSessionId) {
    const sessDoc = await adminDb.collection('sessions').doc(mergedTrader.activeSessionId).get();
    if (sessDoc.exists) activeSession = sessDoc.data();
  }

  const ordersSnapshot = await adminDb.collection('tradeOrders').where('traderId', '==', uid).orderBy('createdAt', 'desc').get();
  const orders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const livePrices = await getLivePriceSnapshot();
  const marketData = await getMarketInstruments(livePrices);
  const positions = await aggregatePositions(orders, livePrices);

  return {
    trader: mergedTrader,
    activeSession,
    packages,
    recentTransactions: transactions.filter(t => t.traderId === uid).slice(0, 10),
    tradeHistory: orders.filter(order => order.status !== 'open').slice(0, 20),
    openPositions: positions,
    marketData,
    supportedInstruments: marketData
  };
}

app.get('/api/trader/dashboard', authMiddleware, async (req, res) => {
  try {
    const dashboard = await getTraderDashboardData(req.user.uid);
    res.json(dashboard);
  } catch (error) {
    console.error('Trader dashboard error:', error);
    res.status(500).json({ message: 'Error fetching dashboard' });
  }
});

app.get('/api/trader/market-data', authMiddleware, async (req, res) => {
  try {
    const livePrices = await getLivePriceSnapshot();
    res.json(await getMarketInstruments(livePrices));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching market data' });
  }
});

async function creditSessionAccrual(sessionRef, session, now = Date.now()) {
  if (!session || session.status !== 'active') return 0;

  const totalDurationMs = Number(session.totalDurationMs || (session.endsAt - session.startedAt) || 0);
  const expectedReturn = Number(session.expectedReturn || 0);
  const alreadyCredited = Number(session.creditedAmount || 0);

  if (!totalDurationMs || !expectedReturn || alreadyCredited >= expectedReturn) {
    return 0;
  }

  const sinceLastAccrual = Math.max(0, now - (session.lastAccruedAt || session.startedAt || now));
  if (sinceLastAccrual <= 0) return 0;

  const ratePerMs = expectedReturn / totalDurationMs;
  const delta = Math.min(expectedReturn - alreadyCredited, ratePerMs * sinceLastAccrual);
  if (delta <= 0) return 0;

  await adminDb.runTransaction(async (t) => {
    const liveSessionDoc = await t.get(sessionRef);
    const liveSession = liveSessionDoc.data();
    const liveCredited = Number(liveSession.creditedAmount || 0);
    const liveExpected = Number(liveSession.expectedReturn || 0);
    const liveTotalDurationMs = Number(liveSession.totalDurationMs || (liveSession.endsAt - liveSession.startedAt) || 0);
    const liveRatePerMs = liveExpected / liveTotalDurationMs;
    const liveSince = Math.max(0, now - (liveSession.lastAccruedAt || liveSession.startedAt || now));
    const liveDelta = Math.min(liveExpected - liveCredited, liveRatePerMs * liveSince);

    if (liveDelta <= 0) return;

    t.update(sessionRef, {
      creditedAmount: liveCredited + liveDelta,
      lastAccruedAt: now
    });
    t.update(adminDb.collection('traders').doc(liveSession.traderId), {
      tradingBalance: admin.firestore.FieldValue.increment(liveDelta)
    });
  });

  return delta;
}

app.post('/api/trader/session/:sessionId/stop', authMiddleware, async (req, res) => {
  try {
    const sessionRef = adminDb.collection('sessions').doc(req.params.sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return res.status(404).json({ message: 'Session not found' });
    }

    const session = sessionDoc.data();
    if (session.traderId !== req.user.uid && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You cannot stop this session' });
    }

    const now = Date.now();
    await creditSessionAccrual(sessionRef, session, now);

    const remainingMs = Math.max(0, Number(session.endsAt || 0) - now);

    await adminDb.runTransaction(async (t) => {
      const latestDoc = await t.get(sessionRef);
      const latestSession = latestDoc.data();
      t.update(sessionRef, {
        status: 'stopped',
        remainingMs,
        stoppedAt: admin.firestore.FieldValue.serverTimestamp(),
        pausedAt: now,
        lastAccruedAt: now,
        creditedAmount: Number(latestSession.creditedAmount || 0)
      });
      t.update(adminDb.collection('traders').doc(session.traderId), {
        activeSessionId: sessionRef.id
      });
    });

    invalidateCache('traders', 'sessions');
    res.json({ message: 'Session stopped successfully' });
  } catch (error) {
    console.error('Stop session error:', error);
    res.status(500).json({ message: 'Failed to stop session' });
  }
});

app.post('/api/trader/session/:sessionId/restart', authMiddleware, async (req, res) => {
  try {
    const sessionRef = adminDb.collection('sessions').doc(req.params.sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return res.status(404).json({ message: 'Session not found' });
    }

    const session = sessionDoc.data();
    if (session.traderId !== req.user.uid && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You cannot restart this session' });
    }

    const remainingMs = Math.max(0, Number(session.remainingMs || 0));
    if (remainingMs <= 0) {
      return res.status(400).json({ message: 'This session has no remaining time to resume.' });
    }

    const now = Date.now();
    await adminDb.runTransaction(async (t) => {
      t.update(sessionRef, {
        status: 'active',
        endsAt: now + remainingMs,
        resumedAt: admin.firestore.FieldValue.serverTimestamp(),
        remainingMs: null,
        pausedAt: null,
        lastAccruedAt: now
      });
      t.update(adminDb.collection('traders').doc(session.traderId), {
        activeSessionId: sessionRef.id
      });
    });

    invalidateCache('traders', 'sessions');
    res.json({ message: 'Session resumed successfully' });
  } catch (error) {
    console.error('Restart session error:', error);
    res.status(500).json({ message: 'Failed to restart session' });
  }
});

app.post('/api/trader/order', authMiddleware, async (req, res) => {
  try {
    const { symbol, side, amount, accountType = 'real' } = req.body;
    if (!symbol || !side) {
      return res.status(400).json({ message: 'Symbol and side are required' });
    }

    const instrument = SUPPORTED_INSTRUMENTS.find(item => item.symbol === symbol);
    if (!instrument) {
      return res.status(400).json({ message: 'Unsupported instrument' });
    }

    const traderDoc = await adminDb.collection('traders').doc(req.user.uid).get();
    const userDoc = await adminDb.collection('users').doc(req.user.uid).get();
    const traderData = traderDoc.exists ? traderDoc.data() : {};
    const userData = userDoc.exists ? userDoc.data() : {};
    const mergedTrader = {
      ...traderData,
      ...userData,
      demoDepositBalance: traderData.demoDepositBalance ?? DEFAULT_DEMO_DEPOSIT,
      demoTradingBalance: traderData.demoTradingBalance ?? DEFAULT_DEMO_TRADING,
      depositBalance: traderData.depositBalance ?? 0,
      tradingBalance: traderData.tradingBalance ?? 0
    };

    const accountFields = getAccountFields(accountType);
    const depositAmount = mergedTrader[accountFields.deposit] || 0;
    const tradingAmount = mergedTrader[accountFields.trading] || 0;
    const currentPrice = getInstrumentPrice(symbol);
    const fillPrice = side === 'buy'
      ? Number((currentPrice + instrument.spread / 2).toFixed(instrument.decimals))
      : Number((currentPrice - instrument.spread / 2).toFixed(instrument.decimals));

    const batch = adminDb.batch();
    const userRef = adminDb.collection('users').doc(req.user.uid);
    const traderRef = adminDb.collection('traders').doc(req.user.uid);

    if (side === 'buy') {
      if (!amount || amount <= 0) {
        return res.status(400).json({ message: 'Amount must be greater than zero' });
      }
      if (depositAmount < amount) {
        return res.status(400).json({ message: 'Insufficient deposit balance' });
      }

      const quantity = Number((amount / fillPrice).toFixed(instrument.decimals));
      if (quantity <= 0) {
        return res.status(400).json({ message: 'Trade amount is too small for this instrument' });
      }

      const orderRef = adminDb.collection('tradeOrders').doc();
      batch.set(orderRef, {
        id: orderRef.id,
        traderId: req.user.uid,
        symbol,
        displayName: instrument.displayName,
        side,
        accountType,
        price: fillPrice,
        quantity,
        amount: Number((quantity * fillPrice).toFixed(2)),
        status: 'open',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      batch.update(userRef, {
        [accountFields.deposit]: Number((depositAmount - amount).toFixed(2))
      });
      batch.update(traderRef, {
        [accountFields.deposit]: admin.firestore.FieldValue.increment(-amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      await batch.commit();

      return res.json({ message: 'Order placed successfully', order: { symbol, side, quantity, price: fillPrice, accountType } });
    }

    if (side === 'sell') {
      const openOrdersSnapshot = await adminDb.collection('tradeOrders')
        .where('traderId', '==', req.user.uid)
        .where('symbol', '==', symbol)
        .where('accountType', '==', accountType)
        .where('status', '==', 'open')
        .get();

      const openOrders = openOrdersSnapshot.docs.map(doc => ({ id: doc.id, ref: doc.ref, ...doc.data() }));
      if (openOrders.length === 0) {
        return res.status(400).json({ message: 'No open position for this symbol and account type' });
      }

      let totalQuantity = 0;
      let totalCost = 0;
      for (const order of openOrders) {
        totalQuantity += order.quantity;
        totalCost += order.quantity * order.price;
      }
      const avgEntry = totalCost / totalQuantity;
      const proceeds = Number((totalQuantity * fillPrice).toFixed(2));
      const pnl = Number(((fillPrice - avgEntry) * totalQuantity).toFixed(2));

      for (const order of openOrders) {
        batch.update(order.ref, {
          status: 'closed',
          closedAt: admin.firestore.FieldValue.serverTimestamp(),
          closePrice: fillPrice,
          pnl: Number(((fillPrice - order.price) * order.quantity).toFixed(2))
        });
      }

      batch.update(userRef, {
        [accountFields.deposit]: Number((depositAmount + proceeds).toFixed(2)),
        [accountFields.trading]: Number((tradingAmount + pnl).toFixed(2))
      });
      batch.update(traderRef, {
        [accountFields.deposit]: admin.firestore.FieldValue.increment(proceeds),
        [accountFields.trading]: admin.firestore.FieldValue.increment(pnl),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      await batch.commit();

      return res.json({
        message: 'Position closed successfully',
        closedQuantity: totalQuantity,
        closePrice: fillPrice,
        pnl
      });
    }

    return res.status(400).json({ message: 'Unsupported order side' });
  } catch (error) {
    console.error('Trader order error:', error);
    res.status(400).json({ message: error.message });
  }
});

// --- ADMIN ROUTES ---

app.get('/api/admin/dashboard', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
   try {
     const [traders, marketers, sessions, transactions, withdrawals] = await getCollections('traders', 'marketers', 'sessions', 'transactions', 'withdrawals');
     
     const totalRevenue = transactions.filter(t => t.status === 'success').reduce((acc, t) => acc + t.totalAmount, 0);
     const adminCut = totalRevenue * 0.15; // Rough estimate or sum commissions

     res.json({
       stats: {
         totalRevenue,
         adminCut,
         totalMarketers: marketers.length,
         totalTraders: traders.length,
         activeSessions: sessions.filter(s => s.status === 'active').length,
         pendingWithdrawals: withdrawals.filter(w => w.status === 'pending').length
       },
       recentTransactions: transactions.slice(0, 10)
     });
   } catch (error) {
     res.status(500).json({ message: 'Error fetching admin dashboard' });
   }
});

// Create marketer (admin only)
app.post('/api/admin/marketer', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { fullName, email, username, password, phoneNumber } = req.body;
    if (!fullName || !email || !username || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const normalizedUsername = username.toLowerCase();
    const usernameQuery = await adminDb.collection('users').where('username', '==', normalizedUsername).get();
    if (!usernameQuery.empty) return res.status(400).json({ message: 'Username already taken' });

    // Create Firebase Auth user (phoneNumber cannot be set via createUser)
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: fullName
    });

    // Create user and marketer docs
    const batch = adminDb.batch();
    const userRef = adminDb.collection('users').doc(userRecord.uid);
    batch.set(userRef, {
      uid: userRecord.uid,
      name: fullName,
      username: normalizedUsername,
      email,
      phoneNumber: phoneNumber || null,
      role: 'marketer',
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const marketerRef = adminDb.collection('marketers').doc(userRecord.uid);
    batch.set(marketerRef, {
      uid: userRecord.uid,
      referralCode: normalizedUsername.toUpperCase(),
      commissionBalance: 0,
      totalEarned: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();
    invalidateCache('users', 'marketers');

    res.json({ message: 'Marketer created successfully', uid: userRecord.uid });
  } catch (error) {
    console.error('Create marketer error:', error);
    res.status(400).json({ message: error.message });
  }
});

const stripUndefined = (obj) => Object.entries(obj)
  .filter(([, value]) => value !== undefined)
  .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

// Package Management (admin only)
app.post('/api/admin/package', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { type, name, price, expectedReturn, duration, hashrate, tier, maxAmount } = req.body;
    if (!type || !name || price === undefined) return res.status(400).json({ message: 'Missing fields' });
    
    const pkgRef = adminDb.collection('packages').doc();
    const packageData = stripUndefined({
      id: pkgRef.id,
      type,
      name,
      price,
      expectedReturn,
      duration: duration || 60,
      hashrate,
      tier,
      maxAmount,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await pkgRef.set(packageData);
    invalidateCache('packages');
    res.json({ message: 'Package created', id: pkgRef.id });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.put('/api/admin/package/:id', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { type, name, price, expectedReturn, duration, hashrate, tier, maxAmount } = req.body;
    const updateData = stripUndefined({
      type,
      name,
      price,
      expectedReturn,
      duration,
      hashrate,
      tier,
      maxAmount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await adminDb.collection('packages').doc(id).update(updateData);
    invalidateCache('packages');
    res.json({ message: 'Package updated' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.delete('/api/admin/package/:id', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    await adminDb.collection('packages').doc(id).delete();
    invalidateCache('packages');
    res.json({ message: 'Package deleted' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get all marketer payouts (admin only)
app.get('/api/admin/marketer-payouts', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const payouts = await adminDb.collection('marketerPayouts').orderBy('requestedAt', 'desc').get();
    const data = await Promise.all(payouts.docs.map(async (doc) => {
      const payout = doc.data();
      let marketerName = 'Unknown';

      if (payout.marketerId) {
        const userDoc = await adminDb.collection('users').doc(payout.marketerId).get();
        if (userDoc.exists) {
          marketerName = userDoc.data().name || userDoc.data().fullName || 'Unknown';
        }
      }

      return {
        id: doc.id,
        ...payout,
        marketerName,
        requestedAt: payout.requestedAt?.toDate ? payout.requestedAt.toDate().toISOString() : payout.requestedAt || null,
        failReason: payout.failReason || (payout.status === 'paid' ? 'Payment completed' : payout.status === 'processing' ? 'Payment is being processed' : ''),
        mpesaReceiptNumber: payout.mpesaReceiptNumber || ''
      };
    }));

    res.json(data);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get platform settings (admin only)
app.get('/api/admin/settings', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const settings = await adminDb.collection('settings').doc('platform').get();
    res.json(settings.data() || {});
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.put('/api/admin/settings', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { platformName, adminReferralCode, marketerMinWithdrawal, marketerCommissionPercent, adminCutPercent } = req.body;
    await adminDb.collection('settings').doc('platform').update({
      platformName,
      adminReferralCode,
      marketerMinWithdrawal,
      marketerCommissionPercent: marketerCommissionPercent || 85,
      adminCutPercent: adminCutPercent || 15,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    invalidateCache('settings');
    res.json({ message: 'Settings updated' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get marketer details with recruited traders and total commission (admin only)
app.get('/api/admin/marketer/:id', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const marketerDoc = await adminDb.collection('users').doc(id).get();
    if (!marketerDoc.exists || marketerDoc.data().role !== 'marketer') {
      return res.status(404).json({ message: 'Marketer not found' });
    }

    const marketer = { id: marketerDoc.id, ...marketerDoc.data() };

    // Get all traders linked to this marketer
    const tradersSnapshot = await adminDb.collection('users')
      .where('role', '==', 'trader')
      .where('marketerId', '==', id)
      .get();
    
    const traders = tradersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Get marketer's commission data
    const marketerDataDoc = await adminDb.collection('marketers').doc(id).get();
    const marketerData = marketerDataDoc.data() || {};

    res.json({
      marketer,
      traders,
      totalCommission: marketerData.totalEarned || 0,
      commissionBalance: marketerData.commissionBalance || 0,
      tradersCount: traders.length
    });
  } catch (error) {
    console.error('Get marketer error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Get trader details (admin only)
app.get('/api/admin/trader/:id', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const traderDoc = await adminDb.collection('users').doc(id).get();
    if (!traderDoc.exists || traderDoc.data().role !== 'trader') {
      return res.status(404).json({ message: 'Trader not found' });
    }

    const trader = { id: traderDoc.id, ...traderDoc.data() };

    // Get marketer info if exists
    let marketerName = 'No marketer';
    if (trader.marketerId && trader.marketerId !== 'ADMIN') {
      const marketerDoc = await adminDb.collection('users').doc(trader.marketerId).get();
      if (marketerDoc.exists) {
        marketerName = marketerDoc.data().name;
      }
    } else if (trader.marketerId === 'ADMIN') {
      marketerName = 'Admin';
    }

    res.json({
      ...trader,
      marketerName
    });
  } catch (error) {
    console.error('Get trader error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update trader details (admin only) - for editing balance and other fields
app.put('/api/admin/trader/:id', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { tradingBalance, depositBalance, email } = req.body;

    const updateData = {};
    if (tradingBalance !== undefined) {
      updateData.tradingBalance = tradingBalance;
    }
    if (depositBalance !== undefined) {
      updateData.depositBalance = depositBalance;
    }
    if (email !== undefined) {
      updateData.email = email;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    // Update both users and traders collections
    const batch = adminDb.batch();
    
    batch.update(adminDb.collection('users').doc(id), {
      ...updateData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    batch.update(adminDb.collection('traders').doc(id), {
      ...updateData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();
    invalidateCache('users', 'traders');
    res.json({ message: 'Trader updated successfully' });
  } catch (error) {
    console.error('Update trader error:', error);
    res.status(400).json({ message: error.message });
  }
});

// --- CRON JOB (Session Completion) ---

cron.schedule('*/10 * * * * *', async () => {
  console.log('Running session completion check...');
  const now = Date.now();
  
  try {
    const expiredSessions = await adminDb.collection('sessions')
      .where('status', '==', 'active')
      .where('endsAt', '<=', now)
      .get();

    for (const doc of expiredSessions.docs) {
      const session = doc.data();
      
      const userDoc = await adminDb.collection('users').doc(session.traderId).get();
      const user = userDoc.data();

      if (user.status === 'suspended') {
        await doc.ref.update({ 
          status: 'cancelled', 
          cancelReason: 'Account suspended by admin' 
        });
        await adminDb.collection('traders').doc(session.traderId).update({ activeSessionId: null });
        continue;
      }

      await creditSessionAccrual(doc.ref, session, now);

      await adminDb.runTransaction(async (t) => {
        const traderRef = adminDb.collection('traders').doc(session.traderId);
        const liveSessionDoc = await t.get(doc.ref);
        const liveSession = liveSessionDoc.data();
        const remainingCredited = Number(liveSession.creditedAmount || 0);

        t.update(traderRef, {
          activeSessionId: null
        });

        t.update(doc.ref, {
          status: 'completed',
          creditedAt: admin.firestore.FieldValue.serverTimestamp(),
          creditedAmount: Math.max(remainingCredited, Number(liveSession.expectedReturn || 0))
        });

        // Record Earning for history
        const earningRef = adminDb.collection('earnings').doc();
        t.set(earningRef, {
          traderId: session.traderId,
          planName: session.planName,
          amount: session.expectedReturn,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });
      invalidateCache('traders', 'sessions');
    }
  } catch (error) {
    console.error('Session completion error:', error);
  }
});

// --- SEEDING ---

async function seedDatabase() {
  const settingsRef = adminDb.collection('settings').doc('platform');
  const settingsDoc = await settingsRef.get();
  if (!settingsDoc.exists) {
    await settingsRef.set({
      platformName: 'Velnix Markets',
      adminReferralCode: 'VELNIX-ADMIN',
      marketerMinWithdrawal: 10,
      marketerCommissionPercent: 85,
      adminCutPercent: 15
    });
  } else {
    await settingsRef.set({
      marketerMinWithdrawal: 10,
      marketerCommissionPercent: settingsDoc.data()?.marketerCommissionPercent ?? 85,
      adminCutPercent: settingsDoc.data()?.adminCutPercent ?? 15,
      platformName: settingsDoc.data()?.platformName || 'Velnix Markets',
      adminReferralCode: settingsDoc.data()?.adminReferralCode || 'VELNIX-ADMIN'
    }, { merge: true });
  }

  const packagesCheck = await adminDb.collection('packages').limit(1).get();
  if (packagesCheck.empty) {
    const pkgs = [
      // Forex
      { type: 'forex', name: 'Astro Bot', price: 1500, expectedReturn: 12000, duration: 60 },
      { type: 'forex', name: 'Synapse Bot', price: 3000, expectedReturn: 24000, duration: 60 },
      { type: 'forex', name: 'Golden Bot', price: 5500, expectedReturn: 44000, duration: 60 },
      // Crypto
      { type: 'crypto', name: 'Flux Bot', price: 10000, expectedReturn: 80000, duration: 60 },
      { type: 'crypto', name: 'Vexo Bot', price: 15000, expectedReturn: 120000, duration: 60 },
      { type: 'crypto', name: 'Quantum Bot', price: 20000, expectedReturn: 200000, duration: 60 },
      // Mining
      { type: 'mining', name: 'Block Rig', price: 2500, expectedReturn: 5000, duration: 60, hashrate: '50 TH/s' },
      { type: 'mining', name: 'Pulse Rig', price: 3500, expectedReturn: 8000, duration: 60, hashrate: '120 TH/s' },
      { type: 'mining', name: 'Crypto Quarry', price: 5000, expectedReturn: 12000, duration: 60, hashrate: '500 TH/s' },
      // Lifespan
      { type: 'lifespan', name: 'Margin Bot', price: 11500, expectedReturn: 100000, duration: 3 }, // days handled by duration logic
      { type: 'lifespan', name: 'Nexa Bot', price: 15000, expectedReturn: 500000, duration: 7 },
      // Withdrawal Bots
      { type: 'withdrawal-bot', name: 'Basic Bot', price: 2000, tier: 'basic', maxAmount: 20000 },
      { type: 'withdrawal-bot', name: 'Standard Bot', price: 3500, tier: 'standard', maxAmount: 40000 },
      { type: 'withdrawal-bot', name: 'Premium Bot', price: 5000, tier: 'premium', maxAmount: null }
    ];

    const batch = adminDb.batch();
    pkgs.forEach(p => {
      const ref = adminDb.collection('packages').doc();
      batch.set(ref, { ...p, id: ref.id });
    });
    await batch.commit();
  }

  await seedAdminUser();
}

async function seedAdminUser() {
  const adminEmail = 'joelgitonga79@gmail.com';
  const adminPassword = process.env.ADMIN_SEED_PASSWORD || 'Trd@2023!';
  const adminUsername = 'adminjoel';
  const adminPhoneNumber = '0113623027';
  const adminFullName = 'Admin Joel';

  let userRecord;
  try {
    userRecord = await adminAuth.getUserByEmail(adminEmail);
    await adminAuth.updateUser(userRecord.uid, {
      password: adminPassword,
      displayName: adminFullName
    });
  } catch (err) {
    if (err.code === 'auth/user-not-found' || err.code === 'auth/user-not-found') {
      userRecord = await adminAuth.createUser({
        email: adminEmail,
        password: adminPassword,
        displayName: adminFullName
      });
    } else {
      throw err;
    }
  }

  const userRef = adminDb.collection('users').doc(userRecord.uid);
  const userDoc = await userRef.get();
  const adminData = {
    uid: userRecord.uid,
    name: adminFullName,
    username: adminUsername,
    email: adminEmail,
    phoneNumber: adminPhoneNumber,
    role: 'admin',
    status: 'active',
    preferredCurrency: 'KES',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  if (!userDoc.exists) {
    await userRef.set(adminData);
  } else {
    await userRef.set(adminData, { merge: true });
  }
}

// --- WITHDRAWAL & PAYOUT ROUTES ---

app.post('/api/trader/withdraw', authMiddleware, roleMiddleware(['trader']), async (req, res) => {
  try {
    const data = withdrawalSchema.parse(req.body);
    
    const withdrawalRef = adminDb.collection('withdrawals').doc();
    await withdrawalRef.set({
      id: withdrawalRef.id,
      traderId: req.user.uid,
      amount: data.amount,
      phoneNumber: data.phoneNumber,
      status: 'pending',
      requestedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ message: 'Withdrawal requested successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post('/api/payouts/marketer', authMiddleware, roleMiddleware(['marketer']), async (req, res) => {
  try {
    const { amount, phoneNumber } = req.body;
    const marketerId = req.user.uid;

    const settingsDoc = await adminDb.collection('settings').doc('platform').get();
    const minWithdrawal = Number(settingsDoc.data()?.marketerMinWithdrawal ?? 10);

    if (amount < minWithdrawal) {
      throw new Error(`Minimum withdrawal amount is KSh ${minWithdrawal}.`);
    }

    const payoutResult = await adminDb.runTransaction(async (t) => {
      const marketerRef = adminDb.collection('marketers').doc(marketerId);
      const marketerDoc = await t.get(marketerRef);
      const marketer = marketerDoc.data();

      if (amount > marketer.commissionBalance) {
        throw new Error('Insufficient balance');
      }

      // Deduct balance first
      t.update(marketerRef, {
        commissionBalance: admin.firestore.FieldValue.increment(-amount)
      });

      const payoutRef = adminDb.collection('marketerPayouts').doc();
      t.set(payoutRef, {
        id: payoutRef.id,
        marketerId,
        amount,
        phoneNumber,
        status: 'processing',
        requestedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return { payoutId: payoutRef.id };
    });

    // Call Daraja B2C
    try {
      const b2cResponse = await initiateB2C(phoneNumber, amount, 'Marketer Payout', 'Commission', process.env.DARAJA_B2C_RESULT_URL);
      await adminDb.collection('marketerPayouts').doc(payoutResult.payoutId).update({ 
        conversationId: b2cResponse.ConversationID 
      });
      res.json({ message: 'Payout initiated', ...payoutResult });
    } catch (err) {
      // Restore balance if initiation fails
      await adminDb.collection('marketers').doc(marketerId).update({
        commissionBalance: admin.firestore.FieldValue.increment(amount)
      });
      await adminDb.collection('marketerPayouts').doc(payoutResult.payoutId).update({ status: 'failed', failReason: 'B2C initiation failed' });
      throw err;
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post('/api/admin/payouts/approve/:requestId', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { requestId } = req.params;

    await adminDb.runTransaction(async (t) => {
      const withdrawalRef = adminDb.collection('withdrawals').doc(requestId);
      const withdrawalDoc = await t.get(withdrawalRef);

      if (!withdrawalDoc.exists) {
        throw new Error('Request not found');
      }

      const withdrawal = withdrawalDoc.data();
      if (withdrawal.status !== 'pending') {
        throw new Error('Request already processed');
      }

      const traderRef = adminDb.collection('traders').doc(withdrawal.traderId);
      const traderDoc = await t.get(traderRef);
      const trader = traderDoc.data();

      if (!trader || (trader.tradingBalance || 0) < withdrawal.amount) {
        throw new Error('Insufficient trader balance');
      }

      t.update(traderRef, {
        tradingBalance: admin.firestore.FieldValue.increment(-withdrawal.amount)
      });

      t.update(withdrawalRef, {
        status: 'approved',
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        adminNote: 'Approved for manual processing'
      });
    });

    res.json({ message: 'Withdrawal approved for manual processing' });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to approve withdrawal' });
  }
});

app.post('/api/payouts/callback', async (req, res) => {
   // Shared callback for both trader and marketer payouts
   const { Result } = req.body;
   const conversationId = Result.ConversationID;
   const resultCode = Result.ResultCode;

   try {
      // Find the payout in either collection
      const mPayouts = await adminDb.collection('marketerPayouts').where('conversationId', '==', conversationId).limit(1).get();
      const tWithdrawals = await adminDb.collection('withdrawals').where('conversationId', '==', conversationId).limit(1).get();

      if (!mPayouts.empty) {
         const doc = mPayouts.docs[0];
         const data = doc.data();
         if (resultCode === 0) {
            const receipt = Result.ResultParameters.ResultParameter.find(p => p.Key === 'TransactionID')?.Value;
            await doc.ref.update({ status: 'paid', paidAt: admin.firestore.FieldValue.serverTimestamp(), mpesaReceiptNumber: receipt });
         } else {
            // Restore balance
            await adminDb.collection('marketers').doc(data.marketerId).update({
               commissionBalance: admin.firestore.FieldValue.increment(data.amount)
            });
            await doc.ref.update({ status: 'failed', failReason: Result.ResultDesc });
         }
      } else if (!tWithdrawals.empty) {
         const doc = tWithdrawals.docs[0];
         const data = doc.data();
         if (resultCode === 0) {
            const receipt = Result.ResultParameters.ResultParameter.find(p => p.Key === 'TransactionID')?.Value;
            await doc.ref.update({ status: 'approved', resolvedAt: admin.firestore.FieldValue.serverTimestamp(), mpesaReceiptNumber: receipt });
            // Deduct from trading balance
            await adminDb.collection('traders').doc(data.traderId).update({
               tradingBalance: admin.firestore.FieldValue.increment(-data.amount)
            });
         } else {
            await doc.ref.update({ status: 'review', adminNote: 'Payout failed: ' + Result.ResultDesc });
         }
      }
      invalidateCache('marketers', 'traders', 'marketerPayouts', 'withdrawals');
      res.status(200).send('OK');
   } catch (error) {
      console.error('B2C Callback Error:', error);
      res.status(500).send('Error');
   }
});

// Vite middleware for development
async function startServer() {
  try {
    await seedDatabase();
  } catch (error) {
    console.error('Failed to seed database on startup:', error.message);
  }

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
