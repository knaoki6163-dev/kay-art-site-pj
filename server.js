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
const ga4 = require("./ga4");

const app = express();
const PORT = process.env.PORT || 3000;
app.set("trust proxy", true); // Render等のリバースプロキシ配下で https/host を正しく判定

// 正規ドメイン（サイトの公開ドメイン）。変更する場合は環境変数 CANONICAL_HOST を設定。
const CANONICAL_HOST = (process.env.CANONICAL_HOST || "akatoart.com").toLowerCase();

// 実際の公開URL（プロトコル+ホスト）を求める
// Hostヘッダーは偽装できるため、許可したホスト以外は正規ドメインに置き換える
// （sitemap / canonical / OGP に偽ホストが混入するのを防ぐ）
function allowedHost(host) {
  if (!host) return false;
  const h = host.toLowerCase().replace(/:\d+$/, "");
  return (
    h === CANONICAL_HOST || h === "www." + CANONICAL_HOST ||
    /\.onrender\.com$/.test(h) ||
    h === "localhost" || h === "127.0.0.1"
  );
}
function siteOrigin(req) {
  const proto = (req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0].trim();
  const host = (req.headers["x-forwarded-host"] || req.get("host") || "").split(",")[0].trim();
  if (!allowedHost(host)) return "https://" + CANONICAL_HOST;
  return proto + "://" + host;
}

/* ----- 管理者パスワード（本番では必ず環境変数で設定してください） ----- */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(16).toString("hex");

if (ADMIN_PASSWORD === "change-me") {
  console.warn("⚠ 管理者パスワードが既定値です。公開前に環境変数 ADMIN_PASSWORD を設定してください。");
}

/* ----- 作品カテゴリ（ここを編集すれば公開側・管理側の両方に反映） ----- */
const CATEGORIES = [
  { key: "nature",  label: "自然" },
  { key: "life",    label: "日常" },
  { key: "concept", label: "抽象" },
];
const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

/* ----- 作品のステータス（表示は常に英語） ----- */
const WORK_STATUSES = ["Reserved", "Sold", "Not for Sale"]; // 空文字＝指定なし（販売中の既定状態）

/* ----- サイトの文章（管理画面から編集可能・多言語対応）の既定値 -----
   ・SHARED   : 言語に依存しない項目（サイト名・SNS・サイン）
   ・LOCALIZED: 言語ごとに切り替わる項目（日本語/英語/中国語）
   管理画面で編集すると data/content.json に { shared, ja, en, zh } の形で保存されます。 */
const LANGS = ["ja", "en"];

const DEFAULT_SHARED = {
  siteName: "A. Kato",
  aboutSignature: "A. Kato",
  instagramUrl: "#",
  instagramVisible: "true", // フッターのInstagramリンク表示（"true"/"false"）
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
const NEWS_FILE = path.join(DATA_DIR, "news.json");   // 公開サイトでは「Info」として表示
const BLOG_FILE = path.join(DATA_DIR, "blog.json");
const ACTIVITY_FILE = path.join(DATA_DIR, "activity.json"); // 管理画面からの更新履歴（バージョン管理用）

for (const file of [WORKS_FILE, MESSAGES_FILE, NEWS_FILE, BLOG_FILE, ACTIVITY_FILE]) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, "[]");
}
if (!fs.existsSync(CONTENT_FILE)) fs.writeFileSync(CONTENT_FILE, "{}");

