import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { beforeEach, describe, it } from 'node:test';
import { Monitor, queryKey, type MonitorErrorContext } from '../../src/monitor/monitor.js';
import type { SeenStore, SubscriptionStore } from '../../src/storage/types.js';
import { SubscriptionService } from '../../src/subscriptions/service.js';
import type { Subscription } from '../../src/types.js';
import type { SearchFilters, WallapopItem } from '../../src/wallapop/types.js';
import { createStores } from '../storage/create-stores.js';

function item(id: string, createdAt = 0): WallapopItem {
  return { id, title: `Producto ${id}`, created_at: createdAt } as WallapopItem;
}

/** API falsa: los resultados de cada búsqueda se cambian a mano entre comprobaciones. */
class FakeApi {
  results = new Map<string, WallapopItem[]>();
  calls: { term: string; filters: SearchFilters }[] = [];
  failing = new Set<string>();

  set(term: string, items: WallapopItem[], filters: SearchFilters = {}) {
    this.results.set(queryKey(term, filters), items);
  }

  search = async (term: string, filters: SearchFilters) => {
    this.calls.push({ term, filters });
    const key = queryKey(term, filters);
    if (this.failing.has(key)) throw new Error(`fallo en ${term}`);
    return this.results.get(key) ?? [];
  };
}

