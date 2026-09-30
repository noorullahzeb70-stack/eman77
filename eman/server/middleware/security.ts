// Security headers applied to every response.
import type { ServerResponse } from 'node:http';

export function securityHeaders(res: ServerResponse, isProd: boolean) {
  const csp = [
    "default-src 'self'",
    // No inline scripts except the theme loader in index.html, allowed by its exact SHA-256 hash.
    "script-src 'self' 'sha256-THEME_SCRIPT_HASH'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isProd ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
  res.setHeader('Content-Security-Policy', csp.replace('THEME_SCRIPT_HASH', themeScriptHash));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (isProd) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
}

/** Set at startup from the built index.html so CSP allows exactly that inline script. */
let themeScriptHash = '';
export function setThemeScriptHash(h: string) {
  themeScriptHash = h;
}
