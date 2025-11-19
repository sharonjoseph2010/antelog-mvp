/**
 * BULLETPROOF phone number normalization matching server-side logic
 * Ensures consistent format regardless of input variations
 * Removes ALL spaces, dashes, dots, parentheses, and special characters
 * Final format: +[country code][number] with NO spaces, NO special chars
 * Examples that ALL become +917829068522:
 * - "+91 7829068522"
 * - "+917829068522" 
 * - "917829068522"
 * - "7829068522"
 * - "07829068522"
 * - "+91-7829-068522"
 * - "(+91) 7829 068522"
 */
export function normalizePhone(phone: string): string {
  if (!phone || phone.trim() === '') return '';
  
  // AGGRESSIVE: Remove ALL non-digit characters except +
  // This removes spaces, dashes, dots, parentheses, EVERYTHING
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // Remove ALL leading zeros
  cleaned = cleaned.replace(/^0+/, '');
  
  // If already has +, ensure format is correct
  if (cleaned.startsWith('+')) {
    // Remove any + signs that aren't at the start
    const digitsOnly = cleaned.substring(1).replace(/[^\d]/g, '');
    cleaned = '+' + digitsOnly;
  } else {
    // No + prefix, add country code logic
    // If starts with 91 and has 12 digits total, just add +
    if (cleaned.startsWith('91') && cleaned.length === 12) {
      cleaned = '+' + cleaned;
    }
    // If exactly 10 digits, add +91 (India default)
    else if (cleaned.length === 10) {
      cleaned = '+91' + cleaned;
    }
    // If 11 digits starting with 1 (US/Canada), add +
    else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      cleaned = '+' + cleaned;
    }
    // Otherwise just add + prefix
    else {
      cleaned = '+' + cleaned;
    }
  }
  
  // Final cleanup: ensure no spaces or special characters remain
  cleaned = cleaned.replace(/[^\d+]/g, '');
  
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
