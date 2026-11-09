import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Deliverable, DeliverableType, EditingStatus, Profile, Recording, PublishingLog } from '../types';
import { parseInsights, formatInsightsNote, formatCompactNumber, SocialInsights } from '../lib/insights';
import { 
  Film, Search, ExternalLink, Calendar, HardDrive, Folder, 
  RefreshCw, User, CheckCircle2, Clock, AlertCircle, Edit3, 
  Eye, MessageSquare, Share2, Heart, Play, Youtube, Instagram, 
  Send, Layers, ChevronDown, Plus, Sparkles, X, Trash2
} from 'lucide-react';
import { 
  filterDeliverables, filterRecordings, filterPublishingLogs, 
  deleteSingleDeliverable, purgeAllDeliverables 
} from '../lib/deletionFilter';

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

  // Modal for editor-wise detailed breakdown
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [editorModalTab, setEditorModalTab] = useState<'all' | 'today' | 'pending'>('all');

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
        setRecordings(filterRecordings(recsRes.data));
      }

      if (logsRes.data) {
        setPublishingLogs(filterPublishingLogs(logsRes.data));
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
        setDeliverables(filterDeliverables(mapped));
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

  const handleDeleteDeliverable = async (id: string, title?: string) => {
    if (!window.confirm(`Delete task "${title || 'item'}"?`)) return;
    setDeliverables(prev => prev.filter(d => d.id !== id));
    await deleteSingleDeliverable(id);
    setToastMessage(`Task deleted successfully.`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleDeleteAllTasks = async () => {
    if (deliverables.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ALL (${deliverables.length}) deliverables?`)) return;
    const ids = deliverables.map(d => d.id);
    setDeliverables([]);
    await purgeAllDeliverables(ids);
    setToastMessage(`All deliverables deleted successfully.`);
    setTimeout(() => setToastMessage(null), 3000);
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

  // Today's date string in Asia/Kolkata
  const todayDateStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  }, []);

  // Deliverables edited today (100% done, submitted, or approved today)
  const todayEditedVideos = useMemo(() => {
    return deliverables.filter(d => {
      if (d.editing_status === 'cancelled') return false;
      const updatedDate = d.updated_at 
        ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(d.updated_at)) 
        : '';
      const createdDate = d.created_at
        ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(d.created_at))
        : '';
      const isToday = updatedDate === todayDateStr || createdDate === todayDateStr;
      const isDone = (d.progress_percentage || 0) === 100 || 
                     d.editing_status === 'approved' || 
                     d.editing_status === 'submitted_for_approval';
      return isDone && (isToday || !d.updated_at);
    });
  }, [deliverables, todayDateStr]);

  // Pending deliverables (not yet 100% done and not yet approved)
  const pendingDeliverables = useMemo(() => {
    return deliverables.filter(d => {
      if (d.editing_status === 'cancelled') return false;
      const isDone = (d.progress_percentage || 0) === 100 || d.editing_status === 'approved';
      return !isDone;
    });
  }, [deliverables]);

  // Unassigned deliverables in pipeline
  const unassignedDeliverables = useMemo(() => {
    return deliverables.filter(d => !d.assigned_editor_id && d.editing_status !== 'cancelled');
  }, [deliverables]);

  // Detailed editor-wise breakdown
  const editorBreakdowns = useMemo(() => {
    return editors.map(editor => {
      const assigned = deliverables.filter(d => d.assigned_editor_id === editor.id && d.editing_status !== 'cancelled');
      const todayVids = assigned.filter(d => todayEditedVideos.some(tv => tv.id === d.id));
      const pendingVids = assigned.filter(d => pendingDeliverables.some(pv => pv.id === d.id));
      const totalProgress = assigned.reduce((acc, d) => acc + (d.progress_percentage || 0), 0);
      const avgProgress = assigned.length > 0 ? Math.round(totalProgress / assigned.length) : 0;

      return {
        editorId: editor.id,
        editorName: editor.full_name || 'Editor',
        avatarUrl: editor.avatar_url,
        assignedTotal: assigned.length,
        todayVideos: todayVids,
        pendingVideos: pendingVids,
        avgProgress
      };
    });
  }, [editors, deliverables, todayEditedVideos, pendingDeliverables]);

  const getStatusBadge = (status: EditingStatus) => {
    switch (status) {
      case 'not_started':
        return { label: 'Not Started', bg: 'bg-zinc-800 text-zinc-300 border-zinc-700' };
      case 'assigned':
        return { label: 'Assigned', bg: 'bg-zinc-800 text-zinc-200 border-zinc-700' };
      case 'editing_in_progress':
        return { label: 'Editing In Progress', bg: 'bg-zinc-800 text-zinc-200 border-zinc-700' };
      case 'internal_review':
        return { label: 'In Review', bg: 'bg-zinc-800 text-zinc-200 border-zinc-700' };
      case 'submitted_for_approval':
        return { label: 'Awaiting Approval', bg: 'bg-zinc-800 text-white border-zinc-600' };
      case 'changes_requested':
        return { label: 'Changes Requested', bg: 'bg-zinc-800 text-zinc-300 border-zinc-700' };
      case 'approved':
        return { label: 'Approved & Live', bg: 'bg-white text-black border-white' };
      case 'blocked':
        return { label: 'Blocked', bg: 'bg-zinc-900 text-zinc-400 border-zinc-800' };
      default:
        return { label: status, bg: 'bg-zinc-800 text-zinc-300 border-zinc-700' };
    }
  };

  return (
    <div className="space-y-6 pb-24 text-zinc-100">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-[#18181B] text-white px-5 py-3 rounded-2xl border border-zinc-700 shadow-2xl flex items-center gap-3 text-xs font-bold animate-in fade-in slide-in-from-top-4 duration-200">
          <Sparkles className="w-4 h-4 text-white shrink-0" />
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

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {deliverables.length > 0 && (
            <button
              onClick={handleDeleteAllTasks}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#18181B] border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 transition shadow-sm"
              title="Delete all deliverables from board"
            >
              <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
              <span>Delete All Tasks</span>
            </button>
          )}

          <button
            onClick={() => { setRefreshing(true); fetchBoardData(); }}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#18181B] border border-zinc-800 text-zinc-200 hover:bg-zinc-800 hover:border-zinc-700 transition shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Board
          </button>
        </div>
      </div>

      {/* Executive Performance Summary Strip (Videos Edited Today & Pending Works) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* CARD 1: VIDEOS EDITED TODAY */}
        <div 
          onClick={() => {
            setEditorModalTab('today');
            setShowEditorModal(true);
          }}
          className="bg-[#121214] border border-[#27272A] p-4 rounded-2xl hover:border-zinc-500 hover:bg-zinc-900/60 transition-all cursor-pointer group shadow-sm"
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-white" />
              <span>Videos Edited Today</span>
            </div>
            <span className="text-[10px] font-bold text-zinc-400 group-hover:text-white flex items-center gap-1 transition-colors bg-zinc-800/80 px-2 py-0.5 rounded-full border border-zinc-700/60">
              Editor Overview ↗
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white tracking-tight">
              {todayEditedVideos.length}
            </span>
            <span className="text-xs font-semibold text-zinc-400">
              {todayEditedVideos.length === 1 ? 'video completed' : 'videos completed'}
            </span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1 flex items-center justify-between">
            <span>Reels &amp; full videos finished today</span>
            <span className="text-zinc-400 group-hover:text-white transition-colors">Click to view editor-wise</span>
          </div>
        </div>

        {/* CARD 2: PENDING WORKS */}
        <div 
          onClick={() => {
            setEditorModalTab('pending');
            setShowEditorModal(true);
          }}
          className="bg-[#121214] border border-[#27272A] p-4 rounded-2xl hover:border-zinc-500 hover:bg-zinc-900/60 transition-all cursor-pointer group shadow-sm"
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-zinc-300" />
              <span>Pending Works</span>
            </div>
            <span className="text-[10px] font-bold text-zinc-400 group-hover:text-white flex items-center gap-1 transition-colors bg-zinc-800/80 px-2 py-0.5 rounded-full border border-zinc-700/60">
              Editor Overview ↗
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white tracking-tight">
              {pendingDeliverables.length}
            </span>
            <span className="text-xs font-semibold text-zinc-400">
              {pendingDeliverables.length === 1 ? 'task in pipeline' : 'tasks in pipeline'}
            </span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1 flex items-center justify-between">
            <span>Assigned, in-progress &amp; revision tasks</span>
            <span className="text-zinc-400 group-hover:text-white transition-colors">Click to view editor-wise</span>
          </div>
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

                              {/* Live Link Button (provided by SMM) & Delete */}
                              <div className="flex items-center gap-2">
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

                                <button
                                  type="button"
                                  onClick={() => handleDeleteDeliverable(fullVideo.id, fullVideo.title)}
                                  className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition"
                                  title="Delete Master Cut"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
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
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusBadge.bg}`}>
                                      {statusBadge.label}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteDeliverable(reel.id, reel.title)}
                                      className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition"
                                      title="Delete Reel"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
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

      {/* EDITOR-WISE DETAILED OVERVIEW MODAL */}
      {showEditorModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setShowEditorModal(false)}
        >
          <div 
            className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-black/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <span>Editor-Wise Workload &amp; Output</span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Videos edited today vs pending works for each video editor.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowEditorModal(false)}
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Metrics & Filter Tabs */}
            <div className="px-5 py-3 border-b border-zinc-800/80 bg-zinc-950/60 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 p-1 bg-black border border-zinc-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setEditorModalTab('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    editorModalTab === 'all'
                      ? 'bg-white text-black shadow-sm font-black'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  All Statuses
                </button>
                <button
                  type="button"
                  onClick={() => setEditorModalTab('today')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    editorModalTab === 'today'
                      ? 'bg-white text-black shadow-sm font-black'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Edited Today ({todayEditedVideos.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditorModalTab('pending')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    editorModalTab === 'pending'
                      ? 'bg-white text-black shadow-sm font-black'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Pending Works ({pendingDeliverables.length})</span>
                </button>
              </div>

              <div className="text-[11px] text-zinc-400">
                <span className="font-bold text-white">{editors.length}</span> Registered {editors.length === 1 ? 'Editor' : 'Editors'}
              </div>
            </div>

            {/* Editor Cards List */}
            <div className="p-5 overflow-y-auto space-y-4">
              {editors.length === 0 ? (
                <div className="text-center py-10 text-zinc-500 text-xs">
                  No video editors registered in the system yet.
                </div>
              ) : (
                editorBreakdowns.map((item) => {
                  const showThisEditor =
                    editorModalTab === 'all' ||
                    (editorModalTab === 'today' && item.todayVideos.length > 0) ||
                    (editorModalTab === 'pending' && item.pendingVideos.length > 0);

                  if (!showThisEditor) return null;

                  return (
                    <div 
                      key={item.editorId}
                      className="bg-black/60 border border-zinc-800 rounded-2xl p-4 space-y-3 hover:border-zinc-700 transition"
                    >
                      {/* Editor Header */}
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 text-white font-black text-sm flex items-center justify-center">
                            {item.editorName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-black text-white flex items-center gap-2">
                              <span>{item.editorName}</span>
                              <span className="text-[10px] font-bold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-700">
                                🎬 Video Editor
                              </span>
                            </div>
                            <div className="text-[10px] text-zinc-500">
                              {item.assignedTotal} total assigned &bull; {item.avgProgress}% overall progress
                            </div>
                          </div>
                        </div>

                        {/* Badges */}
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-zinc-800 text-white border border-zinc-700">
                            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                            <span>{item.todayVideos.length} Edited Today</span>
                          </span>
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-zinc-900 text-zinc-300 border border-zinc-800">
                            <Clock className="w-3.5 h-3.5 text-zinc-400" />
                            <span>{item.pendingVideos.length} Pending</span>
                          </span>
                        </div>
                      </div>

                      {/* Content Sections */}
                      {(editorModalTab === 'all' || editorModalTab === 'today') && item.todayVideos.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-zinc-900">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-white" /> Videos Completed Today ({item.todayVideos.length})
                          </div>
                          <div className="space-y-1">
                            {item.todayVideos.map(vid => (
                              <div key={vid.id} className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between text-xs">
                                <div className="space-y-0.5 min-w-0 pr-2">
                                  <div className="font-bold text-white truncate flex items-center gap-2">
                                    <span>{vid.title}</span>
                                    <span className="text-[9px] font-semibold text-zinc-400 bg-black px-1.5 py-0.5 rounded border border-zinc-800 shrink-0">
                                      {vid.deliverable_type === 'full_length_video' ? 'Full 16:9' : 'Reel 9:16'}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-zinc-500 truncate">
                                    Shoot: {vid.recording_title || 'Podcast'}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[10px] font-black text-white bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-700">
                                    100% Done
                                  </span>
                                  {(vid.final_video_link || vid.preview_link) && (
                                    <a
                                      href={vid.final_video_link || vid.preview_link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-1 rounded bg-black hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition"
                                      title="Open Drive/Video Link"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {(editorModalTab === 'all' || editorModalTab === 'pending') && item.pendingVideos.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-zinc-900">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-zinc-400" /> Pending Works ({item.pendingVideos.length})
                          </div>
                          <div className="space-y-1">
                            {item.pendingVideos.map(vid => (
                              <div key={vid.id} className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between text-xs">
                                <div className="space-y-0.5 min-w-0 pr-2">
                                  <div className="font-bold text-white truncate flex items-center gap-2">
                                    <span>{vid.title}</span>
                                    <span className="text-[9px] font-semibold text-zinc-400 bg-black px-1.5 py-0.5 rounded border border-zinc-800 shrink-0">
                                      {vid.deliverable_type === 'full_length_video' ? 'Full 16:9' : 'Reel 9:16'}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-zinc-500 truncate flex items-center gap-2">
                                    <span>Shoot: {vid.recording_title || 'Podcast'}</span>
                                    {vid.deadline && (
                                      <span>&bull; Deadline: {vid.deadline}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <div className="text-right">
                                    <span className="text-[10px] font-bold text-zinc-300 block">
                                      {vid.progress_percentage || 0}% Done
                                    </span>
                                    <span className="text-[9px] text-zinc-500 uppercase font-semibold">
                                      {vid.editing_status.replace(/_/g, ' ')}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Empty state for this editor */}
                      {item.todayVideos.length === 0 && item.pendingVideos.length === 0 && (
                        <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-900 text-[11px] text-zinc-500 text-center">
                          ✨ All caught up — No active tasks currently assigned.
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* UNASSIGNED QUEUE (IF ANY DELIVERABLES ARE UNASSIGNED) */}
              {unassignedDeliverables.length > 0 && (
                <div className="bg-black/80 border border-zinc-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-zinc-200">
                        ⚠️ Unassigned Tasks Queue
                      </span>
                      <span className="text-[10px] font-bold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-700">
                        {unassignedDeliverables.length} Tasks
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-500">
                      Needs editor assignment
                    </span>
                  </div>
                  <div className="space-y-1">
                    {unassignedDeliverables.map(vid => (
                      <div key={vid.id} className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between text-xs">
                        <div className="space-y-0.5 min-w-0 pr-2">
                          <div className="font-bold text-white truncate">
                            {vid.title}
                          </div>
                          <div className="text-[10px] text-zinc-500 truncate">
                            Shoot: {vid.recording_title || 'Podcast'} &bull; {vid.deliverable_type === 'full_length_video' ? 'Full 16:9' : 'Reel 9:16'}
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-700 shrink-0">
                          Unassigned
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-zinc-800 bg-black/60 flex items-center justify-between text-xs text-zinc-400">
              <span>
                Total: <strong className="text-white">{todayEditedVideos.length}</strong> edited today &bull; <strong className="text-white">{pendingDeliverables.length}</strong> pending works
              </span>
              <button
                type="button"
                onClick={() => setShowEditorModal(false)}
                className="px-4 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-black font-bold transition shadow-sm text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
