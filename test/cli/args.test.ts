import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCliArgs } from '../../src/cli/args.js';

describe('parseCliArgs', () => {
  it('une los argumentos posicionales en el término', () => {
    assert.deepEqual(parseCliArgs(['nintendo', '3ds']), { term: 'nintendo 3ds', filters: {} });
  });

  it('devuelve un término vacío si no se indica ninguno', () => {
    assert.equal(parseCliArgs(['--max', '10']).term, '');
  });

  it('convierte los filtros a números', () => {
    const { term, filters } = parseCliArgs([
      '3ds', '--min', '50', '--max', '99.5', '--category', '24200', '--subcategory', '10088',
    ]);
    assert.equal(term, '3ds');
    assert.deepEqual(filters, { minPrice: 50, maxPrice: 99.5, categoryId: 24200, subcategoryId: 10088 });
  });

  it('acepta la sintaxis --opcion=valor', () => {
    assert.deepEqual(parseCliArgs(['3ds', '--max=100']).filters, { maxPrice: 100 });
  });

  it('lanza un error si un filtro no es numérico', () => {
    assert.throws(() => parseCliArgs(['3ds', '--min', 'abc']), /--min debe ser un número/);
  });

  it('lanza un error con opciones desconocidas', () => {
    assert.throws(() => parseCliArgs(['3ds', '--precio', '10']));
  });
});
