import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { DailySummary, PublishingLog, Deliverable, PlatformType } from '../types';
import { StatCard, StatusBadge } from '../components/StatComponents';
import { 
  calculatePublishingStreak, StreakInfo, getLogChannelName, 
  formatPlatformLabel, getLogPlatform, getLogCleanTitle, OFFICIAL_CHANNELS 
} from '../lib/streak';
import { 
  PlaySquare, Camera, Tv, Film, CheckCircle2, RotateCcw, 
  Send, RefreshCw, Flame, Radio, ExternalLink, ArrowUpRight, 
  Share2, Plus, X, Check, Sparkles, Layers, Calendar, Clock,
  Play, Video, Trash2, Eye, MessageSquare, Heart, Edit3,
  Zap, Key, Loader2, AlertCircle
} from 'lucide-react';
import { 
  filterDeliverables, filterPublishingLogs, deleteSingleDeliverable, 
  purgeAllDeliverables, deleteSinglePublishingLog 
} from '../lib/deletionFilter';
import { fetchDailyTargets, getCachedTargets, TargetConfig } from '../lib/targets';
import { 
  parseInsights, formatCompactNumber, formatInsightsNote, SocialInsights,
  extractYouTubeVideoId, isYouTubeUrl, fetchYouTubeLiveStats
} from '../lib/insights';
import { fetchAllChannels, ChannelItem } from '../lib/channels';

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

const getInstagramEmbedUrl = (url?: string): string | null => {
  if (!url) return null;
  try {
    const match = url.match(/instagram\.com\/(?:reel|reels|p)\/([a-zA-Z0-9_-]+)/i);
    if (match && match[1]) {
      return `https://www.instagram.com/reel/${match[1]}/embed`;
    }
    return null;
  } catch {
    return null;
  }
};

