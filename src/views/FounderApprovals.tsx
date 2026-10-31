import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Deliverable } from '../types';
import { StatusBadge } from '../components/StatComponents';
import { CheckCircle2, RotateCcw, ExternalLink, Play, Check, X, ShieldAlert } from 'lucide-react';

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
        setDeliverables(mapped);
      }
    } catch (e) {
      console.error('Error loading approvals:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSubmissions();
  }, []);

  const handleApprove = async (item: Deliverable) => {
    if (!currentUser) return;
    try {
      const { error } = await supabase
        .from('deliverables')
        .update({
          editing_status: 'approved',
          approved_by: currentUser.id,
          approved_at: new Date().toISOString(),
          approval_notes: 'Approved by Founder'
        })
        .eq('id', item.id);

      if (!error) {
        setDeliverables(prev => prev.filter(d => d.id !== item.id));
        showToast(`"${item.title}" approved and ready to publish! 🎉`);
      }
    } catch (e) {
      console.error('Approval failed:', e);
    }
  };

  const handleRequestChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem || !changeNotes.trim()) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('deliverables')
        .update({
          editing_status: 'changes_requested',
          approval_notes: changeNotes.trim()
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
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Founder Approval Queue
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Review editor cuts before greenlighting publication.
          </p>
        </div>
        <button
          onClick={loadSubmissions}
          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
        >
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-slate-400 text-sm">
          Loading approval queue...
        </div>
      ) : deliverables.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <Check className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-900 dark:text-white">All Clear!</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            All submitted video cuts have been reviewed. New submissions from your video editors will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {deliverables.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400">
                    {item.deliverable_type === 'full_length_video' ? '📺 Full Episode' : '📱 Reel / Short'}
                  </span>
                  <StatusBadge status={item.editing_status} />
                </div>
                <span className="text-xs font-bold text-emerald-500">
                  {item.progress_percentage}% Done
                </span>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-base">
                  {item.title}
                </h4>
                {item.recording_title && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Footage: {item.recording_title} {item.episode_number ? `(Ep ${item.episode_number})` : ''}
                  </p>
                )}
                {item.editor_name && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    Editor: <span className="font-semibold text-slate-600 dark:text-slate-300">{item.editor_name}</span>
                  </p>
                )}
              </div>

              {/* Preview Link */}
              {item.preview_link && (
                <a
                  href={item.preview_link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Watch Video Preview</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-70 ml-1" />
                </a>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-700">
                <button
                  onClick={() => {
                    setActiveItem(item);
                    setChangeNotes('');
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Request Changes</span>
                </button>

                <button
                  onClick={() => handleApprove(item)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm shadow-emerald-500/20 active:scale-[0.98] transition-all"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Approve Video</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Changes Request Modal */}
      {activeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Request Changes: {activeItem.title}
              </h3>
              <button
                onClick={() => setActiveItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRequestChanges} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Specific Corrections & Timestamps
                </label>
                <textarea
                  required
                  rows={4}
                  value={changeNotes}
                  onChange={(e) => setChangeNotes(e.target.value)}
                  placeholder="e.g. Cut 01:23-01:45 out, adjust B-roll color grade, fix subtitle typo on 'artificial intelligence'..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveItem(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-all"
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
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-emerald-600 text-white text-xs font-bold shadow-lg animate-in slide-in-from-bottom duration-200">
          {toastMessage}
        </div>
      )}
    </div>
  );
};
