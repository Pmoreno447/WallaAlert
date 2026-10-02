import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { Update, UserFromGetMe } from 'grammy/types';
import { SubscriptionService } from '../../src/subscriptions/service.js';
import { createBot } from '../../src/telegram/bot.js';
import { AccessService } from '../../src/users/access.js';
import { CategoryCatalog, type Category } from '../../src/wallapop/categories.js';
import { createStores } from '../storage/create-stores.js';

const BOT_INFO = {
  id: 999,
  is_bot: true,
  first_name: 'Test',
  username: 'test_bot',
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
} as UserFromGetMe;

const CATEGORIES: Category[] = [
  { id: 24200, name: 'Tecnología', subcategories: [{ id: 24203, name: 'Consolas', subcategories: [] }] },
  { id: 100, name: 'Coches', subcategories: [] },
];

interface TestUser {
  id: number;
  first_name: string;
  username?: string;
}
const ADMIN: TestUser = { id: 1, first_name: 'Admin' };
const ANA: TestUser = { id: 2, first_name: 'Ana', username: 'ana' };
const LUIS: TestUser = { id: 3, first_name: 'Luis' };

interface ApiCall {
  method: string;
  payload: Record<string, any>;
}

/**
 * Bot real con todas sus piezas sobre SQLite en memoria. Las llamadas a la API de
 * Telegram no salen a internet: se registran en `calls` y se responden con éxito.
 */
function createTestBot() {
  const stores = createStores();
  const subscriptions = new SubscriptionService(stores.subscriptions, stores.seen);
  const access = new AccessService(stores.users, subscriptions, String(ADMIN.id));
  const bot = createBot(
    'test-token',
    { access, subscriptions, drafts: stores.drafts, categories: new CategoryCatalog(async () => CATEGORIES) },
    { botInfo: BOT_INFO },
  );

  const calls: ApiCall[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, any> });
    const result = method.startsWith('send')
      ? { message_id: calls.length, date: 0, chat: { id: Number((payload as any).chat_id), type: 'private' } }
      : true;
    return { ok: true, result } as any;
  });

  let updateId = 0;
  const chatOf = (user: TestUser) => ({ id: user.id, type: 'private' as const, first_name: user.first_name });
  const fromOf = (user: TestUser) => ({ ...user, is_bot: false });

  /** Simula que `user` envía un mensaje de texto. */
  async function send(user: TestUser, text: string, chat: object = chatOf(user)) {
    const command = text.startsWith('/') ? text.split(' ')[0]! : undefined;
    const update = {
      update_id: ++updateId,
      message: {
        message_id: updateId,
        date: 0,
        chat,
        from: fromOf(user),
        text,
        ...(command && { entities: [{ type: 'bot_command', offset: 0, length: command.length }] }),
      },
    } as Update;
    await bot.handleUpdate(update);
  }

  /** Simula que `user` pulsa un botón con este callback_data. */
  async function press(user: TestUser, data: string) {
    const update = {
      update_id: ++updateId,
      callback_query: {
        id: String(updateId),
        from: fromOf(user),
        chat_instance: '1',
        data,
        message: { message_id: 1, date: 0, chat: chatOf(user), text: '' },
      },
    } as Update;
    await bot.handleUpdate(update);
  }

  /** Mensajes enviados a un usuario (sendMessage), en orden. */
  const messagesTo = (user: TestUser) =>
    calls.filter((c) => c.method === 'sendMessage' && Number(c.payload.chat_id) === user.id);
  const lastMessageTo = (user: TestUser) => messagesTo(user).at(-1);
  /** callback_data de todos los botones de una llamada. */
  const buttonsOf = (call: ApiCall | undefined): string[] =>
    (call?.payload.reply_markup?.inline_keyboard ?? []).flat().map((b: { callback_data: string }) => b.callback_data);
  const callbackAnswers = () => calls.filter((c) => c.method === 'answerCallbackQuery').map((c) => c.payload.text);
  const lastEdit = () => calls.filter((c) => c.method === 'editMessageText').at(-1);

  async function grantAccess(user: TestUser) {
    await access.requestAccess({ id: String(user.id), username: user.username ?? null, firstName: user.first_name });
    await access.approve(String(user.id));
  }

  return { bot, calls, stores, subscriptions, access, send, press, messagesTo, lastMessageTo, buttonsOf, callbackAnswers, lastEdit, grantAccess };
}

