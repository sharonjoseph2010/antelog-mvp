/**
 * Aggressive phone number normalization matching server-side logic
 * Ensures consistent format regardless of input variations
 * Final format: +[country code][number] with NO spaces
 * Example: +917829068522
 */
export function normalizePhone(phone: string): string {
  if (!phone || phone.trim() === '') return '';
  
  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // Remove leading zeros
  cleaned = cleaned.replace(/^0+/, '');
  
  // If no + at start, add country code
  if (!cleaned.startsWith('+')) {
    // If starts with 91 and has 12 digits total, just add +
    if (cleaned.startsWith('91') && cleaned.length === 12) {
      cleaned = '+' + cleaned;
    }
    // If 10 digits, add +91 (India default)
    else if (cleaned.length === 10) {
      cleaned = '+91' + cleaned;
    }
    // Otherwise just add +
    else {
      cleaned = '+' + cleaned;
    }
  }
  
  return cleaned;
}

/**
 * Format phone number for display with spaces
 * Uses normalized format as base
 * Example: +91 98765 43210
 */
export function formatPhoneForDisplay(phone: string): string {
  const normalized = normalizePhone(phone);
  if (!normalized) return '';
  
  // Format Indian numbers: +91 XXXXX XXXXX
  if (normalized.startsWith('+91') && normalized.length === 13) {
    const number = normalized.slice(3);
    return `+91 ${number.slice(0, 5)} ${number.slice(5)}`;
  }
  
  return normalized;
}
