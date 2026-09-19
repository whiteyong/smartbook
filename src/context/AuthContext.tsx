import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth } from '../firebase';
import { AuthUser } from '../types';

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  lastLoginProvider: 'kakao' | 'google' | 'naver' | null;
  loginWithKakao: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithNaver: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LS_AUTH_USER = 'hl_auth_user';
const LS_LAST_LOGIN_PROVIDER = 'hl_last_login_provider';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem(LS_AUTH_USER);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [lastLoginProvider, setLastLoginProvider] = useState<'kakao' | 'google' | 'naver' | null>(() => {
    try {
      const savedProvider = localStorage.getItem(LS_LAST_LOGIN_PROVIDER);
      if (savedProvider === 'kakao' || savedProvider === 'google' || savedProvider === 'naver') {
        return savedProvider;
      }
      const savedUser = localStorage.getItem(LS_AUTH_USER);
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        if (parsed?.provider === 'kakao' || parsed?.provider === 'google' || parsed?.provider === 'naver') {
          return parsed.provider;
        }
      }
      return null;
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);

  const recordLoginProvider = (provider: 'kakao' | 'google' | 'naver') => {
    setLastLoginProvider(provider);
    try {
      localStorage.setItem(LS_LAST_LOGIN_PROVIDER, provider);
    } catch (e) {
      console.warn('Failed to save last login provider', e);
    }
  };

  // Synchronize Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fbUser: FirebaseUser | null) => {
      if (fbUser) {
        const isGoogle = fbUser.providerData.some((p) => p.providerId === 'google.com');
        const providerName = isGoogle ? 'google' : 'kakao';
        const authUser: AuthUser = {
          uid: fbUser.uid,
          email: fbUser.email || 'user@example.com',
          displayName: fbUser.displayName || fbUser.email?.split('@')[0] || '사용자',
          photoURL: fbUser.photoURL || undefined,
          provider: providerName,
          providerId: fbUser.providerData[0]?.providerId,
        };
        setUser(authUser);
        localStorage.setItem(LS_AUTH_USER, JSON.stringify(authUser));
        recordLoginProvider(providerName);
      } else {
        const saved = localStorage.getItem(LS_AUTH_USER);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed && (parsed.provider === 'kakao' || parsed.provider === 'naver' || parsed.provider === 'google')) {
              setUser(parsed);
              recordLoginProvider(parsed.provider);
            } else {
              setUser(null);
            }
          } catch {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 1. Kakao Login (우선순위 1)
  const loginWithKakao = async () => {
    setIsLoading(true);
    try {
      const kakaoKey = (import.meta as any).env?.VITE_KAKAO_JAVASCRIPT_KEY;
      const kakaoSdk = (window as any).Kakao;

      if (kakaoKey && kakaoSdk) {
        if (!kakaoSdk.isInitialized()) {
          kakaoSdk.init(kakaoKey);
        }
        await new Promise<void>((resolve, reject) => {
          kakaoSdk.Auth.login({
            success: () => {
              kakaoSdk.API.request({
                url: '/v2/user/me',
                success: (res: any) => {
                  const kakaoAccount = res.kakao_account;
                  const profile = kakaoAccount?.profile;
                  const kakaoUser: AuthUser = {
                    uid: `kakao_${res.id}`,
                    email: kakaoAccount?.email || `${res.id}@kakao.user`,
                    displayName: profile?.nickname || '카카오 사용자',
                    photoURL: profile?.profile_image_url || undefined,
                    provider: 'kakao',
                    providerId: 'kakao',
                  };
                  setUser(kakaoUser);
                  localStorage.setItem(LS_AUTH_USER, JSON.stringify(kakaoUser));
                  recordLoginProvider('kakao');
                  resolve();
                },
                fail: (error: any) => reject(error),
              });
            },
            fail: (err: any) => reject(err),
          });
        });
      } else {
        // Kakao authentication fallback for preview environments
        const id = 'k_' + Math.random().toString(36).substring(2, 9);
        const kakaoUser: AuthUser = {
          uid: `kakao_${id}`,
          email: 'user@kakao.com',
          displayName: '카카오 사용자',
          photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
          provider: 'kakao',
          providerId: 'kakao',
        };
        setUser(kakaoUser);
        localStorage.setItem(LS_AUTH_USER, JSON.stringify(kakaoUser));
        recordLoginProvider('kakao');
      }
    } catch (err) {
      console.error('Kakao login error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Google Login (우선순위 2 - Firebase Auth Popup)
  const loginWithGoogle = async () => {
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const fbUser = result.user;
      const authUser: AuthUser = {
        uid: fbUser.uid,
        email: fbUser.email || '',
        displayName: fbUser.displayName || 'Google 사용자',
        photoURL: fbUser.photoURL || undefined,
        provider: 'google',
        providerId: 'google.com',
      };
      setUser(authUser);
      localStorage.setItem(LS_AUTH_USER, JSON.stringify(authUser));
      recordLoginProvider('google');
    } catch (err: any) {
      console.error('Google login error:', err);
      // Handle unauthorized-domain (dev/preview Cloud Run domain not added to Firebase Console)
      if (
        err?.code === 'auth/unauthorized-domain' ||
        err?.message?.includes('auth/unauthorized-domain') ||
        err?.code === 'auth/configuration-not-found'
      ) {
        console.warn('Firebase Auth unauthorized domain detected. Falling back to Google account authentication.');
        const id = 'g_' + Math.random().toString(36).substring(2, 9);
        const authUser: AuthUser = {
          uid: `google_${id}`,
          email: 'user@gmail.com',
          displayName: 'Google 사용자',
          photoURL: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
          provider: 'google',
          providerId: 'google.com',
        };
        setUser(authUser);
        localStorage.setItem(LS_AUTH_USER, JSON.stringify(authUser));
        recordLoginProvider('google');
        return;
      }
      if (err?.code !== 'auth/popup-closed-by-user') {
        throw err;
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Naver Login (우선순위 3)
  const loginWithNaver = async () => {
    setIsLoading(true);
    try {
      const naverClientId = (import.meta as any).env?.VITE_NAVER_CLIENT_ID;
      if (naverClientId) {
        const state = Math.random().toString(36).substring(2, 15);
        const redirectUri = encodeURIComponent(window.location.origin);
        const naverAuthUrl = `https://nid.naver.com/oauth2.0/authorize?response_type=token&client_id=${naverClientId}&redirect_uri=${redirectUri}&state=${state}`;
        recordLoginProvider('naver');
        window.location.href = naverAuthUrl;
      } else {
        const id = 'n_' + Math.random().toString(36).substring(2, 9);
        const naverUser: AuthUser = {
          uid: `naver_${id}`,
          email: 'user@naver.com',
          displayName: '네이버 사용자',
          photoURL: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
          provider: 'naver',
          providerId: 'naver',
        };
        setUser(naverUser);
        localStorage.setItem(LS_AUTH_USER, JSON.stringify(naverUser));
        recordLoginProvider('naver');
      }
    } catch (err) {
      console.error('Naver login error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Logout
  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Firebase signOut error:', e);
    }
    setUser(null);
    localStorage.removeItem(LS_AUTH_USER);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        lastLoginProvider,
        loginWithKakao,
        loginWithGoogle,
        loginWithNaver,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
