# early_builders_outreach_agent

Es el agente de escucha. Busca a diario en Reddit, Hacker News y GitHub Discussions hilos donde alguien pregunta por algo que Think4Ever resuelve, redacta la respuesta y la deja en cola. Publica una persona. Sirve de insumo para las tasks de Reddit y de contenido.

- **Task del Hub:** #212, escucha de comunidades (ver `02-estrategia/plan-alcance-comunidades-developer-network.md` en la KB).
- **Alimenta:** #229 (Reddit) y #231 (contenido técnico), con el reporte semanal.
- **Regla de automatización (plan de alcance, 2026-11-05):** se automatiza encontrar, priorizar, redactar y medir. Publicar lo hace una persona desde su propia cuenta, con tope diario. No se usan cuentas falsas, votos ni datos comprados.

## Cómo funciona

```
Reddit · HN · GitHub  →  filtro previo (sin costo)  →  Claude: ¿es relevante? + borrador  →  revisión automática
                                                                                                   ↓
                         reporte semanal  ←  publicado (URL)  ←  persona publica  ←  aprobado  ←  cola
```

1. **Búsqueda diaria** (por defecto a las 6 a. m. de Bogotá, dentro del servicio) de las últimas 36 horas:
   - **Reddit:** lo nuevo de cada subreddit configurado, más búsquedas globales. Solo lectura, con OAuth de aplicación.
   - **Hacker News:** historias y comentarios, por la API pública de Algolia.
   - **GitHub Discussions:** búsqueda por GraphQL. Omite las discusiones ya respondidas o cerradas.
2. **Filtro previo** por temas y señales de pregunta, en español y en inglés (`config/sources.json`). Decide qué pasa a Claude y controla el costo (`MAX_LLM_PER_RUN`).
3. **Claude (Opus 5.5)** decide si el hilo es relevante y le asigna puntaje, tema y persona (p01 a p13). Redacta la respuesta en el idioma del hilo, anota riesgos y propone una idea de contenido. Las instrucciones están en `lib/brief.js` y salen solo de la KB.
4. **Revisión automática** (`lib/lint.js`) con las reglas de la KB. Los errores bloquean la aprobación:
   - la marca se escribe "Think4Ever" y es una "plataforma de IA";
   - si se nombra la marca, la respuesta dice que quien publica trabaja ahí;
   - no lleva frases absolutas, "punta del iceberg" ni "1,000+ developers";
   - no compara con otras herramientas;
   - en la fase sin enlaces no lleva URL, y con enlaces el link lleva UTM;
   - no responde dónde quedan el código y los datos, porque la respuesta oficial de Dirección está pendiente.
5. **Cola** (interfaz web): en cola → editar → aprobar → la persona publica desde su cuenta → marca "publicado" con la URL.
   - Editar borra la aprobación.
   - Quien editó no aprueba (`REQUIRE_DISTINCT_APPROVER`), así que Copy aprueba lo que Research editó.
   - Hay un tope de publicaciones por persona y por día (`MAX_POSTS_PER_PERSON_PER_DAY`).
   - Cada acción queda registrada con persona y hora.
6. **Reporte** en Markdown (botón "Reporte 7 días" o `npm run report`): hilos por comunidad, tema y persona; preguntas más relevantes; ideas de contenido; lo publicado.

## Enlaces y UTM

- **Arranque sin enlaces** (`LINKS_ENABLED=0`): Reddit va 2 a 3 semanas sin enlaces al inicio (decisión del 2026-10-16).
- **Con enlaces activos:** un solo enlace al destino `LINK_DESTINATION`, con `utm_source` igual a `reddit`, `hn` o `github`, `utm_medium=community`, `utm_campaign=developer_network_co_202611` y `utm_content` igual a la comunidad (minúsculas y guion bajo).
- **Por confirmar:** `github` como `utm_source` en el Diccionario del plan de UTM. El plan de alcance lista `reddit` y `hn`, pero no `github`.

## Puesta en marcha

