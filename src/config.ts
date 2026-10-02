import { readFileSync } from 'node:fs';
import type { SearchFilters } from './wallapop/types.js';

export interface ApiConfig {
  baseUrl: string;
  categoriesUrl: string;
  searchParam: string;
  /** Nombre del parámetro de la URL para cada filtro. */
  filterParams: Record<keyof SearchFilters, string>;
  defaultParams?: Record<string, string>;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface MonitorConfig {
  /** Tiempo entre el final de una comprobación y el inicio de la siguiente. */
  intervalMs: number;
  /** Pausa entre peticiones a la API dentro de una misma comprobación. */
  requestDelayMs: number;
  /** Máximo de ids vistos que se recuerdan por suscripción. */
  maxSeenPerSubscription: number;
}

export interface DatabaseConfig {
  /** Ruta del archivo SQLite. La variable de entorno DATABASE_PATH tiene prioridad. */
  path: string;
}

/** Datos secretos o propios de cada instalación: solo se leen de variables de entorno (o de .env). */
export interface TelegramConfig {
  /** TELEGRAM_BOT_TOKEN: el token que da @BotFather. */
  token: string | undefined;
  /** TELEGRAM_ADMIN_ID: tu id de usuario de Telegram (el bot te lo dice con /id). */
  adminId: string | undefined;
}

export interface Config {
  api: ApiConfig;
  database: DatabaseConfig;
  monitor: MonitorConfig;
  telegram: TelegramConfig;
}

const configPath = new URL('../config.json', import.meta.url);

// Carga .env si existe. Las variables ya definidas en el entorno tienen prioridad.
try {
  process.loadEnvFile();
} catch {
  // sin .env: se usan solo las variables de entorno
}

export const config: Config = {
  ...(JSON.parse(readFileSync(configPath, 'utf8')) as Omit<Config, 'telegram'>),
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || undefined,
    adminId: process.env.TELEGRAM_ADMIN_ID || undefined,
  },
};

if (process.env.DATABASE_PATH) {
  config.database.path = process.env.DATABASE_PATH;
}
