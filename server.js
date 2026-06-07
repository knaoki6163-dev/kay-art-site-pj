/* =========================================================
   Aquarelle — 水彩画ポートフォリオ（動的版）
   Express サーバー
   ---------------------------------------------------------
   機能:
   ・公開API: 作品一覧の取得 / お問い合わせ送信
   ・管理API: ログイン / 作品の写真アップロード・削除 / お問い合わせ一覧
   データ保存:
   ・作品メタdata       → data/works.json
   ・お問い合わせ内容  → data/messages.json
   ・画像ファイル       → public/uploads/
   ========================================================= */

const express = require("express");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

/* ----- 管理者パスワード（本番では必ず環境変数で設定してください） ----- */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(16).toString("hex");

if (ADMIN_PASSWORD === "change-me") {
  console.warn("⚠ 管理者パスワードが既定値です。公開前に環境変数 ADMIN_PASSWORD を設定してください。");
}

/* ----- 作品カテゴリ（ここを編集すれば公開側・管理側の両方に反映） ----- */
const CATEGORIES = [
  { key: "landscape", label: "風景" },
  { key: "flower",    label: "花" },
  { key: "still",     label: "静物" },
  { key: "portrait",  label: "人物" },
  { key: "abstract",  label: "抽象" },
  { key: "other",     label: "その他" },
];
const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

/* ----- サイトの文章（管理画面から編集可能）の既定値 -----
   ここがサイト各所に表示される文章の初期値です。
   管理画面で編集すると data/content.json に上書き保存され、未編集の項目は既定値が使われます。 */
const DEFAULT_CONTENT = {
  siteName: "A. Kato",

  heroTitle: "静けさの中の、\nかすかな光。",
  heroLead: "心の奥にある風景を、\n絵にしています。",
  heroButton: "VIEW WORKS",

  aboutBody: "自然や日常の中で感じた、静かな感情や風景を描いています。アクリル絵の具を中心に、重ねることで生まれる質感や、色の奥行きを大切にしています。",
  aboutButton: "MORE ABOUT",
  aboutSignature: "A. Kato",

  contactDesc: "作品のご依頼・展示・ご質問など、お気軽にどうぞ。",

  instagramUrl: "#",
  emailUrl: "#",
  copyrightSuffix: "All Rights Reserved.",
};
const CONTENT_KEYS = Object.keys(DEFAULT_CONTENT);

/* ----- データ保存用ファイルの準備 -----
   DATA_DIR / UPLOAD_DIR は環境変数で変更できます。
   永続ディスク（Renderの有料プラン等）を使う場合は、これらをディスクのパスに向ければ
   再デプロイしてもデータが消えません。未指定ならプロジェクト内の既定の場所を使います。 */
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "public", "uploads");
const WORKS_FILE = path.join(DATA_DIR, "works.json");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");
const CONTENT_FILE = path.join(DATA_DIR, "content.json");
const NEWS_FILE = path.join(DATA_DIR, "news.json");

for (const dir of [DATA_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
for (const file of [WORKS_FILE, MESSAGES_FILE, NEWS_FILE]) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, "[]");
}
if (!fs.existsSync(CONTENT_FILE)) fs.writeFileSync(CONTENT_FILE, "{}");

// 保存済みの文章（content.json）を既定値にマージして返す
function getContent() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(CONTENT_FILE, "utf8")); } catch (e) { saved = {}; }
  const out = {};
  for (const key of CONTENT_KEYS) {
    out[key] = (saved[key] != null && saved[key] !== "") ? String(saved[key]) : DEFAULT_CONTENT[key];
  }
  return out;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { return []; }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/* ----- ミドルウェア ----- */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 8 }, // 8時間
}));

// アップロード画像の配信（UPLOAD_DIR が public 外でも /uploads で見えるように）
app.use("/uploads", express.static(UPLOAD_DIR));

// 静的ファイル（公開サイト）の配信
app.use(express.static(path.join(__dirname, "public")));

/* ----- 画像アップロードの設定（multer） ----- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const id = crypto.randomBytes(8).toString("hex");
    cb(null, id + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MBまで
  fileFilter: (req, file, cb) => {
    const ok = /image\/(jpeg|png|webp|gif)/.test(file.mimetype);
    cb(ok ? null : new Error("画像ファイル（JPEG/PNG/WebP/GIF）のみアップロードできます。"), ok);
  },
});

/* ----- 認証チェック ----- */
function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: "ログインが必要です。" });
}

/* =========================================================
   公開 API
   ========================================================= */

// カテゴリ一覧
app.get("/api/categories", (req, res) => res.json(CATEGORIES));

// サイトの文章（公開：表示に使う）
app.get("/api/content", (req, res) => res.json(getContent()));

// お知らせ（公開）
app.get("/api/news", (req, res) => {
  const news = readJson(NEWS_FILE);
  news.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json(news);
});