Requiere Node 20 o superior y MySQL 8. Sigue el mismo patrón del tablero LATAM Growth (#286):

- El runtime inyecta `PORT`, `DATABASE_URL`/`DB_*` y `BASE_PATH`.
- `npm start` instala las dependencias (`prestart`) y crea las tablas al arrancar.
- Todas las URL son relativas, así que funciona detrás del proxy `/run/<id>/`.

```bash
npm install
npm test             # pruebas de la lógica (sin base ni Claude)
npm run scan:dry     # trae y filtra en vivo; no usa base ni Claude
npm run scan         # corrida completa manual (necesita base y ANTHROPIC_API_KEY)
npm run migrate      # crea las tablas a mano (el servicio también lo hace al arrancar)
npm start            # servicio: cola web + corrida diaria
```

En Windows, si PowerShell bloquea `npm` ("running scripts is disabled"), usa `npm.cmd run scan:dry`.

Las variables están en `.env.example`, con los mismos nombres que el tablero donde aplica. Las credenciales van en las variables del servicio, nunca en el repositorio. Para probar en tu máquina, cópialas a `.env`, que Git ignora.

| Variable | Para qué |
|---|---|
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AUTH_REDIRECT_URI`, `SESSION_SECRET` | Acceso con cuenta de Microsoft de think4ever (mismas variables que el tablero) |
| `ANTHROPIC_API_KEY` | Clasificar y redactar |
| `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT` | App tipo *script* de la cuenta de la marca (u/IMT4E), solo lectura. Requiere aprobación de Reddit |
| `GITHUB_TOKEN` | Token *fine-grained* con "Public repositories (read-only)" |

### Acceso

Adaptado de `latam_growth/lib/msauth.js`:

- **Login:** Microsoft (Entra ID) con PKCE, solo para el tenant de think4ever y cuentas `@think4ever.com`. Rechaza a los invitados de otras organizaciones.
- **Sesiones:** se guardan en MySQL (tabla `sessions`). La cookie se limita al prefijo público de la app.
- **Usuarios:** quedan en la tabla `users`. Para quitarle el acceso a alguien sin borrarlo: `UPDATE users SET status = 'disabled' WHERE email = '...'`.
- **Callback:** `AUTH_REDIRECT_URI` debe ser la URL pública que termina en `/auth/microsoft/callback`, la misma ruta del tablero. También se acepta `/auth/callback`, y la URI tiene que estar registrada en la app de Entra.
- **Sin configuración:** el servicio no arranca. Para probar en tu máquina, usa `AUTH_MODE=local-dev`, que solo escucha en 127.0.0.1.
- **Fase de QA sin login (temporal):** `AUTH_MODE=open` deja entrar al servicio sin Microsoft mientras el equipo responsable entrega la app de OAuth.
  - Cualquiera con el enlace entra, y todas las acciones quedan a nombre de `OPEN_MODE_USER` (por defecto `qa@think4ever.com`).
  - La interfaz muestra "Sin login (QA)" y el registro lo avisa al arrancar.
  - Como hay un solo usuario, pon también `REQUIRE_DISTINCT_APPROVER=0`; si no, nadie puede aprobar lo que editó.
  - Esto va en contra de la regla de T4E de que toda herramienta interna pide autenticación. Úsalo solo en QA y no compartas el enlace fuera del equipo.
  - Para volver al login, quita `AUTH_MODE` y define las variables `AZURE_*` y `SESSION_SECRET`. El código de Microsoft no se tocó.
- **Diagnóstico al arrancar:** el registro muestra qué variables faltan, solo por nombre y nunca con su valor. Si a Reddit o a GitHub les faltan credenciales, se omiten y la corrida sigue con las demás.

## Configuración editable sin tocar código

`config/sources.json`:

- subreddits, frases de búsqueda, consultas de HN y de GitHub, y repos específicos;
- subreddits donde no se menciona la marca (`no_self_promo`); ahí la respuesta es solo ayuda;
- temas, pesos, señales de pregunta, exclusiones y puntaje mínimo del filtro.

## Interfaz

Usa el mismo sistema de diseño del tablero LATAM Growth (`latam_growth/public/css/app.css`): menú lateral, barra superior, tema claro y oscuro. Es JavaScript sin compilar, con un módulo por vista (`public/js/views/`) y un router por hash.

| Vista | Qué muestra |
|---|---|
| Resumen | Cuántos hilos hay en cada estado, tus publicaciones de hoy contra el tope, la última corrida y las reglas activas |
| En cola, Aprobados, Publicados | La lista a la izquierda y el detalle a la derecha: pregunta, extracto, riesgos, borrador, revisión automática, acciones y registro |
| Descartados, No relevantes, Errores | El archivo, con el motivo o el error de cada hilo |
| Corridas | Las últimas 10 búsquedas: leídos, los que pasan el filtro, nuevos, borradores y errores |
| Reporte | El reporte en Markdown de 7, 14, 30 o 90 días, para copiar o descargar |

- Los botones que el servidor rechazaría aparecen desactivados y dicen por qué. Por ejemplo, Aprobar se desactiva si la revisión automática tiene errores o si tú editaste el borrador. El servidor sigue aplicando las reglas.
- Antes de salir de un borrador con cambios sin guardar, la interfaz pide confirmación.
- `css/app.css` es la única ruta abierta sin sesión además de `login.html`, porque la usa la página de acceso. No trae datos.

## Datos

- Se guarda la URL, el título y un extracto del hilo público. **No se guarda el autor** ni ningún dato personal.
- Lo que el filtro descarta no se guarda.
- Tablas: `threads` (hilos y borradores), `thread_events` (registro de acciones) y `scan_runs` (corridas).

## Pendientes

- **Subreddits:** confirmar `config/sources.json` contra los 24 subreddits que mapeó Research, y marcar los que prohíben autopromoción.
- **Credenciales:** app de Reddit de solo lectura en la cuenta de la marca, token de GitHub, clave de Anthropic y app de Microsoft (redirect URI del servicio).
- **Dirección:** respuesta oficial sobre dónde quedan el código y los datos del usuario.
- **Equipo web:** `github` como `utm_source` en el Diccionario.
- **Publicidad:** fecha en que Reddit pasa a fase con enlaces (`LINKS_ENABLED=1`).
