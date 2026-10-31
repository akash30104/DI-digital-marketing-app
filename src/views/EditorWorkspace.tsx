import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Deliverable, EditingStatus } from '../types';
import { StatusBadge } from '../components/StatComponents';
import { 
  Sliders, HardDrive, Folder, AlertCircle, Send, Check, 
  CheckCircle2, PlaySquare, Tv, Clock, ExternalLink, Sparkles, UserCheck
} from 'lucide-react';

export const EditorWorkspace: React.FC = () => {
  const { currentUser } = useAuth();
  const [tasks, setTasks] = useState<Deliverable[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Active Task Editor Modal
  const [editingTask, setEditingTask] = useState<Deliverable | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<EditingStatus>('editing_in_progress');
  const [previewLink, setPreviewLink] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadTasks = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      // Fetch deliverables assigned to this editor OR open unassigned deliverables
      const { data, error } = await supabase
        .from('deliverables')
        .select('*, recordings(title, hard_disk_name, folder_path, episode_number)')
        .or(`assigned_editor_id.eq.${currentUser.id},assigned_editor_id.is.null`)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const mapped: Deliverable[] = data.map((d: any) => ({
          ...d,
          recording_title: d.recordings?.title,
          episode_number: d.recordings?.episode_number,
          hard_disk_name: d.recordings?.hard_disk_name,
          folder_path: d.recordings?.folder_path,
        }));
        setTasks(mapped);
      }
    } catch (e) {
      console.error('Error loading editor tasks:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('editor-workspace-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliverables' }, () => {
        loadTasks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  // Accept Task Action (when SMM assigned it)
  const handleAcceptTask = async (task: Deliverable) => {
    if (!currentUser) return;
    setAcceptingId(task.id);

    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('deliverables')
        .update({
          assigned_editor_id: currentUser.id,
          editing_status: 'editing_in_progress',
          progress_percentage: Math.max(10, task.progress_percentage || 0),
          updated_at: now
        })
        .eq('id', task.id);

      if (error) throw error;

      // Log activity
      await supabase.from('activity_logs').insert([{
        user_id: currentUser.id,
        action: 'accepted_task',
        entity_type: 'deliverable',
        entity_id: task.id,
        old_status: task.editing_status,
        new_status: 'editing_in_progress',
        details: {
          task_title: task.title,
          editor_name: currentUser.full_name
        }
      }]);

      showToast(`Accepted "${task.title}"! Editing is now marked In Progress. 🎬`);
      loadTasks();
    } catch (e: any) {
      console.error('Failed to accept task:', e);
      showToast(e.message || 'Failed to accept task');
    } finally {
      setAcceptingId(null);
    }
  };

  const openUpdateModal = (task: Deliverable) => {
    setEditingTask(task);
    setProgress(task.progress_percentage || 0);
    setStatus(task.editing_status === 'assigned' ? 'editing_in_progress' : task.editing_status);
    setPreviewLink(task.preview_link || '');
  };

  const handleSaveProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !currentUser) return;

    if (status === 'submitted_for_approval' && !previewLink.trim()) {
      showToast('Please provide a preview link before submitting the cut for review.');
      return;
    }

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const finalProgress = status === 'submitted_for_approval' ? 100 : Number(progress);

      const { error } = await supabase
        .from('deliverables')
        .update({
          progress_percentage: finalProgress,
          editing_status: status,
          preview_link: previewLink.trim() || null,
          assigned_editor_id: currentUser.id,
          updated_at: now
        })
        .eq('id', editingTask.id);

      if (error) throw error;

      // Log activity
      await supabase.from('activity_logs').insert([{
        user_id: currentUser.id,
        action: status === 'submitted_for_approval' ? 'submitted_cut' : 'updated_progress',
        entity_type: 'deliverable',
        entity_id: editingTask.id,
        old_status: editingTask.editing_status,
        new_status: status,
        details: {
          task_title: editingTask.title,
          progress: finalProgress,
          preview_link: previewLink.trim(),
          editor_name: currentUser.full_name
        }
      }]);

      showToast(
        status === 'submitted_for_approval'
          ? `Submitted completed cut to Social Media Manager! 🚀`
          : `Progress updated to ${finalProgress}%!`
      );
      setEditingTask(null);
      loadTasks();
    } catch (e: any) {
      console.error('Failed to update progress:', e);
      showToast(e.message || 'Failed to save progress.');
    } finally {
      setIsSaving(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-16">
      <div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          Video Editor Workspace
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Accept tasks from your Social Media Manager, update reel progress, and submit finished cuts for review.
        </p>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Loading your tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
          <p className="font-bold text-slate-900 dark:text-white">No tasks assigned yet.</p>
          <p className="text-xs text-slate-400">
            When new raw footage is registered and assigned by your Social Media Manager, it will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const isAssignedPending = task.editing_status === 'assigned';
            const isReel = task.deliverable_type === 'reel';

            return (
              <div
                key={task.id}
                className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      {isReel ? <PlaySquare className="w-3 h-3 text-pink-500" /> : <Tv className="w-3 h-3 text-blue-500" />}
                      <span>{isReel ? 'Short / Reel (9:16)' : 'Full Video (16:9)'}</span>
                    </span>
                    <StatusBadge status={task.editing_status} />
                  </div>

                  <span className="text-xs font-black text-blue-600 dark:text-blue-400">
                    {task.progress_percentage}% Done
                  </span>
                </div>

                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-base">
                    {task.title}
                  </h4>
                  {task.recording_title && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Source Shoot: {task.recording_title}
                    </p>
                  )}

                  {/* Transfer info from SMM */}
                  {task.hard_disk_name && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                      <span className="font-black text-blue-600 dark:text-blue-400">Footage Shared via:</span>
                      <span className="font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300">
                        {task.hard_disk_name}
                      </span>
                      {task.folder_path && task.folder_path !== task.hard_disk_name && (
                        <span className="text-slate-400 font-medium">({task.folder_path})</span>
                      )}
                    </div>
                  )}
                </div>

                {/* SMM Revision / Changes Notice */}
                {task.editing_status === 'changes_requested' && task.approval_notes && (
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Social Media Manager Feedback:</span>
                      <p className="mt-0.5 leading-relaxed">{task.approval_notes}</p>
                    </div>
                  </div>
                )}

                {/* Progress Bar */}
                <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${task.progress_percentage}%` }}
                  />
                </div>

                {/* ACTION BUTTONS: ACCEPT TASK VS UPDATE PROGRESS */}
                <div className="flex items-center gap-2 pt-1">
                  {isAssignedPending ? (
                    <button
                      onClick={() => handleAcceptTask(task)}
                      disabled={acceptingId === task.id}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-500/20 active:scale-95 disabled:opacity-50"
                    >
                      <UserCheck className="w-4 h-4" />
                      <span>{acceptingId === task.id ? 'Accepting...' : '✅ Accept Task & Start Editing'}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => openUpdateModal(task)}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white text-xs font-bold transition-all shadow-sm shadow-blue-500/20"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Update Cut Progress & Submit</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* UPDATE PROGRESS MODAL */}
      {editingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  {editingTask.deliverable_type === 'reel' ? 'Reel Cut Progress' : 'Full Video Cut Progress'}
                </span>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm line-clamp-1">
                  {editingTask.title}
                </h3>
              </div>
              <button onClick={() => setEditingTask(null)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveProgress} className="p-5 space-y-4">
              {/* Progress Presets */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Completion Percentage:
                  </label>
                  <span className="text-sm font-black text-blue-600 dark:text-blue-400">
                    {progress}%
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2 mb-2">
                  {[25, 50, 75, 100].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => {
                        setProgress(val);
                        if (val === 100) setStatus('submitted_for_approval');
                      }}
                      className={`py-1.5 rounded-xl text-xs font-bold border transition-all ${
                        progress === val
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-100 dark:bg-slate-700/60 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-blue-400'
                      }`}
                    >
                      {val}% {val === 100 ? '🎉 Done' : ''}
                    </button>
                  ))}
                </div>

                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={progress}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setProgress(val);
                    if (val === 100) setStatus('submitted_for_approval');
                  }}
                  className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>

              {/* Production Stage */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Production Stage
                </label>
                <select
                  value={status}
                  onChange={(e) => {
                    const val = e.target.value as EditingStatus;
                    setStatus(val);
                    if (val === 'submitted_for_approval') setProgress(100);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="editing_in_progress">Editing in Progress</option>
                  <option value="internal_review">Internal Rough Cut Review</option>
                  <option value="submitted_for_approval">🚀 Submit Completed Cut to Social Media Manager</option>
                </select>
              </div>

              {/* Preview Link */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Preview Video Cut Link {status === 'submitted_for_approval' ? '(Required)' : '(Optional)'}</span>
                  <span className="text-[10px] text-blue-500 font-semibold">Google Drive / Frame.io</span>
                </label>
                <input
                  type="url"
                  required={status === 'submitted_for_approval'}
                  value={previewLink}
                  onChange={(e) => setPreviewLink(e.target.value)}
                  placeholder="https://drive.google.com/file/d/... or Frame.io cut"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all shadow-md shadow-blue-500/20 active:scale-95 disabled:opacity-50"
                >
                  {isSaving ? 'Updating...' : status === 'submitted_for_approval' ? 'Submit Cut for SMM Review 🚀' : 'Save Progress'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Toast Notice */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-bold shadow-xl border border-slate-700 flex items-center gap-2 animate-in slide-in-from-bottom duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
