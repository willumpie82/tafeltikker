/**
 * PUBLIC_BASE_URL should be set once this instance is reachable at a real
 * domain (e.g. https://tafeltikker.oldemans.nl) behind the reverse proxy —
 * otherwise invite links would embed whatever host/port the admin happened
 * to load admin.html from (fine for LAN-only use, wrong once exposed).
 */
export function baseUrl(request: { protocol: string; headers: { host?: string } }): string {
  // `||`, not `??` — an unset .env value still comes through as "" (empty
  // string, not undefined), which `??` would treat as a deliberate value
  // and use verbatim, silently turning every generated link relative.
  return process.env.PUBLIC_BASE_URL || `${request.protocol}://${request.headers.host}`;
}
