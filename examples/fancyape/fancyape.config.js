// Showcase: a fully customized Pásale page, every optional feature turned on.
// This one file produces the whole page. Sample/public content only; no secrets belong here
// (the page shows this file to visitors). The default config in config/pasale.config.js stays plain.
export default {
  business: {
    name: 'Fancy Ape',
    phone: '', // left empty on purpose
    address: '', // the booth line is shown through header.location below
    publicUrl: 'https://pasale-showcase.fancyape.workers.dev/',
  },

  timezone: 'America/New_York',
  // Sample hours so the day and time picker shows. They are not real availability (see hoursNote).
  hours: { mon: null, tue: ['10:00', '17:00'], wed: ['10:00', '17:00'], thu: ['10:00', '17:00'], fri: ['10:00', '17:00'], sat: ['10:00', '17:00'], sun: null },
  slotMinutes: 60,
  daysAhead: 14,
  minNoticeHours: 2,
  blackoutDates: [],

  // Visit types. serviceSelect: 'single' makes them a pick-one choice.
  services: [
    { id: 'view', icon: 'store', label: { en: 'View artwork', es: 'Ver obras' } },
    { id: 'display', icon: 'frame', label: { en: 'Art display inquiry', es: 'Consulta de exhibición' } },
    { id: 'consult', icon: 'chat', label: { en: 'Project consultation', es: 'Consulta de proyecto' } },
  ],
  serviceSelect: 'single',

  // Optional feature: the message prompt follows the selected visit type.
  servicePrompts: {
    view: { en: 'Any pieces or styles you want to see?', es: '¿Qué obras o estilos quieres ver?' },
    display: { en: 'Tell us about your space or collection.', es: 'Cuéntanos sobre tu espacio o tu colección.' },
    consult: { en: 'What are you working on?', es: '¿En qué estás trabajando?' },
  },

  // Optional feature: up to 3 items. Images are local files in ./images (no hotlinking).
  // A missing file shows a placeholder frame. Files are served exactly as uploaded (no resizing).
  // Real titles replace "Untitled" with a one-line change each. link is optional.
  gallery: [
    { image: 'tmnk-1.jpg', title: { en: 'Untitled', es: 'Sin título' }, artist: 'Scott Andre Patterson', link: '' },
    { image: 'tmnk-2.jpg', title: { en: 'Untitled', es: 'Sin título' }, artist: 'Scott Andre Patterson', link: '' },
    { image: 'tmnk-3.jpg', title: { en: 'Untitled', es: 'Sin título' }, artist: 'Scott Andre Patterson', link: '' },
  ],
  // Optional: heading above the strip (desktop), the one-line credit under it (phones), and the collection named in alt text.
  galleryTitle: { en: 'The Me Nobody Knows — Scott Andre Patterson', es: 'The Me Nobody Knows — Scott Andre Patterson' },
  galleryCredit: { en: 'Scott Andre Patterson · TMNK', es: 'Scott Andre Patterson · TMNK' },
  galleryCollection: { en: 'The Me Nobody Knows (TMNK)', es: 'The Me Nobody Knows (TMNK)' },

  // Optional feature: theme tokens, applied as CSS variables. Archival palette. Every token is optional.
  // accentSecondary (brass) is for non-text only: rules, the heading underline and focus rings.
  theme: {
    background: '#F4F0E7',
    surface: '#FAF8F2',
    text: '#252521',
    textMuted: '#68645C', // section labels and supporting text
    border: '#D6D0C4', // cards, panels and dividers
    accent: '#495A50', // deep green: main button, selected card, icons
    accentHover: '#37443D',
    accentSecondary: '#9A7C48',
    notice: '#EEE5CF', // demo banner
    noticeText: '#3B342A',
    footer: '#EAE4D8',
  },

  // Optional feature: a note about the hours, shown directly above the day picker (and instead of the hours when they are unset).
  hoursNote: { en: 'Sample hours for this demo — not real availability.', es: 'Horario de ejemplo para esta demo — no es disponibilidad real.' },

  // Optional feature: 'compact' gives a quieter header and smaller visit-type cards. Theme changes colors only.
  layout: 'compact',

  // Optional feature: footer line.
  attribution: { en: 'Scheduling powered by Pásale.', es: 'Citas con tecnología de Pásale.' },

  // Optional feature: header. The headline (copy.title) becomes the page's top heading, with `line`
  // under it, then `subline`, then `location` as the place line.
  header: {
    line: { en: 'Fancy Ape · Studio & Gallery · Melbourne, FL', es: 'Fancy Ape · Estudio y Galería · Melbourne, FL' },
    subline: { en: 'Produced by The Composition Group', es: 'Producido por The Composition Group' },
    location: { en: "Retail at America's Antique Mall, Booth 117", es: "Venta en America's Antique Mall, puesto 117" },
  },

  // Optional feature: "How this page is built" shows this file, read-only. Requires demo: true.
  showConfig: true,

  languages: ['en', 'es'],
  defaultLanguage: 'en',
  followUp: { en: '', es: '' },
  responseWindow: { en: '', es: '' },

  delivery: { type: 'webhook' }, // unused while demo is true
  showCredit: false,
  demo: true, // nothing is sent or saved; the confirmation is shown locally

  security: { rateLimit: { max: 5, windowMinutes: 60 }, trustProxy: false },

  copy: {
    en: {
      title: 'Art is better in person.',
      formTitle: 'Request a visit',
      intro: 'Request a visit to see work in person. This is a demo of a Pásale page.',
      whatHintSingle: 'Pick the kind of visit.',
      privacy: 'Your details are used only to respond to your request.',
      submit: 'Request a visit — Demo',
      demoBanner: 'Demo experience — no requests are sent or saved.',
      demoTicket: 'Demo: nothing was sent. A real page would pass this request to the business.',
      ticketTitle: 'Visit requested',
      ticketStatus: 'Requested — not confirmed',
      galleryPlaceholder: 'Artwork image',
      labelAddress: 'Find us',
      credit: '',
    },
    es: {
      title: 'El arte es mejor en persona.',
      formTitle: 'Solicitar una visita',
      intro: 'Solicita una visita para ver obras en persona. Esta es una demo de Pásale.',
      whatHintSingle: 'Elige el tipo de visita.',
      privacy: 'Usamos tus datos solo para responder a tu solicitud.',
      submit: 'Solicitar una visita — Demo',
      demoBanner: 'Experiencia de demostración: no se envía ni se guarda ninguna solicitud.',
      demoTicket: 'Demostración: no se envió nada. Una página real pasaría esta solicitud al negocio.',
      ticketTitle: 'Visita solicitada',
      ticketStatus: 'Solicitada — sin confirmar',
      galleryPlaceholder: 'Imagen de la obra',
      labelAddress: 'Dónde estamos',
      credit: '',
    },
  },
};
