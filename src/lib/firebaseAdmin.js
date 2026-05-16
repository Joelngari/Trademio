import dotenv from 'dotenv';
dotenv.config({ override: true });

import admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

let app;

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY;
const databaseId = process.env.FIREBASE_DATABASE_ID || process.env.VITE_FIREBASE_DATABASE_ID;

if (!admin.apps.length) {
  if (!projectId || !clientEmail || !privateKey) {
    console.error('Missing Firebase Admin environment variables:', {
      projectId: !!projectId,
      clientEmail: !!clientEmail,
      privateKey: !!privateKey
    });
  }

  try {
    if (privateKey) {
      // Handle literal \n and quotes
      privateKey = privateKey.replace(/\\n/g, '\n').replace(/"/g, '');
      
      // Fix missing dashes in BEGIN/END headers if user stripped them
      if (privateKey.includes('BEGIN PRIVATE KEY') && !privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        privateKey = privateKey.replace('BEGIN PRIVATE KEY', '-----BEGIN PRIVATE KEY-----');
      }
      if (privateKey.includes('END PRIVATE KEY') && !privateKey.includes('-----END PRIVATE KEY-----')) {
        privateKey = privateKey.replace('END PRIVATE KEY', '-----END PRIVATE KEY-----');
      }
      
      // Ensure header/footer if totally missing
      if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
         privateKey = '-----BEGIN PRIVATE KEY-----\n' + privateKey;
      }
      if (!privateKey.includes('-----END PRIVATE KEY-----')) {
         privateKey = privateKey + '\n-----END PRIVATE KEY-----\n';
      }
    }

    app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: projectId,
        clientEmail: clientEmail,
        privateKey: privateKey,
      }),
    });
    console.log('Firebase Admin initialized successfully');
  } catch (error) {
    console.error('Firebase Admin initialization error:', error.message);
  }
} else {
  app = admin.app();
}

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app, databaseId && databaseId !== '(default)' ? databaseId : undefined);

export default admin;
