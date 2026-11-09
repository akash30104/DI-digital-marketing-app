import React from 'react';
import { ShieldCheck, ArrowLeft, ExternalLink, Mail, Lock, Server, FileText, CheckCircle2 } from 'lucide-react';

interface PrivacyPolicyViewProps {
  onBack?: () => void;
}

export const PrivacyPolicyView: React.FC<PrivacyPolicyViewProps> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-black text-zinc-200 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          {onBack ? (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-white transition active:scale-95"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to App</span>
            </button>
          ) : (
            <a
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-white transition active:scale-95"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to App</span>
            </a>
          )}

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-white text-black border border-white shadow-sm flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Official Privacy Policy</span>
            </span>
            <a
              href="/privacy-policy.html"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-bold text-zinc-300"
            >
              <span>Direct URL</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Hero Card */}
        <div className="p-6 sm:p-8 rounded-3xl bg-zinc-950 border-2 border-white shadow-[0_0_30px_rgba(255,255,255,0.15)] ring-1 ring-white/60 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white text-black flex items-center justify-center font-black shadow-lg">
              <Lock className="w-6 h-6 text-black" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-400">
                Digital Inertia Compliance
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                DI Digital Marketing App Privacy Policy
              </h1>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
            Digital Inertia is committed to protecting your privacy. This policy governs how the <strong>DI Digital Marketing App</strong> (available as an Android application and web platform) collects, processes, and safeguards user credentials, video production deliverables, client brand records, and social media analytics.
          </p>

          <div className="pt-2 border-t border-zinc-800 flex items-center gap-4 text-xs text-zinc-400 flex-wrap">
            <span>Effective Date: <strong className="text-white">November 9, 2026</strong></span>
            <span>&bull;</span>
            <span>Developer: <strong className="text-white">Digital Inertia</strong></span>
            <span>&bull;</span>
            <span>Platform: <strong className="text-white">Android &amp; Web</strong></span>
          </div>
        </div>

        {/* Section 1: Data Collection */}
        <div className="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-white" />
            <span>1. Information We Collect</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-black border border-zinc-800">
              <span className="font-bold text-white block mb-1">User &amp; Brand Accounts</span>
              <p className="text-zinc-400">
                Full name, email address, role designation (Founder, Social Media Manager, Video Editor, Client Partner), and brand names.
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-black border border-zinc-800">
              <span className="font-bold text-white block mb-1">Video Deliverables &amp; Progress</span>
              <p className="text-zinc-400">
                Shoot titles, episode numbers, storage folders, editing percentages (0%–100%), and deadlines.
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-black border border-zinc-800">
              <span className="font-bold text-white block mb-1">Media &amp; Cloud URLs</span>
              <p className="text-zinc-400">
                Google Drive links and preview URLs uploaded by video editors for SMM and Founder review.
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-black border border-zinc-800">
              <span className="font-bold text-white block mb-1">Performance Analytics</span>
              <p className="text-zinc-400">
                Public social video metrics (views, comments, shares, likes) for tracking client campaign ROI.
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Android Permissions */}
        <div className="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-white" />
            <span>2. Android Permissions (Google Play Policy)</span>
          </h2>
          <p className="text-xs text-zinc-300">
            The Android application requests only the essential network permissions needed to synchronize video data:
          </p>
          <div className="space-y-2 text-xs">
            <div className="p-3 rounded-2xl bg-black border border-zinc-800 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-white shrink-0 mt-0.5" />
              <div>
                <code className="text-white font-mono bg-zinc-800 px-1.5 py-0.5 rounded text-[11px]">android.permission.INTERNET</code>
                <p className="text-zinc-400 mt-0.5">Required for real-time cloud database sync with Supabase and deliverable status updates.</p>
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-black border border-zinc-800 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-white shrink-0 mt-0.5" />
              <div>
                <code className="text-white font-mono bg-zinc-800 px-1.5 py-0.5 rounded text-[11px]">android.permission.ACCESS_NETWORK_STATE</code>
                <p className="text-zinc-400 mt-0.5">Detects network connectivity status to prevent data corruption during edits.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Third Party Providers */}
        <div className="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <Server className="w-4 h-4 text-white" />
            <span>3. Cloud Infrastructure &amp; Security</span>
          </h2>
          <p className="text-xs text-zinc-300">
            We operate with zero commercial ad networks or third-party data broker monetization:
          </p>
          <ul className="space-y-1.5 text-xs text-zinc-300 list-disc list-inside">
            <li><strong>Supabase:</strong> Encrypted PostgreSQL database with Row-Level Security (RLS).</li>
            <li><strong>Google Drive &amp; YouTube:</strong> Direct API references for video cuts and analytics.</li>
            <li><strong>Render:</strong> Enterprise web hosting with TLS 1.3 / SSL encryption in transit.</li>
            <li><strong>Client Isolation:</strong> Each brand client only has visibility into their dedicated deliverables.</li>
          </ul>
        </div>

        {/* Section 4: Data Deletion */}
        <div className="p-6 rounded-3xl bg-zinc-950 border-2 border-white shadow-xl space-y-3">
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <Mail className="w-4 h-4 text-white" />
            <span>4. Data Retention &amp; User Account Deletion</span>
          </h2>
          <p className="text-xs text-zinc-300">
            You maintain the right to permanently delete your account, video records, and deliverables at any time:
          </p>
          <div className="p-4 rounded-2xl bg-black border border-zinc-800 text-xs space-y-2">
            <p className="text-white font-semibold">
              To request account or data deletion:
            </p>
            <p className="text-zinc-300">
              Email our compliance team at <strong className="text-white underline">support@digitalinertia.com</strong> with the subject <em>"Data Deletion Request - [Your Name / Brand]"</em>.
            </p>
            <p className="text-zinc-400">
              Verified requests are processed within <strong>7 business days</strong>. Studio Founders can also purge records directly in the app.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
          <span>&copy; 2026 Digital Inertia. All rights reserved.</span>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/akash30104/DI-digital-marketing-app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 hover:text-white underline"
            >
              GitHub Repository
            </a>
            <span>&bull;</span>
            <a
              href="/privacy-policy.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 hover:text-white underline"
            >
              Public Web Policy
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
