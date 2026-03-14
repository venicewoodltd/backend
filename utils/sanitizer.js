/**
 * Production Input Sanitizer
 */

export function sanitizeInput(input, maxLength = 10000) {
  if (!input || typeof input !== "string") return input;
  let sanitized = input;
  // Strip HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, "");
  // Remove javascript: and data: protocol patterns
  sanitized = sanitized.replace(/javascript\s*:/gi, "");
  sanitized = sanitized.replace(/data\s*:[^,]*,/gi, "");
  // Remove event handler patterns (onclick, onerror, onload, etc.)
  sanitized = sanitized.replace(/\bon\w+\s*=/gi, "");
  if (sanitized.length > maxLength) sanitized = sanitized.slice(0, maxLength);
  return sanitized.trim();
}

export function validateEmail(email) {
  if (!email || typeof email !== "string") return false;
  if (email.length > 254) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateUrl(url) {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export default { sanitizeInput, validateEmail, validateUrl };
