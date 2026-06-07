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
  { key: "still",     label: "静物" },
  { key: "abstract",  label: "抽象" },
];
const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

/* ----- サイトの文章（管理画面から編集可能・多言語対応）の既定値 -----
   ・SHARED   : 言語に依存しない項目（サイト名・SNS・サイン）
   ・LOCALIZED: 言語ごとに切り替わる項目（日本語/英語/中国語）
   管理画面で編集すると data/content.json に { shared, ja, en, zh } の形で保存されます。 */
const LANGS = ["ja", "en"];

const DEFAULT_SHARED = {
  siteName: "A. Kato",
  aboutSignature: "A. Kato",
  instagramUrl: "#",
  emailUrl: "#",
};

const DEFAULT_LOCALIZED = {
  ja: {
    heroTitle: "静けさの中の、\nかすかな光。",
    heroLead: "心の奥にある風景を、\n絵にしています。",
    heroButton: "VIEW WORKS",
    aboutBody: "自然や日常の中で感じた、静かな感情や風景を描いています。アクリル絵の具を中心に、重ねることで生まれる質感や、色の奥行きを大切にしています。",
    aboutButton: "MORE ABOUT",
    contactDesc: "作品のご依頼・展示・ご質問など、お気軽にどうぞ。",
    copyrightSuffix: "All Rights Reserved.",
  },
  en: {
    heroTitle: "Quiet light,\nwithin the stillness.",
    heroLead: "Painting the landscapes\nthat dwell deep in the heart.",
    heroButton: "VIEW WORKS",
    aboutBody: "I paint the quiet emotions and scenes I sense in nature and everyday life. Working mainly in acrylics, I cherish the texture and depth of color that emerge through layering.",
    aboutButton: "MORE ABOUT",
    contactDesc: "For commissions, exhibitions, or any inquiries, please feel free to get in touch.",
    copyrightSuffix: "All Rights Reserved.",
  },
};
const SHARED_KEYS = Object.keys(DEFAULT_SHARED);
const LOCALIZED_KEYS = Object.keys(DEFAULT_LOCALIZED.ja);

/* ----- データ保存用ファイルの準備 -----
   DATA_DIR / UPLOAD_DIR は環境変数で変更できます（永続ディスク用）。
   万一そのパスに書き込めない場合は、サーバーを落とさずローカルに退避します
   （その場合は永続化されないので、ディスク設定の見直しが必要です）。 */
let DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
let UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "public", "uploads");

// 作成・書き込みできるか確認（できなければ false）
function usableDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch (e) { return false; }
}
if (!usableDir(DATA_DIR)) {
  const fb = path.join(__dirname, "data");
  console.error(`⚠ DATA_DIR (${DATA_DIR}) に書き込めません。${fb} を使用します（※永続化されません。Renderのディスク設定を確認してください）。`);
  DATA_DIR = fb; usableDir(DATA_DIR);
}
if (!usableDir(UPLOAD_DIR)) {
  const fb = path.join(__dirname, "public", "uploads");
  console.error(`⚠ UPLOAD_DIR (${UPLOAD_DIR}) に書き込めません。${fb} を使用します（※永続化されません。Renderのディスク設定を確認してください）。`);
  UPLOAD_DIR = fb; usableDir(UPLOAD_DIR);
}

const WORKS_FILE = path.join(DATA_DIR, "works.json");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");
const CONTENT_FILE = path.join(DATA_DIR, "content.json");
const NEWS_FILE = path.join(DATA_DIR, "news.json");

for (const file of [WORKS_FILE, MESSAGES_FILE, NEWS_FILE]) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, "[]");
}
if (!fs.existsSync(CONTENT_FILE)) fs.writeFileSync(CONTENT_FILE, "{}");

// 保存済みの文章を読み込む（旧フラット形式は自動で ja として移行）
function readSavedContent() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(CONTENT_FILE, "utf8")); } catch (e) { saved = {}; }
  if (saved && !saved.shared && !saved.ja && (saved.siteName != null || saved.heroTitle != null)) {
    saved = {
      shared: { siteName: saved.siteName, aboutSignature: saved.aboutSignature, instagramUrl: saved.instagramUrl, emailUrl: saved.emailUrl },
      ja: saved,
    };
  }
  return saved || {};
}

function nonEmpty(v) { return v != null && v !== ""; }

