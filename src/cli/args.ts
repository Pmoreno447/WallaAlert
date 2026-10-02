import { parseArgs } from 'node:util';
import type { SearchFilters } from '../wallapop/types.js';

function toNumber(name: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (Number.isNaN(n)) {
    throw new Error(`El valor de --${name} debe ser un número: "${value}"`);
  }
  return n;
}

/** Convierte los argumentos de la línea de comandos en término + filtros. */
export function parseCliArgs(args: string[]): { term: string; filters: SearchFilters } {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      min: { type: 'string' },
      max: { type: 'string' },
      category: { type: 'string' },
      subcategory: { type: 'string' },
    },
  });

  const filters: SearchFilters = {};
  const minPrice = toNumber('min', values.min);
  const maxPrice = toNumber('max', values.max);
  const categoryId = toNumber('category', values.category);
  const subcategoryId = toNumber('subcategory', values.subcategory);
  if (minPrice !== undefined) filters.minPrice = minPrice;
  if (maxPrice !== undefined) filters.maxPrice = maxPrice;
  if (categoryId !== undefined) filters.categoryId = categoryId;
  if (subcategoryId !== undefined) filters.subcategoryId = subcategoryId;

  return { term: positionals.join(' '), filters };
}
