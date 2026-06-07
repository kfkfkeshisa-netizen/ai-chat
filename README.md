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
```

開発サーバーを起動します。

```bash
npm run dev
```

## 注意

- `.env.local` は Git 管理しません。
- `.env.local` の実ファイルは Firebase Hosting にもアップロードしません。ただし、`VITE_FIREBASE_*` の値はブラウザで Firebase に接続するため、ビルド後の JavaScript から参照できる前提です。
- Firebase Web設定の `apiKey` は OpenAI APIキーのような秘密鍵ではありません。アクセス制御は Firebase Authentication と Firestore Rules で行います。
- OpenAI APIキーは Firestore や GitHub には保存しません。
- 許可された Firebase Auth UID 以外の Google アカウントは、ログインしてもアプリ利用を拒否します。
- 初期版では Firebase Spark プラン前提のため、Cloud Functions は使用しません。
- OpenAI API はユーザーのブラウザから直接呼び出します。

## ドキュメント

- [要件定義書](./requirements.md)
- [詳細設計書](./detailed_design.md)