// 指定言語の文章（共通＋言語別）を既定値にマージして返す（公開表示用・フラット）
function getContent(lang) {
  lang = LANGS.includes(lang) ? lang : "ja";
  const saved = readSavedContent();
  const savedShared = saved.shared || {};
  const savedLoc = saved[lang] || {};
  const out = {};
  for (const k of SHARED_KEYS) out[k] = nonEmpty(savedShared[k]) ? String(savedShared[k]) : DEFAULT_SHARED[k];
  for (const k of LOCALIZED_KEYS) {
    let v = nonEmpty(savedLoc[k]) ? savedLoc[k] : DEFAULT_LOCALIZED[lang][k];
    if (!nonEmpty(v)) v = DEFAULT_LOCALIZED.ja[k]; // 念のため日本語にフォールバック
    out[k] = String(v);
  }
  return out;
}

// 管理画面の編集用：共通＋各言語の現在値（フォールバックなし）を返す
function getContentRaw() {
  const saved = readSavedContent();
  const out = { shared: {} };
  for (const k of SHARED_KEYS) out.shared[k] = nonEmpty((saved.shared || {})[k]) ? saved.shared[k] : DEFAULT_SHARED[k];
  for (const lang of LANGS) {
    out[lang] = {};
    const sv = saved[lang] || {};
    for (const k of LOCALIZED_KEYS) out[lang][k] = nonEmpty(sv[k]) ? sv[k] : DEFAULT_LOCALIZED[lang][k];
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
app.get("/api/content", (req, res) => res.json(getContent(req.query.lang)));

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

// 管理画面の編集用：共通＋各言語の現在値を返す
app.get("/api/admin/content", requireAuth, (req, res) => res.json(getContentRaw()));

// サイトの文章を保存（多言語：{ shared, ja, en, zh } の既知キーのみ受け付ける）
app.put("/api/admin/content", requireAuth, (req, res) => {
  const body = req.body || {};
  const out = { shared: {} };
  for (const k of SHARED_KEYS) {
    if (body.shared && body.shared[k] != null) out.shared[k] = String(body.shared[k]).slice(0, 4000);
  }
  for (const lang of LANGS) {
    out[lang] = {};
    const src = body[lang] || {};
    for (const k of LOCALIZED_KEYS) {
      if (src[k] != null) out[lang][k] = String(src[k]).slice(0, 4000);
    }
  }
  writeJson(CONTENT_FILE, out);
  res.json({ ok: true });
});

// 作品アップロード
app.post("/api/admin/works", requireAuth, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "画像を選択してください。" });

  const title = (req.body.title || "").toString().trim() || "無題";
  let category = (req.body.category || CATEGORY_KEYS[0]).toString();
  if (!CATEGORY_KEYS.includes(category)) category = CATEGORY_KEYS[0];
  const year = (req.body.year || "").toString().trim();
  const technique = (req.body.technique || "").toString().trim();
  const size = (req.body.size || "").toString().trim();

  const works = readJson(WORKS_FILE);
  const work = {
    id: crypto.randomBytes(8).toString("hex"),
    title, category, year, technique, size,
    image: "/uploads/" + req.file.filename,
    createdAt: Date.now(),
  };
  works.push(work);
  writeJson(WORKS_FILE, works);
  res.json({ ok: true, work });
});

// 作品の編集（タイトル・カテゴリ・制作年・技法・サイズ。画像は変更しない）
app.put("/api/admin/works/:id", requireAuth, (req, res) => {
  const works = readJson(WORKS_FILE);
  const work = works.find((w) => w.id === req.params.id);
  if (!work) return res.status(404).json({ error: "見つかりません。" });

  if (req.body.title != null) work.title = String(req.body.title).trim() || work.title;
  if (req.body.category != null) {
    const c = String(req.body.category);
    if (CATEGORY_KEYS.includes(c)) work.category = c;
  }
  if (req.body.year != null) work.year = String(req.body.year).trim();
  if (req.body.technique != null) work.technique = String(req.body.technique).trim();
  if (req.body.size != null) work.size = String(req.body.size).trim();
  // 旧データの medium は編集後は使わない
  if ((req.body.technique != null || req.body.size != null) && work.medium != null) delete work.medium;

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

// 未読件数
app.get("/api/admin/messages/unread-count", requireAuth, (req, res) => {
  const messages = readJson(MESSAGES_FILE);
  res.json({ count: messages.filter((m) => !m.read).length });
});

// すべて既読にする
app.post("/api/admin/messages/read-all", requireAuth, (req, res) => {
  const messages = readJson(MESSAGES_FILE);
  let changed = false;
  messages.forEach((m) => { if (!m.read) { m.read = true; changed = true; } });
  if (changed) writeJson(MESSAGES_FILE, messages);
  res.json({ ok: true });
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
