import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { MIGRATIONS, openDatabase } from '../../src/storage/database.js';
import { SqliteSeenStore, SqliteSubscriptionStore } from '../../src/storage/sqlite.js';
import { createStores } from './create-stores.js';

describe('SubscriptionStore', () => {
  it('añade una suscripción con id y la devuelve con get', async () => {
    const { subscriptions } = createStores();
    const sub = await subscriptions.add({ userId: 'ana', term: '3ds', filters: { maxPrice: 100 } });

    assert.ok(sub.id);
    assert.deepEqual(await subscriptions.get(sub.id), sub);
  });

  it('get devuelve undefined si no existe', async () => {
    const { subscriptions } = createStores();
    assert.equal(await subscriptions.get('no-existe'), undefined);
  });

  it('lista todas las suscripciones en orden de creación', async () => {
    const { subscriptions } = createStores();
    const a = await subscriptions.add({ userId: 'ana', term: '3ds', filters: {} });
    const b = await subscriptions.add({ userId: 'luis', term: 'ps5', filters: {} });
    assert.deepEqual(await subscriptions.list(), [a, b]);
  });

  it('lista solo las suscripciones de un usuario', async () => {
    const { subscriptions } = createStores();
    const a = await subscriptions.add({ userId: 'ana', term: '3ds', filters: {} });
    await subscriptions.add({ userId: 'luis', term: 'ps5', filters: {} });
    assert.deepEqual(await subscriptions.listByUser('ana'), [a]);
  });

  it('elimina una suscripción', async () => {
    const { subscriptions } = createStores();
    const sub = await subscriptions.add({ userId: 'ana', term: '3ds', filters: {} });

    assert.equal(await subscriptions.remove(sub.id), true);
    assert.equal(await subscriptions.remove(sub.id), false);
    assert.deepEqual(await subscriptions.list(), []);
  });

  it('las suscripciones nuevas empiezan activas', async () => {
    const { subscriptions } = createStores();
    const sub = await subscriptions.add({ userId: 'ana', term: '3ds', filters: {} });
    assert.equal(sub.paused, false);
  });

  it('setPaused pausa y reactiva, y devuelve la suscripción actualizada', async () => {
    const { subscriptions } = createStores();
    const sub = await subscriptions.add({ userId: 'ana', term: '3ds', filters: {} });

    assert.deepEqual(await subscriptions.setPaused(sub.id, true), { ...sub, paused: true });
    assert.equal((await subscriptions.get(sub.id))?.paused, true);
    assert.deepEqual(await subscriptions.setPaused(sub.id, false), { ...sub, paused: false });
  });

  it('setPaused devuelve undefined si no existe', async () => {
    const { subscriptions } = createStores();
    assert.equal(await subscriptions.setPaused('no-existe', true), undefined);
  });

  it('listActive excluye las pausadas, pero list y listByUser las incluyen', async () => {
    const { subscriptions } = createStores();
    const a = await subscriptions.add({ userId: 'ana', term: '3ds', filters: {} });
    const b = await subscriptions.add({ userId: 'ana', term: 'ps5', filters: {} });
    await subscriptions.setPaused(b.id, true);

    assert.deepEqual(await subscriptions.listActive(), [a]);
    assert.equal((await subscriptions.list()).length, 2);
    assert.equal((await subscriptions.listByUser('ana')).length, 2);
  });
});

describe('SeenStore', () => {
  /** Crea los almacenes y una suscripción (la clave foránea exige que exista). */
  async function setup(maxSeen?: number) {
    const stores = createStores(maxSeen);
    const s1 = await stores.subscriptions.add({ userId: 'ana', term: '3ds', filters: {} });
    const s2 = await stores.subscriptions.add({ userId: 'luis', term: '3ds', filters: {} });
    return { ...stores, s1: s1.id, s2: s2.id };
  }

  it('una suscripción nueva no está inicializada y no ha visto nada', async () => {
    const { seen, s1 } = await setup();
    assert.equal(await seen.isInitialized(s1), false);
    assert.deepEqual(await seen.filterUnseen(s1, ['a', 'b']), ['a', 'b']);
  });

  it('markSeen inicializa la suscripción aunque no haya resultados', async () => {
    const { seen, s1 } = await setup();
    await seen.markSeen(s1, []);
    assert.equal(await seen.isInitialized(s1), true);
  });

  it('filterUnseen devuelve solo los ids no vistos, en el orden recibido', async () => {
    const { seen, s1 } = await setup();
    await seen.markSeen(s1, ['b', 'd']);
    assert.deepEqual(await seen.filterUnseen(s1, ['a', 'b', 'c', 'd']), ['a', 'c']);
    assert.deepEqual(await seen.filterUnseen(s1, []), []);
  });

  it('cada suscripción tiene su propio registro', async () => {
    const { seen, s1, s2 } = await setup();
    await seen.markSeen(s1, ['a']);
    assert.deepEqual(await seen.filterUnseen(s2, ['a']), ['a']);
    assert.equal(await seen.isInitialized(s2), false);
  });

  it('olvida los ids más antiguos al superar el máximo', async () => {
    const { seen, s1 } = await setup(3);
    await seen.markSeen(s1, ['a', 'b', 'c']);
    await seen.markSeen(s1, ['d']);
    assert.deepEqual(await seen.filterUnseen(s1, ['a', 'b', 'c', 'd']), ['a']);
  });

  it('los ids que se vuelven a ver cuentan como recientes', async () => {
    const { seen, s1 } = await setup(3);
    await seen.markSeen(s1, ['a', 'b', 'c']);
    await seen.markSeen(s1, ['a', 'd']);
    assert.deepEqual(await seen.filterUnseen(s1, ['a', 'b', 'c', 'd']), ['b']);
  });

  it('clear borra el registro y la línea base', async () => {
    const { seen, s1 } = await setup();
    await seen.markSeen(s1, ['a']);
    await seen.clear(s1);
    assert.equal(await seen.isInitialized(s1), false);
    assert.deepEqual(await seen.filterUnseen(s1, ['a']), ['a']);
  });
});

