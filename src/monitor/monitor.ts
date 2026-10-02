import { setTimeout as sleep } from 'node:timers/promises';
import type { SeenStore, SubscriptionStore } from '../storage/types.js';
import type { Subscription } from '../types.js';
import { searchItems } from '../wallapop/client.js';
import type { SearchFilters, WallapopItem } from '../wallapop/types.js';

/** Recibe los productos nuevos de una suscripción y se encarga de avisar a su usuario. */
export type Notifier = (subscription: Subscription, items: WallapopItem[]) => Promise<void> | void;

export type SearchFn = (term: string, filters: SearchFilters) => Promise<WallapopItem[]>;

export interface MonitorErrorContext {
  stage: 'list' | 'search' | 'notify';
  queryKey?: string;
  subscription?: Subscription;
}

/** Lo que se va a revisar en una comprobación. */
export interface CheckStats {
  /** Usuarios con al menos una búsqueda activa. */
  users: number;
  /** Búsquedas activas. */
  subscriptions: number;
}

export interface MonitorOptions {
  subscriptions: SubscriptionStore;
  seen: SeenStore;
  notify: Notifier;
  /** Por defecto, la búsqueda real en Wallapop. */
  searchFn?: SearchFn;
  intervalMs?: number;
  requestDelayMs?: number;
  onError?: (error: unknown, context: MonitorErrorContext) => void;
  /** Se llama al empezar cada comprobación. */
  onCheck?: (stats: CheckStats) => void;
}

/**
 * Clave que identifica una búsqueda. Las suscripciones con la misma clave
 * comparten una sola petición a la API.
 */
export function queryKey(term: string, filters: SearchFilters): string {
  const sortedFilters = Object.entries(filters)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([term.trim().toLowerCase().replace(/\s+/g, ' '), sortedFilters]);
}

/**
 * Comprueba periódicamente todas las suscripciones y notifica a cada usuario
 * solo los productos nuevos de sus propias búsquedas.
 */
export class Monitor {
  private readonly subscriptions: SubscriptionStore;
  private readonly seen: SeenStore;
  private readonly notify: Notifier;
  private readonly searchFn: SearchFn;
  private readonly intervalMs: number;
  private readonly requestDelayMs: number;
  private readonly onError: (error: unknown, context: MonitorErrorContext) => void;
  private readonly onCheck: ((stats: CheckStats) => void) | undefined;

  private running = false;
  private timer: NodeJS.Timeout | undefined;
  private currentRun: Promise<void> | undefined;

  constructor(options: MonitorOptions) {
    this.subscriptions = options.subscriptions;
    this.seen = options.seen;
    this.notify = options.notify;
    this.searchFn = options.searchFn ?? searchItems;
    this.intervalMs = options.intervalMs ?? 60_000;
    this.requestDelayMs = options.requestDelayMs ?? 0;
    this.onError = options.onError ?? ((error, context) => console.error(`[monitor:${context.stage}]`, error));
    this.onCheck = options.onCheck;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Empieza a comprobar ahora y después cada `intervalMs`. */
  start(): void {
    if (this.running) return;
    this.running = true;
    void this.tick();
  }

  /** Detiene el monitor y espera a que termine la comprobación en curso, si la hay. */
  async stop(): Promise<void> {
    this.running = false;
    clearTimeout(this.timer);
    this.timer = undefined;
    await this.currentRun;
  }

  private async tick(): Promise<void> {
    this.currentRun = this.runOnce();
    await this.currentRun;
    this.currentRun = undefined;
    // Se programa al terminar, así una comprobación lenta nunca se solapa con la siguiente.
    if (this.running) {
      this.timer = setTimeout(() => void this.tick(), this.intervalMs);
    }
  }

  /** Hace una comprobación completa de todas las suscripciones. */
  async runOnce(): Promise<void> {
    let all: Subscription[];
    try {
      all = await this.subscriptions.listActive();
    } catch (error) {
      this.onError(error, { stage: 'list' });
      return;
    }

    this.onCheck?.({ users: new Set(all.map((s) => s.userId)).size, subscriptions: all.length });

    const groups = new Map<string, Subscription[]>();
    for (const subscription of all) {
      const key = queryKey(subscription.term, subscription.filters);
      const group = groups.get(key);
      if (group) group.push(subscription);
      else groups.set(key, [subscription]);
    }

    let first = true;
    for (const [key, group] of groups) {
      if (!first && this.requestDelayMs > 0) await sleep(this.requestDelayMs);
      first = false;

      const { term, filters } = group[0]!;
      let items: WallapopItem[];
      try {
        items = await this.searchFn(term, filters);
      } catch (error) {
        this.onError(error, { stage: 'search', queryKey: key });
        continue;
      }

      for (const subscription of group) {
        try {
          await this.processSubscription(subscription, items);
        } catch (error) {
          this.onError(error, { stage: 'notify', queryKey: key, subscription });
        }
      }
    }
  }

  private async processSubscription(subscription: Subscription, items: WallapopItem[]): Promise<void> {
    const ids = items.map((item) => item.id);

    // Primera comprobación: se guarda lo que ya existe como línea base, sin notificar.
    if (!(await this.seen.isInitialized(subscription.id))) {
      await this.seen.markSeen(subscription.id, ids);
      return;
    }

    const unseen = new Set(await this.seen.filterUnseen(subscription.id, ids));
    const newItems = items
      .filter((item) => unseen.has(item.id))
      .sort((a, b) => a.created_at - b.created_at);

    // Se notifica antes de marcar como vistos: si el envío falla, se reintenta en la siguiente comprobación.
    if (newItems.length > 0) {
      await this.notify(subscription, newItems);
    }
    await this.seen.markSeen(subscription.id, ids);
  }
}
