# --- Compilación: instala todas las dependencias y compila TypeScript ---
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Ejecución: Node, las dependencias de producción, el JavaScript compilado y config.json ---
FROM node:24-alpine
WORKDIR /app

ENV NODE_ENV=production \
    DATABASE_PATH=/data/bot.db \
    TZ=Europe/Madrid

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY config.json ./
COPY --from=build /app/dist ./dist

# La base de datos vive en un volumen para que sobreviva a recrear el contenedor.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node

# Los secretos (TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_ID) se pasan al arrancar, nunca en la imagen.
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/index.js"]
