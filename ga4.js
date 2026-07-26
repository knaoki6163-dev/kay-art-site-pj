/* =========================================================
   Google Analytics 4 (GA4) Data API 連携
   ---------------------------------------------------------
   管理画面の「アクセス解析」タブに表示する実データを、GA4の
   Data API（REST）から取得します。

   必要な環境変数：
   ・GA4_PROPERTY_ID        … GA4 プロパティID（数字のみ。測定ID "G-xxxx" とは別物）
   ・GA4_SERVICE_ACCOUNT_JSON … サービスアカウントの鍵ファイル（JSON）の中身をそのまま
                                （または base64 エンコードしたもの）
   どちらか一方でも未設定の場合は `enabled = false` となり、呼び出し元は
   「未設定」として扱います（サーバーは落ちません）。

   詳しいセットアップ手順は DEPLOY.md を参照してください。
   ========================================================= */

const { GoogleAuth } = require("google-auth-library");

const GA4_PROPERTY_ID = (process.env.GA4_PROPERTY_ID || "").trim();

function loadCredentials() {
  const raw = process.env.GA4_SERVICE_ACCOUNT_JSON || "";
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    // 改行を含むJSONを1行の環境変数に入れられない環境向けに base64 も許容する
    try {
      return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    } catch (e2) {
      console.error("⚠ GA4_SERVICE_ACCOUNT_JSON の解析に失敗しました。JSONそのまま、またはbase64で設定してください。");
      return null;
    }
  }
}
const credentials = loadCredentials();

const enabled = !!(GA4_PROPERTY_ID && credentials);
if (!enabled) {
  console.warn("⚠ GA4未設定：GA4_PROPERTY_ID / GA4_SERVICE_ACCOUNT_JSON を設定するとアクセス解析が有効になります。");
}

const auth = enabled
  ? new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/analytics.readonly"] })
  : null;
let clientPromise = null;
function getClient() {
  if (!clientPromise) clientPromise = auth.getClient();
  return clientPromise;
}

const API_BASE = "https://analyticsdata.googleapis.com/v1beta";

async function callApi(method, body) {
  const client = await getClient();
  const res = await client.request({
    url: API_BASE + "/properties/" + GA4_PROPERTY_ID + ":" + method,
    method: "POST",
    data: body,
  });
  return res.data;
}
const runReport = (body) => callApi("runReport", body);
const runRealtimeReport = (body) => callApi("runRealtimeReport", body);

/* ----- 数値取り出しの補助 ----- */
function num(row, i) {
  return row && row.metricValues && row.metricValues[i] ? Number(row.metricValues[i].value) || 0 : 0;
}
function dim(row, i) {
  return row && row.dimensionValues && row.dimensionValues[i] ? row.dimensionValues[i].value : "";
}

/* ----- 簡易キャッシュ（同時アクセス時に同じレポートを何度も叩かないため） ----- */
const cacheStore = new Map();
function cached(key, ttlMs, fn) {
  const now = Date.now();
  const hit = cacheStore.get(key);
  if (hit && now - hit.at < ttlMs) return hit.promise;
  const promise = Promise.resolve().then(fn).catch((e) => { cacheStore.delete(key); throw e; });
  cacheStore.set(key, { at: now, promise });
  return promise;
}

/* =========================================================
   個別レポート
   ========================================================= */

