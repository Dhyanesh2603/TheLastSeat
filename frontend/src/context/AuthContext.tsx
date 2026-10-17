import React, { createContext, useState, useEffect } from 'react';
import type { User, UserRole } from '../types';
import { authApi } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string, role?: string) => Promise<void>;
  logout: () => void;
  quickSwitch: (role: UserRole) => Promise<void>;
}

export { useAuth } from './useAuth';
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('concert_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchUser = async () => {
      let currentToken = token;
      if (!currentToken) {
        try {
          // Auto-authenticate as default student for instant seamless UX
          const data = await authApi.login('student@college.edu', 'StudentPass123!');
          localStorage.setItem('concert_token', data.access_token);
          setToken(data.access_token);
          setUser(data.user);
          setIsLoading(false);
          return;
        } catch {
          // fallback if offline
        }
      }
      if (currentToken) {
        try {
          const userData = await authApi.getMe();
          setUser(userData);
        } catch {
          localStorage.removeItem('concert_token');
          setToken(null);
          setUser(null);
        }
      }
      setIsLoading(false);
    };
    fetchUser();
  }, [token]);

  const login = async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    localStorage.setItem('concert_token', data.access_token);
    setToken(data.access_token);
    setUser(data.user);
  };

  const register = async (email: string, password: string, fullName: string, role = 'student') => {
    await authApi.register(email, password, fullName, role);
    await login(email, password);
  };

  const logout = () => {
    localStorage.removeItem('concert_token');
    setToken(null);
    setUser(null);
  };

  const quickSwitch = async (role: UserRole) => {
    if (role === 'admin') {
      await login('admin@college.edu', 'AdminPass123!');
    } else {
      await login('student@college.edu', 'StudentPass123!');
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, quickSwitch }}>
      {children}
    </AuthContext.Provider>
  );
};

