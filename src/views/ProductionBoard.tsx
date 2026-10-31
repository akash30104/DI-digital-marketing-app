import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Deliverable, DeliverableType, EditingStatus, Profile } from '../types';
import { 
  Filter, Search, Clock, Film, AlertCircle, CheckCircle2, 
  ExternalLink, User, Calendar, RefreshCw
} from 'lucide-react';

export const ProductionBoard: React.FC = () => {
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [editors, setEditors] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [editorFilter, setEditorFilter] = useState<string>('all');

  const fetchBoardData = async () => {
    try {
      const [delivRes, profilesRes] = await Promise.all([
        supabase
          .from('deliverables')
          .select(`
            *,
            recordings (title, episode_number),
            profiles:assigned_editor_id (full_name)
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('*')
          .eq('role', 'editor')
          .order('full_name')
      ]);

      if (delivRes.data) {
        const mapped: Deliverable[] = delivRes.data.map((d: any) => ({
          ...d,
          recording_title: d.recordings?.title,
          episode_number: d.recordings?.episode_number,
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

    const channel = supabase
      .channel('production-board-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliverables' }, () => {
        fetchBoardData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getStatusBadge = (status: EditingStatus) => {
    switch (status) {
      case 'not_started':
        return { label: 'Not Started', bg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' };
      case 'assigned':
        return { label: 'Assigned', bg: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' };
      case 'editing_in_progress':
        return { label: 'In Progress', bg: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' };
      case 'internal_review':
        return { label: 'Review', bg: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' };
      case 'submitted_for_approval':
        return { label: 'Awaiting Approval', bg: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300' };
      case 'changes_requested':
        return { label: 'Changes Requested', bg: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' };
      case 'approved':
        return { label: 'Approved', bg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' };
      case 'blocked':
        return { label: 'Blocked', bg: 'bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-300' };
      default:
        return { label: status, bg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' };
    }
  };

  const filteredDeliverables = deliverables.filter(item => {
    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchRec = item.recording_title?.toLowerCase().includes(q);
      const matchEp = item.episode_number?.toString().includes(q);
      const matchEd = item.editor_name?.toLowerCase().includes(q);
      if (!matchTitle && !matchRec && !matchEp && !matchEd) return false;
    }

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'active' && ['approved', 'cancelled'].includes(item.editing_status)) {
        return false;
      } else if (statusFilter === 'needs_attention' && !['changes_requested', 'blocked'].includes(item.editing_status)) {
        return false;
      } else if (statusFilter !== 'active' && statusFilter !== 'needs_attention' && item.editing_status !== statusFilter) {
        return false;
      }
    }

    // Type filter
    if (typeFilter !== 'all' && item.deliverable_type !== typeFilter) {
      return false;
    }

    // Editor filter
    if (editorFilter !== 'all' && item.assigned_editor_id !== editorFilter) {
      return false;
    }

    return true;
  });

  return (
    <div className="space-y-6 pb-20">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Film className="w-6 h-6 text-blue-600" />
            Production Board
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time tracking of all deliverables across every editing stage
          </p>
        </div>

        <button
          onClick={() => { setRefreshing(true); fetchBoardData(); }}
          className="self-start sm:self-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by deliverable title, episode, or editor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Status Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Statuses ({deliverables.length})</option>
            <option value="active">Active Pipeline</option>
            <option value="needs_attention">Needs Attention (Changes / Blocked)</option>
            <option value="not_started">Not Started</option>
            <option value="editing_in_progress">In Progress</option>
            <option value="submitted_for_approval">Awaiting Founder Approval</option>
            <option value="approved">Approved</option>
          </select>

          {/* Type Dropdown */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Formats</option>
            <option value="reel">Reels / Shorts (9:16)</option>
            <option value="full_length_video">Full-Length Episode (16:9)</option>
            <option value="other">Other Assets</option>
          </select>

          {/* Editor Dropdown */}
          <select
            value={editorFilter}
            onChange={(e) => setEditorFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Editors</option>
            {editors.map(ed => (
              <option key={ed.id} value={ed.id}>{ed.full_name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Deliverables List / Cards */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
          <p className="mt-3 text-xs text-slate-500">Loading production items...</p>
        </div>
      ) : filteredDeliverables.length === 0 ? (
        <div className="py-16 text-center bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8">
          <Film className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">No deliverables found</h3>
          <p className="text-xs text-slate-400 mt-1">Try resetting the filters or register new footage</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDeliverables.map((item) => {
            const statusInfo = getStatusBadge(item.editing_status);
            return (
              <div
                key={item.id}
                className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                      {item.deliverable_type === 'reel' ? 'Short / Reel (9:16)' : 'Full Video (16:9)'}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusInfo.bg}`}>
                      {statusInfo.label}
                    </span>
                  </div>

                  <h3 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-2">
                    {item.title}
                  </h3>

                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">
                      {item.recording_title || 'Recording'} {item.episode_number ? `(Ep #${item.episode_number})` : ''}
                    </span>
                  </div>

                  <div className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Editor: <strong>{item.editor_name}</strong></span>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-4">
                    <div className="flex justify-between text-[11px] font-bold text-slate-500 mb-1">
                      <span>Editing Progress</span>
                      <span>{item.progress_percentage}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full transition-all duration-300"
                        style={{ width: `${item.progress_percentage}%` }}
                      />
                    </div>
                  </div>

                  {item.approval_notes && (
                    <div className="mt-3 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/50 text-[11px] text-rose-700 dark:text-rose-300">
                      <div className="font-bold flex items-center gap-1 mb-0.5">
                        <AlertCircle className="w-3 h-3" />
                        Founder Note:
                      </div>
                      <p className="line-clamp-2">{item.approval_notes}</p>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                  <div className="text-[10px] text-slate-400">
                    {item.deadline ? `Due: ${new Date(item.deadline).toLocaleDateString()}` : 'No deadline'}
                  </div>

                  {item.preview_link && (
                    <a
                      href={item.preview_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Preview
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
