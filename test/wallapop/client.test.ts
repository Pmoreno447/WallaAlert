import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { search } from '../../src/wallapop/client.js';

/** Sustituye fetch por un mock que devuelve `body` y guarda la URL y las opciones de cada llamada. */
function mockFetch(body: unknown = { ok: true }, status = 200) {
  return mock.method(globalThis, 'fetch', async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
  );
}

function requestedUrl(fetchMock: ReturnType<typeof mockFetch>): URL {
  const call = fetchMock.mock.calls[0];
  assert.ok(call, 'fetch no fue llamado');
  return new URL(String(call.arguments[0]));
}

describe('search', () => {
  afterEach(() => mock.restoreAll());

  it('construye la URL con la base, los parámetros por defecto y el término', async () => {
    const fetchMock = mockFetch();
    await search('3ds');

    const url = requestedUrl(fetchMock);
    assert.equal(url.origin + url.pathname, 'https://api.wallapop.com/api/v3/search');
    assert.equal(url.searchParams.get('keywords'), '3ds');
    assert.equal(url.searchParams.get('source'), 'search_box');
    assert.equal(url.searchParams.get('order_by'), 'newest');
  });

  it('recorta los espacios del término', async () => {
    const fetchMock = mockFetch();
    await search('  nintendo 3ds  ');
    assert.equal(requestedUrl(fetchMock).searchParams.get('keywords'), 'nintendo 3ds');
  });

  it('añade los filtros con los nombres de parámetro de config.json', async () => {
    const fetchMock = mockFetch();
    await search('3ds', { minPrice: 50, maxPrice: 100, categoryId: 24200, subcategoryId: 10088 });

    const params = requestedUrl(fetchMock).searchParams;
    assert.equal(params.get('min_sale_price'), '50');
    assert.equal(params.get('max_sale_price'), '100');
    assert.equal(params.get('category_id'), '24200');
    assert.equal(params.get('subcategory_ids'), '10088');
  });

  it('no añade los filtros que no se indican', async () => {
    const fetchMock = mockFetch();
    await search('3ds', { maxPrice: 0 });

    const params = requestedUrl(fetchMock).searchParams;
    assert.equal(params.get('max_sale_price'), '0');
    assert.equal(params.has('min_sale_price'), false);
    assert.equal(params.has('category_id'), false);
    assert.equal(params.has('subcategory_ids'), false);
  });

  it('envía las cabeceras configuradas', async () => {
    const fetchMock = mockFetch();
    await search('3ds');

    const init = fetchMock.mock.calls[0]?.arguments[1];
    assert.deepEqual(new Headers(init?.headers).get('x-deviceos'), '0');
  });

  it('devuelve el JSON de la respuesta', async () => {
    const body = { data: { section: { payload: { items: [{ id: 'abc' }] } } } };
    mockFetch(body);
    assert.deepEqual(await search('3ds'), body);
  });

  it('lanza un error si la API responde con un estado de error', async () => {
    mockFetch('Forbidden', 403);
    await assert.rejects(search('3ds'), /Error 403/);
  });

  it('lanza un error si el término está vacío y no hace la petición', async () => {
    const fetchMock = mockFetch();
    await assert.rejects(search('   '), /no puede estar vacío/);
    assert.equal(fetchMock.mock.callCount(), 0);
  });
});
