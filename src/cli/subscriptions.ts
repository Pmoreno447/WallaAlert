import { config } from '../config.js';
import { openDatabase } from '../storage/database.js';
import { SqliteSeenStore, SqliteSubscriptionStore } from '../storage/sqlite.js';
import { SubscriptionService } from '../subscriptions/service.js';
import { parseCliArgs } from './args.js';

// Gestión de suscripciones desde la terminal, mientras no exista el bot.
const USAGE = `Uso:
  add <término> --user ID [--min N] [--max N] [--category ID] [--subcategory ID]
  list [--user ID]
  pause <id>
  resume <id>
  remove <id>`;

/** Extrae `--user <id>` de los argumentos, ya que parseCliArgs no lo conoce. */
function extractUser(args: string[]): { userId: string | undefined; rest: string[] } {
  const rest = [...args];
  const index = rest.findIndex((arg) => arg === '--user' || arg.startsWith('--user='));
  if (index === -1) return { userId: undefined, rest };
  const arg = rest[index]!;
  if (arg.includes('=')) {
    rest.splice(index, 1);
    return { userId: arg.slice('--user='.length), rest };
  }
  const [, userId] = rest.splice(index, 2);
  return { userId, rest };
}

function requireId(rest: string[]): string {
  const [id] = rest;
  if (!id) throw new Error('Falta el id de la suscripción');
  return id;
}

const [command, ...args] = process.argv.slice(2);
const db = openDatabase(config.database.path);
const service = new SubscriptionService(
  new SqliteSubscriptionStore(db),
  new SqliteSeenStore(db, config.monitor.maxSeenPerSubscription),
);

try {
  const { userId, rest } = extractUser(args);

  switch (command) {
    case 'add': {
      const { term, filters } = parseCliArgs(rest);
      if (!term) throw new Error('Falta el término de búsqueda');
      if (!userId) throw new Error('Falta --user con el id de Telegram que recibirá los avisos');
      const subscription = await service.add({ userId, term, filters });
      console.log(`Añadida ${subscription.id}: "${term}" ${JSON.stringify(filters)} (usuario ${subscription.userId})`);
      break;
    }
    case 'list': {
      const list = userId ? await service.listByUser(userId) : await service.list();
      if (list.length === 0) console.log('No hay suscripciones');
      for (const s of list) {
        const status = s.paused ? 'pausada' : 'activa ';
        console.log(`${s.id}  ${status}  [${s.userId}]  "${s.term}" ${JSON.stringify(s.filters)}`);
      }
      break;
    }
    case 'pause': {
      const id = requireId(rest);
      const subscription = await service.pause(id);
      console.log(subscription ? `Pausada ${id}: "${subscription.term}"` : `No existe ninguna suscripción con id ${id}`);
      break;
    }
    case 'resume': {
      const id = requireId(rest);
      const subscription = await service.resume(id);
      console.log(subscription ? `Reactivada ${id}: "${subscription.term}"` : `No existe ninguna suscripción con id ${id}`);
      break;
    }
    case 'remove': {
      const id = requireId(rest);
      console.log((await service.remove(id)) ? `Eliminada ${id}` : `No existe ninguna suscripción con id ${id}`);
      break;
    }
    default:
      console.log(USAGE);
      process.exitCode = command ? 1 : 0;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  db.close();
}
