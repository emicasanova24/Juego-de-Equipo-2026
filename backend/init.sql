CREATE DATABASE juegode_equipo;

\c juegode_equipo;

CREATE TABLE IF NOT EXISTS equipos (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS estadios (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS partidos (
  id SERIAL PRIMARY KEY,
  fecha TIMESTAMPTZ NOT NULL,
  equipo_local_id INTEGER NOT NULL REFERENCES equipos(id),
  equipo_visitante_id INTEGER NOT NULL REFERENCES equipos(id),
  goles_local INTEGER NOT NULL DEFAULT 0,
  goles_visitante INTEGER NOT NULL DEFAULT 0,
  jugado BOOLEAN NOT NULL DEFAULT FALSE,
  estadio TEXT,
  CONSTRAINT partidos_equipos_distintos CHECK (equipo_local_id <> equipo_visitante_id)
);

CREATE TABLE IF NOT EXISTS jugadores (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  equipo_id INTEGER NOT NULL REFERENCES equipos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS eventos (
  id SERIAL PRIMARY KEY,
  partido_id INTEGER NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
  jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  tipo_evento TEXT NOT NULL,
  minuto INTEGER NOT NULL CHECK (minuto >= 0)
);

CREATE INDEX IF NOT EXISTS idx_jugadores_equipo_id ON jugadores(equipo_id);
CREATE INDEX IF NOT EXISTS idx_eventos_partido_id ON eventos(partido_id);
CREATE INDEX IF NOT EXISTS idx_eventos_jugador_id ON eventos(jugador_id);
CREATE INDEX IF NOT EXISTS idx_partidos_fecha ON partidos(fecha);

INSERT INTO equipos (nombre) VALUES
  ('Atlético Argentino'),
  ('Atlético Quenumá'),
  ('Cecil A. Roberts'),
  ('Deportivo 17'),
  ('Deportivo Argentino'),
  ('Deportivo Garré'),
  ('Deportivo Maza'),
  ('El Ceibo'),
  ('Jorge Newbery'),
  ('Juventud Unida'),
  ('La Gloria'),
  ('Salazar FC'),
  ('Unión Deportiva'),
  ('Unión de Bonifacio'),
  ('Villa del Parque')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO estadios (nombre) VALUES
  ('Estadio Municipal'),
  ('Cancha Atlético Argentino'),
  ('Cancha Deportivo Garré'),
  ('Cancha Unión Deportiva')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO usuarios (email, password) VALUES
  ('admin@juegodeequipo.com', 'JdE_Adm1n_2026!')
ON CONFLICT (email) DO NOTHING;