// 作品一覧（?category=landscape で絞り込み。未指定/all は全件）
app.get("/api/works", (req, res) => {
  const { category } = req.query;
  let works = readJson(WORKS_FILE);
  if (category && category !== "all") {
    works = works.filter((w) => w.category === category);
  }
  // 新しい順
  works.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json(works);
});

// お問い合わせ送信
app.post("/api/contact", (req, res) => {
  const name = (req.body.name || "").toString().trim();
  const email = (req.body.email || "").toString().trim();
  const message = (req.body.message || "").toString().trim();

  if (!name || !email || !message) {
    return res.status(400).json({ error: "すべての項目をご入力ください。" });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: "メールアドレスの形式が正しくありません。" });
  }
  if (message.length > 5000) {
    return res.status(400).json({ error: "メッセージが長すぎます。" });
  }

  const messages = readJson(MESSAGES_FILE);
  messages.push({
    id: crypto.randomBytes(8).toString("hex"),
    name, email, message,
    createdAt: Date.now(),
    read: false,
  });
  writeJson(MESSAGES_FILE, messages);
  res.json({ ok: true });
});

/* =========================================================
   管理 API（要ログイン）
   ========================================================= */

// ログイン状態の確認
app.get("/api/admin/me", (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// ログイン
app.post("/api/admin/login", (req, res) => {
  const password = (req.body.password || "").toString();
  if (password && password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: "パスワードが違います。" });
});

// ログアウト
app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// お知らせの追加
app.post("/api/admin/news", requireAuth, (req, res) => {
  const date = (req.body.date || "").toString().trim();
  const title = (req.body.title || "").toString().trim();
  if (!title) return res.status(400).json({ error: "タイトルを入力してください。" });
  const news = readJson(NEWS_FILE);
  const item = { id: crypto.randomBytes(8).toString("hex"), date, title, createdAt: Date.now() };
  news.push(item);
  writeJson(NEWS_FILE, news);
  res.json({ ok: true, item });
});

// お知らせの削除
app.delete("/api/admin/news/:id", requireAuth, (req, res) => {
  let news = readJson(NEWS_FILE);
  const before = news.length;
  news = news.filter((n) => n.id !== req.params.id);
  if (news.length === before) return res.status(404).json({ error: "見つかりません。" });
  writeJson(NEWS_FILE, news);
  res.json({ ok: true });
});

// サイトの文章を保存（既知のキーのみ受け付ける）
app.put("/api/admin/content", requireAuth, (req, res) => {
  const body = req.body || {};
  const saved = {};
  for (const key of CONTENT_KEYS) {
    if (body[key] != null) saved[key] = String(body[key]).slice(0, 4000);
  }
  writeJson(CONTENT_FILE, saved);
  res.json({ ok: true, content: getContent() });
});

// 作品アップロード
app.post("/api/admin/works", requireAuth, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "画像を選択してください。" });

  const title = (req.body.title || "").toString().trim() || "無題";
  let category = (req.body.category || "other").toString();
  if (!CATEGORY_KEYS.includes(category)) category = "other";
  const year = (req.body.year || "").toString().trim();
  const medium = (req.body.medium || "").toString().trim();

  const works = readJson(WORKS_FILE);
  const work = {
    id: crypto.randomBytes(8).toString("hex"),
    title, category, year, medium,
    image: "/uploads/" + req.file.filename,
    createdAt: Date.now(),
  };
  works.push(work);
  writeJson(WORKS_FILE, works);
  res.json({ ok: true, work });
});

// 作品削除（画像ファイルも消す）
app.delete("/api/admin/works/:id", requireAuth, (req, res) => {
  const works = readJson(WORKS_FILE);
  const idx = works.findIndex((w) => w.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "見つかりません。" });

  const [removed] = works.splice(idx, 1);
  writeJson(WORKS_FILE, works);

  // 画像ファイルも削除
  if (removed.image) {
    const filePath = path.join(__dirname, "public", removed.image);
    fs.existsSync(filePath) && fs.unlink(filePath, () => {});
  }
  res.json({ ok: true });
});

// お問い合わせ一覧
app.get("/api/admin/messages", requireAuth, (req, res) => {
  const messages = readJson(MESSAGES_FILE);
  messages.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json(messages);
});

// お問い合わせ削除
app.delete("/api/admin/messages/:id", requireAuth, (req, res) => {
  let messages = readJson(MESSAGES_FILE);
  const before = messages.length;
  messages = messages.filter((m) => m.id !== req.params.id);
  if (messages.length === before) return res.status(404).json({ error: "見つかりません。" });
  writeJson(MESSAGES_FILE, messages);
  res.json({ ok: true });
});

/* ----- multer等のエラーハンドリング ----- */
app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message || "エラーが発生しました。" });
  next();
});

app.listen(PORT, () => {
  console.log(`Aquarelle server running → http://localhost:${PORT}`);
  console.log(`管理画面 → http://localhost:${PORT}/admin/`);
});
