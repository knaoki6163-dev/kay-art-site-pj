/* =========================================================
   Google Analytics 4 (GA4) 共通読み込みファイル
   ---------------------------------------------------------
   ・測定IDはこのファイルの GA_MEASUREMENT_ID 1か所だけで管理します。
   ・各 HTML ページの <head> から
        <script src="js/analytics.js"></script>
     を読み込むだけで、全ページに同じ計測タグが入ります。
   ・IDを変えたいときは下の1行を書き換えるだけでOKです。
   ========================================================= */

(function () {
  "use strict";

  // ▼▼ 測定ID（ここだけ変えれば全ページに反映されます） ▼▼
  var GA_MEASUREMENT_ID = "G-5287MMJTJJ";
  // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

  // ローカル確認時（file:// で開いた場合）は計測しない（任意の安全策）
  if (location.protocol === "file:") return;

  // 1) Googleのタグ本体(gtag.js)を読み込む
  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_MEASUREMENT_ID;
  document.head.appendChild(s);

  // 2) gtag の初期化
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag("js", new Date());

  // 3) 計測設定（プライバシーに配慮した設定を有効化）
  gtag("config", GA_MEASUREMENT_ID, {
    // IPの匿名化。※GA4では既定でIPは保存されませんが、明示しておきます。
    anonymize_ip: true,
    // Google広告向けのシグナル連携は行わない（解析のみに限定）
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });
})();