// 保存済みの文章を読み込む（旧フラット形式は自動で ja として移行）
function readSavedContent() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(CONTENT_FILE, "utf8")); } catch (e) { saved = {}; }
  if (saved && !saved.shared && !saved.ja && (saved.siteName != null || saved.heroTitle != null)) {
    saved = {
      shared: { siteName: saved.siteName, aboutSignature: saved.aboutSignature, instagramUrl: saved.instagramUrl },
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

// data-content 系の値をHTMLへ埋め込む際のエスケープ（クライアント側 esc/escBr と同じ規則）
function escHtml(s) {
  return (s == null ? "" : String(s)).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escBrServer(s) { return escHtml(s).replace(/\n/g, "<br>"); }

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

/* ----- 管理画面からの更新履歴（バージョン管理タブ用） -----
   各admin書き込み操作の直後に一文で記録する。最新500件のみ保持。 */
const ACTIVITY_MAX = 500;
function logActivity(summary) {
  try {
    const list = readJson(ACTIVITY_FILE);
    list.unshift({ id: crypto.randomBytes(8).toString("hex"), summary, createdAt: Date.now() });
    writeJson(ACTIVITY_FILE, list.slice(0, ACTIVITY_MAX));
  } catch (e) { /* 履歴の記録失敗で本来の操作を止めない */ }
}

/* ----- ミドルウェア ----- */
// 正規ドメインへの集約：Render の *.onrender.com で来たアクセスは
// カスタムドメイン（既定 akatoart.com）へ 301 リダイレクトする。
// 重複コンテンツによるSEO分散を防ぎ、常に独自ドメインを見せるため。
app.use((req, res, next) => {
  const host = (req.headers["x-forwarded-host"] || req.get("host") || "").split(",")[0].trim();
  if (CANONICAL_HOST && /\.onrender\.com$/i.test(host)) {
    return res.redirect(301, "https://" + CANONICAL_HOST + req.originalUrl);
  }
  next();
});

// セキュリティヘッダー
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");       // MIMEスニッフィング禁止
  res.setHeader("X-Frame-Options", "SAMEORIGIN");           // クリックジャッキング対策
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (req.secure) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  // キャッシュ制御：デプロイ後に古いHTML/CSS/JS（＝以前の見た目）が
  // ブラウザに残らないよう、常にサーバーへ再確認させる（変更が無ければ304で軽い）。
  // アップロード画像はファイル名がランダムで変わらないため長期キャッシュ。
  const p = req.path.toLowerCase();
  if (p.startsWith("/uploads/")) {
    res.setHeader("Cache-Control", "public, max-age=2592000, immutable"); // 30日
  } else if (/\.(?:png|jpe?g|webp|gif|ico|svg|woff2?)$/.test(p)) {
    res.setHeader("Cache-Control", "public, max-age=604800"); // 7日
  } else {
    res.setHeader("Cache-Control", "no-cache");
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: "auto",            // HTTPS時のみCookie送信（trust proxy 配下で自動判定）
    maxAge: 1000 * 60 * 60 * 8, // 8時間
  },
}));

// アップロード画像の配信（UPLOAD_DIR が public 外でも /uploads で見えるように）
app.use("/uploads", express.static(UPLOAD_DIR));

/* ----- SEO: robots.txt / sitemap.xml / トップページ（静的配信より前に） ----- */
app.get("/robots.txt", (req, res) => {
  const origin = siteOrigin(req);
  res.type("text/plain").send(
    "User-agent: *\n" +
    "Allow: /\n" +
    "Disallow: /api\n" +
    "Sitemap: " + origin + "/sitemap.xml\n"
  );
});

app.get("/sitemap.xml", (req, res) => {
  const origin = siteOrigin(req);
  const today = new Date().toISOString().slice(0, 10);
  const pages = [
    { loc: "/", pr: "1.0" },
    { loc: "/works.html", pr: "0.9" },
    { loc: "/info.html", pr: "0.7" },
    { loc: "/blog.html", pr: "0.7" },
    { loc: "/artist.html", pr: "0.7" },
    { loc: "/contact.html", pr: "0.6" },
  ];
  res.type("application/xml").send(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    pages.map((p) =>
      "  <url><loc>" + origin + p.loc + "</loc><lastmod>" + today + "</lastmod><changefreq>weekly</changefreq><priority>" + p.pr + "</priority></url>"
    ).join("\n") + "\n" +
    "</urlset>\n"
  );
});

