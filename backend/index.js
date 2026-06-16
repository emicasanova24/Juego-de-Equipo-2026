const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const overlayState = require('./overlay-state');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_error) {
  // dotenv es opcional si las variables ya existen en el entorno.
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'juegode_equipo',
  password: process.env.DB_PASSWORD || '41211874',
  port: Number(process.env.DB_PORT || 5432)
});

const PORT = Number(process.env.PORT || 3000);

app.get('/equipos', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM equipos ORDER BY nombre');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error en el servidor');
  }
});

app.get('/jugadores', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM jugadores ORDER BY nombre');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error en el servidor');
  }
});

app.get('/goleadores', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT j.nombre AS jugador, e.nombre AS equipo, COUNT(ev.id) AS goles
      FROM eventos ev
      JOIN jugadores j ON ev.jugador_id = j.id
      JOIN equipos e ON j.equipo_id = e.id
      WHERE ev.tipo_evento = 'gol'
      GROUP BY j.id, j.nombre, e.nombre
      ORDER BY goles DESC, j.nombre ASC;
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al obtener goleadores');
  }
});

app.get('/fixture', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id,
             p.fecha,
             el.nombre AS equipo_local,
             ev.nombre AS equipo_visitante,
             p.goles_local,
             p.goles_visitante,
             p.jugado,
             p.estadio
      FROM partidos p
      JOIN equipos el ON p.equipo_local_id = el.id
      JOIN equipos ev ON p.equipo_visitante_id = ev.id
      ORDER BY p.fecha, p.id;
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al obtener el fixture');
  }
});

app.post('/equipos', async (req, res) => {
  const { nombre } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO equipos (nombre) VALUES ($1) RETURNING *',
      [nombre]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al crear equipo');
  }
});

app.post('/jugadores', async (req, res) => {
  const { nombre, equipo_id } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO jugadores (nombre, equipo_id) VALUES ($1, $2) RETURNING *',
      [nombre, equipo_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al crear jugador');
  }
});

app.post('/partidos', async (req, res) => {
  const {
    fecha,
    equipo_local_id,
    equipo_visitante_id,
    goles_local,
    goles_visitante,
    jugado,
    estadio
  } = req.body;

  try {
    const insertResult = await pool.query(
      `INSERT INTO partidos (
        fecha,
        equipo_local_id,
        equipo_visitante_id,
        goles_local,
        goles_visitante,
        jugado,
        estadio
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id`,
      [
        fecha,
        equipo_local_id,
        equipo_visitante_id,
        goles_local,
        goles_visitante,
        jugado,
        estadio
      ]
    );

    const partidoId = insertResult.rows[0].id;
    const partido = await pool.query(
      `SELECT p.id,
              p.fecha,
              p.estadio,
              p.goles_local,
              p.goles_visitante,
              p.jugado,
              el.nombre AS equipo_local,
              ev.nombre AS equipo_visitante
       FROM partidos p
       JOIN equipos el ON p.equipo_local_id = el.id
       JOIN equipos ev ON p.equipo_visitante_id = ev.id
       WHERE p.id = $1`,
      [partidoId]
    );

    res.json(partido.rows[0]);
  } catch (err) {
    console.error('Error al crear partido:', err);
    res.status(500).send('Error al crear partido');
  }
});

app.post('/eventos', async (req, res) => {
  const { partido_id, jugador_id, tipo_evento, minuto } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO eventos (partido_id, jugador_id, tipo_evento, minuto) VALUES ($1, $2, $3, $4) RETURNING *',
      [partido_id, jugador_id, tipo_evento, minuto]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al crear evento');
  }
});

app.get('/partidos', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id,
             p.fecha,
             el.nombre AS equipo_local,
             ev.nombre AS equipo_visitante,
             p.goles_local,
             p.goles_visitante,
             p.estadio,
             p.jugado
      FROM partidos p
      JOIN equipos el ON p.equipo_local_id = el.id
      JOIN equipos ev ON p.equipo_visitante_id = ev.id
      ORDER BY p.fecha;
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al obtener partidos');
  }
});

app.get('/eventos', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.id, e.partido_id, j.nombre AS jugador, e.tipo_evento, e.minuto
      FROM eventos e
      JOIN jugadores j ON e.jugador_id = j.id
      ORDER BY e.partido_id, e.minuto;
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al obtener eventos');
  }
});

app.get('/estadios', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM estadios ORDER BY nombre');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al obtener estadios');
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1 AND password = $2',
      [email, password]
    );

    if (result.rows.length > 0) {
      res.json({ success: true, message: 'Login correcto' });
      return;
    }

    res.status(401).json({ success: false, message: 'Credenciales inválidas' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error en el servidor');
  }
});

app.get('/estructura/:tabla', async (req, res) => {
  const { tabla } = req.params;
  try {
    const result = await pool.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_name = $1`,
      [tabla]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al obtener estructura');
  }
});

app.get('/tabla', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.id,
             e.nombre AS equipo,
             COUNT(p.id) AS jugados,
             COALESCE(SUM(CASE WHEN p.goles_local > p.goles_visitante AND p.equipo_local_id = e.id THEN 1
                               WHEN p.goles_visitante > p.goles_local AND p.equipo_visitante_id = e.id THEN 1
                               ELSE 0 END), 0) AS ganados,
             COALESCE(SUM(CASE WHEN p.goles_local = p.goles_visitante AND (p.equipo_local_id = e.id OR p.equipo_visitante_id = e.id) THEN 1 ELSE 0 END), 0) AS empatados,
             COALESCE(SUM(CASE WHEN p.goles_local < p.goles_visitante AND p.equipo_local_id = e.id THEN 1
                               WHEN p.goles_visitante < p.goles_local AND p.equipo_visitante_id = e.id THEN 1
                               ELSE 0 END), 0) AS perdidos,
             COALESCE(SUM(CASE WHEN p.equipo_local_id = e.id THEN p.goles_local ELSE p.goles_visitante END), 0) AS goles_favor,
             COALESCE(SUM(CASE WHEN p.equipo_local_id = e.id THEN p.goles_visitante ELSE p.goles_local END), 0) AS goles_contra,
             COALESCE(SUM(CASE WHEN p.equipo_local_id = e.id THEN p.goles_local ELSE p.goles_visitante END), 0) -
             COALESCE(SUM(CASE WHEN p.equipo_local_id = e.id THEN p.goles_visitante ELSE p.goles_local END), 0) AS dg,
             COALESCE(SUM(CASE WHEN p.goles_local > p.goles_visitante AND p.equipo_local_id = e.id THEN 3
                               WHEN p.goles_visitante > p.goles_local AND p.equipo_visitante_id = e.id THEN 3
                               WHEN p.goles_local = p.goles_visitante AND (p.equipo_local_id = e.id OR p.equipo_visitante_id = e.id) THEN 1
                               ELSE 0 END), 0) AS puntos
      FROM equipos e
      LEFT JOIN partidos p
        ON (e.id = p.equipo_local_id OR e.id = p.equipo_visitante_id)
       AND p.jugado = true
      GROUP BY e.id, e.nombre
      ORDER BY puntos DESC, dg DESC, goles_favor DESC, equipo ASC;
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al calcular tabla');
  }
});

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

if (!state.ads) state.ads = { active: false, current: null, sponsor: '', logoSponsor: '', autoEnabled: false, autoIntervalMin: 10, nextAt: null };

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

