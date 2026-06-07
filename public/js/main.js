/* =========================================================
   A. Kato — 公開サイトの動作
   ・サイト文章の反映
   ・ヒーローのスライド（作品画像）
   ・News / Works の取得・表示
   ・ライトボックス / お問い合わせ送信
   ========================================================= */

(function () {
  "use strict";

  const TRANSPARENT = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";

  function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function esc(s) { return (s == null ? "" : String(s)).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function escBr(s) { return esc(s).replace(/\n/g, "<br>"); }

  /* ---------- サイトの文章を反映（全ページ共通） ---------- */
  async function applyContent() {
    let c;
    try { c = await (await fetch("/api/content")).json(); } catch (e) { return; }
    document.querySelectorAll("[data-content]").forEach((node) => {
      const key = node.dataset.content;
      if (c[key] != null) node.innerHTML = escBr(c[key]);
    });
    document.querySelectorAll("[data-content-href]").forEach((node) => {
      const key = node.dataset.contentHref;
      if (c[key]) node.setAttribute("href", c[key]);
    });
  }
  applyContent();

  /* ---------- スクロールで出現 ---------- */
  let revealObserver;
  function observeReveals(scope) {
    if (!("IntersectionObserver" in window)) return;
    if (!revealObserver) {
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) { en.target.classList.add("is-visible"); revealObserver.unobserve(en.target); }
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    }
    (scope || document).querySelectorAll(".reveal:not(.is-visible)").forEach((n) => revealObserver.observe(n));
  }

  const categoriesCache = { list: [] };
  function categoryLabel(key) {
    const c = categoriesCache.list.find((x) => x.key === key);
    return c ? c.label : key;
  }
  function workMeta(w) {
    return [w.year, w.medium].filter(Boolean).join(" / ");
  }

  /* =========================================================
     ヒーローのスライド
     ========================================================= */
  async function initHero() {
    const carousel = document.getElementById("hero-carousel");
    const dotsWrap = document.getElementById("hero-dots");
    if (!carousel) return;

    let works = [];
    try { works = await (await fetch("/api/works")).json(); } catch (e) { works = []; }
    const images = works.filter((w) => w.image).map((w) => w.image).slice(0, 5);

    carousel.innerHTML = "";
    if (dotsWrap) dotsWrap.innerHTML = "";

    if (!images.length) {
      const slide = el("div", "hero__slide hero__slide--placeholder is-active");
      carousel.appendChild(slide);
      return;
    }

    const slides = images.map((src, i) => {
      const s = el("div", "hero__slide" + (i === 0 ? " is-active" : ""));
      s.style.backgroundImage = "url(\"" + src + "\")";
      carousel.appendChild(s);
      return s;
    });

    const dots = images.map((_, i) => {
      const d = el("button", "hero__dot" + (i === 0 ? " is-active" : ""));
      d.setAttribute("role", "tab");
      d.setAttribute("aria-label", (i + 1) + "枚目");
      d.addEventListener("click", () => go(i));
      if (dotsWrap) dotsWrap.appendChild(d);
      return d;
    });

    let idx = 0, timer;
    function go(n) {
      slides[idx].classList.remove("is-active");
      dots[idx].classList.remove("is-active");
      idx = (n + slides.length) % slides.length;
      slides[idx].classList.add("is-active");
      dots[idx].classList.add("is-active");
      restart();
    }
    function restart() {
      clearInterval(timer);
      if (slides.length > 1) timer = setInterval(() => go(idx + 1), 5500);
    }
    restart();
  }

  /* =========================================================
     News
     ========================================================= */
  async function initNews() {
    const list = document.getElementById("news-list");
    if (!list) return;
    let news = [];
    try { news = await (await fetch("/api/news")).json(); } catch (e) { news = []; }
    const empty = document.getElementById("news-empty");
    list.innerHTML = "";
    if (empty) empty.hidden = news.length > 0;

    news.slice(0, 6).forEach((n) => {
      const li = el("li", "news-item reveal");
      li.innerHTML =
        '<span class="news-item__date">' + esc(n.date || "") + "</span>" +
        '<span class="news-item__title">' + esc(n.title || "") + "</span>" +
        '<span class="news-item__arrow" aria-hidden="true">→</span>';
      list.appendChild(li);
    });
    observeReveals(list);
  }

  /* =========================================================
     Works
     ========================================================= */
  const gallery = document.getElementById("gallery");
  const filtersEl = document.querySelector(".filters");
  let currentList = [];
  let currentCategory = "all";

  if (gallery) {
    async function loadCategories() {
      try { categoriesCache.list = await (await fetch("/api/categories")).json(); }
      catch (e) { categoriesCache.list = []; }
      if (!filtersEl) return;
      filtersEl.innerHTML = "";
      const all = [{ key: "all", label: "すべて" }].concat(categoriesCache.list);
      all.forEach((c, i) => {
        const b = el("button", "filter" + (i === 0 ? " is-active" : ""));
        b.textContent = c.label;
        b.dataset.filter = c.key;
        b.setAttribute("role", "tab");
        b.addEventListener("click", () => {
          filtersEl.querySelectorAll(".filter").forEach((x) => x.classList.remove("is-active"));
          b.classList.add("is-active");
          currentCategory = c.key;
          loadWorks();
        });
        filtersEl.appendChild(b);
      });
    }

    async function loadWorks() {
      let works = [];
      try { works = await (await fetch("/api/works?category=" + encodeURIComponent(currentCategory))).json(); }
      catch (e) { works = []; }
      currentList = works;
      render(works);
    }

    function buildCard(work, index) {
      const card = el("article", "work-card reveal");
      card.dataset.index = index;
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", esc(work.title) + " を拡大表示");

      const frame = el("div", "work-card__frame");
      if (work.image) {
        const img = el("img");
        img.src = work.image; img.alt = esc(work.title); img.loading = "lazy";
        frame.appendChild(img);
      } else {
        const ph = el("div", "work-card__ph hero__slide--placeholder");
        frame.appendChild(ph);
      }

      const title = el("h3", "work-card__title");
      title.textContent = work.title;
      const meta = el("p", "work-card__meta");
      meta.textContent = workMeta(work);

      card.appendChild(frame);
      card.appendChild(title);
      card.appendChild(meta);
      return card;
    }

    function render(list) {
      gallery.innerHTML = "";
      if (!list.length) {
        const empty = el("p", "works-empty");
        empty.textContent = "作品はまだ登録されていません。";
        gallery.appendChild(empty);
        return;
      }
      list.forEach((w, i) => gallery.appendChild(buildCard(w, i)));
      observeReveals(gallery);
    }

    /* ライトボックス */
    const lightbox = document.getElementById("lightbox");
    const lbImage  = document.getElementById("lightbox-image");
    const lbTitle  = document.getElementById("lightbox-title");
    const lbMeta   = document.getElementById("lightbox-meta");
    const btnClose = lightbox.querySelector(".lightbox__close");
    const btnPrev  = lightbox.querySelector(".lightbox__nav--prev");
    const btnNext  = lightbox.querySelector(".lightbox__nav--next");
    let lbIndex = 0, lastFocused = null;

    function showLightbox(index) {
      const work = currentList[index];
      if (!work) return;
      lbIndex = index;
      if (work.image) {
        lbImage.src = work.image; lbImage.alt = esc(work.title);
        lbImage.classList.remove("lightbox__image--ph");
      } else {
        lbImage.src = TRANSPARENT; lbImage.alt = "";
        lbImage.classList.add("lightbox__image--ph");
      }
      lbTitle.textContent = work.title;
      lbMeta.textContent = [categoryLabel(work.category), workMeta(work)].filter(Boolean).join(" · ");
    }
    function openLightbox(index) {
      lastFocused = document.activeElement;
      showLightbox(index);
      lightbox.classList.add("is-open");
      lightbox.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      btnClose.focus();
    }
    function closeLightbox() {
      lightbox.classList.remove("is-open");
      lightbox.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      if (lastFocused) lastFocused.focus();
    }
    function step(dir) { const n = currentList.length; if (n) showLightbox((lbIndex + dir + n) % n); }

    gallery.addEventListener("click", (e) => {
      const card = e.target.closest(".work-card");
      if (card) openLightbox(Number(card.dataset.index));
    });
    gallery.addEventListener("keydown", (e) => {
      const card = e.target.closest(".work-card");
      if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openLightbox(Number(card.dataset.index)); }
    });
    btnClose.addEventListener("click", closeLightbox);
    btnPrev.addEventListener("click", () => step(-1));
    btnNext.addEventListener("click", () => step(1));
    lightbox.addEventListener("click", (e) => { if (e.target === lightbox) closeLightbox(); });
    document.addEventListener("keydown", (e) => {
      if (!lightbox.classList.contains("is-open")) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    });

    (async function () { await loadCategories(); await loadWorks(); })();
  }

  /* ---------- ヘッダーの状態（ヒーローの上 / スクロール後） ---------- */
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
      navToggle.setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
    });
    nav.addEventListener("click", (e) => {
      if (e.target.tagName === "A") { nav.classList.remove("is-open"); navToggle.setAttribute("aria-expanded", "false"); }
    });
  }

  /* ---------- お問い合わせ送信 ---------- */
  const form = document.getElementById("contact-form");
  const note = document.getElementById("form-note");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      note.classList.remove("is-error");
      if (!form.checkValidity()) { note.textContent = "すべての項目をご入力ください。"; note.classList.add("is-error"); form.reportValidity(); return; }
      note.textContent = "送信中…";
      try {
        const res = await fetch("/api/contact", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: form.name.value.trim(), email: form.email.value.trim(), message: form.message.value.trim() }),
        });
        const data = await res.json();
        if (res.ok && data.ok) { note.textContent = "メッセージをありがとうございます。折り返しご連絡いたします。"; form.reset(); }
        else { note.textContent = data.error || "送信に失敗しました。"; note.classList.add("is-error"); }
      } catch (err) { note.textContent = "通信エラーが発生しました。"; note.classList.add("is-error"); }
    });
  }

  /* ---------- フッターの年号 ---------- */
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- 起動 ---------- */
  initHero();
  initNews();
  observeReveals(document);
})();
