// Creates a .env file with freshly generated secrets (used by START-EMAN.bat / start.sh).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const envPath = path.join(root, '.env');
if (existsSync(envPath)) {
  console.log('.env already exists — keeping it.');
  process.exit(0);
}
let text = readFileSync(path.join(root, '.env.example'), 'utf8');
const set = (k, v) => { text = text.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`); };
set('NODE_ENV', 'development');
set('AUTH_SECRET', randomBytes(32).toString('hex'));
set('ENCRYPTION_KEY', randomBytes(32).toString('hex'));
writeFileSync(envPath, text);
console.log('Created .env with new secret keys. Keep this file private and back it up.');
