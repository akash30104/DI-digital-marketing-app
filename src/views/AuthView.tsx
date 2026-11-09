import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Users, Crown, ShieldAlert, ArrowRight, CheckCircle2, Briefcase, Film } from 'lucide-react';
import { UserRole } from '../types';

export const AuthView: React.FC = () => {
  const { signIn, signUp, founderExists, refreshFounderStatus } = useAuth();

  // All-in-one Hosting: Toggle between Studio Team and Client Portal
  const [portalType, setPortalType] = useState<'studio' | 'client'>('studio');
  
  // Studio sub-modes: 'signIn' | 'register' | 'founder'
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
    const res = await signIn(email, password);
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

  return (
    <div className="min-h-screen bg-black flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-white p-2.5 flex items-center justify-center shadow-2xl mb-3 overflow-hidden border border-zinc-200">
            <img src="/logo.png" alt="Digital Inertia" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-xl font-black tracking-[0.16em] uppercase text-white">
            Digital Inertia
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Production &amp; Social Media Management App
          </p>
        </div>

        {/* ALL-IN-ONE HOSTING: TOGGLE BUTTON */}
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
        </div>
      </div>
    </div>
  );
};
