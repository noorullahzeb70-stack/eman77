// Transactional email via the Resend HTTP API. Without an API key, emails are
// written to the server log so password-reset links still work during setup.
import type { Config } from '../config/env.ts';
import { log } from '../lib/logger.ts';

export async function sendEmail(config: Config, to: string, subject: string, text: string): Promise<boolean> {
  if (!config.email.resendApiKey || !config.email.from) {
    log.warn('email not configured — printing instead', { to, subject, text });
    if (!config.isProd && config.env !== 'test') console.log(`\n📧 Email to ${to}: ${subject}\n${text}\n`);
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${config.email.resendApiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: config.email.from, to, subject, text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) log.error('email send failed', { status: res.status, to });
    return res.ok;
  } catch (err) {
    log.error('email send error', { err, to });
    return false;
  }
}
