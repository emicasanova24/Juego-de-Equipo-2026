/* ============================================================
   panel.js — Lógica del Panel PRO (index.html)
   Requiere: config.js (WIDGETS_CONFIG, STAT_KEYS) cargado antes.
   Comunicación: REST (POST/PATCH/DELETE) + SSE (/overlay-events).
   ============================================================ */

const API = window.location.origin;

// ─── STATE ───────────────────────────────────────────
let state = null;
let allEquipos = [];
let allJugadores = [];
let equiposLogos = {};   // mapa nombre → ruta del logo (catálogo)
let resultadosData = []; // partidos cargados en "Otros Partidos"
const plantel = {
  local:     { titulares: [], suplentes: [] },
  visitante: { titulares: [], suplentes: [] }
};
const statsData = {
  local:     { posesion:50, tiros:0, tirosPuerta:0, corners:0, faltas:0, offsides:0 },
  visitante: { posesion:50, tiros:0, tirosPuerta:0, corners:0, faltas:0, offsides:0 }
};
let statsDebounce = null;
let adCountdownInterval = null;

// ─── INIT ─────────────────────────────────────────────
async function init() {
  buildStatsGrids();
  buildWidgetsPanel();
  await loadEquipos();
  await loadEquiposLogos();
  buildResultadosSelects();
  await fetchState();
  connectSSE();
}

async function loadEquipos() {
  try {
    const r = await fetch(API + '/equipos');
    allEquipos = await r.json();
    const opts = allEquipos.map(e => `<option value="${e.nombre}">${e.nombre}</option>`).join('');
    document.getElementById('localTeam').innerHTML    = '<option value="">— Equipo Local —</option>' + opts;
    document.getElementById('visitanteTeam').innerHTML = '<option value="">— Equipo Visitante —</option>' + opts;
  } catch(e) { console.error('Error cargando equipos:', e); }
}

async function loadEquiposLogos() {
  try {
    equiposLogos = await fetch(API + '/overlay-equipos').then(r => r.json());
  } catch(e) { console.error('Error cargando logos:', e); equiposLogos = {}; }
}

async function fetchState() {
  try {
    const r = await fetch(API + '/overlay-state');
    state = await r.json();
    renderAll(state);
    setBadge('green');
  } catch(e) { setBadge('red'); tryLoadLocal(); }
}

function connectSSE() {
  const es = new EventSource(API + '/overlay-events');
  es.onmessage = e => {
    setBadge('green');
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'timer-tick') {
        applyTimer({ baseMinute: data.baseMinute, startTimestamp: data.startTimestamp, running: data.running, addedTime: data.addedTime, period: data.period });
        return;
      }
      state = data;
      renderAll(state);
    } catch(err) { console.error(err); }
  };
  es.onopen  = () => setBadge('green');
  es.onerror = () => { setBadge('red'); es.close(); setTimeout(connectSSE, 3000); };
}

function setBadge(color) {
  const el = document.getElementById('connectionBadge');
  if (color === 'green') { el.textContent = 'Conectado';    el.className = 'px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest bg-green-900 text-green-300'; }
  else                   { el.textContent = 'Desconectado'; el.className = 'px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest bg-red-900 text-red-300'; }
}

function tryLoadLocal() {
  const s = localStorage.getItem('proState');
  if (s) { try { state = JSON.parse(s); renderAll(state); } catch(e){} }
}

// ─── RENDER ALL ───────────────────────────────────────
function renderAll(s) {
  if (!s) return;
  localStorage.setItem('proState', JSON.stringify(s));

  // Status badge
  document.getElementById('matchStatusBadge').textContent = s.match?.status || 'NO INICIADO';

  // Scores
  document.getElementById('localScore').textContent     = s.local?.goles ?? 0;
  document.getElementById('visitanteScore').textContent  = s.visitante?.goles ?? 0;

  // Team selects + logos
  if (s.local?.nombre)    setSelectVal('localTeam', s.local.nombre);
  if (s.visitante?.nombre) setSelectVal('visitanteTeam', s.visitante.nombre);
  setImgSrc('logoLocalMini',    s.local?.logo);
  setImgSrc('logoVisitanteMini', s.visitante?.logo);

  // Colors
  setVal('localColor',            s.local?.color);
  setVal('localColorNumero',      s.local?.colorNumero);
  setVal('visitanteColor',        s.visitante?.color);
  setVal('visitanteColorNumero',  s.visitante?.colorNumero);

  // Match info
  setVal('matchTournament', s.match?.tournament);
  setVal('matchReferee',    s.match?.referee);
  setVal('matchStadium',    s.match?.stadium);
  setSelectVal('matchStatus', s.match?.status);

  // DT
  setVal('dtLocal',     s.dt?.local);
  setVal('dtVisitante', s.dt?.visitante);

  // Formaciones
  setSelectVal('localFormacion',    s.local?.formacion);
  setSelectVal('visitanteFormacion', s.visitante?.formacion);

  // Timer
  if (s.timer) {
    applyTimer(s.timer);
  }

  // Plantel (solo actualizar contadores sin pisar edición activa)
  if (s.local?.jugadores && plantel.local.titulares.length === 0) {
    plantel.local.titulares = JSON.parse(JSON.stringify(s.local.jugadores || []));
    plantel.local.suplentes = JSON.parse(JSON.stringify(s.local.suplentes || []));
    renderPlantel('local');
  }
  if (s.visitante?.jugadores && plantel.visitante.titulares.length === 0) {
    plantel.visitante.titulares = JSON.parse(JSON.stringify(s.visitante.jugadores || []));
    plantel.visitante.suplentes = JSON.parse(JSON.stringify(s.visitante.suplentes || []));
    renderPlantel('visitante');
  }

  // Plantel names
  document.getElementById('plantelLocalName').textContent    = s.local?.nombre    || '—';
  document.getElementById('plantelVisitanteName').textContent = s.visitante?.nombre || '—';

  // Widgets
  renderWidgets(s.widgets || {});

  // Stats
  if (s.stats) {
    Object.assign(statsData.local,     s.stats.local     || {});
    Object.assign(statsData.visitante, s.stats.visitante || {});
    renderStats();
    setEl('statsLocalName', s.local?.nombre    || 'LOCAL');
    setEl('statsVisitName', s.visitante?.nombre || 'VISITANTE');
  }

  // Ticker
  if (s.ticker) renderTicker(s.ticker.items || []);

  // Otros Partidos (sincroniza lista/título/libre sin pisar edición activa)
  syncResultados(s);
  syncCortinaBtns(s);

  // Incidencias
  renderIncidents(s.incidents || []);
  refreshIncPlayers();

  // Historial
  renderHistory(s.history || []);

  // Publicidad
  if (s.ads) {
    setVal('adSponsor',    s.ads.sponsor);
    setVal('adInterval',   s.ads.autoIntervalMin);
    updateAdBtnStates(s.ads);
    const btn = document.getElementById('btnAutoAd');
    btn.textContent  = s.ads.autoEnabled ? 'Desactivar Auto' : 'Activar Auto';
    btn.className    = s.ads.autoEnabled ? 'btn-brand px-3 py-1 rounded-sm text-xs' : 'btn-gray px-3 py-1 rounded-sm text-xs';
    if (s.ads.nextAt) updateAdCountdown(s.ads.nextAt);
  }
}

