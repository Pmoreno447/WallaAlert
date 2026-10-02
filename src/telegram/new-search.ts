import { Composer, InlineKeyboard, type Context } from 'grammy';
import type { DraftStep, SearchDraft } from '../types.js';
import type { Category } from '../wallapop/categories.js';
import type { SearchFilters } from '../wallapop/types.js';
import { editOrIgnore, userIdOf, type BotDeps } from './deps.js';
import { escapeHtml, formatPrice, formatSubscription, parsePrice } from './format.js';

const MAX_TERM_LENGTH = 100;
const CANCEL_HINT = 'Escribe /cancelar para salir.';

/** Botones en filas de dos, con una primera fila para la opción "todas". */
function optionsKeyboard(first: { label: string; data: string }, options: Category[], prefix: string): InlineKeyboard {
  const keyboard = new InlineKeyboard().text(first.label, first.data).row();
  options.forEach((option, index) => {
    keyboard.text(option.name, `${prefix}${option.id}`);
    if (index % 2 === 1) keyboard.row();
  });
  return keyboard;
}

/**
 * /busqueda: crea una búsqueda paso a paso (nombre → precio máximo → precio mínimo
 * → categoría → subcategoría). El paso actual se guarda en la base de datos, así
 * que sobrevive a un reinicio del bot.
 */
