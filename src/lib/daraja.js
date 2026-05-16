import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const {
  DARAJA_CONSUMER_KEY,
  DARAJA_CONSUMER_SECRET,
  DARAJA_SHORTCODE,
  DARAJA_PASSKEY,
  DARAJA_CALLBACK_URL,
  DARAJA_B2C_SHORTCODE,
  DARAJA_B2C_INITIATOR_NAME,
  DARAJA_B2C_SECURITY_CREDENTIAL,
  DARAJA_B2C_RESULT_URL,
  NODE_ENV
} = process.env;

const BASE_URL = NODE_ENV === 'production' 
  ? 'https://api.safaricom.co.ke' 
  : 'https://sandbox.safaricom.co.ke';

export async function getAccessToken() {
  const auth = Buffer.from(`${DARAJA_CONSUMER_KEY}:${DARAJA_CONSUMER_SECRET}`).toString('base64');
  try {
    const response = await axios.get(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${auth}` }
    });
    return response.data.access_token;
  } catch (error) {
    console.error('Daraja Access Token Error:', error.response?.data || error.message);
    throw new Error('Failed to get Daraja access token');
  }
}

export async function initiateStkPush(phoneNumber, amount, accountReference, transactionDesc) {
  const accessToken = await getAccessToken();
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const password = Buffer.from(`${DARAJA_SHORTCODE}${DARAJA_PASSKEY}${timestamp}`).toString('base64');

  const payload = {
    BusinessShortCode: DARAJA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.round(amount),
    PartyA: phoneNumber,
    PartyB: DARAJA_SHORTCODE,
    PhoneNumber: phoneNumber,
    CallBackURL: DARAJA_CALLBACK_URL,
    AccountReference: accountReference,
    TransactionDesc: transactionDesc
  };

  try {
    const response = await axios.post(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, payload, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.data;
  } catch (error) {
    console.error('STK Push Error:', error.response?.data || error.message);
    throw error;
  }
}

export async function initiateB2C(phoneNumber, amount, remarks, occasion, callbackUrl) {
  const accessToken = await getAccessToken();

  const payload = {
    InitiatorName: DARAJA_B2C_INITIATOR_NAME,
    SecurityCredential: DARAJA_B2C_SECURITY_CREDENTIAL,
    CommandID: 'BusinessPayment',
    Amount: Math.round(amount),
    PartyA: DARAJA_B2C_SHORTCODE,
    PartyB: phoneNumber,
    Remarks: remarks,
    QueueTimeOutURL: callbackUrl,
    ResultURL: callbackUrl,
    Occasion: occasion
  };

  try {
    const response = await axios.post(`${BASE_URL}/mpesa/b2c/v1/paymentrequest`, payload, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.data;
  } catch (error) {
    console.error('B2C Error:', error.response?.data || error.message);
    throw error;
  }
}