// ─── TIMER ────────────────────────────────────────────
const PERIOD_LABELS = { PT:'1er TIEMPO', ET:'ENTRETIEMPO', ST:'2do TIEMPO', PROL:'PRÓRROGA', PEN:'PENALES', FIN:'FINALIZADO' };

function pad(n) { return String(n).padStart(2,'0'); }

// Estado local del cronómetro. Un único reloj evita parpadeos/conflictos.
const _timer = { base: 0, startTs: null, running: false, added: 0, period: 'PT' };

function applyTimer(t) {
  if (!t) return;
  _timer.base    = t.baseMinute || 0;
  _timer.startTs = t.startTimestamp || null;
  _timer.running = !!t.running;
  _timer.added   = t.addedTime || 0;
  _timer.period  = t.period || 'PT';
  renderPanelTimer();
  if (_timer.running) startPanelTimer(); else stopPanelTimer();
}

function renderPanelTimer() {
  const liveSec = _timer.running && _timer.startTs
    ? Math.floor((Date.now() - _timer.startTs) / 1000) : 0;
  const total = _timer.base * 60 + liveSec;
  document.getElementById('timerDisplay').textContent = pad(Math.floor(total / 60)) + ':' + pad(total % 60);
  document.getElementById('addedDisplay').textContent = _timer.added > 0 ? '+' + _timer.added + "' de tiempo agregado" : '';
  ['PT','ET','ST','PROL','PEN','FIN'].forEach(p => {
    const btn = document.getElementById('p' + p);
    if (btn) btn.classList.toggle('active', p === _timer.period);
  });
  document.getElementById('btnStart').classList.toggle('hidden', _timer.running);
  document.getElementById('btnPause').classList.toggle('hidden', !_timer.running);
}

function startPanelTimer() {
  if (window._timerInterval) return;
  window._timerInterval = setInterval(renderPanelTimer, 1000);
}

function stopPanelTimer() {
  if (window._timerInterval) { clearInterval(window._timerInterval); window._timerInterval = null; }
}

async function timerStart()  { await api('POST', '/overlay-state/timer/start'); ensureWidget('marcador'); }
async function timerPause()  { await api('POST', '/overlay-state/timer/pause'); }
async function timerReset()  { if (!confirm('¿Resetear el timer?')) return; await api('POST', '/overlay-state/timer/reset'); }
async function setPeriod(p, base) { await api('PATCH', '/overlay-state/timer/period', { period: p, baseMinute: base }); ensureWidget('marcador'); }
async function setAdded(v)   { await api('PATCH', '/overlay-state/timer/added', { addedTime: v }); if (v) setVal('addedCustom', v); ensureWidget('marcador'); }

// ─── MARCADOR ─────────────────────────────────────────
async function changeTeam(side) {
  const nombre = document.getElementById(side + 'Team').value;
  if (!nombre) return;
  const logos = await fetch(API + '/overlay-equipos').then(r => r.json());
  const logo = logos[nombre] || '';
  await api('PATCH', '/overlay-state/' + side, { nombre, logo });
  setImgSrc(side === 'local' ? 'logoLocalMini' : 'logoVisitanteMini', logo);
  document.getElementById('plantel' + cap(side) + 'Name').textContent = nombre;
  refreshIncPlayers();
  ensureWidget('marcador');
}

async function changeScore(side, delta) {
  const curr = side === 'local' ? (state?.local?.goles ?? 0) : (state?.visitante?.goles ?? 0);
  await api('PATCH', '/overlay-state/' + side, { goles: Math.max(0, curr + delta) });
  ensureWidget('marcador');
}

async function changeColor(side, color)       { await api('PATCH', '/overlay-state/' + side, { color }); ensureWidget('marcador'); }
async function changeNumeroColor(side, color)  { await api('PATCH', '/overlay-state/' + side, { colorNumero: color }); ensureWidget('marcador'); }
async function changeDT(side, val) {
  const patch = {}; patch[side] = val;
  await api('PATCH', '/overlay-state/dt', patch);
}
async function changeFormacion(side, formacion) { await api('PATCH', '/overlay-state/' + side, { formacion }); }
async function updateMatch() {
  await api('PATCH', '/overlay-state/match', {
    tournament: document.getElementById('matchTournament').value,
    referee:    document.getElementById('matchReferee').value,
    stadium:    document.getElementById('matchStadium').value,
    status:     document.getElementById('matchStatus').value
  });
}

// ─── PLANTEL ──────────────────────────────────────────
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function loadPlayersFromDB(side) {
  const nombre = document.getElementById(side + 'Team').value;
  if (!nombre) { alert('Primero seleccioná el equipo'); return; }
  if (!allEquipos.length) allEquipos = await fetch(API + '/equipos').then(r => r.json());
  if (!allJugadores.length) allJugadores = await fetch(API + '/jugadores').then(r => r.json());
  const equipo = allEquipos.find(e => e.nombre === nombre);
  if (!equipo) { alert('Equipo no encontrado en la base de datos'); return; }
  const players = allJugadores
    .filter(j => j.equipo_id === equipo.id)
    .map((j, i) => ({ nombre: j.nombre, numero: i + 1, goles: 0, amarilla: false, roja: false, figura: false }));
  plantel[side].titulares = players.slice(0, 11);
  plantel[side].suplentes = players.slice(11);
  renderPlantel(side);
}

function clearPlayers(side) {
  if (!confirm('¿Limpiar todo el plantel de ' + (side === 'local' ? 'local' : 'visitante') + '?')) return;
  plantel[side].titulares = [];
  plantel[side].suplentes = [];
  renderPlantel(side);
}