describe('UserStore', () => {
  it('crea un usuario y lo devuelve con get', async () => {
    const { users } = createStores();
    const user = await users.create({ id: '2', username: 'ana', firstName: 'Ana', status: 'pending' });

    assert.equal(user.decidedAt, null);
    assert.deepEqual(await users.get('2'), user);
    assert.equal(await users.get('3'), undefined);
  });

  it('setStatus cambia el estado y guarda cuándo se decidió', async () => {
    const { users } = createStores();
    await users.create({ id: '2', username: null, firstName: null, status: 'pending' });

    const user = await users.setStatus('2', 'approved');
    assert.equal(user?.status, 'approved');
    assert.equal(typeof user?.decidedAt, 'number');
    assert.equal(await users.setStatus('no-existe', 'approved'), undefined);
  });

  it('list muestra primero los pendientes', async () => {
    const { users } = createStores();
    await users.create({ id: '2', username: null, firstName: null, status: 'approved' });
    await users.create({ id: '3', username: null, firstName: null, status: 'pending' });

    assert.deepEqual((await users.list()).map((u) => u.id), ['3', '2']);
  });
});

describe('DraftStore', () => {
  it('guarda, sustituye y borra el borrador de cada usuario', async () => {
    const { drafts } = createStores();
    assert.equal(await drafts.get('2'), undefined);

    await drafts.save('2', { step: 'term', filters: {} });
    await drafts.save('2', { step: 'minPrice', term: '3ds', filters: { maxPrice: 100 } });
    assert.deepEqual(await drafts.get('2'), { step: 'minPrice', term: '3ds', filters: { maxPrice: 100 } });
    assert.equal(await drafts.get('3'), undefined);

    assert.equal(await drafts.delete('2'), true);
    assert.equal(await drafts.delete('2'), false);
  });
});

describe('SQLite', () => {
  it('borrar una suscripción borra también sus productos vistos', async () => {
    const db = openDatabase(':memory:');
    const subscriptions = new SqliteSubscriptionStore(db);
    const seen = new SqliteSeenStore(db);
    const sub = await subscriptions.add({ userId: 'ana', term: '3ds', filters: {} });
    await seen.markSeen(sub.id, ['a', 'b']);

    await subscriptions.remove(sub.id);

    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM seen_items').get()?.n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM seen_initialized').get()?.n, 0);
  });

  it('migra una base de datos creada con el esquema inicial sin perder datos', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wallapop-bot-'));
    const path = join(dir, 'bot.db');
    try {
      // Base de datos como la creaba la versión anterior: esquema inicial y user_version = 0.
      const old = new DatabaseSync(path);
      old.exec(MIGRATIONS[0]!);
      old.prepare('INSERT INTO subscriptions (id, user_id, term, filters, created_at) VALUES (?, ?, ?, ?, ?)')
        .run('s1', 'ana', '3ds', '{"maxPrice":100}', 1);
      old.close();

      const db = openDatabase(path);
      assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, MIGRATIONS.length);
      const row = db.prepare('SELECT id, term, paused FROM subscriptions').get();
      assert.deepEqual({ ...row }, { id: 's1', term: '3ds', paused: 0 });
      db.close();

      // Reabrir no vuelve a aplicar nada (fallaría al añadir otra vez la columna).
      openDatabase(path).close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('los datos sobreviven a cerrar y reabrir la base de datos', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wallapop-bot-'));
    const path = join(dir, 'sub', 'bot.db'); // la carpeta intermedia se crea sola
    try {
      const db1 = openDatabase(path);
      const sub = await new SqliteSubscriptionStore(db1).add({ userId: 'ana', term: '3ds', filters: { minPrice: 5 } });
      await new SqliteSeenStore(db1).markSeen(sub.id, ['a']);
      db1.close();

      const db2 = openDatabase(path);
      assert.deepEqual(await new SqliteSubscriptionStore(db2).list(), [sub]);
      assert.equal(await new SqliteSeenStore(db2).isInitialized(sub.id), true);
      assert.deepEqual(await new SqliteSeenStore(db2).filterUnseen(sub.id, ['a', 'b']), ['b']);
      db2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
