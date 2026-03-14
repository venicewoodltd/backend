/**
 * Production Validators
 */

export function validateProductData(data) {
  const errors = [];
  if (!data.name?.trim()) errors.push("Product name is required");
  if (data.description && data.description.length > 10000)
    errors.push("Description too long");
  if (data.longDescription && data.longDescription.length > 50000)
    errors.push("Long description too long");
  return { valid: errors.length === 0, errors };
}

export function validateSpecifications(specs) {
  if (!Array.isArray(specs))
    return { valid: false, errors: ["Specifications must be an array"] };
  for (const spec of specs) {
    if (!spec.key || !spec.value)
      return {
        valid: false,
        errors: ["Each specification needs key and value"],
      };
  }
  return { valid: true, errors: [] };
}

export function validateFeatures(features) {
  if (!Array.isArray(features))
    return { valid: false, errors: ["Features must be an array"] };
  return { valid: true, errors: [] };
}

export function sanitizeString(str) {
  if (!str || typeof str !== "string") return str;
  return str
    .replace(/&(?!amp;|lt;|gt;|quot;|#39;)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function createSlug(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export default {
  validateProductData,
  validateSpecifications,
  validateFeatures,
  sanitizeString,
  createSlug,
};