const getFacebookEmbedUrl = (url?: string): string | null => {
  if (!url) return null;
  try {
    if (url.includes('facebook.com') || url.includes('fb.watch')) {
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=false`;
    }
    return null;
  } catch {
    return null;
  }
};

const getTwitterEmbedUrl = (url?: string): string | null => {
  if (!url) return null;
  try {
    const match = url.match(/(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/i);
    if (match && match[1]) {
      return `https://platform.twitter.com/embed/Tweet.html?id=${match[1]}&theme=dark`;
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

  const [targets, setTargets] = useState<TargetConfig>(getCachedTargets());
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
  const [channelsList, setChannelsList] = useState<ChannelItem[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>('youtube_shorts');
  const [livePostUrl, setLivePostUrl] = useState('');
  const [publishNotes, setPublishNotes] = useState('');
  const [isSubmittingPublish, setIsSubmittingPublish] = useState(false);
  const [selectedDeliverableId, setSelectedDeliverableId] = useState<string>('');
  const [availableDeliverables, setAvailableDeliverables] = useState<Deliverable[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Live Video Insights Modal State
  const [editingInsightsLog, setEditingInsightsLog] = useState<PublishingLog | null>(null);
  const [insightViews, setInsightViews] = useState<number>(0);
  const [insightComments, setInsightComments] = useState<number>(0);
  const [insightShares, setInsightShares] = useState<number>(0);
  const [insightLikes, setInsightLikes] = useState<number>(0);
  const [isSavingInsights, setIsSavingInsights] = useState(false);
  const [isFetchingAutoStats, setIsFetchingAutoStats] = useState(false);
  const [autoFetchMessage, setAutoFetchMessage] = useState<string | null>(null);
  const [showApiKeySetting, setShowApiKeySetting] = useState(false);
  const [youtubeApiKeyInput, setYoutubeApiKeyInput] = useState<string>(() => {
    return typeof window !== 'undefined' ? (localStorage.getItem('youtube_api_key') || '') : '';
  });

  const openEditInsights = (log: PublishingLog) => {
    const current = parseInsights(log.notes);
    setInsightViews(current.views);
    setInsightComments(current.comments);
    setInsightShares(current.shares);
    setInsightLikes(current.likes);
    setAutoFetchMessage(null);
    setEditingInsightsLog(log);
  };

  const handleAutoFetchYouTube = async () => {
    if (!editingInsightsLog?.post_url) return;
    const videoId = extractYouTubeVideoId(editingInsightsLog.post_url);
    if (!videoId) {
      setAutoFetchMessage('❌ Not a recognized YouTube video or Shorts link.');
      return;
    }

    const key = youtubeApiKeyInput.trim() || (typeof window !== 'undefined' ? localStorage.getItem('youtube_api_key') : null);
    if (!key) {
      setShowApiKeySetting(true);
      setAutoFetchMessage('Enter your free YouTube Data API key below to auto-sync statistics.');
      return;
    }

    setIsFetchingAutoStats(true);
    setAutoFetchMessage(null);
    try {
      const stats = await fetchYouTubeLiveStats(videoId, key);
      if (stats) {
        setInsightViews(stats.views);
        setInsightLikes(stats.likes);
        setInsightComments(stats.comments);
        setAutoFetchMessage(`✅ Successfully fetched live YouTube stats: ${stats.views.toLocaleString()} views, ${stats.likes.toLocaleString()} likes, ${stats.comments.toLocaleString()} comments.`);
        if (typeof window !== 'undefined') {
          localStorage.setItem('youtube_api_key', key.trim());
        }
      } else {
        setAutoFetchMessage('⚠️ Could not fetch from YouTube API. Please verify your API Key or enter metrics manually.');
        setShowApiKeySetting(true);
      }
    } catch (err: any) {
      console.error('Error auto-fetching YouTube stats:', err);
      setAutoFetchMessage(`⚠️ Auto-fetch error: ${err.message || 'Check network / API key'}`);
    } finally {
      setIsFetchingAutoStats(false);
    }
  };

  const handleSaveApiKey = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('youtube_api_key', youtubeApiKeyInput.trim());
      showToast('YouTube API Key saved in browser!');
      setShowApiKeySetting(false);
    }
  };

  const handleSaveInsights = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInsightsLog) return;
    setIsSavingInsights(true);

    try {
      const newInsights: Partial<SocialInsights> = {
        views: Math.max(0, Number(insightViews) || 0),
        comments: Math.max(0, Number(insightComments) || 0),
        shares: Math.max(0, Number(insightShares) || 0),
        likes: Math.max(0, Number(insightLikes) || 0),
        isRecorded: true,
      };

      const updatedNotes = formatInsightsNote(editingInsightsLog.notes, newInsights);

      // 1. Update publishing_logs
      await supabase
        .from('publishing_logs')
        .update({ notes: updatedNotes })
        .eq('id', editingInsightsLog.id);

      // 2. Update linked deliverable if exists
      if (editingInsightsLog.deliverable_id) {
        await supabase
          .from('deliverables')
          .update({ approval_notes: updatedNotes })
          .eq('id', editingInsightsLog.deliverable_id);
      }

      // Optimistically update local logs
      setTodayPublishedLogs(prev => prev.map(l => l.id === editingInsightsLog.id ? { ...l, notes: updatedNotes } : l));
      setWeekPublishedLogs(prev => prev.map(l => l.id === editingInsightsLog.id ? { ...l, notes: updatedNotes } : l));

      showToast('🎉 Real video insights saved successfully!');
      setEditingInsightsLog(null);
    } catch (err: any) {
      console.error('Error saving insights:', err);
      alert(`Failed to save insights: ${err.message}`);
    } finally {
      setIsSavingInsights(false);
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

    try {
      // 1. Fetch Dynamic Channels (Studio Defaults + Client Brands + Custom)
      try {
        const loadedChs = await fetchAllChannels();
        setChannelsList(loadedChs);
      } catch (err) {
        console.warn('Could not load channels:', err);
      }

      // 2. Fetch Latest Targets (Synced across Founder and Social Media Manager)
      try {
        const syncedTargets = await fetchDailyTargets();
        setTargets(syncedTargets);
      } catch (err) {
        console.warn('Could not sync daily targets:', err);
      }

      // 2. Fetch Daily Summary RPC
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
        const cleanPubData = filterPublishingLogs(pubData);
        const mappedLogs: PublishingLog[] = cleanPubData.map((l: any) => ({
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
        .limit(16);

      if (edData) {
        const mappedTasks = edData.map((d: any) => ({
          ...d,
          recording_title: d.recordings?.title,
          hard_disk_name: d.recordings?.hard_disk_name,
          editor_name: d.profiles?.full_name || 'Unassigned'
        }));
        setActiveEditingTasks(filterDeliverables(mappedTasks));
      }

      // 4. Fetch deliverables available for linking
      const { data: delivList } = await supabase
        .from('deliverables')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

      if (delivList) {
        setAvailableDeliverables(filterDeliverables(delivList));
      }
    } catch (e) {
      console.error('Error loading dashboard data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSingleTask = async (id: string, title?: string) => {
    if (!window.confirm(`Delete editing task "${title || 'task'}"?`)) return;
    setActiveEditingTasks(prev => prev.filter(t => t.id !== id));
    await deleteSingleDeliverable(id);
    showToast(`Task deleted successfully.`);
  };

  const handleDeleteAllEditingTasks = async () => {
    if (activeEditingTasks.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ALL (${activeEditingTasks.length}) active editing tasks?`)) return;
    const ids = activeEditingTasks.map(t => t.id);
    setActiveEditingTasks([]);
    await purgeAllDeliverables(ids);
    showToast('All editing tasks deleted successfully.');
  };

interface ProjectTaskGroup {
  projectId: string;
  projectTitle: string;
  editorName: string;
  reelsCount: number;
  fullVideosCount: number;
  avgProgress: number;
  tasks: Deliverable[];
}

  // Group active editing tasks by Project / Shoot ("show inside project show all")
  const projectTaskGroups = useMemo<ProjectTaskGroup[]>(() => {
    const map = new Map<string, {
      projectId: string;
      projectTitle: string;
      editorName: string;
      tasks: Deliverable[];
    }>();

    activeEditingTasks.forEach((task: Deliverable) => {
      const projKey = task.recording_id || (task.recording_title ? task.recording_title.trim() : '') || (task.title.includes(' - ') ? task.title.split(' - ')[0].trim() : 'Studio Project');
      const projTitle = task.recording_title || (task.title.includes(' - ') ? task.title.split(' - ')[0].trim() : task.title);

      if (!map.has(projKey)) {
        map.set(projKey, {
          projectId: projKey,
          projectTitle: projTitle,
          editorName: task.editor_name || 'Unassigned',
          tasks: []
        });
      }
      map.get(projKey)!.tasks.push(task);
    });

    return Array.from(map.values()).map(group => {
      const reels = group.tasks.filter((t: Deliverable) => t.deliverable_type === 'reel');
      const fulls = group.tasks.filter((t: Deliverable) => t.deliverable_type === 'full_length_video');
      const totalProg = group.tasks.reduce((acc: number, t: Deliverable) => acc + (t.progress_percentage || 0), 0);
      const avgProg = group.tasks.length > 0 ? Math.round(totalProg / group.tasks.length) : 0;
      const primaryEditor = group.tasks.find((t: Deliverable) => t.editor_name && t.editor_name !== 'Unassigned')?.editor_name || group.editorName;

      return {
        ...group,
        editorName: primaryEditor,
        reelsCount: reels.length,
        fullVideosCount: fulls.length,
        avgProgress: avgProg
      };
    });
  }, [activeEditingTasks]);

  const handleDeleteSingleLog = async (id: string, title?: string) => {
    if (!window.confirm(`Delete published proof "${title || 'video'}"?`)) return;
    setTodayPublishedLogs(prev => prev.filter(l => l.id !== id));
    setWeekPublishedLogs(prev => prev.filter(l => l.id !== id));
    await deleteSinglePublishingLog(id);
    showToast('Published post deleted successfully.');
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

    // Subscribe to Realtime updates on publishing, deliverables, daily_targets, and profiles
    const channel = supabase
      .channel('dashboard-realtime-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliverables' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'publishing_logs' }, () => loadData())
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
      fetchAllChannels().then(setChannelsList).catch(() => {});
    };
    const handleChannelsUpdated = () => {
      fetchAllChannels().then(setChannelsList).catch(() => {});
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('channels-updated', handleChannelsUpdated);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('channels-updated', handleChannelsUpdated);
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

  const targetShorts = targets.shorts;
  const targetReels = targets.reels;
  const targetFull = targets.full;
  const targetFb = targets.fb;
  const targetX = targets.x;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-16">
      {/* Top Header (Visible for Founder Overview; removed from Social Media Hub) */}
      {!isManager && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-400">
              {todayFormatted} (Asia/Kolkata)
            </span>
            <h2 className="text-2xl font-black text-white tracking-tight">
              Founder Overview
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Executive monitoring of video editing progress, channel publications, and manager consistency.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={isLoading}
              className="p-2 rounded-full border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 shadow-sm transition-all self-start sm:self-auto"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      )}

      {/* Social Media Manager Direct Action Banner */}
      {isManager && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-200 border border-zinc-700 text-[10px] font-black uppercase tracking-wider">
                Official Publishing Portal
              </span>
              <span className="text-[11px] text-zinc-400">
                YouTube &bull; Instagram &bull; Facebook &bull; X
              </span>
            </div>
            <h3 className="text-lg font-black text-white">
              Post Videos on Social Media &amp; Update App
            </h3>
            <p className="text-xs text-zinc-400 max-w-xl">
              Publish your video directly to <strong>YouTube, Instagram, Facebook, or X</strong>, then log the live video URL here. This records proof, updates today&apos;s output count, and maintains your daily streak.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsPublishModalOpen(true)}
              className="px-6 py-3 rounded-full bg-white hover:bg-zinc-200 text-black font-black text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all shrink-0"
            >
              <Share2 className="w-4 h-4" />
              <span>+ Update Published Video Link</span>
            </button>
            <button
              onClick={loadData}
              disabled={isLoading}
              className="p-3 rounded-full border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 shadow-sm transition-all"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      )}

      {/* Daily Publishing Goals (Read-Only Executive Overview) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-400">
            Today's Output Across Official Channels
          </h3>
          <span className="text-[10px] font-bold text-zinc-300 bg-white/10 border border-white/10 px-2.5 py-0.5 rounded-full backdrop-blur-md">
            Click any channel to view 7-day videos ↗
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard
            title="YouTube Shorts"
            count={displayShorts}
            target={targetShorts}
            icon={<PlaySquare className="w-5 h-5 text-white" />}
            colorClass="bg-zinc-800 text-zinc-200"
            onClick={() => {
              setSelectedChannelFilter('youtube_shorts');
              setShowChannelModal(true);
            }}
          />

          <StatCard
            title="Instagram Reels"
            count={displayReels}
            target={targetReels}
            icon={<Camera className="w-5 h-5 text-white" />}
            colorClass="bg-zinc-800 text-zinc-200"
            onClick={() => {
              setSelectedChannelFilter('instagram_reels');
              setShowChannelModal(true);
            }}
          />

          <StatCard
            title="YouTube Full"
            count={displayFull}
            target={targetFull}
            icon={<Tv className="w-5 h-5 text-zinc-300" />}
            colorClass="bg-zinc-800 text-zinc-200"
            onClick={() => {
              setSelectedChannelFilter('youtube_full');
              setShowChannelModal(true);
            }}
          />

          <StatCard
            title="Facebook"
            count={todayFb}
            target={targetFb}
            icon={<Share2 className="w-5 h-5 text-zinc-300" />}
            colorClass="bg-zinc-800 text-zinc-200"
            onClick={() => {
              setSelectedChannelFilter('facebook');
              setShowChannelModal(true);
            }}
          />

          <StatCard
            title="X (Twitter)"
            count={todayX}
            target={targetX}
            icon={<Share2 className="w-5 h-5 text-zinc-300" />}
            colorClass="bg-zinc-800 text-zinc-200"
            onClick={() => {
              setSelectedChannelFilter('x');
              setShowChannelModal(true);
            }}
          />
        </div>
      </div>

      {/* Live Video Editing Status by Editors */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-400">
              Live Video Editing Progress
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 border border-zinc-700 text-zinc-200">
              {activeEditingTasks.length} Active Cuts
            </span>
          </div>

          <div className="flex items-center gap-2">
            {activeEditingTasks.length > 0 && (
              <button
                type="button"
                onClick={handleDeleteAllEditingTasks}
                className="px-3 py-1 rounded-full text-[11px] font-bold bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 hover:border-zinc-700 transition-colors flex items-center gap-1.5"
                title="Delete all active editing tasks"
              >
                <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                <span>Delete All Tasks</span>
              </button>
            )}

            <button
              onClick={() => onNavigateTab?.('approvals')}
              className="text-xs font-bold text-zinc-400 hover:text-white transition-colors flex items-center gap-1 group"
            >
              <span>Review Approvals</span>
              <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </div>
        </div>

        {projectTaskGroups.length === 0 ? (
          <div className="p-6 text-center rounded-3xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-500">
            No active video editing tasks in progress right now.
          </div>
        ) : (
          <div className="space-y-4">
            {projectTaskGroups.map((project) => (
              <div 
                key={project.projectId} 
                className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-sm space-y-4"
              >
                {/* Project Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                        🎬 Project
                      </span>
                      <span className="text-xs font-semibold text-zinc-400">
                        {project.tasks.length} {project.tasks.length === 1 ? 'Cut' : 'Cuts'} ({project.reelsCount} {project.reelsCount === 1 ? 'Reel' : 'Reels'}{project.fullVideosCount > 0 ? ` • ${project.fullVideosCount} Full Video` : ''})
                      </span>
                    </div>
                    <h4 className="text-base sm:text-lg font-black text-white tracking-tight">
                      {project.projectTitle}
                    </h4>
                    <div className="text-xs text-zinc-400">
                      Editor: <strong className="text-zinc-200">{project.editorName}</strong>
                    </div>
                  </div>

                  {/* Project Overall Progress & Shortcut */}
                  <div className="flex items-center gap-3">
                    <div className="bg-black/60 px-3.5 py-2 rounded-2xl border border-zinc-800 text-right min-w-[120px]">
                      <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                        Project Progress
                      </div>
                      <div className="text-sm font-black text-white mt-0.5">
                        {project.avgProgress}% Done
                      </div>
                      <div className="w-full bg-zinc-800 rounded-full h-1 mt-1.5 overflow-hidden">
                        <div
                          className="bg-white h-full rounded-full transition-all duration-300"
                          style={{ width: `${project.avgProgress}%` }}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onNavigateTab?.(role === 'founder' ? 'production' : 'pipeline')}
                      className="p-2 rounded-xl text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition"
                      title="Open in Editing Tab"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* INSIDE PROJECT: SHOW ALL REELS & DELIVERABLES */}
                <div className="space-y-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                    <span>All Project Deliverables &amp; Reels ({project.tasks.length})</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {project.tasks.map((task) => (
                      <div
                        key={task.id}
                        className="p-3 rounded-2xl bg-black/60 border border-zinc-800/90 hover:border-zinc-700 transition space-y-2"
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">
                            {task.deliverable_type === 'reel' ? '📱 Reel' : '📺 Full'}
                          </span>
                          <div className="flex items-center gap-1">
                            <StatusBadge status={task.editing_status} />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSingleTask(task.id, task.title);
                              }}
                              className="p-1 rounded text-zinc-500 hover:text-white transition"
                              title="Delete this task"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        <div>
                          <h5 className="font-bold text-xs text-white truncate" title={task.title}>
                            {task.title}
                          </h5>
                          <div className="flex items-center justify-between text-[10px] text-zinc-400 mt-0.5">
                            <span className="truncate">{task.editor_name || project.editorName}</span>
                            <span className="font-bold text-zinc-200">{task.progress_percentage || 0}% Done</span>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
                          <div
                            className="bg-white h-full rounded-full transition-all duration-300"
                            style={{ width: `${task.progress_percentage || 0}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
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
            <h3 className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-400">
              Today's Verified Publications by Social Media Manager
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 border border-zinc-700 text-zinc-200">
              {todayPublishedLogs.length} Posted Today
            </span>
          </div>
        </div>

        {todayPublishedLogs.length === 0 ? (
          <div className="p-6 text-center rounded-3xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-500">
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
                  className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-sm hover:border-zinc-700 transition-all flex items-center justify-between gap-3"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white text-black">
                        #{todayPublishedLogs.length - idx}
                      </span>
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-200 flex items-center gap-1 truncate">
                        <Radio className="w-3 h-3 shrink-0" />
                        <span className="truncate">{channel}</span>
                      </span>
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-zinc-800/60 border border-zinc-700/60 text-zinc-300">
                        {formatPlatformLabel(log.platform, log.notes)}
                      </span>
                    </div>
                    <p className="font-bold text-sm text-white truncate">
                      {log.deliverable_title}
                    </p>
                    <span className="text-[11px] text-zinc-500">
                      Published at {postTime} IST
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {log.post_url ? (
                      <a
                        href={log.post_url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 rounded-full bg-white text-black hover:bg-zinc-200 text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors shadow-sm"
                        title="Open Verified Proof"
                      >
                        <span>Proof</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <span className="text-[11px] text-zinc-500 shrink-0">Recorded</span>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDeleteSingleLog(log.id, log.deliverable_title)}
                      className="p-2 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800 border border-transparent hover:border-zinc-700 transition-colors"
                      title="Delete this published record"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Production Board Pipeline Overview */}
      <div className="space-y-3">
        <h3 className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-400">
          Production Pipeline
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            title="In Editing"
            count={summary?.pipeline.in_editing ?? 0}
            icon={<Film className="w-5 h-5 text-zinc-300" />}
            colorClass="bg-white/5 text-zinc-300"
          />

          <StatCard
            title="Changes Requested"
            count={summary?.pipeline.changes_requested ?? 0}
            icon={<RotateCcw className="w-5 h-5 text-zinc-300" />}
            colorClass="bg-zinc-800 text-zinc-200"
            onClick={() => onNavigateTab?.('approvals')}
          />

          <StatCard
            title="Ready to Publish"
            count={summary?.pipeline.ready_to_publish ?? 0}
            icon={<Send className="w-5 h-5 text-white" />}
            colorClass="bg-zinc-800 text-zinc-200"
          />
        </div>
      </div>

      {/* SMM UPDATE PUBLISHED VIDEO MODAL */}
      {isPublishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
                  Social Media Manager &bull; Publishing Update
                </span>
                <h3 className="font-bold text-white text-base">
                  Update Published Video
                </h3>
              </div>
              <button 
                onClick={() => setIsPublishModalOpen(false)} 
                className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handlePublishSubmit} className="p-6 space-y-5 overflow-y-auto">
              <div className="p-3.5 rounded-2xl bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-zinc-300 shrink-0 mt-0.5" />
                <span>
                  Publish your video directly to YouTube, Instagram, Facebook, or X first, then paste the live link below to record verified proof.
                </span>
              </div>

              {/* 1. Select Official Channel */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[11px] font-black uppercase tracking-[0.16em] text-zinc-400">
                    1. Channel Published To
                  </label>
                  {onNavigateTab && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsPublishModalOpen(false);
                        onNavigateTab('more');
                      }}
                      className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 font-bold transition"
                    >
                      <Plus className="w-3 h-3 text-white" />
                      <span>+ Add Channel in Settings</span>
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {(channelsList.length > 0 ? channelsList : OFFICIAL_CHANNELS.map(name => ({ id: name, name, source: 'default' as const, client_name: null }))).map((ch: ChannelItem | { id: string; name: string; source: 'default'; client_name?: string | null }) => (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => setSelectedChannel(ch.name)}
                      className={`p-3 rounded-2xl border text-xs font-bold text-left transition-all ${
                        selectedChannel === ch.name
                          ? 'border-white bg-white text-black shadow-sm'
                          : 'border-zinc-800 hover:border-zinc-700 text-zinc-300 bg-zinc-800/70'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="truncate">
                          <span className="truncate block">{ch.name}</span>
                          {ch.client_name && (
                            <span className={`text-[9px] ${selectedChannel === ch.name ? 'text-zinc-600' : 'text-zinc-400'} truncate block`}>
                              Client: {ch.client_name}
                            </span>
                          )}
                        </div>
                        {selectedChannel === ch.name && <Check className="w-3.5 h-3.5 text-black shrink-0 ml-1" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Platform */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-[0.16em] text-zinc-400 mb-2">
                  2. Platform Published
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'youtube_shorts' as PlatformType, label: 'YouTube Shorts', icon: <PlaySquare className="w-3.5 h-3.5" /> },
                    { id: 'instagram_reels' as PlatformType, label: 'Instagram Reels', icon: <Camera className="w-3.5 h-3.5" /> },
                    { id: 'youtube_full' as PlatformType, label: 'YouTube Full', icon: <Tv className="w-3.5 h-3.5" /> },
                    { id: 'facebook' as PlatformType, label: 'Facebook', icon: <Share2 className="w-3.5 h-3.5" /> },
                    { id: 'x' as PlatformType, label: 'X (Twitter)', icon: <Share2 className="w-3.5 h-3.5" /> },
                  ].map(plat => (
                    <button
                      key={plat.id}
                      type="button"
                      onClick={() => setSelectedPlatform(plat.id)}
                      className={`p-2.5 rounded-2xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                        selectedPlatform === plat.id
                          ? 'border-white bg-white text-black shadow-sm'
                          : 'border-zinc-800 hover:border-zinc-700 text-zinc-300 bg-zinc-800/70'
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
                <label className="block text-[11px] font-black uppercase tracking-[0.16em] text-zinc-400 mb-2">
                  3. Live Post URL / Proof Link (Required)
                </label>
                <input
                  type="url"
                  required
                  value={livePostUrl}
                  onChange={(e) => setLivePostUrl(e.target.value)}
                  placeholder="https://youtube.com/shorts/... or https://instagram.com/reel/..."
                  className="w-full px-4 py-3 text-xs rounded-2xl border border-zinc-700 bg-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-white focus:border-white"
                />
              </div>

              {/* 4. Notes (Optional) */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-[0.16em] text-zinc-400 mb-2">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={publishNotes}
                  onChange={(e) => setPublishNotes(e.target.value)}
                  placeholder="e.g. Published at 7 PM IST"
                  className="w-full px-4 py-3 text-xs rounded-2xl border border-zinc-700 bg-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-white focus:border-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsPublishModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white rounded-full transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPublish}
                  className="px-6 py-2.5 text-xs font-bold text-black bg-white hover:bg-zinc-200 rounded-full transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                  {isSubmittingPublish ? 'Saving Publication...' : 'Confirm & Log Published Video'}
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
          // Filter by channel name if matching
          if (l.channel_name && l.channel_name.toLowerCase() === selectedChannelFilter.toLowerCase()) {
            return true;
          }
          if (l.notes && l.notes.toLowerCase().includes(`[channel: ${selectedChannelFilter.toLowerCase()}]`)) {
            return true;
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
          ...channelsList.slice(0, 5).map(ch => ({
            id: ch.name,
            label: ch.name,
            icon: <Radio className="w-3.5 h-3.5 text-zinc-300" />
          })),
          { id: 'youtube_shorts', label: 'Shorts', icon: <PlaySquare className="w-3.5 h-3.5 text-zinc-300" /> },
          { id: 'instagram_reels', label: 'Reels', icon: <Camera className="w-3.5 h-3.5 text-zinc-300" /> },
          { id: 'youtube_full', label: 'Full Videos', icon: <Tv className="w-3.5 h-3.5 text-zinc-300" /> }
        ];

        const renderPostCard = (log: PublishingLog, isToday = false) => {
          const ytEmbed = getYouTubeEmbedUrl(log.post_url);
          const igEmbed = getInstagramEmbedUrl(log.post_url);
          const fbEmbed = getFacebookEmbedUrl(log.post_url);
          const twEmbed = getTwitterEmbedUrl(log.post_url);
          const driveEmbed = getDriveEmbedUrl(log.post_url);
          const directVideo = isDirectVideoUrl(log.post_url);

          return (
            <div key={log.id} className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-sm space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-zinc-800 border border-zinc-700 text-zinc-200">
                    {formatPlatformLabel(log.platform)}
                  </span>
                  {log.channel_name && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 border border-zinc-700 text-zinc-300">
                      {log.channel_name}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {isToday ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-zinc-800 border border-zinc-700 text-white flex items-center gap-1">
                      <span>🔥</span>
                      <span>POSTED TODAY</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-zinc-400 font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatLogDateTime(log.published_at || log.reporting_date)}
                    </span>
                  )}
                </div>
              </div>

              {/* Title */}
              <h4 className="font-bold text-white text-sm sm:text-base leading-snug">
                {log.deliverable_title || log.notes || 'Published Video'}
              </h4>

              {/* In-App Multi-Platform Video Player (Instagram, YouTube, Facebook, X, Drive, MP4) */}
              {igEmbed ? (
                <div className="w-full flex justify-center bg-black rounded-2xl p-2 border border-zinc-800 shadow-md">
                  <iframe
                    src={igEmbed}
                    title={log.deliverable_title || 'Instagram Reel Player'}
                    className="w-full max-w-sm h-[520px] rounded-2xl border-0 overflow-hidden bg-black shadow-lg"
                    allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                    allowFullScreen
                    scrolling="no"
                  />
                </div>
              ) : ytEmbed ? (
                <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-md border border-zinc-800">
                  <iframe
                    src={ytEmbed}
                    title={log.deliverable_title || 'YouTube Player'}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full border-0"
                  />
                </div>
              ) : fbEmbed ? (
                <div className="relative w-full aspect-video min-h-[340px] rounded-2xl overflow-hidden bg-black shadow-md border border-zinc-800">
                  <iframe
                    src={fbEmbed}
                    title={log.deliverable_title || 'Facebook Video Player'}
                    allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full border-0"
                    scrolling="no"
                  />
                </div>
              ) : twEmbed ? (
                <div className="w-full flex justify-center bg-black rounded-2xl p-2 border border-zinc-800 shadow-md">
                  <iframe
                    src={twEmbed}
                    title={log.deliverable_title || 'X Tweet Video Player'}
                    className="w-full max-w-md h-[460px] rounded-2xl border-0 overflow-hidden bg-black"
                    allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
                    allowFullScreen
                    scrolling="no"
                  />
                </div>
              ) : driveEmbed ? (
                <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-md border border-zinc-800">
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
                  className="w-full aspect-video rounded-2xl bg-black max-h-72 object-contain shadow-md border border-zinc-800"
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
                    className="inline-flex items-center justify-between w-full px-4 py-2.5 rounded-2xl bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold text-xs transition-colors group"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <PlaySquare className="w-4 h-4 shrink-0 text-zinc-400" />
                      <span className="truncate">{log.post_url}</span>
                    </div>
                    <span className="flex items-center gap-1 shrink-0 text-[11px] group-hover:underline text-white">
                      <span>Open Link</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </span>
                  </a>
                </div>
              )}

              {/* VIDEO PERFORMANCE INSIGHTS DOWN THE VIDEO */}
              {(() => {
                const ins = parseInsights(log.notes);

                return (
                  <div className="bg-black/90 rounded-2xl p-3 border border-zinc-800 space-y-2.5 mt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
                        <span>{ins.isRecorded ? 'Real Video Insights' : 'Video Insights'}</span>
                      </span>

                      <button
                        type="button"
                        onClick={() => openEditInsights(log)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition active:scale-95 ${
                          ins.isRecorded
                            ? 'text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700'
                            : 'text-black bg-white hover:bg-zinc-200'
                        }`}
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>{ins.isRecorded ? 'Update Insights' : '+ Enter Real Stats'}</span>
                      </button>
                    </div>

                    {!ins.isRecorded ? (
                      <div className="py-2.5 px-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between">
                        <div>
                          <p className="text-[11px] text-zinc-300 font-bold">
                            No live metrics logged yet
                          </p>
                          <p className="text-[10px] text-zinc-500">
                            Verified views, likes, and comments from Studio/Dashboard
                          </p>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                          0 Views
                        </span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div className="bg-zinc-900/90 p-2.5 rounded-xl border border-zinc-800">
                          <div className="text-[10px] font-bold text-zinc-400 uppercase flex items-center justify-center gap-1">
                            <Eye className="w-3 h-3 text-zinc-400" />
                            <span>Views</span>
                          </div>
                          <div className="text-sm sm:text-base font-black text-white mt-1">
                            {formatCompactNumber(ins.views)}
                          </div>
                        </div>

                        <div className="bg-zinc-900/90 p-2.5 rounded-xl border border-zinc-800">
                          <div className="text-[10px] font-bold text-zinc-400 uppercase flex items-center justify-center gap-1">
                            <MessageSquare className="w-3 h-3 text-zinc-400" />
                            <span>Comments</span>
                          </div>
                          <div className="text-sm sm:text-base font-black text-white mt-1">
                            {formatCompactNumber(ins.comments)}
                          </div>
                        </div>

                        <div className="bg-zinc-900/90 p-2.5 rounded-xl border border-zinc-800">
                          <div className="text-[10px] font-bold text-zinc-400 uppercase flex items-center justify-center gap-1">
                            <Share2 className="w-3.5 h-3.5 text-zinc-400" />
                            <span>Shares</span>
                          </div>
                          <div className="text-sm sm:text-base font-black text-white mt-1">
                            {formatCompactNumber(ins.shares)}
                          </div>
                        </div>

                        <div className="bg-zinc-900/90 p-2.5 rounded-xl border border-zinc-800">
                          <div className="text-[10px] font-bold text-zinc-400 uppercase flex items-center justify-center gap-1">
                            <Heart className="w-3 h-3 text-zinc-400" />
                            <span>Likes</span>
                          </div>
                          <div className="text-sm sm:text-base font-black text-white mt-1">
                            {formatCompactNumber(ins.likes)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
            <div className="w-full max-w-2xl bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-800 overflow-hidden flex flex-col max-h-[92vh]">
              {/* Modal Header */}
              <div className="p-4 sm:p-5 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white bg-zinc-800 border border-zinc-700 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>Past 7 Days Output</span>
                    </span>
                    <span className="text-[10px] font-bold text-zinc-400">
                      {filteredLogs.length} {filteredLogs.length === 1 ? 'Video' : 'Videos'}
                    </span>
                  </div>
                  <h3 className="font-black text-white text-lg tracking-tight">
                    Channel Output &amp; Video Archive
                  </h3>
                </div>

                <button
                  onClick={() => setShowChannelModal(false)}
                  className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Filter Tabs across Channels */}
              <div className="p-3 bg-black border-b border-zinc-800 overflow-x-auto no-scrollbar">
                <div className="flex items-center gap-1.5 min-w-max">
                  {channelTabs.map(ch => (
                    <button
                      key={ch.id}
                      onClick={() => setSelectedChannelFilter(ch.id)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all ${
                        selectedChannelFilter === ch.id
                          ? 'bg-white text-black shadow-sm'
                          : 'bg-zinc-800 border border-zinc-700/60 text-zinc-400 hover:text-white hover:bg-zinc-700'
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
                      <span className="w-2 h-2 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
                      <h4 className="text-xs font-black uppercase tracking-wider text-zinc-300">
                        Today's Posts ({todayLogs.length})
                      </h4>
                    </div>
                  </div>

                  {todayLogs.length > 0 ? (
                    <div className="space-y-3">
                      {todayLogs.map(log => renderPostCard(log, true))}
                    </div>
                  ) : (
                    <div className="p-5 rounded-2xl bg-zinc-800/40 border border-zinc-800 text-center">
                      <p className="text-xs font-bold text-zinc-400">
                        No videos published to this channel yet today.
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Showing past 7 days output below.
                      </p>
                    </div>
                  )}
                </div>

                {/* 2. PAST 7 DAYS OUTPUT */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-zinc-400" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-zinc-300">
                      Past 7 Days History ({pastWeekLogs.length})
                    </h4>
                  </div>

                  {pastWeekLogs.length > 0 ? (
                    <div className="space-y-3">
                      {pastWeekLogs.map(log => renderPostCard(log, false))}
                    </div>
                  ) : (
                    <div className="p-6 rounded-2xl bg-zinc-800/40 border border-zinc-800 text-center">
                      <p className="text-xs font-bold text-zinc-400">
                        No other publications recorded in the past 7 days for this channel.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowChannelModal(false)}
                  className="px-6 py-2.5 text-xs font-bold rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* EDIT VIDEO INSIGHTS MODAL */}
      {editingInsightsLog && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setEditingInsightsLog(null)}
        >
          <div 
            className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-white" />
                <div>
                  <h3 className="font-bold text-white text-base">Real Video Insights</h3>
                  <p className="text-[11px] text-zinc-400">Exact live engagement numbers (No fake metrics)</p>
                </div>
              </div>
              <button 
                onClick={() => setEditingInsightsLog(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Video Link Reference */}
            {editingInsightsLog.post_url && (
              <div className="px-3.5 py-2.5 rounded-xl bg-black border border-zinc-800 text-[11px] text-zinc-300 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 truncate">
                  <PlaySquare className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span className="truncate text-zinc-400 font-mono text-[10px]">{editingInsightsLog.post_url}</span>
                </div>
                <a
                  href={editingInsightsLog.post_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-white hover:underline flex items-center gap-1 font-bold text-[11px]"
                >
                  <span>Open Video</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {/* YouTube Auto-Fetch Option */}
            {isYouTubeUrl(editingInsightsLog.post_url) && (
              <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs font-black uppercase tracking-wider text-zinc-200">
                      YouTube Live Sync
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowApiKeySetting(!showApiKeySetting)}
                    className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 font-bold transition"
                  >
                    <Key className="w-3 h-3" />
                    <span>{showApiKeySetting ? 'Hide API Key' : 'API Key Setup'}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleAutoFetchYouTube}
                  disabled={isFetchingAutoStats}
                  className="w-full py-2.5 px-3 rounded-xl text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 flex items-center justify-center gap-2 transition disabled:opacity-50 active:scale-95"
                >
                  {isFetchingAutoStats ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                      <span>Fetching Live YouTube Stats...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 text-yellow-400" />
                      <span>Auto-Fetch Live from YouTube</span>
                    </>
                  )}
                </button>

                {showApiKeySetting && (
                  <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2 mt-2">
                    <label className="block text-[10px] font-bold text-zinc-300 uppercase">
                      YouTube Data API v3 Key (Free from Google Cloud)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        placeholder="AIzaSy..."
                        value={youtubeApiKeyInput}
                        onChange={(e) => setYoutubeApiKeyInput(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg text-xs bg-black border border-zinc-800 text-white focus:outline-none focus:border-zinc-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleSaveApiKey}
                        className="px-3.5 py-2 rounded-lg text-xs font-bold bg-white text-black hover:bg-zinc-200 transition"
                      >
                        Save
                      </button>
                    </div>
                    <p className="text-[10px] text-zinc-500">
                      Allows unlimited 1-click retrieval of real view count, likes, and comments from YouTube.
                    </p>
                  </div>
                )}

                {autoFetchMessage && (
                  <div className={`p-2.5 rounded-xl text-xs ${autoFetchMessage.startsWith('✅') ? 'bg-zinc-900 text-white border border-zinc-700 font-semibold' : 'bg-zinc-900 text-zinc-300 border border-zinc-800'}`}>
                    {autoFetchMessage}
                  </div>
                )}
              </div>
            )}

            {/* Manual Entry Form */}
            <div className="text-[11px] text-zinc-400">
              Enter verified numbers from <span className="text-zinc-200 font-bold">YouTube Studio</span> or <span className="text-zinc-200 font-bold">Instagram Professional Dashboard</span>:
            </div>

            <form onSubmit={handleSaveInsights} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1 flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Real Views</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={insightViews}
                    onChange={(e) => setInsightViews(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-black border border-zinc-800 text-white focus:outline-none focus:border-zinc-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1 flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Real Comments</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={insightComments}
                    onChange={(e) => setInsightComments(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-black border border-zinc-800 text-white focus:outline-none focus:border-zinc-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1 flex items-center gap-1">
                    <Share2 className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Real Shares</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={insightShares}
                    onChange={(e) => setInsightShares(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-black border border-zinc-800 text-white focus:outline-none focus:border-zinc-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1 flex items-center gap-1">
                    <Heart className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Real Likes</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={insightLikes}
                    onChange={(e) => setInsightLikes(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-black border border-zinc-800 text-white focus:outline-none focus:border-zinc-500 font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditingInsightsLog(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-800 text-zinc-300 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingInsights}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-white text-black hover:bg-zinc-200 transition shadow disabled:opacity-50"
                >
                  {isSavingInsights ? 'Saving...' : 'Save Real Insights'}
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
