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
    });
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
