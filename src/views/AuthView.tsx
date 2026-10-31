import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ServerConfigModal } from '../components/ServerConfigModal';
import { getStoredSupabaseConfig } from '../lib/supabase';
import { Lock, Users, Crown, ShieldAlert, ArrowRight, Video, Server, CheckCircle2, AlertTriangle } from 'lucide-react';
import { UserRole } from '../types';

export const AuthView: React.FC = () => {
  const { signIn, signUp, founderExists, refreshFounderStatus } = useAuth();
  const [authMode, setAuthMode] = useState<'signIn' | 'teamRegister' | 'founderSetup'>('signIn');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('editor');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  const currentConfig = getStoredSupabaseConfig();
  const isDefaultConfig = currentConfig.url.includes('xyzcompany.supabase.co') || currentConfig.key.includes('dummy_anon_key');

  const handleTabChange = (mode: 'signIn' | 'teamRegister' | 'founderSetup') => {
    setAuthMode(mode);
    setErrorMessage(null);
    setSuccessMessage(null);
    if (mode === 'founderSetup') {
      refreshFounderStatus();
    }
  };

  const sanitizeError = (err: string | undefined): string => {
    if (!err) return 'An error occurred';
    if (err.includes('Failed to fetch') || err.includes('NetworkError')) {
      return 'Cannot reach Supabase database ("Failed to fetch"). Tap "Configure Supabase Connection" below to enter your real Supabase Project URL & Anon Key.';
    }
    return err;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    const res = await signIn(email, password);
    setIsLoading(false);
    if (res.error) {
      setErrorMessage(sanitizeError(res.error));
    }
  };

  const handleTeamSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password) {
      setErrorMessage('Please fill in all registration fields.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    const res = await signUp(email, password, fullName, selectedRole);
    setIsLoading(false);
    if (res.error) {
      setErrorMessage(sanitizeError(res.error));
    }
  };

  const handleFounderSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password) {
      setErrorMessage('Please fill in all founder details.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    const res = await signUp(email, password, fullName, 'founder');
    setIsLoading(false);
    if (res.error) {
      setErrorMessage(sanitizeError(res.error));
      refreshFounderStatus();
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-[#0B1120] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-brand-navy to-brand-blue flex items-center justify-center shadow-lg shadow-blue-500/30 text-white mb-3">
            <Video className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-black tracking-wider uppercase text-brand-navy dark:text-white">
            Studio DiskFlow
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Video Production & Social Media Publishing
          </p>
        </div>

        {/* Top Navigation Bar / Segmented Bar */}
        <div className="flex p-1 bg-slate-200 dark:bg-slate-800 rounded-xl mb-4">
          <button
            onClick={() => handleTabChange('signIn')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all ${
              authMode === 'signIn'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>

          <button
            onClick={() => handleTabChange('teamRegister')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all ${
              authMode === 'teamRegister'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Team Register</span>
          </button>

          <button
            onClick={() => handleTabChange('founderSetup')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all ${
              authMode === 'founderSetup'
                ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
                : 'text-amber-600 dark:text-amber-400 hover:text-amber-700'
            }`}
          >
            <Crown className="w-3.5 h-3.5" />
            <span>Founder Setup</span>
          </button>
        </div>

        {isDefaultConfig && (
          <div 
            onClick={() => setShowConfig(true)}
            className="mb-4 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-2.5 cursor-pointer hover:bg-amber-500/15 transition-colors shadow-sm"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Supabase Not Connected Yet</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Click here to enter your Supabase Project URL & Anon Key to connect this app to your database.
              </p>
            </div>
          </div>
        )}

        {/* Form Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          {errorMessage && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs mb-4">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs mb-4">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* TAB 1: SIGN IN */}
          {authMode === 'signIn' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Work Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="editor@studio.com"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white rounded-xl text-sm font-bold shadow-md shadow-blue-500/25 transition-all disabled:opacity-50"
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* TAB 2: TEAM REGISTER (EDITOR / MANAGER) */}
          {authMode === 'teamRegister' && (
            <form onSubmit={handleTeamSignUp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Alex Rivera"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Work Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@studio.com"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Select Role
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedRole('editor')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all text-center ${
                      selectedRole === 'editor'
                        ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500'
                    }`}
                  >
                    🎬 Video Editor
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRole('social_media_manager')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all text-center ${
                      selectedRole === 'social_media_manager'
                        ? 'border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500'
                    }`}
                  >
                    📱 Social Media Mgr
                  </button>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/50 text-slate-500 text-[11px]">
                Founder role is not selectable here. Use the Founder Setup tab if not yet registered.
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white rounded-xl text-sm font-bold shadow-md shadow-blue-500/25 transition-all disabled:opacity-50"
              >
                {isLoading ? 'Creating account...' : `Register as ${selectedRole === 'editor' ? 'Video Editor' : 'Social Media Manager'}`}
              </button>
            </form>
          )}

          {/* TAB 3: FOUNDER SETUP (SINGLE FOUNDER LOCKOUT) */}
          {authMode === 'founderSetup' && (
            <div>
              {founderExists ? (
                /* LOCKED STATE */
                <div className="text-center py-4 space-y-3">
                  <div className="w-14 h-14 mx-auto rounded-full bg-rose-500/15 text-rose-500 flex items-center justify-center">
                    <ShieldAlert className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Founder Account Claimed
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 px-4 leading-relaxed">
                      A primary founder account has already been registered for this workspace. Only <strong>ONE founder account</strong> is permitted per organization.
                    </p>
                  </div>
                  <div className="pt-2">
                    <button
                      onClick={() => handleTabChange('signIn')}
                      className="w-full py-2.5 px-4 bg-brand-navy dark:bg-slate-700 hover:opacity-90 text-white rounded-xl text-xs font-bold transition-all"
                    >
                      Return to Sign In
                    </button>
                  </div>
                </div>
              ) : (
                /* UNCLAIMED FOUNDER REGISTRATION FORM */
                <form onSubmit={handleFounderSignUp} className="space-y-4">
                  <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/15 border border-amber-500/20 text-amber-600 dark:text-amber-400">
                    <Crown className="w-5 h-5 flex-shrink-0" />
                    <div className="text-xs">
                      <p className="font-bold">Claim Primary Founder Account</p>
                      <p className="text-[11px] opacity-90">First user gets master administrative oversight & Google Sheets sync.</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Founder Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Founder Name"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Founder Work Email
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="founder@company.com"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Master Password
                    </label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 6 characters"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Confirm Master Password
                    </label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat password"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-white rounded-xl text-sm font-bold shadow-md shadow-amber-500/25 transition-all disabled:opacity-50"
                  >
                    {isLoading ? 'Creating Founder...' : 'Create Primary Founder Account'}
                    <Crown className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Server Config Trigger Footer */}
        <div className="mt-4 text-center">
          <button
            onClick={() => setShowConfig(true)}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <Server className="w-3.5 h-3.5" />
            <span>Configure Supabase Connection</span>
          </button>
        </div>
      </div>

      <ServerConfigModal isOpen={showConfig} onClose={() => setShowConfig(false)} />
    </div>
  );
};
