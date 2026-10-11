// The only file a business edits. Secrets (API keys) go in environment
// variables, never here. See README.md. Sample data only.
export default {
  business: {
    name: 'Sample Showroom',
    phone: '(555) 010-0000',
    address: '100 Example Street, Anytown, ST 00000',
    ownerEmail: 'owner@example.com', // where requests are sent; never shown to customers
    publicUrl: 'https://pasale.fancyape.workers.dev/', // the page customers open; the /sign QR code points here
  },

  timezone: 'America/New_York', // IANA name, e.g. 'America/Chicago'

  // Times are 24-hour "HH:MM". Use null for a closed day.
  hours: {
    mon: ['09:00', '17:00'],
    tue: ['09:00', '17:00'],
    wed: ['09:00', '17:00'],
    thu: ['09:00', '17:00'],
    fri: ['09:00', '17:00'],
    sat: ['10:00', '14:00'],
    sun: null,
  },
  slotMinutes: 60,
  daysAhead: 14,
  minNoticeHours: 2, // customers can't ask for a time sooner than this
  // Single dates ('2026-12-25') or ranges ({ from: '2026-07-01', to: '2026-07-07' })
  blackoutDates: [],

  // icon is optional: store, box, chat, scissors, wrench, heart, document, car or frame.
  // Every service needs a label in each language.
  services: [
    { id: 'browse', icon: 'store', label: { en: 'Look around', es: 'Ver el local' } },
    { id: 'pickup', icon: 'box', label: { en: 'Pick up an order', es: 'Recoger un pedido' } },
    { id: 'advice', icon: 'chat', label: { en: 'Talk to someone', es: 'Hablar con alguien' } },
  ],

  languages: ['en', 'es'],
  defaultLanguage: 'en',

  // What customers read on the ticket when they have not heard back. Optional.
  followUp: { en: "Haven't heard back? Call us.", es: '¿No te han respondido? Llámanos.' },
  // Optional. Leave empty if you don't want to promise a reply time.
  responseWindow: { en: '', es: '' }, // e.g. { en: 'We usually reply within 1 business day.', es: 'Casi siempre respondemos en 1 día hábil.' }

  // How requests reach you. 'resend' = email (RESEND_API_KEY) or 'webhook' (PASALE_WEBHOOK_URL).
  // "Sent" means the provider accepted the message, not that it reached the inbox.
  delivery: { type: 'resend', from: 'Pásale <onboarding@resend.dev>' },

  showCredit: true, // small "Made with Pásale" footer on the form (never on the ticket)
  creditUrl: 'https://www.fancyape.com/projects',

  demo: false, // or set DEMO_MODE=true. Shows a demo banner; nothing is sent or stored.

  security: {
    rateLimit: { max: 5, windowMinutes: 60 }, // per visitor, approximate (see README)
    trustProxy: false, // Node server only: true behind exactly one proxy
  },

  // Optional text overrides per language (see src/defaults.js for every key).
  copy: { en: {}, es: {} },
};
