import crypto from 'crypto';

/**
 * Verify HMAC-SHA256 signature on payment callback.
 * @param {string} payload - JSON payload as string
 * @param {string} signature - Signature header value
 * @param {string} secret - DARAJA_CALLBACK_SECRET
 * @returns {boolean} true if signature is valid
 */
export function verifyCallbackSignature(payload, signature, secret) {
  if (!secret || !signature) return false;
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const signatureBuffer = Buffer.from(signature || '', 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

/**
 * Validate callback timestamp is recent (within 5 minutes).
 * @param {number} timestamp - Timestamp in milliseconds
 * @param {number} maxAgeSec - Max age in seconds (default: 300 = 5 minutes)
 * @returns {boolean} true if timestamp is recent
 */
export function validateTimestamp(timestamp, maxAgeSec = 300) {
  if (!timestamp) return false;

  let ts = timestamp;
  if (typeof ts === 'string') {
    if (/^\d{14}$/.test(ts)) {
      ts = Date.parse(`${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}Z`);
    } else {
      ts = Number(ts);
    }
  }

  if (typeof ts === 'number' && ts < 1e12) {
    ts = ts * 1000;
  }

  if (Number.isNaN(ts)) return false;

  const now = Date.now();
  const callbackAge = (now - ts) / 1000;
  return callbackAge >= 0 && callbackAge <= maxAgeSec;
}

/**
 * Check if callback ID has been processed (idempotency).
 * @param {*} db - Firestore database instance
 * @param {string} callbackId - Unique callback identifier
 * @returns {Promise<boolean>} true if already processed
 */
export async function isCallbackProcessed(db, callbackId) {
  const doc = await db
    .collection('processedCallbacks')
    .doc(callbackId)
    .get();
  return doc.exists;
}

/**
 * Mark callback ID as processed.
 * @param {*} db - Firestore database instance
 * @param {string} callbackId - Unique callback identifier
 * @returns {Promise<void>}
 */
export async function markCallbackProcessed(db, callbackId) {
  await db
    .collection('processedCallbacks')
    .doc(callbackId)
    .set({ processedAt: new Date().toISOString() });
}
