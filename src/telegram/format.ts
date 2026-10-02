import type { Subscription, User } from '../types.js';
import { itemUrl } from '../wallapop/client.js';
import type { SearchFilters, WallapopItem } from '../wallapop/types.js';

/** Escapa el texto para los mensajes con parse_mode HTML. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function formatPrice(amount: number, currency = 'EUR'): string {
  try {
    // Precios enteros sin decimales ("35 €"); el resto con dos ("12,50 €").
    const decimals = Number.isInteger(amount) ? 0 : 2;
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`; // moneda desconocida
  }
}

/**
 * Convierte lo que escribe el usuario en un precio: admite "150", "150,5", "150.5" y "150 €".
 * Devuelve undefined si no es un número válido mayor o igual que 0.
 */
export function parsePrice(text: string): number | undefined {
  const normalized = text.trim().replace(/€/g, '').replace(/\s+/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return undefined;
  return Number(normalized);
}

export function describePriceRange({ minPrice, maxPrice }: SearchFilters): string | undefined {
  if (minPrice !== undefined && maxPrice !== undefined) return `de ${formatPrice(minPrice)} a ${formatPrice(maxPrice)}`;
  if (minPrice !== undefined) return `desde ${formatPrice(minPrice)}`;
  if (maxPrice !== undefined) return `hasta ${formatPrice(maxPrice)}`;
  return undefined;
}

/** Resumen de una búsqueda guardada. `categoryText` es el nombre legible de la categoría, si tiene. */
export function formatSubscription(subscription: Subscription, categoryText: string | undefined): string {
  const lines = [`🔎 <b>${escapeHtml(subscription.term)}</b>`];
  const price = describePriceRange(subscription.filters);
  if (price) lines.push(`💶 ${price}`);
  if (categoryText) lines.push(`📂 ${escapeHtml(categoryText)}`);
  lines.push(subscription.paused ? '⏸ Pausada' : '▶️ Activa');
  return lines.join('\n');
}

const MAX_TITLE_LENGTH = 200;

/** Pie de foto de la notificación de un producto nuevo. */
export function itemCaption(subscription: Subscription, item: WallapopItem): string {
  const title = item.title.length > MAX_TITLE_LENGTH ? `${item.title.slice(0, MAX_TITLE_LENGTH - 1)}…` : item.title;
  return [
    `🔔 Nuevo en <i>${escapeHtml(subscription.term)}</i>`,
    `<b>${escapeHtml(title)}</b>`,
    `💶 ${formatPrice(item.price.amount, item.price.currency)}`,
    `<a href="${escapeHtml(itemUrl(item))}">Ver anuncio en Wallapop</a>`,
  ].join('\n');
}

/** Nombre para mostrar de un usuario, p. ej. "Ana (@ana)". */
export function displayName(user: Pick<User, 'id' | 'firstName' | 'username'>): string {
  const name = user.firstName ?? `Usuario ${user.id}`;
  return user.username ? `${name} (@${user.username})` : name;
}
