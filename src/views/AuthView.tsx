import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Users, Crown, ShieldAlert, ArrowRight, Video, CheckCircle2, Briefcase, Sparkles } from 'lucide-react';
import { UserRole } from '../types';

export const AuthView: React.FC = () => {
  const { signIn, signUp, founderExists, refreshFounderStatus } = useAuth();
  
  // Detect if accessing via client subdomain (e.g. client.yourdomain.com) or query parameter (?portal=client)
  const isClientAccess = typeof window !== 'undefined' && (
    window.location.hostname.startsWith('client.') ||
    window.location.hostname.startsWith('clients.') ||
    window.location.search.includes('portal=client') ||
    window.location.search.includes('client') ||
    window.location.hash.includes('client')
  );

  const [authMode, setAuthMode] = useState<'signIn' | 'clientPortal' | 'teamRegister' | 'founderSetup'>(
    isClientAccess ? 'clientPortal' : 'signIn'
  );
  
  const [clientSubMode, setClientSubMode] = useState<'signIn' | 'signUp'>('signIn');
  const [clientBrandName, setClientBrandName] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('editor');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleTabChange = (mode: 'signIn' | 'clientPortal' | 'teamRegister' | 'founderSetup') => {
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
    setErrorMessage(null);
    setSuccessMessage(null);
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
    setErrorMessage(null);
    setSuccessMessage(null);
    const clientDisplayName = clientBrandName.trim() ? `${fullName.trim()} (${clientBrandName.trim()})` : fullName.trim();
    const res = await signUp(email, password, clientDisplayName, 'client');
    setIsLoading(false);
    if (res.error) {
      setErrorMessage(sanitizeError(res.error));
    } else {
      setSuccessMessage(`Client account created for ${fullName}! You can now sign in.`);
      setClientSubMode('signIn');
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
    setSuccessMessage(null);
    const res = await signUp(email, password, fullName, selectedRole);
    setIsLoading(false);
    if (res.error) {
      setErrorMessage(sanitizeError(res.error));
    } else {
      const roleLabel = selectedRole === 'editor' 
        ? 'Video Editor' 
        : 'Social Media Manager';
      setSuccessMessage(`Account created for ${fullName} as ${roleLabel}! You can now sign in.`);
      setAuthMode('signIn');
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
            Production & Social Media Management App
          </p>
        </div>

        {/* Top Navigation Bar / Segmented Bar */}
        <div className="flex p-1 bg-zinc-900 border border-zinc-800 rounded-2xl mb-4 gap-1 overflow-x-auto">
          <button
            onClick={() => handleTabChange('signIn')}
            className={`flex-1 min-w-[70px] flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all ${
              authMode === 'signIn'
                ? 'bg-white text-black font-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>

          <button
            onClick={() => handleTabChange('clientPortal')}
            className={`flex-1 min-w-[95px] flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all ${
              authMode === 'clientPortal'
                ? 'bg-white text-black font-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5 text-zinc-300" />
            <span>Client</span>
          </button>

          <button
            onClick={() => handleTabChange('teamRegister')}
            className={`flex-1 min-w-[85px] flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all ${
              authMode === 'teamRegister'
                ? 'bg-white text-black font-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Team</span>
          </button>

          <button
            onClick={() => handleTabChange('founderSetup')}
            className={`flex-1 min-w-[85px] flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all ${
              authMode === 'founderSetup'
                ? 'bg-zinc-800 text-white font-black border border-zinc-700 shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Crown className="w-3.5 h-3.5 text-zinc-300" />
            <span>Founder</span>
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

          {/* TAB 1: SIGN IN */}
          {authMode === 'signIn' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  Email
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
                {isLoading ? 'Signing in...' : 'Sign In'}
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="pt-2 border-t border-zinc-800 text-center">
                <button
                  type="button"
                  onClick={() => handleTabChange('clientPortal')}
                  className="text-xs font-bold text-zinc-400 hover:text-white transition-colors inline-flex items-center gap-1.5 py-1"
                >
                  <Briefcase className="w-3.5 h-3.5 text-zinc-300" />
                  <span>Are you a Client Partner? <strong>Access Client Portal →</strong></span>
                </button>
              </div>
            </form>
          )}

          {/* TAB: CLIENT PORTAL ACCESS */}
          {authMode === 'clientPortal' && (
            <div className="space-y-4">
              <div className="text-center pb-2 border-b border-zinc-800">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-xs font-bold text-white mb-2">
                  <Briefcase className="w-3.5 h-3.5 text-zinc-200" />
                  <span>Client Review &amp; Approvals Portal</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Review podcast cuts, preview Google Drive deliverables, approve finished reels, and request edits.
                </p>

                {/* Sub-toggle: Sign In vs Register */}
                <div className="flex bg-black border border-zinc-800 rounded-xl p-1 mt-3">
                  <button
                    type="button"
                    onClick={() => { setClientSubMode('signIn'); setErrorMessage(null); setSuccessMessage(null); }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      clientSubMode === 'signIn' ? 'bg-white text-black font-black shadow-sm' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Client Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => { setClientSubMode('signUp'); setErrorMessage(null); setSuccessMessage(null); }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      clientSubMode === 'signUp' ? 'bg-white text-black font-black shadow-sm' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    New Client Register
                  </button>
                </div>
              </div>

              {clientSubMode === 'signIn' ? (
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
                    {isLoading ? 'Opening Client Portal...' : 'Enter Client Portal'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <form onSubmit={handleClientSignUp} className="space-y-4">
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
                      Brand Name
                    </label>
                    <input
                      type="text"
                      value={clientBrandName}
                      onChange={(e) => setClientBrandName(e.target.value)}
                      placeholder="e.g. Brand Name"
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
                </form>
              )}

              {/* Subdomain & Direct URL helper */}
              <div className="p-3 rounded-2xl bg-black border border-zinc-800 text-[11px] text-zinc-400 space-y-1">
                <span className="font-bold text-white block">Client Portal Direct Access:</span>
                <p>
                  Clients can also access directly via subdomain (e.g. <code>client.yourdomain.com</code>) or appending <code>?portal=client</code> to your site link.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: TEAM REGISTER (EDITOR / MANAGER / CLIENT) */}
          {authMode === 'teamRegister' && (
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

              <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800 text-zinc-400 text-[11px]">
                Founder role is not selectable here. Use the Founder Setup tab if not yet registered. Clients register in the Client tab.
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
            </form>
          )}

          {/* TAB 3: FOUNDER SETUP (SINGLE FOUNDER LOCKOUT) */}
          {authMode === 'founderSetup' && (
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
                      onClick={() => handleTabChange('signIn')}
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
                      <p className="text-[11px] text-zinc-400">First user gets master administrative oversight & Google Sheets sync.</p>
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
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
