import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { User } from "firebase/auth";
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  MessageSquareText,
  Pencil,
  Pin,
  Plus,
  Send,
  ShieldAlert,
  Star,
  Trash2,
  Wifi,
} from "lucide-react";
import { deleteApiKey, getStoredApiKey, saveApiKey } from "./apiKeyStore";
import {
  ChatMessage,
  ChatSession,
  deleteChatSession,
  renameChatSession,
  saveChatExchange,
  subscribeMessages,
  subscribeSessions,
  toggleSessionFlag,
} from "./chatHistory";
import {
  MODEL_CATALOG,
  ModelPolicy,
  OpenAIRequestError,
  POLICY_LABELS,
  createOpenAIResponse,
  selectModel,
} from "./openai";
import { useAuth } from "./useAuth";

type Status = {
  tone: "idle" | "success" | "error";
  message: string;
};

const CONNECTION_TEST_PROMPT = "日本語で一文だけ、API疎通確認が成功したことを返してください。";

export function App() {
  const { user, isLoading, error, isConfigured, signInWithGoogle, signOut } = useAuth();

  if (!isConfigured) {
    return <FirebaseSetup />;
  }

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <LoginScreen error={error} onSignIn={signInWithGoogle} />;
  }

  return <ApiProbe user={user} authError={error} onSignOut={signOut} />;
}

type ApiProbeProps = {
  user: User;
  authError: string | null;
  onSignOut: () => Promise<void>;
};

