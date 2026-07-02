#!/usr/bin/env node
// One-off migration: populate `lastTradingFamily` and `lastTradingPackageName` on traders
// Usage (dry run):
//   node scripts/backfill-lastTradingFamily.js
// To actually perform updates, set RUN_MIGRATION=1 in env:
//   RUN_MIGRATION=1 node scripts/backfill-lastTradingFamily.js

import admin, { adminDb } from '../src/lib/firebaseAdmin.js';

const PAGE_SIZE = 200;

const parseUidArg = () => {
  const arg = process.argv.slice(2).find(a => a.startsWith('--uid=') || a === '--uid');
  if (!arg) return null;
  if (arg.startsWith('--uid=')) return arg.split('=')[1];
  const idx = process.argv.indexOf('--uid');
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
};

const TARGET_UID = process.env.TARGET_UID || parseUidArg();

const deriveFamilyFromName = (name = '') => {
  const normalized = String(name || '').trim();
  if (!normalized) return null;
  // strip common suffixes: FOREX, CRYPTO, RIG, BOT, INVESTMENT, LIFESPAN
  const family = normalized.replace(/\s+(FOREX|CRYPTO|RIG|BOT|INVESTMENT|LIFESPAN)$/i, '').trim();
  return family || null;
};

const run = async () => {
  const doWrite = Boolean(process.env.RUN_MIGRATION);
  console.log('Backfill lastTradingFamily migration starting', { doWrite });

  let lastDoc = null;
  let processed = 0;
  let updated = 0;

  if (TARGET_UID) {
    // Single-trader mode
    const uid = TARGET_UID;
    processed = 1;
    const doc = await adminDb.collection('traders').doc(uid).get();
    if (doc.exists) {
      const data = doc.data();
      if (data.lastTradingFamily || data.lastTradingPackageName) {
        console.log('Trader already has lastTrading fields:', uid);
      } else {
        let candidateName = null;
        try {
          const sessSnap = await adminDb.collection('sessions')
            .where('traderId', '==', uid)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();
          if (!sessSnap.empty) candidateName = sessSnap.docs[0].data().planName || null;
        } catch (e) {
          console.warn('Session lookup failed for', uid, e.message);
        }

        if (!candidateName) {
          try {
            const orderSnap = await adminDb.collection('tradeOrders')
              .where('traderId', '==', uid)
              .orderBy('createdAt', 'desc')
              .limit(1)
              .get();
            if (!orderSnap.empty) candidateName = orderSnap.docs[0].data().planName || orderSnap.docs[0].data().displayName || orderSnap.docs[0].data().symbol || null;
          } catch (e) {
            console.warn('tradeOrders lookup failed for', uid, e.message);
          }
        }

        const family = candidateName ? deriveFamilyFromName(candidateName.toUpperCase()) : null;
        if (family || candidateName) {
          console.log('Would set for', uid, { candidateName, family });
          if (doWrite) {
            try {
              await adminDb.collection('traders').doc(uid).update({
                lastTradingPackageName: candidateName || null,
                lastTradingFamily: family || null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
              updated += 1;
              console.log('Updated', uid);
            } catch (err) {
              console.error('Failed to update trader', uid, err.message);
            }
          }
        } else {
          console.log('No candidate found for', uid);
        }
      }
    } else {
      console.log('Trader not found:', uid);
    }
  } else {
    while (true) {
      let query = adminDb.collection('traders').orderBy('createdAt').limit(PAGE_SIZE);
      if (lastDoc) query = query.startAfter(lastDoc);

      const snap = await query.get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        processed += 1;
        const data = doc.data();
        const uid = doc.id;

        if (data.lastTradingFamily || data.lastTradingPackageName) {
          // already populated
          continue;
        }

        // Prefer sessions (most authoritative), then tradeOrders
        let candidateName = null;

        try {
          const sessSnap = await adminDb.collection('sessions')
            .where('traderId', '==', uid)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();
          if (!sessSnap.empty) {
            const sess = sessSnap.docs[0].data();
            candidateName = sess.planName || sess.planName || null;
          }
        } catch (e) {
          console.warn('Session lookup failed for', uid, e.message);
        }

        if (!candidateName) {
          try {
            const orderSnap = await adminDb.collection('tradeOrders')
              .where('traderId', '==', uid)
              .orderBy('createdAt', 'desc')
              .limit(1)
              .get();
            if (!orderSnap.empty) {
              const ord = orderSnap.docs[0].data();
              candidateName = ord.planName || ord.displayName || ord.symbol || null;
            }
          } catch (e) {
            console.warn('tradeOrders lookup failed for', uid, e.message);
          }
        }

        const family = candidateName ? deriveFamilyFromName(candidateName.toUpperCase()) : null;

        if (family || candidateName) {
          console.log('Would set for', uid, { candidateName, family });
          if (doWrite) {
            try {
              await adminDb.collection('traders').doc(uid).update({
                lastTradingPackageName: candidateName || null,
                lastTradingFamily: family || null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
              updated += 1;
            } catch (err) {
              console.error('Failed to update trader', uid, err.message);
            }
          }
        }
      }

      lastDoc = snap.docs[snap.docs.length - 1];
      // If fewer than page, we've reached the end
      if (snap.size < PAGE_SIZE) break;
    }
  }

  console.log('Migration finished', { processed, updated });
  if (!doWrite) console.log('Dry run complete — rerun with RUN_MIGRATION=1 to apply changes.');
};

run().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
