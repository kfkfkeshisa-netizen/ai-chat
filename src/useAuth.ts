import { useEffect, useState } from "react";
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "./firebase";

type AuthState = {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  isConfigured: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
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
      (nextUser) => {
        setUser(nextUser);
        setIsLoading(false);
      },
      (authError) => {
        setError(authError.message);
        setIsLoading(false);
      },
    );
  }, []);

  async function signInWithEmail(email: string, password: string) {
    if (!auth) {
      setError("Firebase設定が未完了です。");
      return;
    }

    setError(null);
    await signInWithEmailAndPassword(auth, email, password);
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
    signInWithEmail,
    signOut,
  };
}
