import { useMemo, useState, type FormEvent } from 'react';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import Swal from 'sweetalert2';
import { createApiFetch } from '../../lib/api';
import { safeLocalStorage } from '../../lib/theme';
import type { AppUser } from '../../lib/types';

const viteEnv = (import.meta as any).env || {};
const firebaseConfig = {
  projectId: viteEnv.VITE_FIREBASE_PROJECT_ID || '',
  appId: viteEnv.VITE_FIREBASE_APP_ID || '',
  apiKey: viteEnv.VITE_FIREBASE_API_KEY || '',
  authDomain: viteEnv.VITE_FIREBASE_AUTH_DOMAIN || '',
  storageBucket: viteEnv.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: viteEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || ''
};

function hasFirebaseConfig() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.appId && firebaseConfig.projectId && firebaseConfig.authDomain);
}

function getFirebaseApp(): FirebaseApp {
  if (!hasFirebaseConfig()) {
    throw new Error('Firebase OAuth config belum lengkap. Isi VITE_FIREBASE_* di .env atau abaikan tombol Google Drive.');
  }
  return getApps()[0] || initializeApp(firebaseConfig);
}

export type LoginData = { username: string; password: string };

export function useAuth() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(safeLocalStorage.getItem('google_token'));
  const [sessionToken, setSessionToken] = useState<string | null>(safeLocalStorage.getItem('session_token'));
  const [loginData, setLoginData] = useState<LoginData>({ username: '', password: '' });
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const logout = () => {
    setUser(null);
    setSessionToken(null);
    safeLocalStorage.removeItem('session_token');
  };

  const apiFetch = useMemo(
    () => createApiFetch({
      getSessionToken: () => sessionToken,
      getGoogleToken: () => googleToken,
      onUnauthorized: logout,
    }),
    [sessionToken, googleToken]
  );

  const handleGoogleLogin = async () => {
    try {
      setIsAuthLoading(true);
      const firebaseAuth = getAuth(getFirebaseApp());
      const googleProvider = new GoogleAuthProvider();
      googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
      googleProvider.addScope('https://www.googleapis.com/auth/drive');
      googleProvider.addScope('https://www.googleapis.com/auth/documents');

      const result = await signInWithPopup(firebaseAuth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      if (token) {
        setGoogleToken(token);
        safeLocalStorage.setItem('google_token', token);
        Swal.fire('Success', 'Connected to Google Drive!', 'success');
      }
    } catch (error: any) {
      console.error(error);
      Swal.fire('Error', 'Google Connection Failed: ' + error.message, 'error');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    try {
      const res = await apiFetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
        if (data.sessionToken) {
          setSessionToken(data.sessionToken);
          safeLocalStorage.setItem('session_token', data.sessionToken);
        }
        Swal.fire({ icon: 'success', title: 'Welcome!', text: `Logged in as ${data.user.displayName || data.user.fullName || data.user.username}`, timer: 1500, showConfirmButton: false });
      } else {
        Swal.fire('Error', data.message || 'Invalid credentials', 'error');
      }
    } catch {
      Swal.fire('Error', 'Connection failed', 'error');
    } finally {
      setIsAuthLoading(false);
    }
  };

  return {
    user,
    setUser,
    googleToken,
    sessionToken,
    loginData,
    setLoginData,
    isAuthLoading,
    apiFetch,
    handleLogin,
    handleGoogleLogin,
    handleLogout: logout,
  };
}
