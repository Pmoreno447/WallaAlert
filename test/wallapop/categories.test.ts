import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CategoryCatalog, type Category } from '../../src/wallapop/categories.js';

const CATEGORIES: Category[] = [
  { id: 24200, name: 'Tecnología', subcategories: [{ id: 24203, name: 'Consolas', subcategories: [] }] },
  { id: 100, name: 'Coches', subcategories: [] },
];

/** Función de descarga falsa que cuenta las llamadas y puede fallar a voluntad. */
function fakeFetch() {
  const state = { calls: 0, fail: false };
  const fn = async () => {
    state.calls++;
    if (state.fail) throw new Error('sin conexión');
    return CATEGORIES;
  };
  return { state, fn };
}

describe('CategoryCatalog', () => {
  it('descarga las categorías una sola vez mientras la caché es válida', async () => {
    const { state, fn } = fakeFetch();
    const catalog = new CategoryCatalog(fn);

    await catalog.list();
    await catalog.find(100);
    assert.equal(state.calls, 1);
  });

  it('vuelve a descargar cuando caduca la caché', async () => {
    const { state, fn } = fakeFetch();
    const catalog = new CategoryCatalog(fn, 0);
    await catalog.list();
    await catalog.list();
    assert.equal(state.calls, 2);
  });

  it('si la descarga falla, usa la copia anterior', async () => {
    const { state, fn } = fakeFetch();
    const catalog = new CategoryCatalog(fn, 0);
    await catalog.list();
    state.fail = true;
    assert.deepEqual(await catalog.list(), CATEGORIES);
  });

  it('si la descarga falla y no hay copia, lanza el error', async () => {
    const { state, fn } = fakeFetch();
    state.fail = true;
    await assert.rejects(new CategoryCatalog(fn).list(), /sin conexión/);
  });

  it('describe da los nombres de categoría y subcategoría', async () => {
    const catalog = new CategoryCatalog(fakeFetch().fn);
    assert.equal(await catalog.describe({}), undefined);
    assert.equal(await catalog.describe({ categoryId: 100 }), 'Coches');
    assert.equal(await catalog.describe({ categoryId: 24200, subcategoryId: 24203 }), 'Tecnología › Consolas');
  });

  it('describe usa los ids si no puede cargar los nombres', async () => {
    const { state, fn } = fakeFetch();
    state.fail = true;
    const catalog = new CategoryCatalog(fn);
    assert.equal(await catalog.describe({ categoryId: 24200, subcategoryId: 1 }), 'Categoría 24200 › Subcategoría 1');
  });
});