export function newSearchComposer({ subscriptions, drafts, categories }: BotDeps): Composer<Context> {
  const composer = new Composer<Context>();

  async function askPrice(ctx: Context, which: 'máximo' | 'mínimo') {
    await ctx.reply(`💶 ¿Precio ${which}? Escribe un número en euros, p. ej. <i>150</i>.`, {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text('Sin límite', 'wiz:skip'),
    });
  }

  async function askCategory(ctx: Context) {
    let list: Category[] = [];
    try {
      list = await categories.list();
    } catch (error) {
      console.error('No se pudieron cargar las categorías:', error);
    }
    const note = list.length === 0 ? '\n(No he podido cargar las categorías de Wallapop; puedes seguir sin categoría.)' : '';
    await ctx.reply(`📂 Elige una categoría:${note}`, {
      reply_markup: optionsKeyboard({ label: '🌐 Todas las categorías', data: 'wiz:cat:any' }, list, 'wiz:cat:'),
    });
  }

  async function finish(ctx: Context, draft: SearchDraft) {
    const userId = userIdOf(ctx);
    const subscription = await subscriptions.add({ userId, term: draft.term!, filters: draft.filters });
    await drafts.delete(userId);
    const summary = formatSubscription(subscription, await categories.describe(subscription.filters));
    await ctx.reply(`✅ <b>Búsqueda guardada.</b> Te avisaré cuando se publique algo nuevo.\n\n${summary}\n\nGestiónala con /busquedas.`, {
      parse_mode: 'HTML',
    });
  }

  /** Guarda el precio del paso actual (undefined = sin límite) y pasa al siguiente. */
  async function applyPrice(ctx: Context, draft: SearchDraft, price: number | undefined) {
    const userId = userIdOf(ctx);
    const filters: SearchFilters = { ...draft.filters };

    if (draft.step === 'maxPrice') {
      if (price !== undefined) filters.maxPrice = price;
      await drafts.save(userId, { ...draft, filters, step: 'minPrice' });
      return askPrice(ctx, 'mínimo');
    }

    if (price !== undefined && filters.maxPrice !== undefined && price > filters.maxPrice) {
      return ctx.reply(
        `El precio mínimo no puede ser mayor que el máximo (${formatPrice(filters.maxPrice)}). Escribe otro o pulsa «Sin límite».`,
      );
    }
    if (price !== undefined) filters.minPrice = price;
    await drafts.save(userId, { ...draft, filters, step: 'category' });
    return askCategory(ctx);
  }

  /**
   * Borrador del usuario si está en uno de los pasos indicados. Si no (botón de un
   * mensaje antiguo), avisa y devuelve undefined.
   */
  async function draftAt(ctx: Context, steps: DraftStep[]): Promise<SearchDraft | undefined> {
    const draft = await drafts.get(userIdOf(ctx));
    if (draft && steps.includes(draft.step)) return draft;
    await ctx.answerCallbackQuery({ text: 'Este paso ya no está activo. Empieza de nuevo con /busqueda.' });
    return undefined;
  }

  composer.command('busqueda', async (ctx) => {
    await drafts.save(userIdOf(ctx), { step: 'term', filters: {} });
    await ctx.reply(`🔎 ¿Qué quieres buscar? Escribe el nombre del producto, p. ej. <i>nintendo 3ds</i>.\n\n${CANCEL_HINT}`, {
      parse_mode: 'HTML',
    });
  });

  composer.command('cancelar', async (ctx) => {
    const deleted = await drafts.delete(userIdOf(ctx));
    await ctx.reply(deleted ? '❌ Búsqueda cancelada.' : 'No estás creando ninguna búsqueda.');
  });

  composer.on('message:text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();
    const draft = await drafts.get(userIdOf(ctx));
    if (!draft) return next();

    switch (draft.step) {
      case 'term': {
        const term = ctx.message.text.trim().replace(/\s+/g, ' ');
        if (term.length > MAX_TERM_LENGTH) {
          return ctx.reply(`El nombre es demasiado largo (máximo ${MAX_TERM_LENGTH} caracteres). Prueba con uno más corto.`);
        }
        await drafts.save(userIdOf(ctx), { ...draft, term, step: 'maxPrice' });
        return askPrice(ctx, 'máximo');
      }
      case 'maxPrice':
      case 'minPrice': {
        const price = parsePrice(ctx.message.text);
        if (price === undefined) return ctx.reply('Escribe solo un número, p. ej. 150, o pulsa «Sin límite».');
        return applyPrice(ctx, draft, price);
      }
      case 'category':
      case 'subcategory':
        return ctx.reply(`Elige una opción con los botones del mensaje anterior. ${CANCEL_HINT}`);
    }
  });

  composer.callbackQuery('wiz:skip', async (ctx) => {
    const draft = await draftAt(ctx, ['maxPrice', 'minPrice']);
    if (!draft) return;
    await ctx.answerCallbackQuery();
    await editOrIgnore(() => ctx.editMessageReplyMarkup()); // quita el botón ya usado
    return applyPrice(ctx, draft, undefined);
  });

  composer.callbackQuery(/^wiz:cat:(any|\d+)$/, async (ctx) => {
    const draft = await draftAt(ctx, ['category']);
    if (!draft) return;
    await ctx.answerCallbackQuery();

    if (ctx.match[1] === 'any') {
      await editOrIgnore(() => ctx.editMessageText('📂 Categoría: todas'));
      return finish(ctx, draft);
    }

    const categoryId = Number(ctx.match[1]);
    const category = await categories.find(categoryId).catch(() => undefined);
    const updated: SearchDraft = { ...draft, filters: { ...draft.filters, categoryId } };
    await editOrIgnore(() => ctx.editMessageText(`📂 Categoría: ${escapeHtml(category?.name ?? String(categoryId))}`, { parse_mode: 'HTML' }));

    if (!category || category.subcategories.length === 0) return finish(ctx, updated);

    await drafts.save(userIdOf(ctx), { ...updated, step: 'subcategory' });
    await ctx.reply('🗂 Elige una subcategoría:', {
      reply_markup: optionsKeyboard({ label: '📦 Toda la categoría', data: 'wiz:sub:all' }, category.subcategories, 'wiz:sub:'),
    });
  });

  composer.callbackQuery(/^wiz:sub:(all|\d+)$/, async (ctx) => {
    const draft = await draftAt(ctx, ['subcategory']);
    if (!draft) return;
    await ctx.answerCallbackQuery();

    if (ctx.match[1] === 'all') {
      await editOrIgnore(() => ctx.editMessageText('🗂 Subcategoría: todas'));
      return finish(ctx, draft);
    }

    const subcategoryId = Number(ctx.match[1]);
    const category = await categories.find(draft.filters.categoryId!).catch(() => undefined);
    const name = category?.subcategories.find((s) => s.id === subcategoryId)?.name ?? String(subcategoryId);
    await editOrIgnore(() => ctx.editMessageText(`🗂 Subcategoría: ${escapeHtml(name)}`, { parse_mode: 'HTML' }));
    return finish(ctx, { ...draft, filters: { ...draft.filters, subcategoryId } });
  });

  return composer;
}
