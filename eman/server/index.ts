// EMAN server entry point.
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadDotEnv, readConfig } from './config/env.ts';
import { Database, migrate } from './db/index.ts';
import { createApp } from './app.ts';
import { log } from './lib/logger.ts';

loadDotEnv();
const config = readConfig();

// Works both from source (server/index.ts) and from the bundle (dist/server.js).
const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = existsSync(path.join(here, 'public')) ? here : path.resolve(here, '../dist');
const migrationsDir = existsSync(path.join(here, 'migrations')) ? path.join(here, 'migrations') : path.resolve(here, 'db/migrations');

const db = new Database(config.databasePath);
const applied = migrate(db, migrationsDir);
if (applied.length) log.info('migrations applied', { applied });

const app = createApp({ config, db, publicDir: path.join(distDir, 'public') });
const server = app.server();
server.requestTimeout = 0; // AI streams can be long; per-route timeouts are enforced instead.
server.headersTimeout = 30_000;
server.keepAliveTimeout = 65_000;

server.listen(config.port, () => {
  log.info('EMAN is running', { url: config.appUrl, port: config.port, env: config.env });
  if (!config.isProd) console.log(`\n  ➜  EMAN ready at http://localhost:${config.port}\n`);
});

function shutdown(signal: string) {
  log.info('shutting down', { signal });
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => log.error('unhandled rejection', { err }));
