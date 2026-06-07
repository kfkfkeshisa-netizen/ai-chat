import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "./firebase";

const allowedEmails = String(import.meta.env.VITE_ALLOWED_EMAILS ?? "")
  .split(",")
  .map((email: string) => email.trim().toLowerCase())
  .filter(Boolean);

type AuthState = {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  isConfigured: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(isFirebaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) {
      setIsLoading(false);
      return;
    }

    const currentAuth = auth;
    return onAuthStateChanged(
      currentAuth,
      async (nextUser) => {
        if (nextUser && !isAllowedUser(nextUser)) {
          setUser(null);
          setError("このGoogleアカウントはこのアプリの利用を許可されていません。");
          await firebaseSignOut(currentAuth);
          setIsLoading(false);
          return;
        }

        setUser(nextUser);
        setIsLoading(false);
      },
      (authError) => {
        setError(authError.message);
        setIsLoading(false);
      },
    );
  }, []);

  async function signInWithGoogle() {
    if (!auth) {
      setError("Firebase設定が未完了です。");
      return;
    }

    setError(null);
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);

    if (!isAllowedUser(result.user)) {
      await firebaseSignOut(auth);
      setUser(null);
      setError("このGoogleアカウントはこのアプリの利用を許可されていません。");
    }
  }

  async function signOut() {
    if (!auth) {
      return;
    }

    await firebaseSignOut(auth);
  }

  return {
    user,
    isLoading,
    error,
    isConfigured: isFirebaseConfigured,
    signInWithGoogle,
    signOut,
  };
}

function isAllowedUser(user: User): boolean {
  const email = user.email?.toLowerCase();

  if (!email) {
    return false;
  }

  return allowedEmails.includes(email);
}
