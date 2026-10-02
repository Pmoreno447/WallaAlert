import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SubscriptionService } from '../../src/subscriptions/service.js';
import { AccessService } from '../../src/users/access.js';
import { createStores } from '../storage/create-stores.js';

const ADMIN = '1';
const ana = { id: '2', username: 'ana', firstName: 'Ana' };

function setup() {
  const stores = createStores();
  const subscriptions = new SubscriptionService(stores.subscriptions, stores.seen);
  return { subscriptions, access: new AccessService(stores.users, subscriptions, ADMIN) };
}

describe('AccessService', () => {
  it('una solicitud nueva queda pendiente y sin acceso', async () => {
    const { access } = setup();
    const { user, created } = await access.requestAccess(ana);

    assert.equal(created, true);
    assert.equal(user.status, 'pending');
    assert.equal(await access.isApproved(ana.id), false);
  });

  it('repetir la solicitud no crea otra ni cambia el estado', async () => {
    const { access } = setup();
    await access.requestAccess(ana);
    await access.reject(ana.id);

    const { user, created } = await access.requestAccess(ana);
    assert.equal(created, false);
    assert.equal(user.status, 'rejected');
  });

  it('el administrador tiene acceso siempre, incluso sin haberlo solicitado', async () => {
    const { access } = setup();
    assert.equal(await access.isApproved(ADMIN), true);
    assert.equal((await access.requestAccess({ id: ADMIN, username: null, firstName: null })).user.status, 'approved');
  });

  it('approve da acceso', async () => {
    const { access } = setup();
    await access.requestAccess(ana);
    await access.approve(ana.id);
    assert.equal(await access.isApproved(ana.id), true);
  });

  it('reject quita el acceso y pausa las búsquedas del usuario', async () => {
    const { access, subscriptions } = setup();
    await access.requestAccess(ana);
    await access.approve(ana.id);
    await subscriptions.add({ userId: ana.id, term: '3ds', filters: {} });
    await subscriptions.add({ userId: ana.id, term: 'ps5', filters: {} });

    await access.reject(ana.id);

    assert.equal(await access.isApproved(ana.id), false);
    assert.deepEqual((await subscriptions.listByUser(ana.id)).map((s) => s.paused), [true, true]);
  });

  it('no se puede revocar el acceso al administrador', async () => {
    const { access } = setup();
    await assert.rejects(access.reject(ADMIN), /administrador/);
  });
});
