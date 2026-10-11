// Date/time labels for "preferred" times. Dates and times are wall-clock values
// in the business time zone, so they are formatted as UTC to avoid any shift.
export function formatWhen(date, time, lang, long = true) {
  const d = new Date(`${date}T${time}:00Z`);
  return new Intl.DateTimeFormat(lang, { dateStyle: long ? 'full' : 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(d);
}

export function toTelNumber(phone) {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits;
}

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
