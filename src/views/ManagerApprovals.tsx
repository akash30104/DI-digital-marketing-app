import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Deliverable, PlatformType } from '../types';
import { OFFICIAL_CHANNELS, formatPlatformLabel } from '../lib/streak';
import { 
  CheckCheck, CheckCircle2, RotateCcw, AlertTriangle, 
  ExternalLink, Film, User, HardDrive, RefreshCw, MessageSquare, 
  Send, PlaySquare, Camera, X, Check, Radio, Share2
} from 'lucide-react';

export const ManagerApprovals: React.FC = () => {
  const { currentUser } = useAuth();
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [filterMode, setFilterMode] = useState<'pending' | 'approved' | 'changes'>('pending');
  const [isLoading, setIsLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Correction Modal State
  const [selectedItem, setSelectedItem] = useState<Deliverable | null>(null);
  const [revisionNotes, setRevisionNotes] = useState('');
  const [isSubmittingNotes, setIsSubmittingNotes] = useState(false);

  // Direct Publish Modal State (for Social Media Manager)
  const [publishingItem, setPublishingItem] = useState<Deliverable | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>('youtube_shorts');
  const [selectedChannel, setSelectedChannel] = useState<string>('Digital Inertia');
  const [postUrl, setPostUrl] = useState('');
  const [publishNotes, setPublishNotes] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  const fetchDeliverables = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('deliverables')
        .select(`
          *,
          recordings (title, episode_number, hard_disk_name, folder_path, source_footage_reference),
          profiles:assigned_editor_id (full_name)
        `)
        .order('updated_at', { ascending: false });

      if (filterMode === 'pending') {
        query = query.eq('editing_status', 'submitted_for_approval');
      } else if (filterMode === 'approved') {
        query = query.eq('editing_status', 'approved');
      } else if (filterMode === 'changes') {
        query = query.eq('editing_status', 'changes_requested');
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data) {
        const mapped: Deliverable[] = data.map((d: any) => ({
          ...d,
          recording_title: d.recordings?.title,
          episode_number: d.recordings?.episode_number,
          hard_disk_name: d.recordings?.hard_disk_name,
          editor_name: d.profiles?.full_name || 'Assigned Editor'
        }));
        setDeliverables(mapped);
      }
    } catch (err) {
      console.error('Error fetching manager approvals:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliverables();

    const channel = supabase
      .channel('manager-approvals-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliverables' }, () => {
        fetchDeliverables();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filterMode]);

  // Open Direct Publishing Modal for SMM
  const openPublishModal = (item: Deliverable) => {
    setPublishingItem(item);
    setSelectedPlatform(item.deliverable_type === 'reel' ? 'youtube_shorts' : 'youtube_full');
    setSelectedChannel('Digital Inertia');
    setPostUrl('');
    setPublishNotes('');
  };

  // Confirm Social Media Publication & Live Proof
  const handleConfirmPublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publishingItem || !currentUser) return;

    if (!postUrl.trim()) {
      showToast('Live video link / proof is required to publish.');
      return;
    }

    setIsPublishing(true);

    try {
      const now = new Date().toISOString();

      // 1. Mark Deliverable Approved
      const { error: delError } = await supabase
        .from('deliverables')
        .update({
          editing_status: 'approved',
          approved_by: currentUser.id,
          approved_at: now,
          approval_notes: `Approved & Published to ${selectedChannel} on ${formatPlatformLabel(selectedPlatform)}`,
          updated_at: now
        })
        .eq('id', publishingItem.id);

      if (delError) throw delError;

      // 2. Insert into publishing_logs with Channel & Proof Link
      const combinedNotes = `[Channel: ${selectedChannel}] ${publishNotes.trim()}`.trim();
      const basePayload: any = {
        deliverable_id: publishingItem.id,
        recording_id: publishingItem.recording_id,
        platform: selectedPlatform,
        publication_status: 'published',
        published_by: currentUser.id,
        published_at: now,
        post_url: postUrl.trim(),
        notes: combinedNotes,
        reporting_date: todayStr
      };

      const payloadWithChannel = {
        ...basePayload,
        channel_name: selectedChannel
      };

      let insertRes = await supabase
        .from('publishing_logs')
        .insert([payloadWithChannel]);

      if (insertRes.error && insertRes.error.code === '42703') {
        // Fallback without channel_name column
        insertRes = await supabase
          .from('publishing_logs')
          .insert([basePayload]);
      }

      if (insertRes.error && insertRes.error.code === '23514') {
        // Fallback if platform check constraint rejects platform
        const fallbackPayload = {
          ...basePayload,
          platform: 'other',
          notes: `[Platform: ${selectedPlatform}] ${combinedNotes}`.trim()
        };
        let fbRes = await supabase
          .from('publishing_logs')
          .insert([{ ...fallbackPayload, channel_name: selectedChannel }]);
        if (fbRes.error && fbRes.error.code === '42703') {
          fbRes = await supabase
            .from('publishing_logs')
            .insert([fallbackPayload]);
        }
        insertRes = fbRes;
      }

      if (insertRes.error) {
        console.warn('Publishing log insert note:', insertRes.error);
      }

      showToast(`🎉 Approved & Published to ${selectedChannel} on ${formatPlatformLabel(selectedPlatform)}!`);
      setPublishingItem(null);
      fetchDeliverables();
    } catch (err: any) {
      console.error('Publication error:', err);
      showToast(err.message || 'Failed to publish video.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleQuickApprove = async (item: Deliverable) => {
    if (!currentUser) return;
    setActionInProgress(item.id);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('deliverables')
        .update({
          editing_status: 'approved',
          approved_by: currentUser.id,
          approved_at: now,
          approval_notes: 'Approved by Social Media Manager',
          updated_at: now
        })
        .eq('id', item.id);

      if (error) throw error;
      showToast('Video approved! You can now post and update the live proof link.');
      fetchDeliverables();
    } catch (err: any) {
      showToast(`Approval failed: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRequestChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !revisionNotes.trim()) return;
    setIsSubmittingNotes(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('deliverables')
        .update({
          editing_status: 'changes_requested',
          approval_notes: revisionNotes.trim(),
          updated_at: now
        })
        .eq('id', selectedItem.id);

      if (error) throw error;
      showToast('Revision notes sent back to editor!');
      setSelectedItem(null);
      setRevisionNotes('');
      fetchDeliverables();
    } catch (err: any) {
      showToast(`Failed to request changes: ${err.message}`);
    } finally {
      setIsSubmittingNotes(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <CheckCheck className="w-6 h-6 text-purple-600" />
            Social Media Manager Approvals & Publishing
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Review completed editor cuts, request revisions, and post directly to YouTube, Instagram, Facebook, and X.
          </p>
        </div>

        <button
          onClick={fetchDeliverables}
          disabled={isLoading}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl max-w-md">
        <button
          onClick={() => setFilterMode('pending')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            filterMode === 'pending'
              ? 'bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-300 shadow-sm'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Awaiting Review ({deliverables.filter(d => d.editing_status === 'submitted_for_approval').length || 0})
        </button>
        <button
          onClick={() => setFilterMode('approved')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            filterMode === 'approved'
              ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-300 shadow-sm'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Approved & Published
        </button>
        <button
          onClick={() => setFilterMode('changes')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            filterMode === 'changes'
              ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-300 shadow-sm'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          In Revision
        </button>
      </div>

      {/* Deliverables List */}
      {isLoading ? (
        <div className="py-20 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto" />
          <p className="mt-3 text-xs text-slate-500">Loading cuts for review...</p>
        </div>
      ) : deliverables.length === 0 ? (
        <div className="py-16 text-center bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 space-y-2">
          <Film className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
            {filterMode === 'pending'
              ? 'No pending cuts waiting for review'
              : filterMode === 'approved'
              ? 'No approved deliverables yet'
              : 'No items currently in revision'}
          </h3>
          <p className="text-xs text-slate-400">
            When your video editor completes a cut and submits it, it appears here ready for approval and publishing.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {deliverables.map((item) => (
            <div
              key={item.id}
              className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                      {item.deliverable_type === 'reel' ? '📱 Short / Reel (9:16)' : '📺 Full Episode (16:9)'}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400">
                      Editor: {item.editor_name}
                    </span>
                    {item.hard_disk_name && (
                      <span className="text-[10px] font-semibold text-slate-400">
                        Via: {item.hard_disk_name}
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    {item.title}
                  </h3>

                  {item.recording_title && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Source Shoot: {item.recording_title}
                    </p>
                  )}
                </div>

                {/* SMM Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Watch Cut Link */}
                  {item.preview_link && (
                    <a
                      href={item.preview_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-blue-50 hover:bg-blue-100 dark:bg-blue-950 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Watch Cut</span>
                    </a>
                  )}

                  {/* Primary CTA: Approve & Post to Social Media */}
                  <button
                    onClick={() => openPublishModal(item)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Approve & Post to Social Media</span>
                  </button>

                  {/* Request Changes CTA */}
                  {filterMode !== 'changes' && (
                    <button
                      onClick={() => {
                        setSelectedItem(item);
                        setRevisionNotes(item.approval_notes || '');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900 text-rose-600 dark:text-rose-400 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Request Revision</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Feedback Notes */}
              {item.approval_notes && (
                <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 text-xs">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Manager Notes: </span>
                  <span className="text-slate-600 dark:text-slate-400">{item.approval_notes}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* UNIFIED SMM PUBLISHING MODAL */}
      {publishingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 dark:text-white text-base">
                    Post to Social Media & Update Proof
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Approve cut and record live published post for team audit.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setPublishingItem(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmPublish} className="p-5 space-y-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Target Deliverable:
                </span>
                <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                  {publishingItem.title}
                </p>
              </div>

              {/* 1. Channel Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Select Channel / Podcast *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {OFFICIAL_CHANNELS.map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setSelectedChannel(ch)}
                      className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all flex items-center gap-2 ${
                        selectedChannel === ch
                          ? 'border-purple-600 bg-purple-500/10 text-purple-600 dark:text-purple-400 ring-2 ring-purple-500/20'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <Radio className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{ch}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Platform Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Select Platform *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPlatform('youtube_shorts')}
                    className={`p-2 rounded-xl border text-center transition-all ${
                      selectedPlatform === 'youtube_shorts'
                        ? 'border-red-500 bg-red-500/10 text-red-600 font-bold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <PlaySquare className="w-4 h-4 mx-auto text-red-600 mb-1" />
                    <span className="text-[10px] block">YT Shorts</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedPlatform('instagram_reels')}
                    className={`p-2 rounded-xl border text-center transition-all ${
                      selectedPlatform === 'instagram_reels'
                        ? 'border-pink-500 bg-pink-500/10 text-pink-600 font-bold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Camera className="w-4 h-4 mx-auto text-pink-600 mb-1" />
                    <span className="text-[10px] block">Instagram</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedPlatform('facebook')}
                    className={`p-2 rounded-xl border text-center transition-all ${
                      selectedPlatform === 'facebook'
                        ? 'border-blue-600 bg-blue-600/10 text-blue-600 font-bold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Share2 className="w-4 h-4 mx-auto text-blue-600 mb-1" />
                    <span className="text-[10px] block">Facebook</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedPlatform('x')}
                    className={`p-2 rounded-xl border text-center transition-all ${
                      selectedPlatform === 'x'
                        ? 'border-slate-800 bg-slate-800/10 text-slate-900 dark:text-white font-bold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <span className="w-4 h-4 mx-auto text-xs font-black block mb-1">𝕏</span>
                    <span className="text-[10px] block">X (Twitter)</span>
                  </button>
                </div>
              </div>

              {/* 3. Live Video Proof URL */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Live Post URL Proof (Required) *</span>
                  <span className="text-[10px] text-emerald-500 font-semibold">Live Link</span>
                </label>
                <input
                  type="url"
                  required
                  value={postUrl}
                  onChange={(e) => setPostUrl(e.target.value)}
                  placeholder="https://youtube.com/shorts/... or https://instagram.com/reel/..."
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* 4. Notes / Caption */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Notes / Caption (optional)
                </label>
                <input
                  type="text"
                  value={publishNotes}
                  onChange={(e) => setPublishNotes(e.target.value)}
                  placeholder="Trending tags, high initial engagement, etc."
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setPublishingItem(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPublishing}
                  className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-xl transition-all shadow-md shadow-emerald-500/20 active:scale-95 disabled:opacity-50"
                >
                  {isPublishing ? 'Publishing...' : 'Confirm Publication & Proof'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REVISION MODAL */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
              Request Corrections from Editor
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Enter specific revision notes for: <strong className="text-slate-800 dark:text-slate-200">{selectedItem.title}</strong>
            </p>

            <form onSubmit={handleRequestChanges} className="space-y-4">
              <textarea
                required
                rows={4}
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                placeholder="e.g. Cut 0:15–0:22 hook needs faster pacing, sound effects volume down by 3dB..."
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNotes}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl shadow-sm transition-all"
                >
                  {isSubmittingNotes ? 'Sending...' : 'Send Revision Notes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notice */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-bold shadow-xl border border-slate-700 flex items-center gap-2 animate-in slide-in-from-bottom duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
