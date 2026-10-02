import { config } from '../config.js';
import type { SearchFilters } from './types.js';

export interface Category {
  id: number;
  name: string;
  subcategories: Category[];
}

interface ApiCategory {
  id: number;
  name: string;
  subcategories?: ApiCategory[];
}

function toCategory(raw: ApiCategory): Category {
  return { id: raw.id, name: raw.name, subcategories: (raw.subcategories ?? []).map(toCategory) };
}

/** Descarga el árbol de categorías de Wallapop, con los nombres en español. */
export async function fetchCategories(): Promise<Category[]> {
  const { categoriesUrl, headers = {}, timeoutMs = 10000 } = config.api;
  const response = await fetch(categoriesUrl, {
    headers: { ...headers, 'Accept-Language': 'es-ES' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Error ${response.status} al descargar las categorías`);
  }
  const body = (await response.json()) as { categories?: ApiCategory[] };
  return (body.categories ?? []).map(toCategory);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Categorías con caché: cambian muy poco, así que se descargan como mucho una vez
 * cada `ttlMs`. Si la descarga falla y hay una copia anterior, se usa esa.
 */
export class CategoryCatalog {
  private cache: { categories: Category[]; fetchedAt: number } | undefined;

  constructor(
    private readonly fetchFn: () => Promise<Category[]> = fetchCategories,
    private readonly ttlMs = DAY_MS,
  ) {}

  /** Categorías principales, cada una con sus subcategorías. */
  async list(): Promise<Category[]> {
    if (this.cache && Date.now() - this.cache.fetchedAt < this.ttlMs) {
      return this.cache.categories;
    }
    try {
      const categories = await this.fetchFn();
      this.cache = { categories, fetchedAt: Date.now() };
      return categories;
    } catch (error) {
      if (this.cache) return this.cache.categories;
      throw error;
    }
  }

  async find(categoryId: number): Promise<Category | undefined> {
    return (await this.list()).find((c) => c.id === categoryId);
  }

  /**
   * Texto legible de la categoría y subcategoría de unos filtros, p. ej.
   * "Tecnología y electrónica › Consolas". Undefined si no hay categoría.
   * Si no se pueden cargar los nombres, usa los ids.
   */
  async describe(filters: SearchFilters): Promise<string | undefined> {
    const { categoryId, subcategoryId } = filters;
    if (categoryId === undefined && subcategoryId === undefined) return undefined;

    let category: Category | undefined;
    try {
      category = categoryId === undefined ? undefined : await this.find(categoryId);
    } catch {
      // sin conexión con Wallapop: se muestran los ids
    }

    const parts = [category?.name ?? (categoryId !== undefined ? `Categoría ${categoryId}` : undefined)];
    if (subcategoryId !== undefined) {
      const sub = category?.subcategories.find((s) => s.id === subcategoryId);
      parts.push(sub?.name ?? `Subcategoría ${subcategoryId}`);
    }
    return parts.filter(Boolean).join(' › ');
  }
}
