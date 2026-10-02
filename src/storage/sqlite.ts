import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { NewSubscription, NewUser, SearchDraft, Subscription, User, UserStatus } from '../types.js';
import type { SearchFilters } from '../wallapop/types.js';
import { transaction } from './database.js';
import type { DraftStore, SeenStore, SubscriptionStore, UserStore } from './types.js';

interface SubscriptionRow {
  id: string;
  user_id: string;
  term: string;
  filters: string;
  paused: number;
}

function toSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    userId: row.user_id,
    term: row.term,
    filters: JSON.parse(row.filters) as SearchFilters,
    paused: row.paused === 1,
  };
}

export class SqliteSubscriptionStore implements SubscriptionStore {
  constructor(private readonly db: DatabaseSync) {}

  async add(data: NewSubscription): Promise<Subscription> {
    const subscription: Subscription = { ...data, id: randomUUID(), paused: false };
    this.db
      .prepare('INSERT INTO subscriptions (id, user_id, term, filters, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(subscription.id, subscription.userId, subscription.term, JSON.stringify(subscription.filters), Date.now());
    return subscription;
  }

  async remove(id: string): Promise<boolean> {
    const { changes } = this.db.prepare('DELETE FROM subscriptions WHERE id = ?').run(id);
    return changes > 0;
  }

  async get(id: string): Promise<Subscription | undefined> {
    const row = this.db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id) as SubscriptionRow | undefined;
    return row && toSubscription(row);
  }

  async list(): Promise<Subscription[]> {
    const rows = this.db.prepare('SELECT * FROM subscriptions ORDER BY created_at, rowid').all() as unknown as SubscriptionRow[];
    return rows.map(toSubscription);
  }

  async listActive(): Promise<Subscription[]> {
    const rows = this.db
      .prepare('SELECT * FROM subscriptions WHERE paused = 0 ORDER BY created_at, rowid')
      .all() as unknown as SubscriptionRow[];
    return rows.map(toSubscription);
  }

  async listByUser(userId: string): Promise<Subscription[]> {
    const rows = this.db
      .prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at, rowid')
      .all(userId) as unknown as SubscriptionRow[];
    return rows.map(toSubscription);
  }

  async setPaused(id: string, paused: boolean): Promise<Subscription | undefined> {
    this.db.prepare('UPDATE subscriptions SET paused = ? WHERE id = ?').run(paused ? 1 : 0, id);
    return this.get(id);
  }
}

export class SqliteSeenStore implements SeenStore {
  constructor(
    private readonly db: DatabaseSync,
    private readonly maxPerSubscription = 500,
  ) {}

  async isInitialized(subscriptionId: string): Promise<boolean> {
    return this.db.prepare('SELECT 1 FROM seen_initialized WHERE subscription_id = ?').get(subscriptionId) !== undefined;
  }

  async filterUnseen(subscriptionId: string, itemIds: string[]): Promise<string[]> {
    if (itemIds.length === 0) return [];
    const rows = this.db
      .prepare('SELECT item_id FROM seen_items WHERE subscription_id = ? AND item_id IN (SELECT value FROM json_each(?))')
      .all(subscriptionId, JSON.stringify(itemIds)) as { item_id: string }[];
    const seen = new Set(rows.map((row) => row.item_id));
    return itemIds.filter((id) => !seen.has(id));
  }

  async markSeen(subscriptionId: string, itemIds: string[]): Promise<void> {
    // INSERT OR REPLACE borra la fila existente y crea una nueva con un rowid mayor,
    // así un id que se vuelve a ver pasa a contar como reciente.
    const insert = this.db.prepare('INSERT OR REPLACE INTO seen_items (subscription_id, item_id) VALUES (?, ?)');

    transaction(this.db, () => {
      this.db.prepare('INSERT OR IGNORE INTO seen_initialized (subscription_id) VALUES (?)').run(subscriptionId);
      for (const id of itemIds) {
        insert.run(subscriptionId, id);
      }
      this.db
        .prepare(
          `DELETE FROM seen_items WHERE subscription_id = ? AND rowid NOT IN (
             SELECT rowid FROM seen_items WHERE subscription_id = ? ORDER BY rowid DESC LIMIT ?
           )`,
        )
        .run(subscriptionId, subscriptionId, this.maxPerSubscription);
    });
  }

  async clear(subscriptionId: string): Promise<void> {
    transaction(this.db, () => {
      this.db.prepare('DELETE FROM seen_items WHERE subscription_id = ?').run(subscriptionId);
      this.db.prepare('DELETE FROM seen_initialized WHERE subscription_id = ?').run(subscriptionId);
    });
  }
}

interface UserRow {
  id: string;
  username: string | null;
  first_name: string | null;
  status: UserStatus;
  requested_at: number;
  decided_at: number | null;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    firstName: row.first_name,
    status: row.status,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
  };
}

export class SqliteUserStore implements UserStore {
  constructor(private readonly db: DatabaseSync) {}

  async get(id: string): Promise<User | undefined> {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return row && toUser(row);
  }

  async create(data: NewUser): Promise<User> {
    const now = Date.now();
    const decidedAt = data.status === 'pending' ? null : now;
    this.db
      .prepare('INSERT INTO users (id, username, first_name, status, requested_at, decided_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(data.id, data.username, data.firstName, data.status, now, decidedAt);
    return { ...data, requestedAt: now, decidedAt };
  }

  async setStatus(id: string, status: UserStatus): Promise<User | undefined> {
    this.db.prepare('UPDATE users SET status = ?, decided_at = ? WHERE id = ?').run(status, Date.now(), id);
    return this.get(id);
  }

  async list(): Promise<User[]> {
    const rows = this.db
      .prepare("SELECT * FROM users ORDER BY status <> 'pending', requested_at, rowid")
      .all() as unknown as UserRow[];
    return rows.map(toUser);
  }
}

export class SqliteDraftStore implements DraftStore {
  constructor(private readonly db: DatabaseSync) {}

  async get(userId: string): Promise<SearchDraft | undefined> {
    const row = this.db.prepare('SELECT data FROM search_drafts WHERE user_id = ?').get(userId) as
      | { data: string }
      | undefined;
    return row && (JSON.parse(row.data) as SearchDraft);
  }

  async save(userId: string, draft: SearchDraft): Promise<void> {
    this.db
      .prepare('INSERT OR REPLACE INTO search_drafts (user_id, data, updated_at) VALUES (?, ?, ?)')
      .run(userId, JSON.stringify(draft), Date.now());
  }

  async delete(userId: string): Promise<boolean> {
    return this.db.prepare('DELETE FROM search_drafts WHERE user_id = ?').run(userId).changes > 0;
  }
}
