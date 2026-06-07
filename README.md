# AI Chat

Firebase Authentication と Cloud Firestore を使った個人利用向けの AI チャットアプリです。

## 機能

- Google ログイン
- OpenAI APIキーのブラウザ保存
- OpenAI Responses API への直接リクエスト
- チャット履歴の Firestore 保存
- セッションの固定、ブックマーク、名前変更、削除
- 方針別の静的モデル選択
- PC / スマートフォン向けレスポンシブ UI

## 技術構成

- React
- Vite
- TypeScript
- Firebase Authentication
- Cloud Firestore
- Firebase Hosting

## セットアップ

依存関係をインストールします。

```bash
npm install
```

`.env.example` を参考に `.env.local` を作成し、Firebase Web アプリの設定値を入れます。

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
VITE_ALLOWED_EMAILS=your-account@example.com
```

`VITE_ALLOWED_EMAILS` はカンマ区切りで複数指定できます。

開発サーバーを起動します。

```bash
npm run dev
```

## 注意

- `.env.local` は Git 管理しません。
- OpenAI APIキーは Firestore や GitHub には保存しません。
- `VITE_ALLOWED_EMAILS` に含まれない Google アカウントは、ログインしてもアプリ利用を拒否します。
- 初期版では Firebase Spark プラン前提のため、Cloud Functions は使用しません。
- OpenAI API はユーザーのブラウザから直接呼び出します。

## ドキュメント

- [要件定義書](./requirements.md)
- [詳細設計書](./detailed_design.md)
