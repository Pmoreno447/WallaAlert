import type { SearchFilters } from './wallapop/types.js';

/** Una búsqueda guardada por un usuario. Es la unidad que se vigila y se notifica. */
export interface Subscription {
  id: string;
  /** Destinatario de las notificaciones (más adelante, el chat de Telegram). */
  userId: string;
  term: string;
  filters: SearchFilters;
  /** Una suscripción pausada no se comprueba ni se notifica hasta que se reactiva. */
  paused: boolean;
}

/** Datos para crear una suscripción; el id lo genera el almacén y empieza activa. */
export type NewSubscription = Pick<Subscription, 'userId' | 'term' | 'filters'>;

export type UserStatus = 'pending' | 'approved' | 'rejected';

/** Usuario de Telegram que ha pedido acceso al bot. */
export interface User {
  /** Id de usuario de Telegram; en chats privados coincide con el id del chat. */
  id: string;
  username: string | null;
  firstName: string | null;
  status: UserStatus;
  /** Timestamp en milisegundos. */
  requestedAt: number;
  /** Cuándo se aceptó o rechazó por última vez. Timestamp en milisegundos. */
  decidedAt: number | null;
}

export type NewUser = Pick<User, 'id' | 'username' | 'firstName' | 'status'>;

/** Paso en el que está un usuario mientras crea una búsqueda con /busqueda. */
export type DraftStep = 'term' | 'maxPrice' | 'minPrice' | 'category' | 'subcategory';

/** Búsqueda a medio crear. */
export interface SearchDraft {
  step: DraftStep;
  term?: string;
  filters: SearchFilters;
}