type TestBot = ReturnType<typeof createTestBot>;

describe('Bot: acceso', () => {
  let t: TestBot;
  beforeEach(() => {
    t = createTestBot();
  });

  it('un desconocido no puede usar los comandos', async () => {
    await t.send(ANA, '/busqueda');
    assert.match(t.lastMessageTo(ANA)?.payload.text, /No tienes acceso/);
    assert.equal(await t.stores.drafts.get(String(ANA.id)), undefined);
  });

  it('con /start un desconocido ve el botón para solicitar acceso', async () => {
    await t.send(ANA, '/start');
    assert.deepEqual(t.buttonsOf(t.lastMessageTo(ANA)), ['access:request']);
  });

  it('al solicitar acceso, el administrador recibe la solicitud con botones para aceptar o rechazar', async () => {
    await t.press(ANA, 'access:request');

    const toAdmin = t.lastMessageTo(ADMIN);
    assert.match(toAdmin?.payload.text, /Nueva solicitud[\s\S]*Ana \(@ana\)/);
    assert.deepEqual(t.buttonsOf(toAdmin), ['access:approve:2', 'access:reject:2']);
    assert.equal((await t.access.getUser('2'))?.status, 'pending');
  });

  it('solicitarlo dos veces no vuelve a avisar al administrador', async () => {
    await t.press(ANA, 'access:request');
    await t.press(ANA, 'access:request');
    assert.equal(t.messagesTo(ADMIN).length, 1);
  });

  it('cuando el administrador acepta, el usuario recibe aviso y ya puede usar el bot', async () => {
    await t.press(ANA, 'access:request');
    await t.press(ADMIN, 'access:approve:2');

    assert.match(t.lastMessageTo(ANA)?.payload.text, /Ya tienes acceso/);
    await t.send(ANA, '/busqueda');
    assert.match(t.lastMessageTo(ANA)?.payload.text, /Qué quieres buscar/);
  });

  it('cuando el administrador rechaza, el usuario recibe aviso y sigue sin acceso', async () => {
    await t.press(ANA, 'access:request');
    await t.press(ADMIN, 'access:reject:2');

    assert.match(t.lastMessageTo(ANA)?.payload.text, /rechazado/);
    assert.equal(await t.access.isApproved('2'), false);
  });

  it('solo el administrador puede aceptar solicitudes', async () => {
    await t.grantAccess(LUIS);
    await t.press(ANA, 'access:request');

    await t.press(LUIS, 'access:approve:2');
    await t.press(ANA, 'access:approve:2');

    assert.equal((await t.access.getUser('2'))?.status, 'pending');
  });

  it('revocar el acceso pausa las búsquedas del usuario y le avisa', async () => {
    await t.grantAccess(ANA);
    await t.subscriptions.add({ userId: '2', term: '3ds', filters: {} });

    await t.press(ADMIN, 'access:reject:2');

    assert.match(t.lastMessageTo(ANA)?.payload.text, /retirado el acceso/);
    assert.equal((await t.subscriptions.listByUser('2'))[0]?.paused, true);
  });

  it('/usuarios muestra al administrador cada usuario con sus botones', async () => {
    await t.press(ANA, 'access:request');
    await t.grantAccess(LUIS);
    t.calls.length = 0;

    await t.send(ADMIN, '/usuarios');

    const messages = t.messagesTo(ADMIN);
    assert.equal(messages.length, 2);
    assert.deepEqual(t.buttonsOf(messages[0]), ['access:approve:2', 'access:reject:2']); // pendiente primero
    assert.deepEqual(t.buttonsOf(messages[1]), ['access:reject:3']);
  });

  it('/ayuda muestra a quien no tiene acceso cómo solicitarlo', async () => {
    await t.send(ANA, '/ayuda');
    const text = t.lastMessageTo(ANA)?.payload.text;
    assert.match(text, /privado[\s\S]*\/start/);
    assert.doesNotMatch(text, /\/busqueda/);
  });

  it('/ayuda muestra a un usuario sus comandos, sin los de administración', async () => {
    await t.grantAccess(ANA);
    await t.send(ANA, '/ayuda');
    const text = t.lastMessageTo(ANA)?.payload.text;
    assert.match(text, /\/busqueda[\s\S]*\/busquedas[\s\S]*\/cancelar/);
    assert.doesNotMatch(text, /\/usuarios/);
  });

  it('/ayuda muestra al administrador también /usuarios, y /help funciona igual', async () => {
    await t.send(ADMIN, '/ayuda');
    await t.send(ADMIN, '/help');
    const [ayuda, help] = t.messagesTo(ADMIN);
    assert.match(ayuda?.payload.text, /\/busqueda[\s\S]*\/usuarios/);
    assert.equal(help?.payload.text, ayuda?.payload.text);
  });

  it('el administrador puede crear búsquedas sin haber solicitado acceso', async () => {
    await t.send(ADMIN, '/busqueda');
    await t.send(ADMIN, '3ds');
    await t.press(ADMIN, 'wiz:skip');
    await t.press(ADMIN, 'wiz:skip');
    await t.press(ADMIN, 'wiz:cat:any');

    assert.equal((await t.subscriptions.listByUser(String(ADMIN.id)))[0]?.term, '3ds');
  });

  it('ignora los mensajes de grupos', async () => {
    await t.send(ADMIN, '/start', { id: -100, type: 'group', title: 'Grupo' });
    assert.deepEqual(t.calls, []);
  });
});

