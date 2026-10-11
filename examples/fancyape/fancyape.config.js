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
  // Hours left empty (every day closed). With hoursNote set, the demo lets visitors request a visit without picking a time.
  hours: { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null },
  slotMinutes: 60,
  daysAhead: 14,
  minNoticeHours: 2,
  blackoutDates: [],

  // Visit types. serviceSelect: 'single' makes them a pick-one choice.
  services: [
    { id: 'view', icon: 'store', label: { en: 'View artwork', es: 'Ver obras' } },
    { id: 'display', icon: 'box', label: { en: 'Art display inquiry', es: 'Consulta para exhibir arte' } },
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
  // A missing file shows a placeholder frame. Add your own files, then name them here.
  gallery: [
    { image: '', title: { en: 'Artwork 1', es: 'Obra 1' }, link: '' },
    { image: '', title: { en: 'Artwork 2', es: 'Obra 2' }, link: '' },
    { image: '', title: { en: 'Artwork 3', es: 'Obra 3' }, link: '' },
  ],

  // Optional feature: theme tokens, applied as CSS variables. Ivory and deep forest green.
  theme: { background: '#f6f1e3', surface: '#fffdf6', accent: '#1f4d3a', text: '#1e2a24' },

  // Optional feature: shown while hours are unset.
  hoursNote: { en: 'Hours: set by business', es: 'Horario: lo define el negocio' },

  // Optional feature: footer line.
  attribution: { en: 'Scheduling powered by Pásale.', es: 'Citas con tecnología de Pásale.' },

  // Optional feature: header. The headline (copy.title) becomes the page's top heading, with `line`
  // under it, then `subline`, then `location` as the place line.
  header: {
    line: { en: 'Fancy Ape · Studio & Gallery · Melbourne, FL', es: 'Fancy Ape · Estudio y Galería · Melbourne, FL' },
    subline: { en: 'Produced by The Composition Group', es: 'Producido por The Composition Group' },
    location: { en: "Retail at America's Antique Mall, Booth 117", es: "Venta al público en America's Antique Mall, puesto 117" },
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
      intro: 'Solicita una visita para ver las obras en persona. Esta es una demostración de una página Pásale.',
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
