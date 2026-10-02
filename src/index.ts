import { GrammyError } from 'grammy';
import { config } from './config.js';
import { Monitor } from './monitor/monitor.js';
import { openDatabase } from './storage/database.js';
import { SqliteDraftStore, SqliteSeenStore, SqliteSubscriptionStore, SqliteUserStore } from './storage/sqlite.js';
import { SubscriptionService } from './subscriptions/service.js';
import { ADMIN_COMMANDS, BOT_COMMANDS, createBot } from './telegram/bot.js';
import { createTelegramNotifier } from './telegram/notifier.js';
import { AccessService } from './users/access.js';
import { CategoryCatalog } from './wallapop/categories.js';

const { token, adminId } = config.telegram;
if (!token || !adminId) {
  console.error('Faltan variables de entorno: TELEGRAM_BOT_TOKEN y TELEGRAM_ADMIN_ID (copia .env.example a .env y rellénalo).');
  process.exit(1);
}

/** Fecha y hora local, p. ej. "03/10/2026 14:03:12". La zona horaria se puede cambiar con la variable TZ. */
function timestamp(): string {
  return new Date()
    .toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    .replace(',', '');
}

const plural = (n: number, singular: string, pluralForm: string) => `${n} ${n === 1 ? singular : pluralForm}`;

const db = openDatabase(config.database.path);
const subscriptionStore = new SqliteSubscriptionStore(db);
const seen = new SqliteSeenStore(db, config.monitor.maxSeenPerSubscription);
const subscriptions = new SubscriptionService(subscriptionStore, seen);
const access = new AccessService(new SqliteUserStore(db), subscriptions, adminId);

const bot = createBot(token, {
  access,
  subscriptions,
  drafts: new SqliteDraftStore(db),
  categories: new CategoryCatalog(),
});

const monitor = new Monitor({
  subscriptions: subscriptionStore,
  seen,
  intervalMs: config.monitor.intervalMs,
  requestDelayMs: config.monitor.requestDelayMs,
  onCheck: ({ users, subscriptions }) => {
    console.log(`[${timestamp()}] Comprobando búsquedas: ${plural(users, 'usuario', 'usuarios')}, ${plural(subscriptions, 'búsqueda', 'búsquedas')}`);
  },
  notify: createTelegramNotifier(bot.api, {
    onUnreachable: async (userId) => {
      const paused = await subscriptions.pauseAllByUser(userId);
      console.warn(`[monitor] el usuario ${userId} ha bloqueado el bot: ${paused} búsquedas pausadas`);
    },
  }),
});

try {
  await bot.api.setMyCommands(BOT_COMMANDS);
} catch (error) {
  const unauthorized = error instanceof GrammyError && error.error_code === 401;
  console.error(unauthorized ? 'El token de Telegram no es válido: revisa TELEGRAM_BOT_TOKEN.' : error);
  db.close();
  process.exit(1);
}

try {
  await bot.api.setMyCommands(ADMIN_COMMANDS, { scope: { type: 'chat', chat_id: Number(adminId) } });
} catch (error) {
  // Telegram no deja configurar el menú de un chat que aún no ha hablado con el bot.
  console.warn('No se pudo configurar el menú del administrador (¿has abierto ya el bot?):', error instanceof Error ? error.message : error);
}

void bot.start({
  onStart: (info) => {
    console.log(`Bot @${info.username} conectado · base de datos: ${config.database.path}`);
    monitor.start();
  },
});

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await Promise.all([bot.stop(), monitor.stop()]);
  db.close();
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown); // lo envía `docker stop`
