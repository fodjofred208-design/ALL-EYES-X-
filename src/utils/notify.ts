import { apiFetch } from './api';

/**
 * Send a notification to the backend system
 */
export const notifySystem = async (type: string, message: string) => {
  try {
    await apiFetch('/api/notify', {
      method: 'POST',
      body: JSON.stringify({ type, message }),
    });
    type NotificationType = 'success' | 'error' | 'info' | 'warning';

(
  title: string,
  message: string,
  type: NotificationType = 'info'
): void => {
  // Dispatch a custom DOM event that any notification UI component can pick up
  const event = new CustomEvent('system-notification', {
    detail: { title, message, type, timestamp: new Date().toISOString() },
  });
  window.dispatchEvent(event);

  // Also log to console for debugging
  const icon = { success: '✓', error: '✗', info: 'ℹ', warning: '⚠' }[type];
  console.log(`[${icon}] ${title}: ${message}`);
};
  } catch {
    // Silent — notification is non-critical
    
  }
};

/**
 * Toast notification (local display, not sent to backend)
 */
export const showToast = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
  // Dispatch a custom event for the notification center component
  const event = new CustomEvent('toast', {
    detail: { message, type, timestamp: Date.now() },
  });
  window.dispatchEvent(event);
};
