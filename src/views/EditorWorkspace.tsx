import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Deliverable, EditingStatus, Profile } from '../types';
import { StatusBadge } from '../components/StatComponents';
import { 
  Sliders, HardDrive, Folder, AlertCircle, Send, Check, 
  CheckCircle2, PlaySquare, Tv, Clock, ExternalLink, Sparkles, 
  UserCheck, X, ChevronRight, ChevronLeft, ArrowRight, ListTodo, 
  CheckSquare, Plus, ArrowLeft, Cloud, Film, Calendar, RefreshCw, User
} from 'lucide-react';

interface EditorWorkspaceProps {
  mode?: 'all' | 'my';
  onNavigateTab?: (tab: string) => void;
}

const ACCEPTED_PODCASTS_KEY_PREFIX = 'di_editor_accepted_podcasts_';

const getAcceptedPodcastIds = (userId: string): Set<string> => {
  try {
    const raw = localStorage.getItem(`${ACCEPTED_PODCASTS_KEY_PREFIX}${userId}`);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
};

const saveAcceptedPodcastId = (userId: string, podcastId: string) => {
  try {
    const set = getAcceptedPodcastIds(userId);
    set.add(podcastId);
    localStorage.setItem(`${ACCEPTED_PODCASTS_KEY_PREFIX}${userId}`, JSON.stringify(Array.from(set)));
  } catch (e) {
    console.warn('Failed to save accepted podcast to local storage:', e);
  }
};

interface PodcastItem {
  id: string;
  title: string;
  recording_date: string;
  hard_disk_name: string;
  folder_path: string;
  notes?: string;
  deadline: string | null;
  assigned_editor_id?: string;
  editor_name: string;
  deliverables: Deliverable[];
  totalCuts: number;
  completedCuts: number;
  progressPercentage: number;
  isMyPodcast: boolean;
}

export const EditorWorkspace: React.FC<EditorWorkspaceProps> = ({ 
  mode = 'my', 
  onNavigateTab 
}) => {
  const { currentUser } = useAuth();
  const [podcasts, setPodcasts] = useState<PodcastItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activePodcastId, setActivePodcastId] = useState<string | null>(null);

  // 100% Google Drive Submission Modal State
  const [driveModalCut, setDriveModalCut] = useState<Deliverable | null>(null);
  const [driveUrl, setDriveUrl] = useState('');
  const [driveNotes, setDriveNotes] = useState('');
  const [isSubmittingDrive, setIsSubmittingDrive] = useState(false);

  // Toast message
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const extractDeadline = (recNotes?: string, delivList?: Deliverable[]): string | null => {
    if (delivList && delivList.length > 0) {
      const withDeadline = delivList.find(d => d.deadline);
      if (withDeadline?.deadline) return withDeadline.deadline;
    }
    if (recNotes) {
      const match = recNotes.match(/\[Deadline:\s*([^\]]+)\]/i);
      if (match) return match[1];
    }
    return null;
  };

  const loadData = async (showSpinner = false) => {
    if (!currentUser) return;
    if (showSpinner) setIsLoading(true);

    try {
      const [recsRes, delivRes] = await Promise.all([
        supabase
          .from('recordings')
          .select('*')
          .order('recording_date', { ascending: false }),
        supabase
          .from('deliverables')
          .select(`
            *,
            recordings (title, episode_number, recording_date, hard_disk_name, folder_path, notes),
            profiles:assigned_editor_id (full_name)
          `)
          .order('created_at', { ascending: true })
      ]);

      const recs = recsRes.data || [];
      const dels: Deliverable[] = (delivRes.data || []).map((d: any) => ({
        ...d,
        recording_title: d.recordings?.title,
        episode_number: d.recordings?.episode_number,
        hard_disk_name: d.recordings?.hard_disk_name,
        folder_path: d.recordings?.folder_path,
        editor_name: d.profiles?.full_name || 'Unassigned'
      }));

      const acceptedSet = getAcceptedPodcastIds(currentUser.id);

      const items: PodcastItem[] = recs.map((rec: any) => {
        const podDelivs = dels.filter(d => d.recording_id === rec.id);
        const deadline = extractDeadline(rec.notes, podDelivs);

        // Find primary assigned editor for this podcast
        const assignedDeliv = podDelivs.find(d => d.assigned_editor_id);
        const assignedEditorId = assignedDeliv?.assigned_editor_id;
        const editorName = assignedDeliv?.editor_name || (assignedEditorId === currentUser.id ? currentUser.full_name : 'Unassigned');

        // Check if assigned to current editor
        const isAssignedDirectly = podDelivs.some(d => d.assigned_editor_id === currentUser.id);
        const isAccepted = acceptedSet.has(rec.id);
        const isMyPodcast = isAssignedDirectly || isAccepted;

        // Completion calculation
        const completedCuts = podDelivs.filter(d => 
          (d.progress_percentage || 0) === 100 || 
          d.editing_status === 'approved' || 
          d.editing_status === 'submitted_for_approval'
        ).length;

        const totalCuts = podDelivs.length;
        const progressPercentage = totalCuts > 0
          ? Math.round(podDelivs.reduce((acc, d) => acc + (d.progress_percentage || 0), 0) / totalCuts)
          : 0;

        return {
          id: rec.id,
          title: rec.title,
          recording_date: rec.recording_date,
          hard_disk_name: rec.hard_disk_name,
          folder_path: rec.folder_path,
          notes: rec.notes,
          deadline,
          assigned_editor_id: assignedEditorId,
          editor_name: editorName,
          deliverables: podDelivs,
          totalCuts,
          completedCuts,
          progressPercentage,
          isMyPodcast
        };
      });

      setPodcasts(items);
    } catch (err) {
      console.error('Failed to load podcasts for editor workspace:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData(true);

    const channel = supabase
      .channel('editor-podcasts-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recordings' }, () => loadData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliverables' }, () => loadData(false))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  // Filter podcasts based on workspace mode: 'my' (My Tasks) vs 'all' (Open Tasks Queue)
  const displayedPodcasts = useMemo(() => {
    if (mode === 'my') {
      return podcasts.filter(p => p.isMyPodcast);
    } else {
      // In 'all' queue, show podcasts that are open / available or unassigned
      return podcasts.filter(p => !p.isMyPodcast);
    }
  }, [podcasts, mode]);

  // Active Podcast currently opened inside
  const activePodcast = useMemo(() => {
    if (!activePodcastId) return null;
    return podcasts.find(p => p.id === activePodcastId) || null;
  }, [podcasts, activePodcastId]);

  // Claim / Accept entire Podcast action
  const handleClaimPodcast = async (podcast: PodcastItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!currentUser) return;

    saveAcceptedPodcastId(currentUser.id, podcast.id);

    // Update in Supabase: assign all deliverables of this podcast to this editor
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('deliverables')
        .update({
          assigned_editor_id: currentUser.id,
          editing_status: 'editing_in_progress',
          updated_at: now
        })
        .eq('recording_id', podcast.id);

      if (error) console.warn('Deliverables update note:', error);

      showToast(`🎬 Claimed "${podcast.title}"! Opening podcast cuts.`);
      if (onNavigateTab) onNavigateTab('my_tasks');
      setActivePodcastId(podcast.id);
      loadData(false);
    } catch (err) {
      console.error('Error claiming podcast:', err);
    }
  };

  // Quick Progress Update (25%, 50%, 75%)
  const handleQuickProgress = async (cut: Deliverable, newProgress: number) => {
    if (!currentUser) return;

    if (newProgress === 100) {
      // 100% requires Google Drive link prompt
      openDriveModal(cut);
      return;
    }

    const now = new Date().toISOString();

    // Optimistic UI update
    setPodcasts(prev => prev.map(p => {
      if (p.id !== cut.recording_id) return p;
      const updatedDelivs = p.deliverables.map(d => d.id === cut.id ? {
        ...d,
        progress_percentage: newProgress,
        editing_status: 'editing_in_progress' as EditingStatus,
        updated_at: now
      } : d);

      const completedCuts = updatedDelivs.filter(d => (d.progress_percentage || 0) === 100).length;
      const progressPercentage = Math.round(updatedDelivs.reduce((acc, d) => acc + (d.progress_percentage || 0), 0) / updatedDelivs.length);

      return {
        ...p,
        deliverables: updatedDelivs,
        completedCuts,
        progressPercentage
      };
    }));

    showToast(`Updated "${cut.title}" to ${newProgress}%!`);

    try {
      const { error } = await supabase
        .from('deliverables')
        .update({
          progress_percentage: newProgress,
          editing_status: 'editing_in_progress',
          assigned_editor_id: currentUser.id,
          updated_at: now
        })
        .eq('id', cut.id);

      if (error) throw error;
    } catch (err: any) {
      console.error('Failed to update cut progress in DB:', err);
    }
  };

  // Open 100% Google Drive Submission Modal
  const openDriveModal = (cut: Deliverable) => {
    setDriveModalCut(cut);
    setDriveUrl(cut.final_video_link || cut.preview_link || '');
    setDriveNotes('');
  };

  // Confirm and Submit 100% Google Drive Link
  const handleSubmitDriveLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driveModalCut || !currentUser) return;

    if (!driveUrl.trim()) {
      alert('Please provide the Google Drive link for this cut.');
      return;
    }

    setIsSubmittingDrive(true);
    const now = new Date().toISOString();
    const finalLink = driveUrl.trim();

    try {
      const { error } = await supabase
        .from('deliverables')
        .update({
          progress_percentage: 100,
          final_video_link: finalLink,
          preview_link: finalLink,
          editing_status: 'submitted_for_approval', // Ready for SMM & Founder review
          assigned_editor_id: currentUser.id,
          updated_at: now
        })
        .eq('id', driveModalCut.id);

      if (error) throw error;

      showToast(`🎉 "${driveModalCut.title}" marked 100% completed with Google Drive link!`);
      setDriveModalCut(null);
      setDriveUrl('');
      loadData(false);
    } catch (err: any) {
      alert(`Failed to save final cut: ${err.message}`);
    } finally {
      setIsSubmittingDrive(false);
    }
  };

  // Add more Reels / Full Videos inside this Podcast
  const handleAddReel = async () => {
    if (!activePodcast || !currentUser) return;

    const existingReels = activePodcast.deliverables.filter(d => d.deliverable_type === 'reel');
    const nextNumber = existingReels.length + 1;
    const title = `${activePodcast.title} - Reel #${nextNumber}`;

    try {
      const { error } = await supabase
        .from('deliverables')
        .insert([{
          recording_id: activePodcast.id,
          title: title,
          deliverable_type: 'reel',
          assigned_editor_id: currentUser.id,
          editing_status: 'editing_in_progress',
          priority: 'medium',
          deadline: activePodcast.deadline || null,
          progress_percentage: 0
        }]);

      if (error) throw error;
      showToast(`+ Added ${title} to podcast!`);
      loadData(false);
    } catch (err: any) {
      alert(`Failed to add reel: ${err.message}`);
    }
  };

  const handleAddFullVideo = async () => {
    if (!activePodcast || !currentUser) return;

    const title = `${activePodcast.title} - Full Episode Video`;

    try {
      const { error } = await supabase
        .from('deliverables')
        .insert([{
          recording_id: activePodcast.id,
          title: title,
          deliverable_type: 'full_length_video',
          assigned_editor_id: currentUser.id,
          editing_status: 'editing_in_progress',
          priority: 'high',
          deadline: activePodcast.deadline || null,
          progress_percentage: 0
        }]);

      if (error) throw error;
      showToast(`+ Added Full Episode Video to podcast!`);
      loadData(false);
    } catch (err: any) {
      alert(`Failed to add full video: ${err.message}`);
    }
  };

  // ==========================================
  // VIEW 2: INSIDE PODCAST CUTS WORKSPACE
  // ==========================================
  if (activePodcast) {
    const reels = activePodcast.deliverables.filter(d => d.deliverable_type === 'reel');
    const fullVideos = activePodcast.deliverables.filter(d => d.deliverable_type === 'full_length_video');
    const otherCuts = activePodcast.deliverables.filter(d => d.deliverable_type !== 'reel' && d.deliverable_type !== 'full_length_video');

    const completedReels = reels.filter(r => (r.progress_percentage || 0) === 100).length;
    const completedFull = fullVideos.filter(f => (f.progress_percentage || 0) === 100).length;

    return (
      <div className="space-y-6 animate-in fade-in duration-300 pb-20">
        {/* Toast Feedback */}
        {toastMessage && (
          <div className="fixed top-20 right-4 z-50 bg-white text-black font-black px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 border border-zinc-200 animate-in slide-in-from-top-2">
            <CheckCircle2 className="w-4 h-4 text-black" />
            <span className="text-xs">{toastMessage}</span>
          </div>
        )}

        {/* Back Navigation Bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setActivePodcastId(null)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to All Podcasts</span>
          </button>

          <span className="text-xs font-bold px-3 py-1 rounded-full bg-zinc-800 text-zinc-200 border border-zinc-700">
            1 Podcast = 1 Dedicated Editor
          </span>
        </div>

        {/* PODCAST HERO CARD */}
        <div className="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
                Active Podcast Production
              </span>
              <h2 className="text-2xl font-black text-white tracking-tight mt-0.5">
                {activePodcast.title}
              </h2>
            </div>

            {/* DEADLINE BADGE (SET BY SOCIAL MEDIA MANAGER) */}
            <div className="flex items-center gap-2 flex-wrap">
              {activePodcast.deadline ? (
                <div className="px-4 py-2 rounded-2xl bg-zinc-800 border border-zinc-700 text-white flex items-center gap-2 shadow-sm">
                  <Clock className="w-4 h-4 text-white" />
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400 block">
                      Deadline by SMM
                    </span>
                    <span className="text-xs font-black text-white">
                      {activePodcast.deadline}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="px-3.5 py-1.5 rounded-2xl bg-zinc-800/60 border border-zinc-800 text-zinc-400 text-xs flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>No deadline set</span>
                </div>
              )}

              <div className="px-3.5 py-2 rounded-2xl bg-zinc-800/80 border border-zinc-700/60 text-zinc-200 text-xs font-bold flex items-center gap-2">
                <Calendar className="w-4 h-4 text-zinc-400" />
                <span>Shot: {activePodcast.recording_date}</span>
              </div>
            </div>
          </div>

          {/* Footage & Storage Transfer Info */}
          <div className="p-3.5 rounded-2xl bg-black border border-zinc-800 flex items-center justify-between gap-3 flex-wrap text-xs">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-zinc-400" />
              <span className="font-bold text-zinc-400">Footage Access:</span>
              <span className="font-bold text-white bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-700">
                {activePodcast.hard_disk_name}
              </span>
              <span className="text-zinc-300">
                {activePodcast.folder_path}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-zinc-400">
              <User className="w-3.5 h-3.5 text-zinc-300" />
              <span>Editor: <strong className="text-white">{currentUser?.full_name}</strong></span>
            </div>
          </div>

          {/* Overall Podcast Progress Bar */}
          <div className="space-y-2 pt-2 border-t border-zinc-800">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-black text-white text-sm">
                  {activePodcast.completedCuts} of {activePodcast.totalCuts} Cuts Completed
                </span>
                <span className="text-zinc-400 text-xs">
                  ({completedReels} Reels • {completedFull} Full Video)
                </span>
              </div>

              <span className="font-black text-xs px-2.5 py-0.5 rounded-full bg-zinc-800 text-white border border-zinc-700">
                {activePodcast.progressPercentage}% Total Progress
              </span>
            </div>

            <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-white h-full rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                style={{ width: `${activePodcast.progressPercentage}%` }}
              />
            </div>
          </div>
        </div>

        {/* CUTS MANAGER HEADER & ACTION BUTTONS */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Film className="w-5 h-5 text-white" />
              <span>Podcast Video Cuts ({activePodcast.deliverables.length})</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Update progress as you edit. When a reel reaches 100%, provide the Google Drive link to complete it.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleAddReel}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-black text-xs font-black hover:bg-zinc-200 transition-all shadow-md active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Reel</span>
            </button>

            <button
              onClick={handleAddFullVideo}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-zinc-800 border border-zinc-700 text-white text-xs font-bold hover:bg-zinc-700 transition-all active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Full Video</span>
            </button>
          </div>
        </div>

        {/* DELIVERABLE CUTS LIST */}
        <div className="space-y-3">
          {activePodcast.deliverables.map((cut) => {
            const isCompleted = (cut.progress_percentage || 0) === 100 || cut.editing_status === 'approved' || cut.editing_status === 'submitted_for_approval';

            return (
              <div
                key={cut.id}
                className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-sm space-y-4 transition-all hover:border-zinc-700"
              >
                {/* Cut Header */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-200 flex items-center gap-1">
                      {cut.deliverable_type === 'full_length_video' ? (
                        <>
                          <Tv className="w-3 h-3 text-zinc-300" />
                          <span>📺 Full Video (16:9)</span>
                        </>
                      ) : (
                        <>
                          <PlaySquare className="w-3 h-3 text-zinc-300" />
                          <span>📱 Reel / Short (9:16)</span>
                        </>
                      )}
                    </span>

                    {isCompleted ? (
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-white text-black border border-white flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        <span>100% Completed</span>
                      </span>
                    ) : (
                      <StatusBadge status={cut.editing_status} />
                    )}
                  </div>

                  {/* Google Drive Link if provided */}
                  {cut.final_video_link && (
                    <a
                      href={cut.final_video_link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-xs font-bold text-white hover:bg-zinc-700 transition-all"
                    >
                      <Cloud className="w-3.5 h-3.5 text-zinc-300" />
                      <span>Google Drive Cut</span>
                      <ExternalLink className="w-3 h-3 text-zinc-400" />
                    </a>
                  )}
                </div>

                {/* Title & Progress Indicator */}
                <div>
                  <h4 className="font-black text-white text-base">
                    {cut.title}
                  </h4>
                  <div className="flex items-center justify-between mt-1 text-xs text-zinc-400">
                    <span>Current Editing Progress:</span>
                    <span className="font-bold text-white text-sm">
                      {cut.progress_percentage || 0}% Done
                    </span>
                  </div>

                  <div className="w-full bg-black h-2 rounded-full overflow-hidden mt-1.5 border border-zinc-800">
                    <div
                      className="bg-white h-full rounded-full transition-all duration-300"
                      style={{ width: `${cut.progress_percentage || 0}%` }}
                    />
                  </div>
                </div>

                {/* Quick Progress Buttons & 100% Completion Action */}
                <div className="pt-2 border-t border-zinc-800 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase mr-1">
                      Quick Set:
                    </span>
                    {[25, 50, 75].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => handleQuickProgress(cut, pct)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          cut.progress_percentage === pct
                            ? 'bg-white text-black font-black shadow-md'
                            : 'bg-black border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>

                  {/* 100% Google Drive Submit Button */}
                  <button
                    type="button"
                    onClick={() => openDriveModal(cut)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-black transition-all active:scale-95 shadow-md ${
                      isCompleted
                        ? 'bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700'
                        : 'bg-white text-black hover:bg-zinc-200'
                    }`}
                  >
                    <Cloud className="w-3.5 h-3.5" />
                    <span>{isCompleted ? 'Update Google Drive Link' : 'Mark 100% Completed (Provide Drive Link) 🚀'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 100% GOOGLE DRIVE SUBMISSION MODAL */}
        {driveModalCut && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-800 overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-zinc-800 border border-zinc-700 text-white flex items-center justify-center">
                    <Cloud className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">
                      100% Cut Completion
                    </span>
                    <h3 className="font-black text-white text-base">
                      Provide Google Drive Link
                    </h3>
                  </div>
                </div>

                <button
                  onClick={() => setDriveModalCut(null)}
                  className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitDriveLink} className="p-5 space-y-4">
                <div className="p-3 rounded-2xl bg-black border border-zinc-800 text-xs">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase block mb-0.5">
                    Submitting Cut:
                  </span>
                  <span className="font-black text-white text-sm">
                    {driveModalCut.title}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1.5 flex items-center justify-between">
                    <span>Google Drive Link (Required) *</span>
                    <span className="text-[10px] text-zinc-400 font-medium">View / Download Link</span>
                  </label>
                  <input
                    type="url"
                    required
                    value={driveUrl}
                    onChange={(e) => setDriveUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/... or folder URL"
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white font-medium focus:outline-none focus:border-zinc-500"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Once submitted, this cut will be marked as 100% completed and immediately available to the Social Media Manager and Founder for publishing.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Notes / Quality Info (Optional)
                  </label>
                  <input
                    type="text"
                    value={driveNotes}
                    onChange={(e) => setDriveNotes(e.target.value)}
                    placeholder="e.g. 4K 60fps export, color graded, captions burned in"
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setDriveModalCut(null)}
                    className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white rounded-full transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingDrive}
                    className="px-6 py-2.5 rounded-full text-xs font-black bg-white hover:bg-zinc-200 text-black shadow-md transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isSubmittingDrive ? 'Saving...' : 'Confirm & Complete Cut ✓'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // VIEW 1: FRONT PODCASTS LIST VIEW
  // ==========================================
  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 bg-white text-black font-black px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 border border-zinc-200 animate-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-black" />
          <span className="text-xs">{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
            {mode === 'my' ? 'My Active Work' : 'Podcast Production Queue'}
          </span>
          <h2 className="text-2xl font-black text-white tracking-tight">
            {mode === 'my' ? 'My Assigned Podcasts' : 'Available Podcasts for Editing'}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            1 Podcast = 1 Dedicated Video Editor. Click any podcast to manage its reels, update editing progress, and submit final Google Drive links.
          </p>
        </div>

        <button
          onClick={() => loadData(true)}
          disabled={isLoading}
          className="p-2 rounded-full border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 shadow-sm transition-all self-start sm:self-auto"
          title="Refresh Podcasts"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* PODCASTS LIST */}
      {isLoading ? (
        <div className="py-20 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-zinc-700 border-t-white rounded-full mx-auto" />
          <p className="mt-3 text-xs text-zinc-500">Loading podcasts &amp; editing status...</p>
        </div>
      ) : displayedPodcasts.length === 0 ? (
        <div className="py-16 text-center rounded-3xl bg-zinc-900 border border-zinc-800 p-8 space-y-2">
          <Film className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-white">
            {mode === 'my' ? 'No podcasts currently assigned to you' : 'No open podcasts in queue'}
          </h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            {mode === 'my' 
              ? 'Switch to the "Tasks" tab to claim and accept an open podcast shoot.' 
              : 'All podcasts have been claimed by editors. Check back when the Social Media Manager shares new footage.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayedPodcasts.map((podcast) => {
            const reels = podcast.deliverables.filter(d => d.deliverable_type === 'reel');
            const fullVideos = podcast.deliverables.filter(d => d.deliverable_type === 'full_length_video');
            const completedReels = reels.filter(r => (r.progress_percentage || 0) === 100).length;
            const completedFull = fullVideos.filter(f => (f.progress_percentage || 0) === 100).length;

            return (
              <div
                key={podcast.id}
                onClick={() => setActivePodcastId(podcast.id)}
                className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-sm hover:border-zinc-700 hover:shadow-xl transition-all duration-200 cursor-pointer space-y-4 group"
              >
                {/* Header Row: Title & Deadline */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black text-white text-base group-hover:text-zinc-200 transition-colors">
                      {podcast.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-zinc-500" />
                        Shot: {podcast.recording_date}
                      </span>

                      {/* DEADLINE DISPLAY (BY SMM) */}
                      {podcast.deadline && (
                        <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-zinc-800 text-white border border-zinc-700 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-white" />
                          <span>Deadline: {podcast.deadline}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {podcast.isMyPodcast ? (
                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-white text-black border border-white shrink-0">
                      Assigned to You
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => handleClaimPodcast(podcast, e)}
                      className="px-3.5 py-1.5 rounded-full bg-white text-black text-xs font-black hover:bg-zinc-200 transition-all shadow-md active:scale-95 shrink-0"
                    >
                      🎬 Claim Podcast
                    </button>
                  )}
                </div>

                {/* Footage Transfer Method & Access */}
                <div className="p-3 rounded-2xl bg-black border border-zinc-800 text-xs flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="font-bold text-zinc-400">Footage:</span>
                    <span className="font-bold text-white bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-700">
                      {podcast.hard_disk_name}
                    </span>
                    <span className="text-zinc-300 truncate max-w-[180px]">
                      {podcast.folder_path}
                    </span>
                  </div>

                  <span className="text-[10px] font-semibold text-zinc-400">
                    Editor: <strong className="text-zinc-200">{podcast.editor_name}</strong>
                  </span>
                </div>

                {/* Overall Podcast Progress Bar */}
                <div className="space-y-1.5 pt-1 border-t border-zinc-800">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400 font-bold">
                      {podcast.completedCuts} of {podcast.totalCuts} Cuts Done ({completedReels} Reels, {completedFull} Full)
                    </span>
                    <span className="font-black text-white bg-zinc-800 px-2 py-0.5 rounded-full text-[11px] border border-zinc-700">
                      {podcast.progressPercentage}%
                    </span>
                  </div>

                  <div className="w-full bg-black h-2 rounded-full overflow-hidden border border-zinc-800">
                    <div
                      className="bg-white h-full rounded-full transition-all duration-300"
                      style={{ width: `${podcast.progressPercentage}%` }}
                    />
                  </div>
                </div>

                {/* Open Podcast Button */}
                <div className="pt-2 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-zinc-500 font-medium">
                    Click to add / manage reels &amp; submit Drive link
                  </span>
                  <div className="flex items-center gap-1 font-bold text-white group-hover:translate-x-1 transition-transform">
                    <span>Manage Cuts</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
