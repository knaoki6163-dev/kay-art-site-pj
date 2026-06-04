/* =========================================================
   Aquarelle — 水彩画ポートフォリオ（動的版・公開サイト）
   ・カテゴリと作品をサーバーAPIから取得して表示
   ・ライトボックスで拡大表示
   ・お問い合わせをサーバーに送信
   ========================================================= */

(function () {
  "use strict";

  const gallery = document.getElementById("gallery");
  const filtersEl = document.querySelector(".filters");
  let currentList = [];          // 現在表示中の作品（ライトボックス操作用）
  let currentCategory = "all";
  let categories = [];

  /* ---------- 小さなユーティリティ ---------- */
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

  function categoryLabel(key) {
    const c = categories.find((x) => x.key === key);
    return c ? c.label : key;
  }
  function metaText(work) {
    return [work.medium, work.year].filter(Boolean).join(" · ");
  }

  /* =========================================================
     ギャラリー（ギャラリーがあるページのみ動作）
     ========================================================= */
  if (gallery) {

    /* ---------- カテゴリのフィルターボタンを生成 ---------- */
    async function loadCategories() {
      try {
        const res = await fetch("/api/categories");
        categories = await res.json();
      } catch (e) { categories = []; }

      if (!filtersEl) return;
      filtersEl.innerHTML = "";
      const all = [{ key: "all", label: "すべて" }].concat(categories);
      all.forEach((c, i) => {
        const b = el("button", "filter" + (i === 0 ? " is-active" : ""));
        b.textContent = c.label;
        b.dataset.filter = c.key;
        b.setAttribute("role", "tab");
        b.setAttribute("aria-selected", i === 0 ? "true" : "false");
        b.addEventListener("click", () => {
          filtersEl.querySelectorAll(".filter").forEach((x) => {
            x.classList.remove("is-active"); x.setAttribute("aria-selected", "false");
          });
          b.classList.add("is-active"); b.setAttribute("aria-selected", "true");
          currentCategory = c.key;
          loadWorks();
        });
        filtersEl.appendChild(b);
      });
    }

    /* ---------- 作品を取得して描画 ---------- */
    async function loadWorks() {
      let works = [];
      try {
        const res = await fetch("/api/works?category=" + encodeURIComponent(currentCategory));
        works = await res.json();
      } catch (e) { works = []; }
      currentList = works;
      render(works);
    }

    function buildCard(work, index) {
      const card = el("article", "card");
      card.dataset.index = index;
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", esc(work.title) + " を拡大表示");

      let art;
      if (work.image) {
        art = el("img", "card__art");
        art.src = work.image;
        art.alt = esc(work.title);
        art.loading = "lazy";
      } else {
        art = el("div", "card__art card__art--placeholder");
        art.style.paddingBottom = "120%";
        art.style.background = "linear-gradient(150deg, var(--wash-1), var(--brown), var(--ink))";
      }

      const overlay = el("div", "card__overlay");
      overlay.innerHTML =
        '<span class="card__title">' + esc(work.title) + "</span>" +
        '<span class="card__meta">' + esc([categoryLabel(work.category), metaText(work)].filter(Boolean).join(" · ")) + "</span>";

      card.appendChild(art);
      card.appendChild(overlay);
      return card;
    }

    function render(list) {
      gallery.innerHTML = "";
      if (!list.length) {
        const empty = el("p", "gallery__empty");
        empty.textContent = "まだ作品が登録されていません。";
        gallery.appendChild(empty);
        return;
      }
      list.forEach((work, i) => gallery.appendChild(buildCard(work, i)));
      observeCards();
    }

    /* ---------- スクロールでふわっと表示 ---------- */
    let cardObserver;
    function observeCards() {
      if (cardObserver) cardObserver.disconnect();
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      cardObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const e = entry.target;
            const delay = reduce ? 0 : (Number(e.dataset.index) % 3) * 90;
            setTimeout(() => e.classList.add("is-visible"), delay);
            cardObserver.unobserve(e);
          }
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
      gallery.querySelectorAll(".card").forEach((c) => cardObserver.observe(c));
    }

    /* ---------- ライトボックス ---------- */
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
        lbImage.src = work.image;
        lbImage.alt = esc(work.title);
        lbImage.classList.remove("lightbox__image--ph");
        lbImage.style.background = "";
      } else {
        lbImage.removeAttribute("src");
        lbImage.classList.add("lightbox__image--ph");
        lbImage.style.background = "linear-gradient(150deg, var(--wash-1), var(--brown), var(--ink))";
      }
      lbTitle.textContent = work.title;
      lbMeta.textContent = [categoryLabel(work.category), metaText(work)].filter(Boolean).join(" · ");
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
    function step(dir) {
      const n = currentList.length;
      if (n) showLightbox((lbIndex + dir + n) % n);
    }

    gallery.addEventListener("click", (e) => {
      const card = e.target.closest(".card");
      if (card) openLightbox(Number(card.dataset.index));
    });
    gallery.addEventListener("keydown", (e) => {
      const card = e.target.closest(".card");
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

    /* ---------- 初期化 ---------- */
    (async function init() {
      await loadCategories();
      await loadWorks();
    })();
  } /* end if (gallery) */

  /* ---------- ヘッダー：スクロールで境界線 ---------- */
  const header = document.querySelector(".site-header");
  if (header) {
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 12);
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
      if (e.target.tagName === "A") {
        nav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- お問い合わせフォーム（サーバーに送信） ---------- */
  const form = document.getElementById("contact-form");
  const note = document.getElementById("form-note");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      note.classList.remove("is-error");
      if (!form.checkValidity()) {
        note.textContent = "すべての項目をご入力ください。";
        note.classList.add("is-error");
        form.reportValidity();
        return;
      }
      const payload = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        message: form.message.value.trim(),
      };
      note.textContent = "送信中…";
      try {
        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          note.textContent = "メッセージをありがとうございます。折り返しご連絡いたします。";
          form.reset();
        } else {
          note.textContent = data.error || "送信に失敗しました。時間をおいてお試しください。";
          note.classList.add("is-error");
        }
      } catch (err) {
        note.textContent = "通信エラーが発生しました。時間をおいてお試しください。";
        note.classList.add("is-error");
      }
    });
  }

  /* ---------- フッターの年号 ---------- */
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
