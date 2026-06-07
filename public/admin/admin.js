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

  /* サイト文章の編集項目（キーは server.js の DEFAULT_CONTENT と一致） */
  const CONTENT_GROUPS = [
    { group: "基本", fields: [
      { key: "siteName", label: "サイト名（ロゴ）", type: "text" },
    ]},
    { group: "トップ（ヒーロー）", fields: [
      { key: "heroTitle", label: "キャッチコピー（大見出し・改行可）", type: "textarea" },
      { key: "heroLead", label: "リード文（改行可）", type: "textarea" },
      { key: "heroButton", label: "ボタンの文言", type: "text" },
    ]},
    { group: "About（アーティスト紹介）", fields: [
      { key: "aboutBody", label: "本文", type: "textarea" },
      { key: "aboutButton", label: "ボタンの文言", type: "text" },
      { key: "aboutSignature", label: "サイン（手書き風の署名）", type: "text" },
    ]},
    { group: "Contact（お問い合わせ）", fields: [
      { key: "contactDesc", label: "説明文", type: "textarea" },
    ]},
    { group: "フッター・SNS", fields: [
      { key: "instagramUrl", label: "Instagram のURL", type: "text" },
      { key: "emailUrl", label: "メールリンク（例：mailto:you@example.com）", type: "text" },
      { key: "copyrightSuffix", label: "コピーライト表記（年・サイト名のあと）", type: "text" },
    ]},
  ];

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
  function showLogin() { loginView.hidden = false; appView.hidden = true; }
  function showApp() { loginView.hidden = true; appView.hidden = false; init(); }

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
      if (tab.dataset.tab === "messages") loadMessages();
      if (tab.dataset.tab === "content") loadContent();
      if (tab.dataset.tab === "news") loadNews();
    });
  });

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

  /* ---------- サイトの文章：フォーム生成・読み込み・保存 ---------- */
  let contentBuilt = false;
  function buildContentForm() {
    if (contentBuilt) return;
    const wrap = $("content-fields");
    wrap.innerHTML = "";
    CONTENT_GROUPS.forEach((g) => {
      const group = document.createElement("div");
      group.className = "content-group";
      const h = document.createElement("h3");
      h.textContent = g.group;
      group.appendChild(h);
      g.fields.forEach((f) => {
        const field = document.createElement("div");
        field.className = "content-field";
        const id = "c_" + f.key;
        const label = document.createElement("label");
        label.setAttribute("for", id);
        label.textContent = f.label;
        field.appendChild(label);
        const input = f.type === "textarea" ? document.createElement("textarea") : document.createElement("input");
        if (f.type === "textarea") input.rows = 3; else input.type = "text";
        input.id = id;
        input.dataset.key = f.key;
        field.appendChild(input);
        group.appendChild(field);
      });
      wrap.appendChild(group);
    });
    contentBuilt = true;
  }

  async function loadContent() {
    buildContentForm();
    let content = {};
    try { content = await (await fetch("/api/content")).json(); } catch (e) { content = {}; }
    document.querySelectorAll("#content-fields [data-key]").forEach((input) => {
      input.value = content[input.dataset.key] != null ? content[input.dataset.key] : "";
    });
  }

  $("content-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const note = $("content-note");
    note.textContent = "保存中…";
    note.classList.remove("is-error");
    const payload = {};
    document.querySelectorAll("#content-fields [data-key]").forEach((input) => {
      payload[input.dataset.key] = input.value;
    });
    try {
      const res = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
        '<button class="admin-card__del" data-id="' + esc(w.id) + '">削除</button>';
      card.querySelector(".admin-card__del").addEventListener("click", async () => {
        if (!confirm("「" + w.title + "」を削除しますか？")) return;
        const res = await fetch("/api/admin/works/" + encodeURIComponent(w.id), { method: "DELETE" });
        if (res.ok) loadWorks();
        else alert("削除に失敗しました。");
      });
      grid.appendChild(card);
    });
  }

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
  }

  checkAuth();
})();
