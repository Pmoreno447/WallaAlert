import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describePriceRange, escapeHtml, formatPrice, formatSubscription, itemCaption, parsePrice } from '../../src/telegram/format.js';
import type { Subscription } from '../../src/types.js';
import type { WallapopItem } from '../../src/wallapop/types.js';

/** Intl separa el número y el € con un espacio no separable. */
const NBSP = '\u00a0';

const subscription: Subscription = { id: 's1', userId: '2', term: '3ds <xl>', filters: {}, paused: false };

describe('parsePrice', () => {
  it('acepta enteros, decimales con coma o punto y el símbolo €', () => {
    assert.equal(parsePrice('150'), 150);
    assert.equal(parsePrice(' 150,5 '), 150.5);
    assert.equal(parsePrice('99.99'), 99.99);
    assert.equal(parsePrice('150 €'), 150);
    assert.equal(parsePrice('0'), 0);
  });

  it('rechaza lo que no es un precio válido', () => {
    for (const text of ['', 'barato', '-5', '1e3', '10,5,3', '€']) {
      assert.equal(parsePrice(text), undefined, text);
    }
  });
});

describe('formato', () => {
  it('escapeHtml escapa los caracteres especiales de HTML', () => {
    assert.equal(escapeHtml('<b>"A & B"</b>'), '&lt;b&gt;&quot;A &amp; B&quot;&lt;/b&gt;');
  });

  it('formatPrice usa el formato español', () => {
    assert.equal(formatPrice(35, 'EUR'), `35${NBSP}€`);
    assert.equal(formatPrice(12.5, 'EUR'), `12,50${NBSP}€`);
  });

  it('describePriceRange describe el rango según los filtros que haya', () => {
    assert.equal(describePriceRange({}), undefined);
    assert.equal(describePriceRange({ maxPrice: 100 }), `hasta 100${NBSP}€`);
    assert.equal(describePriceRange({ minPrice: 20 }), `desde 20${NBSP}€`);
    assert.equal(describePriceRange({ minPrice: 20, maxPrice: 100 }), `de 20${NBSP}€ a 100${NBSP}€`);
  });

  it('formatSubscription incluye término, precio, categoría y estado', () => {
    const text = formatSubscription({ ...subscription, filters: { maxPrice: 100 }, paused: true }, 'Tecnología › Consolas');
    assert.equal(text, `🔎 <b>3ds &lt;xl&gt;</b>\n💶 hasta 100${NBSP}€\n📂 Tecnología › Consolas\n⏸ Pausada`);
  });

  it('itemCaption incluye nombre, precio y enlace, escapando el texto', () => {
    const item = { title: 'Consola <nueva>', price: { amount: 80, currency: 'EUR' }, web_slug: 'consola-123' } as WallapopItem;
    const caption = itemCaption(subscription, item);

    assert.match(caption, /<b>Consola &lt;nueva&gt;<\/b>/);
    assert.match(caption, /80\s€/);
    assert.match(caption, /href="https:\/\/es\.wallapop\.com\/item\/consola-123"/);
    assert.match(caption, /3ds &lt;xl&gt;/);
  });

  it('itemCaption recorta los títulos muy largos', () => {
    const item = { title: 'x'.repeat(500), price: { amount: 1, currency: 'EUR' }, web_slug: 'a' } as WallapopItem;
    assert.ok(itemCaption(subscription, item).length < 1024); // límite de Telegram para el pie de foto
  });
});
