const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// Configuración de conexión a PostgreSQL
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'juegode_equipo',
  password: '41211874',
  port: 5432   // acá va el número
});


// Endpoint: listar equipos
app.get('/equipos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM equipos');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error en el servidor');
  }
});

// Endpoint: listar jugadores
app.get('/jugadores', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM jugadores');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error en el servidor');
  }
});

// Endpoint para listar goleadores
app.get('/goleadores', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT j.nombre AS jugador, e.nombre AS equipo, COUNT(ev.id) AS goles
      FROM eventos ev
      JOIN jugadores j ON ev.jugador_id = j.id
      JOIN equipos e ON j.equipo_id = e.id
      WHERE ev.tipo_evento = 'gol'
      GROUP BY j.nombre, e.nombre
      ORDER BY goles DESC;
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error al obtener goleadores");
  }
});

// Endpoint para el fixture completo
app.get('/fixture', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.fecha,
             el.nombre AS equipo_local,
             ev.nombre AS equipo_visitante,
             p.goles_local, p.goles_visitante,
             p.jugado, p.estadio
      FROM partidos p
      JOIN equipos el ON p.equipo_local_id = el.id
      JOIN equipos ev ON p.equipo_visitante_id = ev.id
      ORDER BY p.fecha, p.id;
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error al obtener el fixture");
  }
});


// Crear un equipo
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
    res.status(500).send("Error al crear equipo");
  }
});

// Crear un jugador
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
    res.status(500).send("Error al crear jugador");
  }
});

// Crear un partido
app.post('/partidos', async (req, res) => {
  const { fecha, equipo_local_id, equipo_visitante_id, goles_local, goles_visitante, jugado, estadio } = req.body;
  try {
    // Insertar partido
    const result = await pool.query(
      `INSERT INTO partidos (fecha, equipo_local_id, equipo_visitante_id, goles_local, goles_visitante, jugado, estadio)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [fecha, equipo_local_id, equipo_visitante_id, goles_local, goles_visitante, jugado, estadio]
    );

    const partidoId = result.rows[0].id;

    // Recuperar partido con nombres de equipos
    const partido = await pool.query(
      `SELECT p.id, p.fecha, p.estadio, p.goles_local, p.goles_visitante, p.jugado,
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
    console.error("Error al crear partido:", err);
    res.status(500).send("Error al crear partido");
  }
});



// Crear un evento
app.post('/eventos', async (req, res) => {
  const { partido_id, jugador_id, tipo_evento, minuto } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO eventos (partido_id, jugador_id, tipo_evento, minuto) VALUES ($1,$2,$3,$4) RETURNING *',
      [partido_id, jugador_id, tipo_evento, minuto]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error al crear evento");
  }
});


// Endpoint para listar partidos
app.get('/partidos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.fecha, 
             el.nombre AS equipo_local, 
             ev.nombre AS equipo_visitante, 
             p.goles_local, p.goles_visitante, 
             p.estadio
      FROM partidos p
      JOIN equipos el ON p.equipo_local_id = el.id
      JOIN equipos ev ON p.equipo_visitante_id = ev.id
      ORDER BY p.fecha;
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error al obtener partidos");
  }
});

app.get('/eventos', async (req, res) => {
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
    res.status(500).send("Error al obtener eventos");
  }
});

app.get('/estadios', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM estadios ORDER BY nombre');
    console.log("Estadios encontrados:", result.rows); // 👈 log en consola
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error al obtener estadios");
  }
});

// Login de usuario
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1 AND password = $2',
      [email, password]
    );

    if (result.rows.length > 0) {
      res.json({ success: true, message: "Login correcto" });
    } else {
      res.status(401).json({ success: false, message: "Credenciales inválidas" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Error en el servidor");
  }
});


// Endpoint: tabla de goleadores
app.get('/goleadores', async (req, res) => {
  try {
    const query = `
      SELECT j.nombre AS jugador, e.nombre AS equipo, COUNT(ev.id) AS goles
      FROM eventos ev
      JOIN jugadores j ON ev.jugador_id = j.id
      JOIN equipos e ON j.equipo_id = e.id
      WHERE ev.tipo_evento = 'gol'
      GROUP BY j.id, j.nombre, e.nombre
      ORDER BY goles DESC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error en el servidor');
  }
});

// Iniciar servidor
app.listen(3000, () => {
  console.log('Servidor corriendo en http://localhost:3000');
});
