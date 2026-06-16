# Referencia para nuevo repositorio
# Pegar este contenido en: `.github/copilot-instructions.md` del nuevo repo

---

## INSTRUCCIONES PARA COPILOT

Estás trabajando en un sistema de **overlays deportivos para transmisiones en vivo** (estilo TV profesional), idéntico al que ya existe en otro repositorio. Tu tarea es implementar este sistema desde cero en este nuevo repositorio, siguiendo exactamente la misma arquitectura y patrones descritos a continuación.

---

## ARQUITECTURA DEL SISTEMA

```
Admin Panel (pro/index.html)
    ↓ REST (PATCH/POST/DELETE)
Backend Express (backend/index.js)  ←→  PostgreSQL
    ↓ SSE broadcast (/overlay-events)
Todos los overlays HTML reciben el estado
    ↓ js/overlay-client.js llama a window.onOverlayState(state)
Renderizado en OBS vía Browser Source
```

**Tecnologías:**
- Backend: Node.js + Express + node-postgres (`pg`) + dotenv
- Frontend: HTML vanilla + Tailwind CSS CDN + Google Fonts (Inter)
- Comunicación: Server-Sent Events (SSE) para push en tiempo real
- Persistencia: PostgreSQL + archivo JSON local (`overlay-state.json`) como respaldo

---

## ESTRUCTURA DE ARCHIVOS A CREAR

```
/
├── package.json
├── overlay-state.json          ← generado en runtime (gitignore)
├── .env                        ← variables de entorno (gitignore)
├── backend/
│   ├── index.js                ← servidor Express + todos los endpoints
│   ├── overlay-state.js        ← módulo de estado: load/save/patch/defaultState
│   └── init.sql                ← schema PostgreSQL + datos iniciales
├── js/
│   └── overlay-client.js       ← cliente SSE compartido por todos los overlays
├── pro/                        ← NUEVA CARPETA - panel profesional
│   ├── index.html              ← panel de control principal
│   ├── instructivo.html        ← guía de uso
│   ├── overlay-alerta.html     ← alertas (GOL, VAR, tarjetas)
│   ├── overlay-banner.html     ← banner inferior de sponsor
│   ├── overlay-cortina.html    ← pantalla completa de sponsor
│   ├── overlay-ticker.html     ← ticker horizontal de noticias
│   ├── overlay-stats.html      ← estadísticas en vivo
│   └── overlay-formaciones-previa.html  ← comparativa pre-partido
├── marcador.html               ← scoreboard principal (OBS browser source)
├── equipos/logos/              ← logos de equipos (.png)
└── sponsors/                   ← logos de sponsors
```

---

## SCHEMA COMPLETO DEL ESTADO (`overlay-state.json`)

Este es el objeto completo que maneja todo el sistema. Cada overlay HTML lo recibe vía SSE y renderiza según sus campos.

```json
{
  "match": {
    "status": "NO INICIADO",
    "minute": "",
    "referee": "",
    "stadium": "",
    "tournament": "APERTURA 2026"
  },
  "timer": {
    "running": false,
    "startTimestamp": null,
    "baseMinute": 0,
    "period": "PT",
    "addedTime": 0
  },
  "incidents": [],
  "widgets": {
    "marcador": true,
    "formaciones": false,
    "otrosPartidos": false,
    "tablaPosiciones": false,
    "ticker": false,
    "publicidad": false,
    "estadisticas": false,
    "alerta": false,
    "formacionPrevia": false
  },
  "alerts": {
    "active": false,
    "type": null,
    "team": null,
    "player": null,
    "minute": null
  },
  "emergencyMode": false,
  "ads": {
    "active": false,
    "current": null,
    "sponsor": "",
    "logoSponsor": "",
    "autoEnabled": false,
    "autoIntervalMin": 10,
    "nextAt": null
  },
  "stats": {
    "local":     { "posesion": 50, "tiros": 0, "tirosPuerta": 0, "corners": 0, "faltas": 0, "offsides": 0 },
    "visitante": { "posesion": 50, "tiros": 0, "tirosPuerta": 0, "corners": 0, "faltas": 0, "offsides": 0 },
    "jugadorDestacado": { "team": null, "nombre": "", "numero": null, "stat": "" }
  },
  "ticker": { "items": [] },
  "dt": { "local": "", "visitante": "" },
  "history": [],
  "local": {
    "nombre": "",
    "logo": "",
    "color": "#019604",
    "colorNumero": "#ffffff",
    "formacion": "4-3-3",
    "goles": 0,
    "jugadores": [],
    "suplentes": []
  },
  "visitante": {
    "nombre": "",
    "logo": "",
    "color": "#FFFFFF",
    "colorNumero": "#000000",
    "formacion": "4-4-2",
    "goles": 0,
    "jugadores": [],
    "suplentes": []
  },
  "resultados": [],
  "libre": ""
}
```

