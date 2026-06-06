import { paymentApi } from '../services/api.js';

export function watchPaymentStatus(checkoutRequestId, onStatus) {
  if (!checkoutRequestId) return () => {};

  let stopped = false;
  let intervalId = null;

  const checkStatus = async () => {
    if (stopped) return;

    try {
      const response = await paymentApi.getPaymentStatus(checkoutRequestId);
      const status = response?.data?.status || 'pending';
      onStatus?.(status, response?.data?.transaction);

      if (status === 'success' || status === 'failed') {
        clearInterval(intervalId);
      }
    } catch (error) {
      // Ignore transient polling errors and keep trying.
    }
  };

  checkStatus();
  intervalId = window.setInterval(checkStatus, 4000);

  return () => {
    stopped = true;
    if (intervalId) clearInterval(intervalId);
  };
}
