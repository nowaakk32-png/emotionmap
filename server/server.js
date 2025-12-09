const express = require("express");
const cors = require("cors");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 5000; // Render задаёт PORT автоматически

// CORS + JSON
app.use(cors());
app.use(express.json());

// Отдаём статику из client/
app.use(express.static(path.join(__dirname, "../client")));

// Подключаем БД
const db = new sqlite3.Database(path.join(__dirname, "emotions.db"), (err) => {
  if (err) console.error("❌ Не удалось создать emotions.db:", err.message);
});

// Создаём таблицу при старте
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS markers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      emotion TEXT NOT NULL,
      comment TEXT
    )
  `);
  // Сообщения из формы
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// === API ===
app.get("/api/markers", (req, res) => {
  db.all("SELECT * FROM markers", (err, rows) => {
    if (err) return res.status(500).json({ error: "Ошибка чтения" });
    res.json(rows);
  });
});

// Статистика для главной страницы
app.get("/api/stats", (req, res) => {
  db.get("SELECT COUNT(*) as total FROM markers", (err, totalRow) => {
    if (err) return res.status(500).json({ error: "Ошибка БД" });

    // Пример: считаем "положительные" эмоции
    const positiveEmotions = "('happy', 'calm')";
    db.get(`SELECT COUNT(*) as positive FROM markers WHERE emotion IN ${positiveEmotions}`, (err, posRow) => {
      if (err) return res.status(500).json({ error: "Ошибка БД" });

      // Уникальные пользователи — по количеству меток (упрощённо)
      const users = Math.min(5000, Math.floor(totalRow.total / 12) + 100); // или по IP, если хочешь

      res.json({
        total: totalRow.total || 0,
        positive: posRow.positive || 0,
        users: users,
        districts: 89 // можно тоже считать, но пока оставим константу
      });
    });
  });
});

app.get("/admin/messages", (req, res) => {
  db.all("SELECT * FROM messages ORDER BY created_at DESC", (err, rows) => {
    if (err) return res.status(500).send("Ошибка");
    res.json(rows);
  });
});

app.post("/api/markers", (req, res) => {
  const { lat, lng, emotion, comment } = req.body;

  const valid = ["happy", "calm", "neutral", "sad", "angry"];
  if (!lat || !lng || !emotion || !valid.includes(emotion)) {
    return res.status(400).json({ error: "Неверные данные" });
  }

  db.run(
    "INSERT INTO markers (lat, lng, emotion, comment) VALUES (?, ?, ?, ?)",
    [lat, lng, emotion, comment || ""],
    function (err) {
      if (err) {
        console.error("Ошибка записи:", err.message);
        return res.status(500).json({ error: "Ошибка сервера" });
      }
      res.json({ id: this.lastID });
    }
  );
});

// Сохранение обращения от пользователя
app.post("/api/contact", (req, res) => {
  const { name, email, message } = req.body;

  // Простая валидация
  if (!name || !email || !message) {
    return res.status(400).json({ error: "Все поля обязательны" });
  }

  // Простая проверка email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Неверный формат email" });
  }

  // Ограничиваем длину (защита от спама)
  if (message.length > 1000) {
    return res.status(400).json({ error: "Сообщение слишком длинное" });
  }

  // Сохраняем в БД
  db.run(
    "INSERT INTO messages (name, email, message) VALUES (?, ?, ?)",
    [name.trim(), email.trim(), message.trim()],
    function (err) {
      if (err) {
        console.error("Ошибка сохранения сообщения:", err.message);
        return res.status(500).json({ error: "Не удалось отправить" });
      }
      res.json({ success: true, message: "Спасибо! Ваше сообщение отправлено." });
    }
  );
});

// === Страницы ===
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "../client/index.html")));
app.get("/map.html", (req, res) => res.sendFile(path.join(__dirname, "../client/map.html")));
app.get("/about.html", (req, res) => res.sendFile(path.join(__dirname, "../client/about.html")));

// Запуск
app.listen(PORT, () => {
  console.log(`✅ EmotionMap запущен: http://localhost:${PORT}`);
});