function ApiProbe({ user, authError, onSignOut }: ApiProbeProps) {
  const [apiKey, setApiKey] = useState("");
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [policy, setPolicy] = useState<ModelPolicy>("balanced");
  const [prompt, setPrompt] = useState("");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({
    tone: "idle",
    message: "APIキーを保存して、まずは接続テストを実行してください。",
  });
  const [isBusy, setIsBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);

  const selectedModel = useMemo(() => selectModel(policy), [policy]);
  const maskedKey = useMemo(() => maskApiKey(apiKey), [apiKey]);

  useEffect(() => {
    void loadApiKey();
  }, []);

  useEffect(() => {
    return subscribeSessions(
      user.uid,
      (nextSessions) => {
        setSessions(sortSessions(nextSessions));
        setActiveSessionId((currentId) => {
          if (!currentId || nextSessions.some((session) => session.id === currentId)) {
            return currentId;
          }

          return nextSessions[0]?.id ?? null;
        });
      },
      (error) => {
        setStatus({ tone: "error", message: `履歴の取得に失敗しました: ${error.message}` });
      },
    );
  }, [user.uid]);

  useEffect(() => {
    return subscribeMessages(
      user.uid,
      activeSessionId,
      (nextMessages) => setMessages(nextMessages),
      (error) => {
        setStatus({ tone: "error", message: `メッセージの取得に失敗しました: ${error.message}` });
      },
    );
  }, [activeSessionId, user.uid]);

  useEffect(() => {
    const element = messageListRef.current;

    if (!element) {
      return;
    }

    element.scrollTop = element.scrollHeight;
  }, [messages, activeSessionId]);

  async function loadApiKey() {
    const storedKey = await getStoredApiKey();

    if (storedKey) {
      setApiKey(storedKey);
      setHasStoredKey(true);
      setStatus({
        tone: "idle",
        message: "保存済みのAPIキーを読み込みました。接続テストを実行できます。",
      });
    }
  }

  async function handleSaveKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextKey = apiKey.trim();

    if (!nextKey) {
      setStatus({ tone: "error", message: "APIキーを入力してください。" });
      return;
    }

    await saveApiKey(nextKey);
    setApiKey(nextKey);
    setHasStoredKey(true);
    setStatus({ tone: "success", message: "APIキーをIndexedDBに保存しました。" });
  }

  async function handleDeleteKey() {
    abortRef.current?.abort();
    await deleteApiKey();
    setApiKey("");
    setHasStoredKey(false);
    setStatus({ tone: "idle", message: "APIキーを削除しました。" });
  }

  async function handleConnectionTest() {
    await runRequest(CONNECTION_TEST_PROMPT, "接続テスト");
  }

  async function handleSendPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runRequest(prompt, "チャット送信", true);
  }

  async function handleRenameSession(session: ChatSession) {
    const nextTitle = window.prompt("チャット名を入力してください。", session.title)?.trim();

    if (!nextTitle || nextTitle === session.title) {
      return;
    }

    try {
      await renameChatSession({ uid: user.uid, sessionId: session.id, title: nextTitle });
      setStatus({ tone: "success", message: "チャット名を変更しました。" });
    } catch (error) {
      setStatus({ tone: "error", message: `チャット名の変更に失敗しました: ${formatError(error)}` });
    }
  }

  async function handleDeleteSession(session: ChatSession) {
    const shouldDelete = window.confirm(`「${session.title}」を削除します。元に戻せません。`);

    if (!shouldDelete) {
      return;
    }

    try {
      await deleteChatSession({ uid: user.uid, sessionId: session.id });
      if (activeSessionId === session.id) {
        setActiveSessionId(null);
        setMessages([]);
      }
      setStatus({ tone: "success", message: "チャットを削除しました。" });
    } catch (error) {
      setStatus({ tone: "error", message: `チャットの削除に失敗しました: ${formatError(error)}` });
    }
  }

  async function runRequest(input: string, label: string, shouldSave = false) {
    const trimmedKey = apiKey.trim();
    const trimmedInput = input.trim();

    if (!trimmedKey) {
      setStatus({ tone: "error", message: "OpenAI APIキーを保存してください。" });
      return;
    }

    if (!trimmedInput) {
      setStatus({ tone: "error", message: "送信するテキストを入力してください。" });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsBusy(true);
    setStatus({
      tone: "idle",
      message: `${label}中です。OpenAI APIへ直接リクエストしています。`,
    });

    try {
      const text = await createOpenAIResponse({
        apiKey: trimmedKey,
        model: selectedModel.id,
        input: trimmedInput,
        signal: controller.signal,
      });

      let savedSessionId: string | null = null;
      if (shouldSave) {
        try {
          savedSessionId = await saveChatExchange({
            uid: user.uid,
            sessionId: activeSessionId,
            prompt: trimmedInput,
            reply: text,
            modelId: selectedModel.id,
            modelLabel: selectedModel.label,
          });
        } catch (saveError) {
          setStatus({
            tone: "error",
            message: `AI応答は取得しましたが、Firestoreへの履歴保存に失敗しました: ${formatError(saveError)}`,
          });
          return;
        }
      }

      if (savedSessionId) {
        setActiveSessionId(savedSessionId);
        setPrompt("");
      }
      setStatus({
        tone: "success",
        message: savedSessionId
          ? `${label}に成功し、Firestoreへ保存しました。モデル: ${selectedModel.label}`
          : `${label}に成功しました。モデル: ${selectedModel.label}`,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus({ tone: "idle", message: "リクエストを中断しました。" });
        return;
      }

      setStatus({
        tone: "error",
        message: formatError(error),
      });
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Phase 1</p>
            <h1>AIチャット</h1>
          </div>
        </header>

        <div className="layout">
          <aside className="side-panel">
            <section className="section session-panel">
              <div className="section-heading spread">
                <div className="heading-inline">
                  <MessageSquareText size={19} aria-hidden="true" />
                  <h2>チャット履歴</h2>
                </div>
                <button
                  type="button"
                  className="icon-button secondary"
                  onClick={() => {
                    setActiveSessionId(null);
                    setMessages([]);
                    setPrompt("");
                  }}
                  aria-label="新規チャット"
                  title="新規チャット"
                >
                  <Plus size={18} aria-hidden="true" />
                </button>
              </div>
              <div className="session-list">
                {sessions.length === 0 ? (
                  <p className="muted no-history">まだ保存されたチャットはありません。</p>
                ) : (
                  sessions.map((session) => (
                    <article
                      key={session.id}
                      className={session.id === activeSessionId ? "session-item active" : "session-item"}
                    >
                      <button
                        type="button"
                        className="session-main"
                        onClick={() => {
                          setActiveSessionId(session.id);
                        }}
                      >
                        <span>{session.title}</span>
                      </button>
                      <div className="session-actions">
                        <button
                          type="button"
                          className={session.pinned ? "icon-button active-flag" : "icon-button secondary"}
                          onClick={() =>
                            void toggleSessionFlag({
                              uid: user.uid,
                              sessionId: session.id,
                              field: "pinned",
                              value: !session.pinned,
                            })
                          }
                          aria-label={session.pinned ? "固定を解除" : "固定"}
                          title={session.pinned ? "固定を解除" : "固定"}
                        >
                          <Pin size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={session.bookmarked ? "icon-button active-flag" : "icon-button secondary"}
                          onClick={() =>
                            void toggleSessionFlag({
                              uid: user.uid,
                              sessionId: session.id,
                              field: "bookmarked",
                              value: !session.bookmarked,
                            })
                          }
                          aria-label={session.bookmarked ? "ブックマーク解除" : "ブックマーク"}
                          title={session.bookmarked ? "ブックマーク解除" : "ブックマーク"}
                        >
                          <Star size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="icon-button secondary"
                          onClick={() => void handleRenameSession(session)}
                          aria-label="チャット名を変更"
                          title="チャット名を変更"
                        >
                          <Pencil size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="icon-button secondary danger"
                          onClick={() => void handleDeleteSession(session)}
                          aria-label="チャットを削除"
                          title="チャットを削除"
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <details className="side-settings">
              <summary>
                <span>設定</span>
                <small>{hasStoredKey ? `${selectedModel.label} / ${maskedKey}` : selectedModel.label}</small>
              </summary>
              <div className="settings-content">
                <section className="settings-block account-block">
                  <div>
                    <h2>アカウント</h2>
                    <p>{user.displayName ?? user.email ?? "Googleユーザー"}</p>
                  </div>
                  <button type="button" className="icon-button secondary" onClick={() => void onSignOut()} title="ログアウト">
                    <LogOut size={18} aria-hidden="true" />
                  </button>
                </section>

                <form className="settings-block" onSubmit={handleSaveKey}>
                  <div className="section-heading">
                    <KeyRound size={19} aria-hidden="true" />
                    <h2>APIキー</h2>
                  </div>
                  <label htmlFor="api-key">OpenAI APIキー</label>
                  <input
                    id="api-key"
                    type="password"
                    autoComplete="off"
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                  {hasStoredKey ? <p className="muted">保存中: {maskedKey}</p> : null}
                  <div className="button-row">
                    <button type="submit" disabled={isBusy}>
                      <CheckCircle2 size={18} aria-hidden="true" />
                      保存
                    </button>
                    <button type="button" className="secondary" onClick={handleConnectionTest} disabled={isBusy || !apiKey.trim()}>
                      {isBusy ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Wifi size={18} aria-hidden="true" />}
                      テスト
                    </button>
                    <button type="button" className="secondary danger" onClick={handleDeleteKey} disabled={isBusy}>
                      <Trash2 size={18} aria-hidden="true" />
                      削除
                    </button>
                  </div>
                </form>

                <section className="settings-block">
                  <div className="section-heading">
                    <MessageSquareText size={19} aria-hidden="true" />
                    <h2>モデル方針</h2>
                  </div>
                  <div className="policy-grid" role="radiogroup" aria-label="モデル選択方針">
                    {(Object.keys(POLICY_LABELS) as ModelPolicy[]).map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={policy === value ? "policy active" : "policy"}
                        onClick={() => setPolicy(value)}
                        aria-pressed={policy === value}
                      >
                        {POLICY_LABELS[value]}
                      </button>
                    ))}
                  </div>

                  <article className="model-card">
                    <h3>{selectedModel.label}</h3>
                    <p>{selectedModel.description}</p>
                    <div className="tags">
                      {selectedModel.featureTags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  </article>

                  <details className="model-catalog-details">
                    <summary>モデルカタログ</summary>
                    <div className="catalog-grid compact">
                      {MODEL_CATALOG.map((model) => (
                        <article key={model.id} className="catalog-item">
                          <h3>{model.label}</h3>
                          <p>{model.description}</p>
                          <div className="tags">
                            {model.featureTags.map((tag) => (
                              <span key={tag}>{tag}</span>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  </details>
                </section>
              </div>
            </details>
          </aside>

          <section className="chat-panel">
            <form className="section chat-test" onSubmit={handleSendPrompt}>
              <div className="section-heading spread">
                <div className="heading-inline">
                  <Send size={19} aria-hidden="true" />
                  <h2>{activeSessionId ? "チャット" : "新規チャット"}</h2>
                </div>
                <span className="model-pill">{selectedModel.label}</span>
              </div>
              <div className="message-list" aria-live="polite" ref={messageListRef}>
                {messages.length === 0 ? (
                  <div className="empty-chat">ここに会話履歴が表示されます。</div>
                ) : (
                  messages.map((message) => (
                    <article key={message.id} className={`message-bubble ${message.role}`}>
                      <div className="message-role">{message.role === "user" ? "あなた" : "AI"}</div>
                      <p>{message.content}</p>
                    </article>
                  ))
                )}
              </div>
              <label htmlFor="prompt">送信テキスト</label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="メッセージを入力"
                rows={8}
              />
              <button type="submit" disabled={isBusy || !apiKey.trim()}>
                {isBusy ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
                送信
              </button>
            </form>

            {status.tone !== "idle" || isBusy ? (
              <section className={`status ${status.tone}`} aria-live="polite">
                {status.message}
              </section>
            ) : null}
            {authError ? <section className="status error">{authError}</section> : null}

          </section>
        </div>
      </section>
    </main>
  );
}

function FirebaseSetup() {
  return (
    <main className="app-shell">
      <section className="workspace narrow">
        <section className="setup-panel">
          <ShieldAlert size={28} aria-hidden="true" />
          <div>
            <p className="eyebrow">Firebase setup</p>
            <h1>Firebase設定が未完了です</h1>
            <p>
              `.env.example` を参考に `.env.local` を作成し、Firebase Webアプリの設定値を入力してください。
              入力後に開発サーバーを再起動すると Googleログインを使えます。
            </p>
            <pre>{`VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...`}</pre>
          </div>
        </section>
      </section>
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="app-shell">
      <section className="workspace narrow">
        <section className="setup-panel">
          <Loader2 className="spin" size={28} aria-hidden="true" />
          <div>
            <p className="eyebrow">Loading</p>
            <h1>認証状態を確認しています</h1>
          </div>
        </section>
      </section>
    </main>
  );
}

function LoginScreen({ error, onSignIn }: { error: string | null; onSignIn: () => Promise<void> }) {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSignIn() {
    setIsSigningIn(true);
    setLocalError(null);

    try {
      await onSignIn();
    } catch (signInError) {
      setLocalError(signInError instanceof Error ? signInError.message : "ログインに失敗しました。");
    } finally {
      setIsSigningIn(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="workspace narrow">
        <section className="login-panel">
          <p className="eyebrow">AI Chat</p>
          <h1>Googleログイン</h1>
          <p>認証済みユーザーのみAPI疎通確認画面を利用できます。</p>
          <button type="button" onClick={() => void handleSignIn()} disabled={isSigningIn}>
            {isSigningIn ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <LogIn size={18} aria-hidden="true" />}
            Googleでログイン
          </button>
          {error || localError ? <div className="status error">{error ?? localError}</div> : null}
        </section>
      </section>
    </main>
  );
}

function maskApiKey(value: string): string {
  if (value.length <= 12) {
    return "********";
  }

  return `${value.slice(0, 7)}...${value.slice(-4)}`;
}

function sortSessions(sessions: ChatSession[]): ChatSession[] {
  return [...sessions].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }

    if (a.bookmarked !== b.bookmarked) {
      return a.bookmarked ? -1 : 1;
    }

    return (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0);
  });
}

function formatError(error: unknown): string {
  if (error instanceof OpenAIRequestError) {
    return error.status ? `OpenAI APIエラー (${error.status}): ${error.message}` : error.message;
  }

  if (error instanceof TypeError) {
    return "通信に失敗しました。CORS、ネットワーク、またはブラウザ直接呼び出しの制限を確認してください。";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "不明なエラーが発生しました。";
}
