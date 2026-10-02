# Manual de usuario

Este bot te avisa por Telegram cada vez que se publica en Wallapop un anuncio que encaja con lo que buscas, con su foto, precio y enlace.

- [Primeros pasos](#primeros-pasos)
- [Crear una búsqueda](#crear-una-búsqueda)
- [Gestionar tus búsquedas](#gestionar-tus-búsquedas)
- [Los avisos](#los-avisos)
- [Comandos](#comandos)
- [Preguntas frecuentes](#preguntas-frecuentes)
- [Para el administrador](#para-el-administrador)

## Primeros pasos

El bot es privado: para usarlo, el administrador tiene que darte acceso.

1. Abre el bot en Telegram y pulsa **Iniciar** (o envía `/start`).
2. Pulsa el botón **🙋 Solicitar acceso**.
3. Espera. Cuando el administrador revise tu solicitud, el bot te enviará un mensaje:
   - **✅ ¡Ya tienes acceso!**: ya puedes crear búsquedas.
   - **⛔ El administrador ha rechazado tu solicitud**: no podrás usar el bot.

Si envías `/start` mientras esperas, el bot te recordará que tu solicitud está pendiente.

## Crear una búsqueda

Envía `/busqueda`. El bot te hará unas preguntas, una por mensaje:

**1. ¿Qué quieres buscar?**
Escribe lo mismo que pondrías en el buscador de Wallapop, por ejemplo `nintendo 3ds`. Máximo 100 caracteres.

**2. ¿Precio máximo?**
Escribe un número en euros. Valen `150`, `150,50` o `150 €`. Si no quieres límite, pulsa **Sin límite**.

**3. ¿Precio mínimo?**
Igual que el anterior. No puede ser mayor que el máximo. Pulsa **Sin límite** si no te importa.

> Consejo: un precio mínimo evita avisos de fundas, cajas vacías o accesorios cuando buscas el producto en sí.

**4. Categoría**
Elige una con los botones, o **🌐 Todas las categorías** para buscar en todas.

**5. Subcategoría**
Solo aparece si la categoría tiene subcategorías. Elige una o **📦 Toda la categoría**.

Al terminar verás un resumen con **✅ Búsqueda guardada**. Desde ese momento el bot vigila Wallapop por ti.

¿Te has equivocado? Envía `/cancelar` en cualquier momento y empieza de nuevo con `/busqueda`.

## Gestionar tus búsquedas

Envía `/busquedas`. El bot te enviará un mensaje por cada búsqueda con su término, el rango de precio, la categoría y el estado (**▶️ Activa** o **⏸ Pausada**), y dos botones:

- **⏸ Pausar**: deja de vigilarla, sin borrarla. El botón cambia a **▶️ Reanudar**.
- **▶️ Reanudar**: vuelve a vigilarla. Solo te avisará de lo que se publique a partir de ahora, no de lo publicado mientras estaba pausada.
- **🗑 Eliminar**: la borra definitivamente. **No pide confirmación.**

Solo ves y puedes cambiar tus propias búsquedas.

## Los avisos

Por cada anuncio nuevo recibirás un mensaje con:

- la **primera foto** del anuncio;
- la búsqueda que lo ha encontrado;
- el **nombre** del anuncio;
- el **precio**;
- el enlace **Ver anuncio en Wallapop**.

Si el anuncio no tiene foto, o no se puede cargar, recibirás el mismo mensaje sin imagen.

Ten en cuenta:

- **Al crear una búsqueda no recibirás nada al momento.** El bot solo avisa de lo que se publique después, no de lo que ya existía.
- **Los avisos llegan en uno o dos minutos** desde que se publica el anuncio, según cuántas búsquedas haya en el bot.
- **Si bloqueas el bot**, tus búsquedas se pausan. Para volver a recibir avisos, desbloquéalo y reanúdalas en `/busquedas`.

## Comandos

| Comando | Para qué sirve |
|---|---|
| `/start` | Empezar a usar el bot o solicitar acceso |
| `/busqueda` | Crear una búsqueda nueva |
| `/busquedas` | Ver, pausar, reanudar o eliminar tus búsquedas |
| `/cancelar` | Cancelar la búsqueda que estás creando |
| `/ayuda` (o `/help`) | Ver los comandos disponibles |
| `/id` | Ver tu id de Telegram |

También los tienes en el menú que aparece al pulsar el botón **/** o **Menú** junto al campo de escribir.

## Preguntas frecuentes

**He creado una búsqueda y no me llega nada.**
Es normal: el bot solo avisa de anuncios publicados *después* de crearla. Comprueba en `/busquedas` que está **▶️ Activa**. Si la búsqueda es muy concreta, puede tardar en aparecer algo.

**Me llegan avisos de cosas que no me interesan.**
Afina la búsqueda: añade un precio mínimo, elige una categoría o usa un término más concreto. Para cambiar una búsqueda, elimínala y créala de nuevo.

**¿Puedo editar una búsqueda?**
De momento no. Elimínala y crea otra.

**¿Cuántas búsquedas puedo tener?**
No hay límite.

**¿Me ha llegado un anuncio antiguo como nuevo?**
Puede pasar si el vendedor lo ha "destacado" en Wallapop y el bot no lo había visto antes.

**Mis búsquedas aparecen pausadas y no las he pausado yo.**
Se pausan solas si bloqueas el bot o si el administrador te retira el acceso. Reanúdalas en `/busquedas`.

**He pulsado un botón y dice «Este paso ya no está activo».**
Es un botón de un mensaje antiguo. Empieza de nuevo con `/busqueda`.

---

## Para el administrador

### Puesta en marcha

1. Crea el bot hablando con [@BotFather](https://t.me/BotFather): envía `/newbot` y guarda el **token** que te da.
2. En la carpeta del proyecto, copia `.env.example` a `.env` y rellénalo:
   ```
   TELEGRAM_BOT_TOKEN=123456789:AAH...
   TELEGRAM_ADMIN_ID=0
   ```
3. Arranca el bot con Docker: `docker compose up -d --build`. Queda funcionando en segundo plano y se vuelve a arrancar solo si se cae o se reinicia el equipo. (Sin Docker: `npm install` y `npm start`.)
4. Envía `/id` a tu bot, pon ese número en `TELEGRAM_ADMIN_ID` y aplica el cambio con `docker compose up -d`.

Para ver lo que va haciendo el bot: `docker compose logs -f`. Cada vez que comprueba las búsquedas escribe una línea con la fecha, la hora y cuántos usuarios y búsquedas hay.

### Lo que puedes hacer como administrador

- **Usar el bot como cualquier usuario**: tienes acceso siempre, sin solicitarlo.
- **Aceptar o rechazar solicitudes**: cuando alguien pide acceso te llega un mensaje con su nombre, su usuario y los botones **✅ Aceptar** y **❌ Rechazar**.
- **Gestionar el acceso con `/usuarios`**: muestra a todos los que han pedido acceso (primero los pendientes), cada uno con su botón:

| Estado | Botón | Efecto |
|---|---|---|
| ⏳ Pendiente | ✅ Aceptar / ❌ Rechazar | Le das o deniegas el acceso |
| ✅ Con acceso | ⛔ Revocar acceso | Pierde el acceso y sus búsquedas se pausan |
| ⛔ Sin acceso | ✅ Dar acceso | Recupera el acceso; sus búsquedas siguen pausadas hasta que las reanude |

Cada usuario recibe un mensaje cuando cambias su acceso.

Quien ha sido rechazado no puede volver a solicitarlo; si cambias de opinión, dale acceso desde `/usuarios`.

### Configuración

Los tiempos del bot están en `config.json`, sección `monitor`:

| Clave | Qué es | Valor actual |
|---|---|---|
| `intervalMs` | Cada cuánto se comprueba Wallapop (ms) | 60000 (1 minuto) |
| `requestDelayMs` | Pausa entre consultas a Wallapop (ms) | 2000 (2 segundos) |
| `maxSeenPerSubscription` | Anuncios que recuerda cada búsqueda | 200 |

Bajar `intervalMs` hace que los avisos lleguen antes, pero aumenta las consultas a Wallapop y el riesgo de que bloquee el bot. Los cambios en `config.json` se aplican con `docker compose up -d --build`, porque el archivo va dentro de la imagen.

Los datos (usuarios, búsquedas y anuncios vistos) se guardan en el volumen de Docker `wallaalert-data` (o en `data/bot.db` si lo arrancas sin Docker). Para hacer una copia de seguridad, para el bot antes de copiar la base de datos: mientras está en marcha, los últimos cambios pueden estar todavía en el archivo `bot.db-wal`. Con Docker:

```bash
docker compose down
docker run --rm -v wallaalert-data:/data -v "$PWD":/backup alpine cp /data/bot.db /backup/bot-backup.db
docker compose up -d
```
