import { GrammyError, type Api } from 'grammy';
import type { Notifier } from '../monitor/monitor.js';
import { itemCaption } from './format.js';

export interface TelegramNotifierOptions {
  /** Se llama cuando el usuario ha bloqueado el bot o ya no se le puede escribir. */
  onUnreachable: (userId: string) => Promise<void>;
}

/** Telegram responde 403 si el usuario bloqueó el bot o borró su cuenta. */
function isUnreachable(error: unknown): boolean {
  return error instanceof GrammyError && error.error_code === 403;
}

/**
 * Envía cada producto nuevo al chat del dueño de la suscripción: la primera foto
 * con el nombre, el precio y el enlace en el pie. Si no hay foto o Telegram no
 * puede descargarla, envía solo el texto.
 */
export function createTelegramNotifier(
  api: Pick<Api, 'sendPhoto' | 'sendMessage'>,
  options: TelegramNotifierOptions,
): Notifier {
  return async (subscription, items) => {
    const chatId = subscription.userId;

    for (const item of items) {
      const caption = itemCaption(subscription, item);
      const photo = item.images[0]?.urls.big ?? item.images[0]?.urls.medium;

      try {
        if (photo) {
          try {
            await api.sendPhoto(chatId, photo, { caption, parse_mode: 'HTML' });
            continue;
          } catch (error) {
            // 400: Telegram no ha podido descargar o procesar la imagen → se envía sin foto.
            if (!(error instanceof GrammyError && error.error_code === 400)) throw error;
          }
        }
        await api.sendMessage(chatId, caption, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
      } catch (error) {
        if (isUnreachable(error)) {
          await options.onUnreachable(subscription.userId);
          return; // no tiene sentido seguir enviando ni reintentar
        }
        throw error;
      }
    }
  };
}
