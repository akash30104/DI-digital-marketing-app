import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Users, Crown, ShieldAlert, ArrowRight, CheckCircle2, Briefcase, Film } from 'lucide-react';

interface AuthViewProps {
  onShowPrivacy?: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onShowPrivacy }) => {
  const { signIn, signUp, refreshFounderStatus } = useAuth();

  // All-in-one Hosting: Toggle between Studio Team and Client Portal
  const [portalType, setPortalType] = useState<'studio' | 'client'>('studio');
  
  // Developer / Co-Founder Option (unlocked by clicking the logo)
  const [isDevFounderMode, setIsDevFounderMode] = useState(false);
  const [devFounderAction, setDevFounderAction] = useState<'signIn' | 'register'>('signIn');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');

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
                  Add Another Founder
                </button>
              </div>

              {devFounderAction === 'signIn' ? (
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
                      placeholder="founder@studio.com"
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
                    {isLoading ? 'Signing In...' : 'Sign In as Founder'}
                    <Crown className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <form onSubmit={handleDevFounderSignUp} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                      Founder Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Co-Founder Name"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                      Founder Email
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="newfounder@studio.com"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                        Password
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
                        Confirm
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
                    {isLoading ? 'Registering Founder...' : 'Register New Founder Account'}
                    <Crown className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          ) : (
            <>
              {/* ==================== PORTAL: STUDIO TEAM (SIGN IN ONLY) ==================== */}
              {portalType === 'studio' && (
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

                    <div className="pt-2 text-center text-xs text-zinc-500">
                      Team accounts are provisioned by Founder &amp; SMM management.
                    </div>
                  </form>
                </div>
              )}

              {/* ==================== PORTAL: CLIENT PORTAL (SIGN IN ONLY) ==================== */}
              {portalType === 'client' && (
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

                    <div className="pt-2 text-center text-xs text-zinc-500">
                      Client brand accounts are provisioned exclusively by Digital Inertia management.
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
