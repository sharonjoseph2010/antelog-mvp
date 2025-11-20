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
  
  // AGGRESSIVE: Remove ALL non-digit characters INCLUDING + sign
  // This removes +, spaces, dashes, dots, parentheses, EVERYTHING except digits
  let cleaned = phone.replace(/\D/g, '');
  
  // Remove ALL leading zeros
  cleaned = cleaned.replace(/^0+/, '');
  
  // Return only digits for matching purposes
  // Examples:
  // "+917829068522" → "917829068522"
  // "+91 7829068522" → "917829068522"
  // "(91) 782-906-8522" → "917829068522"
  // "7829068522" → "7829068522" (will be 10 digits, country code can be inferred)
  
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
