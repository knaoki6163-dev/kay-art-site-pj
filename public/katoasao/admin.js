/* =========================================================
   Aquarelle — ダッシュボードのロジック
   ・ログイン / ログアウト
   ・作品の写真アップロード・一覧・削除
   ・お問い合わせ一覧・削除
   ========================================================= */

(function () {
  "use strict";

  // 「戻る/進む」でbfcacheから復元されたときは、ログイン状態や各タブの内容が
  // 古いまま一瞬表示されることがあるため、必ず読み込み直す（公開サイト側と同じ対策）。
  window.addEventListener("pageshow", (e) => { if (e.persisted) location.reload(); });

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
    { key: "instagramVisible", label: "フッターに Instagram リンクを表示する", type: "checkbox" },
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

  /* ---------- 確認ポップアップ（自前モーダル：ブラウザに抑制されない） ---------- */
  function askConfirm(message, okLabel) {
    return new Promise((resolve) => {
      const modal = $("confirm-modal");
      const ok = $("confirm-ok");
      const cancel = $("confirm-cancel");
      if (!modal) { resolve(window.confirm(message)); return; } // 保険：モーダルが無ければ標準確認
      $("confirm-message").textContent = message;
      ok.textContent = okLabel || "削除する";
      modal.hidden = false;
      function cleanup() {
        modal.hidden = true;
        ok.removeEventListener("click", onOk);
        cancel.removeEventListener("click", onCancel);
        modal.removeEventListener("click", onBackdrop);
        document.removeEventListener("keydown", onKey);
      }
      function onOk() { cleanup(); resolve(true); }
      function onCancel() { cleanup(); resolve(false); }
      function onBackdrop(e) { if (e.target.id === "confirm-modal") onCancel(); }
      function onKey(e) { if (e.key === "Escape") onCancel(); }
      ok.addEventListener("click", onOk);
      cancel.addEventListener("click", onCancel);
      modal.addEventListener("click", onBackdrop);
      document.addEventListener("keydown", onKey);
    });
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
      if (tab.dataset.tab === "blog") loadBlog();
      // バージョン管理／アクセス解析タブを開いている間だけ自動更新（離れたら止める）
      stopVersionAutoRefresh();
      stopAnalyticsAutoRefresh();
      if (tab.dataset.tab === "version") { loadVersionHistory(); startVersionAutoRefresh(); }
      if (tab.dataset.tab === "analytics") loadAnalytics();
    });
  });

  /* ---------- アクセス解析（GA4 Data API） ---------- */
  function anFmtSecs(sec) {
    sec = Math.max(0, Math.round(sec));
    return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
  }
  function anDeltaVisitors(pct) {
    if (pct == null) return { text: "前日比 —", cls: "" };
    const up = pct >= 0;
    return { text: (up ? "▲ " : "▼ ") + Math.abs(pct) + "% 前日比", cls: up ? "is-up" : "" };
  }
  function anDeltaAvg(diffSec) {
    const up = diffSec >= 0;
    return { text: (up ? "▲ " : "▼ ") + Math.abs(diffSec) + "秒 前日比", cls: up ? "is-up" : "" };
  }
  function anDeltaBounce(diffPt) {
    const down = diffPt <= 0;
    return { text: (down ? "▼ " : "▲ ") + Math.abs(diffPt) + "pt 前日比" + (down ? " 改善" : ""), cls: down ? "is-good" : "" };
  }
  function anSetUpdatedNow() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    $("an-updated").textContent = "最終更新 " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }

  function renderTrendChart(trend) {
    const line = $("an-trend-line"), area = $("an-trend-area"), dot = $("an-trend-dot");
    if (!trend || !trend.length) {
      line.setAttribute("points", ""); area.setAttribute("d", "");
      dot.setAttribute("cx", "0"); dot.setAttribute("cy", "88");
      return;
    }
    const W = 320, top = 8, bot = 88;
    const vals = trend.map((t) => t.value);
    const mn = Math.min(...vals), mx = Math.max(...vals);
    const n = vals.length;
    const xa = (i) => (n > 1 ? (i / (n - 1)) * W : W);
    const ya = (v) => bot - ((v - mn) / (mx - mn || 1)) * (bot - top);
    const pts = vals.map((v, i) => xa(i).toFixed(1) + "," + ya(v).toFixed(1));
    line.setAttribute("points", pts.join(" "));
    area.setAttribute("d", "M0," + bot + " L" + pts.join(" L") + " L" + W + "," + bot + " Z");
    dot.setAttribute("cx", xa(n - 1).toFixed(1));
    dot.setAttribute("cy", ya(vals[n - 1]).toFixed(1));
  }

  function renderTraffic(list) {
    const wrap = $("an-traffic");
    wrap.innerHTML = "";
    if (!list || !list.length) { wrap.innerHTML = '<p class="an-hint">データがまだありません。</p>'; return; }
    list.forEach((t) => {
      const row = document.createElement("div");
      row.innerHTML =
        '<div class="an-traffic-row__head">' +
          '<div class="an-traffic-row__label"><span class="an-traffic-row__name">' + esc(t.label) + '</span>' +
            '<span class="an-traffic-row__sub">' + esc(t.sub) + '</span></div>' +
          '<span class="an-traffic-row__pct">' + t.pct + '%</span>' +
        '</div>' +
        '<div class="an-bar-track"><div class="an-bar-fill" style="width:' + t.pct + '%"></div></div>';
      wrap.appendChild(row);
    });
  }

  function renderWorks(list) {
    const wrap = $("an-works");
    wrap.innerHTML = "";
    $("an-works-hint").hidden = !!(list && list.length);
    if (!list || !list.length) return;
    const max = Math.max(...list.map((w) => w.views));
    list.forEach((w, i) => {
      const row = document.createElement("div");
      row.className = "an-work-row";
      const thumb = w.image
        ? '<img class="an-work-row__thumb" src="' + esc(w.image) + '" alt="" />'
        : '<div class="an-work-row__thumb"></div>';
      row.innerHTML =
        '<span class="an-work-row__rank">' + String(i + 1).padStart(2, "0") + '</span>' + thumb +
        '<div class="an-work-row__body">' +
          '<div class="an-work-row__top"><span class="an-work-row__title">' + esc(w.title) + '</span>' +
            '<span class="an-work-row__views">' + w.views.toLocaleString("ja-JP") + '</span></div>' +
          '<div class="an-bar-track"><div class="an-bar-fill" style="width:' + Math.round((w.views / max) * 100) + '%"></div></div>' +
        '</div>';
      wrap.appendChild(row);
    });
  }

  function renderRtBars(bars) {
    const wrap = $("an-rt-bars");
    wrap.innerHTML = "";
    const max = Math.max(1, ...(bars || []));
    (bars || []).forEach((v) => {
      const span = document.createElement("span");
      span.style.height = (10 + (v / max) * 90) + "%";
      wrap.appendChild(span);
    });
  }
  function renderRtPages(list) {
    const wrap = $("an-rt-pages");
    wrap.innerHTML = "";
    if (!list || !list.length) { wrap.innerHTML = '<p class="an-hint">現在の閲覧者はいません。</p>'; return; }
    const max = Math.max(...list.map((p) => p.n));
    list.forEach((p) => {
      const row = document.createElement("div");
      row.className = "an-rt-page-row";
      row.innerHTML =
        '<span class="an-rt-page-row__name">' + esc(p.name) + '</span>' +
        '<div class="an-rt-page-row__right"><div class="an-bar-track"><div class="an-bar-fill" style="width:' +
          Math.round((p.n / max) * 100) + '%"></div></div><span class="an-rt-page-row__n">' + p.n + '</span></div>';
      wrap.appendChild(row);
    });
  }

  function renderCountry(list) {
    const wrap = $("an-country");
    wrap.innerHTML = "";
    if (!list || !list.length) { wrap.innerHTML = '<p class="an-hint">データがまだありません。</p>'; return; }
    list.forEach((c) => {
      const row = document.createElement("div");
      row.innerHTML =
        '<div class="an-country-row__head"><span>' + esc(c.label) + '</span><span class="an-country-row__pct">' + c.pct + '%</span></div>' +
        '<div class="an-bar-track"><div class="an-bar-fill" style="width:' + c.pct + '%"></div></div>';
      wrap.appendChild(row);
    });
  }

  function renderNewRet(nr) {
    if (!nr) {
      $("an-newret-new").style.width = "0%";
      $("an-newret-new-str").textContent = "—";
      $("an-newret-ret-str").textContent = "—";
      return;
    }
    $("an-newret-new").style.width = nr.newPct + "%";
    $("an-newret-new-str").textContent = nr.newPct + "%";
    $("an-newret-ret-str").textContent = nr.returningPct + "%";
  }

  async function loadAnalyticsOverview() {
    let data;
    try { data = await (await fetch("/api/admin/analytics/overview")).json(); }
    catch (e) { data = { configured: true, totalsError: "通信エラーが発生しました。" }; }

    if (!data.configured) {
      $("an-empty").hidden = false;
      $("an-body").hidden = true;
      $("an-error").hidden = true;
      return;
    }
    $("an-empty").hidden = true;
    $("an-body").hidden = false;

    const t = data.totals;
    $("an-kpi-visitors").textContent = t ? t.visitors.toLocaleString("ja-JP") : "—";
    const dv = anDeltaVisitors(t && t.dVisitorsPct);
    $("an-kpi-visitors-delta").textContent = dv.text; $("an-kpi-visitors-delta").className = "an-delta " + dv.cls;

    $("an-kpi-avg").textContent = t ? anFmtSecs(t.avgSecs) : "—";
    const da = anDeltaAvg(t ? t.dAvgSecs : 0);
    $("an-kpi-avg-delta").textContent = da.text; $("an-kpi-avg-delta").className = "an-delta " + da.cls;

    $("an-kpi-bounce").textContent = t ? t.bounce.toFixed(1) + "%" : "—";
    const db = anDeltaBounce(t ? t.dBounce : 0);
    $("an-kpi-bounce-delta").textContent = db.text; $("an-kpi-bounce-delta").className = "an-delta " + db.cls;

    renderTrendChart(data.trend);
    renderTraffic(data.traffic);
    renderWorks(data.works);
    renderCountry(data.country);
    renderNewRet(data.newReturning);

    const errors = [data.totalsError, data.trendError, data.trafficError, data.worksError, data.countryError, data.newReturningError].filter(Boolean);
    const errBox = $("an-error");
    if (errors.length) {
      errBox.hidden = false;
      errBox.textContent = "一部のデータを取得できませんでした：" + Array.from(new Set(errors)).join(" / ");
    } else {
      errBox.hidden = true;
    }
    anSetUpdatedNow();
  }

  async function loadAnalyticsRealtime() {
    let data;
    try { data = await (await fetch("/api/admin/analytics/realtime")).json(); }
    catch (e) { return; }
    if (!data.configured) return;
    $("an-rt-now").textContent = (data.users && data.users.now) || 0;
    renderRtBars(data.users && data.users.bars);
    renderRtPages(data.pages);
  }

  let anOverviewTimer = null, anRealtimeTimer = null;
  function startAnalyticsAutoRefresh() {
    stopAnalyticsAutoRefresh();
    anOverviewTimer = setInterval(() => { if (document.visibilityState === "visible") loadAnalyticsOverview(); }, 60000);
    anRealtimeTimer = setInterval(() => { if (document.visibilityState === "visible") loadAnalyticsRealtime(); }, 15000);
  }
  function stopAnalyticsAutoRefresh() {
    if (anOverviewTimer) { clearInterval(anOverviewTimer); anOverviewTimer = null; }
    if (anRealtimeTimer) { clearInterval(anRealtimeTimer); anRealtimeTimer = null; }
  }
  function loadAnalytics() {
    loadAnalyticsOverview();
    loadAnalyticsRealtime();
    startAnalyticsAutoRefresh();
  }

  /* ---------- お問い合わせ 未読バッジ（タブ＋ベル） ---------- */
  async function refreshMessageBadge() {
    let count = 0;
    try { count = (await (await fetch("/api/admin/messages/unread-count")).json()).count || 0; }
    catch (e) { count = 0; }
    const label = count > 99 ? "99+" : String(count);
    [["msg-badge"], ["bell-badge"]].forEach(([id]) => {
      const badge = $(id);
      if (!badge) return;
      if (count > 0) { badge.textContent = label; badge.hidden = false; }
      else { badge.hidden = true; }
    });
  }
  async function markMessagesRead() {
    try { await fetch("/api/admin/messages/read-all", { method: "POST" }); } catch (e) {}
    $("msg-badge").hidden = true;
    if ($("bell-badge")) $("bell-badge").hidden = true;
  }
  // ベルを押したらお問い合わせタブを開く
  if ($("bell-btn")) {
    $("bell-btn").addEventListener("click", () => {
      const tab = document.querySelector('.admin-tab[data-tab="messages"]');
      if (tab) tab.click();
    });
  }

  /* ---------- お知らせ（Info）：追加・一覧・削除 ---------- */
  // 今日の日付を「2024.05.12」形式で返す（お知らせの日付として自動付与）
  function todayDot() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "." + p(d.getMonth() + 1) + "." + p(d.getDate());
  }

  $("news-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const note = $("news-note");
    note.textContent = "追加中…"; note.classList.remove("is-error");
    try {
      const res = await fetch("/api/admin/news", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: todayDot(), title: $("news-title").value.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.ok) { note.textContent = "追加しました。"; e.target.reset(); loadNews(); }
      else { note.textContent = data.error || "追加に失敗しました。"; note.classList.add("is-error"); }
    } catch (err) { note.textContent = "通信エラーが発生しました。"; note.classList.add("is-error"); }
  });
  // 管理画面用：投稿日時を「2024.05.12 14:30」のように分まで表示（公開側は日付のみ）
  function fmtNewsPosted(n) {
    if (n.createdAt) {
      const d = new Date(n.createdAt);
      const p = (x) => String(x).padStart(2, "0");
      return d.getFullYear() + "." + p(d.getMonth() + 1) + "." + p(d.getDate()) +
        " " + p(d.getHours()) + ":" + p(d.getMinutes());
    }
    return n.date || "（日付なし）";
  }
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
          '<span class="news-row__date">' + esc(fmtNewsPosted(n)) + "</span>" +
          '<button class="news-row__del" data-id="' + esc(n.id) + '">削除</button>' +
        "</div>" +
        "<div>" + esc(n.title) + "</div>";
      row.querySelector(".news-row__del").addEventListener("click", async () => {
        if (!(await askConfirm("このお知らせを削除しますか？"))) return;
        const res = await fetch("/api/admin/news/" + encodeURIComponent(n.id), { method: "DELETE" });
        if (res.ok) loadNews(); else alert("削除に失敗しました。");
      });
      rows.appendChild(row);
    });
  }

  /* ---------- Blog：追加・一覧・削除 ---------- */
  $("blog-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const note = $("blog-note");
    note.textContent = "追加中…"; note.classList.remove("is-error");
    try {
      const res = await fetch("/api/admin/blog", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: todayDot(), title: $("blog-title").value.trim(), body: $("blog-body").value.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.ok) { note.textContent = "追加しました。"; e.target.reset(); loadBlog(); }
      else { note.textContent = data.error || "追加に失敗しました。"; note.classList.add("is-error"); }
    } catch (err) { note.textContent = "通信エラーが発生しました。"; note.classList.add("is-error"); }
  });
  async function loadBlog() {
    let posts = [];
    try { posts = await (await fetch("/api/blog")).json(); } catch (e) { posts = []; }
    const rows = $("blog-rows");
    rows.innerHTML = "";
    $("blog-empty-admin").hidden = posts.length > 0;
    posts.forEach((p) => {
      const row = document.createElement("div");
      row.className = "news-row";
      row.innerHTML =
        '<div class="news-row__head">' +
          '<span class="news-row__date">' + esc(fmtNewsPosted(p)) + "</span>" +
          '<button class="news-row__del" data-id="' + esc(p.id) + '">削除</button>' +
        "</div>" +
        "<div><strong>" + esc(p.title) + "</strong></div>" +
        (p.body ? '<div class="news-row__body">' + esc(p.body) + "</div>" : "");
      row.querySelector(".news-row__del").addEventListener("click", async () => {
        if (!(await askConfirm("この記事を削除しますか？"))) return;
        const res = await fetch("/api/admin/blog/" + encodeURIComponent(p.id), { method: "DELETE" });
        if (res.ok) loadBlog(); else alert("削除に失敗しました。");
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
    if (f.type === "checkbox") {
      const label = document.createElement("label");
      label.className = "check";
      label.setAttribute("for", id);
      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = id;
      input.dataset.key = f.key;
      const span = document.createElement("span");
      span.textContent = f.label;
      label.appendChild(input);
      label.appendChild(span);
      field.appendChild(label);
      return field;
    }
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
    SHARED_FIELDS.forEach((f) => {
      const i = $("cs_" + f.key); if (!i) return;
      contentModel.shared[f.key] = f.type === "checkbox" ? (i.checked ? "true" : "false") : i.value;
    });
  }
  function saveLocalizedToModel() {
    if (!contentModel) return;
    const m = contentModel[contentLang] || (contentModel[contentLang] = {});
    LOCALIZED_FIELDS.forEach((f) => { const i = $("cl_" + f.key); if (i) m[f.key] = i.value; });
  }
  function loadSharedFromModel() {
    SHARED_FIELDS.forEach((f) => {
      const i = $("cs_" + f.key); if (!i) return;
      const v = (contentModel.shared && contentModel.shared[f.key] != null) ? contentModel.shared[f.key] : "";
      if (f.type === "checkbox") i.checked = (v !== "false"); // 既定は表示
      else i.value = v;
    });
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
      // 未チェックのチェックボックスは送信されないため、明示的に true/false を入れる
      fd.set("featured", $("upload-featured").checked ? "true" : "false");
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
        (w.featured === false ? '<span class="admin-card__badge">トップ非表示</span>' : "") +
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
        if (!(await askConfirm("「" + w.title + "」を削除しますか？"))) return;
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
    $("edit-status").value = w.status && w.status !== "Available" ? w.status : ""; // 旧Availableは指定なしへ
    $("edit-featured").checked = w.featured !== false; // 旧データ（未設定）は表示扱い
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
          featured: $("edit-featured").checked,
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
      item.className = "msg" + (m.important ? " is-important" : "");
      item.innerHTML =
        '<div class="msg__head">' +
          "<div>" +
            '<span class="msg__name">' + esc(m.name) + "</span> " +
            '<a class="msg__email" href="mailto:' + esc(m.email) + '">' + esc(m.email) + "</a>" +
          "</div>" +
          '<div class="msg__head-right">' +
            '<button class="msg__star' + (m.important ? " is-on" : "") + '" title="重要" aria-label="重要マーク">' +
              (m.important ? "★" : "☆") + "</button>" +
            '<span class="msg__date">' + esc(fmtDate(m.createdAt)) + "</span>" +
          "</div>" +
        "</div>" +
        '<p class="msg__text">' + esc(m.message) + "</p>";
      item.querySelector(".msg__star").addEventListener("click", async () => {
        try {
          const res = await fetch("/api/admin/messages/" + encodeURIComponent(m.id), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ important: !m.important }),
          });
          if (res.ok) loadMessages();
        } catch (e) {}
      });
      list.appendChild(item);
    });
  }

  /* ---------- バージョン管理（GitHubのコード修正履歴 ＋ 管理画面からの更新履歴） ---------- */
  // 「◯分前 / ◯時間前 / 日付」の簡易相対表示。詳細日時はtitle属性で確認できる。
  function fmtRelative(ts) {
    if (!ts) return "";
    const diffMin = Math.floor((Date.now() - ts) / 60000);
    if (diffMin < 1) return "たった今";
    if (diffMin < 60) return diffMin + "分前";
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return diffH + "時間前";
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return diffD + "日前";
    return fmtDate(ts);
  }
  // 項目のバッジ文言とCSSクラスを決める。
  // ・管理画面からの更新 → 「サイトの情報更新」
  // ・GitHubのコミット → 改修の種類（管理画面の仕様変更 / サイトのデザイン修正 /
  //   サイトの項目の名称変更 / サーバー関連の変更 / 機能の追加・改善 / その他の修正 /
  //   バグ修正 / サイトの大幅改修）＋作業元（Claude / Codex / GitHub）を併記。
  //   色分けは作業元(cls)で行う。
  // ・compact=true（サイトの情報更新・バグ修正）はボックスを少し低くする。
  // ・major=true（サイトの大幅改修）は左帯を太くし、本文の下に修正前後の詳細
  //   （it.detail）を少し小さい字のボックスで添える。本文の文字サイズは他と同じ。
  // changeType（サーバー判定）を日本語のカテゴリ名に対応づける。
  const CHANGE_LABELS = {
    major: "サイトの大幅改修",
    bug: "バグ修正",
    config: "サーバー関連の修正",
    feature: "機能の追加・改善",
    adminpanel: "管理画面の仕様変更",
    design: "サイトのデザイン修正",
    text: "サイトの項目の名称変更",
    minor: "その他の修正",
  };
  function versionBadgeInfo(it) {
    if (it.source !== "github") return { label: "サイトの情報更新", cls: "admin", compact: true };
    const category = CHANGE_LABELS[it.changeType] || "その他の修正";
    const agentName = it.agent === "claude" ? "Claude" : it.agent === "codex" ? "Codex" : "GitHub";
    const cls = it.agent === "claude" ? "claude" : it.agent === "codex" ? "codex" : "github";
    return {
      label: category + "（" + agentName + "）",
      cls: cls,
      compact: it.changeType === "bug",
      major: it.changeType === "major",
    };
  }
  function buildVersionItem(it) {
    const li = document.createElement("li");
    const badge = versionBadgeInfo(it);
    li.className = "version-item version-item--" + badge.cls +
      (badge.compact ? " version-item--compact" : "") +
      (badge.major ? " version-item--major" : "");
    const titleAttr = it.createdAt ? new Date(it.createdAt).toLocaleString("ja-JP") : "";
    const summaryHtml = it.url
      ? '<a href="' + esc(it.url) + '" target="_blank" rel="noopener">' + esc(it.summary) + "</a>"
      : esc(it.summary);
    const detailHtml = (badge.major && it.detail)
      ? '<div class="version-item__detail">' + esc(it.detail) + "</div>"
      : "";
    li.innerHTML =
      '<div class="version-item__head">' +
        '<span class="version-item__badge">' + esc(badge.label) + "</span>" +
        '<span class="version-item__time" title="' + esc(titleAttr) + '">' + esc(fmtRelative(it.createdAt)) + "</span>" +
      "</div>" +
      '<div class="version-item__summary">・' + summaryHtml + "</div>" +
      detailHtml;
    return li;
  }
  // 月ごとの開閉状態を覚えておく（キー："年-月"）。30秒ごとの自動更新でリストを
  // 作り直しても、ユーザーが手動で開け閉めした状態を維持するために使う。
  // （これが無いと、開いた月が更新のたびに勝手に閉じてしまう。）
  const versionMonthOpen = {};
  async function loadVersionHistory() {
    const list = $("version-list");
    let data = null;
    try { data = await (await fetch("/api/admin/version-history")).json(); } catch (e) { data = null; }
    // 旧形式（配列）と新形式（{items, githubError}）の両方に対応。
    const items = Array.isArray(data) ? data : (data && data.items) || [];
    const githubError = Array.isArray(data) ? null : (data && data.githubError) || null;
    list.innerHTML = "";
    $("version-empty").hidden = items.length > 0;

    // GitHubの履歴が取得できなかったときは、その理由を上部に表示する
    // （サイトの情報更新ログだけになって「消えた」ように見えるのを防ぐ）。
    const errEl = $("version-github-error");
    if (errEl) { errEl.hidden = !githubError; errEl.textContent = githubError || ""; }

    // 月ごとにグループ化（新しい順を維持したまま、月が変わるところで区切る）
    const groups = [];
    let current = null;
    items.forEach((it) => {
      const d = it.createdAt ? new Date(it.createdAt) : null;
      const monthKey = d ? d.getFullYear() + "-" + d.getMonth() : "unknown";
      if (!current || current.key !== monthKey) {
        current = { key: monthKey, label: d ? d.getFullYear() + "年" + (d.getMonth() + 1) + "月" : "日付不明", items: [] };
        groups.push(current);
      }
      current.items.push(it);
    });

    // 月ごとに折りたためる（<details>）。開閉は手動。初回は今月（先頭）だけ開き、
    // 過去の月は閉じておく。一度ユーザーが操作した月は、その開閉状態を維持する
    // （自動更新で作り直しても勝手に閉じない）。
    groups.forEach((g, idx) => {
      const li = document.createElement("li");
      const details = document.createElement("details");
      details.className = "version-month-group";
      const isOpen = (g.key in versionMonthOpen) ? versionMonthOpen[g.key] : (idx === 0);
      details.open = isOpen;
      versionMonthOpen[g.key] = isOpen;
      const summary = document.createElement("summary");
      summary.className = "version-month-divider";
      summary.textContent = g.label + "（" + g.items.length + "件）";
      details.appendChild(summary);
      const ul = document.createElement("ul");
      ul.className = "version-month-items";
      g.items.forEach((it) => ul.appendChild(buildVersionItem(it)));
      details.appendChild(ul);
      // ユーザーが開け閉めしたら、その状態を覚える（次の自動更新でも維持する）。
      details.addEventListener("toggle", () => { versionMonthOpen[g.key] = details.open; });
      li.appendChild(details);
      list.appendChild(li);
    });
  }
  // タブを開いている間、30秒ごとに自動更新。タブを離れる／画面が非表示になったら止める。
  let versionTimer = null;
  function startVersionAutoRefresh() {
    stopVersionAutoRefresh();
    versionTimer = setInterval(() => {
      if (document.visibilityState === "visible") loadVersionHistory();
    }, 30000);
  }
  function stopVersionAutoRefresh() {
    if (versionTimer) { clearInterval(versionTimer); versionTimer = null; }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (versionTimer) loadVersionHistory();
    if (anOverviewTimer) loadAnalyticsOverview();
    if (anRealtimeTimer) loadAnalyticsRealtime();
  });

  /* ---------- ダッシュボードの初期化 ---------- */
  async function init() {
    await loadCategories();
    await loadWorks();
    refreshMessageBadge();
  }

  checkAuth();
})();
