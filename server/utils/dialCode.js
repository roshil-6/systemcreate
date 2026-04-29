/**
 * Normalize dial / country calling codes for storage. Trims whitespace only;
 * preserves empty values (no default to +91).
 */
function normalizeDialCode(val) {
  if (val === undefined || val === null) return '';
  return String(val).trim();
}

module.exports = { normalizeDialCode };
