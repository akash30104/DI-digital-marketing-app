import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Deliverable } from '../types';
import { 
  CheckCheck, CheckCircle2, RotateCcw, 
  ExternalLink, Film, RefreshCw, Send, X, Clock 
} from 'lucide-react';
import { filterDeliverables } from '../lib/deletionFilter';

export const ManagerApprovals: React.FC = () => {
  const { currentUser } = useAuth();
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [filterMode, setFilterMode] = useState<'approval' | 'feedback'>('approval');
  const [isLoading, setIsLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Revision / Feedback Modal State
  const [selectedItem, setSelectedItem] = useState<Deliverable | null>(null);
  const [revisionNotes, setRevisionNotes] = useState('');
  const [isSubmittingNotes, setIsSubmittingNotes] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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

      if (filterMode === 'approval') {
        // Show cuts submitted by editors awaiting Social Media Manager approval
        query = query.eq('editing_status', 'submitted_for_approval');
      } else {
        // Show cuts where revisions/feedback were requested from the editor
        query = query.eq('editing_status', 'changes_requested');
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data) {
        const mapped: Deliverable[] = data.map((d: any) => ({
          ...d,
          recording_title: d.recordings?.title,
          episode_number: d.recordings?.episode_number,
          hard_disk_name: d.recordings?.hard_disk_name,
          editor_name: d.profiles?.full_name || 'Assigned Editor'
        }));

        const cleanMapped = filterDeliverables(mapped);
        if (filterMode === 'approval') {
          // Keep only cuts awaiting SMM review (not yet sent to Founder)
          setDeliverables(cleanMapped.filter(d => 
            !d.approval_notes || !d.approval_notes.includes('Sent to Founder for Final Approval')
          ));
        } else {
          setDeliverables(cleanMapped);
        }
      }
    } catch (err) {
      console.error('Error fetching manager approvals:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliverables();

    const channel = supabase
      .channel('manager-approvals-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliverables' }, () => {
        fetchDeliverables();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filterMode]);

  // Social Media Manager Approves cut and forwards directly to Founder
  const handleApproveAndSendToFounder = async (item: Deliverable) => {
    if (!currentUser) return;
    setActionInProgress(item.id);
    try {
      const now = new Date().toISOString();
      const managerName = currentUser.full_name || 'Social Media Manager';
      
      const { error } = await supabase
        .from('deliverables')
        .update({
          approval_notes: `Approved by Social Media Manager (${managerName}) - Sent to Founder for Final Approval`,
          approved_by: currentUser.id,
          approved_at: now,
          updated_at: now
        })
        .eq('id', item.id);

      if (error) throw error;

      // Optimistically remove from SMM Approval queue
      setDeliverables(prev => prev.filter(d => d.id !== item.id));
      showToast(`🚀 Approved "${item.title}" & sent to Founder!`);
    } catch (err: any) {
      console.error('Approval failed:', err);
      showToast(`Approval failed: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  // Social Media Manager requests changes / gives feedback
  const handleRequestChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !revisionNotes.trim() || !currentUser) return;
    setIsSubmittingNotes(true);
    try {
      const now = new Date().toISOString();
      const managerName = currentUser.full_name || 'Social Media Manager';
      const formattedNotes = `[Feedback from ${managerName}]: ${revisionNotes.trim()}`;

      const { error } = await supabase
        .from('deliverables')
        .update({
          editing_status: 'changes_requested',
          approval_notes: formattedNotes,
          updated_at: now
        })
        .eq('id', selectedItem.id);

      if (error) throw error;

      showToast(`✍️ Feedback sent to ${selectedItem.editor_name || 'Editor'}!`);
      setSelectedItem(null);
      setRevisionNotes('');
      fetchDeliverables();
    } catch (err: any) {
      showToast(`Failed to send feedback: ${err.message}`);
    } finally {
      setIsSubmittingNotes(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <CheckCheck className="w-6 h-6 text-white" />
            Social Media Manager Approvals
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Review completed editor cuts, provide feedback, or approve cuts to forward directly to Founder.
          </p>
        </div>

        <button
          onClick={fetchDeliverables}
          disabled={isLoading}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-zinc-900 border border-zinc-700 text-zinc-200 hover:bg-zinc-800 transition-all shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Tabs: Only Approval and Feedback */}
      <div className="flex bg-zinc-900/90 border border-zinc-800 p-1.5 rounded-full max-w-sm">
        <button
          onClick={() => setFilterMode('approval')}
          className={`flex-1 py-2 text-xs font-bold rounded-full transition-all ${
            filterMode === 'approval'
              ? 'bg-white text-black shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Approval {filterMode === 'approval' && !isLoading ? `(${deliverables.length})` : ''}
        </button>
        <button
          onClick={() => setFilterMode('feedback')}
          className={`flex-1 py-2 text-xs font-bold rounded-full transition-all ${
            filterMode === 'feedback'
              ? 'bg-white text-black shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Feedback {filterMode === 'feedback' && !isLoading ? `(${deliverables.length})` : ''}
        </button>
      </div>

      {/* Deliverables List */}
      {isLoading ? (
        <div className="py-20 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-white border-t-transparent rounded-full mx-auto" />
          <p className="mt-3 text-xs text-zinc-400">Loading cuts for review...</p>
        </div>
      ) : deliverables.length === 0 ? (
        <div className="py-16 text-center bg-[#18181B] rounded-3xl border border-zinc-800 p-8 space-y-2">
          <Film className="w-10 h-10 text-zinc-500 mx-auto" />
          <h3 className="text-sm font-bold text-white">
            {filterMode === 'approval'
              ? 'No pending cuts waiting for approval'
              : 'No items currently in feedback / revision'}
          </h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            {filterMode === 'approval'
              ? 'When your editor completes a cut and submits it, it appears here for your review before forwarding to the Founder.'
              : 'Cuts returned to editors with your feedback notes will be tracked here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {deliverables.map((item) => (
            <div
              key={item.id}
              className="bg-[#18181B] rounded-3xl border border-zinc-800/80 p-5 shadow-xl hover:border-zinc-700 transition-all space-y-4"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300">
                      {item.deliverable_type === 'reel' ? '📱 Short / Reel (9:16)' : '📺 Full Episode (16:9)'}
                    </span>
                    <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-200">
                      Editor: {item.editor_name}
                    </span>
                    {item.hard_disk_name && (
                      <span className="text-[10px] font-medium text-zinc-400">
                        Via: {item.hard_disk_name}
                      </span>
                    )}
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-white/10 text-white">
                      100% Done
                    </span>
                  </div>

                  <h3 className="font-bold text-base text-white tracking-tight">
                    {item.title}
                  </h3>

                  {item.recording_title && (
                    <p className="text-xs text-zinc-400">
                      Source Shoot: {item.recording_title}
                    </p>
                  )}
                </div>

                {/* SMM Actions */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Watch Cut Link */}
                  {item.preview_link && (
                    <a
                      href={item.preview_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Watch Cut</span>
                    </a>
                  )}

                  {/* Primary Action in Approval Tab: Approve & Send to Founder */}
                  {filterMode === 'approval' && (
                    <>
                      <button
                        onClick={() => handleApproveAndSendToFounder(item)}
                        disabled={actionInProgress === item.id}
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-xs font-black bg-white hover:bg-zinc-200 text-black shadow-md active:scale-95 transition-all disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{actionInProgress === item.id ? 'Sending...' : 'Approve & Send to Founder 🚀'}</span>
                      </button>

                      <button
                        onClick={() => {
                          setSelectedItem(item);
                          setRevisionNotes(item.approval_notes?.replace(/\[Feedback from.*?\]:\s*/, '') || '');
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Request Revision</span>
                      </button>
                    </>
                  )}

                  {/* In Feedback Tab: Show status or allow updating feedback */}
                  {filterMode === 'feedback' && (
                    <button
                      onClick={() => {
                        setSelectedItem(item);
                        setRevisionNotes(item.approval_notes?.replace(/\[Feedback from.*?\]:\s*/, '') || '');
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Update Feedback</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Feedback Callout */}
              {item.approval_notes && (
                <div className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-xs">
                  <span className="font-bold text-zinc-300">Manager Feedback: </span>
                  <span className="text-zinc-400">{item.approval_notes}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* FEEDBACK / REVISION MODAL */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-[#18181B] rounded-3xl max-w-md w-full p-6 shadow-2xl border border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold text-white">
                Send Feedback to Editor
              </h3>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-zinc-400 mb-4">
              Enter specific revision notes for: <strong className="text-white">{selectedItem.title}</strong>
            </p>

            <form onSubmit={handleRequestChanges} className="space-y-4">
              <textarea
                required
                rows={4}
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                placeholder="e.g. Cut 0:15–0:22 hook needs faster pacing, sound effects volume down by 3dB..."
                className="w-full p-3.5 rounded-2xl border border-zinc-700 bg-zinc-900 text-xs text-white placeholder-zinc-500 focus:ring-1 focus:ring-white focus:outline-none"
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNotes}
                  className="px-5 py-2 text-xs font-bold text-black bg-white hover:bg-zinc-200 rounded-full shadow-sm transition-all disabled:opacity-50"
                >
                  {isSubmittingNotes ? 'Sending...' : 'Send Feedback 🚀'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notice */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full bg-zinc-900 text-white text-xs font-bold shadow-2xl border border-zinc-700 flex items-center gap-2 animate-in slide-in-from-bottom duration-200">
          <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
