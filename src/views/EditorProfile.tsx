import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  User, Film, CheckCircle2, Clock, Send, LogOut, 
  Sparkles, ShieldCheck, HardDrive, Smartphone, RefreshCw 
} from 'lucide-react';

export const EditorProfile: React.FC = () => {
  const { currentUser, signOut } = useAuth();
  const [stats, setStats] = useState({
    active: 0,
    awaitingReview: 0,
    approved: 0,
    total: 0
  });
  const [loadingStats, setLoadingStats] = useState(true);

  const fetchStats = async () => {
    if (!currentUser) return;
    setLoadingStats(true);
    try {
      const { data, error } = await supabase
        .from('deliverables')
        .select('editing_status')
        .eq('assigned_editor_id', currentUser.id);

      if (!error && data) {
        const active = data.filter(d => ['editing_in_progress', 'assigned'].includes(d.editing_status)).length;
        const awaitingReview = data.filter(d => ['submitted_for_approval', 'internal_review'].includes(d.editing_status)).length;
        const approved = data.filter(d => ['approved', 'published'].includes(d.editing_status)).length;
        setStats({
          active,
          awaitingReview,
          approved,
          total: data.length
        });
      }
    } catch (e) {
      console.error('Error fetching editor stats:', e);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [currentUser]);

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-200">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
          <User className="w-6 h-6 text-blue-600" />
          Editor Profile
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Your account details, editing performance, and session management
        </p>
      </div>

      {/* Profile Card */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-blue-500/25 shrink-0">
              {currentUser?.full_name?.charAt(0).toUpperCase() || 'E'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {currentUser?.full_name || 'Video Editor'}
                </h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  <Film className="w-3 h-3" />
                  Video Editor
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {currentUser?.email}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Active Team Member
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => signOut()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Performance Stats */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Editing Stats & Deliverables
          </h3>
          <button
            onClick={fetchStats}
            className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline"
          >
            <RefreshCw className={`w-3 h-3 ${loadingStats ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">In Progress</span>
              <Clock className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
              {stats.active}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Currently editing</p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">In Review</span>
              <Send className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
              {stats.awaitingReview}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Awaiting SMM review</p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Approved</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
              {stats.approved}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Ready or published</p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Total Tasks</span>
              <Film className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
              {stats.total}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Lifetime assigned</p>
          </div>
        </div>
      </div>

      {/* Editor Workflow Quick Reference */}
      <div className="p-5 rounded-2xl bg-gradient-to-br from-blue-500/5 via-indigo-500/5 to-transparent border border-blue-500/20">
        <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5 mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          Editor Quick Workflow
        </h3>
        <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-600 font-bold flex items-center justify-center shrink-0 text-[10px]">1</span>
            <span>Check <strong>My Tasks</strong> for videos assigned by your Social Media Manager.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-600 font-bold flex items-center justify-center shrink-0 text-[10px]">2</span>
            <span>Click <strong>"Accept Task & Start Editing"</strong> to immediately view how raw footage was shared (AirDrop, Hard Disk, Google Drive) and start tracking progress.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-600 font-bold flex items-center justify-center shrink-0 text-[10px]">3</span>
            <span>Update your progress percentage (25%, 50%, 75%, 100%) as you work.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-600 font-bold flex items-center justify-center shrink-0 text-[10px]">4</span>
            <span>Paste your preview video link (Google Drive / Frame.io) and submit for SMM review.</span>
          </div>
        </div>
      </div>

      {/* App Info */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between text-xs">
        <div>
          <p className="font-bold text-slate-800 dark:text-slate-200">Digital Inertia Production App</p>
          <p className="text-[11px] text-slate-400">Official Video Editor Portal &bull; v1.0.0</p>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
          <ShieldCheck className="w-3.5 h-3.5" />
          Connected
        </div>
      </div>
    </div>
  );
};
