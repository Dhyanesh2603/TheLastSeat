import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield, Ticket, Activity, RefreshCw } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout, quickSwitch } = useAuth();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-800 bg-[#0d0e12]/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        
        {/* Left: Branding & Status */}
        <div className="flex items-center space-x-4">
          <Link to="/" className="flex items-center space-x-2 text-sm font-semibold tracking-wider text-neutral-100">
            <span className="flex h-6 w-6 items-center justify-center rounded border border-neutral-700 bg-neutral-900 text-xs font-mono text-emerald-400">
              500
            </span>
            <span className="tracking-tight uppercase">Concert // Booking Platform</span>
          </Link>

          <div className="hidden items-center space-x-2 rounded-full border border-neutral-800 bg-neutral-900/60 px-2.5 py-0.5 text-xs text-neutral-400 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-[11px] text-neutral-300">ACID // REDIS ACTIVE</span>
          </div>
        </div>

        {/* Center: Navigation Links */}
        <nav className="flex items-center space-x-1">
          <Link
            to="/"
            className={`flex items-center space-x-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive('/')
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'
            }`}
          >
            <Ticket className="h-3.5 w-3.5" />
            <span>Seat Map</span>
          </Link>

          <Link
            to="/history"
            className={`flex items-center space-x-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive('/history')
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>My Bookings</span>
          </Link>

          <Link
            to="/admin"
            className={`flex items-center space-x-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive('/admin')
                ? 'bg-neutral-800 text-amber-400'
                : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'
            }`}
          >
            <Shield className="h-3.5 w-3.5" />
            <span>Admin Studio</span>
          </Link>
        </nav>

        {/* Right: Quick Role Switcher & Auth */}
        <div className="flex items-center space-x-3 text-xs">
          {user ? (
            <div className="flex items-center space-x-2">
              <span className="hidden font-mono text-[11px] text-neutral-400 md:inline">
                {user.email} ({user.role})
              </span>
              <button
                onClick={() => quickSwitch(user.role === 'admin' ? 'student' : 'admin')}
                className="flex items-center space-x-1 rounded border border-neutral-700 bg-neutral-800/80 px-2 py-1 text-neutral-300 hover:border-neutral-500 hover:text-white"
                title="Switch persona"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Switch to {user.role === 'admin' ? 'Student' : 'Admin'}</span>
              </button>
              <button
                onClick={logout}
                className="rounded px-2 py-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
              >
                Logout
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => quickSwitch('student')}
                className="rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-neutral-300 hover:border-neutral-500 hover:text-white"
              >
                Student Demo
              </button>
              <button
                onClick={() => quickSwitch('admin')}
                className="rounded border border-amber-900/60 bg-amber-950/20 px-2.5 py-1 text-amber-300 hover:border-amber-700"
              >
                Admin Demo
              </button>
            </div>
          )}
        </div>

      </div>
    </header>
  );
};
