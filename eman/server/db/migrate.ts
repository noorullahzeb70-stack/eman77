// `npm run db:migrate` — apply pending database migrations.
import path from 'node:path';
import { loadDotEnv, readConfig } from '../config/env.ts';
import { Database, migrate } from './index.ts';

loadDotEnv();
const config = readConfig();
const db = new Database(config.databasePath);
const ran = migrate(db, path.resolve(import.meta.dirname, 'migrations'));
console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'Database is up to date.');
db.close();
