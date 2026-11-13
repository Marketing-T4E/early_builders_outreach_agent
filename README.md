# early_builders_outreach_agent

Es el agente de escucha. Busca a diario en Stack Exchange (Stack Overflow, es.stackoverflow y Software Engineering), Hacker News y GitHub Discussions hilos donde alguien pregunta por algo que Think4Ever resuelve, redacta la respuesta y la deja en cola. Publica una persona. Sirve de insumo para las tasks de comunidades y de contenido.

> **2026-11-13:** Reddit no aprobó el acceso a su API. Stack Exchange la reemplaza como fuente; el código de Reddit queda en el historial de Git (commit `4e586f4`) por si se aprueba más adelante.

- **Task del Hub:** #212, escucha de comunidades (ver `02-estrategia/plan-alcance-comunidades-developer-network.md` en la KB).
- **Alimenta:** #229 (Reddit) y #231 (contenido técnico), con el reporte semanal.
- **Regla de automatización (plan de alcance, 2026-11-05):** se automatiza encontrar, priorizar, redactar y medir. Publicar lo hace una persona desde su propia cuenta, con tope diario. No se usan cuentas falsas, votos ni datos comprados.

## Cómo funciona

```
Stack Exchange · HN · GitHub  →  filtro previo (sin costo)  →  Claude: ¿es relevante? + borrador  →  revisión automática
                                                                                                   ↓
                         reporte semanal  ←  publicado (URL)  ←  persona publica  ←  aprobado  ←  cola
```

1. **Búsqueda diaria** (por defecto a las 6 a. m. de Bogotá, dentro del servicio) de las últimas 36 horas:
   - **Stack Exchange:** preguntas nuevas por etiqueta y por frase en cada sitio configurado, por la API pública 2.3. Omite las preguntas cerradas o bloqueadas. Solo lectura.
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

- **Arranque sin enlaces** (`LINKS_ENABLED=0`): 2 a 3 semanas sin enlaces al inicio (decisión del 2026-10-16, tomada para Reddit; se mantiene para las demás fuentes).
- **Con enlaces activos:** un solo enlace al destino `LINK_DESTINATION`, con `utm_source` igual a `stackexchange`, `hn` o `github`, `utm_medium=community`, `utm_campaign=developer_network_co_202611` y `utm_content` igual a la comunidad (minúsculas y guion bajo).
- **Por confirmar:** `stackexchange` y `github` como `utm_source` en el Diccionario del plan de UTM. El plan de alcance lista `reddit` y `hn`, pero no estos dos.

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
| `ANTHROPIC_API_KEY` | Clasificar y redactar. Solo se usa Anthropic: la dirección de la API va fija en el código (se ignora `ANTHROPIC_BASE_URL`) y `ANTHROPIC_MODEL` solo acepta modelos Claude |
| `STACKEXCHANGE_KEY` | Opcional. Clave de app de stackapps.com (registro inmediato, sin revisión): sube la cuota de 300 a 10.000 consultas al día |
| `GITHUB_TOKEN` | Token *fine-grained* con "Public repositories (read-only)" |

### Acceso

**Sin login por ahora (fase de QA, desde 2026-11-10).** El inicio de sesión con Microsoft y sus variables se quitaron hasta nuevo aviso, mientras el equipo responsable entrega la app de OAuth.

- Cualquiera con el enlace entra. Todas las acciones quedan a nombre de `qa@think4ever.com`, y la interfaz muestra "Sin login (QA)".
- Como hay un solo usuario, la regla "quien edita no aprueba" viene apagada (`REQUIRE_DISTINCT_APPROVER`, por defecto 0).
- Esto va en contra de la regla de T4E de que toda herramienta interna pide autenticación. No compartas el enlace fuera del equipo.
- **Para restaurar el login:** recupera del commit `4ff4141` `lib/auth.js`, `server.js`, `public/login.html` y las dependencias de `package.json`, y vuelve a poner `REQUIRE_DISTINCT_APPROVER` en 1 por defecto.
- **Diagnóstico al arrancar:** el registro muestra qué variables faltan, solo por nombre y nunca con su valor. Si a GitHub le falta el token, se omiten y la corrida sigue con las demás.

## Configuración editable sin tocar código

`config/sources.json`:

- sitios de Stack Exchange con sus etiquetas y frases, consultas de HN y de GitHub, y repos específicos;
- comunidades donde no se menciona la marca (`no_self_promo`); ahí la respuesta es solo ayuda. Por defecto están todos los sitios de Stack Exchange, cuyas reglas no admiten respuestas promocionales;
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

## Datos

- Se guarda la URL, el título y un extracto del hilo público. **No se guarda el autor** ni ningún dato personal.
- Lo que el filtro descarta no se guarda.
- Tablas: `threads` (hilos y borradores), `thread_events` (registro de acciones) y `scan_runs` (corridas).

## Pendientes

- **Stack Exchange:** confirmar con Research los sitios y etiquetas de `config/sources.json`.
- **Credenciales:** token de GitHub, clave opcional de Stack Exchange, clave de Anthropic y app de OAuth de Microsoft para volver a pedir login.
- **Dirección:** respuesta oficial sobre dónde quedan el código y los datos del usuario.
- **Equipo web:** `stackexchange` y `github` como `utm_source` en el Diccionario.
- **Publicidad:** fecha en que se pasa a fase con enlaces (`LINKS_ENABLED=1`).
