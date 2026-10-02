import { openDatabase } from '../../src/storage/database.js';
import { SqliteDraftStore, SqliteSeenStore, SqliteSubscriptionStore, SqliteUserStore } from '../../src/storage/sqlite.js';

/** Almacenes sobre una base de datos SQLite en memoria, nueva en cada llamada. */
export function createStores(maxSeen?: number) {
  const db = openDatabase(':memory:');
  return {
    db,
    subscriptions: new SqliteSubscriptionStore(db),
    seen: new SqliteSeenStore(db, maxSeen),
    users: new SqliteUserStore(db),
    drafts: new SqliteDraftStore(db),
  };
}
