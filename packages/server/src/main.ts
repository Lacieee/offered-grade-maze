/**
 * Server entry point: configuration, migrations, then listen (CP07 T1, T2, T7).
 */
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase, runMigrations } from './db/client.js';
import { scheduleExpiry } from './jobs/expiry.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const database = openDatabase(config.DATABASE_URL);
  const { app } = await buildApp({ config, db: database.db });
  try {
    await runMigrations(database.db);
    app.log.info({ event: 'db.migrated' }, 'db.migrated');
  } catch (err) {
    app.log.fatal({ err }, 'database migration failed');
    await database.close();
    process.exit(1);
  }
  const stopExpiry = scheduleExpiry(database.db, app.log);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    stopExpiry();
    await app.close();
    await database.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
