/* =========================================================
   A. Kato — 公開サイトの動作（多言語対応）
   ・言語切替（日本語 / English）
   ・サイト文章の反映（言語別）
   ・ヒーローのスライド / Works / ライトボックス / お問い合わせ
   ========================================================= */

(function () {
  "use strict";

  const LANGS = ["ja", "en"];
  const TRANSPARENT = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";

  /* ---------- UIラベルの翻訳辞書 ---------- */
  const I18N = {
    ja: {
      "nav.home": "ホーム", "nav.works": "作品", "nav.about": "アーティスト", "nav.contact": "お問い合わせ",
      "form.name": "お名前", "form.email": "メールアドレス", "form.message": "メッセージ", "form.send": "送信",
      "filter.all": "全て", "works.empty": "作品はまだ登録されていません。",
      "info.empty": "お知らせはまだありません。", "blog.empty": "記事はまだありません。",
      "form.confirm": "この内容で送信しますか？",
      "form.required": "すべての項目をご入力ください。", "form.sending": "送信中…",
      "form.thanks": "メッセージをありがとうございます。折り返しご連絡いたします。",
      "form.fail": "送信に失敗しました。時間をおいてお試しください。", "form.neterr": "通信エラーが発生しました。時間をおいてお試しください。",
      "cat.nature": "自然", "cat.life": "日常", "cat.concept": "抽象",
    },
    en: {
      "nav.home": "Home", "nav.works": "Works", "nav.about": "About", "nav.contact": "Contact",
      "form.name": "Name", "form.email": "Email", "form.message": "Message", "form.send": "Send",
      "filter.all": "All", "works.empty": "No works have been added yet.",
      "info.empty": "No updates yet.", "blog.empty": "No posts yet.",
      "form.confirm": "Send this message?",
      "form.required": "Please fill in all fields.", "form.sending": "Sending…",
      "form.thanks": "Thank you for your message. I'll get back to you soon.",
      "form.fail": "Failed to send. Please try again later.", "form.neterr": "A network error occurred. Please try again later.",
      "cat.nature": "Nature", "cat.life": "Life", "cat.concept": "Concept",
    },
  };

  let lang = localStorage.getItem("siteLang");
  if (LANGS.indexOf(lang) === -1) lang = "ja";

  function t(key) { return (I18N[lang] && I18N[lang][key]) || I18N.ja[key] || key; }
  function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function esc(s) { return (s == null ? "" : String(s)).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function escBr(s) { return esc(s).replace(/\n/g, "<br>"); }

  /* ---------- 固定UIラベルの反映 ---------- */
  function applyI18n() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
  }

  /* ---------- 編集可能な文章の反映（言語別） ---------- */
  async function applyContent() {
    let c;
    try { c = await (await fetch("/api/content?lang=" + lang)).json(); } catch (e) { return; }
    document.querySelectorAll("[data-content]").forEach((node) => {
      const key = node.dataset.content;
      if (c[key] != null) node.innerHTML = escBr(c[key]);
    });
    document.querySelectorAll("[data-content-href]").forEach((node) => {
      const key = node.dataset.contentHref;
      if (c[key]) node.setAttribute("href", c[key]);
    });
    // フッターのInstagramリンクの表示/非表示（管理画面で切替）。
    // 非表示のときは SNS 行ごと消して、フッター上部に空白バンドが残らないようにする。
    const hideIg = (c.instagramVisible === "false");
    const ig = document.querySelector('.footer-social [data-content-href="instagramUrl"]');
    const social = document.querySelector(".footer-social");
    if (ig) ig.style.display = hideIg ? "none" : "";
    // 非表示時はサーバーが <style> を注入済み。表示時はそれに勝つよう flex を明示。
    if (social) social.style.display = hideIg ? "none" : "flex";
  }

  function categoryLabel(key) {
    if (!key) return "";
    const tr = t("cat." + key);
    if (tr !== "cat." + key) return tr;
    const c = categoriesCache.list.find((x) => x.key === key);
    return c ? c.label : key;
  }
  function workMeta(w) {
    const technique = w.technique || w.medium || ""; // 旧データ(medium)へのフォールバック
    const status = w.status && w.status !== "Available" ? w.status : ""; // Available は表示しない
    return [w.year, technique, w.size, status].filter(Boolean).join(" / ");
  }

  const categoriesCache = { list: [] };

  /* ---------- スクロールで出現 ---------- */
  let revealObserver;
  function observeReveals(scope) {
    if (!("IntersectionObserver" in window)) return;
    if (!revealObserver) {
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-visible"); revealObserver.unobserve(en.target); } });
      }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    }
    (scope || document).querySelectorAll(".reveal:not(.is-visible)").forEach((n) => revealObserver.observe(n));
  }

  /* ---------- ヒーローのスライド ---------- */
  async function initHero() {
    const carousel = document.getElementById("hero-carousel");
    const dotsWrap = document.getElementById("hero-dots");
    if (!carousel) return;
    let works = [];
    // ヒーローは「トップに表示」に設定された作品のみ
    try { works = await (await fetch("/api/works?featured=1")).json(); } catch (e) { works = []; }
    const images = works.filter((w) => w.image).map((w) => w.image).slice(0, 5);
    carousel.innerHTML = "";
    if (dotsWrap) dotsWrap.innerHTML = "";
    if (!images.length) { carousel.appendChild(el("div", "hero__slide hero__slide--placeholder is-active")); return; }

    const slides = images.map((src, i) => {
      const s = el("div", "hero__slide" + (i === 0 ? " is-active" : ""));
      s.style.backgroundImage = "url(\"" + src + "\")";
      carousel.appendChild(s); return s;
    });
    const dots = images.map((_, i) => {
      const d = el("button", "hero__dot" + (i === 0 ? " is-active" : ""));
      d.setAttribute("aria-label", (i + 1)); d.addEventListener("click", () => go(i));
      if (dotsWrap) dotsWrap.appendChild(d); return d;
    });
    let idx = 0, timer;
    function go(n) {
      slides[idx].classList.remove("is-active"); dots[idx].classList.remove("is-active");
      idx = (n + slides.length) % slides.length;
      slides[idx].classList.add("is-active"); dots[idx].classList.add("is-active"); restart();
    }
    function restart() { clearInterval(timer); if (slides.length > 1) timer = setInterval(() => go(idx + 1), 5500); }
    restart();
  }

  /* ---------- Info（お知らせ） ---------- */
  async function initInfo() {
    const list = document.getElementById("news-list");
    if (!list) return;
    let news = [];
    try { news = await (await fetch("/api/news")).json(); } catch (e) { news = []; }
    const empty = document.getElementById("news-empty");
    list.innerHTML = "";
    if (empty) { empty.hidden = news.length > 0; empty.textContent = t("info.empty"); }
    news.slice(0, 100).forEach((n) => {
      const li = el("li", "news-item reveal");
      li.innerHTML =
        '<span class="news-item__date">' + esc(n.date || "") + "</span>" +
        '<span class="news-item__title">' + esc(n.title || "") + "</span>";
      list.appendChild(li);
    });
    observeReveals(list);
  }

  /* ---------- Blog ---------- */
  async function initBlog() {
    const list = document.getElementById("blog-list");
    if (!list) return;
    let posts = [];
    try { posts = await (await fetch("/api/blog")).json(); } catch (e) { posts = []; }
    const empty = document.getElementById("blog-empty");
    list.innerHTML = "";
    if (empty) { empty.hidden = posts.length > 0; empty.textContent = t("blog.empty"); }
    posts.slice(0, 100).forEach((p) => {
      const art = el("article", "blog-post reveal");
      art.innerHTML =
        '<div class="blog-post__head">' +
          (p.date ? '<span class="blog-post__date">' + esc(p.date) + "</span>" : "") +
          '<h3 class="blog-post__title">' + esc(p.title || "") + "</h3>" +
        "</div>" +
        (p.body ? '<p class="blog-post__body">' + esc(p.body).replace(/\n/g, "<br />") + "</p>" : "");
      list.appendChild(art);
    });
    observeReveals(list);
  }

  /* ---------- Works ---------- */
  const gallery = document.getElementById("gallery");
  const filtersEl = document.querySelector(".filters");
  let currentList = [];
  let currentCategory = "all";

  async function loadCategories() {
    if (!gallery || !filtersEl) return;
    try { categoriesCache.list = await (await fetch("/api/categories")).json(); } catch (e) { categoriesCache.list = []; }
    filtersEl.innerHTML = "";
    const all = [{ key: "all", label: t("filter.all") }].concat(categoriesCache.list);
    all.forEach((c, i) => {
      const active = c.key === currentCategory || (i === 0 && currentCategory === "all");
      const b = el("button", "filter" + (active ? " is-active" : ""));
      b.textContent = c.key === "all" ? t("filter.all") : categoryLabel(c.key);
      b.dataset.filter = c.key;
      b.addEventListener("click", () => {
        filtersEl.querySelectorAll(".filter").forEach((x) => x.classList.remove("is-active"));
        b.classList.add("is-active"); currentCategory = c.key; loadWorks();
      });
      filtersEl.appendChild(b);
    });
  }

  async function loadWorks() {
    if (!gallery) return;
    let works = [];
    // トップ（data-featured="1"）では「トップに表示」の作品のみを対象にする
    let url = "/api/works?category=" + encodeURIComponent(currentCategory);
    if (gallery.dataset.featured === "1") url += "&featured=1";
    try { works = await (await fetch(url)).json(); } catch (e) { works = []; }
    const limit = parseInt(gallery.dataset.preview || "0", 10); // トップのプレビューは件数制限
    if (limit > 0) works = works.slice(0, limit);
    currentList = works;
    gallery.innerHTML = "";
    if (!works.length) {
      const empty = el("p", "works-empty"); empty.textContent = t("works.empty"); gallery.appendChild(empty); return;
    }
    works.forEach((w, i) => gallery.appendChild(buildCard(w, i)));
    observeReveals(gallery);
  }

  function buildCard(work, index) {
    const card = el("article", "work-card reveal");
    card.dataset.index = index; card.tabIndex = 0; card.setAttribute("role", "button");
    card.setAttribute("aria-label", esc(work.title));
    const frame = el("div", "work-card__frame");
    if (work.image) {
      const img = el("img"); img.src = work.image; img.alt = esc(work.title); img.loading = "lazy"; frame.appendChild(img);
    } else { frame.appendChild(el("div", "work-card__ph hero__slide--placeholder")); }
    const title = el("h3", "work-card__title"); title.textContent = work.title;
    const meta = el("p", "work-card__meta"); meta.textContent = workMeta(work);
    card.appendChild(frame); card.appendChild(title); card.appendChild(meta);
    return card;
  }

  /* ライトボックス */
  if (gallery) {
    const lightbox = document.getElementById("lightbox");
    const lbImage = document.getElementById("lightbox-image");
    const lbTitle = document.getElementById("lightbox-title");
    const lbMeta = document.getElementById("lightbox-meta");
    const btnClose = lightbox.querySelector(".lightbox__close");
    const btnPrev = lightbox.querySelector(".lightbox__nav--prev");
    const btnNext = lightbox.querySelector(".lightbox__nav--next");
    let lbIndex = 0, lastFocused = null, lbHideTimer = null;

    function showLightbox(index) {
      const work = currentList[index]; if (!work) return; lbIndex = index;
      if (work.image) { lbImage.src = work.image; lbImage.alt = esc(work.title); lbImage.classList.remove("lightbox__image--ph"); }
      else { lbImage.src = TRANSPARENT; lbImage.alt = ""; lbImage.classList.add("lightbox__image--ph"); }
      lbTitle.textContent = work.title;
      lbMeta.textContent = [categoryLabel(work.category), workMeta(work)].filter(Boolean).join(" · ");
    }
    function openLightbox(index) {
      lastFocused = document.activeElement; showLightbox(index);
      // 閉じている間は display:none（hidden属性）でレイアウトから外しているため、
      // 先に表示してからリフロー → クラス付与でフェードを効かせる
      clearTimeout(lbHideTimer);
      lightbox.hidden = false; void lightbox.offsetWidth;
      lightbox.classList.add("is-open"); lightbox.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden"; btnClose.focus();
    }
    function closeLightbox() {
      lightbox.classList.remove("is-open"); lightbox.setAttribute("aria-hidden", "true");
      document.body.style.overflow = ""; if (lastFocused) lastFocused.focus();
      // フェードアウト後にレイアウトから外す（iOSでフッター下に余白が出るのを防ぐ）
      clearTimeout(lbHideTimer);
      lbHideTimer = setTimeout(() => { lightbox.hidden = true; }, 500);
    }
    function stepLb(dir) { const n = currentList.length; if (n) showLightbox((lbIndex + dir + n) % n); }

    gallery.addEventListener("click", (e) => { const c = e.target.closest(".work-card"); if (c) openLightbox(Number(c.dataset.index)); });
    gallery.addEventListener("keydown", (e) => { const c = e.target.closest(".work-card"); if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openLightbox(Number(c.dataset.index)); } });
    btnClose.addEventListener("click", closeLightbox);
    btnPrev.addEventListener("click", () => stepLb(-1));
    btnNext.addEventListener("click", () => stepLb(1));
    lightbox.addEventListener("click", (e) => { if (e.target === lightbox) closeLightbox(); });
    document.addEventListener("keydown", (e) => {
      if (!lightbox.classList.contains("is-open")) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") stepLb(-1);
      if (e.key === "ArrowRight") stepLb(1);
    });
  }

  /* ---------- ヘッダーの状態 ---------- */
  const header = document.querySelector(".site-header");
  const hero = document.getElementById("hero");
  if (header) {
    const onScroll = () => {
      const threshold = hero ? hero.offsetHeight - 80 : 10;
      const scrolled = window.scrollY > threshold;
      header.classList.toggle("is-scrolled", scrolled);
      header.classList.toggle("is-over-hero", !!hero && !scrolled);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- モバイルナビ ---------- */
  const navToggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".nav");
  if (navToggle && nav) {
    navToggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", (e) => { if (e.target.tagName === "A") { nav.classList.remove("is-open"); navToggle.setAttribute("aria-expanded", "false"); } });

    // 現在開いているページのリンクをハイライト
    const norm = (p) => (p.replace(/index\.html$/, "").replace(/\/$/, "") || "/");
    const here = norm(location.pathname);
    nav.querySelectorAll("a").forEach((a) => {
      if (norm(new URL(a.href, location.origin).pathname) === here) {
        a.setAttribute("aria-current", "page");
      }
    });
  }

  /* ---------- お問い合わせ送信 ---------- */
  const form = document.getElementById("contact-form");
  const note = document.getElementById("form-note");
  if (form) {
    // 入力内容の一時保存：別ページへ移動・ページ更新しても消えないようにする
    const DRAFT_KEY = "contactDraft";
    const draftFields = ["name", "email", "message"];
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
      draftFields.forEach((k) => { if (form[k] && saved[k] != null) form[k].value = saved[k]; });
    } catch (e) {}
    const saveDraft = () => {
      try {
        const d = {};
        draftFields.forEach((k) => { if (form[k]) d[k] = form[k].value; });
        localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
      } catch (e) {}
    };
    draftFields.forEach((k) => { if (form[k]) form[k].addEventListener("input", saveDraft); });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      note.classList.remove("is-error");
      if (!form.checkValidity()) { note.textContent = t("form.required"); note.classList.add("is-error"); form.reportValidity(); return; }
      if (!window.confirm(t("form.confirm"))) return; // 送信前の確認ポップアップ
      note.textContent = t("form.sending");
      try {
        const res = await fetch("/api/contact", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: form.name.value.trim(), email: form.email.value.trim(), message: form.message.value.trim() }),
        });
        const data = await res.json();
        if (res.ok && data.ok) { note.textContent = t("form.thanks"); form.reset(); try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} }
        else { note.textContent = data.error || t("form.fail"); note.classList.add("is-error"); }
      } catch (err) { note.textContent = t("form.neterr"); note.classList.add("is-error"); }
    });
  }

  /* ---------- フッターの年号 ---------- */
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- 言語切替 ---------- */
  async function refreshLanguage() {
    applyI18n();
    await applyContent();
    if (gallery) { await loadCategories(); await loadWorks(); }
    initInfo();
    initBlog();
  }

  const langSelect = document.getElementById("lang-select");
  if (langSelect) {
    langSelect.value = lang;
    langSelect.addEventListener("change", () => {
      lang = LANGS.indexOf(langSelect.value) !== -1 ? langSelect.value : "ja";
      localStorage.setItem("siteLang", lang);
      refreshLanguage();
    });
  }

  /* ---------- 起動 ---------- */
  applyI18n();
  applyContent();
  initHero();
  if (gallery) { (async function () { await loadCategories(); await loadWorks(); })(); }
  initInfo();
  initBlog();
  observeReveals(document);
})();
