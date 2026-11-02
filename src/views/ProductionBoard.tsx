import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Deliverable, DeliverableType, EditingStatus, Profile, Recording, PublishingLog } from '../types';
import { parseInsights, formatInsightsNote, formatCompactNumber, SocialInsights } from '../lib/insights';
import { 
  Film, Search, ExternalLink, Calendar, HardDrive, Folder, 
  RefreshCw, User, CheckCircle2, Clock, AlertCircle, Edit3, 
  Eye, MessageSquare, Share2, Heart, Play, Youtube, Instagram, 
  Send, Layers, ChevronDown, Plus, Sparkles, X
} from 'lucide-react';

interface PodcastGroup {
  recording: Recording;
  fullVideo: Deliverable | null;
  reels: Deliverable[];
  otherCuts: Deliverable[];
  totalViews: number;
  totalComments: number;
  totalShares: number;
  completionPercentage: number;
}

export const ProductionBoard: React.FC = () => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [publishingLogs, setPublishingLogs] = useState<PublishingLog[]>([]);
  const [editors, setEditors] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [formatFilter, setFormatFilter] = useState<string>('all');

  // Modal for editing insights and live link
  const [editingItem, setEditingItem] = useState<{
    deliverable: Deliverable;
    liveUrl: string;
    insights: SocialInsights;
  } | null>(null);
  const [isSavingInsights, setIsSavingInsights] = useState(false);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchBoardData = async () => {
    try {
      const [recsRes, delivRes, logsRes, profilesRes] = await Promise.all([
        supabase
          .from('recordings')
          .select('*')
          .order('recording_date', { ascending: false }),
        supabase
          .from('deliverables')
          .select(`
            *,
            recordings (title, episode_number, recording_date, hard_disk_name, folder_path, notes),
            profiles:assigned_editor_id (full_name)
          `)
          .order('created_at', { ascending: true }),
        supabase
          .from('publishing_logs')
          .select('*')
          .order('published_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('*')
          .eq('role', 'editor')
          .order('full_name')
      ]);

      if (recsRes.data) {
        setRecordings(recsRes.data);
      }

      if (logsRes.data) {
        setPublishingLogs(logsRes.data);
      }

      if (delivRes.data) {
        const mapped: Deliverable[] = delivRes.data.map((d: any) => ({
          ...d,
          recording_title: d.recordings?.title,
          episode_number: d.recordings?.episode_number,
          hard_disk_name: d.recordings?.hard_disk_name,
          folder_path: d.recordings?.folder_path,
          editor_name: d.profiles?.full_name || 'Unassigned'
        }));
        setDeliverables(mapped);
      }

      if (profilesRes.data) {
        setEditors(profilesRes.data);
      }
    } catch (err) {
      console.error('Failed to load production board:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBoardData();

    const delivSub = supabase
      .channel('production-board-deliverables')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliverables' }, () => {
        fetchBoardData();
      })
      .subscribe();

    const recSub = supabase
      .channel('production-board-recordings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recordings' }, () => {
        fetchBoardData();
      })
      .subscribe();

    const pubSub = supabase
      .channel('production-board-publishing')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'publishing_logs' }, () => {
        fetchBoardData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(delivSub);
      supabase.removeChannel(recSub);
      supabase.removeChannel(pubSub);
    };
  }, []);

  const handleAssignEditor = async (deliverableId: string, editorId: string) => {
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('deliverables')
        .update({
          assigned_editor_id: editorId || null,
          editing_status: editorId ? 'assigned' : 'not_started',
          updated_at: now
        })
        .eq('id', deliverableId);

      if (error) throw error;
      showToast('Editor assignment updated successfully!');
      fetchBoardData();
    } catch (e: any) {
      alert(`Assignment failed: ${e.message}`);
    }
  };

  // Resolve effective live URL given by Social Media Manager
  const getDeliverableLiveUrl = (item: Deliverable): string => {
    if (item.final_video_link && item.final_video_link.trim()) {
      return item.final_video_link.trim();
    }
    const matchedLog = publishingLogs.find(log => log.deliverable_id === item.id && log.post_url);
    if (matchedLog && matchedLog.post_url) {
      return matchedLog.post_url.trim();
    }
    return '';
  };

  // Resolve deliverable insights
  const getDeliverableInsights = (item: Deliverable): SocialInsights => {
    const matchedLog = publishingLogs.find(log => log.deliverable_id === item.id);
    const combinedNotes = `${item.approval_notes || ''} ${item.description || ''} ${matchedLog?.notes || ''}`;
    return parseInsights(combinedNotes, item.id);
  };

  // Open modal to update insights and link
  const openEditInsightsModal = (item: Deliverable) => {
    const liveUrl = getDeliverableLiveUrl(item);
    const insights = getDeliverableInsights(item);
    setEditingItem({
      deliverable: item,
      liveUrl,
      insights
    });
  };

  const handleSaveInsightsAndLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    setIsSavingInsights(true);
    try {
      const { deliverable, liveUrl, insights } = editingItem;
      const updatedNotes = formatInsightsNote(deliverable.approval_notes, insights);

      // 1. Update Deliverable
      const updatePayload: any = {
        final_video_link: liveUrl.trim() || null,
        approval_notes: updatedNotes,
        updated_at: new Date().toISOString()
      };
      if (liveUrl.trim()) {
        updatePayload.editing_status = 'approved';
        updatePayload.progress_percentage = 100;
      }

      const { error: delError } = await supabase
        .from('deliverables')
        .update(updatePayload)
        .eq('id', deliverable.id);

      if (delError) throw delError;

      // 2. If a publishing log exists, update it too for consistency
      const matchedLog = publishingLogs.find(log => log.deliverable_id === deliverable.id);
      if (matchedLog) {
        const logUpdatedNotes = formatInsightsNote(matchedLog.notes, insights);
        await supabase
          .from('publishing_logs')
          .update({
            post_url: liveUrl.trim() || matchedLog.post_url,
            notes: logUpdatedNotes
          })
          .eq('id', matchedLog.id);
      } else if (liveUrl.trim()) {
        // Auto-create publishing log so it appears across all real app tabs and daily counters
        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
        const platform = deliverable.deliverable_type === 'full_length_video' ? 'youtube_full' : 'instagram_reels';
        await supabase
          .from('publishing_logs')
          .insert([{
            deliverable_id: deliverable.id,
            recording_id: deliverable.recording_id,
            platform,
            publication_status: 'published',
            published_by: deliverable.assigned_editor_id || deliverable.approved_by,
            published_at: new Date().toISOString(),
            post_url: liveUrl.trim(),
            channel_name: 'Digital Inertia',
            notes: `[Channel: Digital Inertia] ${updatedNotes}`,
            reporting_date: todayStr
          }]);
      }

      showToast('Live link & social insights updated successfully! 🚀');
      setEditingItem(null);
      fetchBoardData();
    } catch (err: any) {
      console.error('Failed to save insights:', err);
      alert(`Error saving insights: ${err.message}`);
    } finally {
      setIsSavingInsights(false);
    }
  };

  // Group deliverables by Podcast Shoot / Recording
  const podcastGroups = useMemo<PodcastGroup[]>(() => {
    // Map of recording_id -> deliverables
    const groupMap = new Map<string, Deliverable[]>();
    const unlinkedDeliverables: Deliverable[] = [];

    deliverables.forEach(item => {
      if (item.recording_id) {
        if (!groupMap.has(item.recording_id)) {
          groupMap.set(item.recording_id, []);
        }
        groupMap.get(item.recording_id)!.push(item);
      } else {
        unlinkedDeliverables.push(item);
      }
    });

    const groups: PodcastGroup[] = recordings.map(rec => {
      const recDeliverables = groupMap.get(rec.id) || [];
      const fullVideo = recDeliverables.find(d => d.deliverable_type === 'full_length_video') || null;
      const reels = recDeliverables.filter(d => d.deliverable_type === 'reel');
      const otherCuts = recDeliverables.filter(d => d.deliverable_type === 'other');

      let totalViews = 0;
      let totalComments = 0;
      let totalShares = 0;
      let totalProgress = 0;

      recDeliverables.forEach(d => {
        const ins = getDeliverableInsights(d);
        totalViews += ins.views;
        totalComments += ins.comments;
        totalShares += ins.shares;
        totalProgress += d.progress_percentage || 0;
      });

      const avgProgress = recDeliverables.length > 0 
        ? Math.round(totalProgress / recDeliverables.length) 
        : 0;

      return {
        recording: rec,
        fullVideo,
        reels,
        otherCuts,
        totalViews,
        totalComments,
        totalShares,
        completionPercentage: avgProgress
      };
    });

    // If there are unlinked deliverables, synthesize a group
    if (unlinkedDeliverables.length > 0) {
      let totalViews = 0;
      let totalComments = 0;
      let totalShares = 0;
      let totalProgress = 0;

      unlinkedDeliverables.forEach(d => {
        const ins = getDeliverableInsights(d);
        totalViews += ins.views;
        totalComments += ins.comments;
        totalShares += ins.shares;
        totalProgress += d.progress_percentage || 0;
      });

      groups.push({
        recording: {
          id: 'unlinked',
          title: 'Direct Social Cuts & Promos',
          recording_date: new Date().toISOString().split('T')[0],
          date_received: new Date().toISOString().split('T')[0],
          hard_disk_name: 'Cloud / Studio Drives',
          folder_path: '/social-media/direct-cuts',
          notes: 'Standalone video edits and direct social media cuts'
        },
        fullVideo: unlinkedDeliverables.find(d => d.deliverable_type === 'full_length_video') || null,
        reels: unlinkedDeliverables.filter(d => d.deliverable_type === 'reel'),
        otherCuts: unlinkedDeliverables.filter(d => d.deliverable_type === 'other'),
        totalViews,
        totalComments,
        totalShares,
        completionPercentage: Math.round(totalProgress / unlinkedDeliverables.length)
      });
    }

    return groups;
  }, [recordings, deliverables, publishingLogs]);

  // Apply search and status filters
  const filteredGroups = useMemo(() => {
    return podcastGroups.filter(group => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = group.recording.title.toLowerCase().includes(q);
        const matchNotes = (group.recording.notes || '').toLowerCase().includes(q);
        const matchEp = group.recording.episode_number?.toString().includes(q);
        const matchCuts = [...group.reels, ...(group.fullVideo ? [group.fullVideo] : [])].some(
          d => d.title.toLowerCase().includes(q) || (d.editor_name || '').toLowerCase().includes(q)
        );
        if (!matchTitle && !matchNotes && !matchEp && !matchCuts) return false;
      }

      // Status filter
      if (statusFilter !== 'all') {
        const allGroupDeliverables = [
          ...(group.fullVideo ? [group.fullVideo] : []),
          ...group.reels,
          ...group.otherCuts
        ];
        if (statusFilter === 'active') {
          const hasActive = allGroupDeliverables.some(d => !['approved', 'cancelled'].includes(d.editing_status));
          if (!hasActive) return false;
        } else if (statusFilter === 'approved') {
          const hasApproved = allGroupDeliverables.some(d => d.editing_status === 'approved');
          if (!hasApproved) return false;
        } else if (statusFilter === 'needs_attention') {
          const hasAttention = allGroupDeliverables.some(d => ['changes_requested', 'blocked'].includes(d.editing_status));
          if (!hasAttention) return false;
        } else {
          const matches = allGroupDeliverables.some(d => d.editing_status === statusFilter);
          if (!matches) return false;
        }
      }

      // Format filter
      if (formatFilter === 'full_length_video' && !group.fullVideo) return false;
      if (formatFilter === 'reel' && group.reels.length === 0) return false;

      return true;
    });
  }, [podcastGroups, searchQuery, statusFilter, formatFilter]);

  // Total summary metrics
  const totalStats = useMemo(() => {
    let views = 0;
    let comments = 0;
    let shares = 0;
    let fullVideosCount = 0;
    let reelsCount = 0;

    deliverables.forEach(d => {
      const ins = getDeliverableInsights(d);
      views += ins.views;
      comments += ins.comments;
      shares += ins.shares;
      if (d.deliverable_type === 'full_length_video') fullVideosCount++;
      if (d.deliverable_type === 'reel') reelsCount++;
    });

    return { views, comments, shares, fullVideosCount, reelsCount };
  }, [deliverables, publishingLogs]);

  const getStatusBadge = (status: EditingStatus) => {
    switch (status) {
      case 'not_started':
        return { label: 'Not Started', bg: 'bg-zinc-800 text-zinc-300 border-zinc-700' };
      case 'assigned':
        return { label: 'Assigned', bg: 'bg-zinc-800 text-zinc-200 border-zinc-700' };
      case 'editing_in_progress':
        return { label: 'Editing In Progress', bg: 'bg-zinc-800 text-amber-300 border-amber-900/50' };
      case 'internal_review':
        return { label: 'In Review', bg: 'bg-zinc-800 text-indigo-300 border-indigo-900/50' };
      case 'submitted_for_approval':
        return { label: 'Awaiting Approval', bg: 'bg-zinc-800 text-purple-300 border-purple-900/50' };
      case 'changes_requested':
        return { label: 'Changes Requested', bg: 'bg-zinc-800 text-rose-300 border-rose-900/50' };
      case 'approved':
        return { label: 'Approved & Live', bg: 'bg-zinc-800 text-emerald-300 border-emerald-900/50' };
      case 'blocked':
        return { label: 'Blocked', bg: 'bg-red-950/80 text-red-300 border-red-800' };
      default:
        return { label: status, bg: 'bg-zinc-800 text-zinc-300 border-zinc-700' };
    }
  };

  return (
    <div className="space-y-6 pb-24 text-zinc-100">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-[#18181B] text-white px-5 py-3 rounded-2xl border border-zinc-700 shadow-2xl flex items-center gap-3 text-xs font-bold animate-in fade-in slide-in-from-top-4 duration-200">
          <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase bg-zinc-800 border border-zinc-700 text-zinc-400">
              Content Pipeline
            </span>
            <span className="text-zinc-600">•</span>
            <span className="text-xs font-medium text-zinc-400">
              {recordings.length} Podcast Shoots • {deliverables.length} Deliverables
            </span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Film className="w-6 h-6 text-zinc-300" />
            Production Board
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Podcast raw footage, topic breakdowns, nested 16:9 full episodes, 9:16 reels, SMM published links & live social insights.
          </p>
        </div>

        <button
          onClick={() => { setRefreshing(true); fetchBoardData(); }}
          className="self-start sm:self-auto inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#18181B] border border-zinc-800 text-zinc-200 hover:bg-zinc-800 hover:border-zinc-700 transition shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh Board
        </button>
      </div>

      {/* Executive Performance Summary Strip (Black & Charcoal) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#121214] border border-[#27272A] p-4 rounded-2xl">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-zinc-400" /> Total Social Views
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            {formatCompactNumber(totalStats.views)}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">Across all published cuts</div>
        </div>

        <div className="bg-[#121214] border border-[#27272A] p-4 rounded-2xl">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1 flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-zinc-400" /> Total Comments
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            {formatCompactNumber(totalStats.comments)}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">Community engagements</div>
        </div>

        <div className="bg-[#121214] border border-[#27272A] p-4 rounded-2xl">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1 flex items-center gap-1.5">
            <Share2 className="w-3.5 h-3.5 text-zinc-400" /> Total Shares
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            {formatCompactNumber(totalStats.shares)}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">Viral reposts & shares</div>
        </div>

        <div className="bg-[#121214] border border-[#27272A] p-4 rounded-2xl">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-zinc-400" /> Production Assets
          </div>
          <div className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <span>{totalStats.fullVideosCount} Full</span>
            <span className="text-zinc-600">•</span>
            <span>{totalStats.reelsCount} Reels</span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">Active video formats</div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-[#121214] p-4 rounded-2xl border border-[#27272A] space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by podcast title, discussion topic, reel title, or editor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs bg-black border border-[#27272A] text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-xs bg-black border border-[#27272A] text-zinc-300 focus:outline-none focus:border-zinc-500 transition"
          >
            <option value="all">All Production Stages ({deliverables.length} items)</option>
            <option value="active">Active Pipeline (In Progress / In Review)</option>
            <option value="needs_attention">Needs Attention (Changes Requested / Blocked)</option>
            <option value="approved">Approved & Live Published</option>
            <option value="not_started">Not Started</option>
            <option value="editing_in_progress">Editing In Progress</option>
            <option value="submitted_for_approval">Awaiting Founder Approval</option>
          </select>

          {/* Format Filter */}
          <select
            value={formatFilter}
            onChange={(e) => setFormatFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-xs bg-black border border-[#27272A] text-zinc-300 focus:outline-none focus:border-zinc-500 transition"
          >
            <option value="all">All Video Formats (Full Episodes & 9:16 Reels)</option>
            <option value="full_length_video">Full Episodes Only (16:9 Long-Form)</option>
            <option value="reel">Reels & Shorts Only (9:16 Vertical)</option>
          </select>
        </div>
      </div>

      {/* Main Content: Grouped by Podcast Shoot */}
      {loading ? (
        <div className="py-24 text-center">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-white rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-xs text-zinc-500">Loading podcast shoots and deliverables...</p>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="py-20 text-center bg-[#121214] rounded-2xl border border-dashed border-[#27272A] p-8">
          <Film className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-zinc-300">No podcast shoots found</h3>
          <p className="text-xs text-zinc-500 mt-1">Try resetting the search query or register new raw footage</p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredGroups.map((group) => {
            const { recording, fullVideo, reels, otherCuts, totalViews, totalComments, totalShares, completionPercentage } = group;

            return (
              <div
                key={recording.id}
                className="bg-[#121214] rounded-2xl border border-[#27272A] overflow-hidden shadow-xl"
              >
                {/* 1. Podcast Shoot Header Container */}
                <div className="p-5 border-b border-[#27272A] bg-[#161619]/60">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="space-y-2">
                      {/* Shoot Tags Strip */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-zinc-800 text-zinc-300 border border-zinc-700">
                          Podcast Shoot
                        </span>
                        {recording.episode_number && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-900 text-zinc-300 border border-zinc-800">
                            Ep #{recording.episode_number}
                          </span>
                        )}
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-900 text-zinc-400 border border-zinc-800 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-zinc-500" />
                          {recording.recording_date}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-900 text-zinc-400 border border-zinc-800 flex items-center gap-1">
                          <HardDrive className="w-3 h-3 text-zinc-500" />
                          {recording.hard_disk_name || 'Primary Storage'}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-900 text-zinc-400 border border-zinc-800 flex items-center gap-1 truncate max-w-xs">
                          <Folder className="w-3 h-3 text-zinc-500 shrink-0" />
                          <span className="truncate">{recording.folder_path || '/Footage'}</span>
                        </span>
                      </div>

                      {/* Raw Title */}
                      <h2 className="text-xl font-black text-white tracking-tight">
                        {recording.title}
                      </h2>

                      {/* "What they speak about in the podcast" (Notes / Topic summary) */}
                      {recording.notes ? (
                        <div className="text-xs text-zinc-300 bg-black/60 border border-[#27272A] rounded-xl p-3 flex items-start gap-2.5">
                          <Sparkles className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-zinc-400 block text-[11px] mb-0.5 uppercase tracking-wider">
                              Podcast Topic & Discussion Notes:
                            </span>
                            <p className="leading-relaxed whitespace-pre-line text-zinc-300">
                              {recording.notes}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-500 italic">
                          No discussion notes provided for this shoot.
                        </p>
                      )}
                    </div>

                    {/* Aggregate Shoot Insights Pill */}
                    <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end justify-between gap-3 shrink-0">
                      <div className="bg-black border border-[#27272A] rounded-xl p-3 text-right min-w-[160px]">
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                          Total Episode Views
                        </div>
                        <div className="text-xl font-black text-white mt-0.5 flex items-center justify-end gap-1.5">
                          <Eye className="w-4 h-4 text-zinc-400" />
                          {formatCompactNumber(totalViews)}
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-1 flex items-center justify-end gap-2">
                          <span>💬 {formatCompactNumber(totalComments)}</span>
                          <span>🔄 {formatCompactNumber(totalShares)}</span>
                        </div>
                      </div>

                      {/* Progress summary */}
                      <div className="text-xs text-zinc-400 font-medium">
                        Pipeline: <span className="font-bold text-white">{completionPercentage}%</span> complete
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Nested Deliverables Content Area */}
                <div className="p-5 space-y-6">
                  {/* Section A: Full-Length Video (16:9 Long-Form Episode) */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-zinc-400" />
                        <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300">
                          Full-Length Episode (16:9 Long-Form)
                        </h3>
                      </div>
                      <span className="text-[11px] text-zinc-500">
                        {fullVideo ? '1 Full Episode Registered' : 'Not registered yet'}
                      </span>
                    </div>

                    {fullVideo ? (
                      (() => {
                        const liveUrl = getDeliverableLiveUrl(fullVideo);
                        const ins = getDeliverableInsights(fullVideo);
                        const statusBadge = getStatusBadge(fullVideo.editing_status);

                        return (
                          <div className="bg-[#18181B] rounded-2xl border border-[#27272A] p-4 hover:border-zinc-600 transition shadow-sm space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                                    📺 16:9 Master Cut
                                  </span>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusBadge.bg}`}>
                                    {statusBadge.label}
                                  </span>
                                </div>
                                <h4 className="font-bold text-sm text-white">{fullVideo.title}</h4>
                              </div>

                              {/* Live Link Button (provided by SMM) */}
                              {liveUrl ? (
                                <a
                                  href={liveUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white text-black hover:bg-zinc-200 transition shadow"
                                >
                                  <Play className="w-3.5 h-3.5 fill-black" />
                                  Watch Live Post ↗
                                </a>
                              ) : (
                                <button
                                  onClick={() => openEditInsightsModal(fullVideo)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700 transition"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  Add Live Post Link
                                </button>
                              )}
                            </div>

                            {/* Assigned Editor & Progress */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#27272A]">
                              <div className="flex items-center justify-between bg-black/50 p-2.5 rounded-xl border border-[#27272A]">
                                <div className="flex items-center gap-2">
                                  <User className="w-3.5 h-3.5 text-zinc-400" />
                                  <span className="text-xs text-zinc-300 font-medium">
                                    Editor: <strong className="text-white">{fullVideo.editor_name || 'Unassigned'}</strong>
                                  </span>
                                </div>
                                <select
                                  value={fullVideo.assigned_editor_id || ''}
                                  onChange={(e) => handleAssignEditor(fullVideo.id, e.target.value)}
                                  className="text-[10px] font-bold rounded-lg px-2 py-1 bg-zinc-800 border border-zinc-700 text-zinc-200 focus:outline-none"
                                >
                                  <option value="">{fullVideo.assigned_editor_id ? 'Change' : '+ Assign'}</option>
                                  {editors.map((ed) => (
                                    <option key={ed.id} value={ed.id}>{ed.full_name}</option>
                                  ))}
                                </select>
                              </div>

                              <div className="bg-black/50 p-2.5 rounded-xl border border-[#27272A] flex flex-col justify-center">
                                <div className="flex justify-between text-[10px] font-bold text-zinc-400 mb-1">
                                  <span>Editing Progress</span>
                                  <span className="text-white">{fullVideo.progress_percentage}%</span>
                                </div>
                                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-white rounded-full transition-all duration-300"
                                    style={{ width: `${fullVideo.progress_percentage}%` }}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Social Media Insights Strip (Views, Comments, Shares, Likes) */}
                            <div className="bg-black/80 rounded-xl p-3 border border-[#27272A] space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                                  <Sparkles className="w-3 h-3 text-zinc-300" />
                                  Live Social Insights
                                </span>
                                <button
                                  onClick={() => openEditInsightsModal(fullVideo)}
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-400 hover:text-white transition"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  Update Insights & Link
                                </button>
                              </div>

                              <div className="grid grid-cols-4 gap-2 text-center">
                                <div className="bg-[#18181B] p-2 rounded-lg border border-[#27272A]">
                                  <div className="text-[10px] font-bold text-zinc-500 uppercase flex items-center justify-center gap-1">
                                    <Eye className="w-3 h-3 text-zinc-400" /> Views
                                  </div>
                                  <div className="text-sm font-black text-white mt-0.5">
                                    {formatCompactNumber(ins.views)}
                                  </div>
                                </div>

                                <div className="bg-[#18181B] p-2 rounded-lg border border-[#27272A]">
                                  <div className="text-[10px] font-bold text-zinc-500 uppercase flex items-center justify-center gap-1">
                                    <MessageSquare className="w-3 h-3 text-zinc-400" /> Comments
                                  </div>
                                  <div className="text-sm font-black text-white mt-0.5">
                                    {formatCompactNumber(ins.comments)}
                                  </div>
                                </div>

                                <div className="bg-[#18181B] p-2 rounded-lg border border-[#27272A]">
                                  <div className="text-[10px] font-bold text-zinc-500 uppercase flex items-center justify-center gap-1">
                                    <Share2 className="w-3 h-3 text-zinc-400" /> Shares
                                  </div>
                                  <div className="text-sm font-black text-white mt-0.5">
                                    {formatCompactNumber(ins.shares)}
                                  </div>
                                </div>

                                <div className="bg-[#18181B] p-2 rounded-lg border border-[#27272A]">
                                  <div className="text-[10px] font-bold text-zinc-500 uppercase flex items-center justify-center gap-1">
                                    <Heart className="w-3 h-3 text-zinc-400" /> Likes
                                  </div>
                                  <div className="text-sm font-black text-white mt-0.5">
                                    {formatCompactNumber(ins.likes)}
                                  </div>
                                </div>
                              </div>

                              {liveUrl && (
                                <div className="text-[11px] text-zinc-400 truncate flex items-center gap-1 pt-1 border-t border-[#27272A]/80">
                                  <span className="text-zinc-500 shrink-0">Live URL:</span>
                                  <a
                                    href={liveUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-zinc-300 hover:text-white underline truncate"
                                  >
                                    {liveUrl}
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="p-4 rounded-2xl bg-black/40 border border-dashed border-[#27272A] text-center text-xs text-zinc-500">
                        No 16:9 full-length episode registered for this shoot yet.
                      </div>
                    )}
                  </div>

                  {/* Section B: Reels & Shorts (9:16 Vertical Cuts) */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-zinc-400" />
                        <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300">
                          Reels & Shorts (9:16 Vertical Cuts)
                        </h3>
                      </div>
                      <span className="text-[11px] text-zinc-500">
                        {reels.length} {reels.length === 1 ? 'Cut' : 'Cuts'} Total
                      </span>
                    </div>

                    {reels.length === 0 ? (
                      <div className="p-4 rounded-2xl bg-black/40 border border-dashed border-[#27272A] text-center text-xs text-zinc-500">
                        No vertical reels registered for this shoot.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {reels.map((reel) => {
                          const liveUrl = getDeliverableLiveUrl(reel);
                          const ins = getDeliverableInsights(reel);
                          const statusBadge = getStatusBadge(reel.editing_status);

                          return (
                            <div
                              key={reel.id}
                              className="bg-[#18181B] rounded-2xl border border-[#27272A] p-4 hover:border-zinc-600 transition flex flex-col justify-between space-y-3 shadow-sm"
                            >
                              <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                                    📱 Reel (9:16)
                                  </span>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusBadge.bg}`}>
                                    {statusBadge.label}
                                  </span>
                                </div>

                                <h4 className="font-bold text-xs text-white line-clamp-2 leading-snug">
                                  {reel.title}
                                </h4>

                                {/* Editor assignment */}
                                <div className="flex items-center justify-between text-[11px] bg-black/50 p-2 rounded-xl border border-[#27272A]">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <User className="w-3 h-3 text-zinc-400 shrink-0" />
                                    <span className="truncate text-zinc-300">
                                      {reel.editor_name !== 'Unassigned' ? reel.editor_name : 'No Editor'}
                                    </span>
                                  </div>
                                  <select
                                    value={reel.assigned_editor_id || ''}
                                    onChange={(e) => handleAssignEditor(reel.id, e.target.value)}
                                    className="text-[10px] font-bold rounded-lg px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-200 focus:outline-none"
                                  >
                                    <option value="">{reel.assigned_editor_id ? 'Change' : '+ Assign'}</option>
                                    {editors.map((ed) => (
                                      <option key={ed.id} value={ed.id}>{ed.full_name}</option>
                                    ))}
                                  </select>
                                </div>

                                {/* Progress Bar */}
                                <div>
                                  <div className="flex justify-between text-[10px] font-bold text-zinc-400 mb-1">
                                    <span>Progress</span>
                                    <span className="text-white">{reel.progress_percentage}%</span>
                                  </div>
                                  <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-white rounded-full transition-all duration-300"
                                      style={{ width: `${reel.progress_percentage}%` }}
                                    />
                                  </div>
                                </div>

                                {/* SMM Live Link Button */}
                                <div>
                                  {liveUrl ? (
                                    <a
                                      href={liveUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold bg-white text-black hover:bg-zinc-200 transition shadow-sm"
                                    >
                                      <Play className="w-3 h-3 fill-black" />
                                      Watch Reel ↗
                                    </a>
                                  ) : (
                                    <button
                                      onClick={() => openEditInsightsModal(reel)}
                                      className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold bg-black border border-dashed border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition"
                                    >
                                      <Plus className="w-3 h-3" />
                                      Attach SMM Live Link
                                    </button>
                                  )}
                                </div>

                                {/* Live Insights 4-Stat Row */}
                                <div className="bg-black/80 rounded-xl p-2.5 border border-[#27272A] space-y-1.5">
                                  <div className="flex items-center justify-between text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                                    <span>Insights</span>
                                    <button
                                      onClick={() => openEditInsightsModal(reel)}
                                      className="text-zinc-400 hover:text-white inline-flex items-center gap-1 text-[10px]"
                                    >
                                      <Edit3 className="w-2.5 h-2.5" /> Edit
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-4 gap-1 text-center">
                                    <div className="bg-[#18181B] py-1 px-0.5 rounded border border-[#27272A]">
                                      <div className="text-[9px] text-zinc-500">Views</div>
                                      <div className="text-[11px] font-black text-white">
                                        {formatCompactNumber(ins.views)}
                                      </div>
                                    </div>
                                    <div className="bg-[#18181B] py-1 px-0.5 rounded border border-[#27272A]">
                                      <div className="text-[9px] text-zinc-500">Comm</div>
                                      <div className="text-[11px] font-black text-white">
                                        {formatCompactNumber(ins.comments)}
                                      </div>
                                    </div>
                                    <div className="bg-[#18181B] py-1 px-0.5 rounded border border-[#27272A]">
                                      <div className="text-[9px] text-zinc-500">Shares</div>
                                      <div className="text-[11px] font-black text-white">
                                        {formatCompactNumber(ins.shares)}
                                      </div>
                                    </div>
                                    <div className="bg-[#18181B] py-1 px-0.5 rounded border border-[#27272A]">
                                      <div className="text-[9px] text-zinc-500">Likes</div>
                                      <div className="text-[11px] font-black text-white">
                                        {formatCompactNumber(ins.likes)}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Footer preview action */}
                              {reel.preview_link && (
                                <a
                                  href={reel.preview_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] font-bold text-zinc-400 hover:text-white inline-flex items-center gap-1 pt-2 border-t border-[#27272A]"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Watch Draft Preview
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Update Live Link & Social Insights */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121214] border border-[#27272A] rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#27272A] pb-4">
              <div>
                <span className="text-[10px] font-black tracking-widest uppercase text-zinc-400">
                  Update Performance
                </span>
                <h3 className="text-lg font-black text-white">
                  Social Insights & Live Link
                </h3>
              </div>
              <button
                onClick={() => setEditingItem(null)}
                className="p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveInsightsAndLink} className="space-y-4">
              {/* Deliverable Info */}
              <div className="bg-black/60 p-3 rounded-xl border border-[#27272A]">
                <div className="text-[10px] text-zinc-500 uppercase font-bold">Cut / Video Title</div>
                <div className="text-xs font-bold text-white mt-0.5">{editingItem.deliverable.title}</div>
              </div>

              {/* Live URL Given by Social Media Manager */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 text-zinc-400" />
                  Live Published Video Link (YouTube / Instagram / TikTok / X)
                </label>
                <input
                  type="url"
                  placeholder="https://www.youtube.com/shorts/... or https://instagram.com/reel/..."
                  value={editingItem.liveUrl}
                  onChange={(e) => setEditingItem({ ...editingItem, liveUrl: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-black border border-[#27272A] text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-400 transition"
                />
                <p className="text-[10px] text-zinc-500">
                  The live post link given by the Social Media Manager after publishing.
                </p>
              </div>

              {/* 4 Performance Metric Fields */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
                  Current Social Media Performance Metrics
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-zinc-400 flex items-center gap-1 mb-1">
                      <Eye className="w-3 h-3" /> Views
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={editingItem.insights.views}
                      onChange={(e) => setEditingItem({
                        ...editingItem,
                        insights: { ...editingItem.insights, views: parseInt(e.target.value, 10) || 0 }
                      })}
                      className="w-full px-3 py-2 rounded-xl text-xs bg-black border border-[#27272A] text-white focus:outline-none focus:border-zinc-400"
                    />
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase text-zinc-400 flex items-center gap-1 mb-1">
                      <MessageSquare className="w-3 h-3" /> Comments
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={editingItem.insights.comments}
                      onChange={(e) => setEditingItem({
                        ...editingItem,
                        insights: { ...editingItem.insights, comments: parseInt(e.target.value, 10) || 0 }
                      })}
                      className="w-full px-3 py-2 rounded-xl text-xs bg-black border border-[#27272A] text-white focus:outline-none focus:border-zinc-400"
                    />
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase text-zinc-400 flex items-center gap-1 mb-1">
                      <Share2 className="w-3 h-3" /> Shares
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={editingItem.insights.shares}
                      onChange={(e) => setEditingItem({
                        ...editingItem,
                        insights: { ...editingItem.insights, shares: parseInt(e.target.value, 10) || 0 }
                      })}
                      className="w-full px-3 py-2 rounded-xl text-xs bg-black border border-[#27272A] text-white focus:outline-none focus:border-zinc-400"
                    />
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase text-zinc-400 flex items-center gap-1 mb-1">
                      <Heart className="w-3 h-3" /> Likes
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={editingItem.insights.likes}
                      onChange={(e) => setEditingItem({
                        ...editingItem,
                        insights: { ...editingItem.insights, likes: parseInt(e.target.value, 10) || 0 }
                      })}
                      className="w-full px-3 py-2 rounded-xl text-xs bg-black border border-[#27272A] text-white focus:outline-none focus:border-zinc-400"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#27272A]">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingInsights}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-white text-black hover:bg-zinc-200 transition shadow disabled:opacity-50"
                >
                  {isSavingInsights ? 'Saving...' : 'Save Live Insights'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