// 合計値（総訪問者数・平均滞在時間・エンゲージメント率）。
// 訪問者数は本日/前日、滞在時間とエンゲージメント率は直近28日/その前28日で比較する
// （1日単位だとサンプルが少なすぎて数値が暴れるため）。
async function fetchTotalsFor(dateRange) {
  const data = await runReport({
    dateRanges: [dateRange],
    metrics: [{ name: "activeUsers" }, { name: "averageSessionDuration" }, { name: "engagementRate" }],
  });
  const row = data.rows && data.rows[0];
  return {
    visitors: Math.round(num(row, 0)),
    avgSecs: Math.round(num(row, 1)),
    engage: +(num(row, 2) * 100).toFixed(1),
  };
}
function fetchTotals() {
  return cached("totals", 45_000, async () => {
    const [today, yesterday, cur28, prev28] = await Promise.all([
      fetchTotalsFor({ startDate: "today", endDate: "today" }),
      fetchTotalsFor({ startDate: "yesterday", endDate: "yesterday" }),
      fetchTotalsFor({ startDate: "27daysAgo", endDate: "today" }),
      fetchTotalsFor({ startDate: "55daysAgo", endDate: "28daysAgo" }),
    ]);
    const pct = (cur, prev) => (prev > 0 ? +(((cur - prev) / prev) * 100).toFixed(1) : null);
    return {
      visitors: today.visitors,
      dVisitorsPct: pct(today.visitors, yesterday.visitors),
      avgSecs: cur28.avgSecs,
      dAvgSecs: cur28.avgSecs - prev28.avgSecs,
      engage: cur28.engage,
      dEngage: +(cur28.engage - prev28.engage).toFixed(1),
    };
  });
}

// 訪問者数の推移（折れ線グラフ用）。期間切替に対応：
//   24h … 時間単位・直近24時間（従来どおり）
//   7d / 28d / 90d … 日単位。keepEmptyRows でアクセス0の日も行として
//   返させ、日付の抜けでグラフの時間軸が縮まないようにする。
const TREND_PERIODS = { "24h": 1, "7d": 7, "28d": 28, "90d": 90 };
function fetchTrend(period) {
  period = TREND_PERIODS[period] ? period : "24h";
  return cached("trend:" + period, 45_000, async () => {
    if (period === "24h") {
      const data = await runReport({
        dateRanges: [{ startDate: "2daysAgo", endDate: "today" }],
        dimensions: [{ name: "dateHour" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ dimension: { dimensionName: "dateHour" }, desc: false }],
      });
      const rows = (data.rows || []).map((r) => ({ hour: dim(r, 0), value: Math.round(num(r, 0)) }));
      return rows.slice(-24);
    }
    const days = TREND_PERIODS[period];
    const data = await runReport({
      dateRanges: [{ startDate: (days - 1) + "daysAgo", endDate: "today" }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ dimension: { dimensionName: "date" }, desc: false }],
      keepEmptyRows: true,
      limit: 400,
    });
    return (data.rows || []).map((r) => ({ day: dim(r, 0), value: Math.round(num(r, 0)) }));
  });
}

