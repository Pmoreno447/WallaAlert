import { Composer, InlineKeyboard, type Context } from 'grammy';
import type { Subscription } from '../types.js';
import { editOrIgnore, userIdOf, type BotDeps } from './deps.js';
import { escapeHtml, formatSubscription } from './format.js';

function subscriptionKeyboard(subscription: Subscription): InlineKeyboard {
  const toggle = subscription.paused
    ? { label: '▶️ Reanudar', data: `sub:resume:${subscription.id}` }
    : { label: '⏸ Pausar', data: `sub:pause:${subscription.id}` };
  return new InlineKeyboard().text(toggle.label, toggle.data).text('🗑 Eliminar', `sub:delete:${subscription.id}`);
}

/** /busquedas: lista las búsquedas del usuario, cada una con botones para pausar/reanudar y eliminar. */
export function mySearchesComposer({ subscriptions, categories }: BotDeps): Composer<Context> {
  const composer = new Composer<Context>();

  const render = async (subscription: Subscription) =>
    formatSubscription(subscription, await categories.describe(subscription.filters));

  composer.command('busquedas', async (ctx) => {
    const list = await subscriptions.listByUser(userIdOf(ctx));
    if (list.length === 0) {
      await ctx.reply('No tienes ninguna búsqueda. Crea una con /busqueda.');
      return;
    }
    for (const subscription of list) {
      await ctx.reply(await render(subscription), { parse_mode: 'HTML', reply_markup: subscriptionKeyboard(subscription) });
    }
  });

  composer.callbackQuery(/^sub:(pause|resume|delete):([\w-]+)$/, async (ctx) => {
    const [, action, id] = ctx.match as [string, 'pause' | 'resume' | 'delete', string];
    const subscription = await subscriptions.get(id);

    // Cada usuario solo puede tocar sus propias búsquedas.
    if (!subscription || subscription.userId !== userIdOf(ctx)) {
      await ctx.answerCallbackQuery({ text: 'Esa búsqueda ya no existe' });
      return editOrIgnore(() => ctx.editMessageReplyMarkup());
    }

    if (action === 'delete') {
      await subscriptions.remove(id);
      await ctx.answerCallbackQuery({ text: 'Búsqueda eliminada' });
      return editOrIgnore(() => ctx.editMessageText(`🗑 Eliminada: <s>${escapeHtml(subscription.term)}</s>`, { parse_mode: 'HTML' }));
    }

    const updated = (action === 'pause' ? await subscriptions.pause(id) : await subscriptions.resume(id))!;
    await ctx.answerCallbackQuery({ text: action === 'pause' ? 'Búsqueda pausada' : 'Búsqueda reanudada' });
    const text = await render(updated);
    return editOrIgnore(() => ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: subscriptionKeyboard(updated) }));
  });

  return composer;
}
