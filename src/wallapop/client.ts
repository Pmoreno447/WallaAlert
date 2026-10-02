import { config } from '../config.js';
import type { SearchFilters, WallapopItem, WallapopSearchResponse } from './types.js';

/**
 * Envía una petición a la API configurada en config.json con el término de búsqueda indicado.
 * @param term Término a buscar (p. ej. "3ds").
 * @param filters Filtros opcionales; cada uno se añade a la URL con el nombre definido en config.json.
 * @returns Respuesta de la API en JSON.
 */
export async function search(term: string, filters: SearchFilters = {}): Promise<WallapopSearchResponse> {
  if (!term.trim()) {
    throw new Error('El término de búsqueda no puede estar vacío');
  }

  const { baseUrl, searchParam, filterParams, defaultParams = {}, headers = {}, timeoutMs = 10000 } = config.api;

  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(defaultParams)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set(searchParam, term.trim());

  for (const [filter, value] of Object.entries(filters) as [keyof SearchFilters, number | undefined][]) {
    if (value !== undefined) {
      url.searchParams.set(filterParams[filter], String(value));
    }
  }

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Error ${response.status} en la petición a ${url}: ${await response.text()}`);
  }

  return (await response.json()) as WallapopSearchResponse;
}

/** Igual que `search`, pero devuelve directamente la lista de productos. */
export async function searchItems(term: string, filters: SearchFilters = {}): Promise<WallapopItem[]> {
  const response = await search(term, filters);
  return response.data?.section?.payload?.items ?? [];
}

/** URL pública del producto en la web de Wallapop. */
export function itemUrl(item: Pick<WallapopItem, 'web_slug'>): string {
  return `https://es.wallapop.com/item/${item.web_slug}`;
}