describe('Bot: /busqueda', () => {
  let t: TestBot;
  beforeEach(async () => {
    t = createTestBot();
    await t.grantAccess(ANA);
  });

  it('crea la búsqueda paso a paso con precio, categoría y subcategoría', async () => {
    await t.send(ANA, '/busqueda');
    await t.send(ANA, '  nintendo   3ds ');
    assert.match(t.lastMessageTo(ANA)?.payload.text, /Precio máximo/);
    await t.send(ANA, '100');
    assert.match(t.lastMessageTo(ANA)?.payload.text, /Precio mínimo/);
    await t.send(ANA, '20,5');
    assert.deepEqual(t.buttonsOf(t.lastMessageTo(ANA)), ['wiz:cat:any', 'wiz:cat:24200', 'wiz:cat:100']);
    await t.press(ANA, 'wiz:cat:24200');
    assert.deepEqual(t.buttonsOf(t.lastMessageTo(ANA)), ['wiz:sub:all', 'wiz:sub:24203']);
    await t.press(ANA, 'wiz:sub:24203');

    const [subscription] = await t.subscriptions.listByUser('2');
    assert.equal(subscription?.term, 'nintendo 3ds');
    assert.deepEqual(subscription?.filters, { maxPrice: 100, minPrice: 20.5, categoryId: 24200, subcategoryId: 24203 });
    assert.match(t.lastMessageTo(ANA)?.payload.text, /Búsqueda guardada[\s\S]*Tecnología › Consolas/);
    assert.equal(await t.stores.drafts.get('2'), undefined);
  });

  it('permite saltarse los precios y la categoría', async () => {
    await t.send(ANA, '/busqueda');
    await t.send(ANA, '3ds');
    await t.press(ANA, 'wiz:skip');
    await t.press(ANA, 'wiz:skip');
    await t.press(ANA, 'wiz:cat:any');

    const [subscription] = await t.subscriptions.listByUser('2');
    assert.deepEqual(subscription?.filters, {});
  });

  it('una categoría sin subcategorías termina la búsqueda directamente', async () => {
    await t.send(ANA, '/busqueda');
    await t.send(ANA, 'seat ibiza');
    await t.press(ANA, 'wiz:skip');
    await t.press(ANA, 'wiz:skip');
    await t.press(ANA, 'wiz:cat:100');

    const [subscription] = await t.subscriptions.listByUser('2');
    assert.deepEqual(subscription?.filters, { categoryId: 100 });
  });

  it('rechaza un precio que no es un número y sigue en el mismo paso', async () => {
    await t.send(ANA, '/busqueda');
    await t.send(ANA, '3ds');
    await t.send(ANA, 'barato');

    assert.match(t.lastMessageTo(ANA)?.payload.text, /Escribe solo un número/);
    assert.equal((await t.stores.drafts.get('2'))?.step, 'maxPrice');
  });

  it('rechaza un precio mínimo mayor que el máximo', async () => {
    await t.send(ANA, '/busqueda');
    await t.send(ANA, '3ds');
    await t.send(ANA, '50');
    await t.send(ANA, '80');

    assert.match(t.lastMessageTo(ANA)?.payload.text, /no puede ser mayor que el máximo/);
    assert.equal((await t.stores.drafts.get('2'))?.step, 'minPrice');
  });

  it('/cancelar descarta la búsqueda en curso', async () => {
    await t.send(ANA, '/busqueda');
    await t.send(ANA, '3ds');
    await t.send(ANA, '/cancelar');

    assert.match(t.lastMessageTo(ANA)?.payload.text, /cancelada/);
    assert.equal(await t.stores.drafts.get('2'), undefined);
    assert.deepEqual(await t.subscriptions.listByUser('2'), []);
  });

  it('los botones de un paso que ya pasó no hacen nada', async () => {
    await t.send(ANA, '/busqueda');
    await t.send(ANA, '3ds');
    await t.press(ANA, 'wiz:cat:24200');

    assert.match(t.callbackAnswers().at(-1), /ya no está activo/);
    assert.equal((await t.stores.drafts.get('2'))?.step, 'maxPrice');
  });

  it('el borrador de cada usuario es independiente', async () => {
    await t.grantAccess(LUIS);
    await t.send(ANA, '/busqueda');
    await t.send(LUIS, '/busqueda');
    await t.send(ANA, '3ds');

    assert.equal((await t.stores.drafts.get('2'))?.term, '3ds');
    assert.equal((await t.stores.drafts.get('3'))?.step, 'term');
  });
});

