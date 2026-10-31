import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Deliverable, EditingStatus } from '../types';
import { StatusBadge } from '../components/StatComponents';
import { 
  Sliders, HardDrive, Folder, AlertCircle, Send, Check, 
  CheckCircle2, PlaySquare, Tv, Clock, ExternalLink, Sparkles, 
  UserCheck, X, ChevronRight, ChevronLeft, ArrowRight, ListTodo, CheckSquare
} from 'lucide-react';

interface EditorWorkspaceProps {
  mode?: 'all' | 'my';
  onNavigateTab?: (tab: string) => void;
}

export const EditorWorkspace: React.FC<EditorWorkspaceProps> = ({ 
  mode = 'my', 
  onNavigateTab 
}) => {
  const { currentUser } = useAuth();
  const [tasks, setTasks] = useState<Deliverable[]>([]);
  const [allDeliverables, setAllDeliverables] = useState<Deliverable[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Active Task Editor Modal
  const [editingTask, setEditingTask] = useState<Deliverable | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<EditingStatus>('editing_in_progress');
  const [previewLink, setPreviewLink] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadTasks = async (showLoadingSpinner = false) => {
    if (!currentUser) return;
    if (showLoadingSpinner) {
      setIsLoading(true);
    }

    try {
      // 1. Fetch all deliverables for finding sibling reels and 'all' mode
      const { data, error } = await supabase
        .from('deliverables')
        .select(`
          *,
          recordings (title, hard_disk_name, folder_path, episode_number),
          profiles:assigned_editor_id (full_name)
        `)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const mapped: Deliverable[] = data.map((d: any) => ({
          ...d,
          recording_title: d.recordings?.title,
          episode_number: d.recordings?.episode_number,
          hard_disk_name: d.recordings?.hard_disk_name,
          folder_path: d.recordings?.folder_path,
          editor_name: d.profiles?.full_name || 'Unassigned'
        }));

        setAllDeliverables(mapped);

        if (mode === 'my') {
          // In "My Tasks": show ONLY active, in-progress tasks. Completed cuts disappear!
          const myFiltered = mapped.filter(d => 
            d.assigned_editor_id === currentUser.id &&
            d.editing_status !== 'submitted_for_approval' &&
            d.editing_status !== 'approved' &&
            (d.progress_percentage || 0) < 100
          );
          setTasks(myFiltered);
        } else {
          // In "Tasks": show ALL tasks
          setTasks(mapped);
        }
      }
    } catch (e) {
      console.error('Error loading editor tasks:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTasks(true);

    const channel = supabase
      .channel('editor-workspace-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliverables' }, () => {
        loadTasks(false);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser, mode]);

  // Find next reel in sequence (e.g. Reel #2 after Reel #1)
  const getSiblingReels = (task: Deliverable | null) => {
    if (!task) return [];
    const sourceList = allDeliverables.length > 0 ? allDeliverables : tasks;
    return sourceList
      .filter(t => t.recording_id && t.recording_id === task.recording_id)
      .sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true }));
  };

  const findNextReel = (currentTask: Deliverable): Deliverable | null => {
    const siblings = getSiblingReels(currentTask);
    const currentIndex = siblings.findIndex(t => t.id === currentTask.id);
    if (currentIndex !== -1 && currentIndex < siblings.length - 1) {
      return siblings[currentIndex + 1];
    }

    // Otherwise next unfinished task
    const sourceList = allDeliverables.length > 0 ? allDeliverables : tasks;
    return sourceList.find(t => 
      t.id !== currentTask.id && 
      t.editing_status !== 'approved' && 
      t.editing_status !== 'submitted_for_approval'
    ) || null;
  };

  const findPrevReel = (currentTask: Deliverable): Deliverable | null => {
    const siblings = getSiblingReels(currentTask);
    const currentIndex = siblings.findIndex(t => t.id === currentTask.id);
    if (currentIndex > 0) {
      return siblings[currentIndex - 1];
    }
    return null;
  };

  // Open modal on click
  const openUpdateModal = (task: Deliverable) => {
    setEditingTask(task);
    setProgress(task.progress_percentage || 0);
    setStatus(task.editing_status === 'assigned' || task.editing_status === 'not_started' 
      ? 'editing_in_progress' 
      : task.editing_status
    );
    setPreviewLink(task.preview_link || '');
  };

  // Accept Task Action (when SMM assigned it or in Tasks list)
  const handleAcceptTask = async (task: Deliverable, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!currentUser) return;
    setAcceptingId(task.id);

    const now = new Date().toISOString();
    const newProgress = Math.max(10, task.progress_percentage || 0);
    const updatedTask: Deliverable = {
      ...task,
      assigned_editor_id: currentUser.id,
      editor_name: currentUser.full_name,
      editing_status: 'editing_in_progress',
      progress_percentage: newProgress,
      updated_at: now
    };

    // 1. Immediately open modal so editor sees footage details & can edit right away
    openUpdateModal(updatedTask);
    showToast(`🎬 Accepted "${task.title}"! Editing marked In Progress.`);

    // 2. Optimistic update
    setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));

    // 3. Database update
    try {
      const { error } = await supabase
        .from('deliverables')
        .update({
          assigned_editor_id: currentUser.id,
          editing_status: 'editing_in_progress',
          progress_percentage: newProgress,
          updated_at: now
        })
        .eq('id', task.id);

      if (error) throw error;

      supabase.from('activity_logs').insert([{
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
      }]).then();

      loadTasks(false);
    } catch (err: any) {
      console.error('Failed to accept task:', err);
      showToast(err.message || 'Error claiming task');
    } finally {
      setAcceptingId(null);
    }
  };

  // Save Progress & optionally advance to next reel
  const handleSaveProgress = async (e: React.FormEvent, shouldAdvance = false) => {
    e.preventDefault();
    if (!editingTask || !currentUser) return;

    if (status === 'submitted_for_approval' && !previewLink.trim()) {
      showToast('Please provide a preview video link before submitting the cut.');
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

      supabase.from('activity_logs').insert([{
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
      }]).then();

      const isCompleted = status === 'submitted_for_approval' || finalProgress === 100;

      // Optimistically remove completed task from My Tasks immediately
      if (mode === 'my' && isCompleted) {
        setTasks(prev => prev.filter(t => t.id !== editingTask.id));
      }

      const nextReel = findNextReel(editingTask);

      if ((shouldAdvance || isCompleted) && nextReel) {
        // Automatically advance to the next reel
        if (nextReel.assigned_editor_id !== currentUser.id || nextReel.editing_status === 'not_started' || nextReel.editing_status === 'assigned') {
          await supabase
            .from('deliverables')
            .update({
              assigned_editor_id: currentUser.id,
              editing_status: 'editing_in_progress',
              progress_percentage: Math.max(10, nextReel.progress_percentage || 0),
              updated_at: now
            })
            .eq('id', nextReel.id);
        }

        const updatedNext: Deliverable = {
          ...nextReel,
          assigned_editor_id: currentUser.id,
          editing_status: 'editing_in_progress',
          progress_percentage: Math.max(10, nextReel.progress_percentage || 0)
        };

        if (mode === 'my') {
          setTasks(prev => {
            const filtered = prev.filter(t => t.id !== editingTask.id);
            return [updatedNext, ...filtered.filter(t => t.id !== updatedNext.id)];
          });
        }

        showToast(`🎉 "${editingTask.title}" completed! Advanced to "${nextReel.title}" 🎬`);
        openUpdateModal(updatedNext);
      } else {
        showToast(
          status === 'submitted_for_approval' || finalProgress === 100
            ? `🎉 Completed & submitted cut to Social Media Manager! 🚀`
            : `Saved progress: ${finalProgress}%!`
        );
        setEditingTask(null);
      }

      loadTasks(false);
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

  // Active sibling reels for sequence badge
  const siblingReels = editingTask ? getSiblingReels(editingTask) : [];
  const currentReelIndex = editingTask ? siblingReels.findIndex(t => t.id === editingTask.id) : -1;
  const nextReelItem = editingTask ? findNextReel(editingTask) : null;
  const prevReelItem = editingTask ? findPrevReel(editingTask) : null;

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {mode === 'my' ? (
              <span className="px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase tracking-wider">
                My Workspace
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400 text-[10px] font-black uppercase tracking-wider">
                Production Queue
              </span>
            )}
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
            {mode === 'my' ? 'My Tasks' : 'All Production Tasks'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {mode === 'my'
              ? 'Click on any task to open footage details, adjust progress percentage, and submit cuts.'
              : 'Browse all video deliverables & reels. Click "Accept Task" to claim and begin editing.'}
          </p>
        </div>

        {mode === 'all' && onNavigateTab && (
          <button
            onClick={() => onNavigateTab('my_tasks')}
            className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-blue-500/20 active:scale-95 transition-all"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>Go to My Tasks</span>
          </button>
        )}
      </div>

      {/* Task List */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3">
          <p className="font-bold text-slate-900 dark:text-white text-base">
            {mode === 'my' ? 'No pending tasks in My Tasks.' : 'No tasks in the queue.'}
          </p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {mode === 'my'
              ? 'All accepted cuts have been completed & submitted to your Social Media Manager! Check the Tasks tab to claim more work.'
              : 'When the Social Media Manager registers raw shoot footage, all reels and videos will appear here.'}
          </p>

          {mode === 'my' && onNavigateTab && (
            <button
              onClick={() => onNavigateTab('tasks')}
              className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-md shadow-blue-500/20 active:scale-95"
            >
              <ListTodo className="w-4 h-4" />
              <span>Browse All Tasks ➡️</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const isAssignedToMe = task.assigned_editor_id === currentUser?.id;
            const isAssignedPending = !task.assigned_editor_id || 
              task.editing_status === 'assigned' || 
              task.editing_status === 'not_started';
            const isReel = task.deliverable_type === 'reel';

            return (
              <div
                key={task.id}
                onClick={() => {
                  if (mode === 'my' || isAssignedToMe) {
                    openUpdateModal(task);
                  }
                }}
                className={`p-4 rounded-3xl bg-white dark:bg-slate-800/90 border border-slate-200/90 dark:border-slate-700/80 shadow-sm space-y-3 transition-all ${
                  mode === 'my' || isAssignedToMe
                    ? 'cursor-pointer hover:border-blue-500 hover:shadow-md active:scale-[0.99]'
                    : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      {isReel ? <PlaySquare className="w-3 h-3 text-pink-500" /> : <Tv className="w-3 h-3 text-blue-500" />}
                      <span>{isReel ? 'Short / Reel (9:16)' : 'Full Video (16:9)'}</span>
                    </span>
                    <StatusBadge status={task.editing_status} />
                  </div>

                  <div className="flex items-center gap-2">
                    {mode === 'my' && (
                      <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full">
                        Click to edit ↗
                      </span>
                    )}
                    <span className="text-xs font-black text-blue-600 dark:text-blue-400">
                      {task.progress_percentage}% Done
                    </span>
                  </div>
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

                  {/* Editor assignment badge in 'all' mode */}
                  {mode === 'all' && (
                    <div className="mt-2 text-[11px]">
                      {task.assigned_editor_id ? (
                        <span className="text-slate-500 font-medium">
                          Assigned to: <strong className="text-slate-800 dark:text-slate-200">{task.editor_name || 'Assigned'}</strong>
                          {isAssignedToMe && <span className="ml-1 text-emerald-600 font-bold">(You)</span>}
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full">
                          Open for any editor to accept
                        </span>
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

                {/* ACTION BUTTONS */}
                <div className="flex items-center gap-2 pt-1">
                  {isAssignedPending && !isAssignedToMe ? (
                    <button
                      onClick={(e) => handleAcceptTask(task, e)}
                      disabled={acceptingId === task.id}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-500/20 active:scale-95 disabled:opacity-50"
                    >
                      <UserCheck className="w-4 h-4" />
                      <span>{acceptingId === task.id ? 'Accepting...' : '✅ Accept Task & Start Editing'}</span>
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openUpdateModal(task);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white text-xs font-bold transition-all shadow-sm shadow-blue-500/20"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Update Cut Progress &amp; Submit</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* UPDATE PROGRESS MODAL (Matches user screenshot) */}
      {editingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span>ACTIVE EDITING CUT</span>
                    <span>🎬</span>
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    {editingTask.deliverable_type === 'reel' ? 'REEL CUT (9:16)' : 'FULL VIDEO (16:9)'}
                  </span>
                  {siblingReels.length > 1 && currentReelIndex !== -1 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      Reel {currentReelIndex + 1} of {siblingReels.length}
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base line-clamp-1">
                  {editingTask.title}
                </h3>
              </div>

              <div className="flex items-center gap-1">
                {prevReelItem && (
                  <button
                    type="button"
                    onClick={() => openUpdateModal(prevReelItem)}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    title={`Previous: ${prevReelItem.title}`}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                )}
                {nextReelItem && (
                  <button
                    type="button"
                    onClick={() => openUpdateModal(nextReelItem)}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    title={`Next: ${nextReelItem.title}`}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
                <button 
                  onClick={() => setEditingTask(null)} 
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ml-1"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto p-5 space-y-4">
              {/* Footage Access Details Banner */}
              {editingTask.hard_disk_name && (
                <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-xs space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
                    HOW FOOTAGE WAS SHARED:
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-600 text-white text-[11px]">
                      {editingTask.hard_disk_name}
                    </span>
                    {editingTask.folder_path && (
                      <span className="text-slate-600 dark:text-slate-300 font-medium text-xs">
                        {editingTask.folder_path}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <form id="editor-progress-form" onSubmit={(e) => handleSaveProgress(e, false)} className="space-y-4">
                {/* Completion Percentage */}
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
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
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
                    className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="editing_in_progress">Editing in Progress</option>
                    <option value="internal_review">Internal Rough Cut Review</option>
                    <option value="submitted_for_approval">🚀 Submit Completed Cut to Social Media Manager</option>
                  </select>
                </div>

                {/* Preview Video Cut Link */}
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
                    className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </form>
            </div>

            {/* Modal Footer with "Go to Next Reel" */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-xl"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2">
                {nextReelItem && (
                  <button
                    type="button"
                    onClick={(e) => handleSaveProgress(e, true)}
                    disabled={isSaving}
                    className="px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-xl transition-all shadow-md shadow-emerald-500/20 active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                    title={`Save current cut & start editing: ${nextReelItem.title}`}
                  >
                    <span>Save &amp; Next Reel ➡️</span>
                  </button>
                )}

                <button
                  type="submit"
                  form="editor-progress-form"
                  disabled={isSaving}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all shadow-md shadow-blue-500/20 active:scale-95 disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : status === 'submitted_for_approval' ? 'Submit Cut 🚀' : 'Save Progress'}
                </button>
              </div>
            </div>
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
