import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Deliverable, Profile } from '../types';
import { 
  Share2, Plus, HardDrive, Smartphone, Cloud, Usb, 
  Folder, Check, AlertCircle, X, Film, CheckCircle2, 
  Clock, ArrowRight, Sparkles, Layers, ExternalLink, User, Trash2
} from 'lucide-react';
import { filterDeliverables, filterRecordings, purgeAllRecordings } from '../lib/deletionFilter';

interface RecordingWithDeliverables {
  id: string;
  title: string;
  episode_number?: number;
  recording_date: string;
  hard_disk_name: string; // Used to store sharing method (AirDrop, Hard Disk, etc.)
  folder_path: string;    // Used to store location / details
  notes?: string;
  created_at: string;
  deliverables?: {
    id: string;
    title: string;
    deliverable_type: string;
    editing_status: string;
    progress_percentage: number;
    assigned_editor_id?: string;
    deadline?: string;
  }[];
}

export const RecordingRegistration: React.FC = () => {
  const { currentUser } = useAuth();
  const [recordings, setRecordings] = useState<RecordingWithDeliverables[]>([]);
  const [editors, setEditors] = useState<Profile[]>([]);
  const [selectedEditorId, setSelectedEditorId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [reelsCount, setReelsCount] = useState(3);
  const [includeFullVideo, setIncludeFullVideo] = useState(true);
  const [deadline, setDeadline] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  const loadRecordings = async () => {
    setIsLoading(true);
    try {
      const [recRes, editorsRes] = await Promise.all([
        supabase
          .from('recordings')
          .select(`
            *,
            deliverables (id, title, deliverable_type, editing_status, progress_percentage, assigned_editor_id)
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('*')
          .eq('role', 'editor')
          .order('full_name')
      ]);

      if (!recRes.error && recRes.data) {
        const cleanRecs = filterRecordings(recRes.data as RecordingWithDeliverables[]);
        const mapped: RecordingWithDeliverables[] = cleanRecs.map(r => ({
          ...r,
          deliverables: filterDeliverables(r.deliverables || [])
        }));
        setRecordings(mapped);
      }

      if (!editorsRes.error && editorsRes.data) {
        setEditors(editorsRes.data as Profile[]);
      }
    } catch (e) {
      console.error('Failed to load recordings:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteRecording = async (recId: string, recTitle: string) => {
    if (!window.confirm(`Delete podcast shoot "${recTitle}" and all its deliverables?`)) return;
    setRecordings(prev => prev.filter(r => r.id !== recId));
    await purgeAllRecordings([recId]);
    showToast('success', 'Podcast shoot deleted successfully.');
  };

  useEffect(() => {
    loadRecordings();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('recordings-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recordings' }, () => loadRecordings())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliverables' }, () => loadRecordings())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const openShareModal = () => {
    setTitle('');
    setSelectedEditorId(editors[0]?.id || '');
    setReelsCount(3);
    setIncludeFullVideo(true);
    setIsModalOpen(true);
  };

  const handleShareToEditor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast('error', 'Please enter a footage title or topic.');
      return;
    }

    setIsSubmitting(true);

    try {
      const finalMethod = 'Studio Footage';
      const finalLocation = '/footage';
      const finalDeadline = deadline.trim() || todayStr;

      // 1. Insert Recording
      const { data: recData, error: recError } = await supabase
        .from('recordings')
        .insert([
          {
            title: title.trim(),
            recording_date: todayStr,
            date_received: todayStr,
            hard_disk_name: finalMethod,
            folder_path: finalLocation,
            notes: `[Deadline: ${finalDeadline}]`,
            registered_by: currentUser?.id
          }
        ])
        .select()
        .single();

      if (recError || !recData) {
        throw new Error(recError?.message || 'Failed to save recording');
      }

      // 2. Generate Deliverables for the Editor
      const deliverablesToInsert = [];
      for (let i = 1; i <= Math.max(0, reelsCount); i++) {
        deliverablesToInsert.push({
          recording_id: recData.id,
          title: `${title.trim()} - Reel #${i}`,
          deliverable_type: 'reel',
          assigned_editor_id: selectedEditorId || null,
          editing_status: 'assigned',
          priority: 'medium',
          deadline: finalDeadline,
          progress_percentage: 0
        });
      }

      if (includeFullVideo) {
        deliverablesToInsert.push({
          recording_id: recData.id,
          title: `${title.trim()} - Full Episode Video`,
          deliverable_type: 'full_length_video',
          assigned_editor_id: selectedEditorId || null,
          editing_status: 'assigned',
          priority: 'high',
          deadline: finalDeadline,
          progress_percentage: 0
        });
      }

      if (deliverablesToInsert.length > 0) {
        const { error: delError } = await supabase
          .from('deliverables')
          .insert(deliverablesToInsert);

        if (delError) {
          console.warn('Deliverables insertion note:', delError);
        }
      }

      const assignedEditor = editors.find(ed => ed.id === selectedEditorId);
      const editorNotice = assignedEditor ? ` assigned to ${assignedEditor.full_name}` : '';
      showToast('success', `Footage created! ${deliverablesToInsert.length} editing tasks${editorNotice}. 🚀`);
      setIsModalOpen(false);
      loadRecordings();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to share footage.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const showToast = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const getSharingBadge = (method: string) => {
    const lower = method.toLowerCase();
    let icon = <Folder className="w-3 h-3 text-zinc-300" />;
    if (lower.includes('airdrop')) {
      icon = <Smartphone className="w-3 h-3 text-zinc-300" />;
    } else if (lower.includes('hard') || lower.includes('disk') || lower.includes('ssd') || lower.includes('drive')) {
      icon = <HardDrive className="w-3 h-3 text-zinc-300" />;
    } else if (lower.includes('cloud') || lower.includes('google') || lower.includes('link')) {
      icon = <Cloud className="w-3 h-3 text-zinc-300" />;
    } else if (lower.includes('usb') || lower.includes('pen')) {
      icon = <Usb className="w-3 h-3 text-zinc-300" />;
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 border border-zinc-700 text-zinc-200">
        {icon}
        <span>{method}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-16">
      {/* Top Header & One Simple CTA Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">
            Footage Sharing Hub
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Share raw video files to your video editor (AirDrop, Hard Disk, Drive) and generate cuts.
          </p>
        </div>

        {/* ONE CTA BUTTON TO SHARE FOOTAGE */}
        <button
          onClick={openShareModal}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white hover:bg-zinc-200 text-black text-xs font-black shadow-md active:scale-95 transition-all self-start sm:self-auto"
        >
          <Share2 className="w-4 h-4" />
          <span>Share Footage to Editor</span>
        </button>
      </div>

      {/* Floating Status Notification */}
      {statusMessage && (
        <div className="p-4 rounded-2xl flex items-center justify-between gap-3 text-xs shadow-md bg-zinc-800 border border-zinc-700 text-white animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-white shrink-0" /> : <AlertCircle className="w-4 h-4 text-zinc-400 shrink-0" />}
            <span className="font-bold">{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="p-1 text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* QUICK SUMMARY BANNER */}
      <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-zinc-800 border border-zinc-700 text-white flex items-center justify-center shrink-0">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-white text-xs">
              Footage Transferred to Editors
            </h4>
            <p className="text-[11px] text-zinc-400">
              {recordings.length} Raw {recordings.length === 1 ? 'Shoot' : 'Shoots'} registered across AirDrop, Hard Disks, and Cloud.
            </p>
          </div>
        </div>

        <button
          onClick={openShareModal}
          className="text-xs font-bold text-white hover:underline flex items-center gap-1 self-start sm:self-auto"
        >
          <span>+ New Share</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* LIST OF FOOTAGE SHARED TO EDITORS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Shared Footage History ({recordings.length})
          </h3>
          <span className="text-[11px] text-zinc-500">
            Real-time delivery & task status
          </span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-zinc-500 text-xs">Loading shared footage...</div>
        ) : recordings.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
            <Share2 className="w-10 h-10 text-zinc-600 mx-auto" />
            <div>
              <p className="font-bold text-white text-sm">No footage shared yet</p>
              <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                Got a new shoot or podcast recording? Click &quot;Share Footage to Editor&quot; above to notify your editors how it was shared (AirDrop, Hard Disk, etc.).
              </p>
            </div>
            <button
              onClick={openShareModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white hover:bg-zinc-200 text-black text-xs font-black transition-all shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>Share Footage to Editor</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recordings.map((rec) => {
              const deliverablesList = rec.deliverables || [];
              const reels = deliverablesList.filter(d => d.deliverable_type === 'reel');
              const fullVideo = deliverablesList.find(d => d.deliverable_type === 'full_length_video');
              const avgProgress = deliverablesList.length > 0
                ? Math.round(deliverablesList.reduce((acc, d) => acc + (d.progress_percentage || 0), 0) / deliverablesList.length)
                : 0;

              return (
                <div
                  key={rec.id}
                  className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-sm hover:border-zinc-700 transition-all space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-white text-sm">
                        {rec.title}
                      </h4>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[11px] text-zinc-400">
                          Shared: {rec.recording_date}
                        </span>
                        {(() => {
                          const deadlineMatch = rec.notes?.match(/\[Deadline:\s*([^\]]+)\]/i)?.[1] || deliverablesList.find((d: any) => d.deadline)?.deadline;
                          if (!deadlineMatch) return null;
                          return (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-200 border border-zinc-700 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-zinc-300" />
                              Due: {deadlineMatch}
                            </span>
                          );
                        })()}
                      </div>
                    </div>

                    {/* How Shared Badge & Delete */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {getSharingBadge(rec.hard_disk_name)}
                      <button
                        type="button"
                        onClick={() => handleDeleteRecording(rec.id, rec.title)}
                        className="p-1.5 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800 border border-transparent hover:border-zinc-700 transition"
                        title="Delete Shoot"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Transfer Details / Location */}
                  <div className="p-2.5 rounded-xl bg-black/60 border border-zinc-800 text-xs">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-0.5">
                      How Editor Accesses It:
                    </span>
                    <span className="font-medium text-zinc-200">
                      {rec.folder_path || rec.hard_disk_name}
                    </span>
                  </div>

                  {/* Generated Cuts & Progress Bar */}
                  <div className="space-y-1.5 pt-1 border-t border-zinc-800">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400 font-medium text-[11px]">
                        {reels.length} Reels {fullVideo ? '+ 1 Full Video' : ''}
                      </span>
                      <span className="font-bold text-white text-[11px] bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-700">
                        {avgProgress}% Done
                      </span>
                    </div>

                    <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-white h-full rounded-full transition-all duration-300"
                        style={{ width: `${avgProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SIMPLE SHARE FOOTAGE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-800 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 text-white flex items-center justify-center">
                  <Share2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-white text-base">
                    Share Footage to Editor
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Notify your editing team how raw files were sent.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleShareToEditor} className="p-5 space-y-4">
              {/* 1. Footage Title */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  Footage / Shoot Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Ep 45 — AI Scaling Laws Podcast"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white font-medium focus:outline-none focus:border-zinc-500"
                />
              </div>

              {/* 2. Assign to Editor */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5 flex items-center justify-between">
                  <span>Assign to Video Editor</span>
                  <span className="text-[10px] text-zinc-400 font-bold">Direct Task Assignment</span>
                </label>
                <select
                  value={selectedEditorId}
                  onChange={(e) => setSelectedEditorId(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-800 bg-black text-white font-medium focus:outline-none focus:border-zinc-500"
                >
                  <option value="">Unassigned (Any editor can accept)</option>
                  {editors.map((ed) => (
                    <option key={ed.id} value={ed.id}>
                      🎬 {ed.full_name} ({ed.email})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-zinc-500 mt-1">
                  The assigned editor will receive these tasks and can click &quot;Accept Task&quot; to begin editing.
                </p>
              </div>

              {/* Editing Deadline by Social Media Manager */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5 flex items-center justify-between">
                  <span>Editing Deadline (Set by SMM) *</span>
                  <span className="text-[10px] text-zinc-400 font-bold">Due Date</span>
                </label>
                <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1">
                  {[
                    { label: 'Tomorrow', days: 1 },
                    { label: '2 Days', days: 2 },
                    { label: '3 Days', days: 3 },
                    { label: '5 Days', days: 5 },
                    { label: '1 Week', days: 7 }
                  ].map(p => {
                    const d = new Date();
                    d.setDate(d.getDate() + p.days);
                    const ds = d.toISOString().split('T')[0];
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => setDeadline(ds)}
                        className={`px-2.5 py-1 text-[11px] rounded-lg border font-bold shrink-0 transition-all ${
                          deadline === ds
                            ? 'bg-white text-black border-white'
                            : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:text-white'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="date"
                  required
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-800 bg-black text-white font-medium focus:outline-none focus:border-zinc-500"
                />
              </div>

              {/* 5. Cuts to Generate */}
              <div className="p-3.5 rounded-2xl bg-black/60 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    Reels / Shorts to Create:
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setReelsCount(Math.max(0, reelsCount - 1))}
                      className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-bold flex items-center justify-center text-xs"
                    >
                      -
                    </button>
                    <span className="w-6 text-center font-bold text-xs text-white">{reelsCount}</span>
                    <button
                      type="button"
                      onClick={() => setReelsCount(reelsCount + 1)}
                      className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-bold flex items-center justify-center text-xs"
                    >
                      +
                    </button>
                  </div>
                </div>

                <label className="flex items-center justify-between cursor-pointer pt-2 border-t border-zinc-800">
                  <span className="text-xs font-medium text-zinc-300">
                    Include Full Episode Video
                  </span>
                  <input
                    type="checkbox"
                    checked={includeFullVideo}
                    onChange={(e) => setIncludeFullVideo(e.target.checked)}
                    className="w-4 h-4 rounded text-black bg-zinc-800 border-zinc-700 focus:ring-zinc-400"
                  />
                </label>
              </div>

              {/* ONE FINAL CTA BUTTON */}
              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-semibold text-zinc-400 hover:bg-zinc-800 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-white hover:bg-zinc-200 text-black rounded-full text-xs font-black shadow-md transition-all disabled:opacity-50 active:scale-95"
                >
                  <Share2 className="w-4 h-4" />
                  <span>{isSubmitting ? 'Sharing...' : 'Share to Editor'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