describe('Bot: /busquedas', () => {
  let t: TestBot;
  beforeEach(async () => {
    t = createTestBot();
    await t.grantAccess(ANA);
    await t.grantAccess(LUIS);
  });

  it('sin búsquedas, lo indica', async () => {
    await t.send(ANA, '/busquedas');
    assert.match(t.lastMessageTo(ANA)?.payload.text, /No tienes ninguna búsqueda/);
  });

  it('muestra solo las búsquedas del usuario, cada una con sus botones', async () => {
    const a = await t.subscriptions.add({ userId: '2', term: '3ds', filters: { maxPrice: 100 } });
    const b = await t.subscriptions.add({ userId: '2', term: 'ps5', filters: {} });
    await t.subscriptions.add({ userId: '3', term: 'de luis', filters: {} });
    await t.subscriptions.pause(b.id);

    await t.send(ANA, '/busquedas');

    const [first, second] = t.messagesTo(ANA);
    assert.equal(t.messagesTo(ANA).length, 2);
    assert.match(first?.payload.text, /3ds[\s\S]*hasta 100[\s\S]*Activa/);
    assert.deepEqual(t.buttonsOf(first), [`sub:pause:${a.id}`, `sub:delete:${a.id}`]);
    assert.deepEqual(t.buttonsOf(second), [`sub:resume:${b.id}`, `sub:delete:${b.id}`]);
  });

  it('pausar y reanudar cambian el estado y actualizan el mensaje', async () => {
    const sub = await t.subscriptions.add({ userId: '2', term: '3ds', filters: {} });

    await t.press(ANA, `sub:pause:${sub.id}`);
    assert.equal((await t.subscriptions.get(sub.id))?.paused, true);
    assert.match(t.lastEdit()?.payload.text, /Pausada/);
    assert.deepEqual(t.buttonsOf(t.lastEdit()), [`sub:resume:${sub.id}`, `sub:delete:${sub.id}`]);

    await t.press(ANA, `sub:resume:${sub.id}`);
    assert.equal((await t.subscriptions.get(sub.id))?.paused, false);
    assert.match(t.lastEdit()?.payload.text, /Activa/);
  });

  it('eliminar borra la búsqueda', async () => {
    const sub = await t.subscriptions.add({ userId: '2', term: '3ds', filters: {} });
    await t.press(ANA, `sub:delete:${sub.id}`);

    assert.equal(await t.subscriptions.get(sub.id), undefined);
    assert.match(t.lastEdit()?.payload.text, /Eliminada/);
  });

  it('nadie puede pausar ni eliminar las búsquedas de otro usuario', async () => {
    const sub = await t.subscriptions.add({ userId: '2', term: '3ds', filters: {} });

    await t.press(LUIS, `sub:pause:${sub.id}`);
    await t.press(LUIS, `sub:delete:${sub.id}`);

    assert.deepEqual(await t.subscriptions.get(sub.id), sub);
    assert.match(t.callbackAnswers().at(-1), /ya no existe/);
  });
});