**Estructura de jugador:**
```json
{ "nombre": "García", "numero": 9, "goles": 0, "amarilla": false, "roja": false, "figura": false }
```

**Estructura de incidencia:**
```json
{ "id": "1718300000000", "type": "gol", "team": "local", "player": "García", "playerOut": "", "minute": 23, "timestamp": 1718300000000 }
```

**Tipos de período del timer:** `PT` | `ET` | `ST` | `PROL` | `PEN` | `FIN`

**Tipos de alerta:** `gol` | `amarilla` | `roja` | `var` | `descanso` | `fin`

**Tipos de ad:** `banner` | `cortina` | `overlay`

---

## TODOS LOS ENDPOINTS DEL BACKEND

### Infraestructura SSE
```
GET  /overlay-events          → SSE stream. Envía state completo al conectar + broadcast en cada cambio.
                                Además emite cada 1s: { type:"timer-tick", minute, addedTime, period, running }
GET  /overlay-state           → Snapshot del estado actual
PUT  /overlay-state           → Reemplazar estado completo
POST /overlay-state/reset     → Resetear a defaultState()
GET  /overlay-equipos         → Objeto { "Nombre Equipo": "equipos/logos/logo.png", ... }
```

### Match y equipos
```
PATCH /overlay-state/match       → { status?, minute?, referee?, stadium?, tournament? }
PATCH /overlay-state/local       → { nombre?, logo?, color?, colorNumero?, formacion?, goles?, jugadores?, suplentes? }
PATCH /overlay-state/visitante   → mismo esquema que local
PUT   /overlay-state/resultados  → { resultados: [...], libre: "" }
PATCH /overlay-state/dt          → { local?: "Nombre DT", visitante?: "Nombre DT" }
```

### Timer (server-side)
```
POST  /overlay-state/timer/start   → Arranca timer (sets running=true, startTimestamp=Date.now())
POST  /overlay-state/timer/pause   → Pausa (recalcula baseMinute, running=false)
POST  /overlay-state/timer/reset   → Reset a { running:false, baseMinute:0, period:'PT', addedTime:0 }
PATCH /overlay-state/timer/period  → { period: "ST", baseMinute: 45 }
PATCH /overlay-state/timer/added   → { addedTime: 3 }
```

### Incidencias
```
POST   /overlay-state/incidents       → { type, team, player, playerOut?, minute? }
DELETE /overlay-state/incidents/:id   → eliminar incidencia por ID
```

### Widgets y estado visual
```
PATCH /overlay-state/widgets   → { marcador?: bool, formacionPrevia?: bool, ... }
PATCH /overlay-state/alerts    → { active, type, team, player, minute, autoClean? }
                                  Si autoClean=true, se limpia automáticamente a los 12s
POST  /overlay-state/emergency → Toggle del modo emergencia (oculta todos los overlays)
GET   /overlay-state/history   → Últimas 30 acciones
```

