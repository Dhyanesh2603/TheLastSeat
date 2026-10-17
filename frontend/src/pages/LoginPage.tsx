import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield, User } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login, register, quickSwitch } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'student' | 'admin'>('student');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, fullName, role);
      }
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Authentication failed. Please verify credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuick = async (targetRole: 'student' | 'admin') => {
    setIsLoading(true);
    try {
      await quickSwitch(targetRole);
      navigate(targetRole === 'admin' ? '/admin' : '/');
    } catch (err: any) {
      setError('Quick switch failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-neutral-800 bg-[#0e0f13] p-6 shadow-2xl space-y-6">
        
        {/* Title */}
        <div className="text-center space-y-1">
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded border border-neutral-700 bg-neutral-900 font-mono text-xs font-bold text-white">
            500
          </div>
          <h2 className="text-base font-bold tracking-tight text-white m-0">Concert Booking Platform</h2>
          <p className="text-xs text-neutral-400">High-Concurrency ACID Booking Demo</p>
        </div>

        {/* Quick Demo Switcher */}
        <div className="space-y-2 border-y border-neutral-800/80 py-4">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-neutral-500 text-center">
            One-Click Demo Access
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuick('student')}
              className="flex items-center justify-center space-x-1.5 rounded border border-neutral-700 bg-neutral-800/80 px-3 py-2 text-xs font-medium text-white hover:bg-neutral-700"
            >
              <User className="h-3.5 w-3.5" />
              <span>Student Demo</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuick('admin')}
              className="flex items-center justify-center space-x-1.5 rounded border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-xs font-medium text-amber-300 hover:bg-amber-900/30"
            >
              <Shield className="h-3.5 w-3.5" />
              <span>Admin Demo</span>
            </button>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="flex rounded border border-neutral-800 bg-neutral-900 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 rounded py-1 transition-colors ${
              mode === 'login' ? 'bg-neutral-800 text-white font-medium' : 'text-neutral-400'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`flex-1 rounded py-1 transition-colors ${
              mode === 'register' ? 'bg-neutral-800 text-white font-medium' : 'text-neutral-400'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded border border-red-900/60 bg-red-950/20 p-2.5 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs font-mono">
          {mode === 'register' && (
            <div>
              <label className="block text-neutral-400 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-white placeholder-neutral-600 focus:border-neutral-500 focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-neutral-400 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@college.edu"
              className="w-full rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-white placeholder-neutral-600 focus:border-neutral-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-white placeholder-neutral-600 focus:border-neutral-500 focus:outline-none"
            />
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-neutral-400 mb-1">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-white focus:border-neutral-500 focus:outline-none"
              >
                <option value="student">Student</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 rounded bg-white py-2 text-xs font-semibold text-black transition-colors hover:bg-neutral-200 disabled:opacity-50"
          >
            {isLoading ? 'Processing...' : mode === 'login' ? 'Sign In' : 'Register Account'}
          </button>
        </form>

      </div>
    </div>
  );
};
