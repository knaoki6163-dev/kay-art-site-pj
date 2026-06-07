/* =========================================================
   Aquarelle — 管理画面のロジック
   ・ログイン / ログアウト
   ・作品の写真アップロード・一覧・削除
   ・お問い合わせ一覧・削除
   ========================================================= */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const loginView = $("login-view");
  const appView = $("app-view");
  const loginNote = $("login-note");
  const uploadNote = $("upload-note");
  let categories = [];

  /* サイト文章の編集項目（キーは server.js の既定値と一致）
     SHARED=全言語共通 / LOCALIZED=言語ごとに切替 */
  const SHARED_FIELDS = [
    { key: "siteName", label: "サイト名（ロゴ）", type: "text" },
    { key: "aboutSignature", label: "サイン（手書き風の署名）", type: "text" },
    { key: "instagramUrl", label: "Instagram のURL", type: "text" },
    { key: "emailUrl", label: "メールリンク（例：mailto:you@example.com）", type: "text" },
  ];
  const LOCALIZED_FIELDS = [
    { key: "heroTitle", label: "キャッチコピー（大見出し・改行可）", type: "textarea" },
    { key: "heroLead", label: "リード文（改行可）", type: "textarea" },
    { key: "heroButton", label: "ヒーローのボタン文言", type: "text" },
    { key: "aboutBody", label: "About 本文", type: "textarea" },
    { key: "aboutButton", label: "About のボタン文言", type: "text" },
    { key: "contactDesc", label: "Contact 説明文", type: "textarea" },
    { key: "copyrightSuffix", label: "コピーライト表記（年・サイト名のあと）", type: "text" },
  ];
  const LANGS = ["ja", "en"];

  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function fmtDate(ts) {
    try { return new Date(ts).toLocaleString("ja-JP"); } catch (e) { return ""; }
  }
  function categoryLabel(key) {
    const c = categories.find((x) => x.key === key);
    return c ? c.label : key;
  }

  /* ---------- 画面の切り替え ---------- */
  function showLogin() { loginView.hidden = false; appView.hidden = true; document.body.classList.remove("is-authed"); }
  function showApp() { loginView.hidden = true; appView.hidden = false; document.body.classList.add("is-authed"); init(); }

  /* ---------- 起動時：ログイン状態を確認 ---------- */
  async function checkAuth() {
    try {
      const res = await fetch("/api/admin/me");
      const data = await res.json();
      data.isAdmin ? showApp() : showLogin();
    } catch (e) { showLogin(); }
  }

  /* ---------- ログイン ---------- */
  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    loginNote.textContent = "";
    loginNote.classList.remove("is-error");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: $("password").value }),
      });
      const data = await res.json();
      if (res.ok && data.ok) { $("password").value = ""; showApp(); }
      else { loginNote.textContent = data.error || "ログインに失敗しました。"; loginNote.classList.add("is-error"); }
    } catch (err) {
      loginNote.textContent = "通信エラーが発生しました。"; loginNote.classList.add("is-error");
    }
  });

  /* ---------- ログアウト ---------- */
  $("logout-btn").addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    showLogin();
  });

  /* ---------- タブ切り替え ---------- */
  document.querySelectorAll(".admin-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".admin-tab").forEach((t) => t.classList.remove("is-active"));
      document.querySelectorAll(".admin-panel").forEach((p) => p.classList.remove("is-active"));
      tab.classList.add("is-active");
      $("panel-" + tab.dataset.tab).classList.add("is-active");
      if (tab.dataset.tab === "messages") { loadMessages(); markMessagesRead(); }
      if (tab.dataset.tab === "content") loadContent();
      if (tab.dataset.tab === "news") loadNews();
    });
  });

  /* ---------- お問い合わせ 未読バッジ ---------- */
  async function refreshMessageBadge() {
    let count = 0;
    try { count = (await (await fetch("/api/admin/messages/unread-count")).json()).count || 0; }
    catch (e) { count = 0; }
    const badge = $("msg-badge");
    if (count > 0) { badge.textContent = count > 99 ? "99+" : count; badge.hidden = false; }
    else { badge.hidden = true; }
  }
  async function markMessagesRead() {
    try { await fetch("/api/admin/messages/read-all", { method: "POST" }); } catch (e) {}
    $("msg-badge").hidden = true;
  }

  /* ---------- お知らせ：追加・一覧・削除 ---------- */
  $("news-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const note = $("news-note");
    note.textContent = "追加中…";
    note.classList.remove("is-error");
    try {
      const res = await fetch("/api/admin/news", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: $("news-date").value.trim(), title: $("news-title").value.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.ok) { note.textContent = "追加しました。"; e.target.reset(); loadNews(); }
      else { note.textContent = data.error || "追加に失敗しました。"; note.classList.add("is-error"); }
    } catch (err) { note.textContent = "通信エラーが発生しました。"; note.classList.add("is-error"); }
  });

  async function loadNews() {
    let news = [];
    try { news = await (await fetch("/api/news")).json(); } catch (e) { news = []; }
    const rows = $("news-rows");
    rows.innerHTML = "";
    $("news-empty-admin").hidden = news.length > 0;
    news.forEach((n) => {
      const row = document.createElement("div");
      row.className = "news-row";
      row.innerHTML =
        '<div class="news-row__head">' +
          '<span class="news-row__date">' + esc(n.date || "（日付なし）") + "</span>" +
          '<button class="news-row__del" data-id="' + esc(n.id) + '">削除</button>' +
        "</div>" +
        "<div>" + esc(n.title) + "</div>";
      row.querySelector(".news-row__del").addEventListener("click", async () => {
        if (!confirm("このお知らせを削除しますか？")) return;
        const res = await fetch("/api/admin/news/" + encodeURIComponent(n.id), { method: "DELETE" });
        if (res.ok) loadNews(); else alert("削除に失敗しました。");
      });
      rows.appendChild(row);
    });
  }

  /* ---------- サイトの文章（多言語）：生成・読み込み・保存 ---------- */
  let contentBuilt = false;
  let contentModel = null;     // { shared:{}, ja:{}, en:{}, zh:{} }
  let contentLang = "ja";

  function makeField(f, idPrefix) {
    const field = document.createElement("div");
    field.className = "content-field";
    const id = idPrefix + f.key;
    const label = document.createElement("label");
    label.setAttribute("for", id);
    label.textContent = f.label;
    const input = f.type === "textarea" ? document.createElement("textarea") : document.createElement("input");
    if (f.type === "textarea") input.rows = 3; else input.type = "text";
    input.id = id;
    input.dataset.key = f.key;
    field.appendChild(label);
    field.appendChild(input);
    return field;
  }

  function buildContentForm() {
    if (contentBuilt) return;
    const sw = $("content-shared");
    sw.innerHTML = "";
    SHARED_FIELDS.forEach((f) => sw.appendChild(makeField(f, "cs_")));
    const lw = $("content-localized");
    lw.innerHTML = "";
    LOCALIZED_FIELDS.forEach((f) => lw.appendChild(makeField(f, "cl_")));
    $("content-lang").addEventListener("change", (e) => {
      saveLocalizedToModel();
      contentLang = e.target.value;
      loadLocalizedFromModel();
    });
    contentBuilt = true;
  }

  function saveSharedToModel() {
    SHARED_FIELDS.forEach((f) => { const i = $("cs_" + f.key); if (i) contentModel.shared[f.key] = i.value; });
  }
  function saveLocalizedToModel() {
    if (!contentModel) return;
    const m = contentModel[contentLang] || (contentModel[contentLang] = {});
    LOCALIZED_FIELDS.forEach((f) => { const i = $("cl_" + f.key); if (i) m[f.key] = i.value; });
  }
  function loadSharedFromModel() {
    SHARED_FIELDS.forEach((f) => { const i = $("cs_" + f.key); if (i) i.value = (contentModel.shared && contentModel.shared[f.key] != null) ? contentModel.shared[f.key] : ""; });
  }
  function loadLocalizedFromModel() {
    const m = contentModel[contentLang] || {};
    LOCALIZED_FIELDS.forEach((f) => { const i = $("cl_" + f.key); if (i) i.value = (m[f.key] != null) ? m[f.key] : ""; });
  }

  async function loadContent() {
    buildContentForm();
    try { contentModel = await (await fetch("/api/admin/content")).json(); }
    catch (e) { contentModel = { shared: {} }; }
    if (!contentModel.shared) contentModel.shared = {};
    LANGS.forEach((l) => { if (!contentModel[l]) contentModel[l] = {}; });
    contentLang = $("content-lang").value || "ja";
    loadSharedFromModel();
    loadLocalizedFromModel();
  }

  $("content-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const note = $("content-note");
    note.textContent = "保存中…";
    note.classList.remove("is-error");
    saveSharedToModel();
    saveLocalizedToModel();
    try {
      const res = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contentModel),
      });
      const data = await res.json();
      if (res.ok && data.ok) note.textContent = "保存しました。公開サイトに反映されています。";
      else { note.textContent = data.error || "保存に失敗しました。"; note.classList.add("is-error"); }
    } catch (err) {
      note.textContent = "通信エラーが発生しました。"; note.classList.add("is-error");
    }
  });

  /* ---------- カテゴリ読み込み（アップロードの選択肢） ---------- */
  async function loadCategories() {
    try {
      const res = await fetch("/api/categories");
      categories = await res.json();
    } catch (e) { categories = []; }
    const sel = $("category");
    sel.innerHTML = "";
    categories.forEach((c) => {
      const o = document.createElement("option");
      o.value = c.key; o.textContent = c.label;
      sel.appendChild(o);
    });
  }

  /* ---------- 作品アップロード ---------- */
  $("upload-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    uploadNote.textContent = "アップロード中…";
    uploadNote.classList.remove("is-error");
    try {
      const fd = new FormData(e.target);
      const res = await fetch("/api/admin/works", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && data.ok) {
        uploadNote.textContent = "アップロードしました。";
        e.target.reset();
        loadWorks();
      } else {
        uploadNote.textContent = data.error || "アップロードに失敗しました。";
        uploadNote.classList.add("is-error");
      }
    } catch (err) {
      uploadNote.textContent = "通信エラーが発生しました。";
      uploadNote.classList.add("is-error");
    }
  });

  /* ---------- 作品一覧の表示 ---------- */
  async function loadWorks() {
    let works = [];
    try { works = await (await fetch("/api/works")).json(); } catch (e) { works = []; }
    const grid = $("works-grid");
    grid.innerHTML = "";
    $("works-empty").hidden = works.length > 0;

    works.forEach((w) => {
      const card = document.createElement("article");
      card.className = "admin-card";
      card.innerHTML =
        '<img src="' + esc(w.image) + '" alt="' + esc(w.title) + '" />' +
        '<div class="admin-card__body">' +
          '<div class="admin-card__title">' + esc(w.title) + "</div>" +
          '<div class="admin-card__meta">' + esc([categoryLabel(w.category), w.year].filter(Boolean).join(" · ")) + "</div>" +
        "</div>" +
        '<div class="admin-card__actions">' +
          '<button class="admin-card__edit">編集</button>' +
          '<button class="admin-card__del">削除</button>' +
        "</div>";
      card.querySelector(".admin-card__edit").addEventListener("click", () => openEditWork(w));
      card.querySelector(".admin-card__del").addEventListener("click", async () => {
        if (!confirm("「" + w.title + "」を削除しますか？")) return;
        const res = await fetch("/api/admin/works/" + encodeURIComponent(w.id), { method: "DELETE" });
        if (res.ok) loadWorks();
        else alert("削除に失敗しました。");
      });
      grid.appendChild(card);
    });
  }

  /* ---------- 作品の編集モーダル ---------- */
  function fillEditCategories(selected) {
    const sel = $("edit-category");
    sel.innerHTML = "";
    categories.forEach((c) => {
      const o = document.createElement("option");
      o.value = c.key; o.textContent = c.label;
      if (c.key === selected) o.selected = true;
      sel.appendChild(o);
    });
  }
  function openEditWork(w) {
    fillEditCategories(w.category);
    $("edit-id").value = w.id;
    $("edit-title").value = w.title || "";
    $("edit-year").value = w.year || "";
    // 旧データ（medium）は技法欄に入れて移行しやすくする
    $("edit-technique").value = w.technique || w.medium || "";
    $("edit-size").value = w.size || "";
    $("edit-status").value = w.status || "Available";
    $("edit-note").textContent = "";
    $("edit-modal").hidden = false;
  }
  function closeEditModal() { $("edit-modal").hidden = true; }
  $("edit-cancel").addEventListener("click", closeEditModal);
  $("edit-modal").addEventListener("click", (e) => { if (e.target.id === "edit-modal") closeEditModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("edit-modal").hidden) closeEditModal(); });
  $("edit-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const note = $("edit-note");
    note.textContent = "保存中…"; note.classList.remove("is-error");
    const id = $("edit-id").value;
    try {
      const res = await fetch("/api/admin/works/" + encodeURIComponent(id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: $("edit-title").value,
          category: $("edit-category").value,
          year: $("edit-year").value,
          technique: $("edit-technique").value,
          size: $("edit-size").value,
          status: $("edit-status").value,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) { closeEditModal(); loadWorks(); }
      else { note.textContent = data.error || "保存に失敗しました。"; note.classList.add("is-error"); }
    } catch (err) { note.textContent = "通信エラーが発生しました。"; note.classList.add("is-error"); }
  });

  /* ---------- お問い合わせ一覧の表示 ---------- */
  async function loadMessages() {
    let messages = [];
    try { messages = await (await fetch("/api/admin/messages")).json(); } catch (e) { messages = []; }
    const list = $("messages-list");
    list.innerHTML = "";
    $("messages-empty").hidden = messages.length > 0;

    messages.forEach((m) => {
      const item = document.createElement("article");
      item.className = "msg";
      item.innerHTML =
        '<div class="msg__head">' +
          "<div>" +
            '<span class="msg__name">' + esc(m.name) + "</span> " +
            '<a class="msg__email" href="mailto:' + esc(m.email) + '">' + esc(m.email) + "</a>" +
          "</div>" +
          '<span class="msg__date">' + esc(fmtDate(m.createdAt)) + "</span>" +
        "</div>" +
        '<p class="msg__text">' + esc(m.message) + "</p>" +
        '<button class="msg__del" data-id="' + esc(m.id) + '">削除</button>';
      item.querySelector(".msg__del").addEventListener("click", async () => {
        if (!confirm("このお問い合わせを削除しますか？")) return;
        const res = await fetch("/api/admin/messages/" + encodeURIComponent(m.id), { method: "DELETE" });
        if (res.ok) loadMessages();
        else alert("削除に失敗しました。");
      });
      list.appendChild(item);
    });
  }

  /* ---------- 管理画面の初期化 ---------- */
  async function init() {
    await loadCategories();
    await loadWorks();
    refreshMessageBadge();
  }

  checkAuth();
})();
