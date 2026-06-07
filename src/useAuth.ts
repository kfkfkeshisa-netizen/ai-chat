import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "./firebase";

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
        if (nextUser && !(await isAllowedUser(nextUser))) {
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

    if (!(await isAllowedUser(result.user))) {
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

async function isAllowedUser(user: User): Promise<boolean> {
  if (!db) {
    return false;
  }

  try {
    await getDoc(doc(db, "accessChecks", user.uid));
    return true;
  } catch {
    return false;
  }
}
