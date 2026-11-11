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
  Sparkles, Copy, Clock, Layers, ArrowUpRight, CheckCheck, Trash2
} from 'lucide-react';
import { 
  filterDeliverables, filterPublishingLogs, 
  purgeAllPublishingHistory, deleteSinglePublishingLog 
} from '../lib/deletionFilter';
import { fetchDailyTargets, getCachedTargets, TargetConfig } from '../lib/targets';
import { submitPublishingProof, createAuditLog } from '../lib/api';
import { fetchAllChannels, ChannelItem } from '../lib/channels';

export const SocialMediaPublishing: React.FC = () => {
  const { currentUser } = useAuth();
  const [targets, setTargets] = useState<TargetConfig>(getCachedTargets());
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [allRecentDeliverables, setAllRecentDeliverables] = useState<Deliverable[]>([]);
  const [publishedToday, setPublishedToday] = useState<PublishingLog[]>([]);
  const [availableChannels, setAvailableChannels] = useState<ChannelItem[]>([]);
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
      // 0. Fetch Synced Daily Targets & Channels
      try {
        const syncedTargets = await fetchDailyTargets();
        setTargets(syncedTargets);
      } catch (err) {
        console.warn('Error fetching daily targets in publishing hub:', err);
      }

      try {
        const chans = await fetchAllChannels();
        setAvailableChannels(chans);
      } catch (err) {
        console.warn('Channels load note:', err);
      }

      // 1. Fetch Approved & Ready Deliverables for Publishing
      const { data: dels } = await supabase
        .from('deliverables')
        .select('*')
        .or('editing_status.eq.approved,editing_status.eq.submitted_for_approval,progress_percentage.eq.100')
        .order('created_at', { ascending: false });

      if (dels) {
        setDeliverables(filterDeliverables(dels as Deliverable[]));
      }

      // Also get all recent deliverables to link direct posts if needed
      const { data: allDels } = await supabase
        .from('deliverables')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (allDels) {
        setAllRecentDeliverables(filterDeliverables(allDels as Deliverable[]));
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
        const cleanLogs = filterPublishingLogs(logs);
        const mappedLogs: PublishingLog[] = cleanLogs.map((l: any) => ({
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

    // Subscribe to realtime updates on publishing_logs, daily_targets, and profiles
    const sub = supabase
      .channel('publishing-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'publishing_logs' }, () => {
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_targets' }, async () => {
        const t = await fetchDailyTargets();
        setTargets(t);
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async () => {
        const t = await fetchDailyTargets();
        setTargets(t);
      })
      .subscribe();

    const handleStorage = () => {
      setTargets(getCachedTargets());
      loadData();
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('channels-updated', handleStorage);

    return () => {
      supabase.removeChannel(sub);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('channels-updated', handleStorage);
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
    } else if (platform === 'facebook') {
      setChannelName('Digital Inertia FB');
    } else if (platform === 'x') {
      setChannelName('@DigitalInertia');
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
        const defaultPostTitle = `${channelName.trim() || 'Official Channel'} - ${formatPlatformLabel(selectedPlatform)}`;
        const { data: newDel } = await supabase
          .from('deliverables')
          .insert([{
            recording_id: finalRecordingId,
            title: defaultPostTitle,
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
        // Automatically sync deliverable to approved & 100% complete with final live video link
        if (finalDeliverableId) {
          try {
            await supabase
              .from('deliverables')
              .update({
                editing_status: 'approved',
                progress_percentage: 100,
                final_video_link: postUrl.trim(),
                approval_notes: `Approved & Published to ${channelName.trim()} on ${formatPlatformLabel(selectedPlatform)}`,
                approved_by: currentUser.id,
                approved_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('id', finalDeliverableId);
          } catch (delSyncErr) {
            console.error('Failed to update deliverable on publish:', delSyncErr);
          }
        }

        // Record normalized publishing proof and audit log
        try {
          await submitPublishingProof({
            task_id: finalDeliverableId,
            publisher_id: currentUser.id,
            published_by: currentUser.id,
            platform: selectedPlatform,
            channel_name: channelName.trim(),
            post_url: postUrl.trim(),
            published_at: new Date().toISOString(),
            status: 'proof_submitted',
          });
          await createAuditLog(
            'proof_submitted',
            'deliverables',
            finalDeliverableId,
            currentUser.id,
            currentUser.email,
            { platform: selectedPlatform, channel: channelName.trim(), url: postUrl.trim() }
          );
        } catch (proofErr) {
          console.warn('Normalized proof save note:', proofErr);
        }

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

  const handleDeleteAllHistory = async () => {
    const ok = window.confirm('⚠️ Are you sure you want to delete ALL publishing history? This will permanently remove all published posts, proofs, and reset today\'s count.');
    if (!ok) return;

    try {
      await purgeAllPublishingHistory();
      setPublishedToday([]);
      showToast('All publishing history deleted.');
      await loadData();
    } catch (err: any) {
      alert(`Could not delete history: ${err.message}`);
    }
  };

  const handleDeleteSingleLog = async (id: string, title?: string) => {
    if (!window.confirm(`Delete publication record "${title || 'post'}"?`)) return;
    setPublishedToday(prev => prev.filter(l => l.id !== id));
    await deleteSinglePublishingLog(id);
    showToast('Publication record deleted.');
  };

  // Group today's counts by platform
  const ytShortsCount = publishedToday.filter(l => l.platform === 'youtube_shorts').length;
  const ytFullCount = publishedToday.filter(l => l.platform === 'youtube_full').length;
  const igReelsCount = publishedToday.filter(l => l.platform === 'instagram_reels').length;
  const fbCount = publishedToday.filter(l => l.platform === 'facebook').length;
  const xCount = publishedToday.filter(l => l.platform === 'x').length;
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
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400">
            {todayFormatted} (Asia/Kolkata IST)
          </span>
          <h2 className="text-2xl font-black text-white tracking-tight">
            Social Media Publishing Hub
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Log live video links, update channel names, maintain streaks, and give the daily video publication update.
          </p>
        </div>

        <button
          onClick={openQuickPublishModal}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white hover:bg-zinc-200 text-black text-xs font-black shadow-md active:scale-95 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>+ Log Video Posted Today</span>
        </button>
      </div>

      {/* TODAY'S POSTED VIDEOS HERO CARD */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 text-white p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          {/* Main Counter & Streak */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-zinc-800 text-zinc-300 border border-zinc-700/60">
                Daily Output Report
              </span>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-200 border border-zinc-700/60">
                <Flame className="w-3.5 h-3.5 text-zinc-300" />
                <span>{streak.currentStreak} {streak.currentStreak === 1 ? 'Day' : 'Days'} Streak</span>
              </div>
            </div>

            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black tracking-tight text-white">
                  {publishedToday.length}
                </span>
                <span className="text-lg font-bold text-zinc-400">
                  {publishedToday.length === 1 ? 'Video Posted Today' : 'Videos Posted Today'}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                {streak.statusMessage}
              </p>
            </div>
          </div>

          {/* Platform Breakdown Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            <div className="p-3.5 rounded-xl bg-zinc-800/80 border border-zinc-700/50 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-zinc-700/60 text-zinc-200 flex items-center justify-center shrink-0">
                <PlaySquare className="w-5 h-5" />
              </div>
              <div>
                <span className="text-lg font-black text-white">{ytShortsCount} / {targets.shorts}</span>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">YT Shorts</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-800/80 border border-zinc-700/50 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-zinc-700/60 text-zinc-200 flex items-center justify-center shrink-0">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <span className="text-lg font-black text-white">{igReelsCount} / {targets.reels}</span>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">IG Reels</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-800/80 border border-zinc-700/50 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-zinc-700/60 text-zinc-200 flex items-center justify-center shrink-0">
                <Tv className="w-5 h-5" />
              </div>
              <div>
                <span className="text-lg font-black text-white">{ytFullCount} / {targets.full}</span>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">YT Full</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-800/80 border border-zinc-700/50 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-zinc-700/60 text-zinc-200 flex items-center justify-center shrink-0">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <span className="text-lg font-black text-white">{fbCount} / {targets.fb}</span>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Facebook</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-800/80 border border-zinc-700/50 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-zinc-700/60 text-zinc-200 flex items-center justify-center shrink-0">
                <span className="font-black text-base text-zinc-200">𝕏</span>
              </div>
              <div>
                <span className="text-lg font-black text-white">{xCount} / {targets.x}</span>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">X (Twitter)</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TODAY'S PUBLISHED PROOF AUDIT LOG */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-white" />
              <span>Today's Verified Publications ({publishedToday.length})</span>
            </h3>
          </div>

          <button
            type="button"
            onClick={handleDeleteAllHistory}
            className="text-[11px] font-bold text-zinc-400 hover:text-white px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 hover:border-zinc-500 transition-all flex items-center gap-1 active:scale-95"
          >
            <Trash2 className="w-3 h-3 text-zinc-400" />
            <span>Delete All History</span>
          </button>
        </div>

        {publishedToday.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2">
            <Radio className="w-8 h-8 text-zinc-600 mx-auto" />
            <p className="font-bold text-white text-sm">No videos logged for today yet.</p>
            <p className="text-xs text-zinc-500 max-w-md mx-auto">
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
                  className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-sm space-y-3 relative overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-white text-black">
                        #{publishedToday.length - index} Today
                      </span>

                      {/* Platform Badge */}
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 bg-zinc-800 text-zinc-200 border border-zinc-700/60">
                        {log.platform === 'youtube_shorts' && <PlaySquare className="w-3 h-3 text-zinc-300" />}
                        {log.platform === 'youtube_full' && <Tv className="w-3 h-3 text-zinc-300" />}
                        {log.platform === 'instagram_reels' && <Camera className="w-3 h-3 text-zinc-300" />}
                        <span>{formatPlatformLabel(log.platform)}</span>
                      </span>

                      {/* Channel Name Badge */}
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-200 border border-zinc-700/60 flex items-center gap-1">
                        <Radio className="w-3 h-3 text-zinc-400" />
                        <span>{channel}</span>
                      </span>
                    </div>

                    <span className="text-[10px] font-medium text-zinc-500 flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" />
                      {publishedTimeIST}
                    </span>
                  </div>

                  <div>
                    <h4 className="font-bold text-white text-sm line-clamp-1">
                      {log.deliverable_title || 'Video Deliverable'}
                    </h4>
                    {cleanNotes && (
                      <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">
                        {cleanNotes}
                      </p>
                    )}
                  </div>

                  {/* Proof Link Action Bar */}
                  <div className="pt-2 border-t border-zinc-800 flex items-center justify-between gap-2">
                    {log.post_url ? (
                      <div className="flex items-center gap-2 overflow-hidden">
                        <a
                          href={log.post_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-all truncate border border-zinc-700/60"
                        >
                          <ExternalLink className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
                          <span className="truncate">Open Live Post Proof</span>
                        </a>

                        <button
                          onClick={() => copyPostUrl(log.id, log.post_url!)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                          title="Copy Link"
                        >
                          {copiedId === log.id ? (
                            <CheckCheck className="w-4 h-4 text-white" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-500 italic">No proof link recorded</span>
                    )}

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-semibold text-zinc-300 bg-zinc-800 border border-zinc-700/60 px-2 py-0.5 rounded-full">
                        Verified Active
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteSingleLog(log.id, log.deliverable_title)}
                        className="p-1 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                        title="Delete log"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* APPROVED DELIVERABLES PIPELINE */}
      <div className="space-y-4 pt-4 border-t border-zinc-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-white">
              Approved Cuts Ready to Publish
            </h3>
            <p className="text-xs text-zinc-400">
              Videos approved by the Social Media Manager ready to be distributed to YouTube and Instagram.
            </p>
          </div>

          {/* Format Filter Tabs */}
          <div className="flex p-1 bg-zinc-900 border border-zinc-800 rounded-xl self-start sm:self-auto">
            <button
              onClick={() => setFormatFilter('all')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                formatFilter === 'all' ? 'bg-white text-black shadow-sm font-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              All ({deliverables.length})
            </button>
            <button
              onClick={() => setFormatFilter('reel')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                formatFilter === 'reel' ? 'bg-white text-black shadow-sm font-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Reels / Shorts
            </button>
            <button
              onClick={() => setFormatFilter('full_length_video')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                formatFilter === 'full_length_video' ? 'bg-white text-black shadow-sm font-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Full Episodes
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-zinc-500 text-sm">Loading approved deliverables...</div>
        ) : filteredDeliverables.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2">
            <p className="font-bold text-white">No pending videos waiting to publish.</p>
            <p className="text-xs text-zinc-500">
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
              const fbPublished = publishedToday.find(
                l => l.deliverable_id === item.id && l.platform === 'facebook'
              );
              const xPublished = publishedToday.find(
                l => l.deliverable_id === item.id && l.platform === 'x'
              );

              return (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-200 border border-zinc-700/60">
                        {item.deliverable_type === 'full_length_video' ? '📺 Full Video' : '📱 Reel / Short'}
                      </span>
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-200 border border-zinc-700/60 flex items-center gap-1">
                        <Check className="w-3 h-3 text-white" /> Approved for Release
                      </span>
                    </div>

                    {item.final_video_link && (
                      <a
                        href={item.final_video_link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-zinc-300 hover:text-white flex items-center gap-1"
                      >
                        <span>Final Cut</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  <h4 className="font-bold text-white text-base">
                    {item.title}
                  </h4>

                  {/* Independent Platform Actions */}
                  <div className="space-y-2 pt-1 border-t border-zinc-800">
                    {/* YouTube Platform Row */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
                      <div className="flex items-center gap-2">
                        <PlaySquare className="w-4 h-4 text-zinc-300" />
                        <span className="text-xs font-bold text-white">YouTube</span>
                        {ytPublished ? (
                          <span className="text-[11px] font-bold text-zinc-300 bg-zinc-800 border border-zinc-700/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Check className="w-3 h-3 text-white" /> Published on {getLogChannelName(ytPublished)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-500">Not Published Today</span>
                        )}
                      </div>

                      {ytPublished ? (
                        ytPublished.post_url ? (
                          <a
                            href={ytPublished.post_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold text-zinc-300 hover:text-white flex items-center gap-1"
                          >
                            <span>View Post</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-zinc-500 font-medium">Logged</span>
                        )
                      ) : (
                        <button
                          onClick={() => openPublishModalForDeliverable(
                            item, 
                            item.deliverable_type === 'full_length_video' ? 'youtube_full' : 'youtube_shorts'
                          )}
                          className="px-3.5 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-all border border-zinc-700/60 active:scale-95"
                        >
                          Mark Published
                        </button>
                      )}
                    </div>

                    {/* Instagram Platform Row */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
                      <div className="flex items-center gap-2">
                        <Camera className="w-4 h-4 text-zinc-300" />
                        <span className="text-xs font-bold text-white">Instagram</span>
                        {igPublished ? (
                          <span className="text-[11px] font-bold text-zinc-300 bg-zinc-800 border border-zinc-700/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Check className="w-3 h-3 text-white" /> Published on {getLogChannelName(igPublished)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-500">Not Published Today</span>
                        )}
                      </div>

                      {igPublished ? (
                        igPublished.post_url ? (
                          <a
                            href={igPublished.post_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold text-zinc-300 hover:text-white flex items-center gap-1"
                          >
                            <span>View Post</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-zinc-500 font-medium">Logged</span>
                        )
                      ) : (
                        <button
                          onClick={() => openPublishModalForDeliverable(item, 'instagram_reels')}
                          className="px-3.5 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-all border border-zinc-700/60 active:scale-95"
                        >
                          Mark Published
                        </button>
                      )}
                    </div>

                    {/* Facebook Platform Row */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
                      <div className="flex items-center gap-2">
                        <Send className="w-4 h-4 text-zinc-300" />
                        <span className="text-xs font-bold text-white">Facebook</span>
                        {fbPublished ? (
                          <span className="text-[11px] font-bold text-zinc-300 bg-zinc-800 border border-zinc-700/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Check className="w-3 h-3 text-white" /> Published on {getLogChannelName(fbPublished)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-500">Not Published Today</span>
                        )}
                      </div>

                      {fbPublished ? (
                        fbPublished.post_url ? (
                          <a
                            href={fbPublished.post_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold text-zinc-300 hover:text-white flex items-center gap-1"
                          >
                            <span>View Post</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-zinc-500 font-medium">Logged</span>
                        )
                      ) : (
                        <button
                          onClick={() => openPublishModalForDeliverable(item, 'facebook')}
                          className="px-3.5 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-all border border-zinc-700/60 active:scale-95"
                        >
                          Mark Published
                        </button>
                      )}
                    </div>

                    {/* X (Twitter) Platform Row */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-zinc-300 w-4 text-center">𝕏</span>
                        <span className="text-xs font-bold text-white">X (Twitter)</span>
                        {xPublished ? (
                          <span className="text-[11px] font-bold text-zinc-300 bg-zinc-800 border border-zinc-700/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Check className="w-3 h-3 text-white" /> Published on {getLogChannelName(xPublished)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-500">Not Published Today</span>
                        )}
                      </div>

                      {xPublished ? (
                        xPublished.post_url ? (
                          <a
                            href={xPublished.post_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold text-zinc-300 hover:text-white flex items-center gap-1"
                          >
                            <span>View Post</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-zinc-500 font-medium">Logged</span>
                        )
                      ) : (
                        <button
                          onClick={() => openPublishModalForDeliverable(item, 'x')}
                          className="px-3.5 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-all border border-zinc-700/60 active:scale-95"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-800 overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-zinc-800 bg-zinc-900/50">
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
                  Daily Post Update #{publishedToday.length + 1}
                </span>
                <h3 className="font-black text-white text-base">
                  Log Video Published Today
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmPublish} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* 1. Official Channel Published To */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5 flex items-center justify-between">
                  <span>1. Channel / Account Name (Required)</span>
                  <span className="text-[10px] text-zinc-400 font-semibold">Official Channel Tag</span>
                </label>
                <input
                  type="text"
                  required
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  placeholder="e.g. Digital Inertia Main or @digitalinertia"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white font-medium focus:outline-none focus:border-zinc-500"
                />

                {/* Channel Suggestions */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(availableChannels.length > 0 ? availableChannels.map(c => c.name) : CHANNEL_PRESETS).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setChannelName(preset)}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all ${
                        channelName.toLowerCase() === preset.toLowerCase()
                          ? 'bg-white text-black border-white shadow-md'
                          : 'bg-zinc-800 text-zinc-300 border-zinc-700/60 hover:border-zinc-500'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Platform Selector */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  2. Platform Published:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPlatform('youtube_shorts')}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      selectedPlatform === 'youtube_shorts'
                        ? 'border-white bg-zinc-800 text-white font-bold'
                        : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <PlaySquare className="w-4 h-4 mx-auto text-zinc-300 mb-1" />
                    <span className="text-[11px] block">YT Shorts</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedPlatform('instagram_reels')}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      selectedPlatform === 'instagram_reels'
                        ? 'border-white bg-zinc-800 text-white font-bold'
                        : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Camera className="w-4 h-4 mx-auto text-zinc-300 mb-1" />
                    <span className="text-[11px] block">Instagram</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedPlatform('facebook')}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      selectedPlatform === 'facebook'
                        ? 'border-white bg-zinc-800 text-white font-bold'
                        : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Send className="w-4 h-4 mx-auto text-zinc-300 mb-1" />
                    <span className="text-[11px] block">Facebook</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedPlatform('x')}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      selectedPlatform === 'x'
                        ? 'border-white bg-zinc-800 text-white font-bold'
                        : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <span className="w-4 h-4 mx-auto text-xs font-black block mb-1">𝕏</span>
                    <span className="text-[11px] block">X (Twitter)</span>
                  </button>
                </div>
              </div>

              {/* 3. Live Video Proof Link (Required) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-zinc-300">
                    3. Live Video Link / Proof (Required)
                  </label>
                  {postUrl && (
                    <a
                      href={postUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] font-bold text-zinc-400 hover:text-white flex items-center gap-1"
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
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Founder and team verify this exact link to confirm publication.
                </p>
              </div>

              {/* 4. Notes / Caption */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  4. Notes / Hashtags (optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Trending tags, high initial engagement, etc."
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:bg-zinc-800 rounded-full"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPublishing}
                  className="px-6 py-2.5 text-xs font-black text-black bg-white hover:bg-zinc-200 rounded-full transition-all shadow-md active:scale-95 disabled:opacity-50"
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
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-zinc-900 text-white text-xs font-bold shadow-xl border border-zinc-700 flex items-center gap-2 animate-in slide-in-from-bottom duration-200">
          <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
