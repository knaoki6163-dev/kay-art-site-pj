# Aquarelle — 水彩画ポートフォリオ（動的版）

透明水彩の作品を、アーティストサイトのように閲覧できる **動的Webアプリ** です。
管理画面から写真をアップロードでき、お問い合わせ内容もサーバーに収集されます。
配色は赤茶・赤・茶・白・黒のモノトーンで統一しています。

## 主な機能

- **多言語対応** — 右上のプルダウンで 日本語 / English を切替（UIラベル＋編集文章を言語別に表示）
- **作品ギャラリー** — メーソンリー表示・カテゴリ切替・クリックで拡大（ライトボックス）
- **管理画面（`/katoasao/`）** — パスワードでログインし、
  - 作品の写真アップロード（タイトル・カテゴリ・制作年・技法を登録）
  - 登録済み作品の削除
  - **お知らせ（News）の追加・削除**
  - **サイトの文章編集**（サイト名・キャッチコピー・プロフィール・ボタン文言・サイン・SNSリンク・著作権表記）
  - お問い合わせ内容の一覧・未読管理・重要フラグ切替
- **お問い合わせフォーム** — 送信内容をサーバーに保存（管理画面で確認）
- **Google Analytics 4** によるアクセス解析
- **プライバシーポリシー**ページ

## 技術構成

- バックエンド：Node.js + Express
- 画像アップロード：multer（`public/uploads/` に保存）
- データ保存：JSON ファイル（`data/works.json`／`data/messages.json`）
- 認証：express-session によるパスワードログイン
- フロントエンド：素の HTML / CSS / JavaScript（ビルド不要）

```
.
├── server.js              # Express サーバー（API・静的配信・SEO用ルート）
├── package.json
├── render.yaml            # Render デプロイ設定
├── data/                  # JSON データ保存先（自動生成）
│   ├── works.json         # 作品メタデータ
│   ├── news.json          # Info（お知らせ）
│   ├── blog.json          # Blog 記事
│   ├── messages.json      # お問い合わせ
│   ├── content.json       # サイト文章・SNSリンク等
│   └── settings.json      # Looker Studio 埋め込みURL等
└── public/                # 公開ファイル
    ├── index.html         # トップ
    ├── works.html         # 作品一覧
    ├── info.html          # お知らせ
    ├── blog.html          # ブログ
    ├── artist.html        # アーティスト紹介
    ├── contact.html       # お問い合わせ
    ├── privacy.html       # プライバシーポリシー
    ├── css/style.css      # 共通スタイル
    ├── js/main.js         # 公開サイトの動作
    ├── js/analytics.js    # GA4
    ├── uploads/           # アップロードされた画像
    └── admin/             # 管理画面（index.html / admin.js）
```

## サイト構成

### 公開ページ

| URL | ファイル | 役割 |
|---|---|---|
| `/` / `/index.html` | `public/index.html` | トップページ。ヒーロー、作品プレビュー（最大8件）、フッターを表示します。 |
| `/works.html` | `public/works.html` | 作品一覧ページ。カテゴリフィルター、メーソンリー風グリッド、ライトボックスで作品を閲覧できます。 |
| `/info.html` | `public/info.html` | お知らせページ。管理画面で登録した Info を新しい順に表示します。 |
| `/blog.html` | `public/blog.html` | ブログページ。管理画面で登録した記事本文を表示します。 |
| `/artist.html` | `public/artist.html` | アーティスト紹介ページ。管理画面で編集したプロフィール文や署名を反映します。 |
| `/contact.html` | `public/contact.html` | お問い合わせページ。送信内容は `data/messages.json` に保存され、管理画面で確認できます。 |
| `/privacy.html` | `public/privacy.html` | Google Analytics とお問い合わせフォームに関するプライバシーポリシーです。 |
| `/katoasao/` | `public/katoasao/index.html` | 管理画面。作品、Info、Blog、サイト文章、アクセス解析設定、お問い合わせを管理します。 |

### 共通レイアウト・動作

