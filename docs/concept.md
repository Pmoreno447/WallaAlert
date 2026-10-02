# Concepto

## Qué es

Un bot de Telegram que vigila Wallapop por ti. Le dices qué buscas (por ejemplo, *nintendo 3ds* por menos de 100 €) y te envía un mensaje cada vez que alguien publica un anuncio que encaja, con la foto, el precio y el enlace.

Así no hace falta entrar en Wallapop una y otra vez para ver si ha salido algo nuevo: los chollos se venden en minutos y el que se entera antes es quien los consigue.

## Para quién

El bot es **privado**. Lo gestiona un administrador, que decide quién puede usarlo. Cualquiera puede pedir acceso desde Telegram, pero hasta que el administrador lo acepta no puede hacer nada más.

## Ideas principales

### Búsqueda (suscripción)

Una búsqueda guardada es la unidad básica del bot. Tiene:

- un **término**: lo que escribirías en el buscador de Wallapop;
- unos **filtros** opcionales: precio mínimo, precio máximo, categoría y subcategoría;
- un **dueño**: el usuario de Telegram que la creó y que recibe sus avisos;
- un **estado**: activa o pausada.

En el código se llama *suscripción* (`Subscription`).

Cada usuario puede tener tantas búsquedas como quiera, y solo ve y gestiona las suyas.

### Comprobación periódica

Wallapop no avisa cuando se publica algo, así que el bot pregunta: cada cierto tiempo (por defecto, cada minuto) pide a Wallapop los 40 anuncios más recientes de cada búsqueda y los compara con los que ya había visto. Los que no conocía son los nuevos.

### Línea base

La primera vez que se comprueba una búsqueda, el bot **no avisa de nada**: solo apunta los anuncios que ya existen. A partir de ahí avisa de lo que aparezca después.

Sin esto, al crear una búsqueda recibirías de golpe 40 anuncios que ya estaban publicados y que no son novedad.

### Anuncios vistos

Cada búsqueda recuerda qué anuncios ha visto, de forma independiente. Si dos personas buscan lo mismo, cada una tiene su propia memoria: quien se suscribe más tarde empieza con su propia línea base y no recibe lo que la otra ya conocía.

### Búsquedas compartidas

Si varias personas buscan **exactamente lo mismo** (mismo término y mismos filtros), el bot hace una única consulta a Wallapop y reparte el resultado. Para considerar dos búsquedas iguales, no se distinguen mayúsculas, espacios de más ni el orden de los filtros. Así el número de consultas depende de cuántas búsquedas *distintas* hay, no de cuántos usuarios.

### Pausar y reanudar

Una búsqueda pausada no se comprueba ni avisa. Al reanudarla **empieza de cero**: crea una línea base nueva y solo avisa de lo que se publique a partir de ese momento. Lo publicado mientras estaba pausada no llega, porque si no, al reanudar tras unos días recibirías decenas de avisos antiguos de golpe.

### Acceso

| Estado | Qué puede hacer |
|---|---|
| Sin solicitud | Usar `/start` (para pedir acceso), `/ayuda` e `/id` |
| Pendiente | Lo mismo, mientras espera la respuesta |
| Aprobado | Usar el bot con normalidad |
| Rechazado | Lo mismo que sin solicitud, pero no puede volver a pedir acceso; solo el administrador puede cambiarlo |

El administrador tiene acceso siempre. Si retira el acceso a alguien, sus búsquedas se pausan.

## Qué no hace (por ahora)

- **No mira más allá de los 40 anuncios más recientes** de cada búsqueda. Si entre dos comprobaciones se publican más de 40 que encajan, los más antiguos de esos se pierden. Con comprobaciones cada minuto es muy raro.
- **Un anuncio antiguo que se "destaca" puede llegar como nuevo**, si nunca estuvo entre los anuncios vistos de esa búsqueda.
- **No usa una API oficial.** Wallapop no ofrece una API pública documentada; el bot usa la que usa su web, que puede cambiar sin aviso. Las direcciones y nombres de parámetros están en `config.json` para poder ajustarlos sin tocar el código.
- **Solo funciona en chats privados**, no en grupos.

## Glosario

| Término | Significado |
|---|---|
| Búsqueda / suscripción | Término + filtros que un usuario quiere vigilar |
| Comprobación | Una vuelta del bot consultando todas las búsquedas activas |
| Línea base | Los anuncios que ya existían cuando se empezó a vigilar una búsqueda |
| Anuncios vistos | Los ids de anuncios que una búsqueda ya conoce y no volverá a avisar |
| Borrador | Una búsqueda a medio crear con `/busqueda` |
| Administrador | El usuario de Telegram definido en `TELEGRAM_ADMIN_ID`; acepta o rechaza el acceso |
