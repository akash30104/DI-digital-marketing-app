import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Deliverable } from '../types';
import { 
  CheckCircle2, RotateCcw, ExternalLink, Play, Check, X, ShieldCheck, RefreshCw 
} from 'lucide-react';
import { filterDeliverables } from '../lib/deletionFilter';

export const FounderApprovals: React.FC = () => {
  const { currentUser } = useAuth();
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Correction Request Modal
  const [activeItem, setActiveItem] = useState<Deliverable | null>(null);
  const [changeNotes, setChangeNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadSubmissions = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('deliverables')
        .select('*, recordings(title, episode_number), profiles:assigned_editor_id(full_name)')
        .eq('editing_status', 'submitted_for_approval')
        .order('created_at', { ascending: false });

      if (!error && data) {
        const mapped: Deliverable[] = data.map((d: any) => ({
          ...d,
          recording_title: d.recordings?.title,
          episode_number: d.recordings?.episode_number,
          editor_name: d.profiles?.full_name
        }));
        setDeliverables(filterDeliverables(mapped));
      }
    } catch (e) {
      console.error('Error loading approvals:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSubmissions();

    const channel = supabase
      .channel('founder-approvals-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliverables' }, () => {
        loadSubmissions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleApprove = async (item: Deliverable) => {
    if (!currentUser) return;
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('deliverables')
        .update({
          editing_status: 'approved',
          approved_by: currentUser.id,
          approved_at: now,
          approval_notes: `Approved by Founder (${currentUser.full_name || 'Founder'}) - Greenlit for Publication`,
          updated_at: now
        })
        .eq('id', item.id);

      if (!error) {
        setDeliverables(prev => prev.filter(d => d.id !== item.id));
        showToast(`"${item.title}" approved by Founder! 🎉`);
      }
    } catch (e) {
      console.error('Approval failed:', e);
    }
  };

  const handleRequestChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem || !changeNotes.trim() || !currentUser) return;

    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('deliverables')
        .update({
          editing_status: 'changes_requested',
          approval_notes: `[Founder Feedback]: ${changeNotes.trim()}`,
          updated_at: now
        })
        .eq('id', activeItem.id);

      if (!error) {
        setDeliverables(prev => prev.filter(d => d.id !== activeItem.id));
        showToast('Corrections sent back to editor.');
        setActiveItem(null);
        setChangeNotes('');
      }
    } catch (e) {
      console.error('Request changes failed:', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-white" />
            Founder Final Approval Queue
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Review video cuts approved and forwarded by your Social Media Manager before final distribution.
          </p>
        </div>
        <button
          onClick={loadSubmissions}
          disabled={isLoading}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-zinc-900 border border-zinc-700 text-zinc-200 hover:bg-zinc-800 transition-all shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="py-20 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-white border-t-transparent rounded-full mx-auto" />
          <p className="mt-3 text-xs text-zinc-400">Loading approval queue...</p>
        </div>
      ) : deliverables.length === 0 ? (
        <div className="py-16 text-center rounded-3xl bg-[#18181B] border border-zinc-800 p-8 space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-white/10 text-white flex items-center justify-center">
            <Check className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-white">All Clear!</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            All submitted video cuts have been reviewed. Cuts approved by your Social Media Manager will appear here for final greenlight.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {deliverables.map((item) => {
            const isApprovedBySMM = item.approval_notes?.includes('Approved by Social Media Manager');
            return (
              <div
                key={item.id}
                className="p-5 rounded-3xl bg-[#18181B] border border-zinc-800 shadow-xl space-y-4 hover:border-zinc-700 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300">
                      {item.deliverable_type === 'full_length_video' ? '📺 Full Episode' : '📱 Reel / Short'}
                    </span>
                    {isApprovedBySMM ? (
                      <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-white text-black">
                        ✓ Approved by Social Media Manager
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
                        Pending SMM Review
                      </span>
                    )}
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-white/10 text-white">
                      {item.progress_percentage}% Done
                    </span>
                  </div>

                  {item.preview_link && (
                    <a
                      href={item.preview_link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-bold transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Watch Cut</span>
                      <ExternalLink className="w-3 h-3 opacity-60 ml-0.5" />
                    </a>
                  )}
                </div>

                <div>
                  <h4 className="font-black text-white text-base tracking-tight">
                    {item.title}
                  </h4>
                  {item.recording_title && (
                    <p className="text-xs text-zinc-400 mt-1">
                      Footage: {item.recording_title} {item.episode_number ? `(Ep ${item.episode_number})` : ''}
                    </p>
                  )}
                  {item.editor_name && (
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Editor: <span className="font-semibold text-zinc-200">{item.editor_name}</span>
                    </p>
                  )}
                </div>

                {item.approval_notes && (
                  <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">
                    <span className="font-bold text-white">Manager Verification: </span>
                    {item.approval_notes}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center gap-3 pt-2 border-t border-zinc-800/80">
                  <button
                    onClick={() => {
                      setActiveItem(item);
                      setChangeNotes('');
                    }}
                    className="flex-1 py-2.5 px-4 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Request Changes</span>
                  </button>

                  <button
                    onClick={() => handleApprove(item)}
                    className="flex-1 py-2.5 px-4 rounded-full bg-white hover:bg-zinc-200 text-black text-xs font-black shadow-md active:scale-[0.98] transition-all text-center flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Final Approve Video</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Changes Request Modal */}
      {activeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md bg-[#18181B] rounded-3xl shadow-2xl border border-zinc-800 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-sm">
                Request Changes: {activeItem.title}
              </h3>
              <button
                onClick={() => setActiveItem(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRequestChanges} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Specific Corrections & Timestamps
                </label>
                <textarea
                  required
                  rows={4}
                  value={changeNotes}
                  onChange={(e) => setChangeNotes(e.target.value)}
                  placeholder="e.g. Cut 01:23-01:45 out, adjust B-roll color grade, fix subtitle typo on 'artificial intelligence'..."
                  className="w-full p-3.5 text-xs rounded-2xl border border-zinc-700 bg-zinc-900 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveItem(null)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold text-black bg-white hover:bg-zinc-200 rounded-full transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Sending...' : 'Send Correction Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Toast Notice */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full bg-zinc-900 text-white text-xs font-bold shadow-2xl border border-zinc-700 flex items-center gap-2 animate-in slide-in-from-bottom duration-200">
          <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