### Publicidad y contenido
```
PATCH /overlay-state/ads     → { active?, current?, sponsor?, logoSponsor?, autoEnabled?, autoIntervalMin? }
PATCH /overlay-state/stats   → { local?: {...}, visitante?: {...}, jugadorDestacado?: {...} }
PATCH /overlay-state/ticker  → { items: ["texto1", "texto2", ...] }
```

### Base de datos (PostgreSQL)
```
GET  /equipos       → todos los equipos
GET  /jugadores     → todos los jugadores
GET  /fixture       → calendario de partidos
GET  /tabla         → tabla de posiciones calculada
GET  /goleadores    → ranking de goleadores
GET  /estadios      → estadios
GET  /eventos       → eventos de partidos (goles, tarjetas)
POST /equipos       → { nombre }
POST /jugadores     → { nombre, equipo_id }
POST /partidos      → { fecha, equipo_local_id, equipo_visitante_id, ... }
POST /eventos       → { partido_id, jugador_id, tipo_evento, minuto }
POST /login         → { email, password }
```

---

## CÓDIGO CLAVE: `backend/overlay-state.js`

```javascript
const fs = require('fs');
const path = require('path');
const STATE_FILE = path.join(__dirname, '..', 'overlay-state.json');

// Catálogo de equipos → adaptar al nuevo repositorio
const EQUIPOS = {
  // "Nombre Equipo": "equipos/logos/archivo.png",
};

function defaultState() {
  return {
    match: { status: "NO INICIADO", minute: "", referee: "", stadium: "", tournament: "TORNEO 2026" },
    timer: { running: false, startTimestamp: null, baseMinute: 0, period: "PT", addedTime: 0 },
    incidents: [],
    widgets: { marcador: true, formaciones: false, otrosPartidos: false, tablaPosiciones: false, ticker: false, publicidad: false, estadisticas: false, alerta: false, formacionPrevia: false },
    alerts: { active: false, type: null, team: null, player: null, minute: null },
    emergencyMode: false,
    ads: { active: false, current: null, sponsor: "", logoSponsor: "", autoEnabled: false, autoIntervalMin: 10, nextAt: null },
    stats: {
      local:     { posesion: 50, tiros: 0, tirosPuerta: 0, corners: 0, faltas: 0, offsides: 0 },
      visitante: { posesion: 50, tiros: 0, tirosPuerta: 0, corners: 0, faltas: 0, offsides: 0 },
      jugadorDestacado: { team: null, nombre: "", numero: null, stat: "" }
    },
    ticker: { items: [] },
    dt: { local: "", visitante: "" },
    history: [],
    local:     { nombre: "", logo: "", color: "#019604", colorNumero: "#ffffff", formacion: "4-3-3", goles: 0, jugadores: [], suplentes: [] },
    visitante: { nombre: "", logo: "", color: "#FFFFFF", colorNumero: "#000000", formacion: "4-4-2", goles: 0, jugadores: [], suplentes: [] },
    resultados: [],
    libre: ""
  };
}

function load() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch (err) { console.error('[overlay-state] Error:', err.message); }
  return defaultState();
}

function save(state) { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8'); }

function patch(target, updates) {
  for (const key of Object.keys(updates)) { if (updates[key] !== undefined) target[key] = updates[key]; }
  return target;
}

module.exports = { EQUIPOS, defaultState, load, save, patch };
```

---

## CÓDIGO CLAVE: `js/overlay-client.js`

Este archivo lo incluyen TODOS los overlays HTML. Se conecta al SSE y llama a `window.onOverlayState(state)` en cada actualización.

```javascript
(function () {
  const API = window.OVERLAY_API || 'http://localhost:3000';
  let lastJson = '';

  function connect() {
    const es = new EventSource(API + '/overlay-events');
    es.onmessage = function (e) {
      if (e.data === lastJson) return;
      lastJson = e.data;
      try {
        const state = JSON.parse(e.data);
        if (typeof window.onOverlayState === 'function') window.onOverlayState(state);
      } catch (err) { console.error('[overlay-client]', err); }
    };
    es.onerror = function () { es.close(); setTimeout(connect, 3000); };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', connect);
  else connect();
})();
```

