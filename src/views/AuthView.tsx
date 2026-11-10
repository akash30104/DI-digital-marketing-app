import React, { useState, useEffect } from 'react';
import { useAuth, isFounderEmail } from '../context/AuthContext';
import { Lock, Users, Crown, ShieldAlert, ArrowRight, CheckCircle2, Briefcase, Film, Mail, KeyRound, Sparkles } from 'lucide-react';
import { getInvitationByToken } from '../lib/api';
import { Invitation } from '../types';

interface AuthViewProps {
  onShowPrivacy?: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onShowPrivacy }) => {
  const { signIn, signUp, acceptInvitation, resetPassword, refreshFounderStatus, founderExists } = useAuth();

  // Mode: 'login' | 'invite' | 'forgot_password'
  const [authMode, setAuthMode] = useState<'login' | 'invite' | 'forgot_password'>('login');

  // All-in-one Hosting: Toggle between Studio Team and Client Portal
  const [portalType, setPortalType] = useState<'studio' | 'client'>('studio');
  
  // Developer / Founder Option (Available ONLY during initial setup before founder exists)
  const [isDevFounderMode, setIsDevFounderMode] = useState(false);
  const [devTab, setDevTab] = useState<'setup' | 'signin'>('setup');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');

  // Automatically lock and exit dev mode once founder account exists
  useEffect(() => {
    if (founderExists) {
      setIsDevFounderMode(false);
    }
  }, [founderExists]);

  // Invitation state
  const [inviteToken, setInviteToken] = useState('');
  const [foundInvitation, setFoundInvitation] = useState<Invitation | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const resetMessages = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // Check URL query for ?invite=token
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tokenParam = params.get('invite') || params.get('token');
      if (tokenParam) {
        setInviteToken(tokenParam);
        setAuthMode('invite');
        lookupInvite(tokenParam);
      }
    } catch {
      // ignore
    }
  }, []);

  const lookupInvite = async (t: string) => {
    if (!t.trim()) return;
    setIsLoading(true);
    resetMessages();
    const inv = await getInvitationByToken(t.trim());
    setIsLoading(false);
    if (inv) {
      setFoundInvitation(inv);
      setEmail(inv.email);
      if (inv.full_name) setFullName(inv.full_name);
    } else {
      setErrorMessage('Invitation token not found or already redeemed.');
      setFoundInvitation(null);
    }
  };

  const sanitizeError = (err: string | undefined): string => {
    if (!err) return 'An error occurred';
    if (err.includes('Failed to fetch') || err.includes('NetworkError')) {
      return 'Cannot reach database ("Failed to fetch"). Please check your internet connection.';
    }
    if (err.includes('rate limit') || err.includes('over_email_send_rate_limit')) {
      return 'Supabase email rate limit reached. To allow instant team signups without waiting for emails, please turn OFF "Confirm email" in Supabase Dashboard (Authentication -> Providers -> Email).';
    }
    if (err.includes('Email not confirmed')) {
      return 'Email not confirmed yet. Please verify your email via Gmail, or disable "Confirm email" in Supabase Dashboard (Authentication -> Providers -> Email).';
    }
    return err;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    resetMessages();
    const clean = email.trim().toLowerCase();
    const targetRole = portalType === 'client' ? 'client' : (isFounderEmail(clean) ? 'founder' : undefined);
    const res = await signIn(clean, password.trim(), targetRole);
    setIsLoading(false);
    if (res.error) {
      setErrorMessage(sanitizeError(res.error));
    }
  };

  const handleDevFounderSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    resetMessages();
    const res = await signIn(email.trim().toLowerCase(), password.trim(), 'founder');
    setIsLoading(false);
    if (res.error) {
      setErrorMessage(sanitizeError(res.error));
    }
  };

  const handleCreateFounder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    resetMessages();
    const res = await signUp(
      email.trim().toLowerCase(),
      password.trim(),
      fullName.trim() || 'Akash Sharma',
      'founder'
    );
    setIsLoading(false);
    if (res.error) {
      setErrorMessage(sanitizeError(res.error));
    } else {
      setIsDevFounderMode(false);
      setSuccessMessage('Founder account created successfully! Entering workspace...');
    }
  };

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    resetMessages();
    const res = await acceptInvitation(inviteToken.trim(), password.trim(), fullName.trim());
    setIsLoading(false);
    if (res.error) {
      setErrorMessage(res.error);
    } else {
      setSuccessMessage('Invitation accepted! Entering workspace...');
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMessage('Please enter your account email address.');
      return;
    }
    setIsLoading(true);
    resetMessages();
    const res = await resetPassword(email.trim());
    setIsLoading(false);
    if (res.error) {
      setErrorMessage(sanitizeError(res.error));
    } else {
      setSuccessMessage(`Password reset link sent to ${email.trim()}! Please check your email inbox.`);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div 
            onClick={() => {
              if (!founderExists) {
                setIsDevFounderMode(prev => !prev);
                resetMessages();
              }
            }}
            className={`w-20 h-20 mx-auto rounded-3xl bg-white p-2.5 flex items-center justify-center shadow-2xl mb-3 overflow-hidden border border-zinc-200 select-none ${
              !founderExists 
                ? 'cursor-pointer hover:scale-105 active:scale-95 transition-all group relative' 
                : ''
            }`}
            title={!founderExists ? 'Initial Setup: Create Primary Founder Account' : 'Digital Inertia'}
          >
            <img src="/logo.png" alt="Digital Inertia" className="w-full h-full object-contain pointer-events-none" />
            {!founderExists && (
              <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl flex items-center justify-center">
                <span className="text-[9px] font-black uppercase text-black bg-white/95 px-1.5 py-0.5 rounded shadow">Setup 👑</span>
              </div>
            )}
          </div>
          <h1 className="text-xl font-black tracking-[0.16em] uppercase text-white">
            Digital Inertia
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Production &amp; Social Media Management App
          </p>
          {!founderExists && (
            <button
              type="button"
              onClick={() => {
                setIsDevFounderMode(prev => !prev);
                resetMessages();
              }}
              className="mt-2 text-[10px] text-zinc-400 hover:text-white transition flex items-center justify-center gap-1 mx-auto bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-full shadow-sm"
            >
              <Crown className="w-3 h-3 text-zinc-300" />
              <span>{isDevFounderMode ? '← Back to standard login' : 'Initial Setup: Create Founder Account'}</span>
            </button>
          )}
        </div>

        {/* ALL-IN-ONE HOSTING: TOGGLE BUTTON (Hidden when in Dev Founder Mode) */}
        {!isDevFounderMode && (
          <div className="space-y-2 mb-4">
            <div className="p-1 bg-zinc-900 border border-zinc-800 rounded-2xl flex gap-1 shadow-xl">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setPortalType('studio');
                  resetMessages();
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                  authMode === 'login' && portalType === 'studio'
                    ? 'bg-white text-black font-black shadow-lg scale-[1.01]'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Studio Team</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setPortalType('client');
                  resetMessages();
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                  authMode === 'login' && portalType === 'client'
                    ? 'bg-white text-black font-black shadow-lg scale-[1.01]'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                <Briefcase className="w-3.5 h-3.5" />
                <span>Client Portal</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAuthMode('invite');
                  resetMessages();
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                  authMode === 'invite'
                    ? 'bg-white text-black font-black shadow-lg scale-[1.01]'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Accept Invite</span>
              </button>
            </div>
          </div>
        )}

        {/* Form Card */}
        <div className="bg-zinc-900 rounded-3xl shadow-xl border border-zinc-800 p-6">
          {errorMessage && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs mb-4">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5 text-white" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs mb-4">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-white" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* ==================== INITIAL SETUP: FOUNDER ACCESS (LOCKED ONCE CREATED) ==================== */}
          {isDevFounderMode && !founderExists ? (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-3 bg-black border border-zinc-800 rounded-2xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-white shrink-0" />
                  <div>
                    <span className="font-black text-white block text-[11px] uppercase tracking-wider">
                      Setup Platform Founder
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      Create the one and only primary Founder account
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsDevFounderMode(false);
                    resetMessages();
                  }}
                  className="text-[10px] font-bold text-zinc-400 hover:text-white bg-zinc-800 px-2.5 py-1 rounded-lg border border-zinc-700 transition"
                >
                  Back
                </button>
              </div>

              {/* Sub-tabs: Setup vs Sign In */}
              <div className="flex p-1 bg-black rounded-xl border border-zinc-800 gap-1 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => { setDevTab('setup'); resetMessages(); }}
                  className={`flex-1 py-1.5 rounded-lg transition ${devTab === 'setup' ? 'bg-white text-black font-black' : 'text-zinc-400 hover:text-white'}`}
                >
                  Create Founder Account
                </button>
                <button
                  type="button"
                  onClick={() => { setDevTab('signin'); resetMessages(); }}
                  className={`flex-1 py-1.5 rounded-lg transition ${devTab === 'signin' ? 'bg-white text-black font-black' : 'text-zinc-400 hover:text-white'}`}
                >
                  Sign In Existing
                </button>
              </div>

              {devTab === 'setup' ? (
                <form onSubmit={handleCreateFounder} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1">
                      Founder Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Akash Sharma"
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1">
                      Founder Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="akash30104@gmail.com"
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1">
                      Password (min. 6 characters) *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1">
                      Confirm Password *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500 font-medium"
                    />
                  </div>

                  <p className="text-[10px] text-zinc-400 bg-black/60 p-2.5 rounded-xl border border-zinc-800">
                    🔒 <strong>Strict Single Founder Policy:</strong> Only ONE founder account is allowed. Once created, Dev Mode is permanently locked and cannot be reopened.
                  </p>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white hover:bg-zinc-200 active:scale-[0.99] text-black rounded-xl text-xs font-black shadow-md transition-all disabled:opacity-50"
                  >
                    {isLoading ? 'Creating Founder Account...' : 'Create Founder Account & Lock Dev Mode 👑'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleDevFounderSignIn} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                      Founder Email
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="akash30104@gmail.com"
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                      Password
                    </label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500 font-medium"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white hover:bg-zinc-200 active:scale-[0.99] text-black rounded-xl text-xs font-black shadow-md transition-all disabled:opacity-50"
                  >
                    {isLoading ? 'Signing In...' : 'Sign In as Founder 👑'}
                  </button>
                </form>
              )}
            </div>
          ) : (
            <>
              {/* ==================== PORTAL: STUDIO TEAM (SIGN IN ONLY) ==================== */}
              {authMode === 'login' && portalType === 'studio' && (
                <div className="space-y-4">
                  <div className="text-center pb-2 border-b border-zinc-800">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-xs font-bold text-white mb-1.5">
                      <Users className="w-3.5 h-3.5 text-zinc-200" />
                      <span>Studio Team Sign In</span>
                    </div>
                    <p className="text-xs text-zinc-400">
                      Access production board, editing workspace, and social publishing.
                    </p>
                  </div>

                  <form onSubmit={handleSignIn} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                        Work Email
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@studio.com"
                        className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-zinc-300">
                          Password
                        </label>
                        <button
                          type="button"
                          onClick={() => { setAuthMode('forgot_password'); resetMessages(); }}
                          className="text-[11px] font-semibold text-zinc-400 hover:text-white transition-colors"
                        >
                          Forgot Password?
                        </button>
                      </div>
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white hover:bg-zinc-200 active:scale-[0.99] text-black rounded-full text-sm font-black shadow-md transition-all disabled:opacity-50"
                    >
                      {isLoading ? 'Signing in...' : 'Sign In to Studio'}
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    <div className="pt-2 text-center text-xs text-zinc-500">
                      Team accounts are provisioned by Founder &amp; SMM management.
                    </div>
                  </form>
                </div>
              )}

              {/* ==================== PORTAL: CLIENT PORTAL (SIGN IN ONLY) ==================== */}
              {authMode === 'login' && portalType === 'client' && (
                <div className="space-y-4">
                  <div className="text-center pb-2 border-b border-zinc-800">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-xs font-bold text-white mb-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-zinc-200" />
                      <span>Client Review &amp; Approvals Portal</span>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Enter the login ID and password provided by your Social Media Manager or Founder.
                    </p>
                  </div>

                  <form onSubmit={handleSignIn} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                        Client Email / Login ID
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="client@brand.com"
                        className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-zinc-300">
                          Password
                        </label>
                        <button
                          type="button"
                          onClick={() => { setAuthMode('forgot_password'); resetMessages(); }}
                          className="text-[11px] font-semibold text-zinc-400 hover:text-white transition-colors"
                        >
                          Forgot Password?
                        </button>
                      </div>
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white hover:bg-zinc-200 active:scale-[0.99] text-black rounded-full text-sm font-black shadow-md transition-all disabled:opacity-50"
                    >
                      {isLoading ? 'Opening Client Portal...' : 'Sign In as Client Partner'}
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    <div className="pt-2 text-center text-xs text-zinc-500">
                      Client brand accounts are provisioned exclusively by Digital Inertia management.
                    </div>
                  </form>
                </div>
              )}

              {/* ==================== ACCEPT INVITATION FLOW ==================== */}
              {authMode === 'invite' && (
                <div className="space-y-4">
                  <div className="text-center pb-2 border-b border-zinc-800">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-xs font-bold text-white mb-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-zinc-200" />
                      <span>Accept Invitation</span>
                    </div>
                    <p className="text-xs text-zinc-400">
                      Activate your account using your one-time 24-hour invitation token.
                    </p>
                  </div>

                  {!foundInvitation ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                          Invitation Token or Link
                        </label>
                        <input
                          type="text"
                          value={inviteToken}
                          onChange={(e) => setInviteToken(e.target.value)}
                          placeholder="Paste token or ?invite=... link"
                          className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500 font-mono text-xs"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          let cleanToken = inviteToken.trim();
                          if (cleanToken.includes('invite=')) {
                            cleanToken = cleanToken.split('invite=')[1]?.split('&')[0] || cleanToken;
                          }
                          lookupInvite(cleanToken);
                        }}
                        disabled={isLoading || !inviteToken.trim()}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white hover:bg-zinc-200 active:scale-[0.99] text-black rounded-full text-sm font-black shadow-md transition-all disabled:opacity-50"
                      >
                        {isLoading ? 'Verifying Token...' : 'Verify Invitation Token'}
                        <ArrowRight className="w-4 h-4" />
                      </button>

                      <div className="text-center">
                        <button
                          type="button"
                          onClick={() => { setAuthMode('login'); resetMessages(); }}
                          className="text-xs text-zinc-400 hover:text-white underline"
                        >
                          Already have an account? Sign In
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleAcceptInvite} className="space-y-4">
                      <div className="p-3 bg-black border border-zinc-800 rounded-xl space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Target Role</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white text-black">
                            {foundInvitation.role.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Email</span>
                          <span className="font-semibold text-white truncate max-w-[200px]">{foundInvitation.email}</span>
                        </div>
                        {foundInvitation.client_brand && (
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Brand</span>
                            <span className="font-bold text-white">{foundInvitation.client_brand}</span>
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                          Your Full Name
                        </label>
                        <input
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="e.g. Alex Morgan"
                          className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                            New Password
                          </label>
                          <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Min. 6 chars"
                            className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                            Confirm Password
                          </label>
                          <input
                            type="password"
                            required
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Confirm"
                            className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white hover:bg-zinc-200 active:scale-[0.99] text-black rounded-full text-sm font-black shadow-md transition-all disabled:opacity-50"
                      >
                        {isLoading ? 'Activating Account...' : 'Activate & Enter Workspace'}
                        <ArrowRight className="w-4 h-4" />
                      </button>

                      <div className="text-center">
                        <button
                          type="button"
                          onClick={() => { setFoundInvitation(null); setInviteToken(''); resetMessages(); }}
                          className="text-xs text-zinc-500 hover:text-white"
                        >
                          Use a different invitation token
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* ==================== FORGOT PASSWORD FLOW ==================== */}
              {authMode === 'forgot_password' && (
                <div className="space-y-4">
                  <div className="text-center pb-2 border-b border-zinc-800">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-xs font-bold text-white mb-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-zinc-200" />
                      <span>Password Reset</span>
                    </div>
                    <p className="text-xs text-zinc-400">
                      Enter your account email to receive a secure password recovery link.
                    </p>
                  </div>

                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                        Registered Email
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your-email@studio.com"
                        className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white hover:bg-zinc-200 active:scale-[0.99] text-black rounded-full text-sm font-black shadow-md transition-all disabled:opacity-50"
                    >
                      {isLoading ? 'Sending...' : 'Send Password Reset Link'}
                      <Mail className="w-4 h-4" />
                    </button>

                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => { setAuthMode('login'); resetMessages(); }}
                        className="text-xs text-zinc-400 hover:text-white underline"
                      >
                        Back to Sign In
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer with Privacy Policy & Web Info */}
        <div className="mt-8 text-center text-xs text-zinc-500 flex items-center justify-center gap-3 flex-wrap">
          <span>Digital Inertia v1.0.0</span>
          <span>&bull;</span>
          {onShowPrivacy ? (
            <button
              type="button"
              onClick={onShowPrivacy}
              className="text-zinc-400 hover:text-white underline underline-offset-4 font-semibold transition-colors"
            >
              Privacy Policy
            </button>
          ) : (
            <a
              href="/privacy-policy.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 hover:text-white underline underline-offset-4 font-semibold transition-colors"
            >
              Privacy Policy
            </a>
          )}
          <span>&bull;</span>
          <a
            href="/privacy-policy.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 hover:text-white underline underline-offset-4 font-semibold transition-colors"
          >
            Web Policy &nearr;
          </a>
        </div>
      </div>
    </div>
  );
};
