import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Deliverable, EditingStatus } from '../types';
import { StatusBadge } from '../components/StatComponents';
import { Sliders, HardDrive, Folder, AlertCircle, Send, Check } from 'lucide-react';

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
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadTasks = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('deliverables')
        .select('*, recordings(title, hard_disk_name, folder_path, episode_number)')
        .eq('assigned_editor_id', currentUser.id)
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
  }, [currentUser]);

  const openUpdateModal = (task: Deliverable) => {
    setEditingTask(task);
    setProgress(task.progress_percentage || 0);
    setStatus(task.editing_status);
    setPreviewLink(task.preview_link || '');
  };

  const handleSaveProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('deliverables')
        .update({
          progress_percentage: Number(progress),
          editing_status: status,
          preview_link: previewLink.trim() || null
        })
        .eq('id', editingTask.id);

      if (!error) {
        setTasks(prev => prev.map(t => t.id === editingTask.id ? {
          ...t,
          progress_percentage: Number(progress),
          editing_status: status,
          preview_link: previewLink.trim() || undefined
        } : t));

        showToast(status === 'submitted_for_approval' ? 'Submitted for Founder Approval! 🚀' : 'Progress saved.');
        setEditingTask(null);
      }
    } catch (e) {
      console.error('Failed to update progress:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          Editor Workspace
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          View assigned footage, update cut progress, and submit for founder review.
        </p>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Loading your tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
          <p className="font-bold text-slate-900 dark:text-white">No tasks assigned yet.</p>
          <p className="text-xs text-slate-400">
            When new raw footage is registered by your Social Media Manager, assigned deliverables will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <StatusBadge status={task.editing_status} />
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                  {task.progress_percentage}%
                </span>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-base">
                  {task.title}
                </h4>
                {task.recording_title && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Source: {task.recording_title}
                  </p>
                )}
                {task.hard_disk_name && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                    <span className="font-black text-blue-600 dark:text-blue-400">Shared via:</span>
                    <span className="font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300">
                      {task.hard_disk_name}
                    </span>
                    {task.folder_path && task.folder_path !== task.hard_disk_name && (
                      <span className="text-slate-400 font-medium">({task.folder_path})</span>
                    )}
                  </div>
                )}
              </div>

              {/* Founder Correction Notes Notice */}
              {task.editing_status === 'changes_requested' && task.approval_notes && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Founder Feedback:</span>
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

              {/* Update Button */}
              <button
                onClick={() => openUpdateModal(task)}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white text-xs font-bold transition-all shadow-sm shadow-blue-500/20"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Update Progress & Submit</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Update Progress Modal */}
      {editingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Update: {editingTask.title}
              </h3>
            </div>

            <form onSubmit={handleSaveProgress} className="p-4 space-y-4">
              {/* Progress Slider */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Completion Percentage
                  </label>
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                    {progress}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={progress}
                  onChange={(e) => setProgress(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>

              {/* Stage Picker */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Production Stage
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as EditingStatus)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="editing_in_progress">Editing in Progress</option>
                  <option value="internal_review">Internal Review</option>
                  <option value="submitted_for_approval">🚀 Submit for Founder Approval</option>
                </select>
              </div>

              {/* Preview Link */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Preview Video Link (Drive, Vimeo, Dropbox)
                </label>
                <input
                  type="url"
                  value={previewLink}
                  onChange={(e) => setPreviewLink(e.target.value)}
                  placeholder="https://drive.google.com/file/d/..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
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
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all"
                >
                  {isSaving ? 'Saving...' : status === 'submitted_for_approval' ? 'Submit for Founder Review' : 'Save Progress'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notice */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-blue-600 text-white text-xs font-bold shadow-lg animate-in slide-in-from-bottom duration-200">
          {toastMessage}
        </div>
      )}
    </div>
  );
};
