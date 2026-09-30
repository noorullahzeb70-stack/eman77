// Make an existing account an administrator:
//   npm run admin:create -- someone@example.com
// (The first account ever registered becomes admin automatically.)
import { loadDotEnv, readConfig } from '../server/config/env.ts';
import { Database } from '../server/db/index.ts';

loadDotEnv();
const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) {
  console.error('Usage: npm run admin:create -- email@example.com');
  process.exit(1);
}
const db = new Database(readConfig().databasePath);
const r = db.run("UPDATE users SET role = 'admin', status = 'active' WHERE email = ?", [email]);
if (!r.changes) {
  console.error(`No account found for ${email}. Register on the website first, then run this again.`);
  process.exit(1);
}
console.log(`${email} is now an administrator.`);
db.close();
