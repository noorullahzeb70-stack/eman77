// Security primitives: password hashing, secret encryption, random tokens.
import { scrypt, randomBytes, timingSafeEqual, createCipheriv, createDecipheriv, createHash, createHmac } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

// scrypt parameters (OWASP-recommended range): N=2^15, r=8, p=1 → ~32 MiB, ~50–100 ms.
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

/** Hash a password → "scrypt$N$r$p$saltB64$hashB64". Never store plain text. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password.normalize('NFKC'), salt, KEYLEN, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

/** Constant-time password check. Returns false for malformed hashes. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scryptAsync(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A dummy hash so login timing is the same whether or not the email exists. */
let dummyHash: Promise<string> | null = null;
export function getDummyHash() {
  dummyHash ??= hashPassword(randomBytes(12).toString('hex'));
  return dummyHash;
}

/* ── Symmetric encryption for stored secrets (AI API keys) ── */
// AES-256-GCM: "v1:ivB64:tagB64:cipherB64". Authenticated, so tampering is detected.
export function encryptSecret(plain: string, key: Buffer): string {
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
}

export function decryptSecret(payload: string, key: Buffer): string {
  const [v, ivB64, tagB64, dataB64] = payload.split(':');
  if (v !== 'v1' || !ivB64 || !tagB64 || !dataB64) throw new Error('Unsupported secret format');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

/** "sk-ant-…abcd" style display: only the last 4 characters are ever shown. */
export const last4 = (secret: string) => secret.trim().slice(-4);

/* ── Tokens ── */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const hmac = (secret: string, s: string) => createHmac('sha256', secret).update(s).digest('base64url');

export function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
