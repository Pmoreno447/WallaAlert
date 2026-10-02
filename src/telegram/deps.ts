import { GrammyError, type Context } from 'grammy';
import type { DraftStore } from '../storage/types.js';
import type { SubscriptionService } from '../subscriptions/service.js';
import type { AccessService } from '../users/access.js';
import type { CategoryCatalog } from '../wallapop/categories.js';

/** Todo lo que necesitan los manejadores del bot. */
export interface BotDeps {
  access: AccessService;
  subscriptions: SubscriptionService;
  drafts: DraftStore;
  categories: CategoryCatalog;
}

export const HELP = `<b>Cómo funciona</b>
Crea una búsqueda y te enviaré cada anuncio nuevo que se publique en Wallapop, con su foto, precio y enlace.

<b>Comandos</b>
/busqueda – crear una búsqueda nueva
/busquedas – ver, pausar o eliminar tus búsquedas
/cancelar – cancelar la búsqueda que estás creando
/ayuda – ver esta ayuda
/id – ver tu id de Telegram`;

export const ADMIN_HELP = `${HELP}

<b>Administración</b>
/usuarios – aceptar solicitudes y gestionar quién tiene acceso`;

export const NO_ACCESS_HELP = `🔒 Este bot es privado: para usarlo necesitas que el administrador te dé acceso.

<b>Comandos</b>
/start – solicitar acceso
/ayuda – ver esta ayuda
/id – ver tu id de Telegram`;

/** Id del usuario que envía el mensaje o pulsa el botón. En chats privados es también el id del chat. */
export function userIdOf(ctx: Context): string {
  if (!ctx.from) throw new Error('Actualización sin remitente');
  return String(ctx.from.id);
}

/**
 * Edita el mensaje del botón pulsado. Ignora el error de Telegram cuando el
 * contenido no cambia (p. ej. al pulsar dos veces el mismo botón).
 */
export async function editOrIgnore(edit: () => Promise<unknown>): Promise<void> {
  try {
    await edit();
  } catch (error) {
    if (error instanceof GrammyError && error.description.includes('message is not modified')) return;
    throw error;
  }
}
