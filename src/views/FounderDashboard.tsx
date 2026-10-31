import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { DailySummary, PublishingLog, Deliverable } from '../types';
import { StatCard } from '../components/StatComponents';
import { calculatePublishingStreak, StreakInfo, getLogChannelName, formatPlatformLabel } from '../lib/streak';
import { 
  PlaySquare, Camera, Tv, Film, CheckCircle2, RotateCcw, 
  Send, RefreshCw, Flame, Radio, ExternalLink, ArrowUpRight 
} from 'lucide-react';

interface FounderDashboardProps {
  onNavigateTab?: (tab: string) => void;
}

export const FounderDashboard: React.FC<FounderDashboardProps> = ({ onNavigateTab }) => {
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [todayPublishedLogs, setTodayPublishedLogs] = useState<PublishingLog[]>([]);
  const [activeEditingTasks, setActiveEditingTasks] = useState<Deliverable[]>([]);
  const [streak, setStreak] = useState<StreakInfo>({
    currentStreak: 0,
    publishedToday: false,
    lastPublishedDate: null,
    statusMessage: 'Loading publishing streak...'
  });
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

    try {
      // 1. Fetch Daily Summary RPC
      const { data: summaryData, error: summaryErr } = await supabase.rpc('get_daily_summary', {
        p_query_date: todayStr
      });

      if (!summaryErr && summaryData) {
        setSummary(summaryData as DailySummary);
      } else {
        setSummary({
          reporting_date: todayStr,
          published: { youtube_shorts: 0, youtube_full: 0, instagram_reels: 0, other: 0, total: 0 },
          targets: { youtube_shorts: 4, youtube_full: 1, instagram_reels: 4, other: 0, total: 9 },
          pipeline: { in_editing: 0, pending_approval: 0, changes_requested: 0, ready_to_publish: 0, overdue_tasks: 0 }
        });
      }

      // 2. Fetch Publishing Logs for Streak & Today's Proofs
      const { data: pubData } = await supabase
        .from('publishing_logs')
        .select(`
          *,
          deliverables:deliverable_id (title, deliverable_type)
        `)
        .eq('publication_status', 'published')
        .order('published_at', { ascending: false })
        .limit(100);

      if (pubData) {
        const mappedLogs: PublishingLog[] = pubData.map((l: any) => ({
          ...l,
          deliverable_title: l.deliverables?.title || l.notes?.split('\n')[0] || 'Published Video',
          channel_name: getLogChannelName(l)
        }));
        setStreak(calculatePublishingStreak(mappedLogs));
        setTodayPublishedLogs(mappedLogs.filter(l => l.reporting_date === todayStr));
      }

      // 3. Fetch Live Active Tasks for Editors
      const { data: edData } = await supabase
        .from('deliverables')
        .select(`
          *,
          recordings (title, hard_disk_name, folder_path),
          profiles:assigned_editor_id (full_name)
        `)
        .in('editing_status', ['assigned', 'editing_in_progress', 'submitted_for_approval', 'changes_requested'])
        .order('updated_at', { ascending: false })
        .limit(8);

      if (edData) {
        setActiveEditingTasks(edData.map((d: any) => ({
          ...d,
          recording_title: d.recordings?.title,
          hard_disk_name: d.recordings?.hard_disk_name,
          editor_name: d.profiles?.full_name || 'Unassigned'
        })));
      }
    } catch (e) {
      console.error('Error loading dashboard data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Subscribe to Realtime updates on publishing and deliverables
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliverables' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'publishing_logs' }, () => loadData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const todayFormatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  }).format(new Date());

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            {todayFormatted} (Asia/Kolkata)
          </span>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Founder Overview
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Executive monitoring of video editing progress, channel publications, and manager consistency.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={isLoading}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 shadow-sm transition-all self-start sm:self-auto"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Social Media Manager Publishing Streak Overview */}
      <div className="bg-gradient-to-r from-orange-500/15 via-amber-500/10 to-transparent border border-orange-500/30 rounded-2xl p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-orange-500/20 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
            <Flame className="w-7 h-7 animate-pulse text-orange-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-orange-600 dark:text-orange-400">
                Social Media Manager Streak
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/20 text-orange-700 dark:text-orange-300">
                {streak.currentStreak} {streak.currentStreak === 1 ? 'Day' : 'Days'}
              </span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 font-medium mt-0.5">
              {streak.statusMessage}
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Today's Posts</span>
          <span className="text-lg font-black text-slate-900 dark:text-white">{todayPublishedLogs.length} Verified</span>
        </div>
      </div>

      {/* Daily Publishing Goals (Read-Only Executive Overview) */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
          Today's Output Goals
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            title="YouTube Shorts"
            count={summary?.published.youtube_shorts ?? 0}
            target={summary?.targets.youtube_shorts ?? 4}
            icon={<PlaySquare className="w-5 h-5 text-red-600" />}
            colorClass="bg-red-500/10 text-red-600"
          />

          <StatCard
            title="Instagram Reels"
            count={summary?.published.instagram_reels ?? 0}
            target={summary?.targets.instagram_reels ?? 4}
            icon={<Camera className="w-5 h-5 text-pink-600" />}
            colorClass="bg-pink-500/10 text-pink-600"
          />

          <StatCard
            title="YouTube Full Video"
            count={summary?.published.youtube_full ?? 0}
            target={summary?.targets.youtube_full ?? 1}
            icon={<Tv className="w-5 h-5 text-blue-600" />}
            colorClass="bg-blue-500/10 text-blue-600"
          />
        </div>
      </div>

      {/* Live Video Editing Status by Editors */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Live Video Editing Progress
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400">
              {activeEditingTasks.length} Active Cuts
            </span>
          </div>

          <button
            onClick={() => onNavigateTab?.('production')}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <span>Production Board</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {activeEditingTasks.length === 0 ? (
          <div className="p-6 text-center rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-400">
            No active video editing tasks in progress right now.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {activeEditingTasks.map((task) => (
              <div 
                key={task.id} 
                className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-sm space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                    {task.deliverable_type === 'reel' ? '📱 Short / Reel' : '📺 Full Video'}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    task.editing_status === 'submitted_for_approval'
                      ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                      : task.editing_status === 'editing_in_progress'
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                  }`}>
                    {task.editing_status === 'submitted_for_approval'
                      ? 'Cut Ready for SMM Review'
                      : task.editing_status === 'editing_in_progress'
                      ? 'Editing In Progress'
                      : 'Assigned (Pending Acceptance)'}
                  </span>
                </div>

                <div>
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white line-clamp-1">
                    {task.title}
                  </h4>
                  <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Editor: <strong className="text-slate-800 dark:text-slate-200">{task.editor_name}</strong></span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">{task.progress_percentage}% Done</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${task.progress_percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Social Media Manager's Today's Published Videos & Live Proofs */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Today's Publications by Social Media Manager
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400">
              {todayPublishedLogs.length} Posted Today
            </span>
          </div>
        </div>

        {todayPublishedLogs.length === 0 ? (
          <div className="p-6 text-center rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-400">
            No videos posted today yet. The Social Media Manager's published proofs will appear here live.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {todayPublishedLogs.map((log, idx) => {
              const channel = getLogChannelName(log);
              const postTime = new Date(log.published_at).toLocaleTimeString('en-IN', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
              });

              return (
                <div 
                  key={log.id} 
                  className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-blue-600 text-white">
                        #{todayPublishedLogs.length - idx}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center gap-1 truncate">
                        <Radio className="w-3 h-3 shrink-0" />
                        <span className="truncate">{channel}</span>
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {formatPlatformLabel(log.platform)}
                      </span>
                    </div>
                    <p className="font-bold text-xs text-slate-900 dark:text-white truncate">
                      {log.deliverable_title}
                    </p>
                    <span className="text-[10px] text-slate-400">
                      Published at {postTime} IST
                    </span>
                  </div>

                  {log.post_url ? (
                    <a
                      href={log.post_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors"
                      title="Open Verified Proof"
                    >
                      <span>Proof</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-[10px] text-slate-400 shrink-0">Recorded</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Production Board Pipeline Overview */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
          Production Pipeline
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            title="In Editing"
            count={summary?.pipeline.in_editing ?? 0}
            icon={<Film className="w-5 h-5 text-blue-500" />}
            colorClass="bg-blue-500/10 text-blue-500"
            onClick={() => onNavigateTab?.('production')}
          />

          <StatCard
            title="Changes Requested"
            count={summary?.pipeline.changes_requested ?? 0}
            icon={<RotateCcw className="w-5 h-5 text-rose-500" />}
            colorClass="bg-rose-500/10 text-rose-500"
            onClick={() => onNavigateTab?.('production')}
          />

          <StatCard
            title="Ready to Publish"
            count={summary?.pipeline.ready_to_publish ?? 0}
            icon={<Send className="w-5 h-5 text-emerald-500" />}
            colorClass="bg-emerald-500/10 text-emerald-500"
          />
        </div>
      </div>
    </div>
  );
};
