import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';

const AUTH_API_URL = 'http://192.168.52.41:8000/api/v1/auth';
interface AuthContextType {
  userToken: string | null;
  userPhone: string | null;
  isLoading: boolean;
  signIn: (phone: string, pin: string) => Promise<void>;
  signUp: (phone: string, pin: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [userToken, setUserToken] = useState<string | null>(null);
  const [userPhone, setUserPhone] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const token = await SecureStore.getItemAsync('userToken');
        const phone = await SecureStore.getItemAsync('userPhone');
        if (token) {
          setUserToken(token);
          setUserPhone(phone);
        }
      } catch (e) {
        console.error('Failed to load session:', e);
      } finally {
        setIsLoading(false);
      }
    };
    loadSession();
  }, []);

  const signIn = async (phone: string, pin: string) => {
    const response = await fetch(`${AUTH_API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, pin }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || 'Sign in failed.');
    }

    await SecureStore.setItemAsync('userToken', data.access_token);
    await SecureStore.setItemAsync('userPhone', data.phone);
    setUserToken(data.access_token);
    setUserPhone(data.phone);
    router.replace('/(tabs)' as any);
  };

  const signUp = async (phone: string, pin: string) => {
    const response = await fetch(`${AUTH_API_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, pin }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || 'Registration failed.');
    }

    await SecureStore.setItemAsync('userToken', data.access_token);
    await SecureStore.setItemAsync('userPhone', data.phone);
    setUserToken(data.access_token);
    setUserPhone(data.phone);
    router.replace('/(tabs)' as any);
  };

  const signOut = async () => {
    await SecureStore.deleteItemAsync('userToken');
    await SecureStore.deleteItemAsync('userPhone');
    setUserToken(null);
    setUserPhone(null);
    router.replace('/login' as any);
  };

  return (
    <AuthContext.Provider value={{ userToken, userPhone, isLoading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);