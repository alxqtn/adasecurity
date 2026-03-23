import express from "express";
import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Création du dossier db/ si nécessaire
const dbDir = path.join(__dirname, "db");
const dbPath = path.join(dbDir, "tweety.db");

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir);
}

// Initialisation de la base de données (synchrone avec node:sqlite)
const db = new DatabaseSync(dbPath);

// Création des tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Utilisateurs pré-créés (mots de passe en clair - faille intentionnelle)
const users = [
  { username: "alice", password: "password123" },
  { username: "bob", password: "hunter2" },
  { username: "charlie", password: "123456" },
];

const insertUser = db.prepare(
  "INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)"
);
users.forEach((user) => {
  insertUser.run(user.username, user.password);
});

// Posts de démo
const postCount = db.prepare("SELECT COUNT(*) as count FROM posts").get().count;

if (postCount === 0) {
  const demoPosts = [
    { username: "alice", content: "Bienvenue sur Tweety! 🐦" },
    { username: "bob", content: "Cette app est super sécurisée... ou pas? 🤔" },
    { username: "charlie", content: "J'adore poster des messages ici!" },
  ];

  const insertPost = db.prepare(
    "INSERT INTO posts (username, content) VALUES (?, ?)"
  );
  demoPosts.forEach((post) => {
    insertPost.run(post.username, post.content);
  });
}

// ============================================
// ROUTES API
// ============================================

// POST /api/login - VULNÉRABLE: SQL injection via concaténation
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  // ⚠️ VULNÉRABLE - concaténation directe (permet SQL injection)
  const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
  const row = db.prepare(query).get();

  if (row) {
    res.json({ success: true, username: row.username });
  } else {
    res.status(401).json({ success: false, error: "Identifiants invalides" });
  }
});

// GET /api/posts - Liste des 50 derniers posts
app.get("/api/posts", (req, res) => {
  try {
    const posts = db
      .prepare(
        "SELECT id, username, content, created_at FROM posts ORDER BY created_at DESC LIMIT 50"
      )
      .all();

    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/posts - VULNÉRABLE: pas de sanitisation du contenu
app.post("/api/posts", (req, res) => {
  const { username, content } = req.body;

  if (!username || !content) {
    return res.status(400).json({ error: "Username et content requis" });
  }

  try {
    // ⚠️ VULNÉRABLE - aucune sanitisation du contenu (permet XSS stocké)
    const result = db
      .prepare("INSERT INTO posts (username, content) VALUES (?, ?)")
      .run(username, content);

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`🐦 Tweety démarré sur http://localhost:${PORT}`);
  console.log(`📚 Ouvrez README.md pour le guide pédagogique`);
});
