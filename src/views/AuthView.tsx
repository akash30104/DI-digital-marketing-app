import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Users, Crown, ShieldAlert, ArrowRight, CheckCircle2, Briefcase, Film } from 'lucide-react';
import { UserRole } from '../types';

export const AuthView: React.FC = () => {
  const { signIn, signUp, founderExists, refreshFounderStatus } = useAuth();

  // All-in-one Hosting: Toggle between Studio Team and Client Portal
  const [portalType, setPortalType] = useState<'studio' | 'client'>('studio');
  
  // Developer / Co-Founder Option (unlocked by clicking the logo)
  const [isDevFounderMode, setIsDevFounderMode] = useState(false);
  const [devFounderAction, setDevFounderAction] = useState<'signIn' | 'register'>('signIn');
  const [studioMode, setStudioMode] = useState<'signIn' | 'register' | 'founder'>('signIn');
  
  // Client sub-modes: 'signIn' | 'register'
  const [clientMode, setClientMode] = useState<'signIn' | 'register'>('signIn');

  const [clientBrandName, setClientBrandName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('editor');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const resetMessages = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
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
    const targetRole = portalType === 'client' ? 'client' : undefined;
    const res = await signIn(email, password, targetRole);
    setIsLoading(false);
    if (res.error) {
      setErrorMessage(sanitizeError(res.error));
    }
  };

  const handleClientSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password) {
      setErrorMessage('Please fill in your name, email, and password.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }
    setIsLoading(true);
    resetMessages();
    const clientDisplayName = clientBrandName.trim() ? `${fullName.trim()} (${clientBrandName.trim()})` : fullName.trim();
    const res = await signUp(email, password, clientDisplayName, 'client');
    setIsLoading(false);
    if (res.error) {
      setErrorMessage(sanitizeError(res.error));
    } else {
      setSuccessMessage(`Client account created for ${fullName}! You can now sign in.`);
      setClientMode('signIn');
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
    resetMessages();
    const res = await signUp(email, password, fullName, selectedRole);
    setIsLoading(false);
    if (res.error) {
      setErrorMessage(sanitizeError(res.error));
    } else {
      const roleLabel = selectedRole === 'editor' 
        ? 'Video Editor' 
        : 'Social Media Manager';
      setSuccessMessage(`Account created for ${fullName} as ${roleLabel}! You can now sign in.`);
      setStudioMode('signIn');
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
    resetMessages();
    const res = await signUp(email, password, fullName, 'founder');
    setIsLoading(false);
    if (res.error) {
      setErrorMessage(sanitizeError(res.error));
      refreshFounderStatus();
    } else {
      setSuccessMessage(`Primary founder account created! You can now sign in.`);
      setStudioMode('signIn');
    }
  };

  const handleDevFounderSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    resetMessages();
    const res = await signIn(email, password, 'founder');
    setIsLoading(false);
    if (res.error) {
      setErrorMessage(sanitizeError(res.error));
    }
  };

  const handleDevFounderSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password) {
      setErrorMessage('Please fill in all details for the new founder.');
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
    resetMessages();
    // Pass allowMultipleFounders = true
    const res = await signUp(email, password, fullName.trim(), 'founder', true);
    setIsLoading(false);
    if (res.error) {
      setErrorMessage(sanitizeError(res.error));
    } else {
      setSuccessMessage(`New Founder account created for ${fullName}! You can now sign in.`);
      setDevFounderAction('signIn');
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md">
        {/* Brand Header - Clicking Logo activates Developer / New Founder option */}
        <div className="text-center mb-6">
          <div 
            onClick={() => {
              setIsDevFounderMode(prev => !prev);
              resetMessages();
            }}
            className="w-20 h-20 mx-auto rounded-3xl bg-white p-2.5 flex items-center justify-center shadow-2xl mb-3 overflow-hidden border border-zinc-200 cursor-pointer hover:scale-105 active:scale-95 transition-all group relative select-none"
            title="Click logo for Developer / Co-Founder Option"
          >
            <img src="/logo.png" alt="Digital Inertia" className="w-full h-full object-contain pointer-events-none" />
            <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl flex items-center justify-center">
              <span className="text-[9px] font-black uppercase text-black bg-white/95 px-1.5 py-0.5 rounded shadow">Dev 👑</span>
            </div>
          </div>
          <h1 className="text-xl font-black tracking-[0.16em] uppercase text-white">
            Digital Inertia
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Production &amp; Social Media Management App
          </p>
          <button
            type="button"
            onClick={() => {
              setIsDevFounderMode(prev => !prev);
              resetMessages();
            }}
            className="mt-2 text-[10px] text-zinc-500 hover:text-white transition flex items-center justify-center gap-1 mx-auto"
          >
            <Crown className="w-3 h-3 text-zinc-400" />
            <span>{isDevFounderMode ? '← Back to standard login' : 'Tap logo for Developer / Founder Option'}</span>
          </button>
        </div>

        {/* ALL-IN-ONE HOSTING: TOGGLE BUTTON (Hidden when in Dev Founder Mode) */}
        {!isDevFounderMode && (
          <div className="p-1 bg-zinc-900 border border-zinc-800 rounded-2xl mb-4 flex gap-1 shadow-xl">
            <button
              type="button"
              onClick={() => {
                setPortalType('studio');
                resetMessages();
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
                portalType === 'studio'
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
                setPortalType('client');
                resetMessages();
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
                portalType === 'client'
                  ? 'bg-white text-black font-black shadow-lg scale-[1.01]'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Client Portal</span>
            </button>
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

          {/* ==================== DEVELOPER / CO-FOUNDER ACCESS (ACTIVATED VIA LOGO CLICK) ==================== */}
          {isDevFounderMode ? (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-3 bg-black border border-zinc-800 rounded-2xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-white shrink-0" />
                  <div>
                    <span className="font-black text-white block text-[11px] uppercase tracking-wider">
                      Developer &amp; Founder Access
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      Sign in or add another founder account
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
                  Exit Dev Mode
                </button>
              </div>

              {/* Dev Sub-Toggle: Sign In vs Add Another Founder */}
              <div className="flex bg-black border border-zinc-800 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => { setDevFounderAction('signIn'); resetMessages(); }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    devFounderAction === 'signIn' ? 'bg-white text-black font-black shadow-sm' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Founder Sign In
                </button>
                <button
                  type="button"
                  onClick={() => { setDevFounderAction('register'); resetMessages(); }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    devFounderAction === 'register' ? 'bg-white text-black font-black shadow-sm' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  + Add Another Founder
                </button>
              </div>

              {/* DEV FOUNDER SIGN IN */}
              {devFounderAction === 'signIn' && (
                <form onSubmit={handleDevFounderSignIn} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                      Founder Work Email
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="founder@company.com"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
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
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white hover:bg-zinc-200 active:scale-[0.99] text-black rounded-full text-sm font-black shadow-md transition-all disabled:opacity-50"
                  >
                    {isLoading ? 'Signing in as Founder...' : 'Sign In as Founder 👑'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}

              {/* DEV REGISTER NEW / ANOTHER FOUNDER */}
              {devFounderAction === 'register' && (
                <form onSubmit={handleDevFounderSignUp} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                      New Founder Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Co-Founder Name"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                      New Founder Work Email
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="newfounder@company.com"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
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
                      placeholder="Min. 6 characters"
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
                      placeholder="Re-enter password"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white hover:bg-zinc-200 active:scale-[0.99] text-black rounded-full text-sm font-black shadow-md transition-all disabled:opacity-50"
                  >
                    {isLoading ? 'Creating Founder Account...' : 'Create Additional Founder 👑'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => { setIsDevFounderMode(false); resetMessages(); }}
                  className="text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  &larr; Return to Standard Login
                </button>
              </div>
            </div>
          ) : (
            <>

          {/* ==================== PORTAL: STUDIO TEAM ==================== */}
          {portalType === 'studio' && (
            <div className="space-y-4">
              {/* Secondary Sub-Toggle: Sign In vs Register Team */}
              {studioMode !== 'founder' && (
                <div className="flex bg-black border border-zinc-800 rounded-xl p-1 mb-2">
                  <button
                    type="button"
                    onClick={() => { setStudioMode('signIn'); resetMessages(); }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      studioMode === 'signIn' ? 'bg-white text-black font-black shadow-sm' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Team Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => { setStudioMode('register'); resetMessages(); }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      studioMode === 'register' ? 'bg-white text-black font-black shadow-sm' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Register Team
                  </button>
                </div>
              )}

              {/* STUDIO: SIGN IN */}
              {studioMode === 'signIn' && (
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
                    <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                      Password
                    </label>
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

                  <div className="pt-3 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
                    <button
                      type="button"
                      onClick={() => { setStudioMode('register'); resetMessages(); }}
                      className="hover:text-white transition-colors"
                    >
                      Need an account? <strong>Register →</strong>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setStudioMode('founder'); refreshFounderStatus(); resetMessages(); }}
                      className="hover:text-white transition-colors inline-flex items-center gap-1 text-[11px] text-zinc-500"
                    >
                      <Crown className="w-3 h-3 text-zinc-400" />
                      <span>Founder Setup</span>
                    </button>
                  </div>
                </form>
              )}

              {/* STUDIO: REGISTER TEAM MEMBER */}
              {studioMode === 'register' && (
                <form onSubmit={handleTeamSignUp} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Alex Rivera"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                      Work Email
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="alex@studio.com"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
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
                      placeholder="Min. 6 characters"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                      Select Role
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedRole('editor')}
                        className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all text-center ${
                          selectedRole === 'editor'
                            ? 'border-white bg-zinc-800 text-white font-black'
                            : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:text-white'
                        }`}
                      >
                        🎬 Video Editor
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedRole('social_media_manager')}
                        className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all text-center ${
                          selectedRole === 'social_media_manager'
                            ? 'border-white bg-zinc-800 text-white font-black'
                            : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:text-white'
                        }`}
                      >
                        📱 Social Media Mgr
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white hover:bg-zinc-200 active:scale-[0.99] text-black rounded-full text-sm font-black shadow-md transition-all disabled:opacity-50"
                  >
                    {isLoading 
                      ? 'Creating account...' 
                      : `Register as ${selectedRole === 'editor' ? 'Video Editor' : 'Social Media Manager'}`}
                  </button>

                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => { setStudioMode('signIn'); resetMessages(); }}
                      className="text-xs text-zinc-400 hover:text-white transition-colors"
                    >
                      Already have an account? <strong>Sign In →</strong>
                    </button>
                  </div>
                </form>
              )}

              {/* STUDIO: FOUNDER SETUP */}
              {studioMode === 'founder' && (
                <div>
                  {founderExists ? (
                    /* LOCKED STATE */
                    <div className="text-center py-4 space-y-3">
                      <div className="w-14 h-14 mx-auto rounded-full bg-zinc-800 border border-zinc-700 text-white flex items-center justify-center">
                        <ShieldAlert className="w-7 h-7" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white">
                          Founder Account Claimed
                        </h3>
                        <p className="text-xs text-zinc-400 mt-1 px-4 leading-relaxed">
                          A primary founder account has already been registered for this workspace. Only <strong>ONE founder account</strong> is permitted per organization.
                        </p>
                      </div>
                      <div className="pt-2">
                        <button
                          onClick={() => { setStudioMode('signIn'); resetMessages(); }}
                          className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full text-xs font-bold transition-all border border-zinc-700"
                        >
                          Return to Sign In
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* UNCLAIMED FOUNDER REGISTRATION FORM */
                    <form onSubmit={handleFounderSignUp} className="space-y-4">
                      <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-zinc-200">
                        <Crown className="w-5 h-5 flex-shrink-0 text-zinc-300" />
                        <div className="text-xs">
                          <p className="font-bold text-white">Claim Primary Founder Account</p>
                          <p className="text-[11px] text-zinc-400">First user gets master administrative oversight &amp; approvals.</p>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                          Founder Full Name
                        </label>
                        <input
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Founder Name"
                          className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                          Founder Work Email
                        </label>
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="founder@company.com"
                          className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                          Master Password
                        </label>
                        <input
                          type="password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Min. 6 characters"
                          className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                          Confirm Master Password
                        </label>
                        <input
                          type="password"
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Repeat password"
                          className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white hover:bg-zinc-200 active:scale-[0.99] text-black rounded-full text-sm font-black shadow-md transition-all disabled:opacity-50"
                      >
                        {isLoading ? 'Creating Founder...' : 'Create Primary Founder Account'}
                        <Crown className="w-4 h-4" />
                      </button>

                      <div className="pt-2 text-center">
                        <button
                          type="button"
                          onClick={() => { setStudioMode('signIn'); resetMessages(); }}
                          className="text-xs text-zinc-400 hover:text-white transition-colors"
                        >
                          Return to <strong>Sign In →</strong>
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ==================== PORTAL: CLIENT PORTAL ==================== */}
          {portalType === 'client' && (
            <div className="space-y-4">
              <div className="text-center pb-2 border-b border-zinc-800">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-xs font-bold text-white mb-2">
                  <Briefcase className="w-3.5 h-3.5 text-zinc-200" />
                  <span>Client Review &amp; Approvals Portal</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Review podcast cuts, preview Drive deliverables, and approve finished reels.
                </p>

                {/* Sub-toggle: Client Sign In vs Register Brand */}
                <div className="flex bg-black border border-zinc-800 rounded-xl p-1 mt-3">
                  <button
                    type="button"
                    onClick={() => { setClientMode('signIn'); resetMessages(); }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      clientMode === 'signIn' ? 'bg-white text-black font-black shadow-sm' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Client Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => { setClientMode('register'); resetMessages(); }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      clientMode === 'register' ? 'bg-white text-black font-black shadow-sm' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Register Brand
                  </button>
                </div>
              </div>

              {/* CLIENT: SIGN IN */}
              {clientMode === 'signIn' ? (
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                      Client Email
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
                    <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                      Password
                    </label>
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

                  <div className="pt-2 text-center text-xs text-zinc-400">
                    New brand partner?{' '}
                    <button
                      type="button"
                      onClick={() => { setClientMode('register'); resetMessages(); }}
                      className="font-bold text-white hover:underline ml-1"
                    >
                      Register Brand →
                    </button>
                  </div>
                </form>
              ) : (
                /* CLIENT: REGISTER BRAND */
                <form onSubmit={handleClientSignUp} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                      Brand Name
                    </label>
                    <input
                      type="text"
                      required
                      value={clientBrandName}
                      onChange={(e) => setClientBrandName(e.target.value)}
                      placeholder="e.g. Brand Name"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                    />
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
                      placeholder="e.g. David Miller"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                      Client Email
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="david@company.com"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                      Create Password
                    </label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 6 characters"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white hover:bg-zinc-200 active:scale-[0.99] text-black rounded-full text-sm font-black shadow-md transition-all disabled:opacity-50"
                  >
                    {isLoading ? 'Creating Client Account...' : 'Register Client Account'}
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <div className="pt-2 text-center text-xs text-zinc-400">
                    Already registered?{' '}
                    <button
                      type="button"
                      onClick={() => { setClientMode('signIn'); resetMessages(); }}
                      className="font-bold text-white hover:underline ml-1"
                    >
                      Client Sign In →
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
          </>
        )}
        </div>
      </div>
    </div>
  );
};
