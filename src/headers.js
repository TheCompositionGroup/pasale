// Same policy for every host. public/_headers repeats these for Cloudflare's
// static files; a test keeps the two in sync.
export const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'geolocation=(), camera=(), microphone=()',
};
