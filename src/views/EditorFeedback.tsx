import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Deliverable } from '../types';
import { 
  MessageSquare, AlertCircle, RefreshCw, Send, CheckCircle2, 
  ExternalLink, Film, ArrowRight, HardDrive, Clock, Briefcase
} from 'lucide-react';
import { filterDeliverables } from '../lib/deletionFilter';

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
        setItems(filterDeliverables(mapped));
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
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-white" />
            Founder Feedback & Corrections
          </h1>
          <p className="text-xs text-zinc-400">
            Review notes from the founder on videos requiring corrections before final approval
          </p>
        </div>

        <button
          onClick={() => { setRefreshing(true); fetchFeedbackItems(); }}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-zinc-600 border-t-white rounded-full mx-auto" />
          <p className="mt-3 text-xs text-zinc-500">Checking for founder revisions...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center bg-zinc-900 rounded-3xl border border-dashed border-zinc-800 p-8">
          <CheckCircle2 className="w-10 h-10 text-white mx-auto mb-2" />
          <h3 className="text-sm font-bold text-white">No revisions requested!</h3>
          <p className="text-xs text-zinc-400 mt-1">
            All your submitted videos are either approved or in regular progress. Great job!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(item => {
            const isClientWork = /\[Client/i.test(`${item.approval_notes || ''} ${item.description || ''}`) ||
              /\[Brand/i.test(`${item.approval_notes || ''} ${item.description || ''}`) ||
              /Client/i.test(item.recording_title || '') ||
              /\([A-Z0-9_-]+\)/i.test(item.recording_title || '');

            return (
              <div
                key={item.id}
                className={`rounded-3xl p-5 transition-all ${
                  isClientWork
                    ? 'bg-zinc-950 border-2 border-white shadow-[0_0_20px_rgba(255,255,255,0.18)]'
                    : 'bg-zinc-900 border border-zinc-800 shadow-sm'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      {isClientWork && (
                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white text-black border border-white flex items-center gap-1 shadow-sm">
                          <Briefcase className="w-2.5 h-2.5 text-black" />
                          <span>CLIENT WORK</span>
                        </span>
                      )}
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-200">
                        Changes Requested
                      </span>
                      <span className="text-xs text-zinc-400">
                        {item.recording_title} {item.episode_number ? `(Ep #${item.episode_number})` : ''}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-white">
                      {item.title}
                    </h3>
                  </div>

                <div className="flex items-center gap-2 self-start">
                  <button
                    onClick={() => handleStartWork(item)}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-full text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                  >
                    Start Working
                  </button>

                  <button
                    onClick={() => {
                      setActiveItem(item);
                      setNewVideoLink(item.final_video_link || item.preview_link || '');
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-black bg-white hover:bg-zinc-200 text-black shadow-md transition-all active:scale-95"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Resubmit
                  </button>
                </div>
              </div>

              {/* Founder Note Callout */}
              <div className="mt-4 p-4 rounded-2xl bg-black/60 border border-zinc-800">
                <div className="text-xs font-bold text-white flex items-center gap-1.5 mb-1">
                  <AlertCircle className="w-4 h-4 text-zinc-300" />
                  Founder's Revision Notes:
                </div>
                <p className="text-xs text-zinc-300 whitespace-pre-wrap">
                  {item.approval_notes || 'Please review footage cuts, sound levels, and resubmit.'}
                </p>
              </div>

              {/* Details & Existing Links */}
              <div className="mt-4 pt-3 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{item.deadline ? `Due: ${new Date(item.deadline).toLocaleDateString()}` : 'No deadline'}</span>
                </div>

                {item.preview_link && (
                  <a
                    href={item.preview_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-bold text-zinc-300 hover:text-white"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Previous Link
                  </a>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Resubmit Modal */}
      {activeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="bg-zinc-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-zinc-800">
            <h3 className="text-base font-bold text-white mb-1">
              Resubmit for Founder Approval
            </h3>
            <p className="text-xs text-zinc-400 mb-4">
              Enter your updated preview or final render link for: <strong className="text-white">{activeItem.title}</strong>
            </p>

            <form onSubmit={handleResubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Updated Video URL (Google Drive / Frame.io / Dropbox)
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://drive.google.com/file/d/..."
                  value={newVideoLink}
                  onChange={(e) => setNewVideoLink(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-black border border-zinc-800 text-white focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveItem(null)}
                  className="px-4 py-2 rounded-full text-xs font-bold text-zinc-400 hover:bg-zinc-800"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-full text-xs font-black bg-white hover:bg-zinc-200 text-black shadow-md disabled:opacity-50 active:scale-95 transition-all"
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