**Patrón de uso en cada overlay:**
```html
<script src="/js/overlay-client.js"></script>
<script>
  window.onOverlayState = function(state) {
    // 1. Verificar emergencyMode
    if (state.emergencyMode) { /* ocultar todo */ return; }
    // 2. Verificar widget propio
    if (!state.widgets.miWidget) { /* ocultar */ return; }
    // 3. Renderizar con los datos del state
  };
</script>
```

---

## PATRÓN DE OVERLAYS HTML (1920×1080, fondo transparente)

Todos los overlays siguen este patrón:

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Nombre del Overlay</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background: transparent; width: 1920px; height: 1080px; overflow: hidden; }
    
    /* Clase principal con transición show/hide */
    .componente {
      /* posicionamiento absoluto */
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.5s ease; /* o transform para slide */
    }
    .componente.show { opacity: 1; }
  </style>
</head>
<body>
  <div class="componente" id="comp">
    <!-- contenido del overlay -->
  </div>

  <script src="/js/overlay-client.js"></script>
  <script>
    window.onOverlayState = function(state) {
      const shouldShow = !state.emergencyMode && state.widgets?.miWidget;
      document.getElementById('comp').classList.toggle('show', !!shouldShow);
      if (!shouldShow) return;
      // renderizar datos
    };
  </script>
</body>
</html>
```

---

## PALETA DE COLORES Y DISEÑO

- **Color brand:** `#8B5CF6` (purple-500)
- **Color brand dark:** `#6D28D9` (purple-700)
- **Background general:** `#0d0d18` o `#111128`
- **Cards:** `#13131f` o `#1e1e2e`
- **Borde sutil:** `rgba(139,92,246,0.2)`
- **Fuente:** Inter (Google Fonts)
- **Framework CSS:** Tailwind CSS CDN (`https://cdn.tailwindcss.com`)
- **Tema:** Dark mode profesional estilo broadcast TV

---

## PATRÓN DEL MARCADOR (`marcador.html`)

El marcador recibe tanto el estado completo como los `timer-tick` directos. Necesita conectar su propio SSE para separar los ticks del estado:

```javascript
let timerState = { running: false, baseMinute: 0, startTimestamp: null, period: 'PT', addedTime: 0 };
let localTick = null;

const PERIOD_LABELS = { PT:'PRIMER TIEMPO', ET:'ENTRETIEMPO', ST:'SEGUNDO TIEMPO', PROL:'PRÓRROGA', PEN:'PENALES', FIN:'FINALIZADO' };

function getMinute() {
  if (!timerState.running || !timerState.startTimestamp) return timerState.baseMinute;
  return timerState.baseMinute + Math.floor((Date.now() - timerState.startTimestamp) / 60000);
}

// Conectar SSE manualmente (NO usar overlay-client.js para el marcador)
function connect() {
  const es = new EventSource('http://localhost:3000/overlay-events');
  es.onmessage = function(e) {
    const data = JSON.parse(e.data);
    if (data.type === 'timer-tick') {
      // actualizar solo el display del timer
      document.getElementById('timerMin').textContent = data.minute + "'";
    } else {
      // renderizar estado completo
      renderState(data);
    }
  };
  es.onerror = () => { es.close(); setTimeout(connect, 3000); };
}
```

---

## PATRÓN DEL PANEL DE CONTROL (`pro/index.html`)

```javascript
const API = 'http://localhost:3000';
let state = null;

// Conectar SSE
function connectSSE() {
  const es = new EventSource(API + '/overlay-events');
  es.onmessage = e => {
    const data = JSON.parse(e.data);
    if (data.type === 'timer-tick') { updateTimerDisplay(...); return; }
    state = data;
    renderAll(state);
  };
}

// Helper API universal
async function api(method, endpoint, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(API + endpoint, opts);
  return r.json();
}

// Ejemplos de uso:
// await api('POST', '/overlay-state/timer/start')
// await api('PATCH', '/overlay-state/local', { goles: 2 })
// await api('PATCH', '/overlay-state/widgets', { marcador: true })
// await api('PATCH', '/overlay-state/alerts', { active: true, type: 'gol', autoClean: true })
// await api('POST', '/overlay-state/emergency')
```

