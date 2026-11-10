import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Deliverable, EditingStatus, Profile, Recording } from '../types';
import { 
  Film, Search, RefreshCw, User, CheckCircle2, Clock, 
  Play, Sparkles, X, Trash2, ChevronRight, ExternalLink, Plus, UserPlus
} from 'lucide-react';
import { 
  filterDeliverables, filterRecordings, 
  deleteSingleDeliverable, purgeAllDeliverables 
} from '../lib/deletionFilter';

interface ProductionBoardProps {
  onNavigateTab?: (tab: string) => void;
}

export const ProductionBoard: React.FC<ProductionBoardProps> = ({ onNavigateTab }) => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [editors, setEditors] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filter & Search
  const [activeTab, setActiveTab] = useState<'pending' | 'today' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');

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
      const [recsRes, delivRes, profilesRes] = await Promise.all([
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
          .from('profiles')
          .select('*')
          .eq('role', 'editor')
          .order('full_name')
      ]);

      if (recsRes.data) {
        setRecordings(filterRecordings(recsRes.data));
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
    showToast(`Task deleted successfully.`);
  };

  const handleDeleteAllTasks = async () => {
    if (deliverables.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ALL (${deliverables.length}) deliverables?`)) return;
    const ids = deliverables.map(d => d.id);
    setDeliverables([]);
    await purgeAllDeliverables(ids);
    showToast(`All deliverables deleted successfully.`);
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

    return () => {
      supabase.removeChannel(delivSub);
      supabase.removeChannel(recSub);
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

  // Today's date string in Asia/Kolkata
  const todayDateStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  }, []);

  // Videos edited or actively in progress today
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
      const isDoneOrActive = (d.progress_percentage || 0) > 0 || 
                             d.editing_status === 'approved' || 
                             d.editing_status === 'submitted_for_approval' ||
                             d.editing_status === 'editing_in_progress';
      return isToday && isDoneOrActive;
    });
  }, [deliverables, todayDateStr]);

  // Pending works (any task not yet 100% completed or approved)
  const pendingDeliverables = useMemo(() => {
    return deliverables.filter(d => {
      if (d.editing_status === 'cancelled') return false;
      const isCompleted = (d.progress_percentage || 0) === 100 || d.editing_status === 'approved';
      return !isCompleted;
    });
  }, [deliverables]);

  // Unassigned deliverables in pipeline
  const unassignedDeliverables = useMemo(() => {
    return deliverables.filter(d => !d.assigned_editor_id && d.editing_status !== 'cancelled');
  }, [deliverables]);

  // Detailed editor-wise breakdown for the modal
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

  // Filtered list based on active tab and search query
  const displayedVideos = useMemo(() => {
    let list: Deliverable[] = [];
    if (activeTab === 'today') {
      list = todayEditedVideos;
    } else if (activeTab === 'pending') {
      list = pendingDeliverables;
    } else {
      list = deliverables;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(d => 
        d.title.toLowerCase().includes(q) || 
        (d.editor_name || '').toLowerCase().includes(q) ||
        (d.recording_title || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [activeTab, todayEditedVideos, pendingDeliverables, deliverables, searchQuery]);

interface ProductionProjectGroup {
  projectId: string;
  projectTitle: string;
  editorName: string;
  reelsCount: number;
  fullVideosCount: number;
  avgProgress: number;
  videos: Deliverable[];
}

  // Group displayed videos by project/recording ("show inside project show all")
  const groupedProjectVideos = useMemo<ProductionProjectGroup[]>(() => {
    const map = new Map<string, {
      projectId: string;
      projectTitle: string;
      editorName: string;
      videos: Deliverable[];
    }>();

    displayedVideos.forEach((cut: Deliverable) => {
      const projKey = cut.recording_id || (cut.recording_title ? cut.recording_title.trim() : '') || (cut.title.includes(' - ') ? cut.title.split(' - ')[0].trim() : 'Studio Project');
      const projTitle = cut.recording_title || (cut.title.includes(' - ') ? cut.title.split(' - ')[0].trim() : cut.title);

      if (!map.has(projKey)) {
        map.set(projKey, {
          projectId: projKey,
          projectTitle: projTitle,
          editorName: cut.editor_name || 'Unassigned',
          videos: []
        });
      }
      map.get(projKey)!.videos.push(cut);
    });

    return Array.from(map.values()).map(g => {
      const reels = g.videos.filter((v: Deliverable) => v.deliverable_type === 'reel');
      const fulls = g.videos.filter((v: Deliverable) => v.deliverable_type === 'full_length_video');
      const totalProg = g.videos.reduce((acc: number, v: Deliverable) => acc + (v.progress_percentage || 0), 0);
      const avgProg = g.videos.length > 0 ? Math.round(totalProg / g.videos.length) : 0;
      const primaryEditor = g.videos.find((v: Deliverable) => v.editor_name && v.editor_name !== 'Unassigned')?.editor_name || g.editorName;

      return {
        ...g,
        editorName: primaryEditor,
        reelsCount: reels.length,
        fullVideosCount: fulls.length,
        avgProgress: avgProg
      };
    });
  }, [displayedVideos]);

  const getStatusBadge = (status: EditingStatus) => {
    switch (status) {
      case 'not_started':
        return { label: 'Not Started', bg: 'bg-zinc-800 text-zinc-300 border-zinc-700' };
      case 'assigned':
        return { label: 'Assigned', bg: 'bg-zinc-800 text-zinc-200 border-zinc-700' };
      case 'editing_in_progress':
        return { label: 'Editing In Progress', bg: 'bg-zinc-800 text-zinc-100 border-zinc-600' };
      case 'internal_review':
        return { label: 'In Review', bg: 'bg-zinc-800 text-zinc-200 border-zinc-700' };
      case 'submitted_for_approval':
        return { label: 'Awaiting Approval', bg: 'bg-zinc-700 text-white border-zinc-500' };
      case 'changes_requested':
        return { label: 'Changes Requested', bg: 'bg-zinc-800 text-zinc-300 border-zinc-700' };
      case 'approved':
        return { label: 'Approved & Done', bg: 'bg-white text-black border-white' };
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
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Film className="w-6 h-6 text-zinc-300" />
            <span>Production Board</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Monitor videos editing today, pending pipeline tasks, and editor progress.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('team')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-zinc-200 text-black shadow-sm transition active:scale-[0.99]"
              title="Invite a new Video Editor"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+ Invite Editor</span>
            </button>
          )}

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
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* The Two Main Focus Cards: VIDEOS EDITING TODAY & PENDING WORKS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* CARD 1: VIDEOS EDITING TODAY */}
        <div 
          onClick={() => setActiveTab('today')}
          className={`bg-[#121214] border p-4 rounded-2xl transition-all cursor-pointer group shadow-sm ${
            activeTab === 'today'
              ? 'border-white bg-zinc-900/80 ring-1 ring-white/20'
              : 'border-[#27272A] hover:border-zinc-600 hover:bg-zinc-900/50'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-white" />
              <span>Videos Editing Today</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditorModalTab('today');
                setShowEditorModal(true);
              }}
              className="text-[10px] font-bold text-zinc-300 group-hover:text-white flex items-center gap-1 transition-colors bg-zinc-800/90 px-2 py-0.5 rounded-full border border-zinc-700"
            >
              Editor Overview ↗
            </button>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white tracking-tight">
              {todayEditedVideos.length}
            </span>
            <span className="text-xs font-semibold text-zinc-400">
              {todayEditedVideos.length === 1 ? 'video active/done today' : 'videos active/done today'}
            </span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1 flex items-center justify-between">
            <span>Reels &amp; full videos worked on today</span>
            <span className="text-zinc-400 group-hover:text-white transition-colors">Tap to view</span>
          </div>
        </div>

        {/* CARD 2: PENDING WORKS */}
        <div 
          onClick={() => setActiveTab('pending')}
          className={`bg-[#121214] border p-4 rounded-2xl transition-all cursor-pointer group shadow-sm ${
            activeTab === 'pending'
              ? 'border-white bg-zinc-900/80 ring-1 ring-white/20'
              : 'border-[#27272A] hover:border-zinc-600 hover:bg-zinc-900/50'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-zinc-300" />
              <span>Pending Works</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditorModalTab('pending');
                setShowEditorModal(true);
              }}
              className="text-[10px] font-bold text-zinc-300 group-hover:text-white flex items-center gap-1 transition-colors bg-zinc-800/90 px-2 py-0.5 rounded-full border border-zinc-700"
            >
              Editor Overview ↗
            </button>
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
            <span className="text-zinc-400 group-hover:text-white transition-colors">Tap to view</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-[#121214] border border-[#27272A] rounded-xl self-start">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'pending'
                ? 'bg-white text-black font-black shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pending Works ({pendingDeliverables.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('today')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'today'
                ? 'bg-white text-black font-black shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Editing Today ({todayEditedVideos.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'all'
                ? 'bg-white text-black font-black shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <span>All Works ({deliverables.length})</span>
          </button>
        </div>

        {/* Clean Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search videos or editor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-black border border-[#27272A] text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition"
          />
        </div>
      </div>

      {/* Videos List with Prominent Progress Bars */}
      {loading ? (
        <div className="py-24 text-center">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-white rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-xs text-zinc-500">Loading videos &amp; progress...</p>
        </div>
      ) : displayedVideos.length === 0 ? (
        <div className="py-16 text-center bg-[#121214] rounded-2xl border border-dashed border-[#27272A] p-6 space-y-2">
          <Film className="w-8 h-8 text-zinc-600 mx-auto" />
          <h3 className="text-sm font-bold text-zinc-300">
            {activeTab === 'today'
              ? 'No videos edited or active today yet'
              : activeTab === 'pending'
              ? 'No pending works in the pipeline'
              : 'No video deliverables found'}
          </h3>
          <p className="text-xs text-zinc-500">
            {activeTab === 'today'
              ? 'When editors start editing tasks, their daily progress will appear here.'
              : 'Register new footage to assign video tasks to editors.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Exact Section Header requested: EDITING DELIVERABLES & REVIEW PROGRESS */}
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
              <span>Editing Deliverables &amp; Review Progress ({displayedVideos.length})</span>
            </div>
            <span className="text-[11px] text-zinc-500 font-normal">
              Showing {activeTab === 'today' ? 'today\'s active cuts' : activeTab === 'pending' ? 'pending pipeline' : 'all deliverables'}
            </span>
          </div>

          <div className="space-y-4">
            {groupedProjectVideos.map((project) => (
              <div
                key={project.projectId}
                className="p-5 rounded-3xl bg-[#121214] border border-[#27272A] shadow-sm space-y-4"
              >
                {/* Project Header Container */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                        🎬 Project
                      </span>
                      <span className="text-xs font-semibold text-zinc-400">
                        {project.videos.length} {project.videos.length === 1 ? 'Deliverable' : 'Deliverables'} ({project.reelsCount} {project.reelsCount === 1 ? 'Reel' : 'Reels'}{project.fullVideosCount > 0 ? ` • ${project.fullVideosCount} Full Video` : ''})
                      </span>
                    </div>
                    <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
                      {project.projectTitle}
                    </h3>
                    <div className="text-xs text-zinc-400">
                      Editor: <strong className="text-zinc-200">{project.editorName}</strong>
                    </div>
                  </div>

                  {/* Project Overall Progress Bar */}
                  <div className="bg-black/60 px-4 py-2 rounded-2xl border border-zinc-800 text-right min-w-[140px]">
                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                      Overall Progress
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
                </div>

                {/* Inside Project: Show All Reels & Video Cuts */}
                <div className="space-y-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Project Deliverables &amp; Reels ({project.videos.length})
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {project.videos.map((cut) => {
                      const progress = cut.progress_percentage || 0;
                      const isDone = progress === 100 || cut.editing_status === 'approved';

                      return (
                        <div
                          key={cut.id}
                          className="p-3.5 rounded-2xl bg-black/60 border border-zinc-800/90 space-y-2.5 hover:border-zinc-700 transition"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1 pr-1">
                              <div className="text-xs font-bold text-white flex items-center gap-2 flex-wrap">
                                <span className="truncate">{cut.title}</span>
                                <span className="text-[9px] font-bold bg-zinc-900 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-800 shrink-0">
                                  {cut.deliverable_type === 'full_length_video' ? 'Full 16:9' : 'Reel 9:16'}
                                </span>
                              </div>
                              <div className="text-[10px] text-zinc-500 mt-0.5 truncate">
                                Editor: <strong className="text-zinc-300">{cut.editor_name || project.editorName}</strong>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                                isDone
                                  ? 'bg-zinc-800 text-white border-zinc-700'
                                  : 'bg-zinc-900 text-zinc-300 border-zinc-800'
                              }`}>
                                {progress}% Done
                              </span>

                              <button
                                type="button"
                                onClick={() => handleDeleteDeliverable(cut.id, cut.title)}
                                className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition"
                                title="Delete Task"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-white h-full transition-all duration-300"
                              style={{ width: `${progress}%` }}
                            />
                          </div>

                          {/* Bottom Row: Status and actions */}
                          <div className="flex items-center justify-between pt-1 border-t border-zinc-900 text-[11px] gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="text-zinc-500 uppercase tracking-tight text-[10px] font-semibold">
                                STATUS: {cut.editing_status.toUpperCase().replace(/_/g, ' ')}
                              </span>
                              {cut.deadline && (
                                <span className="text-[10px] text-zinc-500">
                                  &bull; Due: {cut.deadline}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <select
                                value={cut.assigned_editor_id || ''}
                                onChange={(e) => handleAssignEditor(cut.id, e.target.value)}
                                className="text-[10px] font-bold rounded px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-300 focus:outline-none"
                              >
                                <option value="">{cut.assigned_editor_id ? 'Change' : '+ Assign'}</option>
                                {editors.map((ed) => (
                                  <option key={ed.id} value={ed.id}>{ed.full_name}</option>
                                ))}
                              </select>

                              {(cut.final_video_link || cut.preview_link) && (
                                <a
                                  href={cut.final_video_link || cut.preview_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-white hover:underline font-bold text-[11px]"
                                >
                                  <span>Watch</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
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
            <div className="p-4 border-t border-zinc-800 bg-black/60 flex items-center justify-between gap-3 text-xs text-zinc-400 flex-wrap">
              <span>
                Total: <strong className="text-white">{todayEditedVideos.length}</strong> edited today &bull; <strong className="text-white">{pendingDeliverables.length}</strong> pending works
              </span>
              <div className="flex items-center gap-2">
                {onNavigateTab && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditorModal(false);
                      onNavigateTab('team');
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold transition border border-zinc-700 text-xs flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Invite New Editor</span>
                  </button>
                )}
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
        </div>
      )}
    </div>
  );
};
