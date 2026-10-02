**Esta app ha sido vibecodeada con [Claude Code](https://claude.com/claude-code).**

# Wallapop Telegram Bot

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white)
![Telegram](https://img.shields.io/badge/Telegram-26A5E4?logo=telegram&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)

> Avisos en Telegram de los anuncios nuevos de Wallapop que te interesan

El bot vigila Wallapop por ti: guardas una búsqueda con sus filtros y, cada vez que
alguien publica un anuncio que encaja, te llega un mensaje con la foto, el precio y
el enlace. Es privado y multiusuario: cada persona tiene sus propias búsquedas y el
administrador decide quién puede usarlo. Y es ligero: un único proceso que pasa casi
todo el tiempo esperando, sin servidores aparte ni base de datos que instalar.

---

## ¿Qué hace?

Envías `/busqueda` al bot y te pregunta, mensaje a mensaje, qué buscas, el precio
máximo y mínimo, y la categoría y subcategoría con botones. A partir de ahí,
comprueba Wallapop cada minuto y te avisa solo de lo que se publique después.

| Función | Qué hace |
|---|---|
| **Búsquedas** | Término + precio mínimo y máximo + categoría y subcategoría de Wallapop. Cada usuario puede tener tantas como quiera. |
| **Avisos** | Un mensaje por anuncio nuevo con su primera foto, el nombre, el precio y el enlace. Nunca avisa de lo que ya estaba publicado. |
| **Gestión** | `/busquedas` muestra cada búsqueda con botones para pausarla, reanudarla o eliminarla. |
| **Acceso** | Quien quiera usarlo lo solicita desde Telegram y el administrador lo acepta o rechaza con un botón. Con `/usuarios` puede retirar el acceso en cualquier momento. |

Las búsquedas iguales de distintos usuarios comparten una sola consulta a Wallapop,
así que el número de peticiones depende de cuántas búsquedas *distintas* hay, no de
cuántos usuarios.

---

## Consumo de recursos

Funciona sin problemas en cualquier ordenador o servidor pequeño. Medido con el bot
en marcha:

| Recurso | Consumo |
|---|---|
| **CPU** | Prácticamente 0 %: solo trabaja unos instantes en cada comprobación |
| **Memoria** | Unos 40–60 MB |
| **Disco** | Unos cientos de KB. Cada búsqueda guarda como mucho 200 ids de anuncios |
| **Red** | Unos 15 KB por consulta a Wallapop, una por búsqueda distinta y minuto |

Lo único que crece con el uso es la red, y en función de las búsquedas *distintas*,
no de los usuarios. La memoria apenas cambia, porque los datos viven en SQLite y no
en memoria.

---

## Comandos

| Comando | Para qué sirve |
|---|---|
| `/start` | Empezar a usar el bot o solicitar acceso |
| `/busqueda` | Crear una búsqueda nueva |
| `/busquedas` | Ver, pausar, reanudar o eliminar tus búsquedas |
| `/cancelar` | Cancelar la búsqueda que estás creando |
| `/ayuda` | Ver los comandos disponibles |
| `/id` | Ver tu id de Telegram |
| `/usuarios` | *Solo administrador*: aceptar solicitudes y gestionar el acceso |

---

## Instalación

### 1. Crear el bot

Habla con [@BotFather](https://t.me/BotFather) en Telegram, envía `/newbot` y guarda
el **token** que te da.

### 2. Configurar

```bash
git clone <url-de-este-repositorio>
cd TelegramBot
cp .env.example .env   # pon el token en TELEGRAM_BOT_TOKEN y, de momento, TELEGRAM_ADMIN_ID=0
```

| Variable | Obligatoria | Contenido |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Sí | Token de @BotFather |
| `TELEGRAM_ADMIN_ID` | Sí | Tu id de usuario de Telegram |
| `DATABASE_PATH` | No | Ruta de la base de datos (por defecto `data/bot.db`; en Docker siempre `/data/bot.db`) |

### 3. Arrancar

#### Opción A — Docker (recomendado)

Requiere [Docker](https://docs.docker.com/get-docker/). El bot queda funcionando en
segundo plano y se vuelve a arrancar solo si se cae o se reinicia el equipo.

```bash
docker compose up -d --build
```

| Comando | Qué hace |
|---|---|
| `docker compose logs -f` | Ver lo que va haciendo el bot |
| `docker compose up -d` | Aplicar cambios en `.env` (recrea el contenedor) |
| `docker compose up -d --build` | Aplicar cambios en `config.json` o en el código (reconstruye la imagen) |
| `docker compose down` | Pararlo. Los datos se conservan en el volumen `bot-data` |
| `docker compose exec bot node --disable-warning=ExperimentalWarning dist/cli/subscriptions.js list` | Usar el CLI de suscripciones dentro del contenedor |

La imagen funciona en `amd64` y `arm64` (Raspberry Pi incluida). Cada versión
publicada está también en el registro de GitHub: ver
[Releases](../../releases).

#### Opción B — Desde el código fuente

Requiere **Node.js 24**.

```bash
npm install
npm start
```

Para dejarlo funcionando de forma continua sin Docker:

```bash
npm run build
node --disable-warning=ExperimentalWarning dist/index.js
```

### 4. Ponerte como administrador

Envía `/id` a tu bot, copia el número en `TELEGRAM_ADMIN_ID` dentro de `.env` y
reinicia. A partir de ahí tienes acceso siempre y recibes las solicitudes de los
demás.

Los tiempos de comprobación y los parámetros de la API de Wallapop están en
[config.json](config.json).

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Backend | Node.js 24 + TypeScript |
| Bot | [grammY](https://grammy.dev/) con *long polling* y [auto-retry](https://grammy.dev/plugins/auto-retry) para los límites de Telegram |
| Base de datos | SQLite con `node:sqlite` (incluido en Node, sin dependencias nativas) y migraciones versionadas |
| Datos | API de búsqueda y de categorías de Wallapop |
| Tests | `node:test` + [tsx](https://tsx.is/), con SQLite en memoria y la API de Telegram simulada |
| Despliegue | Docker (Node 24 Alpine, usuario sin privilegios, datos en un volumen) |
| CI y publicación | GitHub Actions: al subir una etiqueta `v*`, pasa los tests, publica la imagen `amd64`/`arm64` en `ghcr.io` y crea la Release |

---

## Desarrollo

| Comando | Qué hace |
|---|---|
| `npm start` | Arranca el bot y el monitor sin compilar |
| `npm test` | Ejecuta todos los tests |
| `npm run typecheck` | Comprueba los tipos |
| `npm run build` | Compila a `dist/` |
| `npm run search -- 3ds --max 100` | Hace una búsqueda suelta y muestra la respuesta de Wallapop |
| `npm run cli -- list` | Gestiona suscripciones desde la terminal (`add`, `list`, `pause`, `resume`, `remove`) |

---

## Documentación

| Fichero | Contenido |
|---|---|
| [docs/manual-usuario.md](docs/manual-usuario.md) | **Manual de usuario**: pedir acceso, crear y gestionar búsquedas, los avisos, preguntas frecuentes y la parte del administrador |
| [docs/concept.md](docs/concept.md) | **Concepto**: qué es el bot y sus ideas principales (línea base, búsquedas compartidas, pausar y reanudar, acceso) |
| [docs/architecture.md](docs/architecture.md) | **Arquitectura**: estructura del código, el monitor, el esquema de la base de datos, el bot y [cómo extenderlo](docs/architecture.md#cómo-extender) |

---

## Aviso legal

Wallapop es una marca de Wallapop S.L. Este bot es un proyecto independiente, sin
relación con Wallapop, y usa su API web no oficial, que puede cambiar en cualquier
momento. Úsalo de forma responsable y respetando sus condiciones de uso.
