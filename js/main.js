/* =========================================================
   Aquarelle — 水彩画ポートフォリオ
   ギャラリー生成・フィルタリング・ライトボックス・各種演出
   ========================================================= */

(function () {
  "use strict";

  /* -------------------------------------------------------
     作品データ
     画像を追加する場合は src に画像パス（例: "images/works/01.jpg"）を
     指定してください。src が無い作品は水彩風のグラデーションで表示されます。
  -------------------------------------------------------- */
  const works = [
    { title: "朝靄の湖",       cat: "landscape", year: "2024", medium: "透明水彩 / 300×400mm", grad: "linear-gradient(150deg,#a9c4d4,#cfe0e6,#e9d9c0)", h: 1.3 },
    { title: "椿",             cat: "flower",    year: "2023", medium: "透明水彩 / 250×250mm", grad: "radial-gradient(circle at 40% 35%,#e7b4ae,#9a5b53 80%)", h: 1.0 },
    { title: "雨上がりの路地",  cat: "cityscape", year: "2024", medium: "透明水彩 / 280×380mm", grad: "linear-gradient(135deg,#b7c8a9,#8aa1ad,#5d574e)", h: 1.4 },
    { title: "白い器とレモン",  cat: "still",     year: "2022", medium: "透明水彩 / 230×300mm", grad: "linear-gradient(160deg,#f3ead2,#e3c98c,#b7c8a9)", h: 1.1 },
    { title: "夕暮れの丘",      cat: "landscape", year: "2023", medium: "透明水彩 / 320×420mm", grad: "linear-gradient(150deg,#e3c98c,#e7b4ae,#9a5b53)", h: 1.25 },
    { title: "紫陽花",          cat: "flower",    year: "2024", medium: "透明水彩 / 260×260mm", grad: "radial-gradient(circle at 60% 40%,#a9c4d4,#8a7fae 85%)", h: 0.95 },
    { title: "水辺のカフェ",    cat: "cityscape", year: "2022", medium: "透明水彩 / 300×400mm", grad: "linear-gradient(135deg,#cfe0e6,#e7b4ae,#e3c98c)", h: 1.35 },
    { title: "野の花束",        cat: "still",     year: "2023", medium: "透明水彩 / 240×320mm", grad: "linear-gradient(160deg,#b7c8a9,#e3c98c,#e7b4ae)", h: 1.15 },
    { title: "霧の森",          cat: "landscape", year: "2024", medium: "透明水彩 / 340×420mm", grad: "linear-gradient(150deg,#b7c8a9,#a9c4d4,#5d574e)", h: 1.45 },
    { title: "薔薇一輪",        cat: "flower",    year: "2022", medium: "透明水彩 / 220×220mm", grad: "radial-gradient(circle at 45% 40%,#e7b4ae,#9a5b53)", h: 0.9 },
    { title: "古い港町",        cat: "cityscape", year: "2023", medium: "透明水彩 / 310×410mm", grad: "linear-gradient(135deg,#e3c98c,#a9c4d4,#5d574e)", h: 1.3 },
    { title: "窓辺の静物",      cat: "still",     year: "2024", medium: "透明水彩 / 250×330mm", grad: "linear-gradient(160deg,#cfe0e6,#e3c98c,#e7b4ae)", h: 1.2 },
  ];

  const gallery = document.getElementById("gallery");
  let currentList = works.slice();   // ライトボックスのナビゲーション用（フィルタ後の表示順）

  /* ---------- カードを生成 ---------- */
  function buildCard(work, index) {
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.cat = work.cat;
    card.dataset.index = index;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `${work.title}（${work.year}）を拡大表示`);

    const art = document.createElement("div");
    art.className = "card__art";
    // padding-bottom で縦横比を再現（メーソンリーらしい高さの違い）
    art.style.paddingBottom = (work.h * 100) + "%";
    if (work.src) {
      art.style.backgroundImage = `url("${work.src}")`;
      art.style.backgroundSize = "cover";
      art.style.backgroundPosition = "center";
    } else {
      art.style.background = work.grad;
    }

    const overlay = document.createElement("div");
    overlay.className = "card__overlay";
    overlay.innerHTML =
      `<span class="card__title">${work.title}</span>` +
      `<span class="card__meta">${work.medium} · ${work.year}</span>`;

    card.appendChild(art);
    card.appendChild(overlay);
    return card;
  }

  function render(list) {
    gallery.innerHTML = "";
    currentList = list;
    list.forEach((work, i) => {
      const card = buildCard(work, i);
      gallery.appendChild(card);
    });
    observeCards();
  }

  /* ---------- スクロールでふわっと表示 ---------- */
  let cardObserver;
  function observeCards() {
    if (cardObserver) cardObserver.disconnect();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    cardObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry, idx) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const delay = reduce ? 0 : (Number(el.dataset.index) % 3) * 90;
          setTimeout(() => el.classList.add("is-visible"), delay);
          cardObserver.unobserve(el);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".card").forEach((c) => cardObserver.observe(c));
  }

  /* ---------- フィルター ---------- */
  const filters = document.querySelectorAll(".filter");
  filters.forEach((btn) => {
    btn.addEventListener("click", () => {
      filters.forEach((b) => { b.classList.remove("is-active"); b.setAttribute("aria-selected", "false"); });
      btn.classList.add("is-active");
      btn.setAttribute("aria-selected", "true");
      const f = btn.dataset.filter;
      render(f === "all" ? works.slice() : works.filter((w) => w.cat === f));
    });
  });

  /* ---------- ライトボックス ---------- */
  const lightbox     = document.getElementById("lightbox");
  const lbImage      = document.getElementById("lightbox-image");
  const lbTitle      = document.getElementById("lightbox-title");
  const lbMeta       = document.getElementById("lightbox-meta");
  const btnClose     = lightbox.querySelector(".lightbox__close");
  const btnPrev      = lightbox.querySelector(".lightbox__nav--prev");
  const btnNext      = lightbox.querySelector(".lightbox__nav--next");
  let lbIndex = 0;
  let lastFocused = null;

  function showLightbox(index) {
    const work = currentList[index];
    if (!work) return;
    lbIndex = index;
    if (work.src) {
      lbImage.style.backgroundImage = `url("${work.src}")`;
      lbImage.style.backgroundSize = "cover";
      lbImage.style.backgroundPosition = "center";
    } else {
      lbImage.style.background = work.grad;
    }
    lbTitle.textContent = work.title;
    lbMeta.textContent = `${work.medium} · ${work.year}`;
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
    showLightbox((lbIndex + dir + n) % n);
  }

  // カードクリック / キーボード操作
  gallery.addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (card) openLightbox(Number(card.dataset.index));
  });
  gallery.addEventListener("keydown", (e) => {
    const card = e.target.closest(".card");
    if (card && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openLightbox(Number(card.dataset.index));
    }
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

  /* ---------- ヘッダー：スクロールで境界線 ---------- */
  const header = document.querySelector(".site-header");
  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 12);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- モバイルナビ ---------- */
  const navToggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".nav");
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

  /* ---------- お問い合わせフォーム（デモ：送信を模擬） ---------- */
  const form = document.getElementById("contact-form");
  const note = document.getElementById("form-note");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      note.textContent = "すべての項目をご入力ください。";
      form.reportValidity();
      return;
    }
    note.textContent = "メッセージをありがとうございます。折り返しご連絡いたします。";
    form.reset();
  });

  /* ---------- フッターの年号 ---------- */
  document.getElementById("year").textContent = new Date().getFullYear();

  /* ---------- 初期描画 ---------- */
  render(works.slice());
})();
