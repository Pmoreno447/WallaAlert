import type { SeenStore, SubscriptionStore } from '../storage/types.js';
import type { NewSubscription, Subscription } from '../types.js';

/**
 * Operaciones sobre las suscripciones que usan el CLI y, más adelante, el bot.
 * Coordina los dos almacenes cuando una operación afecta a ambos.
 */
export class SubscriptionService {
  constructor(
    private readonly subscriptions: SubscriptionStore,
    private readonly seen: SeenStore,
  ) {}

  add(data: NewSubscription): Promise<Subscription> {
    return this.subscriptions.add(data);
  }

  get(id: string): Promise<Subscription | undefined> {
    return this.subscriptions.get(id);
  }

  list(): Promise<Subscription[]> {
    return this.subscriptions.list();
  }

  listByUser(userId: string): Promise<Subscription[]> {
    return this.subscriptions.listByUser(userId);
  }

  remove(id: string): Promise<boolean> {
    return this.subscriptions.remove(id);
  }

  /** Deja de comprobar la suscripción. Devuelve undefined si no existe. */
  pause(id: string): Promise<Subscription | undefined> {
    return this.subscriptions.setPaused(id, true);
  }

  /** Pausa todas las suscripciones activas del usuario. Devuelve cuántas se han pausado. */
  async pauseAllByUser(userId: string): Promise<number> {
    const active = (await this.subscriptions.listByUser(userId)).filter((s) => !s.paused);
    for (const subscription of active) {
      await this.subscriptions.setPaused(subscription.id, true);
    }
    return active.length;
  }

  /**
   * Vuelve a comprobar la suscripción. Se borran los productos vistos para que la
   * siguiente comprobación cree una línea base nueva: así no llegan de golpe los
   * productos publicados mientras estaba pausada. Devuelve undefined si no existe.
   */
  async resume(id: string): Promise<Subscription | undefined> {
    const subscription = await this.subscriptions.get(id);
    if (!subscription?.paused) return subscription; // no existe o ya estaba activa: no se toca nada

    // Primero se borra y después se reactiva, para que el monitor nunca vea la
    // suscripción activa con la línea base antigua.
    await this.seen.clear(id);
    return this.subscriptions.setPaused(id, false);
  }
}
