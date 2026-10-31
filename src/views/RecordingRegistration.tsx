import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { 
  Share2, Plus, HardDrive, Smartphone, Cloud, Usb, 
  Folder, Check, AlertCircle, X, Film, CheckCircle2, 
  Clock, ArrowRight, Sparkles, Layers, ExternalLink
} from 'lucide-react';

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
  }[];
}

export const RecordingRegistration: React.FC = () => {
  const { currentUser } = useAuth();
  const [recordings, setRecordings] = useState<RecordingWithDeliverables[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [howShared, setHowShared] = useState('AirDrop');
  const [locationDetails, setLocationDetails] = useState('');
  const [reelsCount, setReelsCount] = useState(3);
  const [includeFullVideo, setIncludeFullVideo] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Suggested sharing methods
  const SHARING_SUGGESTIONS = [
    { label: 'AirDrop', icon: <Smartphone className="w-3.5 h-3.5" />, example: 'AirDropped to Editor MacBook' },
    { label: 'Hard Disk', icon: <HardDrive className="w-3.5 h-3.5" />, example: 'SanDisk 2TB SSD / Blue Drive' },
    { label: 'Google Drive', icon: <Cloud className="w-3.5 h-3.5" />, example: 'Google Drive Folder Link' },
    { label: 'Pen Drive / USB', icon: <Usb className="w-3.5 h-3.5" />, example: '64GB Kingston USB in Drawer' },
  ];

  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  const loadRecordings = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('recordings')
        .select(`
          *,
          deliverables (id, title, deliverable_type, editing_status, progress_percentage)
        `)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setRecordings(data as RecordingWithDeliverables[]);
      }
    } catch (e) {
      console.error('Failed to load recordings:', e);
    } finally {
      setIsLoading(false);
    }
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
    setHowShared('AirDrop');
    setLocationDetails('');
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

    if (!howShared.trim()) {
      showToast('error', 'Please specify how you shared the footage (e.g. AirDrop, Hard Disk).');
      return;
    }

    setIsSubmitting(true);

    try {
      const finalMethod = howShared.trim();
      const finalLocation = locationDetails.trim() || `Transferred via ${finalMethod}`;

      // 1. Insert Recording
      const { data: recData, error: recError } = await supabase
        .from('recordings')
        .insert([
          {
            title: title.trim(),
            recording_date: todayStr,
            date_received: todayStr,
            hard_disk_name: finalMethod, // Stores 'AirDrop', 'Hard Disk', etc.
            folder_path: finalLocation,  // Stores location / notes
            notes: `Shared to Editor via: ${finalMethod}. Details: ${finalLocation}`,
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
          editing_status: 'assigned',
          priority: 'medium',
          progress_percentage: 0
        });
      }

      if (includeFullVideo) {
        deliverablesToInsert.push({
          recording_id: recData.id,
          title: `${title.trim()} - Full Episode Video`,
          deliverable_type: 'full_length_video',
          editing_status: 'assigned',
          priority: 'high',
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

      showToast('success', `Footage shared via ${finalMethod}! ${deliverablesToInsert.length} editing tasks created for the editor. 🚀`);
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
    if (lower.includes('airdrop')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400">
          <Smartphone className="w-3 h-3" />
          <span>{method}</span>
        </span>
      );
    }
    if (lower.includes('hard') || lower.includes('disk') || lower.includes('ssd') || lower.includes('drive')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <HardDrive className="w-3 h-3" />
          <span>{method}</span>
        </span>
      );
    }
    if (lower.includes('cloud') || lower.includes('google') || lower.includes('link')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400">
          <Cloud className="w-3 h-3" />
          <span>{method}</span>
        </span>
      );
    }
    if (lower.includes('usb') || lower.includes('pen')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <Usb className="w-3 h-3" />
          <span>{method}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/15 text-slate-600 dark:text-slate-300">
        <Folder className="w-3 h-3" />
        <span>{method}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-16">
      {/* Top Header & One Simple CTA Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Footage Sharing Hub
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Share raw video files to your video editor (AirDrop, Hard Disk, Drive) and generate cuts.
          </p>
        </div>

        {/* ONE CTA BUTTON TO SHARE FOOTAGE */}
        <button
          onClick={openShareModal}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-black shadow-lg shadow-blue-500/25 active:scale-95 transition-all self-start sm:self-auto"
        >
          <Share2 className="w-4 h-4" />
          <span>Share Footage to Editor</span>
        </button>
      </div>

      {/* Floating Status Notification */}
      {statusMessage && (
        <div className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-xs shadow-md animate-in slide-in-from-top duration-200 ${
          statusMessage.type === 'success'
            ? 'bg-emerald-600 text-white'
            : 'bg-rose-600 text-white'
        }`}>
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span className="font-bold">{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="p-1 text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* QUICK SUMMARY BANNER */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent border border-blue-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white text-xs">
              Footage Transferred to Editors
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {recordings.length} Raw {recordings.length === 1 ? 'Shoot' : 'Shoots'} registered across AirDrop, Hard Disks, and Cloud.
            </p>
          </div>
        </div>

        <button
          onClick={openShareModal}
          className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 self-start sm:self-auto"
        >
          <span>+ New Share</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* LIST OF FOOTAGE SHARED TO EDITORS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Shared Footage History ({recordings.length})
          </h3>
          <span className="text-[11px] text-slate-400">
            Real-time delivery & task status
          </span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-xs">Loading shared footage...</div>
        ) : recordings.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3">
            <Share2 className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
            <div>
              <p className="font-bold text-slate-900 dark:text-white text-sm">No footage shared yet</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Got a new shoot or podcast recording? Click "Share Footage to Editor" above to notify your editors how it was shared (AirDrop, Hard Disk, etc.).
              </p>
            </div>
            <button
              onClick={openShareModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all"
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
                  className="p-4 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                        {rec.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Shared on {rec.recording_date}
                      </p>
                    </div>

                    {/* How Shared Badge */}
                    {getSharingBadge(rec.hard_disk_name)}
                  </div>

                  {/* Transfer Details / Location */}
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                      How Editor Accesses It:
                    </span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {rec.folder_path || rec.hard_disk_name}
                    </span>
                  </div>

                  {/* Generated Cuts & Progress Bar */}
                  <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-700/60">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400 font-medium text-[11px]">
                        {reels.length} Reels {fullVideo ? '+ 1 Full Video' : ''}
                      </span>
                      <span className="font-bold text-blue-600 dark:text-blue-400 text-[11px]">
                        {avgProgress}% Done
                      </span>
                    </div>

                    <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-blue-600 h-full rounded-full transition-all duration-300"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                  <Share2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 dark:text-white text-base">
                    Share Footage to Editor
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Notify your editing team how raw files were sent.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleShareToEditor} className="p-5 space-y-4">
              {/* 1. Footage Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Footage / Shoot Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Ep 45 — AI Scaling Laws Podcast"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 2. HOW DID YOU SHARE IT? (AirDrop, Hard Disk, etc.) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>How did you share it with the editor? *</span>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">Type or Tap</span>
                </label>

                {/* Quick Selection Chips */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {SHARING_SUGGESTIONS.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        setHowShared(item.label);
                        if (!locationDetails) setLocationDetails(item.example);
                      }}
                      className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-bold transition-all text-left ${
                        howShared === item.label
                          ? 'border-blue-600 bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500/20'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>

                {/* Custom Typing Field */}
                <input
                  type="text"
                  required
                  value={howShared}
                  onChange={(e) => setHowShared(e.target.value)}
                  placeholder="Type like AirDrop, Hard Disk, SSD, etc."
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 3. Where / Details (Optional) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Location / Details for Editor (optional)
                </label>
                <input
                  type="text"
                  value={locationDetails}
                  onChange={(e) => setLocationDetails(e.target.value)}
                  placeholder="e.g. AirDropped to Downloads folder, or Drive link"
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 4. Cuts to Generate */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Reels / Shorts to Create:
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setReelsCount(Math.max(0, reelsCount - 1))}
                      className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-700 font-bold flex items-center justify-center text-xs"
                    >
                      -
                    </button>
                    <span className="w-6 text-center font-bold text-xs">{reelsCount}</span>
                    <button
                      type="button"
                      onClick={() => setReelsCount(reelsCount + 1)}
                      className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-700 font-bold flex items-center justify-center text-xs"
                    >
                      +
                    </button>
                  </div>
                </div>

                <label className="flex items-center justify-between cursor-pointer pt-2 border-t border-slate-200/60 dark:border-slate-800">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Include Full Episode Video
                  </span>
                  <input
                    type="checkbox"
                    checked={includeFullVideo}
                    onChange={(e) => setIncludeFullVideo(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                </label>
              </div>

              {/* ONE FINAL CTA BUTTON */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50 active:scale-95"
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
