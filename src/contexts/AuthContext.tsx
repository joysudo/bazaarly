import { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  GoogleAuthProvider, signInWithPopup,
  signOut as fbSignOut, deleteUser,
  onAuthStateChanged, reauthenticateWithPopup,
} from 'firebase/auth';
import { auth } from '../lib/firebase';

const provider = new GoogleAuthProvider();

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, u => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const signInWithGoogle = () => signInWithPopup(auth, provider).then(() => {});

  const signOut = () => fbSignOut(auth);

  const deleteAccount = async () => {
    const current = auth.currentUser;
    if (!current) return;
    try {
      await deleteUser(current);
    } catch (e: unknown) {
      // Requires recent sign-in — re-auth then retry
      if ((e as { code?: string }).code === 'auth/requires-recent-login') {
        await reauthenticateWithPopup(current, provider);
        await deleteUser(current);
      } else {
        throw e;
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
