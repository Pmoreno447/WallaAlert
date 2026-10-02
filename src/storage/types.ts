import type { NewSubscription, NewUser, SearchDraft, Subscription, User, UserStatus } from '../types.js';

/**
 * Dónde se guardan las suscripciones. Es asíncrono para poder cambiar SQLite por
 * otra base de datos (p. ej. PostgreSQL) sin cambiar el monitor.
 */
export interface SubscriptionStore {
  add(data: NewSubscription): Promise<Subscription>;
  /** Borra la suscripción y también sus productos vistos. */
  remove(id: string): Promise<boolean>;
  get(id: string): Promise<Subscription | undefined>;
  list(): Promise<Subscription[]>;
  /** Solo las suscripciones no pausadas: las que el monitor tiene que comprobar. */
  listActive(): Promise<Subscription[]>;
  listByUser(userId: string): Promise<Subscription[]>;
  /** Cambia el estado de pausa. Devuelve la suscripción actualizada, o undefined si no existe. */
  setPaused(id: string, paused: boolean): Promise<Subscription | undefined>;
}

/** Registro de los productos que ya se han visto en cada suscripción. */
export interface SeenStore {
  /** Indica si la suscripción ya se comprobó alguna vez (si tiene línea base). */
  isInitialized(subscriptionId: string): Promise<boolean>;
  /** De los ids dados, devuelve los que la suscripción todavía no ha visto. */
  filterUnseen(subscriptionId: string, itemIds: string[]): Promise<string[]>;
  /** Marca los ids como vistos e inicializa la suscripción si no lo estaba. */
  markSeen(subscriptionId: string, itemIds: string[]): Promise<void>;
  clear(subscriptionId: string): Promise<void>;
}

/** Usuarios que han pedido acceso al bot y su estado. */
export interface UserStore {
  get(id: string): Promise<User | undefined>;
  create(data: NewUser): Promise<User>;
  /** Cambia el estado. Devuelve el usuario actualizado, o undefined si no existe. */
  setStatus(id: string, status: UserStatus): Promise<User | undefined>;
  /** Todos los usuarios, primero los pendientes y después por fecha de solicitud. */
  list(): Promise<User[]>;
}

/** Búsquedas a medio crear, una como máximo por usuario. */
export interface DraftStore {
  get(userId: string): Promise<SearchDraft | undefined>;
  /** Crea o sustituye el borrador del usuario. */
  save(userId: string, draft: SearchDraft): Promise<void>;
  /** Devuelve true si había un borrador. */
  delete(userId: string): Promise<boolean>;
}
