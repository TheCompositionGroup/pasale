const CONTROL = /[\u0000-\u001f\u007f]/;
const ATTEMPT_ID = /^[A-Za-z0-9-]{16,64}$/;
const str = (v) => (typeof v === 'string' ? v.trim() : '');

// Returns { ok: true, value } or { ok: false, fields }.
// `days` (from computeDays) is the only source of truth for allowed dates/times.
export function validateRequest(body, config, days) {
  const fields = {};
  const b = body && typeof body === 'object' ? body : {};

  const rawName = str(b.name);
  const name = rawName.replace(/ +/g, ' ');
  if (!name || name.length > 100 || CONTROL.test(rawName)) fields.name = true;

  const phone = str(b.phone);
  const digits = phone.replace(/\D/g, '');
  if (phone.length > 30 || !/^[+()\d\s.-]+$/.test(phone) || digits.length < 7 || digits.length > 15) fields.phone = true;

  const ids = Array.isArray(b.services) ? [...new Set(b.services)] : [];
  const services = ids.map((id) => config.services.find((s) => s.id === id));
  if (!ids.length || ids.length > config.services.length || services.includes(undefined)) fields.services = true;

  const day = days.find((d) => d.date === b.date);
  if (!day) fields.date = true;
  else if (!day.slots.includes(b.time)) fields.time = true;

  // Optional free text. Newlines become spaces; other control characters are refused.
  const rawNote = str(b.note).replace(/\r?\n/g, ' ');
  if (rawNote.length > 300 || CONTROL.test(rawNote)) fields.note = true;

  const language = config.languages.includes(b.language) ? b.language : config.defaultLanguage;
  const attemptId = ATTEMPT_ID.test(b.attemptId ?? '') ? b.attemptId : null;
  if (!attemptId) fields.attemptId = true;

  if (Object.keys(fields).length) return { ok: false, fields };
  return {
    ok: true,
    value: { name, phone, services, date: b.date, time: b.time, note: rawNote, consent: b.consent === true, language, attemptId },
  };
}
