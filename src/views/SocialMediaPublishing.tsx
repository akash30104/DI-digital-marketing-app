import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Deliverable, PublishingLog, PlatformType } from '../types';
import { 
  calculatePublishingStreak, 
  StreakInfo, 
  getLogChannelName, 
  getLogCleanNotes, 
  formatPlatformLabel 
} from '../lib/streak';
import { 
  Send, PlaySquare, Camera, ExternalLink, Check, X, 
  CheckCircle2, Flame, AlertCircle, Plus, Tv, Radio, 
  Sparkles, Copy, Clock, Layers, ArrowUpRight, CheckCheck
} from 'lucide-react';

export const SocialMediaPublishing: React.FC = () => {
  const { currentUser } = useAuth();
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [allRecentDeliverables, setAllRecentDeliverables] = useState<Deliverable[]>([]);
  const [publishedToday, setPublishedToday] = useState<PublishingLog[]>([]);
  const [streak, setStreak] = useState<StreakInfo>({
    currentStreak: 0,
    publishedToday: false,
    lastPublishedDate: null,
    statusMessage: 'Calculating publishing streak...'
  });
  const [isLoading, setIsLoading] = useState(true);
  const [formatFilter, setFormatFilter] = useState<'all' | 'reel' | 'full_length_video'>('all');

  // Publication Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDeliverableId, setSelectedDeliverableId] = useState<string>('');
  const [customVideoTitle, setCustomVideoTitle] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>('youtube_shorts');
  const [channelName, setChannelName] = useState('Digital Inertia Main');
  const [postUrl, setPostUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const CHANNEL_PRESETS = [
    'Digital Inertia',
    'Unfiltered Podcast',
    'LLBS Podcast',
    'Best Podcast'
  ];

  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  const loadData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Approved Deliverables for Publishing
      const { data: dels } = await supabase
        .from('deliverables')
        .select('*')
        .eq('editing_status', 'approved')
        .order('created_at', { ascending: false });

      if (dels) {
        setDeliverables(dels as Deliverable[]);
      }

      // Also get all recent deliverables to link direct posts if needed
      const { data: allDels } = await supabase
        .from('deliverables')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (allDels) {
        setAllRecentDeliverables(allDels as Deliverable[]);
      }

      // 2. Fetch Publishing Logs with Deliverable Titles
      const { data: logs } = await supabase
        .from('publishing_logs')
        .select(`
          *,
          deliverables:deliverable_id (title, deliverable_type)
        `)
        .order('published_at', { ascending: false })
        .limit(100);

      if (logs) {
        const mappedLogs: PublishingLog[] = logs.map((l: any) => ({
          ...l,
          deliverable_title: l.deliverables?.title || l.notes?.split('\n')[0] || 'Published Video',
          channel_name: getLogChannelName(l)
        }));

        const todayLogs = mappedLogs.filter(l => l.reporting_date === todayStr);
        setPublishedToday(todayLogs);
        setStreak(calculatePublishingStreak(mappedLogs));
      }
    } catch (e) {
      console.error('Failed to load publishing data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Subscribe to realtime updates on publishing_logs
    const sub = supabase
      .channel('publishing-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'publishing_logs' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, []);

  const openPublishModalForDeliverable = (item: Deliverable, platform: PlatformType) => {
    setSelectedDeliverableId(item.id);
    setCustomVideoTitle(item.title);
    setSelectedPlatform(platform);
    if (platform === 'instagram_reels') {
      setChannelName('@digitalinertia');
    } else if (platform === 'youtube_shorts') {
      setChannelName('DI Shorts & Clips');
    } else {
      setChannelName('Digital Inertia Main');
    }
    setPostUrl('');
    setNotes('');
    setIsModalOpen(true);
  };

  const openQuickPublishModal = () => {
    setSelectedDeliverableId(deliverables[0]?.id || 'custom');
    setCustomVideoTitle('');
    setSelectedPlatform('youtube_shorts');
    setChannelName('Digital Inertia Main');
    setPostUrl('');
    setNotes('');
    setIsModalOpen(true);
  };

  const handleConfirmPublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      showToast('You must be logged in to record publications.');
      return;
    }

    if (!postUrl.trim()) {
      showToast('Proof of published URL is required.');
      return;
    }

    if (!channelName.trim()) {
      showToast('Channel name is required.');
      return;
    }

    setIsPublishing(true);

    try {
      let finalDeliverableId = selectedDeliverableId;
      let finalRecordingId = '';

      // Find deliverable from loaded lists
      const matchedDeliverable = [...deliverables, ...allRecentDeliverables].find(d => d.id === selectedDeliverableId);
      
      if (matchedDeliverable) {
        finalDeliverableId = matchedDeliverable.id;
        finalRecordingId = matchedDeliverable.recording_id;
      } else {
        // If it's a direct post without an existing deliverable, look for any default recording or create a quick record
        const { data: recs } = await supabase
          .from('recordings')
          .select('id')
          .order('created_at', { ascending: false })
          .limit(1);

        if (recs && recs.length > 0) {
          finalRecordingId = recs[0].id;
        } else {
          // Create dummy recording for direct post
          const { data: newRec } = await supabase
            .from('recordings')
            .insert([{
              title: 'Daily Social Media Posts',
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

        // Create quick deliverable
        const { data: newDel } = await supabase
          .from('deliverables')
          .insert([{
            recording_id: finalRecordingId,
            title: customVideoTitle.trim() || `Daily Video Post (${formatPlatformLabel(selectedPlatform)})`,
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

      const cleanUserNotes = notes.trim();
      const combinedNotes = `[Channel: ${channelName.trim()}] ${cleanUserNotes}`.trim();

      // First attempt with native channel_name column
      const basePayload = {
        deliverable_id: finalDeliverableId,
        recording_id: finalRecordingId,
        platform: selectedPlatform,
        publication_status: 'published',
        published_by: currentUser.id,
        published_at: new Date().toISOString(),
        post_url: postUrl.trim(),
        notes: combinedNotes,
        reporting_date: todayStr
      };

      const payloadWithChannel = {
        ...basePayload,
        channel_name: channelName.trim()
      };

      let insertRes = await supabase
        .from('publishing_logs')
        .insert([payloadWithChannel])
        .select(`
          *,
          deliverables:deliverable_id (title, deliverable_type)
        `)
        .single();

      // Fallback if channel_name column does not exist in DB yet
      if (insertRes.error && insertRes.error.code === '42703') {
        insertRes = await supabase
          .from('publishing_logs')
          .insert([basePayload])
          .select(`
            *,
            deliverables:deliverable_id (title, deliverable_type)
          `)
          .single();
      }

      if (insertRes.error) {
        throw insertRes.error;
      }

      if (insertRes.data) {
        const newLog: PublishingLog = {
          ...insertRes.data,
          deliverable_title: (insertRes.data as any).deliverables?.title || customVideoTitle.trim() || 'Published Video',
          channel_name: channelName.trim()
        };

        setPublishedToday(prev => [newLog, ...prev]);
        showToast(`Published Video #${publishedToday.length + 1} to ${formatPlatformLabel(selectedPlatform)} on ${channelName.trim()}! 🚀`);
        setIsModalOpen(false);
        setPostUrl('');
        setNotes('');
        setCustomVideoTitle('');
        loadData();
      }
    } catch (err: any) {
      console.error('Error recording publication:', err);
      showToast(err.message || 'Failed to record publication.');
    } finally {
      setIsPublishing(false);
    }
  };

  const copyPostUrl = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    showToast('Video link copied to clipboard!');
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Group today's counts by platform
  const ytShortsCount = publishedToday.filter(l => l.platform === 'youtube_shorts').length;
  const ytFullCount = publishedToday.filter(l => l.platform === 'youtube_full').length;
  const igReelsCount = publishedToday.filter(l => l.platform === 'instagram_reels').length;
  const otherCount = publishedToday.filter(l => l.platform === 'other').length;

  const filteredDeliverables = formatFilter === 'all'
    ? deliverables
    : deliverables.filter(d => d.deliverable_type === formatFilter);

  const todayFormatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date());

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            {todayFormatted} (Asia/Kolkata IST)
          </span>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Social Media Publishing Hub
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Log live video links, update channel names, maintain streaks, and give the daily video publication update.
          </p>
        </div>

        <button
          onClick={openQuickPublishModal}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-500/20 active:scale-95 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>+ Log Video Posted Today</span>
        </button>
      </div>

      {/* TODAY'S POSTED VIDEOS HERO CARD */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 text-white p-5 shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          {/* Main Counter & Streak */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Daily Output Report
              </span>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
                <Flame className="w-3.5 h-3.5 animate-pulse text-orange-500" />
                <span>{streak.currentStreak} {streak.currentStreak === 1 ? 'Day' : 'Days'} Streak</span>
              </div>
            </div>

            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black tracking-tight text-white">
                  {publishedToday.length}
                </span>
                <span className="text-lg font-bold text-slate-300">
                  {publishedToday.length === 1 ? 'Video Posted Today' : 'Videos Posted Today'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {streak.statusMessage}
              </p>
            </div>
          </div>

          {/* Platform Breakdown Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                <PlaySquare className="w-5 h-5" />
              </div>
              <div>
                <span className="text-lg font-black text-white">{ytShortsCount}</span>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">YT Shorts</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-pink-500/20 text-pink-400 flex items-center justify-center shrink-0">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <span className="text-lg font-black text-white">{igReelsCount}</span>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">IG Reels</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center gap-3 col-span-2 sm:col-span-1">
              <div className="w-9 h-9 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                <Tv className="w-5 h-5" />
              </div>
              <div>
                <span className="text-lg font-black text-white">{ytFullCount}</span>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">YT Full</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TODAY'S PUBLISHED PROOF AUDIT LOG */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Today's Verified Publications ({publishedToday.length})</span>
            </h3>
          </div>
          <span className="text-[11px] font-medium text-slate-400">
            Recorded with live URL proofs & channel names
          </span>
        </div>

        {publishedToday.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
            <Radio className="w-8 h-8 text-slate-400 mx-auto opacity-50" />
            <p className="font-bold text-slate-900 dark:text-white text-sm">No videos logged for today yet.</p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Click the "+ Log Video Posted Today" button above or mark an approved video as published below to record today's proof link and channel.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {publishedToday.map((log, index) => {
              const channel = getLogChannelName(log);
              const cleanNotes = getLogCleanNotes(log.notes);
              const publishedTimeIST = new Date(log.published_at).toLocaleTimeString('en-IN', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
              }) + ' IST';

              return (
                <div
                  key={log.id}
                  className="p-4 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3 relative overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-600 text-white">
                        #{publishedToday.length - index} Today
                      </span>

                      {/* Platform Badge */}
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                        log.platform === 'youtube_shorts' 
                          ? 'bg-red-500/15 text-red-600 dark:text-red-400' 
                          : log.platform === 'youtube_full'
                          ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                          : 'bg-pink-500/15 text-pink-600 dark:text-pink-400'
                      }`}>
                        {log.platform === 'youtube_shorts' && <PlaySquare className="w-3 h-3" />}
                        {log.platform === 'youtube_full' && <Tv className="w-3 h-3" />}
                        {log.platform === 'instagram_reels' && <Camera className="w-3 h-3" />}
                        <span>{formatPlatformLabel(log.platform)}</span>
                      </span>

                      {/* Channel Name Badge */}
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center gap-1">
                        <Radio className="w-3 h-3" />
                        <span>{channel}</span>
                      </span>
                    </div>

                    <span className="text-[10px] font-medium text-slate-400 flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" />
                      {publishedTimeIST}
                    </span>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm line-clamp-1">
                      {log.deliverable_title || 'Video Deliverable'}
                    </h4>
                    {cleanNotes && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                        {cleanNotes}
                      </p>
                    )}
                  </div>

                  {/* Proof Link Action Bar */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2">
                    {log.post_url ? (
                      <div className="flex items-center gap-2 overflow-hidden">
                        <a
                          href={log.post_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold transition-all truncate"
                        >
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">Open Live Post Proof</span>
                        </a>

                        <button
                          onClick={() => copyPostUrl(log.id, log.post_url!)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                          title="Copy Link"
                        >
                          {copiedId === log.id ? (
                            <CheckCheck className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-amber-500 italic">No proof link recorded</span>
                    )}

                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full shrink-0">
                      Verified Active
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* APPROVED DELIVERABLES PIPELINE */}
      <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Approved Cuts Ready to Publish
            </h3>
            <p className="text-xs text-slate-400">
              Videos approved by the Social Media Manager ready to be distributed to YouTube and Instagram.
            </p>
          </div>

          {/* Format Filter Tabs */}
          <div className="flex p-1 bg-slate-200 dark:bg-slate-800 rounded-xl self-start sm:self-auto">
            <button
              onClick={() => setFormatFilter('all')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                formatFilter === 'all' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-sm' : 'text-slate-500'
              }`}
            >
              All ({deliverables.length})
            </button>
            <button
              onClick={() => setFormatFilter('reel')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                formatFilter === 'reel' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-sm' : 'text-slate-500'
              }`}
            >
              Reels / Shorts
            </button>
            <button
              onClick={() => setFormatFilter('full_length_video')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                formatFilter === 'full_length_video' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-sm' : 'text-slate-500'
              }`}
            >
              Full Episodes
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading approved deliverables...</div>
        ) : filteredDeliverables.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
            <p className="font-bold text-slate-900 dark:text-white">No pending videos waiting to publish.</p>
            <p className="text-xs text-slate-400">
              Approve cuts in the "Approvals" tab or use "+ Log Video Posted Today" above for direct posts.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredDeliverables.map((item) => {
              const ytPublished = publishedToday.find(
                l => l.deliverable_id === item.id && (l.platform === 'youtube_shorts' || l.platform === 'youtube_full')
              );
              const igPublished = publishedToday.find(
                l => l.deliverable_id === item.id && l.platform === 'instagram_reels'
              );

              return (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400">
                        {item.deliverable_type === 'full_length_video' ? '📺 Full Video' : '📱 Reel / Short'}
                      </span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Approved for Release
                      </span>
                    </div>

                    {item.final_video_link && (
                      <a
                        href={item.final_video_link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <span>Final Cut</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  <h4 className="font-bold text-slate-900 dark:text-white text-base">
                    {item.title}
                  </h4>

                  {/* Independent Platform Actions */}
                  <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-700">
                    {/* YouTube Platform Row */}
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <PlaySquare className="w-4 h-4 text-red-600" />
                        <span className="text-xs font-bold text-slate-900 dark:text-white">YouTube</span>
                        {ytPublished ? (
                          <span className="text-[11px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Check className="w-3 h-3" /> Published on {getLogChannelName(ytPublished)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">Not Published Today</span>
                        )}
                      </div>

                      {ytPublished ? (
                        ytPublished.post_url ? (
                          <a
                            href={ytPublished.post_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <span>View Post</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">Logged</span>
                        )
                      ) : (
                        <button
                          onClick={() => openPublishModalForDeliverable(
                            item, 
                            item.deliverable_type === 'full_length_video' ? 'youtube_full' : 'youtube_shorts'
                          )}
                          className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-sm shadow-red-500/20 active:scale-95"
                        >
                          Mark Published
                        </button>
                      )}
                    </div>

                    {/* Instagram Platform Row */}
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <Camera className="w-4 h-4 text-pink-600" />
                        <span className="text-xs font-bold text-slate-900 dark:text-white">Instagram</span>
                        {igPublished ? (
                          <span className="text-[11px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Check className="w-3 h-3" /> Published on {getLogChannelName(igPublished)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">Not Published Today</span>
                        )}
                      </div>

                      {igPublished ? (
                        igPublished.post_url ? (
                          <a
                            href={igPublished.post_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold text-pink-600 hover:underline flex items-center gap-1"
                          >
                            <span>View Post</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">Logged</span>
                        )
                      ) : (
                        <button
                          onClick={() => openPublishModalForDeliverable(item, 'instagram_reels')}
                          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-pink-600 to-purple-600 hover:opacity-90 text-white text-xs font-bold transition-all shadow-sm active:scale-95"
                        >
                          Mark Published
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* UNIFIED PUBLISHING MODAL (WITH CHANNEL NAME & VIDEO PROOF LINK) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Daily Post Update #{publishedToday.length + 1}
                </span>
                <h3 className="font-black text-slate-900 dark:text-white text-base">
                  Log Video Published Today
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmPublish} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* 1. Target Deliverable / Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Target Deliverable / Title:
                </label>
                {deliverables.length > 0 ? (
                  <select
                    value={selectedDeliverableId}
                    onChange={(e) => {
                      setSelectedDeliverableId(e.target.value);
                      const d = deliverables.find(item => item.id === e.target.value);
                      if (d) setCustomVideoTitle(d.title);
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {deliverables.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.title} ({d.deliverable_type === 'full_length_video' ? 'Full Video' : 'Reel'})
                      </option>
                    ))}
                    <option value="custom">+ Direct Social Post (Custom Title)</option>
                  </select>
                ) : (
                  <p className="text-xs text-slate-500 italic">Creating a direct publication post</p>
                )}

                {(!selectedDeliverableId || selectedDeliverableId === 'custom' || deliverables.length === 0) && (
                  <input
                    type="text"
                    required
                    value={customVideoTitle}
                    onChange={(e) => setCustomVideoTitle(e.target.value)}
                    placeholder="Enter Video Title / Topic (e.g., Scaling Laws reel)"
                    className="mt-2 w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>

              {/* 2. Platform Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Platform Published:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPlatform('youtube_shorts')}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      selectedPlatform === 'youtube_shorts'
                        ? 'border-red-500 bg-red-500/10 text-red-600 font-bold ring-2 ring-red-500/20'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <PlaySquare className="w-4 h-4 mx-auto text-red-600 mb-1" />
                    <span className="text-[11px] block">YT Shorts</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedPlatform('instagram_reels')}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      selectedPlatform === 'instagram_reels'
                        ? 'border-pink-500 bg-pink-500/10 text-pink-600 font-bold ring-2 ring-pink-500/20'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Camera className="w-4 h-4 mx-auto text-pink-600 mb-1" />
                    <span className="text-[11px] block">Instagram</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedPlatform('facebook')}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      selectedPlatform === 'facebook'
                        ? 'border-blue-600 bg-blue-600/10 text-blue-600 font-bold ring-2 ring-blue-600/20'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Send className="w-4 h-4 mx-auto text-blue-600 mb-1" />
                    <span className="text-[11px] block">Facebook</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedPlatform('x')}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      selectedPlatform === 'x'
                        ? 'border-slate-900 dark:border-white bg-slate-900/10 dark:bg-white/10 text-slate-900 dark:text-white font-bold ring-2 ring-slate-900/20'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="w-4 h-4 mx-auto text-xs font-black block mb-1">𝕏</span>
                    <span className="text-[11px] block">X (Twitter)</span>
                  </button>
                </div>
              </div>

              {/* 3. Channel Name (Required) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Channel / Account Name (Required)</span>
                  <span className="text-[10px] text-purple-500 font-semibold">Official Channel Tag</span>
                </label>
                <input
                  type="text"
                  required
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  placeholder="e.g. Digital Inertia Main or @digitalinertia"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                />

                {/* Channel Suggestions */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {CHANNEL_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setChannelName(preset)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition-all ${
                        channelName === preset
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-purple-400'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Live Video Proof Link (Required) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Live Video Link / Proof (Required)
                  </label>
                  {postUrl && (
                    <a
                      href={postUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] font-bold text-blue-500 hover:underline flex items-center gap-1"
                    >
                      <span>Test Link</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <input
                  type="url"
                  required
                  value={postUrl}
                  onChange={(e) => setPostUrl(e.target.value)}
                  placeholder="https://youtube.com/shorts/... or https://instagram.com/reel/..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Founder and team verify this exact link to confirm publication.
                </p>
              </div>

              {/* 5. Notes / Caption */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Notes / Hashtags (optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Trending tags, high initial engagement, etc."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPublishing}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all shadow-md shadow-blue-500/20 active:scale-95 disabled:opacity-50"
                >
                  {isPublishing ? 'Recording Publication...' : 'Confirm & Log Video Post'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