function renderPlantel(side) {
  const tit = plantel[side].titulares;
  const sup = plantel[side].suplentes;
  const C = cap(side);
  const formacion = (state?.[side]?.formacion) || document.getElementById(side + 'Formacion')?.value || '4-3-3';
  const posLabels = getPositionLabels(formacion);
  document.getElementById('titCount' + C).textContent = tit.length;
  document.getElementById('supCount' + C).textContent = sup.length;
  const titEl = document.getElementById('titList' + C);
  const supEl = document.getElementById('supList' + C);
  titEl.innerHTML = tit.length ? tit.map((p, i) => playerRow(side, 'tit', i, p, posLabels[i] || '')).join('') : '<p class="text-gray-600 text-xs text-center py-2">Sin titulares</p>';
  supEl.innerHTML = sup.length ? sup.map((p, i) => playerRow(side, 'sup', i, p, '')).join('') : '<p class="text-gray-600 text-xs text-center py-2">Sin suplentes</p>';
}

// Etiquetas de posición derivadas de la formación (robado del panel admin).
function getPositionLabels(formacion) {
  const parts = (formacion || '4-3-3').split('-').map(Number);
  const labels = ['ARQ'];
  const tags = ['DEF', 'MED', 'DEL', 'DEL'];
  parts.forEach((count, idx) => {
    for (let c = 0; c < count; c++) labels.push(tags[idx] || 'DEL');
  });
  return labels;
}

const POS_COLOR = { ARQ: 'text-yellow-400', DEF: 'text-blue-400', MED: 'text-green-400', DEL: 'text-red-400' };

function playerRow(side, type, idx, p, label) {
  const C = cap(side);
  const isSub = type === 'sup';
  const labelColor = POS_COLOR[label] || 'text-gray-400';
  // Marcas de sustitución: titular que entró desde el banco / suplente que salió a cancha.
  const rowBorder = (!isSub && p.entro) ? 'border-l-2 border-green-500 pl-1'
                  : (isSub && p.sustituido) ? 'border-l-2 border-red-500 pl-1 opacity-50' : '';
  const nameStrike = (isSub && p.sustituido) ? 'line-through' : '';
  return `<div class="flex items-center gap-1.5 bg-gray-800 rounded-lg px-2 py-1.5 mb-1 ${rowBorder}">
    ${label ? `<span class="text-[10px] font-black uppercase w-7 text-center shrink-0 ${labelColor}">${label}</span>` : ''}
    <input type="number" value="${p.numero || ''}" min="0" max="99" placeholder="#"
      class="w-10 bg-gray-700 border border-gray-600 rounded text-xs text-center text-white shrink-0"
      onchange="updatePlayer('${side}','${type}',${idx},'numero',+this.value)">
    <input value="${esc(p.nombre)}" onchange="updatePlayer('${side}','${type}',${idx},'nombre',this.value)" class="flex-1 bg-transparent border-b border-gray-600 focus:border-purple-500 outline-none text-sm text-gray-200 min-w-0 px-1 ${nameStrike}">
    <button onclick="adjGoal('${side}','${type}',${idx},-1)" class="text-gray-500 hover:text-purple-400 text-xs w-4 shrink-0">−</button>
    <span class="text-xs text-purple-400 font-black w-4 text-center shrink-0">${p.goles || 0}</span>
    <button onclick="adjGoal('${side}','${type}',${idx},1)"  class="text-purple-400 hover:text-purple-300 text-xs w-4 shrink-0">+</button>
    <button onclick="toggleProp('${side}','${type}',${idx},'amarilla')" class="text-sm shrink-0 ${p.amarilla ? '' : 'opacity-25'}" title="Amarilla">🟨</button>
    <button onclick="toggleProp('${side}','${type}',${idx},'roja')"    class="text-sm shrink-0 ${p.roja    ? '' : 'opacity-25'}" title="Roja">🟥</button>
    <button onclick="toggleProp('${side}','${type}',${idx},'figura')"  class="text-sm shrink-0 ${p.figura  ? 'text-yellow-400' : 'text-gray-700'}" title="Figura">⭐</button>
    ${isSub && !p.sustituido ? `<button onclick="startSubstitution('${side}',${idx})" class="text-sm shrink-0 text-green-400 hover:text-green-300" title="Hacer cambio (entra por un titular)">🔄</button>` : ''}
    <button onclick="moveSide('${side}','${type}',${idx})" class="text-gray-500 hover:text-white text-xs shrink-0" title="${type === 'tit' ? '→ Suplentes' : '→ Titulares'}">↕</button>
    <button onclick="removePlayer('${side}','${type}',${idx})" class="text-red-600 hover:text-red-400 text-xs shrink-0">✕</button>
  </div>`;
}

function updatePlayer(side, type, idx, field, value) {
  const list = type === 'tit' ? plantel[side].titulares : plantel[side].suplentes;
  if (list[idx]) list[idx][field] = value;
}

function adjGoal(side, type, idx, delta) {
  const list = type === 'tit' ? plantel[side].titulares : plantel[side].suplentes;
  if (list[idx]) list[idx].goles = Math.max(0, (list[idx].goles || 0) + delta);
  renderPlantel(side);
}

function toggleProp(side, type, idx, prop) {
  const list = type === 'tit' ? plantel[side].titulares : plantel[side].suplentes;
  if (list[idx]) list[idx][prop] = !list[idx][prop];
  renderPlantel(side);
}

function moveSide(side, type, idx) {
  const from = type === 'tit' ? plantel[side].titulares : plantel[side].suplentes;
  const to   = type === 'tit' ? plantel[side].suplentes : plantel[side].titulares;
  const [player] = from.splice(idx, 1);
  if (player) to.push(player);
  renderPlantel(side);
}

function removePlayer(side, type, idx) {
  const list = type === 'tit' ? plantel[side].titulares : plantel[side].suplentes;
  list.splice(idx, 1);
  renderPlantel(side);
}

function addPlayerManual(side, listType) {
  // listType: 'titulares' o 'suplentes'
  const player = { nombre: 'Jugador', numero: plantel[side].titulares.length + plantel[side].suplentes.length + 1, goles: 0, amarilla: false, roja: false, figura: false };
  if (listType === 'suplentes') plantel[side].suplentes.push(player);
  else plantel[side].titulares.push(player);
  renderPlantel(side);
}

async function savePlayers(side) {
  await api('PATCH', '/overlay-state/' + side, {
    jugadores: plantel[side].titulares,
    suplentes: plantel[side].suplentes
  });
}

