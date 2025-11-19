/**
 * Normalize phone number to E.164 format
 * E.164 format: +[country code][subscriber number]
 * Example: +919876543210
 */
export function normalizePhone(phone: string): string {
  if (!phone) return '';
  
  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\\d+]/g, '');
  
  // If already has + at start, return as is
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  
  // If starts with 91 (India) and is 12 digits, add +
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    return '+' + cleaned;
  }
  
  // If 10 digits, assume India and add +91
  if (cleaned.length === 10) {
    return '+91' + cleaned;
  }
  
  // Otherwise add + if not present
  return '+' + cleaned;
}

/**
 * Format phone number for display with spaces
 * Example: +91 98765 43210
 */
export function formatPhoneForDisplay(phone: string): string {
  const normalized = normalizePhone(phone);
  if (!normalized) return '';
  
  // Format Indian numbers: +91 XXXXX XXXXX
  if (normalized.startsWith('+91')) {
    const number = normalized.slice(3);
    if (number.length === 10) {
      return `+91 ${number.slice(0, 5)} ${number.slice(5)}`;
    }
  }
  
  return normalized;
}
