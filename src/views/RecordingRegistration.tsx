import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { HardDrive, Folder, Check, AlertCircle } from 'lucide-react';

export const RecordingRegistration: React.FC = () => {
  const { currentUser } = useAuth();
  
  const [title, setTitle] = useState('');
  const [episodeNumber, setEpisodeNumber] = useState('');
  const [recordingDate, setRecordingDate] = useState(new Date().toISOString().split('T')[0]);
  const [dateReceived, setDateReceived] = useState(new Date().toISOString().split('T')[0]);
  const [hardDiskName, setHardDiskName] = useState('');
  const [hardDiskId, setHardDiskId] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [sourceFootageReference, setSourceFootageReference] = useState('');
  const [notes, setNotes] = useState('');
  
  // Deliverables generation
  const [reelsCount, setReelsCount] = useState(3);
  const [includeFullVideo, setIncludeFullVideo] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !hardDiskName.trim() || !folderPath.trim()) {
      setStatusMessage({ type: 'error', text: 'Please fill in title, hard disk name, and folder path.' });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      // 1. Insert Recording
      const { data: recData, error: recError } = await supabase
        .from('recordings')
        .insert([
          {
            title: title.trim(),
            episode_number: episodeNumber ? parseInt(episodeNumber) : null,
            recording_date: recordingDate,
            date_received: dateReceived,
            hard_disk_name: hardDiskName.trim(),
            hard_disk_id: hardDiskId.trim() || null,
            folder_path: folderPath.trim(),
            source_footage_reference: sourceFootageReference.trim() || null,
            notes: notes.trim() || null,
            registered_by: currentUser?.id
          }
        ])
        .select()
        .single();

      if (recError || !recData) {
        throw new Error(recError?.message || 'Failed to save recording');
      }

      // 2. Generate Deliverables
      const deliverablesToInsert = [];
      for (let i = 1; i <= Math.max(1, reelsCount); i++) {
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

      const { error: delError } = await supabase
        .from('deliverables')
        .insert(deliverablesToInsert);

      if (delError) {
        console.warn('Deliverables insertion warning:', delError);
      }

      setStatusMessage({
        type: 'success',
        text: `Footage registered & ${deliverablesToInsert.length} editing deliverables generated successfully! 🎉`
      });

      // Reset form
      setTitle('');
      setEpisodeNumber('');
      setHardDiskName('');
      setHardDiskId('');
      setFolderPath('');
      setSourceFootageReference('');
      setNotes('');
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Submission failed' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          Register Raw Footage
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Record physical hard drive locations and automatically generate editing tasks.
        </p>
      </div>

      {statusMessage && (
        <div className={`p-4 rounded-2xl flex items-start gap-3 text-xs ${
          statusMessage.type === 'success'
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
        }`}>
          {statusMessage.type === 'success' ? <Check className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          <span className="font-semibold leading-relaxed">{statusMessage.text}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-5 shadow-sm">
        {/* Section 1: Recording & Episode */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Recording Details
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Recording / Podcast Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Ep 42 — AI in Healthcare"
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Episode # (optional)
              </label>
              <input
                type="number"
                value={episodeNumber}
                onChange={(e) => setEpisodeNumber(e.target.value)}
                placeholder="42"
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Recording Date
              </label>
              <input
                type="date"
                required
                value={recordingDate}
                onChange={(e) => setRecordingDate(e.target.value)}
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Date Received
              </label>
              <input
                type="date"
                required
                value={dateReceived}
                onChange={(e) => setDateReceived(e.target.value)}
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Physical Hard Disk Tracking */}
        <div className="space-y-4 pt-3 border-t border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-amber-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Physical Hard Disk Location
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Hard Disk Name *
              </label>
              <input
                type="text"
                required
                value={hardDiskName}
                onChange={(e) => setHardDiskName(e.target.value)}
                placeholder="e.g. LION-DISK-04"
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Disk ID / Serial (optional)
              </label>
              <input
                type="text"
                value={hardDiskId}
                onChange={(e) => setHardDiskId(e.target.value)}
                placeholder="SN-98234-A"
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Folder Path on Hard Disk *
            </label>
            <input
              type="text"
              required
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="/Footage/2026/Ep42/CamA"
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Source Footage Reference / Card Name
            </label>
            <input
              type="text"
              value={sourceFootageReference}
              onChange={(e) => setSourceFootageReference(e.target.value)}
              placeholder="SD-Card-01, A001_C002"
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* Section 3: Deliverables Auto-Generation */}
        <div className="space-y-4 pt-3 border-t border-slate-100 dark:border-slate-700">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Auto-Generate Deliverables
          </h3>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Reels / Shorts to Create
              </span>
              <p className="text-[11px] text-slate-400">Generates individual editing tasks for short-form clips.</p>
            </div>
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

          <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 cursor-pointer">
            <div>
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Include Full-Length Episode Video
              </span>
              <p className="text-[11px] text-slate-400">Generates the main episode deliverable task for YouTube.</p>
            </div>
            <input
              type="checkbox"
              checked={includeFullVideo}
              onChange={(e) => setIncludeFullVideo(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-brand-navy hover:bg-slate-800 text-white rounded-xl text-sm font-bold shadow-sm transition-all disabled:opacity-50"
        >
          {isSubmitting ? 'Registering...' : 'Register Footage & Generate Tasks'}
        </button>
      </form>
    </div>
  );
};