// ─── SUSTITUCIONES ────────────────────────────────────
// Abre un modal para elegir qué titular sale cuando entra un suplente.
function startSubstitution(side, suplIdx) {
  const titulares = plantel[side].titulares || [];
  const suplente  = plantel[side].suplentes[suplIdx];
  if (!suplente) return;
  const formacion = (state?.[side]?.formacion) || document.getElementById(side + 'Formacion')?.value || '4-3-3';
  const posLabels = getPositionLabels(formacion);

  let overlay = document.getElementById('subOverlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'subOverlay';
  overlay.className = 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center';
  overlay.innerHTML = `
    <div class="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
      <h3 class="text-lg font-black text-purple-400 mb-1">Sustitución — ${side === 'local' ? 'Local' : 'Visitante'}</h3>
      <p class="text-sm text-gray-400 mb-4">Entra <span class="text-green-400 font-bold">${esc(suplente.nombre)}${suplente.numero ? ' (#' + suplente.numero + ')' : ''}</span> por:</p>
      <div class="flex flex-col gap-2 max-h-[50vh] overflow-y-auto">
        ${titulares.map((t, ti) => {
          const pl = posLabels[ti] || '';
          const plColor = POS_COLOR[pl] || '';
          return `<button onclick="confirmSubstitution('${side}',${suplIdx},${ti})"
            class="flex items-center gap-3 bg-gray-800 hover:bg-gray-700 rounded-lg px-4 py-3 text-left transition">
            <span class="text-xs font-black uppercase w-8 ${plColor}">${pl}</span>
            <span class="font-bold text-white">#${t.numero || ti + 1}</span>
            <span class="flex-1 text-gray-200">${esc(t.nombre)}</span>
          </button>`;
        }).join('')}
      </div>
      <button onclick="document.getElementById('subOverlay').remove()" class="mt-4 w-full bg-gray-800 hover:bg-gray-700 rounded-lg px-4 py-2 text-sm text-gray-400">Cancelar</button>
    </div>`;
  document.body.appendChild(overlay);
}

// Confirma el cambio: el suplente toma la posición exacta del titular,
// el titular pasa al banco marcado como sustituido, y se genera la incidencia + alerta.
async function confirmSubstitution(side, suplIdx, titIdx) {
  const titular  = plantel[side].titulares[titIdx];
  const suplente = plantel[side].suplentes[suplIdx];
  if (!titular || !suplente) return;

  const entra = suplente.nombre;
  const sale  = titular.nombre;

  // Suplente entra en la posición exacta del titular.
  suplente.entro = true;
  delete suplente.sustituido;
  plantel[side].titulares[titIdx] = suplente;

  // Titular sale al banco marcado como sustituido.
  titular.sustituido = true;
  delete titular.entro;
  plantel[side].suplentes.splice(suplIdx, 1);
  plantel[side].suplentes.push(titular);

  const overlay = document.getElementById('subOverlay');
  if (overlay) overlay.remove();

  renderPlantel(side);
  await savePlayers(side);

  // Incidencia automática (alimenta el banner del marcador, el listado y el historial).
  const minute = getCurrentMinute();
  await api('POST', '/overlay-state/incidents', { type: 'cambio', team: side, player: entra, playerOut: sale, minute });
  ensureWidget('marcador');
  showLiveAlert('cambio', side, entra, sale, minute);
}

function getCurrentMinute() {
  const liveSec = _timer.running && _timer.startTs ? Math.floor((Date.now() - _timer.startTs) / 1000) : 0;
  return _timer.base + Math.floor(liveSec / 60);
}

// Banner de incidencia en vivo, debajo del header del panel.
let _liveAlertTimer = null;
function showLiveAlert(type, side, player, playerOut, minute) {
  const bar = document.getElementById('liveAlertBar');
  if (!bar) return;
  const icons = { gol: '⚽', amarilla: '🟨', roja: '🟥', cambio: '🔄', var: '📺' };
  const teamName = side === 'local' ? (state?.local?.nombre || 'Local') : (state?.visitante?.nombre || 'Visitante');
  const accent = side === 'local' ? 'border-purple-500' : 'border-cyan-500';
  const detail = type === 'cambio'
    ? `<span class="text-green-400 font-black">▲ ${esc(player)}</span><span class="text-gray-500">entra por</span><span class="text-red-400 font-black">▼ ${esc(playerOut)}</span>`
    : `<span class="text-white font-black">${esc(player)}</span>`;
  bar.innerHTML = `
    <div class="flex items-center gap-3 bg-gray-900 border-l-4 ${accent} rounded-xl px-5 py-3 shadow-lg">
      <span class="text-2xl">${icons[type] || '•'}</span>
      <span class="text-xs font-black uppercase tracking-widest text-gray-400">${type}</span>
      <span class="text-xs text-gray-500 uppercase">${esc(teamName)}</span>
      <div class="flex items-center gap-2 flex-1 text-sm">${detail}</div>
      <span class="text-purple-400 font-black">${minute !== undefined ? minute + "'" : ''}</span>
      <button onclick="document.getElementById('liveAlertBar').classList.add('hidden')" class="text-gray-600 hover:text-white text-sm">✕</button>
    </div>`;
  bar.classList.remove('hidden');
  if (_liveAlertTimer) clearTimeout(_liveAlertTimer);
  _liveAlertTimer = setTimeout(() => bar.classList.add('hidden'), 12000);
}

// ─── INCIDENCIAS ──────────────────────────────────────
function togglePlayerOut() {
  const isCambio = document.getElementById('incType').value === 'cambio';
  document.getElementById('changeOutRow').classList.toggle('hidden', !isCambio);
  const lbl = document.getElementById('incPlayerLabel');
  if (lbl) {
    lbl.textContent = isCambio ? '▲ Entra' : 'Jugador';
    lbl.className = isCambio ? 'block text-xs mb-1 uppercase font-bold text-green-400' : 'block text-xs text-gray-400 mb-1 uppercase';
  }
}

function refreshIncPlayers() {
  if (!state) return;
  const team = document.getElementById('incTeam')?.value || 'local';
  const all  = [...(state[team]?.jugadores || []), ...(state[team]?.suplentes || [])];
  const opts = '<option value="">— Seleccionar —</option>' + all.map(p => `<option value="${p.nombre}">${p.numero ? p.numero + ' - ' : ''}${p.nombre}</option>`).join('');
  document.getElementById('incPlayer').innerHTML    = opts;
  document.getElementById('incPlayerOut').innerHTML = opts;
}

function refreshDestPlayers() {
  if (!state) return;
  const team = document.getElementById('destTeam')?.value || 'local';
  const players = state[team]?.jugadores || [];
  document.getElementById('destPlayer').innerHTML = '<option value="">— Jugador —</option>' + players.map(p => `<option value="${p.nombre}">${p.numero ? p.numero + ' - ' : ''}${p.nombre}</option>`).join('');
}

async function addIncident() {
  const type      = document.getElementById('incType').value;
  const team      = document.getElementById('incTeam').value;
  const player    = document.getElementById('incPlayer').value;
  const playerOut = document.getElementById('incPlayerOut').value;
  const minuteRaw = document.getElementById('incMinute').value;
  const minute    = minuteRaw !== '' ? parseInt(minuteRaw) : getCurrentMinute();
  await api('POST', '/overlay-state/incidents', { type, team, player, playerOut, minute });
  document.getElementById('incMinute').value = '';
  ensureWidget('marcador');
}

async function removeIncident(id) { await api('DELETE', '/overlay-state/incidents/' + id); }

let _lastIncidentId = null;
let _incidentsInit = false;
function renderIncidents(incidents) {
  const el = document.getElementById('incidentList');
  // Mostrar banner debajo del header cuando llega una incidencia nueva (también vía SSE).
  const latest = incidents && incidents.length ? incidents[0] : null;
  if (latest && latest.id !== _lastIncidentId) {
    if (_incidentsInit) showLiveAlert(latest.type, latest.team, latest.player, latest.playerOut, latest.minute);
    _lastIncidentId = latest.id;
  }
  _incidentsInit = true;
  if (!incidents?.length) { el.innerHTML = '<p class="text-gray-600 text-xs text-center">Sin incidencias</p>'; return; }
  const icons = { gol:'⚽', amarilla:'🟨', roja:'🟥', cambio:'🔄', var:'📺' };
  const labels = { gol:'Gol', amarilla:'Amarilla', roja:'Roja', cambio:'Cambio', var:'VAR' };
  el.innerHTML = incidents.slice(0, 30).map(inc => {
    const min       = inc.minute !== undefined ? inc.minute + "'" : '–';
    const accent    = inc.team === 'local' ? 'border-purple-500' : 'border-cyan-500';
    const teamColor = inc.team === 'local' ? 'text-purple-300'    : 'text-cyan-300';
    const teamName  = inc.team === 'local' ? (state?.local?.nombre || 'Local') : (state?.visitante?.nombre || 'Visitante');
    const body = inc.type === 'cambio'
      ? `<div class="flex flex-col gap-0.5 flex-1 min-w-0">
           <span class="flex items-center gap-1.5 text-green-400 font-bold truncate"><span class="text-sm">▲</span>${esc(inc.player) || '—'}</span>
           <span class="flex items-center gap-1.5 text-red-400 font-bold truncate"><span class="text-sm">▼</span>${esc(inc.playerOut) || '—'}</span>
         </div>`
      : `<span class="font-bold text-white truncate flex-1">${esc(inc.player) || '—'}</span>`;
    return `<div class="flex items-center gap-3 bg-gray-800 rounded-lg px-3 py-2 text-xs border-l-2 ${accent}">
      <div class="flex flex-col items-center justify-center shrink-0 w-10">
        <span class="text-lg leading-none">${icons[inc.type] || '•'}</span>
        <span class="text-purple-400 font-black mt-0.5 text-[11px]">${min}</span>
      </div>
      <div class="flex flex-col gap-0.5 flex-1 min-w-0">
        <span class="text-[10px] font-black uppercase tracking-wider ${teamColor} truncate">${labels[inc.type] || inc.type} · ${esc(teamName)}</span>
        ${body}
      </div>
      <button onclick="removeIncident('${inc.id}')" class="text-red-500 hover:text-red-400 shrink-0" title="Eliminar">✕</button>
    </div>`;
  }).join('');
}

// ─── WIDGETS ─────────────────────────────────────────
function buildWidgetsPanel() {
  document.getElementById('widgetsPanel').innerHTML = WIDGETS_CONFIG.map(w => `
    <div class="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
      <div class="min-w-0">
        <span class="text-sm font-medium">${w.label}</span>
        <a href="/${w.file}" target="_blank" class="block text-xs text-gray-500 hover:text-purple-400 truncate">${w.file}</a>
      </div>
      <button id="widget-${w.key}" onclick="toggleWidget('${w.key}')" class="toggle-switch ml-2">
        <span class="toggle-knob"></span>
      </button>
    </div>`).join('');
}

function renderWidgets(widgets) {
  WIDGETS_CONFIG.forEach(w => {
    const btn = document.getElementById('widget-' + w.key);
    if (btn) btn.classList.toggle('on', !!widgets[w.key]);
    const hdrBtn = document.getElementById('hdr-widget-' + w.key);
    if (hdrBtn) hdrBtn.classList.toggle('on', !!widgets[w.key]);
  });
}

async function toggleWidget(key) {
  const current = state?.widgets?.[key] || false;
  await api('PATCH', '/overlay-state/widgets', { [key]: !current });
}

// ─── OTROS PARTIDOS ───────────────────────────────────
function buildResultadosSelects() {
  const opts = (allEquipos || []).map(e => `<option value="${e.nombre}">${e.nombre}</option>`).join('');
  const local = document.getElementById('resLocal');
  const visit = document.getElementById('resVisitante');
  const libre = document.getElementById('resLibre');
  if (local) local.innerHTML = '<option value="">— Local —</option>' + opts;
  if (visit) visit.innerHTML = '<option value="">— Visitante —</option>' + opts;
  if (libre) libre.innerHTML = '<option value="">— Sin equipo libre —</option>' + opts;
}

function addResultado() {
  const local     = document.getElementById('resLocal').value;
  const visitante = document.getElementById('resVisitante').value;
  if (!local || !visitante) { alert('Elegí ambos equipos.'); return; }
  if (local === visitante)  { alert('Los equipos deben ser distintos.'); return; }
  resultadosData.push({
    local,
    logoLocal: equiposLogos[local] || '',
    gl: Number(document.getElementById('resGl').value) || 0,
    visitante,
    logoVisitante: equiposLogos[visitante] || '',
    gv: Number(document.getElementById('resGv').value) || 0
  });
  // Reset de los campos para el próximo
  document.getElementById('resLocal').value = '';
  document.getElementById('resVisitante').value = '';
  document.getElementById('resGl').value = 0;
  document.getElementById('resGv').value = 0;
  renderResultadosList();
  saveResultados();
}

function removeResultado(i) {
  resultadosData.splice(i, 1);
  renderResultadosList();
  saveResultados();
}

function renderResultadosList() {
  const cont = document.getElementById('resultadosList');
  if (!cont) return;
  if (resultadosData.length === 0) {
    cont.innerHTML = '<p class="text-gray-600 text-xs text-center">Sin partidos cargados</p>';
    return;
  }
  const btnCls = 'w-5 h-5 flex items-center justify-center rounded text-xs font-black leading-none flex-shrink-0';
  cont.innerHTML = resultadosData.map((p, i) => `
    <div class="flex items-center gap-1 bg-gray-800 rounded px-2 py-1.5 text-xs">
      <span class="flex-1 text-right truncate text-gray-200">${p.local}</span>
      <div class="flex items-center gap-0.5 flex-shrink-0">
        <button onclick="changeResultadoScore(${i},'gl',-1)" class="${btnCls} bg-gray-700 hover:bg-gray-600 text-gray-300">−</button>
        <strong class="w-5 text-center text-purple-300 tabular-nums">${p.gl ?? 0}</strong>
        <button onclick="changeResultadoScore(${i},'gl',1)"  class="${btnCls} bg-purple-800 hover:bg-purple-700 text-white">+</button>
        <span class="text-gray-500 px-0.5">-</span>
        <button onclick="changeResultadoScore(${i},'gv',-1)" class="${btnCls} bg-gray-700 hover:bg-gray-600 text-gray-300">−</button>
        <strong class="w-5 text-center text-purple-300 tabular-nums">${p.gv ?? 0}</strong>
        <button onclick="changeResultadoScore(${i},'gv',1)"  class="${btnCls} bg-purple-800 hover:bg-purple-700 text-white">+</button>
      </div>
      <span class="flex-1 truncate text-gray-200">${p.visitante}</span>
      <button onclick="removeResultado(${i})" class="text-red-400 hover:text-red-300 ml-1 font-black flex-shrink-0 text-[10px]">✕</button>
    </div>`).join('');
}

function changeResultadoScore(i, field, delta) {
  const p = resultadosData[i];
  if (!p) return;
  p[field] = Math.max(0, (p[field] ?? 0) + delta);
  renderResultadosList();
  saveResultados();
}

async function saveResultados() {
  const titulo = document.getElementById('resTitulo')?.value || '';
  const libre  = document.getElementById('resLibre')?.value || '';
  await api('PUT', '/overlay-state/resultados', { resultados: resultadosData, libre, titulo });
}

// Refleja en el panel los resultados/libre/título del estado, sin interrumpir
// la edición que el usuario pueda estar haciendo en un campo enfocado.
function syncResultados(s) {
  const sig = JSON.stringify(s.resultados || []);
  if (sig !== JSON.stringify(resultadosData)) {
    resultadosData = JSON.parse(sig);
    renderResultadosList();
  }
  const tituloEl = document.getElementById('resTitulo');
  if (tituloEl && document.activeElement !== tituloEl) {
    tituloEl.value = s.resultadosTitulo || '';
  }
  const libreEl = document.getElementById('resLibre');
  if (libreEl && document.activeElement !== libreEl) {
    libreEl.value = s.libre || '';
  }
}

// ─── CORTINA ──────────────────────────────────────────
function syncCortinaBtns(s) {
  const isOn = !!s.widgets?.cortina;
  const mode = s.cortina?.mode || 'entretiempo';
  ['inicio', 'entretiempo', 'final'].forEach(m => {
    const btn = document.getElementById('cortinaBtn-' + m);
    if (!btn) return;
    const active = isOn && mode === m;
    btn.style.cssText = active
      ? 'flex:1;padding:8px 4px;font-size:11px;font-weight:900;text-transform:uppercase;background:#7c3aed;color:#fff;border:1px solid #6d28d9;cursor:pointer;border-radius:2px'
      : 'flex:1;padding:8px 4px;font-size:11px;font-weight:900;text-transform:uppercase;background:#374151;color:#9ca3af;border:1px solid #4b5563;cursor:pointer;border-radius:2px';
  });
}

async function setCortinaModo(mode) {
  const isOn = !!state?.widgets?.cortina;
  const currentMode = state?.cortina?.mode;
  if (isOn && currentMode === mode) {
    await api('PATCH', '/overlay-state/widgets', { cortina: false });
  } else {
    await api('PATCH', '/overlay-state/cortina', { mode });
    await api('PATCH', '/overlay-state/widgets', { cortina: true });
  }
}

// ─── PUBLICIDAD ───────────────────────────────────────
const _adLogos = {};
function cacheAdLogo(type, url) { _adLogos[type] = url; }

// ── Multi-banner list ──
function renderBannersList(ads) {
  const banners  = ads?.banners || [];
  const activeId = ads?.activeBannerId;
  const isOn     = ads?.active && ads?.current === 'banner';
  const container = document.getElementById('bannersList');
  if (!container) return;
  if (banners.length === 0) {
    container.innerHTML = '<p class="text-gray-600 text-xs text-center py-2">Sin banners cargados</p>';
    return;
  }
  container.innerHTML = banners.map(b => {
    const active = isOn && activeId === b.id;
    const btnStyle = active
      ? 'padding:3px 12px;font-size:11px;font-weight:900;text-transform:uppercase;background:#7c3aed;color:#fff;border:1px solid #6d28d9;border-radius:2px;cursor:pointer;flex-shrink:0'
      : 'padding:3px 12px;font-size:11px;font-weight:900;text-transform:uppercase;background:#374151;color:#9ca3af;border:1px solid #4b5563;border-radius:2px;cursor:pointer;flex-shrink:0';
    const rowStyle = active ? 'background:#1e1b4b;border:1px solid #4c1d95;border-radius:4px;padding:6px 10px;display:flex;align-items:center;gap:8px' : 'background:#1f2937;border:1px solid #374151;border-radius:4px;padding:6px 10px;display:flex;align-items:center;gap:8px';
    return `<div style="${rowStyle}">
      <span style="font-size:11px;color:#d1d5db;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(b.url)}">${escHtml(b.name)}</span>
      <button onclick="activateBanner('${b.id}')" style="${btnStyle}">${active ? 'ON' : 'OFF'}</button>
      <button onclick="deleteBanner('${b.id}')" style="font-size:14px;color:#f87171;background:none;border:none;cursor:pointer;flex-shrink:0;line-height:1" title="Eliminar">×</button>
    </div>`;
  }).join('');
}

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function activateBanner(id) {
  const banners  = state?.ads?.banners || [];
  const isActive = state?.ads?.active && state?.ads?.current === 'banner' && state?.ads?.activeBannerId === id;
  if (isActive) {
    await api('PATCH', '/overlay-state/ads', { active: false, current: null, activeBannerId: null, logoBanner: '' });
    await api('PATCH', '/overlay-state/widgets', { publicidad: false });
  } else {
    const banner = banners.find(b => b.id === id);
    if (!banner) return;
    await api('PATCH', '/overlay-state/ads', { active: true, current: 'banner', activeBannerId: id, logoBanner: banner.url, logoSponsor: banner.url });
    await api('PATCH', '/overlay-state/widgets', { publicidad: true });
  }
}

async function addBanner() {
  const nameEl = document.getElementById('newBannerName');
  const urlEl  = document.getElementById('newBannerUrl');
  const addBtn = document.querySelector('button[onclick="addBanner()"]');
  const name   = nameEl?.value.trim();
  const url    = urlEl?.value.trim();
  if (!name || !url) {
    if (nameEl && !name) nameEl.style.outline = '2px solid #f87171';
    if (urlEl  && !url)  urlEl.style.outline  = '2px solid #f87171';
    return;
  }
  if (nameEl) nameEl.style.outline = '';
  if (urlEl)  urlEl.style.outline  = '';
  if (addBtn) { addBtn.textContent = '…'; addBtn.disabled = true; }
  const banners = [...(state?.ads?.banners || []), { id: Date.now().toString(), name, url }];
  await api('PATCH', '/overlay-state/ads', { banners });
  if (nameEl) nameEl.value = '';
  if (urlEl)  urlEl.value  = '';
  if (addBtn) { addBtn.textContent = '+'; addBtn.disabled = false; }
}

async function deleteBanner(id) {
  const banners = (state?.ads?.banners || []).filter(b => b.id !== id);
  const patch = { banners };
  if (state?.ads?.activeBannerId === id) {
    Object.assign(patch, { activeBannerId: null, active: false, current: null, logoBanner: '' });
    await api('PATCH', '/overlay-state/widgets', { publicidad: false });
  }
  await api('PATCH', '/overlay-state/ads', patch);
}

async function toggleAdType(type) {
  const isActive = state?.ads?.active && state?.ads?.current === type;
  if (isActive) {
    await api('PATCH', '/overlay-state/ads', { active: false, current: null });
    await api('PATCH', '/overlay-state/widgets', { publicidad: false });
  } else {
    const logoUrl = _adLogos[type] || document.getElementById('adLogo' + cap(type))?.value || '';
    const sponsor = document.getElementById('adSponsor')?.value || '';
    await api('PATCH', '/overlay-state/ads', { active: true, current: type, logoSponsor: logoUrl, sponsor });
    await api('PATCH', '/overlay-state/widgets', { publicidad: true });
  }
}

function updateAdBtnStates(ads) {
  renderBannersList(ads);
  ['cortina','overlay'].forEach(type => {
    const btn = document.getElementById('ad' + cap(type) + 'Btn');
    if (!btn) return;
    const active = ads?.active && ads?.current === type;
    btn.textContent = active ? 'ON' : 'OFF';
    btn.style.cssText = active
      ? 'padding:4px 14px;font-size:11px;font-weight:900;text-transform:uppercase;background:#7c3aed;color:#fff;border:1px solid #6d28d9;cursor:pointer;flex-shrink:0;margin-left:auto'
      : 'padding:4px 14px;font-size:11px;font-weight:900;text-transform:uppercase;background:#374151;color:#9ca3af;border:1px solid #4b5563;cursor:pointer;flex-shrink:0;margin-left:auto';
  });
}

async function setAd(type)  { await api('PATCH', '/overlay-state/ads', { active: true, current: type }); await api('PATCH', '/overlay-state/widgets', { publicidad: true }); }
async function clearAd()    { await api('PATCH', '/overlay-state/ads', { active: false, current: null }); await api('PATCH', '/overlay-state/widgets', { publicidad: false }); }
async function updateAdSponsor() {
  await api('PATCH', '/overlay-state/ads', {
    sponsor:     document.getElementById('adSponsor').value,
    logoSponsor: _adLogos[state?.ads?.current] || ''
  });
}
async function toggleAutoAd() {
  const current  = state?.ads?.autoEnabled || false;
  const interval = parseInt(document.getElementById('adInterval').value) || 10;
  await api('PATCH', '/overlay-state/ads', { autoEnabled: !current, autoIntervalMin: interval });
}
function updateAdCountdown(nextAt) {
  if (adCountdownInterval) clearInterval(adCountdownInterval);
  function tick() {
    const rem = Math.max(0, Math.floor((nextAt - Date.now()) / 1000));
    document.getElementById('adNextLabel').textContent = rem > 0
      ? `Próxima inserción en ${Math.floor(rem/60)}:${(rem%60).toString().padStart(2,'0')}`
      : 'Próxima inserción ahora';
  }
  tick(); adCountdownInterval = setInterval(tick, 1000);
}

// ─── ESTADÍSTICAS ─────────────────────────────────────
function buildStatsGrids() {
  const grid = document.getElementById('statsUnifiedGrid');
  if (!grid) return;
  grid.innerHTML = STAT_KEYS.map(s => `
    <div class="grid items-center gap-1 px-1" style="grid-template-columns:auto 1fr auto">
      <div class="flex items-center gap-1">
        <button onclick="adjStat('local','${s.key}',-1)" class="bg-gray-700 w-5 h-5 rounded text-xs flex items-center justify-center">−</button>
        <span id="st-local-${s.key}" class="text-sm font-bold w-6 text-center text-purple-300">0</span>
        <button onclick="adjStat('local','${s.key}',1)"  class="bg-purple-700 w-5 h-5 rounded text-xs flex items-center justify-center">+</button>
      </div>
      <span class="text-[10px] text-gray-400 text-center uppercase tracking-wider">${s.label}</span>
      <div class="flex items-center gap-1 justify-end">
        <button onclick="adjStat('visitante','${s.key}',-1)" class="bg-gray-700 w-5 h-5 rounded text-xs flex items-center justify-center">−</button>
        <span id="st-visitante-${s.key}" class="text-sm font-bold w-6 text-center text-cyan-300">0</span>
        <button onclick="adjStat('visitante','${s.key}',1)"  class="bg-purple-700 w-5 h-5 rounded text-xs flex items-center justify-center">+</button>
      </div>
    </div>`).join('');
}

function updatePosesion(val) {
  const v = parseInt(val);
  statsData.local.posesion     = v;
  statsData.visitante.posesion = 100 - v;
  document.getElementById('posLocalLabel').textContent = (state?.local?.nombre || 'LOCAL') + ' ' + v + '%';
  document.getElementById('posVisitLabel').textContent = (100 - v) + '% ' + (state?.visitante?.nombre || 'VISITANTE');
  debounceStats();
}

function adjStat(team, key, delta) {
  statsData[team][key] = Math.max(0, (statsData[team][key] || 0) + delta);
  renderStats();
  debounceStats();
}

function debounceStats() { clearTimeout(statsDebounce); statsDebounce = setTimeout(() => { api('PATCH', '/overlay-state/stats', { local: statsData.local, visitante: statsData.visitante }); ensureWidget('estadisticas'); }, 800); }

function renderStats() {
  STAT_KEYS.forEach(s => {
    setEl('st-local-' + s.key,     statsData.local[s.key] ?? 0);
    setEl('st-visitante-' + s.key, statsData.visitante[s.key] ?? 0);
  });
  const sl = document.getElementById('posesionSlider');
  if (sl) sl.value = statsData.local.posesion ?? 50;
  const posL = statsData.local.posesion ?? 50;
  document.getElementById('posLocalLabel').textContent = (state?.local?.nombre || 'LOCAL') + ' ' + posL + '%';
  document.getElementById('posVisitLabel').textContent = (statsData.visitante.posesion ?? 50) + '% ' + (state?.visitante?.nombre || 'VISITANTE');
  const bl = document.getElementById('posBarLocal');
  const bv = document.getElementById('posBarVisit');
  if (bl) bl.style.width = posL + '%';
  if (bv) bv.style.width = (100 - posL) + '%';
}

async function saveDestacado() {
  const team   = document.getElementById('destTeam').value;
  const nombre = document.getElementById('destPlayer').value;
  const stat   = document.getElementById('destStat').value;
  const numero = state?.[team]?.jugadores?.find(j => j.nombre === nombre)?.numero || null;
  await api('PATCH', '/overlay-state/stats', { jugadorDestacado: { team, nombre, numero, stat } });
}

// ─── TICKER ───────────────────────────────────────────
async function addTickerItem() {
  const input = document.getElementById('tickerInput');
  const text  = input.value.trim();
  if (!text) return;
  const items = [...(state?.ticker?.items || []), text];
  await api('PATCH', '/overlay-state/ticker', { items });
  input.value = '';
  ensureWidget('ticker');
}
async function removeTickerItem(idx) {
  const items = [...(state?.ticker?.items || [])];
  items.splice(idx, 1);
  await api('PATCH', '/overlay-state/ticker', { items });
}
function renderTicker(items) {
  const el = document.getElementById('tickerList');
  if (!items?.length) { el.innerHTML = '<p class="text-gray-600 text-xs text-center">Sin items</p>'; return; }
  el.innerHTML = items.map((item, i) => `
    <div class="flex items-center gap-2 bg-gray-800 rounded px-2 py-1 text-xs">
      <span class="flex-1 text-gray-300">${item}</span>
      <button onclick="removeTickerItem(${i})" class="text-red-500 hover:text-red-400 shrink-0">✕</button>
    </div>`).join('');
}

// ─── HISTORIAL ────────────────────────────────────────
function renderHistory(history) {
  const el = document.getElementById('historyList');
  if (!history?.length) { el.innerHTML = '<p class="text-gray-600 text-center">Sin acciones</p>'; return; }
  const labels = { 'timer-start':'▶ Timer', 'timer-pause':'⏸ Pausa', 'timer-reset':'↺ Reset', 'timer-period':'📌 Período', incident:'📋 Incidencia', emergency:'🚨 Emergencia' };
  el.innerHTML = history.slice(0, 30).map(h => {
    const time   = new Date(h.timestamp).toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    const label  = labels[h.action] || h.action;
    const detail = h.payload?.type ? ' · ' + h.payload.type : h.payload?.period ? ' · ' + h.payload.period : '';
    return `<div class="flex gap-2 py-1 border-b border-gray-800 text-xs">
      <span class="text-gray-600 w-16 shrink-0">${time}</span>
      <span class="text-gray-400">${label}${detail}</span>
    </div>`;
  }).join('');
}

// ─── EMERGENCIA ───────────────────────────────────────
async function toggleEmergency() {
  await api('POST', '/overlay-state/emergency');
  document.getElementById('emergencyOverlay').classList.toggle('hidden', !state?.emergencyMode);
}

// ─── PLANTILLAS ───────────────────────────────────────
async function applyTemplate(tpl) {
  if (!tpl) return;
  const map = { liga:'LIGA APERTURA 2026', copa:'COPA REGIONAL 2026', amistoso:'PARTIDO AMISTOSO', liguilla:'LIGUILLA FINAL 2026' };
  if (map[tpl]) { document.getElementById('matchTournament').value = map[tpl]; await api('PATCH', '/overlay-state/match', { tournament: map[tpl] }); }
  document.getElementById('templateSel').value = '';
}

// ─── RESET ────────────────────────────────────────────
async function resetState() {
  if (!confirm('¿Resetear TODO el estado? No se puede deshacer.')) return;
  await fetch(API + '/overlay-state/reset', { method: 'POST' });
  plantel.local.titulares    = []; plantel.local.suplentes    = [];
  plantel.visitante.titulares = []; plantel.visitante.suplentes = [];
  renderPlantel('local'); renderPlantel('visitante');
}

// ─── API HELPER ───────────────────────────────────────
async function api(method, endpoint, body) {
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(API + endpoint, opts);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch(e) { console.error(endpoint, e); }
}

// ─── WIDGET TOGGLE ────────────────────────────────────
async function ensureWidget(key) {
  const current = await api('GET', '/overlay-state');
  if (!current?.widgets?.[key]) {
    await api('PATCH', '/overlay-state/widgets', { [key]: true });
  }
}

// ─── UTILS ────────────────────────────────────────────
function setVal(id, val) { const el = document.getElementById(id); if (el && val != null) el.value = val; }
function setEl(id, val)  { const el = document.getElementById(id); if (el) el.textContent = val; }
function setImgSrc(id, src) {
  const el = document.getElementById(id);
  if (!el) return;
  if (src) {
    el.src = src.startsWith('http') ? src : '/' + src.replace(/^\//, '');
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
}
function setSelectVal(id, val) {
  const el = document.getElementById(id); if (!el || !val) return;
  for (const opt of el.options) { if (opt.value === val || opt.text === val) { el.value = opt.value; break; } }
}

// ─── START ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
