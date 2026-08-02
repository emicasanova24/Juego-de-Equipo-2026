/**
 * overlay-state.js
 * Módulo que administra el estado en vivo del partido.
 * Persiste en un archivo JSON local para sobrevivir reinicios del backend.
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'overlay-state.json');

// ── Equipos catálogo (fuente única de verdad para nombres y logos) ──
const EQUIPOS = {
  "Deportivo Garré":      "equipos/logos/garre.png",
  "Atlético Argentino":   "equipos/logos/argentinos.png",
  "Deportivo Maza":       "equipos/logos/maza.png",
  "El Ceibo":             "equipos/logos/ceibo.png",
  "Deportivo 17":         "equipos/logos/17.png",
  "Unión Deportiva":      "equipos/logos/uniontl.png",
  "Jorge Newbery":        "equipos/logos/newbery.png",
  "Juventud Unida":       "equipos/logos/juventud.png",
  "Atlético Quenumá":     "equipos/logos/quenuma.png",
  "Villa del Parque":     "equipos/logos/villa.png",
  "Salazar FC":           "equipos/logos/salazar.png",
  "Unión de Bonifacio":   "equipos/logos/bonifacio.png",
  "Deportivo Argentino":  "equipos/logos/deportivoarg.png",
  "Cecil A. Roberts":     "equipos/logos/roberts.png",
  "La Gloria":            "equipos/logos/lagloria.png"
};

// ── Estado por defecto ──
function defaultState() {
  return {
    // Marcador y estado del partido
    match: {
      status: "NO INICIADO",          // NO INICIADO | PRIMER TIEMPO | ENTRETIEMPO | SEGUNDO TIEMPO | FINALIZADO
      minute: "",
      referee: "",
      stadium: "",
      tournament: "APERTURA 2026"
    },
    // Timer oficial (server-side)
    timer: {
      running: false,
      startTimestamp: null,   // Date.now() cuando arrancó el período actual
      baseMinute: 0,          // Minutos acumulados antes del período actual
      period: "PT",           // PT | ET | ST | PROL | PEN | FIN
      addedTime: 0            // Tiempo agregado manual
    },
    // Incidencias del partido
    incidents: [],  // { id, type:"gol|amarilla|roja|cambio|var", team:"local|visitante", player, playerOut, minute, timestamp }
    // Widgets visibles en pantalla
    widgets: {
      marcador: true,
      formaciones: false,
      otrosPartidos: false,
      tablaPosiciones: false,
      ticker: false,
      publicidad: false,
      estadisticas: false,
      alerta: false,
      formacionPrevia: false,
      cortina: false
    },
    // Alerta activa
    alerts: {
      active: false,
      type: null,         // "gol" | "amarilla" | "roja" | "var" | "descanso" | "fin"
      team: null,
      player: null,
      minute: null
    },
    // Modo emergencia: oculta todos los overlays
    emergencyMode: false,
    // Publicidad
    ads: {
      active: false,
      current: null,      // "banner" | "cortina" | "overlay"
      sponsor: "",
      logoSponsor: "",
      logoBanner: "",
      banners: [],        // [{ id, name, url }] — lista de banners de sponsors
      activeBannerId: null,
      autoEnabled: false,
      autoIntervalMin: 10,
      nextAt: null        // timestamp para próxima inserción automática
    },
    // Estadísticas en vivo
    stats: {
      local:     { posesion: 50, tiros: 0, tirosPuerta: 0, corners: 0, faltas: 0, offsides: 0 },
      visitante: { posesion: 50, tiros: 0, tirosPuerta: 0, corners: 0, faltas: 0, offsides: 0 },
      jugadorDestacado: { team: null, nombre: "", numero: null, stat: "" }
    },
    // Ticker de noticias
    ticker: {
      items: []   // strings
    },
    // DT de cada equipo
    dt: {
      local: "",
      visitante: ""
    },
    // Historial de acciones (para undo)
    history: [],  // últimas 50, { action, payload, timestamp }
    // Equipo local
    local: {
      nombre: "",
      logo: "",
      color: "#019604",
      colorNumero: "#ffffff",
      formacion: "4-3-3",
      goles: 0,
      jugadores: [],   // { nombre, numero, goles:0, amarilla:false, roja:false, figura:false }
      suplentes: []
    },
    // Equipo visitante
    visitante: {
      nombre: "",
      logo: "",
      color: "#FFFFFF",
      colorNumero: "#000000",
      formacion: "4-4-2",
      goles: 0,
      jugadores: [],
      suplentes: []
    },
    // Resultados de otros partidos en simultáneo
    resultados: [],    // { local, logoLocal, gl, visitante, logoVisitante, gv }
    // Equipo libre en la fecha
    libre: "",
    // Cortina de entretiempo / inicio / final
    cortina: { mode: 'entretiempo' }
  };
}

// ── Leer estado desde disco ──
function load() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const saved = JSON.parse(raw);
      const def = defaultState();
      // Migración: agrega claves faltantes del estado por defecto
      for (const key of Object.keys(def)) {
        if (saved[key] === undefined) saved[key] = def[key];
      }
      if (saved.widgets && def.widgets) {
        for (const key of Object.keys(def.widgets)) {
          if (saved.widgets[key] === undefined) saved.widgets[key] = def.widgets[key];
        }
      }
      return saved;
    }
  } catch (err) {
    console.error('[overlay-state] Error leyendo estado, usando default:', err.message);
  }
  return defaultState();
}

// ── Guardar estado en disco ──
function save(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

// ── Parchear un objeto de forma profunda (1 nivel) ──
function patch(target, updates) {
  for (const key of Object.keys(updates)) {
    if (updates[key] !== undefined) {
      target[key] = updates[key];
    }
  }
  return target;
}

module.exports = { EQUIPOS, defaultState, load, save, patch };