---

## COMPORTAMIENTO DE CADA OVERLAY

| Overlay | Widget key | Condición de visibilidad |
|---------|-----------|--------------------------|
| `marcador.html` | `marcador` | `!emergencyMode && widgets.marcador` |
| `pro/overlay-alerta.html` | `alerta` | `!emergencyMode && alerts.active` |
| `pro/overlay-banner.html` | `publicidad` | `!emergencyMode && widgets.publicidad && ads.active && (ads.current==='banner'\|\|'overlay')` |
| `pro/overlay-cortina.html` | `publicidad` | `!emergencyMode && widgets.publicidad && ads.active && ads.current==='cortina'` |
| `pro/overlay-ticker.html` | `ticker` | `!emergencyMode && widgets.ticker` |
| `pro/overlay-stats.html` | `estadisticas` | `!emergencyMode && widgets.estadisticas` |
| `pro/overlay-formaciones-previa.html` | `formacionPrevia` | `!emergencyMode && widgets.formacionPrevia` |

---

## TIMER SERVER-SIDE — LÓGICA CLAVE

```javascript
// En backend/index.js, después de inicializar state:

function getTimerMinute() {
  if (!state.timer.running || !state.timer.startTimestamp) return state.timer.baseMinute;
  return state.timer.baseMinute + Math.floor((Date.now() - state.timer.startTimestamp) / 60000);
}

// Broadcast tick cada segundo
setInterval(() => {
  if (state.timer.running) {
    const tick = JSON.stringify({
      type: 'timer-tick',
      minute: getTimerMinute(),
      addedTime: state.timer.addedTime,
      period: state.timer.period,
      running: true
    });
    sseClients.forEach(res => res.write(`data: ${tick}\n\n`));
  }
}, 1000);

// START: guarda startTimestamp, no reemplaza baseMinute
// PAUSE: baseMinute = getTimerMinute(), running = false, startTimestamp = null
// RESET: todo a cero
// PERIOD CHANGE: pausa + setea baseMinute según el período (PT=0, ET=45, ST=45, PROL=90, PEN=120)
```

---

## SCHEMA DE BASE DE DATOS (`backend/init.sql`)

```sql
CREATE TABLE IF NOT EXISTS equipos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS jugadores (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  equipo_id INTEGER REFERENCES equipos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS estadios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS partidos (
  id SERIAL PRIMARY KEY,
  fecha DATE,
  equipo_local_id INTEGER REFERENCES equipos(id),
  equipo_visitante_id INTEGER REFERENCES equipos(id),
  goles_local INTEGER DEFAULT 0,
  goles_visitante INTEGER DEFAULT 0,
  jugado BOOLEAN DEFAULT FALSE,
  estadio VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS eventos (
  id SERIAL PRIMARY KEY,
  partido_id INTEGER REFERENCES partidos(id) ON DELETE CASCADE,
  jugador_id INTEGER REFERENCES jugadores(id),
  tipo_evento VARCHAR(50),  -- 'gol', 'amarilla', 'roja', 'cambio'
  minuto INTEGER
);

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(100) NOT NULL
);
```

---

## `package.json` MÍNIMO

```json
{
  "name": "overlay-system",
  "version": "1.0.0",
  "scripts": {
    "start": "node backend/index.js",
    "dev": "nodemon backend/index.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.0.0",
    "express": "^4.18.0",
    "pg": "^8.11.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  }
}
```

---

## `.env` REQUERIDO

```env
DB_USER=postgres
DB_HOST=localhost
DB_NAME=nombre_de_la_base
DB_PASSWORD=tu_password
DB_PORT=5432
PORT=3000
```

---

