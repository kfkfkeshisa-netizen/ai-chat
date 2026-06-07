# AI Chat

Firebase Authentication と Cloud Firestore を使った個人利用向けの AI チャットアプリです。

## 機能

- メールアドレス・パスワードログイン
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
- アプリには新規登録機能を置かず、Firebase Console の Authentication で作成したメールユーザーのみログインできます。
- 初期版では Firebase Spark プラン前提のため、Cloud Functions は使用しません。
- OpenAI API はユーザーのブラウザから直接呼び出します。

## ユーザーの追加

ユーザーは Firebase Console の Authentication で管理します。

1. Firebase Console で `Authentication` を開きます。
2. ログイン方法で `メール/パスワード` を有効化します。
3. 使用しない `Google` プロバイダは無効化します。
4. ユーザー一覧からメールユーザーを追加し、初期パスワードを設定します。

アプリ側には新規登録フォームを置かないため、通常の利用では Firebase Console で作成したユーザーだけがログインできます。

## ドキュメント

- [要件定義書](./requirements.md)
- [詳細設計書](./detailed_design.md)
