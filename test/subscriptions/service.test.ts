import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SubscriptionService } from '../../src/subscriptions/service.js';
import { createStores } from '../storage/create-stores.js';

describe('SubscriptionService', () => {
  function setup() {
    const { subscriptions, seen } = createStores();
    return { seen, service: new SubscriptionService(subscriptions, seen) };
  }

  it('pause deja la suscripción pausada', async () => {
    const { service } = setup();
    const sub = await service.add({ userId: 'ana', term: '3ds', filters: {} });

    assert.equal((await service.pause(sub.id))?.paused, true);
    assert.equal((await service.get(sub.id))?.paused, true);
  });

  it('resume reactiva la suscripción y borra la línea base para empezar de cero', async () => {
    const { service, seen } = setup();
    const sub = await service.add({ userId: 'ana', term: '3ds', filters: {} });
    await seen.markSeen(sub.id, ['a']);
    await service.pause(sub.id);

    assert.equal((await service.resume(sub.id))?.paused, false);
    assert.equal(await seen.isInitialized(sub.id), false);
  });

  it('resume sobre una suscripción activa no borra lo visto', async () => {
    const { service, seen } = setup();
    const sub = await service.add({ userId: 'ana', term: '3ds', filters: {} });
    await seen.markSeen(sub.id, ['a']);

    assert.equal((await service.resume(sub.id))?.paused, false);
    assert.equal(await seen.isInitialized(sub.id), true);
    assert.deepEqual(await seen.filterUnseen(sub.id, ['a']), []);
  });

  it('pause y resume devuelven undefined si no existe', async () => {
    const { service } = setup();
    assert.equal(await service.pause('no-existe'), undefined);
    assert.equal(await service.resume('no-existe'), undefined);
  });

  it('remove borra la suscripción y lo que había visto', async () => {
    const { service, seen } = setup();
    const sub = await service.add({ userId: 'ana', term: '3ds', filters: {} });
    await seen.markSeen(sub.id, ['a']);

    assert.equal(await service.remove(sub.id), true);
    assert.equal(await service.get(sub.id), undefined);
    assert.equal(await seen.isInitialized(sub.id), false);
  });
});