- ヘッダーには Home / Works / Info / Blog / Artist / Contact のグローバルナビと、日本語 / English の言語切替を配置しています。
- フッターには主要ページ、Privacy、Admin へのリンクと、管理画面で編集できる Instagram / Email リンクを配置しています。
- `public/js/main.js` が公開サイト共通の言語切替、編集可能文章の反映、作品取得、ライトボックス、お知らせ・ブログ表示、お問い合わせ送信を担当します。
- `server.js` は `/robots.txt` と `/sitemap.xml` を動的に生成し、`__SITE_URL__` プレースホルダーを実際の公開URLに置換して各 HTML を配信します。

### 管理画面の構成

| タブ | 主な機能 | 保存先 |
|---|---|---|
| 作品 | 画像アップロード、作品情報（タイトル・カテゴリ・制作年・技法・サイズ・ステータス）の登録・編集・削除 | `data/works.json`、`public/uploads/` |
| Info | お知らせの追加・削除 | `data/news.json` |
| Blog | ブログ記事の追加・削除 | `data/blog.json` |
| サイト編集 | サイト名、キャッチコピー、プロフィール、ボタン文言、SNSリンク、著作権表記などを日本語 / English 別に編集 | `data/content.json` |
| Analytics | Looker Studio の埋め込みURLを保存し、管理画面内にレポートを表示 | `data/settings.json` |
| お問い合わせ | 受信メッセージの一覧、未読管理、重要フラグ切替 | `data/messages.json` |

### API 構成

- 公開 API：`GET /api/categories`、`GET /api/content?lang=ja|en`、`GET /api/works`、`GET /api/news`、`GET /api/blog`、`POST /api/contact`
- 管理 API：`/api/admin/*` 配下にログイン、作品管理、Info / Blog 管理、サイト文章編集、Analytics 設定、お問い合わせ管理を配置しています。
- 管理 API のうちデータ変更・管理情報取得を行うエンドポイントは、`express-session` によるログイン後のみ利用できます。

## ローカルでの起動方法

```bash
# 1. 依存パッケージのインストール（初回のみ）
npm install

# 2. 管理者パスワードを指定して起動
ADMIN_PASSWORD=好きなパスワード npm start

# 3. ブラウザで開く
#   公開サイト  → http://localhost:3000
#   管理画面    → http://localhost:3000/katoasao/
```

> `ADMIN_PASSWORD` を指定しないと既定値 `change-me` になります。公開前に必ず設定してください。

## 環境変数

| 変数 | 説明 | 既定値 |
|---|---|---|
| `ADMIN_PASSWORD` | 管理画面のログインパスワード | `change-me`（要変更）|
| `SESSION_SECRET` | セッション暗号化キー（任意。未指定時は自動生成）| ランダム |
| `PORT` | 待ち受けポート | `3000` |

## カテゴリの編集

`server.js` の `CATEGORIES` 配列を編集すると、公開側のフィルターと管理画面の選択肢の両方に反映されます。

## デプロイについて（重要）

このアプリは「サーバーで処理を行う動的サイト」のため、**GitHub Pages では動きません。**
Node.js が動かせるホスティングが必要です（例：Render / Railway / Fly.io / VPS など）。

デプロイ時の注意：
- 環境変数 `ADMIN_PASSWORD`（と必要なら `SESSION_SECRET`）を設定してください。
- アップロード画像（`public/uploads/`）と保存データ（`data/`）は、サーバーを再起動・再デプロイすると**消えるホスティング（ディスクが永続でない環境）があります**。
  作品やお問い合わせを残したい場合は、**永続ディスク**や外部ストレージ（例：S3 等）／外部DBの利用を検討してください。

## アクセス解析（Google Analytics 4）

- 測定タグは `public/js/analytics.js` の1ファイルに集約し、各HTMLの `<head>` から1行で読み込んでいます。
- 測定IDは `analytics.js` 内の `GA_MEASUREMENT_ID` で管理します。
- プライバシー配慮として IP 匿名化・Google 広告シグナル無効化を設定済みです。

## ライセンス

サイトのコードは自由に利用・改変いただけます。掲載する水彩画作品の著作権は制作者に帰属します。
