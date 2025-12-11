const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 5000;

// CORS + JSON
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../client")));

// === PostgreSQL ===
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Нужно для Railway
  }
});

// Проверка подключения
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("❌ Не удалось подключиться к PostgreSQL:", err.message);
  } else {
    console.log("✅ PostgreSQL подключён");
  }
});

// Создание таблиц при старте
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS markers (
        id SERIAL PRIMARY KEY,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        emotion TEXT NOT NULL,
        comment TEXT
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Таблицы проверены/созданы");
  } catch (err) {
    console.error("❌ Ошибка инициализации БД:", err.message);
  }
}

// === API ===
app.get("/api/markeners", (req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.get("/api/markers", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM markers");
    res.json(result.rows);
  } catch (err) {
    console.error("Ошибка чтения меток:", err.message);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.get("/api/stats", async (req, res) => {
  try {
    const total = await pool.query("SELECT COUNT(*) as total FROM markers");
    const positive = await pool.query(
      "SELECT COUNT(*) as positive FROM markers WHERE emotion IN ('happy', 'calm')"
    );

    const totalVal = parseInt(total.rows[0].total) || 0;
    const positiveVal = parseInt(positive.rows[0].positive) || 0;
    const users = Math.min(5000, Math.floor(totalVal / 12) + 100);

    res.json({
      total: totalVal,
      positive: positiveVal,
      users: users,
      districts: 89
    });
  } catch (err) {
    console.error("Ошибка статистики:", err.message);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.get("/admin/messages", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM messages ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).send("Ошибка");
  }
});

app.post("/api/markers", async (req, res) => {
  const { lat, lng, emotion, comment } = req.body;
  const valid = ["happy", "calm", "neutral", "sad", "angry"];

  if (!lat || !lng || !emotion || !valid.includes(emotion)) {
    return res.status(400).json({ error: "Неверные данные" });
  }

  try {
    const result = await pool.query(
      "INSERT INTO markers (lat, lng, emotion, comment) VALUES ($1, $2, $3, $4) RETURNING id",
      [lat, lng, emotion, comment || ""]
    );
    res.json({ id: result.rows[0].id });
  } catch (err) {
    console.error("Ошибка записи метки:", err.message);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.post("/api/contact", async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: "Все поля обязательны" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Неверный формат email" });
  }

  if (message.length > 1000) {
    return res.status(400).json({ error: "Сообщение слишком длинное" });
  }

  try {
    await pool.query(
      "INSERT INTO messages (name, email, message) VALUES ($1, $2, $3)",
      [name.trim(), email.trim(), message.trim()]
    );
    res.json({ success: true, message: "Спасибо! Ваше сообщение отправлено." });
  } catch (err) {
    console.error("Ошибка сохранения сообщения:", err.message);
    res.status(500).json({ error: "Не удалось отправить" });
  }
});

// === Страницы ===
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "../client/index.html")));
app.get("/map.html", (req, res) => res.sendFile(path.join(__dirname, "../client/map.html")));
app.get("/about.html", (req, res) => res.sendFile(path.join(__dirname, "../client/about.html")));

// Инициализация и запуск
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ EmotionMap запущен: http://localhost:${PORT}`);
  });
});