// 流入元の詳細（instagram.com / google / URL直接 … の実名）。
// よく知られたソースは日本語/サービス名に寄せ、Instagram系のドメイン違いは1つに束ねる。
// リファラースパム（ゴーストスパム）は「スパムボット」に集約し、個別のURLは表示しない。
// 判定は「スパムがよく使う安価なTLD＋手口キーワード＋既知の常連ドメイン」の3段構え。
// 上位5＋その他 を積み上げ棒グラフ用に割合で返す（スパムは上位に混ぜず最後に足す）。
const SPAM_TLD_RE = /\.(space|store|icu|top|xyz|club|online|fun|website|site|buzz|win|rest|cyou|sbs|pw|quest|lol)$/;
const SPAM_WORD_RE = /(seo|traffic|backlink|aisearch|search.?index|share.?button|buttons?.?for|dollars|money|crawl|spider|audit|rank(ing)?s?[-.]|bot[-.]|[-.]bot)/;
const SPAM_KNOWN = ["semalt.com", "darodar.com", "event-tracking.com", "sitevaluation.org", "uptimebot.net", "uptime.com"];
function isSpamSource(s) {
  return SPAM_TLD_RE.test(s) || SPAM_WORD_RE.test(s) || SPAM_KNOWN.includes(s);
}
function sourceLabel(src) {
  const s = (src || "").toLowerCase();
  if (s === "(direct)" || s === "(not set)") return "URL直接";
  if (s.includes("instagram")) return "Instagram";
  if (s === "google" || s === "google.com") return "Google検索";
  if (s.includes("yahoo")) return "Yahoo!";
  if (s === "t.co" || s === "twitter.com" || s === "x.com") return "X（旧Twitter）";
  if (s.includes("bing")) return "Bing";
  if (s.includes("facebook") || s === "m.facebook.com" || s === "fb.me") return "Facebook";
  if (s.includes("pinterest")) return "Pinterest";
  if (isSpamSource(s)) return "スパムボット";
  return src;
}
function fetchTraffic() {
  return cached("traffic", 45_000, async () => {
    const data = await runReport({
      dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
      dimensions: [{ name: "sessionSource" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 50,
    });
    const byLabel = new Map();
    (data.rows || []).forEach((r) => {
      const label = sourceLabel(dim(r, 0));
      byLabel.set(label, (byLabel.get(label) || 0) + num(r, 0));
    });
    // スパムボットは正規の流入と並べず、集計の最後に1行だけ足す
    const spamN = byLabel.get("スパムボット") || 0;
    byLabel.delete("スパムボット");
    const rows = [...byLabel.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
    const total = rows.reduce((a, b) => a + b.n, 0) + spamN;
    const top = rows.slice(0, 5);
    const restN = rows.slice(5).reduce((a, b) => a + b.n, 0);
    const items = top.map((r) => ({ label: r.label, pct: total > 0 ? Math.round((r.n / total) * 100) : 0 }));
    if (restN > 0) items.push({ label: "その他", pct: Math.round((restN / total) * 100) });
    if (spamN > 0) items.push({ label: "スパムボット", pct: Math.round((spamN / total) * 100) });
    return items.filter((i) => i.pct > 0);
  });
}

// 作品別イベント数（view_workイベント・work_idカスタムディメンション）
// ※ GA4管理画面でイベントパラメータ work_id をカスタムディメンション（イベント範囲）として
//    登録していないと customEvent:work_id は使えず、このレポートはエラーになります。
function fetchTopWorksRaw() {
  return cached("topWorks", 45_000, async () => {
    const data = await runReport({
      dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
      dimensions: [{ name: "customEvent:work_id" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { value: "view_work" } } },
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 6,
    });
    return (data.rows || [])
      .map((r) => ({ workId: dim(r, 0), views: Math.round(num(r, 0)) }))
      .filter((w) => w.workId && w.workId !== "(not set)");
  });
}

// 国・地域別（上位5＋その他）
function fetchCountry() {
  return cached("country", 45_000, async () => {
    const data = await runReport({
      dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
      dimensions: [{ name: "country" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit: 100,
    });
    const rows = (data.rows || []).map((r) => ({ label: dim(r, 0), n: num(r, 0) }));
    const total = rows.reduce((a, b) => a + b.n, 0);
    const top = rows.slice(0, 5);
    const restN = rows.slice(5).reduce((a, b) => a + b.n, 0);
    const items = top.map((r) => ({ label: JP_COUNTRY[r.label] || r.label, pct: total > 0 ? Math.round((r.n / total) * 100) : 0 }));
    if (restN > 0) items.push({ label: "その他", pct: Math.round((restN / total) * 100) });
    return items;
  });
}
const JP_COUNTRY = {
  Japan: "日本", "United States": "アメリカ", France: "フランス", Taiwan: "台湾",
  "South Korea": "韓国", China: "中国", "Hong Kong": "香港", Singapore: "シンガポール",
  "United Kingdom": "イギリス", Germany: "ドイツ", Australia: "オーストラリア", Canada: "カナダ",
  Thailand: "タイ", Italy: "イタリア", Spain: "スペイン", Vietnam: "ベトナム", India: "インド",
};

// 都市別（上位5＋その他）。GA4は都市名を英語で返すので、主要都市は日本語に変換する。
const JP_CITY = {
  Tokyo: "東京", Osaka: "大阪", Nagoya: "名古屋", Yokohama: "横浜", Kyoto: "京都",
  Sapporo: "札幌", Fukuoka: "福岡", Kobe: "神戸", Sendai: "仙台", Hiroshima: "広島",
  Kawasaki: "川崎", Saitama: "さいたま", Chiba: "千葉", Kitakyushu: "北九州",
  Niigata: "新潟", Hamamatsu: "浜松", Kumamoto: "熊本", Okayama: "岡山",
  Kanazawa: "金沢", Shizuoka: "静岡", Utsunomiya: "宇都宮", Matsuyama: "松山",
  Kagoshima: "鹿児島", Naha: "那覇", Shinjuku: "新宿", Shibuya: "渋谷", Minato: "港区",
  Setagaya: "世田谷", "New York": "ニューヨーク", "Los Angeles": "ロサンゼルス",
  Paris: "パリ", London: "ロンドン", Seoul: "ソウル", Taipei: "台北",
};
function fetchCity() {
  return cached("city", 45_000, async () => {
    const data = await runReport({
      dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
      dimensions: [{ name: "city" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit: 100,
    });
    const rows = (data.rows || [])
      .map((r) => ({ label: dim(r, 0), n: num(r, 0) }))
      .filter((r) => r.label && r.label !== "(not set)");
    const total = rows.reduce((a, b) => a + b.n, 0);
    const top = rows.slice(0, 5);
    const restN = rows.slice(5).reduce((a, b) => a + b.n, 0);
    const items = top.map((r) => ({ label: JP_CITY[r.label] || r.label, pct: total > 0 ? Math.round((r.n / total) * 100) : 0 }));
    if (restN > 0) items.push({ label: "その他", pct: Math.round((restN / total) * 100) });
    return items;
  });
}

// 曜日×時間帯のヒートマップ（直近28日）。dayOfWeekは 0=日曜〜6=土曜、
// hourは "00"〜"23"（どちらもGA4プロパティのタイムゾーン基準）。
function fetchHeatmap() {
  return cached("heatmap", 45_000, async () => {
    const data = await runReport({
      dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
      dimensions: [{ name: "dayOfWeek" }, { name: "hour" }],
      metrics: [{ name: "activeUsers" }],
      limit: 200,
    });
    const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
    (data.rows || []).forEach((r) => {
      const d = parseInt(dim(r, 0), 10);
      const h = parseInt(dim(r, 1), 10);
      if (d >= 0 && d <= 6 && h >= 0 && h <= 23) matrix[d][h] += Math.round(num(r, 0));
    });
    const max = Math.max(0, ...matrix.flat());
    return { matrix, max };
  });
}

// 新規 / リピーター
function fetchNewReturning() {
  return cached("newret", 45_000, async () => {
    const data = await runReport({
      dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
      dimensions: [{ name: "newVsReturning" }],
      metrics: [{ name: "activeUsers" }],
    });
    let newN = 0, retN = 0;
    (data.rows || []).forEach((r) => {
      const v = dim(r, 0);
      if (v === "new") newN += num(r, 0);
      else if (v === "returning") retN += num(r, 0);
    });
    const total = newN + retN;
    const newPct = total > 0 ? Math.round((newN / total) * 100) : 0;
    return { newPct, returningPct: 100 - newPct };
  });
}

// リアルタイム：過去30分のアクティブユーザー（分単位）
function fetchRealtimeUsers() {
  return cached("rtUsers", 12_000, async () => {
    const data = await runRealtimeReport({
      dimensions: [{ name: "minutesAgo" }],
      metrics: [{ name: "activeUsers" }],
    });
    const byMin = new Map();
    (data.rows || []).forEach((r) => byMin.set(Number(dim(r, 0)), Math.round(num(r, 0))));
    const bars = [];
    for (let m = 29; m >= 0; m--) bars.push(byMin.get(m) || 0);
    const now = bars[bars.length - 1] || 0;
    return { now, bars };
  });
}

// リアルタイム：閲覧中のページ（上位4）
function fetchRealtimePages() {
  return cached("rtPages", 12_000, async () => {
    const data = await runRealtimeReport({
      dimensions: [{ name: "unifiedScreenName" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit: 4,
    });
    return (data.rows || []).map((r) => ({ name: dim(r, 0) || "(不明なページ)", n: Math.round(num(r, 0)) }));
  });
}

module.exports = {
  enabled,
  GA4_PROPERTY_ID,
  TREND_PERIODS,
  fetchTotals,
  fetchTrend,
  fetchTraffic,
  fetchTopWorksRaw,
  fetchCountry,
  fetchCity,
  fetchHeatmap,
  fetchNewReturning,
  fetchRealtimeUsers,
  fetchRealtimePages,
};
