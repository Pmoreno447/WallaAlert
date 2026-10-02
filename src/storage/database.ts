import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Cambios del esquema, en orden. La versión aplicada se guarda en `PRAGMA user_version`,
 * así que al abrir la base de datos solo se ejecutan los que falten.
 * Nunca se modifica una migración ya publicada: los cambios nuevos van al final.
 */
export const MIGRATIONS: string[] = [
  // 1: esquema inicial
  `
  CREATE TABLE IF NOT EXISTS subscriptions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    term       TEXT NOT NULL,
    filters    TEXT NOT NULL DEFAULT '{}', -- JSON con SearchFilters
    created_at INTEGER NOT NULL            -- timestamp en milisegundos
  );
  CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);

  -- Suscripciones que ya tienen línea base (se comprobaron al menos una vez).
  CREATE TABLE IF NOT EXISTS seen_initialized (
    subscription_id TEXT PRIMARY KEY REFERENCES subscriptions(id) ON DELETE CASCADE
  );

  -- Productos vistos por cada suscripción. El rowid indica el orden: cuanto más alto, más reciente.
  CREATE TABLE IF NOT EXISTS seen_items (
    subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    item_id         TEXT NOT NULL,
    PRIMARY KEY (subscription_id, item_id)
  );
  `,
  // 2: pausar suscripciones
  `
  ALTER TABLE subscriptions ADD COLUMN paused INTEGER NOT NULL DEFAULT 0; -- 0 activa, 1 pausada
  `,
  // 3: usuarios del bot y búsquedas a medio crear
  `
  CREATE TABLE users (
    id           TEXT PRIMARY KEY, -- id de usuario de Telegram
    username     TEXT,
    first_name   TEXT,
    status       TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_at INTEGER NOT NULL,
    decided_at   INTEGER
  );

  CREATE TABLE search_drafts (
    user_id    TEXT PRIMARY KEY,
    data       TEXT NOT NULL, -- JSON con SearchDraft
    updated_at INTEGER NOT NULL
  );
  `,
];

function migrate(db: DatabaseSync): void {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let version = current + 1; version <= MIGRATIONS.length; version++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[version - 1]!);
      db.exec(`PRAGMA user_version = ${version}`);
    });
  }
}

/**
 * Abre (o crea) la base de datos SQLite y aplica las migraciones pendientes.
 * @param path Ruta del archivo, o ":memory:" para una base de datos temporal.
 */
export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new DatabaseSync(path);
  // WAL permite leer mientras otro proceso escribe (p. ej. el monitor y el CLI a la vez).
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

/** Ejecuta `fn` dentro de una transacción: si lanza un error, se deshacen todos los cambios. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