describe('Monitor', () => {
  let api: FakeApi;
  let subscriptions: SubscriptionStore;
  let seen: SeenStore;
  let notified: { userId: string; term: string; ids: string[] }[];
  let errors: { error: unknown; context: MonitorErrorContext }[];
  let failNotifyFor: Set<string>;
  let monitor: Monitor;

  beforeEach(() => {
    api = new FakeApi();
    ({ subscriptions, seen } = createStores());
    notified = [];
    errors = [];
    failNotifyFor = new Set();
    monitor = new Monitor({
      subscriptions,
      seen,
      searchFn: api.search,
      notify: (sub: Subscription, items: WallapopItem[]) => {
        if (failNotifyFor.has(sub.userId)) throw new Error('telegram caído');
        notified.push({ userId: sub.userId, term: sub.term, ids: items.map((i) => i.id) });
      },
      onError: (error, context) => errors.push({ error, context }),
    });
  });

  it('la primera comprobación guarda la línea base sin notificar', async () => {
    await subscriptions.add({ userId: 'ana', term: '3ds', filters: {} });
    api.set('3ds', [item('a'), item('b')]);

    await monitor.runOnce();

    assert.deepEqual(notified, []);
  });

  it('notifica solo los productos que aparecen después de la línea base', async () => {
    await subscriptions.add({ userId: 'ana', term: '3ds', filters: {} });
    api.set('3ds', [item('a'), item('b')]);
    await monitor.runOnce();

    api.set('3ds', [item('c'), item('a'), item('b')]);
    await monitor.runOnce();

    assert.deepEqual(notified, [{ userId: 'ana', term: '3ds', ids: ['c'] }]);
  });

  it('no vuelve a notificar un producto ya notificado', async () => {
    await subscriptions.add({ userId: 'ana', term: '3ds', filters: {} });
    await monitor.runOnce();
    api.set('3ds', [item('a')]);
    await monitor.runOnce();
    await monitor.runOnce();

    assert.equal(notified.length, 1);
  });

  it('entrega los productos nuevos del más antiguo al más reciente', async () => {
    await subscriptions.add({ userId: 'ana', term: '3ds', filters: {} });
    await monitor.runOnce();
    api.set('3ds', [item('nuevo', 300), item('medio', 200), item('viejo', 100)]);
    await monitor.runOnce();

    assert.deepEqual(notified[0]?.ids, ['viejo', 'medio', 'nuevo']);
  });

  it('cada usuario recibe solo los productos de sus propias búsquedas', async () => {
    await subscriptions.add({ userId: 'ana', term: '3ds', filters: {} });
    await subscriptions.add({ userId: 'luis', term: 'ps5', filters: {} });
    await monitor.runOnce();

    api.set('3ds', [item('3ds-1')]);
    api.set('ps5', [item('ps5-1')]);
    await monitor.runOnce();

    assert.deepEqual(
      notified.sort((a, b) => a.userId.localeCompare(b.userId)),
      [
        { userId: 'ana', term: '3ds', ids: ['3ds-1'] },
        { userId: 'luis', term: 'ps5', ids: ['ps5-1'] },
      ],
    );
  });

  it('agrupa las búsquedas iguales de varios usuarios en una sola petición', async () => {
    await subscriptions.add({ userId: 'ana', term: '3ds', filters: { maxPrice: 100 } });
    await subscriptions.add({ userId: 'luis', term: ' 3DS ', filters: { maxPrice: 100 } });
    await monitor.runOnce();
    api.set('3ds', [item('a')], { maxPrice: 100 });
    await monitor.runOnce();

    assert.equal(api.calls.length, 2); // una por comprobación, no una por usuario
    assert.deepEqual(notified.map((n) => n.userId).sort(), ['ana', 'luis']);
  });

  it('hace peticiones separadas si los filtros son distintos', async () => {
    await subscriptions.add({ userId: 'ana', term: '3ds', filters: { maxPrice: 100 } });
    await subscriptions.add({ userId: 'luis', term: '3ds', filters: { maxPrice: 50 } });
    await monitor.runOnce();

    assert.equal(api.calls.length, 2);
  });

  it('un usuario que se suscribe tarde no recibe lo que ya existía', async () => {
    await subscriptions.add({ userId: 'ana', term: '3ds', filters: {} });
    api.set('3ds', [item('a')]);
    await monitor.runOnce();

    await subscriptions.add({ userId: 'luis', term: '3ds', filters: {} });
    api.set('3ds', [item('b'), item('a')]);
    await monitor.runOnce();

    assert.deepEqual(notified, [{ userId: 'ana', term: '3ds', ids: ['b'] }]);
  });

  it('deja de notificar una suscripción eliminada', async () => {
    const sub = await subscriptions.add({ userId: 'ana', term: '3ds', filters: {} });
    await monitor.runOnce();
    await subscriptions.remove(sub.id);
    api.set('3ds', [item('a')]);
    await monitor.runOnce();

    assert.deepEqual(notified, []);
  });

  it('no busca ni notifica las suscripciones pausadas', async () => {
    const sub = await subscriptions.add({ userId: 'ana', term: '3ds', filters: {} });
    await monitor.runOnce();
    await subscriptions.setPaused(sub.id, true);
    api.calls = [];

    api.set('3ds', [item('a')]);
    await monitor.runOnce();

    assert.deepEqual(api.calls, []);
    assert.deepEqual(notified, []);
  });

  it('si dos usuarios comparten búsqueda y uno la pausa, solo se avisa al otro', async () => {
    const ana = await subscriptions.add({ userId: 'ana', term: '3ds', filters: {} });
    await subscriptions.add({ userId: 'luis', term: '3ds', filters: {} });
    await monitor.runOnce();
    await subscriptions.setPaused(ana.id, true);

    api.set('3ds', [item('a')]);
    await monitor.runOnce();

    assert.deepEqual(notified, [{ userId: 'luis', term: '3ds', ids: ['a'] }]);
  });

  it('al reactivar no llega lo publicado durante la pausa, pero sí lo posterior', async () => {
    const service = new SubscriptionService(subscriptions, seen);
    const sub = await service.add({ userId: 'ana', term: '3ds', filters: {} });
    api.set('3ds', [item('a')]);
    await monitor.runOnce();

    await service.pause(sub.id);
    api.set('3ds', [item('durante-1'), item('durante-2'), item('a')]);
    await monitor.runOnce();

    await service.resume(sub.id);
    await monitor.runOnce(); // nueva línea base
    assert.deepEqual(notified, []);

    api.set('3ds', [item('despues'), item('durante-1'), item('durante-2'), item('a')]);
    await monitor.runOnce();
    assert.deepEqual(notified, [{ userId: 'ana', term: '3ds', ids: ['despues'] }]);
  });

  it('si una búsqueda falla, sigue con las demás e informa del error', async () => {
    await subscriptions.add({ userId: 'ana', term: '3ds', filters: {} });
    await subscriptions.add({ userId: 'luis', term: 'ps5', filters: {} });
    await monitor.runOnce();

    api.failing.add(queryKey('3ds', {}));
    api.set('ps5', [item('ps5-1')]);
    await monitor.runOnce();

    assert.deepEqual(notified, [{ userId: 'luis', term: 'ps5', ids: ['ps5-1'] }]);
    assert.equal(errors.length, 1);
    assert.equal(errors[0]?.context.stage, 'search');
  });

  it('si falla el envío, reintenta esos productos en la siguiente comprobación', async () => {
    await subscriptions.add({ userId: 'ana', term: '3ds', filters: {} });
    await monitor.runOnce();
    api.set('3ds', [item('a')]);

    failNotifyFor.add('ana');
    await monitor.runOnce();
    assert.equal(errors[0]?.context.stage, 'notify');
    assert.deepEqual(notified, []);

    failNotifyFor.clear();
    await monitor.runOnce();
    assert.deepEqual(notified, [{ userId: 'ana', term: '3ds', ids: ['a'] }]);
  });

  it('al empezar cada comprobación informa de cuántos usuarios y búsquedas activas hay', async () => {
    const checks: unknown[] = [];
    const withStats = new Monitor({ subscriptions, seen, searchFn: api.search, notify: () => {}, onCheck: (s) => checks.push(s) });
    await subscriptions.add({ userId: 'ana', term: '3ds', filters: {} });
    await subscriptions.add({ userId: 'ana', term: 'ps5', filters: {} });
    await subscriptions.add({ userId: 'luis', term: '3ds', filters: {} });
    const paused = await subscriptions.add({ userId: 'marta', term: 'wii', filters: {} });
    await subscriptions.setPaused(paused.id, true);

    await withStats.runOnce();

    assert.deepEqual(checks, [{ users: 2, subscriptions: 3 }]); // las pausadas no cuentan
  });

  it('start() comprueba al momento y stop() detiene las comprobaciones', async () => {
    const fast = new Monitor({ subscriptions, seen, searchFn: api.search, notify: () => {}, intervalMs: 5 });
    await subscriptions.add({ userId: 'ana', term: '3ds', filters: {} });

    fast.start();
    assert.equal(fast.isRunning, true);
    await sleep(30);
    await fast.stop();
    const callsAtStop = api.calls.length;
    assert.ok(callsAtStop >= 2, `esperaba varias comprobaciones, hubo ${callsAtStop}`);

    await sleep(30);
    assert.equal(api.calls.length, callsAtStop);
    assert.equal(fast.isRunning, false);
  });
});

describe('queryKey', () => {
  it('ignora mayúsculas, espacios sobrantes y el orden de los filtros', () => {
    assert.equal(
      queryKey('  Nintendo   3DS ', { maxPrice: 100, minPrice: 10 }),
      queryKey('nintendo 3ds', { minPrice: 10, maxPrice: 100 }),
    );
  });

  it('distingue términos y filtros diferentes', () => {
    assert.notEqual(queryKey('3ds', {}), queryKey('ps5', {}));
    assert.notEqual(queryKey('3ds', { maxPrice: 100 }), queryKey('3ds', { maxPrice: 50 }));
  });
});
