import { formatWhen, toTelNumber, escapeHtml } from './format.js';

export class DeliveryError extends Error {}

const TIMEOUT_MS = 8000;
const RESEND_URL = 'https://api.resend.com/emails';

const SMS_BODY = {
  en: ({ name, business, ref, when }) => `Hi ${name}, this is ${business}. Your visit request ${ref} for ${when} is confirmed. See you then!`,
  es: ({ name, business, ref, when }) => `Hola ${name}, te escribe ${business}. Tu visita ${ref} para el ${when} está confirmada. ¡Te esperamos!`,
};

// Everything the owner needs, as plain data. Used for the email and the webhook.
export function describeRequest(req, config, ref) {
  const ownerLang = config.defaultLanguage;
  const label = (s) => s.label[ownerLang] ?? s.label.en ?? s.id;
  const tel = toTelNumber(req.phone);
  const customerWhen = formatWhen(req.date, req.time, req.language);
  const sms = SMS_BODY[req.language] ?? SMS_BODY.en;
  const smsBody = sms({ name: req.name, business: config.business.name, ref, when: customerWhen });
  return {
    ref,
    services: req.services.map((s) => ({ id: s.id, label: label(s) })),
    when: `${formatWhen(req.date, req.time, ownerLang)} (${config.timezone})`,
    telLink: `tel:${tel}`,
    smsLink: req.consent ? `sms:${tel}?&body=${encodeURIComponent(smsBody)}` : null,
    smsBody,
  };
}

export function buildEmail(req, config, ref) {
  const d = describeRequest(req, config, ref);
  const services = d.services.map((s) => s.label).join(', ');
  const consentLine = req.consent ? 'OK to text: yes' : 'OK to text: NO. Please call instead.';
  const text = [
    `New visit request ${ref}`,
    '',
    `Name: ${req.name}`,
    `Phone: ${req.phone}`,
    `What: ${services}`,
    `Preferred time: ${d.when}`,
    req.note ? `Note: ${req.note}` : null,
    `Customer language: ${req.language}`,
    consentLine,
    '',
    `Call: ${d.telLink}`,
    d.smsLink ? `Text (prefilled confirmation): ${d.smsLink}` : null,
    '',
    'This is a preferred time only. Nothing is booked until you confirm with the customer.',
  ].filter((x) => x !== null).join('\n');

  const e = escapeHtml;
  const link = (href, label) => `<a href="${e(href)}" style="display:inline-block;margin:4px 8px 4px 0;padding:10px 14px;border-radius:6px;background:#14533f;color:#fff;text-decoration:none">${e(label)}</a>`;
  const html = `<div style="font:16px/1.5 system-ui,sans-serif;color:#1d2327;max-width:520px">
<p style="font-size:20px;margin:0 0 4px"><strong>New visit request ${e(ref)}</strong></p>
<p style="margin:0 0 12px;color:#5b6670">Preferred time only. Nothing is booked until you confirm.</p>
<p style="margin:0"><strong>${e(req.name)}</strong> &middot; ${e(req.phone)}</p>
<p style="margin:0">${e(services)}</p>
<p style="margin:0">${e(d.when)}</p>
${req.note ? `<p style="margin:8px 0 0">Note: ${e(req.note)}</p>` : ''}
<p style="margin:8px 0 12px;color:#5b6670">${e(consentLine)} &middot; Customer language: ${e(req.language)}</p>
<p style="margin:0">${link(d.telLink, 'Call')}${d.smsLink ? link(d.smsLink, 'Text confirmation') : ''}</p>
</div>`;

  return { subject: `${ref} · Visit request · ${req.name} · ${formatWhen(req.date, req.time, config.defaultLanguage, false)}`, text, html };
}

async function send(url, init) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new DeliveryError('network');
  }
  if (!res.ok) throw new DeliveryError(`status ${res.status}`);
}

// Resolves once the provider (or webhook) accepted the request with a 2xx.
// That means "accepted", not "reached the inbox". Throws DeliveryError otherwise.
export async function deliver(req, config, env, ref) {
  const d = config.delivery;
  if (d.type === 'resend') {
    const { subject, text, html } = buildEmail(req, config, ref);
    return send(env.RESEND_API_URL || RESEND_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify({ from: d.from, to: [config.business.ownerEmail], subject, text, html }),
    });
  }
  const info = describeRequest(req, config, ref);
  const { text } = buildEmail(req, config, ref);
  return send(env.PASALE_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'visit_request',
      ref,
      business: config.business.name,
      name: req.name,
      phone: req.phone,
      services: info.services,
      preferred: { date: req.date, time: req.time, timeZone: config.timezone },
      note: req.note,
      consentToText: req.consent,
      language: req.language,
      text,
      content: text, // for chat-style webhooks
    }),
  });
}
