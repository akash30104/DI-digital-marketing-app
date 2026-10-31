import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Deliverable } from '../types';
import { 
  CheckCheck, CheckCircle2, RotateCcw, AlertTriangle, 
  ExternalLink, Film, User, HardDrive, RefreshCw, MessageSquare
} from 'lucide-react';

export const ManagerApprovals: React.FC = () => {
  const { currentUser } = useAuth();
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [filterMode, setFilterMode] = useState<'pending' | 'approved' | 'changes'>('pending');
  const [isLoading, setIsLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Correction Modal State
  const [selectedItem, setSelectedItem] = useState<Deliverable | null>(null);
  const [revisionNotes, setRevisionNotes] = useState('');
  const [isSubmittingNotes, setIsSubmittingNotes] = useState(false);

  const fetchDeliverables = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('deliverables')
        .select(`
          *,
          recordings (title, episode_number, hard_disk_name, folder_path, source_footage_reference),
          profiles:assigned_editor_id (full_name)
        `)
        .order('updated_at', { ascending: false });

      if (filterMode === 'pending') {
        query = query.eq('editing_status', 'submitted_for_approval');
      } else if (filterMode === 'approved') {
        query = query.eq('editing_status', 'approved');
      } else if (filterMode === 'changes') {
        query = query.eq('editing_status', 'changes_requested');
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data) {
        const mapped: Deliverable[] = data.map((d: any) => ({
          ...d,
          recording_title: d.recordings?.title,
          episode_number: d.recordings?.episode_number,
          editor_name: d.profiles?.full_name || 'Assigned Editor'
        }));
        setDeliverables(mapped);
      }
    } catch (err) {
      console.error('Error fetching manager approvals:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliverables();
  }, [filterMode]);

  const handleApprove = async (item: Deliverable) => {
    if (!currentUser) return;
    setActionInProgress(item.id);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('deliverables')
        .update({
          editing_status: 'approved',
          approved_by: currentUser.id,
          approved_at: now,
          approval_notes: 'Approved by Social Media Manager',
          updated_at: now
        })
        .eq('id', item.id);

      if (error) throw error;
      fetchDeliverables();
    } catch (err: any) {
      alert(`Approval failed: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRequestChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !revisionNotes.trim()) return;
    setIsSubmittingNotes(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('deliverables')
        .update({
          editing_status: 'changes_requested',
          approval_notes: revisionNotes.trim(),
          updated_at: now
        })
        .eq('id', selectedItem.id);

      if (error) throw error;
      setSelectedItem(null);
      setRevisionNotes('');
      fetchDeliverables();
    } catch (err: any) {
      alert(`Failed to request changes: ${err.message}`);
    } finally {
      setIsSubmittingNotes(false);
    }
  };

  const handleMarkBlocked = async (item: Deliverable) => {
    const reason = prompt('Enter reason for blocking this deliverable:');
    if (!reason) return;
    setActionInProgress(item.id);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('deliverables')
        .update({
          editing_status: 'blocked',
          approval_notes: `Blocked by SMM: ${reason}`,
          updated_at: now
        })
        .eq('id', item.id);

      if (error) throw error;
      fetchDeliverables();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <CheckCheck className="w-6 h-6 text-purple-600" />
            Social Media Manager Approvals
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Review submitted editor cuts, approve videos for publishing, or request corrections directly
          </p>
        </div>

        <button
          onClick={fetchDeliverables}
          disabled={isLoading}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl max-w-md">
        <button
          onClick={() => setFilterMode('pending')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            filterMode === 'pending'
              ? 'bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-300 shadow-sm'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Pending Review
        </button>
        <button
          onClick={() => setFilterMode('approved')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            filterMode === 'approved'
              ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-300 shadow-sm'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Approved
        </button>
        <button
          onClick={() => setFilterMode('changes')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            filterMode === 'changes'
              ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-300 shadow-sm'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          In Revision
        </button>
      </div>

      {/* Deliverables List */}
      {isLoading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-xs text-slate-500">Loading videos for approval...</p>
        </div>
      ) : deliverables.length === 0 ? (
        <div className="py-16 text-center bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8">
          <CheckCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
            {filterMode === 'pending' ? 'No videos awaiting review' : 'No records found'}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {filterMode === 'pending'
              ? 'When video editors submit completed cuts, they will appear here for your approval.'
              : 'Use the tabs above to toggle between approval statuses.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {deliverables.map(item => (
            <div
              key={item.id}
              className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-5 shadow-sm"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                      {item.deliverable_type === 'reel' ? 'Reel / Short (9:16)' : 'Full Video (16:9)'}
                    </span>
                    <span className="text-xs text-slate-400">
                      {item.recording_title} {item.episode_number ? `(Ep #${item.episode_number})` : ''}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {item.title}
                  </h3>

                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Editor: <strong className="text-slate-700 dark:text-slate-300">{item.editor_name}</strong></span>
                  </div>
                </div>

                {/* Actions for Pending Deliverables */}
                {filterMode === 'pending' && (
                  <div className="flex items-center gap-2 self-start flex-wrap">
                    <button
                      onClick={() => handleApprove(item)}
                      disabled={actionInProgress === item.id}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20 transition-all disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve Video
                    </button>

                    <button
                      onClick={() => {
                        setSelectedItem(item);
                        setRevisionNotes(item.approval_notes || '');
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950 dark:hover:bg-rose-900 text-rose-600 dark:text-rose-400 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Request Changes
                    </button>

                    <button
                      onClick={() => handleMarkBlocked(item)}
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Block
                    </button>
                  </div>
                )}
              </div>

              {/* Notes Callout if changes were requested */}
              {item.approval_notes && (
                <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 text-xs">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Notes: </span>
                  <span className="text-slate-600 dark:text-slate-400">{item.approval_notes}</span>
                </div>
              )}

              {/* Preview Link & Footage Info */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs">
                <div className="text-[11px] text-slate-400">
                  {item.deadline ? `Due: ${new Date(item.deadline).toLocaleDateString()}` : 'No deadline'}
                </div>

                {item.preview_link ? (
                  <a
                    href={item.preview_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-bold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Watch Submitted Cut
                  </a>
                ) : (
                  <span className="text-slate-400 text-[11px]">No preview link attached</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Revision Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
              Request Corrections from Editor
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Enter specific revision notes for: <strong className="text-slate-800 dark:text-slate-200">{selectedItem.title}</strong>
            </p>

            <form onSubmit={handleRequestChanges} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Revision Notes (What needs to be corrected?)
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="e.g., Please trim the intro hook by 2 seconds, raise speech audio by 3dB, and add dynamic captions."
                  value={revisionNotes}
                  onChange={(e) => setRevisionNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmittingNotes}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20 disabled:opacity-50"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  {isSubmittingNotes ? 'Sending...' : 'Send Revision Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
