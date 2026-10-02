import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GrammyError } from 'grammy';
import { createTelegramNotifier } from '../../src/telegram/notifier.js';
import type { Subscription } from '../../src/types.js';
import type { WallapopItem } from '../../src/wallapop/types.js';

const subscription: Subscription = { id: 's1', userId: '2', term: '3ds', filters: {}, paused: false };

/** `photo: null` crea un producto sin fotos. */
function item(id: string, photo: string | null = `https://cdn/${id}.jpg`): WallapopItem {
  return {
    id,
    title: `Producto ${id}`,
    price: { amount: 10, currency: 'EUR' },
    web_slug: id,
    images: photo ? [{ id: 'img', urls: { small: '', medium: '', big: photo } }] : [],
  } as unknown as WallapopItem;
}

function telegramError(code: number, description = 'error'): GrammyError {
  return new GrammyError(description, { ok: false, error_code: code, description }, 'sendPhoto', {});
}

/** API falsa que registra los envíos; `fail` permite simular errores por método. */
function fakeApi(fail: { sendPhoto?: GrammyError; sendMessage?: GrammyError } = {}) {
  const sent: { method: string; chatId: string; photo?: string; text: string }[] = [];
  const api = {
    sendPhoto: async (chatId: string, photo: string, other: { caption: string }) => {
      if (fail.sendPhoto) throw fail.sendPhoto;
      sent.push({ method: 'sendPhoto', chatId, photo, text: other.caption });
    },
    sendMessage: async (chatId: string, text: string) => {
      if (fail.sendMessage) throw fail.sendMessage;
      sent.push({ method: 'sendMessage', chatId, text });
    },
  };
  return { sent, api: api as never };
}

describe('createTelegramNotifier', () => {
  const noop = { onUnreachable: async () => {} };

  it('envía cada producto como foto al chat del dueño, con nombre, precio y enlace', async () => {
    const { api, sent } = fakeApi();
    await createTelegramNotifier(api, noop)(subscription, [item('a'), item('b')]);

    assert.deepEqual(sent.map((s) => [s.method, s.chatId, s.photo]), [
      ['sendPhoto', '2', 'https://cdn/a.jpg'],
      ['sendPhoto', '2', 'https://cdn/b.jpg'],
    ]);
    assert.match(sent[0]!.text, /Producto a[\s\S]*10\s€[\s\S]*wallapop\.com\/item\/a/);
  });

  it('sin foto, envía solo el texto', async () => {
    const { api, sent } = fakeApi();
    await createTelegramNotifier(api, noop)(subscription, [item('a', null)]);
    assert.equal(sent[0]?.method, 'sendMessage');
  });

  it('si Telegram no puede usar la foto, envía solo el texto', async () => {
    const { api, sent } = fakeApi({ sendPhoto: telegramError(400, 'wrong file identifier/HTTP URL specified') });
    await createTelegramNotifier(api, noop)(subscription, [item('a')]);
    assert.deepEqual(sent.map((s) => s.method), ['sendMessage']);
  });

  it('si el usuario bloqueó el bot, avisa y deja de enviar sin lanzar error', async () => {
    const { api } = fakeApi({ sendPhoto: telegramError(403, 'Forbidden: bot was blocked by the user') });
    const unreachable: string[] = [];
    await createTelegramNotifier(api, { onUnreachable: async (id) => void unreachable.push(id) })(subscription, [item('a'), item('b')]);
    assert.deepEqual(unreachable, ['2']);
  });

  it('los demás errores se propagan para que el monitor reintente', async () => {
    const { api } = fakeApi({ sendPhoto: telegramError(500, 'Internal Server Error') });
    await assert.rejects(async () => createTelegramNotifier(api, noop)(subscription, [item('a')]), GrammyError);
  });
});