// 公開HTMLは実URL(__SITE_URL__)を埋め込んで配信（canonical / OGP / 構造化データ用）
function serveTemplated(file) {
  const full = path.join(__dirname, "public", file);
  return (req, res) => {
    fs.readFile(full, "utf8", (err, html) => {
      if (err) return res.status(404).send("not found");
      let out = html.split("__SITE_URL__").join(siteOrigin(req));
      // サイトの文章（管理画面「サイトの文章」で編集）は配信時点でHTMLへ直接反映する。
      // クライアントJSがAPI取得後に data-content 要素を書き換える方式だけだと、
      // 取得までの一瞬 HTML に書かれた既定文言（古い内容）が見えてしまう
      // （Instagram表示切替と同じ理由。言語はサーバーが判別できないため既定の
      // 日本語で埋め込み、英語表示の利用者はこれまで通りクライアント側で
      // 切り替わる）。
      try {
        const content = getContent("ja");
        out = out.replace(
          /(<([a-zA-Z0-9]+)\b[^>]*\bdata-content="([a-zA-Z]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g,
          (match, openTag, tagName, key, inner, closeTag) =>
            content[key] != null ? openTag + escBrServer(content[key]) + closeTag : match
        );
        out = out.replace(/<a\b[^>]*\bdata-content-href="([a-zA-Z]+)"[^>]*>/g, (tag, key) =>
          content[key] != null ? tag.replace(/href="[^"]*"/, 'href="' + escHtml(content[key]) + '"') : tag
        );
        if (content.instagramVisible === "false") {
          out = out.replace("</head>", "<style>.footer-social{display:none}</style></head>");
        }
      } catch (e) { /* 設定が読めなくても配信は続行 */ }
      res.type("html").send(out);
    });
  };
}
app.get("/", serveTemplated("index.html"));
app.get("/index.html", serveTemplated("index.html"));
["works", "info", "blog", "artist", "contact", "privacy"].forEach((p) => {
  app.get("/" + p + ".html", serveTemplated(p + ".html"));
});

// 静的ファイル（公開サイト）の配信
app.use(express.static(path.join(__dirname, "public")));

/* ----- 画像アップロードの設定（multer） ----- */
// 許可する画像形式（拡張子は元ファイル名を信用せず、この対応表から決める。
// MIMEタイプも拡張子も送信側が偽装できるため、両方を許可リストで突き合わせる）
const IMAGE_EXTS = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
const SAFE_EXT = /^\.(jpe?g|png|webp|gif)$/;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    let ext = path.extname(file.originalname).toLowerCase();
    if (!SAFE_EXT.test(ext)) ext = IMAGE_EXTS[file.mimetype] || ".jpg";
    const id = crypto.randomBytes(8).toString("hex");
    cb(null, id + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MBまで
  fileFilter: (req, file, cb) => {
    const ok = Object.prototype.hasOwnProperty.call(IMAGE_EXTS, file.mimetype);
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

// Info（お知らせ・公開）
app.get("/api/news", (req, res) => {
  const news = readJson(NEWS_FILE);
  news.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json(news);
});

// Blog（公開）
app.get("/api/blog", (req, res) => {
  const posts = readJson(BLOG_FILE);
  posts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json(posts);
});

// 作品一覧（?category=landscape で絞り込み。未指定/all は全件。
//   ?featured=1 でトップ表示対象（ヒーロー＆Homeのworks）のみに絞り込み）
app.get("/api/works", (req, res) => {
  const { category, featured } = req.query;
  let works = readJson(WORKS_FILE);
  if (category && category !== "all") {
    works = works.filter((w) => w.category === category);
  }
  // featured 未設定（旧データ）は「表示する」とみなす（後方互換）
  if (featured === "1") {
    works = works.filter((w) => w.featured !== false);
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
  if (name.length > 200 || email.length > 320 || message.length > 5000) {
    return res.status(400).json({ error: "入力が長すぎます。" });
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
// ブルートフォース対策：失敗をIPごとに記録し、15分間に5回失敗でロック。
// IPは偽装され得るため、全体でも15分間に100回失敗で一時ロックする保険を併用。
const LOGIN_WINDOW = 15 * 60 * 1000;
const loginFails = new Map(); // ip -> { count, firstAt }
let globalFails = { count: 0, firstAt: 0 };
function pruneFails(now) {
  for (const [ip, f] of loginFails) { if (now - f.firstAt > LOGIN_WINDOW) loginFails.delete(ip); }
  if (now - globalFails.firstAt > LOGIN_WINDOW) globalFails = { count: 0, firstAt: 0 };
}
// 長さの違いで比較を打ち切らないよう、ハッシュ化してから定数時間で比較する
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
app.post("/api/admin/login", (req, res) => {
  const now = Date.now();
  pruneFails(now);
  const ip = req.ip || "unknown";
  const f = loginFails.get(ip);
  if ((f && f.count >= 5) || globalFails.count >= 100) {
    return res.status(429).json({ error: "試行回数が多すぎます。しばらくしてからお試しください。" });
  }

  const password = (req.body.password || "").toString();
  if (password && safeEqual(password, ADMIN_PASSWORD)) {
    loginFails.delete(ip);
    // セッション固定攻撃対策：ログイン成功時にセッションIDを作り直す
    return req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "ログイン処理に失敗しました。" });
      req.session.isAdmin = true;
      res.json({ ok: true });
    });
  }

  if (f) { f.count++; } else { loginFails.set(ip, { count: 1, firstAt: now }); }
  if (!globalFails.count) globalFails.firstAt = now;
  globalFails.count++;
  res.status(401).json({ error: "パスワードが違います。" });
});

// ログアウト
app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Info（お知らせ）の追加・削除
app.post("/api/admin/news", requireAuth, (req, res) => {
  const date = (req.body.date || "").toString().trim();
  const title = (req.body.title || "").toString().trim();
  if (!title) return res.status(400).json({ error: "タイトルを入力してください。" });
  const news = readJson(NEWS_FILE);
  const item = { id: crypto.randomBytes(8).toString("hex"), date, title, createdAt: Date.now() };
  news.push(item);
  writeJson(NEWS_FILE, news);
  logActivity("お知らせを追加：" + title);
  res.json({ ok: true, item });
});
app.delete("/api/admin/news/:id", requireAuth, (req, res) => {
  let news = readJson(NEWS_FILE);
  const before = news.length;
  const removed = news.find((n) => n.id === req.params.id);
  news = news.filter((n) => n.id !== req.params.id);
  if (news.length === before) return res.status(404).json({ error: "見つかりません。" });
  writeJson(NEWS_FILE, news);
  logActivity("お知らせを削除：" + (removed && removed.title || req.params.id));
  res.json({ ok: true });
});

// Blog の追加・削除
app.post("/api/admin/blog", requireAuth, (req, res) => {
  const date = (req.body.date || "").toString().trim();
  const title = (req.body.title || "").toString().trim();
  const body = (req.body.body || "").toString().trim();
  if (!title) return res.status(400).json({ error: "タイトルを入力してください。" });
  const posts = readJson(BLOG_FILE);
  const item = { id: crypto.randomBytes(8).toString("hex"), date, title, body: body.slice(0, 8000), createdAt: Date.now() };
  posts.push(item);
  writeJson(BLOG_FILE, posts);
  logActivity("Blog記事を追加：" + title);
  res.json({ ok: true, item });
});
app.delete("/api/admin/blog/:id", requireAuth, (req, res) => {
  let posts = readJson(BLOG_FILE);
  const before = posts.length;
  const removed = posts.find((p) => p.id === req.params.id);
  posts = posts.filter((p) => p.id !== req.params.id);
  if (posts.length === before) return res.status(404).json({ error: "見つかりません。" });
  writeJson(BLOG_FILE, posts);
  logActivity("Blog記事を削除：" + (removed && removed.title || req.params.id));
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
  logActivity("サイトの文章を更新");
  res.json({ ok: true });
});

/* ----- アクセス解析（Google Analytics 4 Data API） -----
   GA4_PROPERTY_ID / GA4_SERVICE_ACCOUNT_JSON が未設定の場合は
   configured:false を返し、画面側で案内メッセージを表示する。
   各レポートは Promise.allSettled で個別に失敗を許容し、
   一部のレポート（例：作品別イベントのカスタムディメンション未登録）が
   失敗しても他のパネルは表示できるようにする。 */
function settle(result, fallback) {
  return result.status === "fulfilled" ? result.value : fallback;
}
function settleError(result) {
  return result.status === "rejected" ? (result.reason && result.reason.message) || "取得に失敗しました。" : null;
}

app.get("/api/admin/analytics/overview", requireAuth, async (req, res) => {
  if (!ga4.enabled) return res.json({ configured: false });
  const [totals, trend, traffic, topWorksRaw, country, newReturning] = await Promise.allSettled([
    ga4.fetchTotals(), ga4.fetchTrend(), ga4.fetchTraffic(), ga4.fetchTopWorksRaw(), ga4.fetchCountry(), ga4.fetchNewReturning(),
  ]);

  // 作品別イベント（GA4のwork_id）に、こちらが持つ作品メタデータ（タイトル・画像）を突き合わせる
  const worksRaw = settle(topWorksRaw, []);
  const allWorks = readJson(WORKS_FILE);
  const works = worksRaw
    .map((r) => {
      const w = allWorks.find((x) => x.id === r.workId);
      return { title: w ? w.title : "（削除済みの作品）", image: w ? w.image : null, views: r.views };
    })
    .filter((w) => w.views > 0);

  res.json({
    configured: true,
    totals: settle(totals, null),
    totalsError: settleError(totals),
    trend: settle(trend, []),
    trendError: settleError(trend),
    traffic: settle(traffic, []),
    trafficError: settleError(traffic),
    works,
    worksError: settleError(topWorksRaw),
    country: settle(country, []),
    countryError: settleError(country),
    newReturning: settle(newReturning, null),
    newReturningError: settleError(newReturning),
  });
});

app.get("/api/admin/analytics/realtime", requireAuth, async (req, res) => {
  if (!ga4.enabled) return res.json({ configured: false });
  const [users, pages] = await Promise.allSettled([ga4.fetchRealtimeUsers(), ga4.fetchRealtimePages()]);
  res.json({
    configured: true,
    users: settle(users, { now: 0, bars: [] }),
    pages: settle(pages, []),
    error: settleError(users) || settleError(pages),
  });
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
  let status = (req.body.status || "").toString();
  if (status && !WORK_STATUSES.includes(status)) status = "";
  // トップ表示（ヒーロー＆Homeのworks）。未指定は表示する（true）。
  const featured = String(req.body.featured) !== "false";

  const works = readJson(WORKS_FILE);
  const work = {
    id: crypto.randomBytes(8).toString("hex"),
    title, category, year, technique, size, status, featured,
    image: "/uploads/" + req.file.filename,
    createdAt: Date.now(),
  };
  works.push(work);
  writeJson(WORKS_FILE, works);
  logActivity("作品を追加：" + title);
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
  if (req.body.status != null) {
    const s = String(req.body.status);
    if (s === "" || WORK_STATUSES.includes(s)) work.status = s;
  }
  if (req.body.featured != null) work.featured = String(req.body.featured) !== "false";
  // 旧データの medium は編集後は使わない
  if ((req.body.technique != null || req.body.size != null) && work.medium != null) delete work.medium;

  writeJson(WORKS_FILE, works);
  logActivity("作品を編集：" + work.title);
  res.json({ ok: true, work });
});

// 作品削除（画像ファイルも消す）
app.delete("/api/admin/works/:id", requireAuth, (req, res) => {
  const works = readJson(WORKS_FILE);
  const idx = works.findIndex((w) => w.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "見つかりません。" });

  const [removed] = works.splice(idx, 1);
  writeJson(WORKS_FILE, works);
  logActivity("作品を削除：" + removed.title);

  // 画像ファイルも削除
  // 実ファイルの場所は UPLOAD_DIR（Renderでは永続ディスク）。public 配下とは限らない。
  // basename でファイル名のみ取り出し、パストラバーサルも防ぐ。
  if (removed.image) {
    const filePath = path.join(UPLOAD_DIR, path.basename(removed.image));
    fs.unlink(filePath, () => {});
  }
  res.json({ ok: true });
});

// お問い合わせ一覧（重要なものを先頭に、その後は新しい順）
app.get("/api/admin/messages", requireAuth, (req, res) => {
  const messages = readJson(MESSAGES_FILE);
  messages.sort((a, b) =>
    (b.important ? 1 : 0) - (a.important ? 1 : 0) ||
    (b.createdAt || 0) - (a.createdAt || 0)
  );
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

// 重要フラグの切り替え（お問い合わせの削除は不可）
app.put("/api/admin/messages/:id", requireAuth, (req, res) => {
  const messages = readJson(MESSAGES_FILE);
  const m = messages.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: "見つかりません。" });
  if (req.body.important != null) m.important = !!req.body.important;
  writeJson(MESSAGES_FILE, messages);
  res.json({ ok: true, message: m });
});

/* ----- バージョン管理（GitHubのコード修正履歴 ＋ 管理画面からの更新履歴） -----
   GitHub側は公開リポジトリのコミット一覧APIを使用（認証不要だが未認証は60回/時間の
   レート制限があるため、短時間キャッシュして呼び過ぎを防ぐ）。 */
const GITHUB_REPO = process.env.GITHUB_REPO || "knaoki6163-dev/kay-art-site-pj";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const GITHUB_CACHE_MS = 5 * 60 * 1000; // 5分
let githubCache = { at: 0, items: [] };

// GitHubの1ページ最大は100件。過去分も見えるよう複数ページ取得する（既定200件分＝2ページ）。
const GITHUB_MAX_PAGES = 2;

// コミットが Claude Code / Codex どちらの作業由来かを判定する。
// Claude: コミットのauthorが "Claude" <noreply@anthropic.com>（Co-Authored-By含む）。
// Codex: このリポジトリではブランチ名が "codex/..." で作られ、マージ時にそのブランチ名が
//        コミットメッセージ（"Merge pull request ... from .../codex/xxx"）に残る。
function detectAgent(authorName, authorEmail, fullMessage) {
  const name = (authorName || "").toLowerCase();
  const email = (authorEmail || "").toLowerCase();
  const msg = (fullMessage || "").toLowerCase();
  if (name === "claude" || email.endsWith("@anthropic.com") || msg.includes("co-authored-by: claude")) {
    return "claude";
  }
  if (/(^|[/\s])codex\//.test(msg) || name.includes("codex")) {
    return "codex";
  }
  return null;
}

async function fetchGithubCommits() {
  const now = Date.now();
  if (now - githubCache.at < GITHUB_CACHE_MS) return githubCache.items;
  try {
    const headers = { "User-Agent": "aquarelle-admin", Accept: "application/vnd.github+json" };
    if (GITHUB_TOKEN) headers.Authorization = "Bearer " + GITHUB_TOKEN;
    let all = [];
    for (let page = 1; page <= GITHUB_MAX_PAGES; page++) {
      const res = await fetch(
        "https://api.github.com/repos/" + GITHUB_REPO + "/commits?per_page=100&page=" + page,
        { headers }
      );
      if (!res.ok) throw new Error("GitHub API " + res.status);
      const data = await res.json();
      all = all.concat(data);
      if (data.length < 100) break; // これ以上ページが無い
    }
    const items = all.map((c) => {
      const fullMessage = (c.commit && c.commit.message) || "";
      const title = fullMessage.split("\n")[0].trim();
      const date = (c.commit && c.commit.author && c.commit.author.date) || (c.commit && c.commit.committer && c.commit.committer.date);
      const authorName = (c.commit && c.commit.author && c.commit.author.name) || "";
      const authorEmail = (c.commit && c.commit.author && c.commit.author.email) || "";
      return {
        source: "github",
        summary: title || "(無題のコミット)",
        createdAt: date ? new Date(date).getTime() : 0,
        url: c.html_url || null,
        author: authorName,
        agent: detectAgent(authorName, authorEmail, fullMessage),
      };
    });
    githubCache = { at: now, items };
    return items;
  } catch (e) {
    // 取得失敗時は直近の成功キャッシュ（無ければ空配列）を返し、管理画面ログだけでも表示する
    return githubCache.items;
  }
}

// 新しい順：GitHubのコミット履歴 ＋ 管理画面からの更新履歴 を統合して返す
app.get("/api/admin/version-history", requireAuth, async (req, res) => {
  const adminItems = readJson(ACTIVITY_FILE).map((a) => ({
    source: "admin",
    summary: a.summary,
    createdAt: a.createdAt || 0,
  }));
  const githubItems = await fetchGithubCommits();
  const all = adminItems.concat(githubItems).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json(all.slice(0, 300));
});

/* ----- multer等のエラーハンドリング ----- */
app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message || "エラーが発生しました。" });
  next();
});

app.listen(PORT, () => {
  console.log(`Aquarelle server running → http://localhost:${PORT}`);
  console.log(`ダッシュボード → http://localhost:${PORT}/katoasao/`);
});