## NOTAS DE IMPLEMENTACIÓN IMPORTANTES

1. **El `overlay-state.json` NO va en git** — se genera en runtime. Agregar al `.gitignore`.

2. **Migración hacia atrás:** Al cargar el state desde disco, puede que falten campos nuevos. El backend tiene guards:
   ```javascript
   if (!state.timer) state.timer = { ... };
   if (!state.widgets) state.widgets = {};
   // etc.
   ```

3. **El endpoint `PATCH /overlay-state/:side`** es genérico y captura `local`, `visitante`, y CUALQUIER otro side. Asegurate de que esté DESPUÉS de los endpoints específicos (`/overlay-state/match`, `/overlay-state/timer/...`) para que no los tape.

4. **Autoclean de alertas:** El backend hace `setTimeout 12000` para limpiar alertas con `autoClean: true`. Esto es server-side.

5. **Los overlays de `pro/` usan `/js/overlay-client.js`** con ruta absoluta desde la raíz del servidor. Express sirve estáticos desde el root del proyecto.

6. **El marcador NO usa `overlay-client.js`** — conecta su propio SSE para poder diferenciar `timer-tick` del state completo.

7. **Colores de equipo** se usan en el overlay de formaciones previa para colorear los números de camiseta: `background: ${color}22; border: 1.5px solid ${color}55`.

8. **Plantel del panel:** Los cambios al plantel (jugadores, suplentes) NO se guardan automáticamente — el operador tiene que presionar "Guardar Plantel en Pantalla" que hace `PATCH /overlay-state/local` con `{ jugadores, suplentes }`.

9. **Scheduler de publicidad:** Corre en `setInterval` de 5s server-side. Revisa si `ads.autoEnabled && ads.nextAt && Date.now() >= ads.nextAt`.

10. **SSE cleanup:** Cuando un cliente SSE se desconecta, removerlo del array `sseClients` vía `req.on('close')`.

---

## OVERLAYS QUE VAN EN OBS (Browser Sources 1920×1080)

Todos con fondo transparente (`#00000000`). En la misma escena, apilados:

| Overlay | Ruta |
|---------|------|
| Marcador | `/marcador.html` |
| Alerta (GOL/VAR/etc) | `/pro/overlay-alerta.html` |
| Banner inferior | `/pro/overlay-banner.html` |
| Cortina sponsor | `/pro/overlay-cortina.html` |
| Ticker noticias | `/pro/overlay-ticker.html` |
| Estadísticas | `/pro/overlay-stats.html` |
| Formaciones previa | `/pro/overlay-formaciones-previa.html` |

Panel de control (no va en OBS, va en el navegador del operador): `/pro/`

---

## RESUMEN DE LO QUE HAY QUE IMPLEMENTAR

Al recibir esta referencia en un repo nuevo, implementar en este orden:

1. `package.json` + `npm install`
2. `.env` con credenciales de BD
3. `backend/init.sql` → ejecutar en PostgreSQL
4. `backend/overlay-state.js` → módulo de estado con `defaultState()` completo
5. `backend/index.js` → Express + todos los endpoints + SSE + timer interval + ad scheduler
6. `js/overlay-client.js` → cliente SSE compartido
7. `marcador.html` → scoreboard con timer live (SSE propio, no overlay-client)
8. `pro/index.html` → panel de control completo con: timer, marcador, plantel (cargar BD + manual + edición), alertas, incidencias, widgets, publicidad, ticker, stats, formaciones, historial, emergencia
9. `pro/overlay-alerta.html` → alertas dramáticas con animación scale
10. `pro/overlay-banner.html` → lower third con shimmer
11. `pro/overlay-cortina.html` → fullscreen con partículas flotantes
12. `pro/overlay-ticker.html` → scroll horizontal infinito
13. `pro/overlay-stats.html` → panel lateral con barras
14. `pro/overlay-formaciones-previa.html` → comparativa lado a lado con campo SVG
15. `pro/instructivo.html` → guía completa de uso
