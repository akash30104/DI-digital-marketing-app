import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Deliverable } from '../types';
import { 
  MessageSquare, AlertCircle, RefreshCw, Send, CheckCircle2, 
  ExternalLink, Film, ArrowRight, HardDrive, Clock
} from 'lucide-react';

export const EditorFeedback: React.FC = () => {
  const { currentUser } = useAuth();
  const [items, setItems] = useState<Deliverable[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Resubmit modal state
  const [activeItem, setActiveItem] = useState<Deliverable | null>(null);
  const [newVideoLink, setNewVideoLink] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchFeedbackItems = async () => {
    if (!currentUser) return;
    try {
      const { data, error } = await supabase
        .from('deliverables')
        .select(`
          *,
          recordings (title, episode_number, hard_disk_name, folder_path)
        `)
        .eq('assigned_editor_id', currentUser.id)
        .in('editing_status', ['changes_requested', 'blocked'])
        .order('updated_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const mapped: Deliverable[] = data.map((d: any) => ({
          ...d,
          recording_title: d.recordings?.title,
          episode_number: d.recordings?.episode_number
        }));
        setItems(mapped);
      }
    } catch (err) {
      console.error('Failed to load feedback items:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchFeedbackItems();
  }, [currentUser]);

  const handleStartWork = async (item: Deliverable) => {
    try {
      const { error } = await supabase
        .from('deliverables')
        .update({
          editing_status: 'editing_in_progress',
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id);

      if (error) throw error;
      fetchFeedbackItems();
    } catch (err: any) {
      alert(`Error updating status: ${err.message}`);
    }
  };

  const handleResubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('deliverables')
        .update({
          editing_status: 'submitted_for_approval',
          final_video_link: newVideoLink || activeItem.final_video_link,
          progress_percentage: 100,
          updated_at: new Date().toISOString()
        })
        .eq('id', activeItem.id);

      if (error) throw error;
      setActiveItem(null);
      fetchFeedbackItems();
    } catch (err: any) {
      alert(`Error resubmitting: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-rose-500" />
            Founder Feedback & Corrections
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Review notes from the founder on videos requiring corrections before final approval
          </p>
        </div>

        <button
          onClick={() => { setRefreshing(true); fetchFeedbackItems(); }}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-rose-500 border-t-transparent rounded-full mx-auto" />
          <p className="mt-3 text-xs text-slate-500">Checking for founder revisions...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">No revisions requested!</h3>
          <p className="text-xs text-slate-400 mt-1">
            All your submitted videos are either approved or in regular progress. Great job!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(item => (
            <div
              key={item.id}
              className="bg-white dark:bg-slate-800 rounded-2xl border border-rose-200/80 dark:border-rose-900/60 p-5 shadow-sm"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
                      Changes Requested
                    </span>
                    <span className="text-xs text-slate-400">
                      {item.recording_title} {item.episode_number ? `(Ep #${item.episode_number})` : ''}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {item.title}
                  </h3>
                </div>

                <div className="flex items-center gap-2 self-start">
                  <button
                    onClick={() => handleStartWork(item)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors"
                  >
                    Start Working
                  </button>

                  <button
                    onClick={() => {
                      setActiveItem(item);
                      setNewVideoLink(item.final_video_link || item.preview_link || '');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-600/20 transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Resubmit
                  </button>
                </div>
              </div>

              {/* Founder Note Callout */}
              <div className="mt-4 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/60">
                <div className="text-xs font-bold text-rose-800 dark:text-rose-300 flex items-center gap-1.5 mb-1">
                  <AlertCircle className="w-4 h-4" />
                  Founder's Revision Notes:
                </div>
                <p className="text-xs text-rose-900 dark:text-rose-200 whitespace-pre-wrap">
                  {item.approval_notes || 'Please review footage cuts, sound levels, and resubmit.'}
                </p>
              </div>

              {/* Details & Existing Links */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{item.deadline ? `Due: ${new Date(item.deadline).toLocaleDateString()}` : 'No deadline'}</span>
                </div>

                {item.preview_link && (
                  <a
                    href={item.preview_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-bold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Previous Link
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Resubmit Modal */}
      {activeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
              Resubmit for Founder Approval
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Enter your updated preview or final render link for: <strong className="text-slate-700 dark:text-slate-200">{activeItem.title}</strong>
            </p>

            <form onSubmit={handleResubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Updated Video URL (Google Drive / Frame.io / Dropbox)
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://drive.google.com/file/d/..."
                  value={newVideoLink}
                  onChange={(e) => setNewVideoLink(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveItem(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submitting ? 'Submitting...' : 'Confirm Resubmission'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
