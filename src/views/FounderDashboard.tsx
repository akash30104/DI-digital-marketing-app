import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { DailySummary, PublishingLog, Deliverable, PlatformType } from '../types';
import { StatCard } from '../components/StatComponents';
import { 
  calculatePublishingStreak, StreakInfo, getLogChannelName, 
  formatPlatformLabel, getLogPlatform, getLogCleanTitle, OFFICIAL_CHANNELS 
} from '../lib/streak';
import { 
  PlaySquare, Camera, Tv, Film, CheckCircle2, RotateCcw, 
  Send, RefreshCw, Flame, Radio, ExternalLink, ArrowUpRight, 
  Share2, Plus, X, Check, Sparkles, Layers, Calendar, Clock,
  Play, Video
} from 'lucide-react';

// Video embed and format helpers
const getYouTubeEmbedUrl = (url?: string): string | null => {
  if (!url) return null;
  try {
    const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shortsMatch && shortsMatch[1]) {
      return `https://www.youtube.com/embed/${shortsMatch[1]}`;
    }
    const watchMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (watchMatch && watchMatch[1]) {
      return `https://www.youtube.com/embed/${watchMatch[1]}`;
    }
    if (url.includes('youtube.com/embed/')) {
      return url;
    }
    return null;
  } catch {
    return null;
  }
};

const getDriveEmbedUrl = (url?: string): string | null => {
  if (!url) return null;
  try {
    const driveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
      return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
    }
    return null;
  } catch {
    return null;
  }
};

const isDirectVideoUrl = (url?: string): boolean => {
  if (!url) return false;
  return /\.(mp4|mov|webm|ogg)($|\?)/i.test(url);
};

const formatLogDateTime = (dateStr?: string): string => {
  if (!dateStr) return 'Recently';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return dateStr;
  }
};

interface FounderDashboardProps {
  onNavigateTab?: (tab: string) => void;
}

