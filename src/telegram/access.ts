import { Composer, InlineKeyboard, type Context, type MiddlewareFn } from 'grammy';
import type { User } from '../types.js';
import type { AccessService } from '../users/access.js';
import { ADMIN_HELP, HELP, NO_ACCESS_HELP, editOrIgnore, userIdOf, type BotDeps } from './deps.js';
import { displayName, escapeHtml } from './format.js';

const STATUS_TEXT: Record<User['status'], string> = {
  pending: '⏳ Pendiente',
  approved: '✅ Con acceso',
  rejected: '⛔ Sin acceso',
};

function formatUser(user: User): string {
  return `${escapeHtml(displayName(user))}\nId: <code>${user.id}</code>\n${STATUS_TEXT[user.status]}`;
}

/** Botones que ve el administrador para cada usuario según su estado. */
function userKeyboard(user: User): InlineKeyboard {
  switch (user.status) {
    case 'pending':
      return new InlineKeyboard().text('✅ Aceptar', `access:approve:${user.id}`).text('❌ Rechazar', `access:reject:${user.id}`);
    case 'approved':
      return new InlineKeyboard().text('⛔ Revocar acceso', `access:reject:${user.id}`);
    case 'rejected':
      return new InlineKeyboard().text('✅ Dar acceso', `access:approve:${user.id}`);
  }
}

/** /start, /id, solicitudes de acceso y la gestión de usuarios del administrador. */
export function accessComposer({ access }: BotDeps): Composer<Context> {
  const composer = new Composer<Context>();

  /** La ayuda que corresponde a cada usuario según su acceso. */
  async function helpFor(userId: string): Promise<string> {
    if (access.isAdmin(userId)) return ADMIN_HELP;
    return (await access.isApproved(userId)) ? HELP : NO_ACCESS_HELP;
  }

  composer.command('id', (ctx) => ctx.reply(`Tu id de Telegram es <code>${userIdOf(ctx)}</code>`, { parse_mode: 'HTML' }));

  // Accesible para todos, también sin acceso, para que cualquiera sepa qué puede hacer.
  composer.command(['ayuda', 'help'], async (ctx) => {
    await ctx.reply(await helpFor(userIdOf(ctx)), { parse_mode: 'HTML' });
  });

  composer.command('start', async (ctx) => {
    const userId = userIdOf(ctx);
    if (await access.isApproved(userId)) {
      return ctx.reply(`👋 ¡Hola!\n\n${await helpFor(userId)}`, { parse_mode: 'HTML' });
    }

    const user = await access.getUser(userId);
    if (user?.status === 'pending') return ctx.reply('⏳ Tu solicitud de acceso está pendiente. Te avisaré cuando se revise.');
    if (user?.status === 'rejected') return ctx.reply('⛔ No tienes acceso a este bot.');
    return ctx.reply('🔒 Este bot es privado. Para usarlo, solicita acceso al administrador.', {
      reply_markup: new InlineKeyboard().text('🙋 Solicitar acceso', 'access:request'),
    });
  });

  composer.callbackQuery('access:request', async (ctx) => {
    const { user, created } = await access.requestAccess({
      id: userIdOf(ctx),
      username: ctx.from.username ?? null,
      firstName: ctx.from.first_name ?? null,
    });
    await ctx.answerCallbackQuery();

    if (user.status === 'approved') {
      return editOrIgnore(() => ctx.editMessageText(`✅ Ya tienes acceso.\n\n${HELP}`, { parse_mode: 'HTML' }));
    }
    if (user.status === 'rejected') {
      return editOrIgnore(() => ctx.editMessageText('⛔ No tienes acceso a este bot.'));
    }
    await editOrIgnore(() => ctx.editMessageText('📨 Solicitud enviada. Te avisaré cuando el administrador la revise.'));

    if (created) {
      try {
        await ctx.api.sendMessage(access.adminId, `🙋 <b>Nueva solicitud de acceso</b>\n${formatUser(user)}`, {
          parse_mode: 'HTML',
          reply_markup: userKeyboard(user),
        });
      } catch (error) {
        // p. ej. el administrador aún no ha abierto el bot; la solicitud queda guardada y se ve en /usuarios
        console.error('No se pudo avisar al administrador de una solicitud:', error);
      }
    }
  });

  const admin = composer.filter((ctx) => ctx.from !== undefined && access.isAdmin(String(ctx.from.id)));

  admin.command('usuarios', async (ctx) => {
    const users = (await access.listUsers()).filter((u) => !access.isAdmin(u.id));
    if (users.length === 0) {
      await ctx.reply('Todavía no ha pedido acceso nadie.');
      return;
    }
    for (const user of users) {
      await ctx.reply(formatUser(user), { parse_mode: 'HTML', reply_markup: userKeyboard(user) });
    }
  });

  admin.callbackQuery(/^access:(approve|reject):(\d+)$/, async (ctx) => {
    const [, action, userId] = ctx.match as [string, 'approve' | 'reject', string];
    const before = await access.getUser(userId);
    if (!before || access.isAdmin(userId)) {
      await ctx.answerCallbackQuery({ text: 'Ese usuario no existe' });
      return;
    }

    const user = action === 'approve' ? await access.approve(userId) : await access.reject(userId);
    await ctx.answerCallbackQuery({ text: action === 'approve' ? 'Acceso concedido' : 'Acceso denegado' });
    await editOrIgnore(() => ctx.editMessageText(formatUser(user!), { parse_mode: 'HTML', reply_markup: userKeyboard(user!) }));

    if (before.status === user!.status) return; // ya estaba así: no se avisa otra vez
    const message =
      action === 'approve'
        ? `✅ ¡Ya tienes acceso!\n\n${HELP}`
        : before.status === 'approved'
          ? '⛔ El administrador te ha retirado el acceso. Tus búsquedas se han pausado.'
          : '⛔ El administrador ha rechazado tu solicitud de acceso.';
    try {
      await ctx.api.sendMessage(userId, message, { parse_mode: 'HTML' });
    } catch (error) {
      console.error(`No se pudo avisar al usuario ${userId}:`, error);
    }
  });

  return composer;
}

/** Corta cualquier otra interacción de quien no tenga acceso. */
export function requireApproved(access: AccessService): MiddlewareFn<Context> {
  return async (ctx, next) => {
    if (!ctx.from) return;
    if (await access.isApproved(String(ctx.from.id))) return next();

    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: 'No tienes acceso a este bot', show_alert: true });
    } else {
      await ctx.reply('🔒 No tienes acceso a este bot. Usa /start para solicitarlo.');
    }
  };
}
