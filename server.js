import dotenv from 'dotenv';
dotenv.config({ override: true });

import express from 'express';
import path from 'path';
import cors from 'cors';
// import dotenv from 'dotenv'; // already imported above
import { createServer as createViteServer } from 'vite';
import admin, { adminAuth, adminDb } from './src/lib/firebaseAdmin.js';

const npmLifecycleEvent = process.env.npm_lifecycle_event;
const isDevLifecycle = npmLifecycleEvent === 'dev';
if (isDevLifecycle) {
  process.env.NODE_ENV = 'development';
}

console.log('Server startup:', {
  npmLifecycleEvent,
  NODE_ENV: process.env.NODE_ENV,
  isDevLifecycle,
});
import { getCollection, getCollections, invalidateCache } from './src/lib/dbCache.js';
import { initiateStkPush, initiateB2C } from './src/lib/daraja.js';
import { verifyCallbackSignature, validateTimestamp, isCallbackProcessed, markCallbackProcessed } from './src/lib/paymentSecurity.js';
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
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

console.log('Server config:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT,
  DARAJA_ENV: process.env.DARAJA_ENV,
  DARAJA_CALLBACK_URL: process.env.DARAJA_CALLBACK_URL,
  DARAJA_B2C_RESULT_URL: process.env.DARAJA_B2C_RESULT_URL,
  DARAJA_CALLBACK_ALLOWED_IPS: process.env.DARAJA_CALLBACK_ALLOWED_IPS || '(none)',
  hasCallbackSecret: Boolean(process.env.DARAJA_CALLBACK_SECRET)
});

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
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));

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
    const referralCode = data.referralCode && data.referralCode !== 'undefined' ? data.referralCode : null;
    if (referralCode) {
      const marketerQuery = await adminDb.collection('marketers').where('referralCode', '==', referralCode).get();
      if (!marketerQuery.empty) {
        marketerId = marketerQuery.docs[0].id;
      } else if (referralCode === process.env.ADMIN_REFERRAL_CODE) {
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

// --- HELPER: Activate bot purchase (handles all bot types) ---
// This is called when a botPurchase becomes fully paid, either via STK callback or admin action.
async function activateBotPurchase(traderRef, pkg, botPurchaseRef, marketerId, t, transactionId) {
  // Handle type-specific activation
  if (pkg.type === 'withdrawal-bot') {
    t.update(traderRef, {
      withdrawalBotPackageId: pkg.id,
      withdrawalBotPackageName: pkg.name,
      withdrawalBotFamily: pkg.botFamily || null,
      withdrawalBotCategory: pkg.category || null,
      withdrawalBotMaxAmount: pkg.maxAmount || null,
      withdrawalBotTier: 'active',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } else if (pkg.type === 'verification-bot') {
    t.update(traderRef, {
      verificationBotPackageId: pkg.id,
      verificationBotPackageName: pkg.name,
      verificationBotFamily: pkg.botFamily || null,
      verificationBotCategory: pkg.category || null,
      verificationBotTier: 'active',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } else if (['forex', 'crypto', 'mining', 'investment', 'lifespan'].includes(pkg.type)) {
    // Create session for trading bots
    let durationMs = (pkg.duration || 60) * 60 * 1000;
    if (pkg.type === 'investment' || pkg.type === 'lifespan') {
      durationMs = (pkg.duration || 1) * 24 * 60 * 60 * 1000;
    }

    const sessionRef = adminDb.collection('sessions').doc();
    const startedAt = Date.now();
    const endsAt = startedAt + durationMs;

    // Derive a family name for this package so we can persist it on the trader
    // Prefer explicit pkg.botFamily if present, otherwise derive from pkg.name
    const rawFamily = String(pkg.botFamily || '').trim();
    let derivedFamily = rawFamily || String(pkg.name || '').trim().toUpperCase().replace(/\s+(FOREX|CRYPTO|RIG|BOT|INVESTMENT|LIFESPAN)$/i, '').trim();
    if (derivedFamily === '') derivedFamily = null;

    const sessionData = {
      id: sessionRef.id,
      traderId: traderRef.id,
      marketerId: marketerId,
      type: pkg.type,
      planName: pkg.name,
      amountPaid: pkg.price, // Use package price (full amount)
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
    // Persist active session and last-trading metadata on the trader
    t.update(traderRef, { 
      activeSessionId: sessionRef.id,
      lastTradingPackageName: pkg.name || null,
      lastTradingFamily: derivedFamily,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  // Mark botPurchase as paid and set activatedAt
  t.update(botPurchaseRef, {
    status: 'paid',
    activatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  invalidateCache('traders', 'sessions', 'botPurchases');
}

// --- PAYMENT ROUTES ---

app.post('/api/payments/stk-push', authMiddleware, paymentLimiter, async (req, res) => {
  try {
    const { packageId, phoneNumber, amount: requestedAmount, botPurchaseId } = req.body;
    
    let amount;
    let description;
    let type;
    let metadata = {};
    let botPurchaseRef = null;

    if (packageId) {
      const pkg = await adminDb.collection('packages').doc(packageId).get();
      if (!pkg.exists) return res.status(404).json({ message: 'Package not found' });
      const pkgData = pkg.data();
      
      // Check if partial payment: requestedAmount < package price
      if (requestedAmount && requestedAmount > 0 && requestedAmount < pkgData.price) {
        const normalizedType = String(pkgData.type || '').toLowerCase();
        const normalizedName = String(pkgData.name || '').toLowerCase();
        const botTypes = ['withdrawal-bot', 'verification-bot', 'forex', 'crypto', 'mining', 'investment', 'lifespan'];
        const isPartialBot = botTypes.includes(normalizedType)
          || normalizedType.includes('verification')
          || normalizedType.includes('withdrawal')
          || normalizedName.includes('verification bot')
          || normalizedName.includes('withdrawal bot');

        // Partial payment for a bot
        if (isPartialBot) {
          amount = requestedAmount;
          
          // If botPurchaseId provided, validate and link to existing botPurchase (resuming payment)
          if (botPurchaseId) {
            const candidateRef = adminDb.collection('botPurchases').doc(botPurchaseId);
            const candidateDoc = await candidateRef.get();
            if (!candidateDoc.exists) {
              return res.status(400).json({ message: 'Invalid botPurchaseId' });
            }
            const candidateData = candidateDoc.data();
            if (candidateData.status !== 'pending') {
              return res.status(400).json({ message: 'Bot purchase is not pending' });
            }
            botPurchaseRef = candidateRef;
          } else {
            // Try to find an existing pending botPurchase for this trader+package to avoid duplicates
            const existingSnap = await adminDb.collection('botPurchases')
              .where('traderId', '==', req.user.uid)
              .where('packageId', '==', packageId)
              .where('status', '==', 'pending')
              .limit(1)
              .get();

            if (!existingSnap.empty) {
              botPurchaseRef = adminDb.collection('botPurchases').doc(existingSnap.docs[0].id);
            } else {
              // Create new botPurchase for this partial payment
              botPurchaseRef = adminDb.collection('botPurchases').doc();
              await botPurchaseRef.set({
                id: botPurchaseRef.id,
                traderId: req.user.uid,
                packageId: packageId,
                type: pkgData.type,
                requiredAmount: pkgData.price,
                amountPaid: 0,
                contributors: [],
                status: 'pending',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
            }
          }
          
          metadata = { packageId, botPurchaseId: botPurchaseRef.id };
          description = `Partial payment for ${pkgData.name} (${amount}/${pkgData.price})`;
          type = pkgData.type;
        } else {
          return res.status(400).json({ message: 'Partial payments only supported for bots' });
        }
      } else {
        // Full payment or default
        amount = requestedAmount || pkgData.price;
        description = `Purchase of ${pkgData.name}`;
        type = pkgData.type;
        metadata = { packageId };
      }
    } else {
      // Deposit or custom amount
      amount = requestedAmount;
      description = 'Deposit to account';
      type = 'deposit';
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid payment amount' });
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

    console.log('📤 STK push request starting', { phoneNumber, amount, transactionRefId: transactionRef.id, description, botPurchaseId: metadata.botPurchaseId });
    const result = await initiateStkPush(phoneNumber, amount, transactionRef.id, description);
    console.log('📤 STK push initiation completed', { checkoutRequestId: result.CheckoutRequestID, response: result });
    
    // Update transaction with CheckoutRequestID
    await transactionRef.update({ checkoutRequestId: result.CheckoutRequestID });

    res.json({
      message: 'STK push sent. Check your phone.',
      checkoutRequestId: result.CheckoutRequestID,
      botPurchaseId: metadata.botPurchaseId
    });
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
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',').map(ip => ip.trim()).filter(Boolean);
  const clientIp = forwardedFor[0] || req.socket.remoteAddress || req.ip || 'unknown';

  console.log('✅ STK callback endpoint hit', {
    method: req.method,
    path: req.path,
    clientIp,
    xForwardedFor: forwardedFor,
    socketRemoteAddress: req.socket.remoteAddress,
    signature: Boolean(req.headers['x-daraja-signature']),
    bodyKeys: Object.keys(req.body || {})
  });

  // IP whitelist check (if configured)
  const allowedIps = (process.env.DARAJA_CALLBACK_ALLOWED_IPS || '')
    .split(',')
    .map(ip => ip.trim())
    .filter(Boolean);
  
  if (allowedIps.length > 0 && !allowedIps.includes(clientIp)) {
    console.warn(`❌ Callback rejected: unauthorized IP ${clientIp}`, { allowedIps });
    return res.status(403).json({ message: 'Forbidden' });
  }

  // Verify HMAC-SHA256 signature only if a callback secret is configured
  const signature = req.headers['x-daraja-signature'] || '';
  const callbackSecret = process.env.DARAJA_CALLBACK_SECRET;

  if (callbackSecret) {
    const rawBody = req.rawBody || JSON.stringify(req.body);
    if (!verifyCallbackSignature(rawBody, signature, callbackSecret)) {
      console.warn('❌ Callback rejected: invalid signature', { hasSignature: !!signature, hasSecret: !!callbackSecret });
      return res.status(401).json({ message: 'Invalid signature' });
    }
  } else if (signature) {
    console.warn('⚠️  Callback signature header present but DARAJA_CALLBACK_SECRET is not configured; skipping signature validation.');
  }

  if (!req.body) {
    console.warn('❌ Invalid STK callback: empty body');
    return res.status(400).json({ message: 'Invalid callback payload' });
  }

  const Body = req.body.Body;
  if (!Body) {
    console.warn('❌ Invalid STK callback: missing Body wrapper', { bodyKeys: Object.keys(req.body) });
    return res.status(400).json({ message: 'Invalid callback payload - missing Body' });
  }

  const stkCallback = Body.stkCallback;
  if (!stkCallback) {
    console.warn('❌ Invalid STK callback: missing stkCallback', { bodyKeys: Object.keys(Body) });
    return res.status(400).json({ message: 'Invalid callback payload - missing stkCallback' });
  }

  const checkoutRequestId = stkCallback.CheckoutRequestID;
  if (!checkoutRequestId) {
    console.warn('❌ Invalid STK callback: missing CheckoutRequestID');
    return res.status(400).json({ message: 'Invalid callback payload - missing CheckoutRequestID' });
  }

  const callbackTimestamp = stkCallback.Timestamp || Date.now();
  
  // Validate timestamp (reject if older than 5 minutes)
  if (!validateTimestamp(callbackTimestamp, 300)) {
    console.warn('❌ Callback rejected: stale timestamp', checkoutRequestId);
    return res.status(400).json({ message: 'Stale request' });
  }
  
  console.log('📝 Processing STK callback', { checkoutRequestId, timestamp: callbackTimestamp });

  // Idempotency check: prevent duplicate processing
  try {
    const processed = await isCallbackProcessed(adminDb, checkoutRequestId);
    if (processed) {
      console.log('⚠️  Callback already processed:', checkoutRequestId, { resultCode: stkCallback.ResultCode });
      return res.status(200).send('OK');
    }
  } catch (err) {
    console.error('❌ Idempotency check error:', err.message);
    // Don't fail - continue processing
  }

  const resultCode = stkCallback.ResultCode;
  console.log('🔄 Processing STK callback', { checkoutRequestId, resultCode });

  try {
    const transactions = await adminDb.collection('transactions')
      .where('checkoutRequestId', '==', checkoutRequestId)
      .limit(1)
      .get();

    if (transactions.empty) {
      console.warn('Transaction not found:', checkoutRequestId);
      await markCallbackProcessed(adminDb, checkoutRequestId);
      return res.status(200).send('Transaction not found');
    }

    const transactionDoc = transactions.docs[0];
    const transData = transactionDoc.data();

    if (resultCode === 0) {
      const items = stkCallback.CallbackMetadata?.Item || [];
      const mpesaReceiptNumber = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
      console.log('✅ STK callback success, updating transaction', { checkoutRequestId, mpesaReceiptNumber });

      // Check if this transaction is for a botPurchase (partial or full bot payment)
      if (transData.metadata?.botPurchaseId) {
        const splitResult = await handleBotPurchasePayment(transactionDoc.ref, transData, mpesaReceiptNumber);
        await markCallbackProcessed(adminDb, checkoutRequestId);

        try {
          const traderDoc = await adminDb.collection('traders').doc(transData.traderId).get();
          const botPurchaseDoc = await adminDb.collection('botPurchases').doc(transData.metadata.botPurchaseId).get();
          const botPurchaseData = botPurchaseDoc.data();
          
          let emailSubject = 'Payment received';
          if (botPurchaseData?.status === 'paid') {
            emailSubject = `${botPurchaseData.type === 'withdrawal-bot' ? 'Withdrawal Bot' : 'Bot'} Purchase Activated`;
          }
          
          await sendSuccessfulPaymentEmail({
            ...transData,
            id: transactionDoc.id,
            mpesaReceiptNumber,
            phoneNumber: transData.phoneNumber || null,
            subject: emailSubject
          }, traderDoc.data());
        } catch (emailError) {
          console.error('Notification email error:', emailError);
        }

        res.status(200).json(splitResult);
      } else {
        // Regular (full) purchase or deposit
        const splitResult = await handleSuccessfulPayment(transactionDoc.ref, transData, mpesaReceiptNumber);
        await markCallbackProcessed(adminDb, checkoutRequestId);

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
      }
    } else {
      console.warn('⚠️  STK callback failure result code', { checkoutRequestId, resultCode, resultDesc: stkCallback.ResultDesc });
      await transactionDoc.ref.update({ status: 'failed', failureReason: stkCallback.ResultDesc });
      await markCallbackProcessed(adminDb, checkoutRequestId);
      res.status(200).json({ message: 'Transaction failed' });
    }
  } catch (error) {
    console.error('❌ Callback processing error:', error.message, { checkoutRequestId });
    res.status(500).send('Error');
  }
});

// Handle bot purchase payment (partial or full via STK callback)
async function handleBotPurchasePayment(transRef, transData, mpesaReceiptNumber) {
  return await adminDb.runTransaction(async (t) => {
    const marketerId = transData.marketerId;
    const botPurchaseId = transData.metadata.botPurchaseId;
    const packageId = transData.metadata.packageId;
    
    let marketerCut = 0;
    let adminCut = transData.totalAmount;
    let marketerRef;
    let marketerDoc;

    if (marketerId !== 'ADMIN') {
      marketerCut = transData.totalAmount * 0.85;
      adminCut = transData.totalAmount * 0.15;
      marketerRef = adminDb.collection('marketers').doc(marketerId);
      marketerDoc = await t.get(marketerRef);
    }

    // Get bot purchase and package details
    const botPurchaseRef = adminDb.collection('botPurchases').doc(botPurchaseId);
    const botPurchaseDoc = await t.get(botPurchaseRef);
    if (!botPurchaseDoc.exists) {
      throw new Error('Bot purchase not found');
    }
    const botPurchaseData = botPurchaseDoc.data();

    const pkgRef = adminDb.collection('packages').doc(packageId);
    const pkgDoc = await t.get(pkgRef);
    if (!pkgDoc.exists) {
      throw new Error('Package not found');
    }
    const pkg = pkgDoc.data();

    const traderRef = adminDb.collection('traders').doc(transData.traderId);

    // 1. Update transaction status
    t.update(transRef, {
      status: 'success',
      mpesaReceiptNumber,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 2. Update marketer commission (if not admin)
    if (marketerId !== 'ADMIN') {
      if (!marketerDoc.exists) {
        t.set(marketerRef, {
          uid: marketerId,
          commissionBalance: marketerCut,
          totalEarned: marketerCut,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        t.update(marketerRef, {
          commissionBalance: admin.firestore.FieldValue.increment(marketerCut),
          totalEarned: admin.firestore.FieldValue.increment(marketerCut)
        });
      }

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

    // 3. Increment botPurchase.amountPaid and add contributor
    const newAmountPaid = botPurchaseData.amountPaid + transData.totalAmount;
    const contributors = botPurchaseData.contributors || [];
    contributors.push({
      actor: 'trader',
      amount: transData.totalAmount,
      txnId: transRef.id,
      createdAt: admin.firestore.Timestamp.fromDate(new Date())
    });

    t.update(botPurchaseRef, {
      amountPaid: newAmountPaid,
      contributors: contributors,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 4. Check if fully paid and activate
    if (newAmountPaid >= botPurchaseData.requiredAmount) {
      // Bot purchase is fully funded!
      await activateBotPurchase(traderRef, pkg, botPurchaseRef, marketerId, t, transRef.id);
    }

    invalidateCache('traders', 'marketers', 'transactions', 'commissions', 'sessions', 'botPurchases');
    return { success: true, message: newAmountPaid >= botPurchaseData.requiredAmount ? 'Bot activated!' : 'Payment recorded' };
  });
}

async function handleSuccessfulPayment(transRef, transData, mpesaReceiptNumber) {
  return await adminDb.runTransaction(async (t) => {
    const marketerId = transData.marketerId;
    let marketerCut = 0;
    let adminCut = transData.totalAmount;
    let marketerRef;
    let marketerDoc;
    let pkg;

    if (marketerId !== 'ADMIN') {
      marketerCut = transData.totalAmount * 0.85;
      adminCut = transData.totalAmount * 0.15;
      marketerRef = adminDb.collection('marketers').doc(marketerId);
      marketerDoc = await t.get(marketerRef);
    }

    const traderRef = adminDb.collection('traders').doc(transData.traderId);
    let pkgRef;
    if (['forex', 'crypto', 'mining', 'investment', 'lifespan', 'withdrawal-bot'].includes(transData.type)) {
      pkgRef = adminDb.collection('packages').doc(transData.metadata.packageId);
      const pkgDoc = await t.get(pkgRef);
      pkg = pkgDoc.exists ? pkgDoc.data() : {};
    }

    // 1. Update Transaction
    t.update(transRef, { 
      status: 'success', 
      mpesaReceiptNumber,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    if (marketerId !== 'ADMIN') {
      if (!marketerDoc.exists) {
        t.set(marketerRef, {
          uid: marketerId,
          commissionBalance: marketerCut,
          totalEarned: marketerCut,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        t.update(marketerRef, {
          commissionBalance: admin.firestore.FieldValue.increment(marketerCut),
          totalEarned: admin.firestore.FieldValue.increment(marketerCut)
        });
      }

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

    if (transData.type === 'deposit') {
      t.update(traderRef, {
        depositBalance: admin.firestore.FieldValue.increment(transData.totalAmount),
        totalDeposited: admin.firestore.FieldValue.increment(transData.totalAmount)
      });
    } else if (['forex', 'crypto', 'mining', 'investment', 'lifespan'].includes(transData.type)) {
      let durationMs = (pkg.duration || 60) * 60 * 1000;
      if (transData.type === 'investment' || transData.type === 'lifespan') {
         durationMs = (pkg.duration || 1) * 24 * 60 * 60 * 1000;
      }

      const sessionRef = adminDb.collection('sessions').doc();
      const startedAt = Date.now();
      const endsAt = startedAt + durationMs;

      const rawFamily = String(pkg.botFamily || '').trim();
      let derivedFamily = rawFamily || String(pkg.name || '').trim().toUpperCase().replace(/\s+(FOREX|CRYPTO|RIG|BOT|INVESTMENT|LIFESPAN)$/i, '').trim();
      if (derivedFamily === '') derivedFamily = null;

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
      t.update(traderRef, {
        activeSessionId: sessionRef.id,
        lastTradingPackageName: pkg.name || null,
        lastTradingFamily: derivedFamily,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } else if (transData.type === 'withdrawal-bot') {
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

  const ordersSnapshot = await adminDb.collection('tradeOrders').where('traderId', '==', uid).get();
  const orders = ordersSnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
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
    const currentPrice = await getInstrumentPrice(symbol);
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
    const referralCode = normalizedUsername.toUpperCase();
    
    batch.set(userRef, {
      uid: userRecord.uid,
      name: fullName,
      username: normalizedUsername,
      email,
      phoneNumber: phoneNumber || null,
      role: 'marketer',
      referralCode: referralCode,
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const marketerRef = adminDb.collection('marketers').doc(userRecord.uid);
    batch.set(marketerRef, {
      uid: userRecord.uid,
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

// Fix missing referral codes for marketers (admin only - utility endpoint)
app.post('/api/admin/fix-referral-codes', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const marketers = await adminDb.collection('users').where('role', '==', 'marketer').get();
    let updated = 0;

    for (const doc of marketers.docs) {
      const data = doc.data();
      if (!data.referralCode) {
        const referralCode = data.username.toUpperCase();
        await adminDb.collection('users').doc(doc.id).update({
          referralCode: referralCode
        });
        
        // Also create/update marketers doc if missing
        const marketerDocRef = adminDb.collection('marketers').doc(doc.id);
        const marketerDocSnap = await marketerDocRef.get();
        if (!marketerDocSnap.exists) {
          await marketerDocRef.set({
            uid: doc.id,
            commissionBalance: 0,
            totalEarned: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        
        updated++;
      }
    }

    invalidateCache('users', 'marketers');
    res.json({ message: `Fixed ${updated} marketer(s) with missing referral codes` });
  } catch (error) {
    console.error('Fix referral codes error:', error);
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

// Promote trader to marketer (admin only)
app.post('/api/admin/promote-to-marketer/:id', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const traderDoc = await adminDb.collection('users').doc(id).get();
    
    if (!traderDoc.exists) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userData = traderDoc.data();
    if (userData.role === 'marketer') {
      return res.status(400).json({ message: 'User is already a marketer' });
    }

    // Generate referral code from username
    const referralCode = userData.username.toUpperCase();

    // Update users collection with role and referral code
    await adminDb.collection('users').doc(id).update({
      role: 'marketer',
      referralCode: referralCode,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Create marketers collection document (commissions only)
    await adminDb.collection('marketers').doc(id).set({
      uid: id,
      commissionBalance: 0,
      totalEarned: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    invalidateCache('users', 'marketers', 'traders');

    res.json({ 
      message: 'Trader promoted to marketer successfully', 
      uid: id, 
      referralCode: referralCode 
    });
  } catch (error) {
    console.error('Promote to marketer error:', error);
    res.status(400).json({ message: error.message });
  }
});

// --- BOT PURCHASE ADMIN ENDPOINTS ---

// Get pending bot purchases
app.get('/api/admin/bot-purchases', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    
    let query = adminDb.collection('botPurchases');
    if (status) {
      query = query.where('status', '==', status);
    }
    
    const snapshot = await query.orderBy('createdAt', 'desc').get();
    const botPurchases = [];
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const traderSnap = await adminDb.collection('users').doc(data.traderId).get();
      const pkgSnap = await adminDb.collection('packages').doc(data.packageId).get();
      
      botPurchases.push({
        ...data,
        traderInfo: traderSnap.exists ? { id: traderSnap.id, name: traderSnap.data().name, email: traderSnap.data().email } : null,
        packageInfo: pkgSnap.exists ? { id: pkgSnap.id, name: pkgSnap.data().name, price: pkgSnap.data().price, type: pkgSnap.data().type } : null,
        outstandingAmount: Math.max(0, data.requiredAmount - data.amountPaid)
      });
    }
    
    res.json({ botPurchases });
  } catch (error) {
    console.error('Get bot purchases error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Get trader's pending bot purchases
app.get('/api/trader/bot-purchases', authMiddleware, async (req, res) => {
  try {
    const traderId = req.user.uid;
    // Query by traderId only, then sort and filter status in memory to avoid composite index requirement
    const snapshot = await adminDb.collection('botPurchases')
      .where('traderId', '==', traderId)
      .get();
    
    const botPurchases = [];
    const allPurchases = snapshot.docs.map(doc => doc.data()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    
    for (const data of allPurchases) {
      // Filter for pending status in application code
      if (data.status !== 'pending') continue;
      
      const pkgSnap = await adminDb.collection('packages').doc(data.packageId).get();
      
      botPurchases.push({
        ...data,
        packageInfo: pkgSnap.exists ? { id: pkgSnap.id, name: pkgSnap.data().name, price: pkgSnap.data().price, type: pkgSnap.data().type } : null,
        outstandingAmount: Math.max(0, data.requiredAmount - data.amountPaid)
      });
    }
    
    res.json({ botPurchases });
  } catch (error) {
    console.error('Get trader bot purchases error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Admin: Top-up bot purchase
app.post('/api/admin/bot-purchase/:id/top-up', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, note } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid top-up amount' });
    }
    
    const result = await adminDb.runTransaction(async (t) => {
      const botPurchaseRef = adminDb.collection('botPurchases').doc(id);
      const botPurchaseDoc = await t.get(botPurchaseRef);
      
      if (!botPurchaseDoc.exists) {
        throw new Error('Bot purchase not found');
      }
      
      const botPurchaseData = botPurchaseDoc.data();
      if (botPurchaseData.status !== 'pending') {
        throw new Error('Bot purchase is not pending');
      }
      
      // Get package and trader info
      const pkgSnap = await t.get(adminDb.collection('packages').doc(botPurchaseData.packageId));
      const pkg = pkgSnap.data();
      const traderRef = adminDb.collection('traders').doc(botPurchaseData.traderId);
      
      // Create admin top-up transaction record
      const transactionRef = adminDb.collection('transactions').doc();
      t.set(transactionRef, {
        id: transactionRef.id,
        traderId: botPurchaseData.traderId,
        marketerId: botPurchaseData.marketerId || 'ADMIN',
        totalAmount: amount,
        type: botPurchaseData.type,
        status: 'success',
        metadata: { botPurchaseId: id, adminTopUp: true },
        adminNote: note || '',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Update bot purchase
      const newAmountPaid = botPurchaseData.amountPaid + amount;
      const contributors = botPurchaseData.contributors || [];
      contributors.push({
        actor: 'admin',
        amount: amount,
        txnId: transactionRef.id,
        note: note || '',
        createdAt: admin.firestore.Timestamp.fromDate(new Date())
      });
      
      t.update(botPurchaseRef, {
        amountPaid: newAmountPaid,
        contributors: contributors,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // If fully paid, activate the bot
      if (newAmountPaid >= botPurchaseData.requiredAmount) {
        await activateBotPurchase(traderRef, pkg, botPurchaseRef, botPurchaseData.marketerId || 'ADMIN', t, transactionRef.id);
      }
      
      invalidateCache('botPurchases', 'traders', 'transactions');
      
      return {
        success: true,
        message: newAmountPaid >= botPurchaseData.requiredAmount ? 'Bot activated!' : 'Top-up recorded',
        botPurchase: { id, amountPaid: newAmountPaid, outstandingAmount: Math.max(0, botPurchaseData.requiredAmount - newAmountPaid) }
      };
    });
    
    res.json(result);
  } catch (error) {
    console.error('Top-up bot purchase error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Admin: Mark bot purchase as fully paid
app.post('/api/admin/bot-purchase/:id/mark-paid', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    
    const result = await adminDb.runTransaction(async (t) => {
      const botPurchaseRef = adminDb.collection('botPurchases').doc(id);
      const botPurchaseDoc = await t.get(botPurchaseRef);
      
      if (!botPurchaseDoc.exists) {
        throw new Error('Bot purchase not found');
      }
      
      const botPurchaseData = botPurchaseDoc.data();
      if (botPurchaseData.status !== 'pending') {
        throw new Error('Bot purchase is not pending');
      }
      
      const outstandingAmount = botPurchaseData.requiredAmount - botPurchaseData.amountPaid;
      
      // Get package and trader info
      const pkgSnap = await t.get(adminDb.collection('packages').doc(botPurchaseData.packageId));
      const pkg = pkgSnap.data();
      const traderRef = adminDb.collection('traders').doc(botPurchaseData.traderId);
      
      // Create admin payment transaction record
      const transactionRef = adminDb.collection('transactions').doc();
      t.set(transactionRef, {
        id: transactionRef.id,
        traderId: botPurchaseData.traderId,
        marketerId: botPurchaseData.marketerId || 'ADMIN',
        totalAmount: outstandingAmount,
        type: botPurchaseData.type,
        status: 'success',
        metadata: { botPurchaseId: id, adminMarkedPaid: true },
        adminNote: note || 'Admin marked as fully paid',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Update bot purchase with final top-up
      const contributors = botPurchaseData.contributors || [];
      contributors.push({
        actor: 'admin',
        amount: outstandingAmount,
        txnId: transactionRef.id,
        note: note || 'Marked as paid by admin',
        createdAt: admin.firestore.Timestamp.fromDate(new Date())
      });
      
      t.update(botPurchaseRef, {
        amountPaid: botPurchaseData.requiredAmount,
        contributors: contributors,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Activate the bot
      await activateBotPurchase(traderRef, pkg, botPurchaseRef, botPurchaseData.marketerId || 'ADMIN', t, transactionRef.id);
      
      invalidateCache('botPurchases', 'traders', 'transactions');
      
      return {
        success: true,
        message: 'Bot purchase marked as paid and bot activated',
        botPurchase: { id, status: 'paid', amountPaid: botPurchaseData.requiredAmount }
      };
    });
    
    res.json(result);
  } catch (error) {
    console.error('Mark paid bot purchase error:', error);
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
  console.log('🌱 seedDatabase: Starting seed operations...');
  const settingsRef = adminDb.collection('settings').doc('platform');
  console.log('🌱 seedDatabase: Fetching settings doc...');
  const settingsDoc = await settingsRef.get();
  console.log('🌱 seedDatabase: Settings doc fetched, exists:', settingsDoc.exists);
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

  console.log('🌱 seedDatabase: Checking packages collection...');
  const packagesCheck = await adminDb.collection('packages').limit(1).get();
  console.log('🌱 seedDatabase: Packages check done, empty:', packagesCheck.empty);
  if (packagesCheck.empty) {
    const pkgs = [
      // Forex trading packages (family-specific)
      { type: 'forex', name: 'TITAN FOREX BOT', price: 1500, expectedReturn: 12000, duration: 60, botFamily: 'TITAN FOREX' },
      { type: 'forex', name: 'ASTRO FOREX BOT', price: 1500, expectedReturn: 12000, duration: 60, botFamily: 'ASTRO' },
      { type: 'forex', name: 'SYNAPSE FOREX BOT', price: 3000, expectedReturn: 24000, duration: 60, botFamily: 'SYNAPSE' },
      { type: 'forex', name: 'GOLDEN FOREX BOT', price: 5500, expectedReturn: 44000, duration: 60, botFamily: 'GOLDEN' },
      { type: 'forex', name: 'PHOENIX FOREX BOT', price: 4000, expectedReturn: 32000, duration: 60, botFamily: 'PHOENIX' },
      { type: 'forex', name: 'ORACLE FOREX BOT', price: 4500, expectedReturn: 36000, duration: 60, botFamily: 'ORACLE' },

      // Crypto trading packages
      { type: 'crypto', name: 'FLUX CRYPTO BOT', price: 10000, expectedReturn: 80000, duration: 60, botFamily: 'FLUX' },
      { type: 'crypto', name: 'VEXO CRYPTO BOT', price: 15000, expectedReturn: 120000, duration: 60, botFamily: 'VEXO' },
      { type: 'crypto', name: 'QUANTUM CRYPTO BOT', price: 20000, expectedReturn: 200000, duration: 60, botFamily: 'QUANTUM' },

      // Mining packages
      { type: 'mining', name: 'BLOCK RIG', price: 2500, expectedReturn: 5000, duration: 60, hashrate: '50 TH/s', botFamily: 'BLOCK' },
      { type: 'mining', name: 'PULSE RIG', price: 3500, expectedReturn: 8000, duration: 60, hashrate: '120 TH/s', botFamily: 'PULSE' },
      { type: 'mining', name: 'CRYPTO QUARRY', price: 5000, expectedReturn: 12000, duration: 60, hashrate: '500 TH/s', botFamily: 'QUARRY' },

      // Lifespan packages
      { type: 'lifespan', name: 'MARGIN BOT', price: 11500, expectedReturn: 100000, duration: 3, botFamily: 'MARGIN' },
      { type: 'lifespan', name: 'NEXA BOT', price: 15000, expectedReturn: 500000, duration: 7, botFamily: 'NEXA' },

      // Withdrawal + Verification packages (one-per-family, no tiers)
      { type: 'withdrawal-bot', name: 'TITAN FOREX WITHDRAWAL BOT', price: 2000, maxAmount: 20000, botFamily: 'TITAN FOREX' },
      { type: 'verification-bot', name: 'TITAN FOREX VERIFICATION BOT', price: 1000, botFamily: 'TITAN FOREX' },

      { type: 'withdrawal-bot', name: 'ASTRO WITHDRAWAL BOT', price: 1800, maxAmount: 15000, botFamily: 'ASTRO' },
      { type: 'verification-bot', name: 'ASTRO VERIFICATION BOT', price: 900, botFamily: 'ASTRO' },

      { type: 'withdrawal-bot', name: 'SYNAPSE WITHDRAWAL BOT', price: 2500, maxAmount: 30000, botFamily: 'SYNAPSE' },
      { type: 'verification-bot', name: 'SYNAPSE VERIFICATION BOT', price: 1200, botFamily: 'SYNAPSE' },

      { type: 'withdrawal-bot', name: 'GOLDEN WITHDRAWAL BOT', price: 3000, maxAmount: 40000, botFamily: 'GOLDEN' },
      { type: 'verification-bot', name: 'GOLDEN VERIFICATION BOT', price: 1500, botFamily: 'GOLDEN' },
      { type: 'withdrawal-bot', name: 'PHOENIX WITHDRAWAL BOT', price: 2000, maxAmount: 40000, botFamily: 'PHOENIX' },
      { type: 'verification-bot', name: 'PHOENIX VERIFICATION BOT', price: 1000, botFamily: 'PHOENIX' },
      { type: 'withdrawal-bot', name: 'ORACLE WITHDRAWAL BOT', price: 2250, maxAmount: 45000, botFamily: 'ORACLE' },
      { type: 'verification-bot', name: 'ORACLE VERIFICATION BOT', price: 1125, botFamily: 'ORACLE' },

      { type: 'withdrawal-bot', name: 'FLUX WITHDRAWAL BOT', price: 4000, maxAmount: 80000, botFamily: 'FLUX' },
      { type: 'verification-bot', name: 'FLUX VERIFICATION BOT', price: 1800, botFamily: 'FLUX' },

      { type: 'withdrawal-bot', name: 'VEXO WITHDRAWAL BOT', price: 4500, maxAmount: 120000, botFamily: 'VEXO' },
      { type: 'verification-bot', name: 'VEXO VERIFICATION BOT', price: 2000, botFamily: 'VEXO' },

      { type: 'withdrawal-bot', name: 'QUANTUM WITHDRAWAL BOT', price: 5000, maxAmount: null, botFamily: 'QUANTUM' },
      { type: 'verification-bot', name: 'QUANTUM VERIFICATION BOT', price: 2500, botFamily: 'QUANTUM' },

      { type: 'withdrawal-bot', name: 'BLOCK WITHDRAWAL BOT', price: 1800, maxAmount: 20000, botFamily: 'BLOCK' },
      { type: 'verification-bot', name: 'BLOCK VERIFICATION BOT', price: 900, botFamily: 'BLOCK' },

      { type: 'withdrawal-bot', name: 'PULSE WITHDRAWAL BOT', price: 2000, maxAmount: 30000, botFamily: 'PULSE' },
      { type: 'verification-bot', name: 'PULSE VERIFICATION BOT', price: 1000, botFamily: 'PULSE' },

      { type: 'withdrawal-bot', name: 'QUARRY WITHDRAWAL BOT', price: 2200, maxAmount: 40000, botFamily: 'QUARRY' },
      { type: 'verification-bot', name: 'QUARRY VERIFICATION BOT', price: 1100, botFamily: 'QUARRY' },

      { type: 'withdrawal-bot', name: 'MARGIN WITHDRAWAL BOT', price: 3500, maxAmount: 100000, botFamily: 'MARGIN' },
      { type: 'verification-bot', name: 'MARGIN VERIFICATION BOT', price: 1600, botFamily: 'MARGIN' },

      { type: 'withdrawal-bot', name: 'NEXA WITHDRAWAL BOT', price: 4500, maxAmount: 500000, botFamily: 'NEXA' },
      { type: 'verification-bot', name: 'NEXA VERIFICATION BOT', price: 2200, botFamily: 'NEXA' }
    ];

    const batch = adminDb.batch();
    pkgs.forEach(p => {
      const ref = adminDb.collection('packages').doc();
      batch.set(ref, { ...p, id: ref.id });
    });
    console.log('🌱 seedDatabase: Batch commit for packages...');
    await batch.commit();
    console.log('🌱 seedDatabase: Packages seeded successfully');
  } else {
    console.log('🌱 seedDatabase: Packages already exist, checking for missing withdrawal/verification families...');
    const packagesSnapshot = await adminDb.collection('packages').get();
    const packages = packagesSnapshot.docs.map((doc) => doc.data());
    const tradingTypes = new Set(['forex', 'crypto', 'mining', 'investment', 'lifespan']);
    const tradingByFamily = new Map();
    const withdrawalFamilies = new Set();
    const verificationFamilies = new Set();

    const deriveFamilyFromName = (name = '') => {
      const normalized = String(name).trim().toUpperCase();
      const match = normalized.match(/^(.*?)\s+(FOREX|CRYPTO|RIG|BOT|INVESTMENT|LIFESPAN)$/i);
      if (match && match[1]) {
        return match[1].trim();
      }
      return normalized || null;
    };

    packages.forEach((pkg) => {
      const rawFamily = String(pkg.botFamily || '').trim();
      const family = rawFamily || deriveFamilyFromName(pkg.name || '');
      if (!family) return;
      if (pkg.type === 'withdrawal-bot') withdrawalFamilies.add(family.toUpperCase());
      if (pkg.type === 'verification-bot') verificationFamilies.add(family.toUpperCase());
      if (tradingTypes.has(pkg.type) && !tradingByFamily.has(family.toUpperCase())) {
        tradingByFamily.set(family.toUpperCase(), pkg);
      }
    });

    const batch = adminDb.batch();
    let missingPackageCount = 0;

    tradingByFamily.forEach((tradingPkg, familyKey) => {
      const family = familyKey;
      const existingWithdrawal = withdrawalFamilies.has(family);
      const existingVerification = verificationFamilies.has(family);
      if (existingWithdrawal && existingVerification) return;

      const basePrice = Number(tradingPkg.price || 1000);
      const withdrawalPrice = Math.max(500, Math.round(basePrice * 0.5));
      const verificationPrice = Math.max(250, Math.round(withdrawalPrice * 0.4));
      const maxAmount = Math.max(20000, Math.round(basePrice * 5));

      if (!existingWithdrawal) {
        const withdrawalRef = adminDb.collection('packages').doc();
        batch.set(withdrawalRef, {
          id: withdrawalRef.id,
          type: 'withdrawal-bot',
          name: `${family} WITHDRAWAL BOT`,
          price: withdrawalPrice,
          maxAmount,
          botFamily: family,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        missingPackageCount += 1;
      }

      if (!existingVerification) {
        const verificationRef = adminDb.collection('packages').doc();
        batch.set(verificationRef, {
          id: verificationRef.id,
          type: 'verification-bot',
          name: `${family} VERIFICATION BOT`,
          price: verificationPrice,
          botFamily: family,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        missingPackageCount += 1;
      }
    });

    if (missingPackageCount > 0) {
      console.log(`🌱 seedDatabase: Adding ${missingPackageCount} missing withdrawal/verification packages for existing families...`);
      await batch.commit();
      console.log('🌱 seedDatabase: Missing packages created successfully');
    } else {
      console.log('🌱 seedDatabase: No missing withdrawal/verification packages found');
    }
  }

  console.log('🌱 seedDatabase: Starting admin user seed...');
  await seedAdminUser();
  console.log('🌱 seedDatabase: Admin user seed complete');
}

async function seedAdminUser() {
  console.log('👤 seedAdminUser: Starting admin user seed...');
  // Only create admin if explicit env vars are set. Prevents accidental admin creation.
  // To create initial admin: set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD in .env
  // then restart server once. Remove env vars afterward for security.
  const adminEmail = process.env.INITIAL_ADMIN_EMAIL;
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
  console.log('👤 seedAdminUser: Admin email configured:', !!adminEmail);
  
  if (!adminEmail || !adminPassword) {
    console.log('ℹ  Admin seeding skipped (INITIAL_ADMIN_EMAIL and/or INITIAL_ADMIN_PASSWORD not set).');
    console.log('   To create admin: set both env vars, restart server, then remove from .env for security.');
    console.log('   Alternative: Use Firebase Admin SDK to promote an existing user or create via Firebase Console.');
    return;
  }

  const adminUsername = 'admin';
  const adminPhoneNumber = process.env.ADMIN_PHONE_NUMBER || '0000000000';
  const adminFullName = process.env.ADMIN_FULL_NAME || 'Administrator';

  let userRecord;
  try {
    userRecord = await adminAuth.getUserByEmail(adminEmail);
    console.log('ℹ  Admin user already exists.');
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      userRecord = await adminAuth.createUser({
        email: adminEmail,
        password: adminPassword,
        displayName: adminFullName
      });
      console.log('✓ Admin user created:', adminEmail);
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

const WITHDRAWAL_STATUS_ORDER = ['pending', 'ready_for_processing_by_platform', 'pending_processing_by_platform', 'in_processing', 'paid'];

const getWithdrawalStatusLabel = (status) => ({
  pending: 'Pending review',
  ready_for_processing_by_platform: 'Ready for platform processing',
  pending_processing_by_platform: 'Pending platform processing',
  in_processing: 'In processing',
  paid: 'Paid',
  rejected: 'Rejected'
}[status] || 'Unknown');

const getNextWithdrawalStatus = (currentStatus) => {
  const currentIndex = WITHDRAWAL_STATUS_ORDER.indexOf(currentStatus);
  if (currentIndex === -1 || currentIndex >= WITHDRAWAL_STATUS_ORDER.length - 1) {
    return null;
  }
  return WITHDRAWAL_STATUS_ORDER[currentIndex + 1];
};

const getReviewDeadline = (hours = 24) => admin.firestore.Timestamp.fromDate(new Date(Date.now() + hours * 60 * 60 * 1000));
const serializeTimestamp = (value) => (value && typeof value.toDate === 'function' ? value.toDate().toISOString() : value || null);
const serializeWithdrawal = (data) => ({
  ...data,
  requestedAt: serializeTimestamp(data.requestedAt),
  nextActionAt: serializeTimestamp(data.nextActionAt),
  lastUpdatedAt: serializeTimestamp(data.lastUpdatedAt),
  approvedAt: serializeTimestamp(data.approvedAt),
  paidAt: serializeTimestamp(data.paidAt),
  rejectedAt: serializeTimestamp(data.rejectedAt),
  resolvedAt: serializeTimestamp(data.resolvedAt),
  statusLabel: getWithdrawalStatusLabel(data.status)
});

app.get('/api/admin/withdrawals', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { status } = req.query;
    let query = adminDb.collection('withdrawals');

    if (status) {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.orderBy('requestedAt', 'desc').get();
    const withdrawals = snapshot.docs.map((doc) => serializeWithdrawal({ id: doc.id, ...doc.data() }));

    res.json({ withdrawals });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get('/api/trader/withdrawals', authMiddleware, roleMiddleware(['trader']), async (req, res) => {
  try {
    const snapshot = await adminDb.collection('withdrawals')
      .where('traderId', '==', req.user.uid)
      .get();

    const withdrawals = snapshot.docs
      .map((doc) => serializeWithdrawal({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (new Date(b.requestedAt || 0).getTime() || 0) - (new Date(a.requestedAt || 0).getTime() || 0));

    res.json({ withdrawals });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post('/api/trader/withdraw', authMiddleware, roleMiddleware(['trader']), async (req, res) => {
  try {
    const data = withdrawalSchema.parse(req.body);
    const reviewHours = Number(req.body.reviewHours || process.env.WITHDRAWAL_REVIEW_WINDOW_HOURS || 24);

    const result = await adminDb.runTransaction(async (t) => {
      const traderRef = adminDb.collection('traders').doc(req.user.uid);
      const traderDoc = await t.get(traderRef);
      const trader = traderDoc.exists ? traderDoc.data() : null;

      const hasVerificationBot = Boolean(trader?.verificationBotPackageId || trader?.verificationBotPackageName || trader?.verificationBotFamily || trader?.verificationBotTier);
      if (!hasVerificationBot) {
        throw new Error('You must own a verification bot to request withdrawal.');
      }

      if (trader.verificationBotMaxAmount && data.amount > trader.verificationBotMaxAmount) {
        throw new Error(`Your verification bot only allows withdrawals up to ${trader.verificationBotMaxAmount}.`);
      }

      const currentBalance = Number(trader.tradingBalance || 0);
      if (data.amount > currentBalance) {
        throw new Error('Insufficient trading balance.');
      }

      const withdrawalRef = adminDb.collection('withdrawals').doc();
      const nextActionAt = getReviewDeadline(reviewHours);

      t.set(withdrawalRef, {
        id: withdrawalRef.id,
        traderId: req.user.uid,
        amount: data.amount,
        phoneNumber: data.phoneNumber || null,
        status: 'pending',
        reviewWindowHours: reviewHours,
        nextActionAt,
        botFamily: trader.withdrawalBotFamily || null,
        botRole: trader.withdrawalBotRole || null,
        botCategory: trader.withdrawalBotCategory || null,
        withdrawalPackageId: trader.withdrawalBotPackageId || null,
        verificationPackageId: trader.verificationBotPackageId || null,
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      t.update(traderRef, {
        tradingBalance: admin.firestore.FieldValue.increment(-Number(data.amount))
      });

      return {
        id: withdrawalRef.id,
        amount: data.amount,
        phoneNumber: data.phoneNumber || null,
        status: 'pending',
        nextActionAt
      };
    });

    invalidateCache('withdrawals', 'traders');
    res.json({ message: 'Withdrawal requested successfully', withdrawal: { ...result, statusLabel: getWithdrawalStatusLabel('pending') } });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post('/api/admin/withdrawals/:requestId/extend', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { requestId } = req.params;
    const { hours = 24, note } = req.body;

    if (!hours || hours <= 0) {
      return res.status(400).json({ message: 'Invalid extension length' });
    }

    const withdrawalRef = adminDb.collection('withdrawals').doc(requestId);
    const withdrawalDoc = await withdrawalRef.get();

    if (!withdrawalDoc.exists) {
      return res.status(404).json({ message: 'Request not found' });
    }

    const withdrawal = withdrawalDoc.data();
    if (withdrawal.status === 'paid' || withdrawal.status === 'rejected') {
      return res.status(400).json({ message: 'This request is already closed' });
    }

    await withdrawalRef.update({
      reviewWindowHours: hours,
      nextActionAt: getReviewDeadline(hours),
      adminNote: note || `Extended by admin for ${hours} hours`,
      lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    invalidateCache('withdrawals');
    res.json({ message: 'Withdrawal timeline extended', withdrawalId: requestId });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to extend withdrawal' });
  }
});

app.post('/api/admin/withdrawals/:requestId/advance', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { requestId } = req.params;
    const { note, mpesaReceiptNumber } = req.body;

    const result = await adminDb.runTransaction(async (t) => {
      const withdrawalRef = adminDb.collection('withdrawals').doc(requestId);
      const withdrawalDoc = await t.get(withdrawalRef);

      if (!withdrawalDoc.exists) {
        throw new Error('Request not found');
      }

      const withdrawal = withdrawalDoc.data();
      if (withdrawal.status === 'paid' || withdrawal.status === 'rejected') {
        throw new Error('Request already completed');
      }

      const nextStatus = getNextWithdrawalStatus(withdrawal.status);
      if (!nextStatus) {
        throw new Error('Request already completed');
      }

      const updateData = {
        status: nextStatus,
        adminNote: note || `Advanced to ${getWithdrawalStatusLabel(nextStatus)}`,
        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (nextStatus === 'paid') {
        const traderRef = adminDb.collection('traders').doc(withdrawal.traderId);
        const traderDoc = await t.get(traderRef);
        const trader = traderDoc.data();

        if (!trader || (trader.tradingBalance || 0) < withdrawal.amount) {
          throw new Error('Insufficient trader balance');
        }

        t.update(traderRef, {
          tradingBalance: admin.firestore.FieldValue.increment(-withdrawal.amount)
        });

        updateData.paidAt = admin.firestore.FieldValue.serverTimestamp();
        updateData.mpesaReceiptNumber = mpesaReceiptNumber || withdrawal.mpesaReceiptNumber || null;
      } else {
        updateData.nextActionAt = getReviewDeadline(withdrawal.reviewWindowHours || 24);
      }

      t.update(withdrawalRef, updateData);

      return {
        success: true,
        message: `Withdrawal moved to ${getWithdrawalStatusLabel(nextStatus)}`,
        withdrawal: { id: requestId, status: nextStatus }
      };
    });

    invalidateCache('withdrawals', 'traders');
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to advance withdrawal' });
  }
});

app.post('/api/admin/withdrawals/:requestId/mark-paid', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { requestId } = req.params;
    const { note, mpesaReceiptNumber } = req.body;

    const result = await adminDb.runTransaction(async (t) => {
      const withdrawalRef = adminDb.collection('withdrawals').doc(requestId);
      const withdrawalDoc = await t.get(withdrawalRef);

      if (!withdrawalDoc.exists) {
        throw new Error('Request not found');
      }

      const withdrawal = withdrawalDoc.data();
      if (withdrawal.status === 'paid' || withdrawal.status === 'rejected') {
        throw new Error('This request is already closed');
      }

      const traderRef = adminDb.collection('traders').doc(withdrawal.traderId);
      const traderDoc = await t.get(traderRef);
      const trader = traderDoc.data();

      if (!trader || (trader.tradingBalance || 0) < 0) {
        throw new Error('Unable to finalize this withdrawal right now');
      }

      t.update(withdrawalRef, {
        status: 'paid',
        adminNote: note || 'Marked as paid by admin',
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        mpesaReceiptNumber: mpesaReceiptNumber || withdrawal.mpesaReceiptNumber || null,
        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return { success: true, message: 'Withdrawal marked as paid', withdrawal: { id: requestId, status: 'paid' } };
    });

    invalidateCache('withdrawals', 'traders');
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to mark withdrawal as paid' });
  }
});

app.post('/api/admin/withdrawals/:requestId/reject', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { requestId } = req.params;
    const { note } = req.body;

    await adminDb.runTransaction(async (t) => {
      const withdrawalRef = adminDb.collection('withdrawals').doc(requestId);
      const withdrawalDoc = await t.get(withdrawalRef);

      if (!withdrawalDoc.exists) {
        throw new Error('Request not found');
      }

      const withdrawal = withdrawalDoc.data();
      if (withdrawal.status === 'paid' || withdrawal.status === 'rejected') {
        throw new Error('This request is already closed');
      }

      t.update(withdrawalRef, {
        status: 'rejected',
        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        adminNote: note || 'Rejected by admin',
        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if (withdrawal.traderId && Number(withdrawal.amount) > 0) {
        const traderRef = adminDb.collection('traders').doc(withdrawal.traderId);
        t.update(traderRef, {
          tradingBalance: admin.firestore.FieldValue.increment(Number(withdrawal.amount))
        });
      }
    });

    invalidateCache('withdrawals', 'traders');
    res.json({ message: 'Withdrawal rejected and refunded', withdrawalId: requestId });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to reject withdrawal' });
  }
});

app.post('/api/admin/payouts/approve/:requestId', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { requestId } = req.params;
    const { note, mpesaReceiptNumber } = req.body;

    const result = await adminDb.runTransaction(async (t) => {
      const withdrawalRef = adminDb.collection('withdrawals').doc(requestId);
      const withdrawalDoc = await t.get(withdrawalRef);

      if (!withdrawalDoc.exists) {
        throw new Error('Request not found');
      }

      const withdrawal = withdrawalDoc.data();
      const nextStatus = getNextWithdrawalStatus(withdrawal.status);
      if (!nextStatus) {
        throw new Error('Request already completed');
      }

      const updateData = {
        status: nextStatus,
        adminNote: note || `Advanced to ${getWithdrawalStatusLabel(nextStatus)}`,
        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (nextStatus === 'paid') {
        const traderRef = adminDb.collection('traders').doc(withdrawal.traderId);
        const traderDoc = await t.get(traderRef);
        const trader = traderDoc.data();

        if (!trader || (trader.tradingBalance || 0) < withdrawal.amount) {
          throw new Error('Insufficient trader balance');
        }

        t.update(traderRef, {
          tradingBalance: admin.firestore.FieldValue.increment(-withdrawal.amount)
        });
        updateData.paidAt = admin.firestore.FieldValue.serverTimestamp();
        updateData.mpesaReceiptNumber = mpesaReceiptNumber || withdrawal.mpesaReceiptNumber || null;
      } else {
        updateData.nextActionAt = getReviewDeadline(withdrawal.reviewWindowHours || 24);
      }

      t.update(withdrawalRef, updateData);

      return {
        success: true,
        message: `Withdrawal moved to ${getWithdrawalStatusLabel(nextStatus)}`,
        withdrawal: { id: requestId, status: nextStatus }
      };
    });

    invalidateCache('withdrawals', 'traders');
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to advance withdrawal' });
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
      let marketer = marketerDoc.exists ? marketerDoc.data() : null;
      if (!marketer) {
        t.set(marketerRef, {
          uid: marketerId,
          commissionBalance: 0,
          totalEarned: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        marketer = { commissionBalance: 0, totalEarned: 0 };
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

app.post('/api/payouts/callback', async (req, res) => {
   // Shared callback for both trader and marketer payouts
   console.log('✅ B2C callback endpoint hit', {
     method: req.method,
     path: req.path,
     ip: req.ip || req.headers['x-forwarded-for'],
     bodyKeys: Object.keys(req.body || {})
   });

   if (!req.body || !req.body.Result) {
     console.warn('❌ Invalid B2C callback: missing Result', { bodyKeys: Object.keys(req.body || {}) });
     return res.status(400).send('Invalid callback payload');
   }

   const Result = req.body.Result;
   const conversationId = Result.ConversationID;
   const resultCode = Result.ResultCode;

   if (!conversationId) {
     console.warn('❌ Invalid B2C callback: missing ConversationID');
     return res.status(400).send('Invalid callback payload - missing ConversationID');
   }

   console.log('🔄 Processing B2C callback', { conversationId, resultCode });

   try {
      // Find the payout in either collection
      const mPayouts = await adminDb.collection('marketerPayouts').where('conversationId', '==', conversationId).limit(1).get();
      const tWithdrawals = await adminDb.collection('withdrawals').where('conversationId', '==', conversationId).limit(1).get();

      if (!mPayouts.empty) {
         const doc = mPayouts.docs[0];
         const data = doc.data();
         if (resultCode === 0) {
            const params = Result.ResultParameters?.ResultParameter || [];
            const receipt = params.find(p => p.Key === 'TransactionID')?.Value;
            console.log('✅ B2C callback success for marketer payout', { conversationId, receipt });
            await doc.ref.update({ status: 'paid', paidAt: admin.firestore.FieldValue.serverTimestamp(), mpesaReceiptNumber: receipt });
         } else {
            // Restore balance
            console.log('⚠️  B2C callback failure for marketer payout', { conversationId, resultCode, desc: Result.ResultDesc });
            await adminDb.collection('marketers').doc(data.marketerId).update({
               commissionBalance: admin.firestore.FieldValue.increment(data.amount)
            });
            await doc.ref.update({ status: 'failed', failReason: Result.ResultDesc });
         }
      } else if (!tWithdrawals.empty) {
         const doc = tWithdrawals.docs[0];
         const data = doc.data();
         if (resultCode === 0) {
            const params = Result.ResultParameters?.ResultParameter || [];
            const receipt = params.find(p => p.Key === 'TransactionID')?.Value;
            console.log('✅ B2C callback success for trader withdrawal', { conversationId, receipt });
            await doc.ref.update({ status: 'paid', paidAt: admin.firestore.FieldValue.serverTimestamp(), mpesaReceiptNumber: receipt, lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp() });
            // Deduct from trading balance
            await adminDb.collection('traders').doc(data.traderId).update({
               tradingBalance: admin.firestore.FieldValue.increment(-data.amount)
            });
         } else {
            console.log('⚠️  B2C callback failure for trader withdrawal', { conversationId, resultCode, desc: Result.ResultDesc });
            await doc.ref.update({ status: 'rejected', adminNote: 'Payout failed: ' + Result.ResultDesc, lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp() });
         }
      } else {
         console.warn('⚠️  B2C callback: no matching payout or withdrawal found', { conversationId });
      }
      invalidateCache('marketers', 'traders', 'marketerPayouts', 'withdrawals');
      res.status(200).send('OK');
   } catch (error) {
      console.error('❌ B2C Callback Error:', error.message, { conversationId });
      res.status(500).send('Error');
   }
});

// Vite middleware for development
async function startServer() {
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

  // Start server immediately so callback routes are available
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
  });

  // Run database seeding in background (non-blocking)
  // Add timeout to prevent infinite hangs
  const seedTimeout = setTimeout(() => {
    console.error('❌ seedDatabase timeout after 30 seconds - aborting seed');
  }, 30000);

  try {
    console.log('🚀 Starting background database seed operations...');
    await seedDatabase();
    clearTimeout(seedTimeout);
    console.log('✅ Database seed operations completed successfully');
  } catch (error) {
    clearTimeout(seedTimeout);
    console.error('❌ Failed to seed database:', error.message);
  }
}

startServer();
