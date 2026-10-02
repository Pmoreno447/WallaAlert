import { autoRetry } from '@grammyjs/auto-retry';
import { Bot, type BotConfig, type Context } from 'grammy';
import { accessComposer, requireApproved } from './access.js';
import { ADMIN_HELP, HELP, userIdOf, type BotDeps } from './deps.js';
import { mySearchesComposer } from './my-searches.js';
import { newSearchComposer } from './new-search.js';

/** Comandos que aparecen en el menú de Telegram. */
export const BOT_COMMANDS = [
  { command: 'busqueda', description: 'Crear una búsqueda nueva' },
  { command: 'busquedas', description: 'Ver, pausar o eliminar tus búsquedas' },
  { command: 'cancelar', description: 'Cancelar la búsqueda que estás creando' },
  { command: 'ayuda', description: 'Ver los comandos disponibles' },
  { command: 'id', description: 'Ver tu id de Telegram' },
];

/** El administrador ve además los comandos de administración en su menú. */
export const ADMIN_COMMANDS = [
  ...BOT_COMMANDS,
  { command: 'usuarios', description: 'Gestionar quién tiene acceso' },
];

export function createBot(token: string, deps: BotDeps, botConfig?: BotConfig<Context>): Bot {
  const bot = new Bot(token, botConfig);

  // Si Telegram responde "demasiadas peticiones", espera lo que indique y reintenta.
  bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 60 }));

  // Solo chats privados: en grupos el id del chat no es el del usuario.
  bot.use(async (ctx, next) => {
    if (ctx.chat?.type === 'private') await next();
  });

  bot.use(accessComposer(deps)); // /start, /id y solicitudes: accesibles sin estar aprobado
  bot.use(requireApproved(deps.access)); // a partir de aquí, solo usuarios con acceso
  bot.use(newSearchComposer(deps));
  bot.use(mySearchesComposer(deps));

  // Cualquier otro mensaje: se muestra la ayuda.
  bot.on('message', (ctx) =>
    ctx.reply(deps.access.isAdmin(userIdOf(ctx)) ? ADMIN_HELP : HELP, { parse_mode: 'HTML' }),
  );
  bot.on('callback_query', (ctx) => ctx.answerCallbackQuery());

  bot.catch(({ error, ctx }) => {
    console.error(`[bot] error procesando la actualización ${ctx.update.update_id}:`, error);
  });

  return bot;
}
