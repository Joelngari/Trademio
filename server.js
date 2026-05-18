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

app.use(cors());
app.use(express.json());

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
      tradingBalance: 0,
      depositBalance: 0,
      totalDeposited: 0,
      withdrawalBotTier: null,
      withdrawalBotMaxAmount: null,
      activeSessionId: null,
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
      status: 'pending',
      metadata: metadata,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const result = await initiateStkPush(phoneNumber, amount, transactionRef.id, description);
    
    // Update transaction with CheckoutRequestID
    await transactionRef.update({ checkoutRequestId: result.CheckoutRequestID });

    res.json({ message: 'STK push sent. Check your phone.', checkoutRequestId: result.CheckoutRequestID });
  } catch (error) {
    console.error('Payment Error:', error);
    res.status(500).json({ message: 'Failed to initiate payment' });
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
        startedAt,
        endsAt,
        status: 'active',
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

app.get('/api/trader/dashboard', authMiddleware, async (req, res) => {
  try {
    const data = await getCollections('packages', 'sessions', 'transactions');
    const traderDoc = await adminDb.collection('traders').doc(req.user.uid).get();
    const traderData = traderDoc.data();
    
    // Filter active session if exists
    let activeSession = null;
    if (traderData.activeSessionId) {
      const sessDoc = await adminDb.collection('sessions').doc(traderData.activeSessionId).get();
      if (sessDoc.exists) activeSession = sessDoc.data();
    }

    res.json({
      trader: traderData,
      activeSession,
      packages: data[0],
      recentTransactions: data[2].filter(t => t.traderId === req.user.uid).slice(0, 10)
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching dashboard' });
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

    // Create Firebase Auth user
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: fullName,
      phoneNumber
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

// --- CRON JOB (Session Completion) ---

cron.schedule('* * * * *', async () => {
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

      await adminDb.runTransaction(async (t) => {
        const traderRef = adminDb.collection('traders').doc(session.traderId);
        t.update(traderRef, {
          tradingBalance: admin.firestore.FieldValue.increment(session.expectedReturn),
          activeSessionId: null
        });

        t.update(doc.ref, {
          status: 'completed',
          creditedAt: admin.firestore.FieldValue.serverTimestamp()
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
      platformName: 'Trademio',
      adminReferralCode: 'TRADEMIO-ADMIN',
      marketerMinWithdrawal: 150
    });
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
  const adminPassword = 'Joelngari@2023^';
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
    const withdrawalRef = adminDb.collection('withdrawals').doc(requestId);
    const withdrawalDoc = await withdrawalRef.get();

    if (!withdrawalDoc.exists) return res.status(404).json({ message: 'Request not found' });
    const withdrawal = withdrawalDoc.data();

    if (withdrawal.status !== 'pending') return res.status(400).json({ message: 'Request already processed' });

    // Call Daraja B2C
    const b2cResponse = await initiateB2C(withdrawal.phoneNumber, withdrawal.amount, 'Trader Withdrawal', 'Earnings', process.env.DARAJA_B2C_RESULT_URL);
    
    await withdrawalRef.update({ 
      status: 'processing', 
      conversationId: b2cResponse.ConversationID 
    });
    
    res.json({ message: 'Withdrawal approved and payment initiated' });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
