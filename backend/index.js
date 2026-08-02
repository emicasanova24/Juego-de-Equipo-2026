const express = require('express');
const cors = require('cors');
const path = require('path');
const overlayState = require('./overlay-state');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_error) {
  // dotenv es opcional si las variables ya existen en el entorno.
}

const app = express();
app.use(cors());
app.use(express.json());

// Listado de equipos servido desde el catálogo estático (sin base de datos).
// Se declara ANTES de express.static para que no lo intercepte la carpeta /equipos.
app.get('/equipos', (_req, res) => {
  const equipos = Object.keys(overlayState.EQUIPOS).map((nombre, i) => ({
    id: i + 1,
    nombre,
    logo: overlayState.EQUIPOS[nombre]
  }));
  res.json(equipos);
});

// Sin base de datos no hay plantel persistido; se devuelve vacío.
app.get('/jugadores', (_req, res) => {
  res.json([]);
});

app.use(express.static(path.join(__dirname, '..')));

const PORT = Number(process.env.PORT || 3000);

let state = overlayState.load();
const sseClients = [];

function broadcast() {
  const data = JSON.stringify(state);
  sseClients.forEach(res => res.write(`data: ${data}\n\n`));
}

app.get('/overlay-events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.write(`data: ${JSON.stringify(state)}\n\n`);
  sseClients.push(res);
  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

app.get('/overlay-equipos', (_req, res) => {
  res.json(overlayState.EQUIPOS);
});

app.get('/overlay-state', (_req, res) => {
  res.json(state);
});

app.put('/overlay-state', (req, res) => {
  state = req.body;
  overlayState.save(state);
  broadcast();
  res.json(state);
});

app.post('/overlay-state/reset', (_req, res) => {
  state = overlayState.defaultState();
  overlayState.save(state);
  broadcast();
  res.json(state);
});

app.patch('/overlay-state/match', (req, res) => {
  overlayState.patch(state.match, req.body);
  overlayState.save(state);
  broadcast();
  res.json(state);
});

app.patch('/overlay-state/:side', (req, res) => {
  const side = req.params.side;
  if (!state[side]) {
    res.status(400).json({ error: 'Side inválido' });
    return;
  }

  overlayState.patch(state[side], req.body);
  overlayState.save(state);
  broadcast();
  res.json(state);
});

app.put('/overlay-state/resultados', (req, res) => {
  state.resultados = req.body.resultados || [];
  state.libre = req.body.libre || '';
  if (req.body.titulo !== undefined) state.resultadosTitulo = req.body.titulo;
  overlayState.save(state);
  broadcast();
  res.json(state);
});

// ─── TIMER SERVER-SIDE ────────────────────────────────────────────────────────

// Asegurar que el timer exista en el state cargado (migración hacia atrás)
if (!state.timer) {
  state.timer = { running: false, startTimestamp: null, baseMinute: 0, period: 'PT', addedTime: 0 };
}
// Asegurar que cortina exista en el state cargado
if (!state.cortina) {
  state.cortina = { mode: 'entretiempo' };
}
// Asegurar que widgets.cortina exista
if (state.widgets && state.widgets.cortina === undefined) {
  state.widgets.cortina = false;
}

function getTimerMinute() {
  if (!state.timer.running || !state.timer.startTimestamp) return state.timer.baseMinute;
  const elapsed = Math.floor((Date.now() - state.timer.startTimestamp) / 60000);
  return state.timer.baseMinute + elapsed;
}

// Broadcast del timer cada segundo (solo cuando está corriendo)
setInterval(() => {
  if (state.timer.running) {
    const minute = getTimerMinute();
    const tick = JSON.stringify({
      type: 'timer-tick',
      running: true,
      period: state.timer.period,
      addedTime: state.timer.addedTime,
      baseMinute: state.timer.baseMinute,
      startTimestamp: state.timer.startTimestamp,
      minute
    });
    sseClients.forEach(res => res.write(`data: ${tick}\n\n`));
  }
}, 1000);

// Programador automático de publicidad
setInterval(() => {
  if (state.ads && state.ads.autoEnabled && state.ads.nextAt && Date.now() >= state.ads.nextAt) {
    state.ads.active = true;
    state.ads.current = state.ads.current || 'banner';
    state.ads.nextAt = Date.now() + (state.ads.autoIntervalMin || 10) * 60 * 1000;
    overlayState.save(state);
    broadcast();
  }
}, 5000);

app.post('/overlay-state/timer/start', (req, res) => {
  if (!state.timer.running) {
    state.timer.running = true;
    state.timer.startTimestamp = Date.now();
    if (!state.timer.period) state.timer.period = 'PT';
    overlayState.save(state);
    broadcast();
    addHistory('timer-start', { period: state.timer.period });
  }
  res.json(state.timer);
});

app.post('/overlay-state/timer/pause', (req, res) => {
  if (state.timer.running) {
    state.timer.baseMinute = getTimerMinute();
    state.timer.running = false;
    state.timer.startTimestamp = null;
    overlayState.save(state);
    broadcast();
    addHistory('timer-pause', { minute: state.timer.baseMinute });
  }
  res.json(state.timer);
});

app.post('/overlay-state/timer/reset', (req, res) => {
  state.timer = { running: false, startTimestamp: null, baseMinute: 0, period: 'PT', addedTime: 0 };
  overlayState.save(state);
  broadcast();
  addHistory('timer-reset', {});
  res.json(state.timer);
});

app.patch('/overlay-state/timer/period', (req, res) => {
  const { period, baseMinute } = req.body;
  if (period) {
    state.timer.period = period;
    state.timer.running = false;
    state.timer.startTimestamp = null;
    if (baseMinute !== undefined) state.timer.baseMinute = Number(baseMinute);
    state.timer.addedTime = 0;
    overlayState.save(state);
    broadcast();
    addHistory('timer-period', { period });
  }
  res.json(state.timer);
});

app.patch('/overlay-state/timer/added', (req, res) => {
  const { addedTime } = req.body;
  if (addedTime !== undefined) {
    state.timer.addedTime = Number(addedTime);
    overlayState.save(state);
    broadcast();
  }
  res.json(state.timer);
});

// ─── INCIDENCIAS ─────────────────────────────────────────────────────────────

if (!state.incidents) state.incidents = [];

app.post('/overlay-state/incidents', (req, res) => {
  const inc = {
    id: Date.now().toString(),
    type: req.body.type || 'gol',
    team: req.body.team || 'local',
    player: req.body.player || '',
    playerOut: req.body.playerOut || '',
    minute: req.body.minute !== undefined ? req.body.minute : getTimerMinute(),
    timestamp: Date.now()
  };
  state.incidents.unshift(inc);
  if (state.incidents.length > 100) state.incidents = state.incidents.slice(0, 100);
  overlayState.save(state);
  broadcast();
  addHistory('incident', inc);
  res.json(inc);
});

app.delete('/overlay-state/incidents/:id', (req, res) => {
  const before = state.incidents.length;
  state.incidents = state.incidents.filter(i => i.id !== req.params.id);
  if (state.incidents.length < before) {
    overlayState.save(state);
    broadcast();
  }
  res.json({ ok: true });
});

// ─── WIDGETS ─────────────────────────────────────────────────────────────────

if (!state.widgets) state.widgets = {};

app.patch('/overlay-state/widgets', (req, res) => {
  Object.assign(state.widgets, req.body);
  overlayState.save(state);
  broadcast();
  res.json(state.widgets);
});

// ─── ALERTAS ─────────────────────────────────────────────────────────────────

if (!state.alerts) state.alerts = { active: false, type: null, team: null, player: null, minute: null };

app.patch('/overlay-state/alerts', (req, res) => {
  Object.assign(state.alerts, req.body);
  overlayState.save(state);
  broadcast();
  // Autolimpiar alerta después de 12 segundos si es transitoria
  if (state.alerts.active && req.body.autoClean !== false) {
    setTimeout(() => {
      if (state.alerts && state.alerts.active) {
        state.alerts.active = false;
        overlayState.save(state);
        broadcast();
      }
    }, 12000);
  }
  res.json(state.alerts);
});

// ─── EMERGENCIA ───────────────────────────────────────────────────────────────

if (state.emergencyMode === undefined) state.emergencyMode = false;

app.post('/overlay-state/emergency', (req, res) => {
  state.emergencyMode = !state.emergencyMode;
  overlayState.save(state);
  broadcast();
  addHistory('emergency', { active: state.emergencyMode });
  res.json({ emergencyMode: state.emergencyMode });
});

// ─── PUBLICIDAD ───────────────────────────────────────────────────────────────

if (!state.ads) state.ads = {};
// Ensure all ads fields exist (forward-compat with old JSON files)
state.ads = Object.assign({ active: false, current: null, sponsor: '', logoSponsor: '', logoBanner: '', banners: [], activeBannerId: null, autoEnabled: false, autoIntervalMin: 10, nextAt: null }, state.ads);

app.patch('/overlay-state/ads', (req, res) => {
  Object.assign(state.ads, req.body);
  if (req.body.autoEnabled && !state.ads.nextAt) {
    state.ads.nextAt = Date.now() + (state.ads.autoIntervalMin || 10) * 60 * 1000;
  }
  overlayState.save(state);
  broadcast();
  res.json(state.ads);
});

// ─── ESTADÍSTICAS ─────────────────────────────────────────────────────────────

if (!state.stats) state.stats = { local: { posesion:50,tiros:0,tirosPuerta:0,corners:0,faltas:0,offsides:0 }, visitante: { posesion:50,tiros:0,tirosPuerta:0,corners:0,faltas:0,offsides:0 }, jugadorDestacado: { team:null,nombre:'',numero:null,stat:'' } };

app.patch('/overlay-state/stats', (req, res) => {
  if (req.body.local) Object.assign(state.stats.local, req.body.local);
  if (req.body.visitante) Object.assign(state.stats.visitante, req.body.visitante);
  if (req.body.jugadorDestacado) Object.assign(state.stats.jugadorDestacado, req.body.jugadorDestacado);
  overlayState.save(state);
  broadcast();
  res.json(state.stats);
});

// ─── TICKER ───────────────────────────────────────────────────────────────────

if (!state.ticker) state.ticker = { items: [] };

app.patch('/overlay-state/ticker', (req, res) => {
  if (req.body.items !== undefined) state.ticker.items = req.body.items;
  overlayState.save(state);
  broadcast();
  res.json(state.ticker);
});

// ─── DT ───────────────────────────────────────────────────────────────────────

if (!state.dt) state.dt = { local: '', visitante: '' };

app.patch('/overlay-state/dt', (req, res) => {
  Object.assign(state.dt, req.body);
  overlayState.save(state);
  broadcast();
  res.json(state.dt);
});

// ─── HISTORIAL ────────────────────────────────────────────────────────────────

if (!state.history) state.history = [];

function addHistory(action, payload) {
  state.history.unshift({ action, payload, timestamp: Date.now() });
  if (state.history.length > 50) state.history = state.history.slice(0, 50);
}

app.get('/overlay-state/history', (_req, res) => {
  res.json(state.history || []);
});

// ─── ESTADO COMPLETO (sobreescribir timer del state leído) ────────────────────

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

