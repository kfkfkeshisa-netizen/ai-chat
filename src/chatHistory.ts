import {
  DocumentData,
  QueryDocumentSnapshot,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

export type ChatSession = {
  id: string;
  title: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  pinned: boolean;
  bookmarked: boolean;
  lastMessagePreview: string;
  provider: "openai";
  model: string;
  modelLabel: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date | null;
  provider: "openai";
  model: string;
  status: "completed" | "failed";
  error: string | null;
  sequence: number | null;
};

type SaveChatExchangeParams = {
  uid: string;
  sessionId?: string | null;
  prompt: string;
  reply: string;
  modelId: string;
  modelLabel: string;
};

export function subscribeSessions(
  uid: string,
  onNext: (sessions: ChatSession[]) => void,
  onError: (error: Error) => void,
): () => void {
  if (!db) {
    onNext([]);
    return () => undefined;
  }

  const sessionsQuery = query(
    collection(db, "users", uid, "sessions"),
    orderBy("updatedAt", "desc"),
    limit(50),
  );

  return onSnapshot(
    sessionsQuery,
    (snapshot) => onNext(snapshot.docs.map(mapSession)),
    (error) => onError(error),
  );
}

export function subscribeMessages(
  uid: string,
  sessionId: string | null,
  onNext: (messages: ChatMessage[]) => void,
  onError: (error: Error) => void,
): () => void {
  if (!db || !sessionId) {
    onNext([]);
    return () => undefined;
  }

  const messagesQuery = query(
    collection(db, "users", uid, "sessions", sessionId, "messages"),
    orderBy("createdAt", "asc"),
    limit(100),
  );

  return onSnapshot(
    messagesQuery,
    (snapshot) => onNext(sortMessages(snapshot.docs.map(mapMessage))),
    (error) => onError(error),
  );
}

export async function saveChatExchange(params: SaveChatExchangeParams): Promise<string | null> {
  if (!db) {
    return null;
  }

  const sessionRef = params.sessionId
    ? doc(db, "users", params.uid, "sessions", params.sessionId)
    : doc(collection(db, "users", params.uid, "sessions"));
  const userMessageRef = doc(collection(sessionRef, "messages"));
  const assistantMessageRef = doc(collection(sessionRef, "messages"));
  const batch = writeBatch(db);
  const title = normalizeTitle(params.prompt);
  const nextSequence = params.sessionId ? await getNextMessageSequence(params.uid, params.sessionId) : 0;

  if (!params.sessionId) {
    batch.set(sessionRef, {
      title,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      pinned: false,
      bookmarked: false,
      lastMessagePreview: params.reply.slice(0, 120),
      provider: "openai",
      model: params.modelId,
      modelLabel: params.modelLabel,
    });
  } else {
    batch.update(sessionRef, {
      updatedAt: serverTimestamp(),
      lastMessagePreview: params.reply.slice(0, 120),
      provider: "openai",
      model: params.modelId,
      modelLabel: params.modelLabel,
    });
  }

  batch.set(userMessageRef, {
    role: "user",
    content: params.prompt,
    createdAt: serverTimestamp(),
    provider: "openai",
    model: params.modelId,
    status: "completed",
    error: null,
    sequence: nextSequence,
  });

  batch.set(assistantMessageRef, {
    role: "assistant",
    content: params.reply,
    createdAt: serverTimestamp(),
    provider: "openai",
    model: params.modelId,
    status: "completed",
    error: null,
    sequence: nextSequence + 1,
  });

  await batch.commit();
  return sessionRef.id;
}

export async function toggleSessionFlag(params: {
  uid: string;
  sessionId: string;
  field: "pinned" | "bookmarked";
  value: boolean;
}): Promise<void> {
  if (!db) {
    return;
  }

  await updateDoc(doc(db, "users", params.uid, "sessions", params.sessionId), {
    [params.field]: params.value,
    updatedAt: serverTimestamp(),
  });
}

export async function renameChatSession(params: {
  uid: string;
  sessionId: string;
  title: string;
}): Promise<void> {
  if (!db) {
    return;
  }

  await updateDoc(doc(db, "users", params.uid, "sessions", params.sessionId), {
    title: normalizeTitle(params.title),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteChatSession(params: { uid: string; sessionId: string }): Promise<void> {
  if (!db) {
    return;
  }

  const sessionRef = doc(db, "users", params.uid, "sessions", params.sessionId);
  const messagesSnapshot = await getDocs(collection(sessionRef, "messages"));
  const batch = writeBatch(db);

  messagesSnapshot.docs.forEach((messageDoc) => {
    batch.delete(messageDoc.ref);
  });
  batch.delete(sessionRef);
  await batch.commit();
}

function mapSession(docSnapshot: QueryDocumentSnapshot<DocumentData>): ChatSession {
  const data = docSnapshot.data();

  return {
    id: docSnapshot.id,
    title: typeof data.title === "string" ? data.title : "新しいチャット",
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    pinned: Boolean(data.pinned),
    bookmarked: Boolean(data.bookmarked),
    lastMessagePreview: typeof data.lastMessagePreview === "string" ? data.lastMessagePreview : "",
    provider: "openai",
    model: typeof data.model === "string" ? data.model : "",
    modelLabel: typeof data.modelLabel === "string" ? data.modelLabel : "",
  };
}

function mapMessage(docSnapshot: QueryDocumentSnapshot<DocumentData>): ChatMessage {
  const data = docSnapshot.data();

  return {
    id: docSnapshot.id,
    role: data.role === "assistant" ? "assistant" : "user",
    content: typeof data.content === "string" ? data.content : "",
    createdAt: toDate(data.createdAt),
    provider: "openai",
    model: typeof data.model === "string" ? data.model : "",
    status: data.status === "failed" ? "failed" : "completed",
    error: typeof data.error === "string" ? data.error : null,
    sequence: typeof data.sequence === "number" ? data.sequence : null,
  };
}

async function getNextMessageSequence(uid: string, sessionId: string): Promise<number> {
  if (!db) {
    return 0;
  }

  const messagesQuery = query(
    collection(db, "users", uid, "sessions", sessionId, "messages"),
    orderBy("createdAt", "asc"),
    limit(100),
  );
  const snapshot = await getDocs(messagesQuery);
  const maxSequence = snapshot.docs.reduce((max, messageSnapshot, index) => {
    const sequence = messageSnapshot.data().sequence;
    return typeof sequence === "number" ? Math.max(max, sequence) : Math.max(max, index);
  }, -1);

  return maxSequence + 1;
}

function sortMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => {
    if (a.sequence !== null && b.sequence !== null && a.sequence !== b.sequence) {
      return a.sequence - b.sequence;
    }

    const aTime = a.createdAt?.getTime() ?? 0;
    const bTime = b.createdAt?.getTime() ?? 0;

    if (aTime !== bTime) {
      return aTime - bTime;
    }

    if (a.role !== b.role) {
      return a.role === "user" ? -1 : 1;
    }

    return a.id.localeCompare(b.id);
  });
}

function toDate(value: unknown): Date | null {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate() as Date;
  }

  return null;
}

function normalizeTitle(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();

  if (!compact) {
    return "新しいチャット";
  }

  return compact.length > 40 ? `${compact.slice(0, 40)}...` : compact;
}
