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
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Validate callback timestamp is recent (within 5 minutes).
 * @param {number} timestamp - Timestamp in milliseconds
 * @param {number} maxAgeSec - Max age in seconds (default: 300 = 5 minutes)
 * @returns {boolean} true if timestamp is recent
 */
export function validateTimestamp(timestamp, maxAgeSec = 300) {
  if (!timestamp) return false;
  const now = Date.now();
  const callbackAge = (now - timestamp) / 1000;
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