export const FounderDashboard: React.FC<FounderDashboardProps> = ({ onNavigateTab }) => {
  const { currentUser, role } = useAuth();
  const isManager = role === 'social_media_manager';

  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [todayPublishedLogs, setTodayPublishedLogs] = useState<PublishingLog[]>([]);
  const [weekPublishedLogs, setWeekPublishedLogs] = useState<PublishingLog[]>([]);
  const [activeEditingTasks, setActiveEditingTasks] = useState<Deliverable[]>([]);
  const [streak, setStreak] = useState<StreakInfo>({
    currentStreak: 0,
    publishedToday: false,
    lastPublishedDate: null,
    statusMessage: 'Loading publishing streak...'
  });
  const [isLoading, setIsLoading] = useState(true);

  // Channel Drilldown Modal State (7-Day Output with Live Video Player)
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [selectedChannelFilter, setSelectedChannelFilter] = useState<string>('all');

  // Social Media Manager Direct Publish Modal State
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [publishVideoTitle, setPublishVideoTitle] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<string>('Digital Inertia');
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>('youtube_shorts');
  const [livePostUrl, setLivePostUrl] = useState('');
  const [publishNotes, setPublishNotes] = useState('');
  const [isSubmittingPublish, setIsSubmittingPublish] = useState(false);
  const [selectedDeliverableId, setSelectedDeliverableId] = useState<string>('');
  const [availableDeliverables, setAvailableDeliverables] = useState<Deliverable[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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
          deliverable_title: getLogCleanTitle(l),
          channel_name: getLogChannelName(l)
        }));
        setStreak(calculatePublishingStreak(mappedLogs));
        
        // Filter logs published today (matching reporting_date or published_at timestamp in IST)
        const filteredToday = mappedLogs.filter(l => 
          l.reporting_date === todayStr || (l.published_at && l.published_at.startsWith(todayStr))
        );
        setTodayPublishedLogs(filteredToday);

        // Keep only 1 week of data (past 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenDaysAgoStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(sevenDaysAgo);

        const lastWeekLogs = mappedLogs.filter(l => {
          const logDate = l.reporting_date || (l.published_at ? l.published_at.split('T')[0] : '');
          return logDate >= sevenDaysAgoStr;
        });
        setWeekPublishedLogs(lastWeekLogs);
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

      // 4. Fetch deliverables available for linking
      const { data: delivList } = await supabase
        .from('deliverables')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

      if (delivList) {
        setAvailableDeliverables(delivList);
      }
    } catch (e) {
      console.error('Error loading dashboard data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handlePublishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!livePostUrl.trim()) {
      showToast('Live video link / URL is required as proof.');
      return;
    }

    setIsSubmittingPublish(true);

    try {
      const now = new Date().toISOString();
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

      // 1. Resolve Deliverable & Recording IDs
      let finalDeliverableId: string | null = null;
      let finalRecordingId = '';

      if (!finalRecordingId) {
        // Query the latest available recording from the database
        const { data: recs } = await supabase
          .from('recordings')
          .select('id')
          .order('created_at', { ascending: false })
          .limit(1);

        if (recs && recs.length > 0) {
          finalRecordingId = recs[0].id;
        } else {
          // Fallback: create default recording for direct social upload
          const { data: newRec } = await supabase
            .from('recordings')
            .insert([{
              title: 'Social Media Direct Uploads',
              recording_date: todayStr,
              date_received: todayStr,
              hard_disk_name: 'Cloud / Direct Social',
              folder_path: '/social-media/direct-uploads',
              registered_by: currentUser.id
            }])
            .select()
            .single();

          if (newRec) finalRecordingId = newRec.id;
        }
      }

      const chosenTitle = publishNotes.trim() || `${selectedChannel} ${formatPlatformLabel(selectedPlatform)} (${todayStr})`;

      // If no deliverable was selected, create a deliverable record so it links cleanly in stats
      if (!finalDeliverableId && finalRecordingId) {
        const { data: newDel } = await supabase
          .from('deliverables')
          .insert([{
            recording_id: finalRecordingId,
            title: chosenTitle,
            deliverable_type: selectedPlatform === 'youtube_full' ? 'full_length_video' : 'reel',
            editing_status: 'approved',
            progress_percentage: 100,
            priority: 'medium',
            assigned_editor_id: currentUser.id
          }])
          .select()
          .single();

        if (newDel) {
          finalDeliverableId = newDel.id;
        }
      }

      // 2. Prepare payload with notes and channel tag
      const combinedNotes = `[Channel: ${selectedChannel}] ${publishNotes.trim()}`.trim();

      const basePayload: any = {
        deliverable_id: finalDeliverableId,
        recording_id: finalRecordingId,
        platform: selectedPlatform,
        publication_status: 'published',
        published_by: currentUser.id,
        published_at: now,
        post_url: livePostUrl.trim(),
        notes: combinedNotes,
        reporting_date: todayStr
      };

      const payloadWithChannel = {
        ...basePayload,
        channel_name: selectedChannel
      };

      // 3. Resilient Insert into publishing_logs
      let insertRes = await supabase
        .from('publishing_logs')
        .insert([payloadWithChannel]);

      // Fallback A: channel_name column does not exist (PostgreSQL code 42703)
      if (insertRes.error && insertRes.error.code === '42703') {
        insertRes = await supabase
          .from('publishing_logs')
          .insert([basePayload]);
      }

      // Fallback B: platform check constraint rejects custom platforms like facebook/x (PostgreSQL code 23514)
      if (insertRes.error && insertRes.error.code === '23514') {
        const fallbackPayload = {
          ...basePayload,
          platform: 'other',
          notes: `[Platform: ${selectedPlatform}] ${combinedNotes}`.trim()
        };

        let fbRes = await supabase
          .from('publishing_logs')
          .insert([{ ...fallbackPayload, channel_name: selectedChannel }]);

        if (fbRes.error && fbRes.error.code === '42703') {
          fbRes = await supabase
            .from('publishing_logs')
            .insert([fallbackPayload]);
        }
        insertRes = fbRes;
      }

      if (insertRes.error) {
        throw insertRes.error;
      }

      // 4. Update deliverable status to approved and 100% complete
      if (finalDeliverableId) {
        try {
          const { error: updErr } = await supabase
            .from('deliverables')
            .update({
              editing_status: 'approved',
              progress_percentage: 100,
              final_video_link: livePostUrl.trim(),
              approval_notes: `Approved & Published to ${selectedChannel} on ${formatPlatformLabel(selectedPlatform)}`,
              approved_by: currentUser.id,
              approved_at: now,
              updated_at: now
            })
            .eq('id', finalDeliverableId);

          if (updErr && updErr.code === '42703') {
            await supabase
              .from('deliverables')
              .update({
                editing_status: 'approved',
                progress_percentage: 100,
                approved_by: currentUser.id,
                approved_at: now,
                updated_at: now
              })
              .eq('id', finalDeliverableId);
          }
        } catch (delivErr) {
          console.warn('Deliverable update notice:', delivErr);
        }
      }

      showToast(`🎉 Logged published video to ${selectedChannel} on ${formatPlatformLabel(selectedPlatform)}!`);
      setIsPublishModalOpen(false);
      setLivePostUrl('');
      setPublishVideoTitle('');
      setPublishNotes('');
      setSelectedDeliverableId('');
      await loadData();
    } catch (err: any) {
      console.error('Failed to log published video:', err);
      showToast(err.message || 'Failed to update publication.');
    } finally {
      setIsSubmittingPublish(false);
    }
  };

  useEffect(() => {
    loadData();

    // Subscribe to Realtime updates on publishing and deliverables
    const channel = supabase
      .channel('dashboard-realtime-feed')
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

  // Compute live today counts directly from verified published logs
  const todayShorts = todayPublishedLogs.filter(l => getLogPlatform(l) === 'youtube_shorts').length;
  const todayReels = todayPublishedLogs.filter(l => getLogPlatform(l) === 'instagram_reels').length;
  const todayFull = todayPublishedLogs.filter(l => getLogPlatform(l) === 'youtube_full').length;
  const todayFb = todayPublishedLogs.filter(l => getLogPlatform(l) === 'facebook').length;
  const todayX = todayPublishedLogs.filter(l => getLogPlatform(l) === 'x').length;

  const displayShorts = Math.max(summary?.published.youtube_shorts ?? 0, todayShorts);
  const displayReels = Math.max(summary?.published.instagram_reels ?? 0, todayReels);
  const displayFull = Math.max(summary?.published.youtube_full ?? 0, todayFull);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            {todayFormatted} (Asia/Kolkata)
          </span>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {isManager ? 'Social Media Hub' : 'Founder Overview'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isManager
              ? 'Publish videos directly on social media (YouTube, Instagram, Facebook, X) and update the live proof links here.'
              : 'Executive monitoring of video editing progress, channel publications, and manager consistency.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isManager && (
            <button
              onClick={() => setIsPublishModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-purple-500/20 active:scale-95 transition-all"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Update Published Video</span>
            </button>
          )}

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

      {/* Social Media Manager Direct Action Banner */}
      {isManager && (
        <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 border border-purple-500/30 rounded-3xl p-5 shadow-xl text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-black uppercase tracking-wider border border-purple-500/30">
                Official Publishing Portal
              </span>
              <span className="text-[11px] text-purple-200">
                YouTube &bull; Instagram &bull; Facebook &bull; X
              </span>
            </div>
            <h3 className="text-lg font-black text-white">
              Post Videos on Social Media &amp; Update App
            </h3>
            <p className="text-xs text-slate-300 max-w-xl">
              Publish your video directly to <strong>YouTube, Instagram, Facebook, or X</strong>, then log the live video URL here. This records proof, updates today&apos;s output count, and maintains your daily streak.
            </p>
          </div>

          <button
            onClick={() => setIsPublishModalOpen(true)}
            className="px-5 py-3 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-500/30 active:scale-95 transition-all shrink-0"
          >
            <Share2 className="w-4 h-4" />
            <span>+ Update Published Video Link</span>
          </button>
        </div>
      )}

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
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Today's Output Across Official Channels
          </h3>
          <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
            Click any channel to view 7-day videos ↗
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard
            title="YouTube Shorts"
            count={displayShorts}
            target={summary?.targets.youtube_shorts ?? 4}
            icon={<PlaySquare className="w-5 h-5 text-red-600" />}
            colorClass="bg-red-500/10 text-red-600"
            onClick={() => {
              setSelectedChannelFilter('youtube_shorts');
              setShowChannelModal(true);
            }}
          />

          <StatCard
            title="Instagram Reels"
            count={displayReels}
            target={summary?.targets.instagram_reels ?? 4}
            icon={<Camera className="w-5 h-5 text-pink-600" />}
            colorClass="bg-pink-500/10 text-pink-600"
            onClick={() => {
              setSelectedChannelFilter('instagram_reels');
              setShowChannelModal(true);
            }}
          />

          <StatCard
            title="YouTube Full"
            count={displayFull}
            target={summary?.targets.youtube_full ?? 1}
            icon={<Tv className="w-5 h-5 text-blue-600" />}
            colorClass="bg-blue-500/10 text-blue-600"
            onClick={() => {
              setSelectedChannelFilter('youtube_full');
              setShowChannelModal(true);
            }}
          />

          <StatCard
            title="Facebook"
            count={todayFb}
            target={1}
            icon={<Share2 className="w-5 h-5 text-blue-500" />}
            colorClass="bg-blue-500/10 text-blue-500"
            onClick={() => {
              setSelectedChannelFilter('facebook');
              setShowChannelModal(true);
            }}
          />

          <StatCard
            title="X (Twitter)"
            count={todayX}
            target={1}
            icon={<Share2 className="w-5 h-5 text-slate-700 dark:text-slate-300" />}
            colorClass="bg-slate-500/10 text-slate-700 dark:text-slate-300"
            onClick={() => {
              setSelectedChannelFilter('x');
              setShowChannelModal(true);
            }}
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
              Today's Verified Publications by Social Media Manager
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
                        {formatPlatformLabel(log.platform, log.notes)}
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

      {/* SMM UPDATE PUBLISHED VIDEO MODAL */}
      {isPublishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">
                  Social Media Manager &bull; Publishing Update
                </span>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Update Published Video
                </h3>
              </div>
              <button 
                onClick={() => setIsPublishModalOpen(false)} 
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handlePublishSubmit} className="p-5 space-y-4 overflow-y-auto">
              <div className="p-3 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/40 text-xs text-purple-900 dark:text-purple-200 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <span>
                  Publish your video directly to YouTube, Instagram, Facebook, or X first, then paste the live link below to record verified proof.
                </span>
              </div>

              {/* 1. Select Official Channel */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  1. Official Channel Published To
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {OFFICIAL_CHANNELS.map(ch => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setSelectedChannel(ch)}
                      className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all ${
                        selectedChannel === ch
                          ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 ring-2 ring-purple-500/20 shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate">{ch}</span>
                        {selectedChannel === ch && <Check className="w-3.5 h-3.5 text-purple-600 shrink-0" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Platform */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  2. Platform Published
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'youtube_shorts' as PlatformType, label: 'YouTube Shorts', icon: <PlaySquare className="w-3.5 h-3.5 text-red-500" /> },
                    { id: 'instagram_reels' as PlatformType, label: 'Instagram Reels', icon: <Camera className="w-3.5 h-3.5 text-pink-500" /> },
                    { id: 'youtube_full' as PlatformType, label: 'YouTube Full', icon: <Tv className="w-3.5 h-3.5 text-red-600" /> },
                    { id: 'facebook' as PlatformType, label: 'Facebook', icon: <Share2 className="w-3.5 h-3.5 text-blue-600" /> },
                    { id: 'x' as PlatformType, label: 'X (Twitter)', icon: <Share2 className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" /> },
                  ].map(plat => (
                    <button
                      key={plat.id}
                      type="button"
                      onClick={() => setSelectedPlatform(plat.id)}
                      className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                        selectedPlatform === plat.id
                          ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 ring-2 ring-purple-500/20 shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900'
                      }`}
                    >
                      {plat.icon}
                      <span className="truncate">{plat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Live URL Link (Proof) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  3. Live Post URL / Proof Link (Required)
                </label>
                <input
                  type="url"
                  required
                  value={livePostUrl}
                  onChange={(e) => setLivePostUrl(e.target.value)}
                  placeholder="https://youtube.com/shorts/... or https://instagram.com/reel/..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* 4. Notes (Optional) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={publishNotes}
                  onChange={(e) => setPublishNotes(e.target.value)}
                  placeholder="e.g. Published at 7 PM IST"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsPublishModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPublish}
                  className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl transition-all shadow-md shadow-purple-500/20 active:scale-95 disabled:opacity-50"
                >
                  {isSubmittingPublish ? 'Saving Publication...' : 'Confirm & Log Published Video 🚀'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7-DAY CHANNEL DRILLDOWN & VIDEO PLAYER MODAL */}
      {showChannelModal && (() => {
        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

        const filteredLogs = weekPublishedLogs.filter(l => {
          if (selectedChannelFilter === 'all') return true;
          if (selectedChannelFilter === 'youtube_shorts') {
            return l.platform === 'youtube_shorts' || (l.notes && l.notes.includes('youtube_shorts'));
          }
          if (selectedChannelFilter === 'instagram_reels') {
            return l.platform === 'instagram_reels' || (l.notes && l.notes.includes('instagram_reels'));
          }
          if (selectedChannelFilter === 'youtube_full') {
            return l.platform === 'youtube_full' || (l.notes && l.notes.includes('youtube_full'));
          }
          if (selectedChannelFilter === 'facebook') {
            return l.platform === 'facebook' || (l.notes && l.notes.toLowerCase().includes('facebook'));
          }
          if (selectedChannelFilter === 'x') {
            return l.platform === 'x' || (l.notes && (l.notes.toLowerCase().includes('twitter') || l.notes.toLowerCase().includes('platform: x')));
          }
          return l.platform === selectedChannelFilter;
        });

        const todayLogs = filteredLogs.filter(l => 
          l.reporting_date === todayStr || (l.published_at && l.published_at.startsWith(todayStr))
        );
        const pastWeekLogs = filteredLogs.filter(l => 
          !(l.reporting_date === todayStr || (l.published_at && l.published_at.startsWith(todayStr)))
        );

        const channelTabs = [
          { id: 'all', label: 'All Channels', icon: <Layers className="w-3.5 h-3.5" /> },
          { id: 'youtube_shorts', label: 'YouTube Shorts', icon: <PlaySquare className="w-3.5 h-3.5 text-red-500" /> },
          { id: 'instagram_reels', label: 'Instagram Reels', icon: <Camera className="w-3.5 h-3.5 text-pink-500" /> },
          { id: 'youtube_full', label: 'YouTube Full', icon: <Tv className="w-3.5 h-3.5 text-blue-500" /> },
          { id: 'facebook', label: 'Facebook', icon: <Share2 className="w-3.5 h-3.5 text-blue-600" /> },
          { id: 'x', label: 'X (Twitter)', icon: <Share2 className="w-3.5 h-3.5 text-slate-500" /> }
        ];

        const renderPostCard = (log: PublishingLog, isToday = false) => {
          const ytEmbed = getYouTubeEmbedUrl(log.post_url);
          const driveEmbed = getDriveEmbedUrl(log.post_url);
          const directVideo = isDirectVideoUrl(log.post_url);

          return (
            <div key={log.id} className="p-4 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 shadow-sm space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    {formatPlatformLabel(log.platform)}
                  </span>
                  {log.channel_name && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-700 dark:text-purple-300">
                      {log.channel_name}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {isToday ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <span>🔥</span>
                      <span>POSTED TODAY</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatLogDateTime(log.published_at || log.reporting_date)}
                    </span>
                  )}
                </div>
              </div>

              {/* Title */}
              <h4 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-snug">
                {log.deliverable_title || log.notes || 'Published Video'}
              </h4>

              {/* In-App Video Player */}
              {ytEmbed ? (
                <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-md border border-slate-200/40 dark:border-slate-700/40">
                  <iframe
                    src={ytEmbed}
                    title={log.deliverable_title || 'Video Player'}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full border-0"
                  />
                </div>
              ) : driveEmbed ? (
                <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-md border border-slate-200/40 dark:border-slate-700/40">
                  <iframe
                    src={driveEmbed}
                    title={log.deliverable_title || 'Google Drive Player'}
                    allowFullScreen
                    className="absolute inset-0 w-full h-full border-0"
                  />
                </div>
              ) : directVideo ? (
                <video
                  controls
                  className="w-full aspect-video rounded-2xl bg-black max-h-72 object-contain shadow-md"
                  src={log.post_url}
                />
              ) : null}

              {/* Video Link */}
              {log.post_url && (
                <div className="pt-1">
                  <a
                    href={log.post_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-slate-200/80 dark:border-slate-700/80 text-blue-600 dark:text-blue-400 font-bold text-xs transition-colors group"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <PlaySquare className="w-4 h-4 shrink-0 text-red-500" />
                      <span className="truncate">{log.post_url}</span>
                    </div>
                    <span className="flex items-center gap-1 shrink-0 text-[11px] group-hover:underline">
                      <span>Open Link</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </span>
                  </a>
                </div>
              )}
            </div>
          );
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[92vh]">
              {/* Modal Header */}
              <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>Past 7 Days Output</span>
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      {filteredLogs.length} {filteredLogs.length === 1 ? 'Video' : 'Videos'}
                    </span>
                  </div>
                  <h3 className="font-black text-slate-900 dark:text-white text-lg tracking-tight">
                    Channel Output &amp; Video Archive
                  </h3>
                </div>

                <button
                  onClick={() => setShowChannelModal(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Filter Tabs across Channels */}
              <div className="p-3 bg-slate-100/70 dark:bg-slate-900/40 border-b border-slate-200/60 dark:border-slate-700/60 overflow-x-auto no-scrollbar">
                <div className="flex items-center gap-1.5 min-w-max">
                  {channelTabs.map(ch => (
                    <button
                      key={ch.id}
                      onClick={() => setSelectedChannelFilter(ch.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                        selectedChannelFilter === ch.id
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700'
                      }`}
                    >
                      {ch.icon}
                      <span>{ch.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Modal Body */}
              <div className="overflow-y-auto p-4 sm:p-5 space-y-6">
                {/* 1. TODAY'S POSTS */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                        Today's Posts ({todayLogs.length})
                      </h4>
                    </div>
                  </div>

                  {todayLogs.length > 0 ? (
                    <div className="space-y-3">
                      {todayLogs.map(log => renderPostCard(log, true))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 text-center">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                        No videos published to this channel yet today.
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Showing past 7 days output below.
                      </p>
                    </div>
                  )}
                </div>

                {/* 2. PAST 7 DAYS OUTPUT */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                      Past 7 Days History ({pastWeekLogs.length})
                    </h4>
                  </div>

                  {pastWeekLogs.length > 0 ? (
                    <div className="space-y-3">
                      {pastWeekLogs.map(log => renderPostCard(log, false))}
                    </div>
                  ) : (
                    <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-center">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                        No other publications recorded in the past 7 days for this channel.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="p-3.5 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowChannelModal(false)}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Floating Toast Notice */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-bold shadow-xl border border-slate-700 flex items-center gap-2 animate-in slide-in-from-bottom duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
