import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Deliverable, Recording, PublishingLog } from '../types';
import { filterDeliverables, filterPublishingLogs } from '../lib/deletionFilter';
import { 
  PlaySquare, Film, CheckCircle2, Clock, ExternalLink, Share2, 
  Search, MessageSquare, AlertCircle, ThumbsUp, Check, Calendar, 
  Tv, Camera, Send, RefreshCw, X, Briefcase, Eye, ChevronRight
} from 'lucide-react';

interface ClientPortalProps {
  activeTab: string;
  onNavigateTab: (tab: string) => void;
}

export const ClientPortal: React.FC<ClientPortalProps> = ({ activeTab, onNavigateTab }) => {
  const { currentUser } = useAuth();
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [publishingLogs, setPublishingLogs] = useState<PublishingLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'reel' | 'full_length_video'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready_for_review' | 'approved' | 'in_progress'>('all');

  // Revision Request Modal State
  const [revisionCut, setRevisionCut] = useState<Deliverable | null>(null);
  const [revisionNotes, setRevisionNotes] = useState('');
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadClientData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Deliverables
      const { data: dels } = await supabase
        .from('deliverables')
        .select('*')
        .order('created_at', { ascending: false });

      if (dels) {
        setDeliverables(filterDeliverables(dels as Deliverable[]));
      }

      // 2. Fetch Recordings (Shows / Shoots)
      const { data: recs } = await supabase
        .from('recordings')
        .select('*')
        .order('recording_date', { ascending: false });

      if (recs) {
        setRecordings(recs as Recording[]);
      }

      // 3. Fetch Publishing Logs
      const { data: logs } = await supabase
        .from('publishing_logs')
        .select(`
          *,
          deliverables:deliverable_id (title, deliverable_type)
        `)
        .order('published_at', { ascending: false })
        .limit(60);

      if (logs) {
        setPublishingLogs(filterPublishingLogs(logs as PublishingLog[]));
      }
    } catch (err) {
      console.error('Error loading client portal data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadClientData();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('client-portal-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliverables' }, () => loadClientData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'publishing_logs' }, () => loadClientData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Client Approves Cut
  const handleApproveCut = async (cut: Deliverable) => {
    const clientName = currentUser?.full_name || 'Client';
    const ok = window.confirm(`Approve "${cut.title}"? This signals to the production team that the cut is approved for publishing.`);
    if (!ok) return;

    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('deliverables')
        .update({
          editing_status: 'approved',
          approval_notes: `Client Approved by ${clientName} on ${new Date().toLocaleDateString()}`,
          updated_at: now
        })
        .eq('id', cut.id);

      if (error) throw error;
      showToast(`🎉 "${cut.title}" marked as Approved!`);
      loadClientData();
    } catch (e: any) {
      alert(`Approval error: ${e.message}`);
    }
  };

  // Client Submits Revision Request
  const handleSubmitRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revisionCut) return;
    if (!revisionNotes.trim()) {
      alert('Please explain the adjustments you would like the editor to make.');
      return;
    }

    setIsSubmittingRevision(true);
    const clientName = currentUser?.full_name || 'Client';

    try {
      const now = new Date().toISOString();
      const formattedNotes = `Client Revision Request (${clientName}): ${revisionNotes.trim()}`;

      const { error } = await supabase
        .from('deliverables')
        .update({
          editing_status: 'changes_requested',
          approval_notes: formattedNotes,
          updated_at: now
        })
        .eq('id', revisionCut.id);

      if (error) throw error;

      showToast(`Feedback submitted! Editor notified for "${revisionCut.title}".`);
      setRevisionCut(null);
      setRevisionNotes('');
      loadClientData();
    } catch (e: any) {
      alert(`Failed to submit revision: ${e.message}`);
    } finally {
      setIsSubmittingRevision(false);
    }
  };

  // Filtered Deliverables
  const filteredDeliverables = deliverables.filter(d => {
    if (typeFilter !== 'all' && d.deliverable_type !== typeFilter) return false;
    if (statusFilter === 'ready_for_review') {
      if (d.editing_status !== 'submitted_for_approval' && (d.progress_percentage || 0) < 100) return false;
    } else if (statusFilter === 'approved') {
      if (d.editing_status !== 'approved') return false;
    } else if (statusFilter === 'in_progress') {
      if (d.editing_status === 'approved' || d.editing_status === 'submitted_for_approval') return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = d.title.toLowerCase().includes(q);
      const matchNotes = (d.approval_notes || '').toLowerCase().includes(q);
      if (!matchTitle && !matchNotes) return false;
    }
    return true;
  });

  const readyForReviewCount = deliverables.filter(
    d => d.editing_status === 'submitted_for_approval' || ((d.progress_percentage || 0) === 100 && d.editing_status !== 'approved')
  ).length;

  const approvedCount = deliverables.filter(d => d.editing_status === 'approved').length;
  const inEditingCount = deliverables.filter(d => d.editing_status !== 'approved' && d.editing_status !== 'submitted_for_approval').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 bg-white text-black px-4 py-3 rounded-2xl shadow-2xl font-bold text-xs border border-zinc-200 animate-in slide-in-from-top flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-black" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Hero Welcome Header */}
      <div className="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-400 bg-zinc-800 px-2.5 py-0.5 rounded-full border border-zinc-700">
                Client Partner Portal
              </span>
              <span className="text-xs text-zinc-400">
                Digital Inertia Studio
              </span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              Welcome, {currentUser?.full_name || 'Client Partner'}
            </h2>
            <p className="text-xs text-zinc-400 mt-1 max-w-xl">
              Preview your latest podcast cuts, approve finished reels, submit edit revisions directly to the editing room, and view live published content.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={loadClientData}
              className="p-2.5 rounded-2xl bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white transition-all active:scale-95"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Client KPI Overview Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-zinc-800/80">
          <div 
            onClick={() => { onNavigateTab('cuts'); setStatusFilter('ready_for_review'); }}
            className="p-3.5 rounded-2xl bg-black border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-all"
          >
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
              <span>Ready for Review</span>
              <Eye className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="text-2xl font-black text-white">{readyForReviewCount}</div>
            <p className="text-[10px] text-zinc-400 mt-0.5 font-medium">Awaiting your approval</p>
          </div>

          <div 
            onClick={() => { onNavigateTab('cuts'); setStatusFilter('approved'); }}
            className="p-3.5 rounded-2xl bg-black border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-all"
          >
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
              <span>Approved Cuts</span>
              <Check className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="text-2xl font-black text-white">{approvedCount}</div>
            <p className="text-[10px] text-zinc-400 mt-0.5 font-medium">Greenlit for publication</p>
          </div>

          <div 
            onClick={() => onNavigateTab('published')}
            className="p-3.5 rounded-2xl bg-black border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-all"
          >
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
              <span>Published Live</span>
              <Share2 className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="text-2xl font-black text-white">{publishingLogs.length}</div>
            <p className="text-[10px] text-zinc-400 mt-0.5 font-medium">Live on YT, IG, X, FB</p>
          </div>

          <div 
            onClick={() => onNavigateTab('shows')}
            className="p-3.5 rounded-2xl bg-black border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-all"
          >
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
              <span>Recorded Shoots</span>
              <Film className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="text-2xl font-black text-white">{recordings.length}</div>
            <p className="text-[10px] text-zinc-400 mt-0.5 font-medium">Podcasts on file</p>
          </div>
        </div>
      </div>

      {/* Sub-Tab Navigation Pills */}
      <div className="flex bg-zinc-900 border border-zinc-800 p-1 rounded-2xl gap-1">
        <button
          onClick={() => onNavigateTab('cuts')}
          className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'cuts'
              ? 'bg-white text-black font-black shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <PlaySquare className="w-4 h-4" />
          <span>Cuts & Review ({deliverables.length})</span>
        </button>

        <button
          onClick={() => onNavigateTab('published')}
          className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'published'
              ? 'bg-white text-black font-black shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Share2 className="w-4 h-4" />
          <span>Published Live ({publishingLogs.length})</span>
        </button>

        <button
          onClick={() => onNavigateTab('shows')}
          className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'shows'
              ? 'bg-white text-black font-black shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Film className="w-4 h-4" />
          <span>Podcast Shoots ({recordings.length})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: CUTS & REVIEW TAB                                             */}
      {/* ========================================================================= */}
      {activeTab === 'cuts' && (
        <div className="space-y-4">
          {/* Controls: Search and Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search cuts by title..."
                className="w-full pl-10 pr-4 py-2 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <span className="text-[10px] font-bold text-zinc-500 uppercase mr-1">Type:</span>
              <button
                onClick={() => setTypeFilter('all')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                  typeFilter === 'all' ? 'bg-white text-black font-black' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setTypeFilter('reel')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                  typeFilter === 'reel' ? 'bg-white text-black font-black' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                }`}
              >
                Reels (9:16)
              </button>
              <button
                onClick={() => setTypeFilter('full_length_video')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                  typeFilter === 'full_length_video' ? 'bg-white text-black font-black' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                }`}
              >
                Full Episode
              </button>
            </div>
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-full font-bold transition-all ${
                statusFilter === 'all' ? 'bg-zinc-800 text-white border border-zinc-600' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              All Statuses ({deliverables.length})
            </button>
            <button
              onClick={() => setStatusFilter('ready_for_review')}
              className={`px-3 py-1 rounded-full font-bold transition-all flex items-center gap-1.5 ${
                statusFilter === 'ready_for_review' ? 'bg-zinc-800 text-white border border-zinc-600' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <span>Awaiting Your Review</span>
              {readyForReviewCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-white text-black text-[10px] font-black flex items-center justify-center">
                  {readyForReviewCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setStatusFilter('in_progress')}
              className={`px-3 py-1 rounded-full font-bold transition-all ${
                statusFilter === 'in_progress' ? 'bg-zinc-800 text-white border border-zinc-600' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              In Editing ({inEditingCount})
            </button>
            <button
              onClick={() => setStatusFilter('approved')}
              className={`px-3 py-1 rounded-full font-bold transition-all ${
                statusFilter === 'approved' ? 'bg-zinc-800 text-white border border-zinc-600' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Approved ({approvedCount})
            </button>
          </div>

          {/* Cuts Grid */}
          {isLoading ? (
            <div className="text-center py-16">
              <div className="w-8 h-8 border-2 border-zinc-700 border-t-white rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-zinc-500">Loading your deliverables...</p>
            </div>
          ) : filteredDeliverables.length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-zinc-900 border border-zinc-800">
              <PlaySquare className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-white">No video cuts match this view</h3>
              <p className="text-xs text-zinc-500 mt-1">
                Your video editor will upload cut previews here as episodes are produced.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredDeliverables.map((cut) => {
                const isReadyForReview = cut.editing_status === 'submitted_for_approval' || (cut.progress_percentage || 0) === 100;
                const isApproved = cut.editing_status === 'approved';
                const hasChangesRequested = cut.editing_status === 'changes_requested';
                const previewLink = cut.final_video_link || cut.preview_link;

                return (
                  <div
                    key={cut.id}
                    className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-md hover:border-zinc-700 transition-all space-y-4"
                  >
                    {/* Top Row: Type and Status */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-black border border-zinc-800 text-zinc-300 flex items-center gap-1">
                        {cut.deliverable_type === 'reel' ? (
                          <>
                            <PlaySquare className="w-3 h-3 text-white" />
                            <span>Short / Reel (9:16)</span>
                          </>
                        ) : (
                          <>
                            <Tv className="w-3 h-3 text-white" />
                            <span>Full Episode Video</span>
                          </>
                        )}
                      </span>

                      {/* Status Badges */}
                      {isApproved ? (
                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-white text-black flex items-center gap-1 shadow-sm">
                          <Check className="w-3 h-3 text-black" />
                          <span>Approved</span>
                        </span>
                      ) : isReadyForReview ? (
                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-zinc-800 text-white border border-zinc-700 flex items-center gap-1 animate-pulse">
                          <Eye className="w-3 h-3 text-white" />
                          <span>Ready for Review</span>
                        </span>
                      ) : hasChangesRequested ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-zinc-400" />
                          <span>Revisions in Progress</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-black border border-zinc-800 text-zinc-400">
                          Editing In Progress
                        </span>
                      )}
                    </div>

                    {/* Cut Title & Progress */}
                    <div>
                      <h4 className="font-black text-white text-base">
                        {cut.title}
                      </h4>
                      <div className="flex items-center justify-between mt-1 text-xs text-zinc-400">
                        <span>Production Progress:</span>
                        <span className="font-bold text-white text-xs">
                          {cut.progress_percentage || 0}% Complete
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full bg-black h-2 rounded-full overflow-hidden mt-1.5 border border-zinc-800">
                        <div
                          className="bg-white h-full rounded-full transition-all duration-300"
                          style={{ width: `${cut.progress_percentage || 0}%` }}
                        />
                      </div>
                    </div>

                    {/* Notes / Feedback */}
                    {cut.approval_notes && (
                      <div className="p-3 rounded-2xl bg-black border border-zinc-800 text-xs space-y-1">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase block">
                          Review Notes:
                        </span>
                        <p className="text-zinc-300 font-medium">
                          {cut.approval_notes}
                        </p>
                      </div>
                    )}

                    {/* Actions Row */}
                    <div className="pt-2 border-t border-zinc-800 flex items-center justify-between gap-2 flex-wrap">
                      {/* Watch Preview Link */}
                      {previewLink ? (
                        <a
                          href={previewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 transition-all active:scale-95"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-zinc-300" />
                          <span>Watch Google Drive Cut ↗</span>
                        </a>
                      ) : (
                        <span className="text-xs text-zinc-500 italic">
                          Cut preview uploading soon
                        </span>
                      )}

                      {/* Client Approvals / Request Changes */}
                      <div className="flex items-center gap-2">
                        {!isApproved && (
                          <button
                            type="button"
                            onClick={() => {
                              setRevisionCut(cut);
                              setRevisionNotes('');
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 transition-all active:scale-95"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Request Revision</span>
                          </button>
                        )}

                        {!isApproved && (
                          <button
                            type="button"
                            onClick={() => handleApproveCut(cut)}
                            className="inline-flex items-center gap-1 px-4 py-1.5 rounded-full text-xs font-black bg-white text-black hover:bg-zinc-200 transition-all active:scale-95 shadow-md"
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                            <span>Approve Cut 👍</span>
                          </button>
                        )}

                        {isApproved && (
                          <span className="text-xs font-bold text-white bg-zinc-800 px-3 py-1 rounded-full border border-zinc-700 flex items-center gap-1">
                            <Check className="w-3 h-3 text-white" />
                            <span>Approved by You</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: PUBLISHED LIVE VIDEOS TAB                                     */}
      {/* ========================================================================= */}
      {activeTab === 'published' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">Live Published Videos ({publishingLogs.length})</h3>
              <p className="text-xs text-zinc-400">Direct links to your verified social media publications.</p>
            </div>
          </div>

          {publishingLogs.length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-zinc-900 border border-zinc-800">
              <Share2 className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-white">No published videos logged yet</h3>
              <p className="text-xs text-zinc-500 mt-1">
                When the Social Media Manager publishes your reels and episodes, links will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {publishingLogs.map((log: any) => {
                const title = log.deliverables?.title || log.notes?.split('\n')[0] || 'Published Video';

                return (
                  <div
                    key={log.id}
                    className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-sm flex items-center justify-between gap-3 hover:border-zinc-700 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                        {log.platform === 'youtube_shorts' && <PlaySquare className="w-5 h-5 text-white" />}
                        {log.platform === 'youtube_full' && <Tv className="w-5 h-5 text-white" />}
                        {log.platform === 'instagram_reels' && <Camera className="w-5 h-5 text-white" />}
                        {log.platform === 'facebook' && <Send className="w-5 h-5 text-white" />}
                        {log.platform === 'x' && <span className="font-black text-white text-base">𝕏</span>}
                      </div>

                      <div className="min-w-0">
                        <h4 className="font-black text-white text-sm truncate">
                          {title}
                        </h4>
                        <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-0.5">
                          <span className="uppercase font-bold tracking-wider">
                            {log.platform.replace('_', ' ')}
                          </span>
                          <span>•</span>
                          <span>{log.reporting_date || new Date(log.published_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    {log.post_url ? (
                      <a
                        href={log.post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-full text-xs font-bold bg-white text-black hover:bg-zinc-200 transition-all shadow-sm flex items-center gap-1 shrink-0"
                      >
                        <span>View Live</span>
                        <ExternalLink className="w-3 h-3 text-black" />
                      </a>
                    ) : (
                      <span className="text-[10px] text-zinc-500 italic">Posted</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: PODCAST SHOOTS & EPISODES TAB                                */}
      {/* ========================================================================= */}
      {activeTab === 'shows' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
            <h3 className="text-sm font-bold text-white">Recorded Podcast Shoots ({recordings.length})</h3>
            <p className="text-xs text-zinc-400">Master raw footage records and delivery timelines.</p>
          </div>

          {recordings.length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-zinc-900 border border-zinc-800">
              <Film className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-white">No podcast shoots registered yet</h3>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recordings.map((rec) => {
                const recDeliverables = deliverables.filter(d => d.recording_id === rec.id);
                const recReels = recDeliverables.filter(d => d.deliverable_type === 'reel');
                const recFull = recDeliverables.filter(d => d.deliverable_type === 'full_length_video');
                const approvedCount = recDeliverables.filter(d => d.editing_status === 'approved').length;

                return (
                  <div
                    key={rec.id}
                    className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-md space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-black text-white text-base">
                          {rec.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-1 text-xs text-zinc-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-zinc-500" />
                            Shot: {rec.recording_date}
                          </span>
                        </div>
                      </div>

                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                        {recDeliverables.length} Deliverables
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-black border border-zinc-800 grid grid-cols-3 gap-2 text-center text-xs">
                      <div>
                        <span className="text-[10px] text-zinc-500 uppercase block font-bold">Reels</span>
                        <span className="font-black text-white text-sm">{recReels.length}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 uppercase block font-bold">Full Video</span>
                        <span className="font-black text-white text-sm">{recFull.length}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 uppercase block font-bold">Approved</span>
                        <span className="font-black text-white text-sm">{approvedCount}</span>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-between text-xs">
                      <button
                        onClick={() => {
                          setSearchQuery(rec.title);
                          onNavigateTab('cuts');
                        }}
                        className="text-xs font-bold text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
                      >
                        <span>View Episode Cuts</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* REVISION REQUEST MODAL                                                   */}
      {/* ========================================================================= */}
      {revisionCut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-800 overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-zinc-800 border border-zinc-700 text-white flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">
                    Client Feedback
                  </span>
                  <h3 className="font-black text-white text-base">
                    Request Cut Revision
                  </h3>
                </div>
              </div>

              <button
                onClick={() => setRevisionCut(null)}
                className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitRevision} className="p-5 space-y-4">
              <div className="p-3 rounded-2xl bg-black border border-zinc-800 text-xs">
                <span className="text-[10px] font-bold text-zinc-500 uppercase block mb-0.5">
                  Target Cut:
                </span>
                <span className="font-black text-white text-sm">
                  {revisionCut.title}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  What changes or revisions would you like?
                </label>
                <textarea
                  rows={4}
                  required
                  value={revisionNotes}
                  onChange={(e) => setRevisionNotes(e.target.value)}
                  placeholder="e.g. Please trim the first 3 seconds, add captions in the middle, or swap the background music..."
                  className="w-full p-3.5 text-xs rounded-2xl bg-black border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-all resize-none"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  The assigned video editor will receive this feedback and update the cut.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRevisionCut(null)}
                  className="px-4 py-2 rounded-full text-xs font-bold text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRevision}
                  className="px-5 py-2 rounded-full text-xs font-black bg-white text-black hover:bg-zinc-200 transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                  {isSubmittingRevision ? 'Submitting...' : 'Send Revision Request 🚀'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
