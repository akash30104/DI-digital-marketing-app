import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Deliverable, Recording, PublishingLog } from '../types';
import { filterDeliverables, filterPublishingLogs, filterRecordings } from '../lib/deletionFilter';
import { 
  getClientBrandName, isDeliverableForClient, 
  isRecordingForClient, isPublishingLogForClient 
} from '../lib/clientIsolation';
import { PublishedVideosView } from './PublishedVideosView';
import { 
  PlaySquare, Film, CheckCircle2, Clock, ExternalLink, Share2, 
  Search, MessageSquare, AlertCircle, ThumbsUp, Check, Calendar, 
  Tv, Send, RefreshCw, X, Briefcase, Eye, ChevronRight, Play,
  Radio, ShieldCheck, Globe
} from 'lucide-react';
import { fetchAllChannels, filterChannelsForUser, ChannelItem } from '../lib/channels';

interface ClientPortalProps {
  activeTab: string;
  onNavigateTab: (tab: string) => void;
}

export const ClientPortal: React.FC<ClientPortalProps> = ({ activeTab, onNavigateTab }) => {
  const { currentUser } = useAuth();
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [publishingLogs, setPublishingLogs] = useState<PublishingLog[]>([]);
  const [clientChannels, setClientChannels] = useState<ChannelItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'reel' | 'full_length_video'>('all');

  // Revision Request Modal State
  const [revisionCut, setRevisionCut] = useState<Deliverable | null>(null);
  const [revisionNotes, setRevisionNotes] = useState('');
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const brandName = getClientBrandName(currentUser);

  // Load and isolate data strictly for this client
  const loadClientData = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      const [delivRes, recsRes, logsRes, allChannels] = await Promise.all([
        supabase
          .from('deliverables')
          .select(`
            *,
            recordings (title, episode_number, hard_disk_name, folder_path, notes),
            profiles:assigned_editor_id (full_name)
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('recordings')
          .select('*')
          .order('recording_date', { ascending: false }),
        supabase
          .from('publishing_logs')
          .select(`
            *,
            deliverables:deliverable_id (title, deliverable_type)
          `)
          .order('published_at', { ascending: false }),
        fetchAllChannels()
      ]);

      // 1. Filter recordings belonging to this client
      const rawRecs = recsRes.data ? filterRecordings(recsRes.data) : [];
      const clientRecs = rawRecs.filter(r => isRecordingForClient(r, currentUser));
      const clientRecIds = new Set(clientRecs.map(r => r.id));
      setRecordings(clientRecs);

      // 2. Filter deliverables belonging to this client
      if (delivRes.data) {
        const mapped: Deliverable[] = delivRes.data.map((d: any) => ({
          ...d,
          recording_title: d.recordings?.title,
          episode_number: d.recordings?.episode_number,
          hard_disk_name: d.recordings?.hard_disk_name,
          folder_path: d.recordings?.folder_path,
          editor_name: d.profiles?.full_name || 'Assigned Editor'
        }));
        const cleanDelivs = filterDeliverables(mapped);
        const clientDelivs = cleanDelivs.filter(d => isDeliverableForClient(d, currentUser, clientRecIds));
        setDeliverables(clientDelivs);
      }

      // 3. Filter publishing logs belonging to this client
      if (logsRes.data) {
        const cleanLogs = filterPublishingLogs(logsRes.data as PublishingLog[]);
        const clientDelivIds = new Set(deliverables.map(d => d.id));
        const clientLogs = cleanLogs.filter(l => isPublishingLogForClient(l, currentUser, clientDelivIds));
        setPublishingLogs(clientLogs);
      }

      // 4. Filter channels designated for this client
      if (allChannels) {
        const userChannels = filterChannelsForUser(
          allChannels,
          'client',
          currentUser.id,
          currentUser.full_name
        );
        setClientChannels(userChannels);
      }
    } catch (err) {
      console.error('Error loading client portal data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadClientData();

    // Subscribe to realtime changes on all three tables
    const channel = supabase
      .channel('client-realtime-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliverables' }, () => {
        loadClientData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recordings' }, () => {
        loadClientData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'publishing_logs' }, () => {
        loadClientData();
      })
      .subscribe();

    const handleSync = () => loadClientData();
    window.addEventListener('storage', handleSync);
    window.addEventListener('channels-updated', handleSync);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('channels-updated', handleSync);
    };
  }, [currentUser]);

  // Client Approves Cut
  const handleApproveCut = async (cut: Deliverable) => {
    const clientName = currentUser?.full_name || 'Client';
    const ok = window.confirm(`Approve "${cut.title}"? This greenlights the cut for Social Media Manager publication.`);
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

  // Filtered Deliverables for Editing Process
  const filteredDeliverables = useMemo(() => {
    return deliverables.filter(d => {
      if (typeFilter !== 'all' && d.deliverable_type !== typeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = d.title.toLowerCase().includes(q);
        const matchNotes = (d.approval_notes || '').toLowerCase().includes(q);
        const matchEditor = (d.editor_name || '').toLowerCase().includes(q);
        if (!matchTitle && !matchNotes && !matchEditor) return false;
      }
      return true;
    });
  }, [deliverables, typeFilter, searchQuery]);

  // Counts
  const readyForReviewDeliverables = useMemo(() => {
    return deliverables.filter(
      d => d.editing_status === 'submitted_for_approval' || ((d.progress_percentage || 0) === 100 && d.editing_status !== 'approved')
    );
  }, [deliverables]);

  const approvedDeliverables = useMemo(() => {
    return deliverables.filter(d => d.editing_status === 'approved');
  }, [deliverables]);

  const inEditingDeliverables = useMemo(() => {
    return deliverables.filter(d => d.editing_status !== 'approved' && d.editing_status !== 'submitted_for_approval');
  }, [deliverables]);

  // Overall average progress percentage
  const averageProgress = useMemo(() => {
    if (deliverables.length === 0) return 0;
    const total = deliverables.reduce((acc, d) => acc + (d.progress_percentage || 0), 0);
    return Math.round(total / deliverables.length);
  }, [deliverables]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 bg-white text-black px-4 py-3 rounded-2xl shadow-2xl font-bold text-xs border border-zinc-200 animate-in slide-in-from-top flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-black" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Hero Header */}
      <div className="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-400 bg-zinc-800 px-2.5 py-0.5 rounded-full border border-zinc-700">
                Client Portal
              </span>
              <span className="text-xs font-bold text-zinc-400">
                {brandName || 'Digital Inertia'}
              </span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              Welcome, {currentUser?.full_name || 'Client Partner'}
            </h2>
            <p className="text-xs text-zinc-400 mt-1 max-w-xl">
              Track your video editing progress live, preview finished reels for approval, and watch your published social videos with live insights.
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

        {/* 4 Core Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6 pt-5 border-t border-zinc-800/80">
          <div 
            onClick={() => onNavigateTab('editing')}
            className={`p-3.5 rounded-2xl bg-black border transition-all cursor-pointer ${
              activeTab === 'editing' ? 'border-zinc-500 bg-zinc-950' : 'border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
              <span className="font-bold">1. Editing Process</span>
              <Film className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="text-2xl font-black text-white">{inEditingDeliverables.length} Active</div>
            <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-2">
              <div 
                className="bg-white h-full transition-all duration-500 rounded-full"
                style={{ width: `${averageProgress}%` }}
              />
            </div>
            <p className="text-[10px] text-zinc-500 mt-1.5 font-medium">{averageProgress}% Overall Completed</p>
          </div>

          <div 
            onClick={() => onNavigateTab('published')}
            className={`p-3.5 rounded-2xl bg-black border transition-all cursor-pointer ${
              activeTab === 'published' ? 'border-zinc-500 bg-zinc-950' : 'border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
              <span className="font-bold">2. SMM Published</span>
              <Share2 className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="text-2xl font-black text-white">{publishingLogs.length} Live</div>
            <p className="text-[10px] text-zinc-500 mt-2 font-medium">Reels & videos with live insights</p>
          </div>

          <div 
            onClick={() => onNavigateTab('approvals')}
            className={`p-3.5 rounded-2xl bg-black border transition-all cursor-pointer ${
              activeTab === 'approvals' ? 'border-zinc-500 bg-zinc-950' : 'border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
              <span className="font-bold">3. Approvals</span>
              <Check className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="text-2xl font-black text-white flex items-center gap-2">
              <span>{readyForReviewDeliverables.length} Ready</span>
              {readyForReviewDeliverables.length > 0 && (
                <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
              )}
            </div>
            <p className="text-[10px] text-zinc-500 mt-2 font-medium">Awaiting your greenlight</p>
          </div>

          <div 
            onClick={() => onNavigateTab('settings')}
            className={`p-3.5 rounded-2xl bg-black border transition-all cursor-pointer ${
              activeTab === 'settings' ? 'border-zinc-500 bg-zinc-950' : 'border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
              <span className="font-bold">4. Connected Channels</span>
              <Radio className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="text-2xl font-black text-white flex items-center gap-2">
              <span>{clientChannels.length} Live</span>
              {clientChannels.length > 0 && (
                <span className="w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_8px_#fff]" />
              )}
            </div>
            <p className="text-[10px] text-zinc-500 mt-2 font-medium">Synced publishing endpoints</p>
          </div>
        </div>
      </div>

      {/* 4 Nav Tabs */}
      <div className="flex bg-zinc-900 border border-zinc-800 p-1 rounded-2xl gap-1 overflow-x-auto">
        <button
          onClick={() => onNavigateTab('editing')}
          className={`flex-1 min-w-[130px] py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'editing'
              ? 'bg-white text-black font-black shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Film className="w-4 h-4" />
          <span>Editing Videos ({deliverables.length})</span>
        </button>

        <button
          onClick={() => onNavigateTab('published')}
          className={`flex-1 min-w-[130px] py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'published'
              ? 'bg-white text-black font-black shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Share2 className="w-4 h-4" />
          <span>Published ({publishingLogs.length})</span>
        </button>

        <button
          onClick={() => onNavigateTab('approvals')}
          className={`flex-1 min-w-[130px] py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'approvals'
              ? 'bg-white text-black font-black shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Approvals ({readyForReviewDeliverables.length})</span>
        </button>

        <button
          onClick={() => onNavigateTab('settings')}
          className={`flex-1 min-w-[130px] py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'settings'
              ? 'bg-white text-black font-black shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>Connected Channels ({clientChannels.length})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 1. EDITING VIDEOS PROCESS TAB                                             */}
      {/* ========================================================================= */}
      {activeTab === 'editing' && (
        <div className="space-y-4">
          {/* Controls: Search and Format Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search your video deliverables..."
                className="w-full pl-10 pr-4 py-2 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setTypeFilter('all')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                  typeFilter === 'all' ? 'bg-white text-black font-black' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                }`}
              >
                All Formats
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
                Full Episodes
              </button>
            </div>
          </div>

          {/* Deliverables List */}
          {isLoading ? (
            <div className="text-center py-16">
              <div className="w-8 h-8 border-2 border-zinc-700 border-t-white rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-zinc-500">Loading your video editing pipeline...</p>
            </div>
          ) : filteredDeliverables.length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-zinc-900 border border-zinc-800">
              <Film className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-white">No video edits currently recorded</h3>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                When your team adds footage or starts editing podcast reels for {brandName || 'your brand'}, they will update right here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredDeliverables.map((del) => {
                const progress = del.progress_percentage || 0;
                const isApproved = del.editing_status === 'approved';
                const isReady = del.editing_status === 'submitted_for_approval' || progress === 100;
                const previewLink = del.final_video_link || del.preview_link;

                return (
                  <div
                    key={del.id}
                    className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-sm hover:border-zinc-700 transition-all space-y-3.5"
                  >
                    {/* Header: Format and Status */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-black border border-zinc-800 text-zinc-300 flex items-center gap-1">
                        {del.deliverable_type === 'reel' ? (
                          <>
                            <PlaySquare className="w-3 h-3 text-white" />
                            <span>Vertical Reel (9:16)</span>
                          </>
                        ) : (
                          <>
                            <Tv className="w-3 h-3 text-white" />
                            <span>Full Episode (16:9)</span>
                          </>
                        )}
                      </span>

                      {/* Status pill */}
                      {isApproved ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-zinc-800 border border-zinc-700 text-white flex items-center gap-1">
                          <Check className="w-3 h-3 text-white" />
                          <span>Approved</span>
                        </span>
                      ) : isReady ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-white text-black flex items-center gap-1 shadow-sm">
                          <Eye className="w-3 h-3" />
                          <span>Ready for Review</span>
                        </span>
                      ) : del.editing_status === 'changes_requested' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-zinc-800 border border-zinc-700 text-white flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-white" />
                          <span>Changes in Progress</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 border border-zinc-700 text-zinc-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>In Editing</span>
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <div>
                      <h4 className="font-bold text-white text-base leading-snug">
                        {del.title}
                      </h4>
                      {del.recording_title && (
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Shoot: {del.recording_title}
                        </p>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400 text-[11px] font-semibold">Editing Progress</span>
                        <span className="font-black text-white">{progress}% Done</span>
                      </div>
                      <div className="w-full bg-black h-2 rounded-full overflow-hidden border border-zinc-800">
                        <div
                          className="bg-white h-full transition-all duration-500 rounded-full"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Metadata: Editor & Deadline */}
                    <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-2 border-t border-zinc-800/80">
                      <span>Editor: <strong className="text-zinc-200">{del.editor_name || 'Assigned'}</strong></span>
                      {del.deadline && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>Due: {del.deadline}</span>
                        </span>
                      )}
                    </div>

                    {/* Preview / Review Actions */}
                    <div className="flex items-center justify-between gap-2 pt-2">
                      {previewLink ? (
                        <a
                          href={previewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <Play className="w-3 h-3 text-white" />
                          <span>Watch Preview</span>
                        </a>
                      ) : (
                        <span className="text-[11px] text-zinc-500 italic">
                          Editor cut uploading soon
                        </span>
                      )}

                      {isReady && !isApproved && (
                        <button
                          onClick={() => onNavigateTab('approvals')}
                          className="px-3 py-1.5 rounded-xl bg-white text-black font-black text-xs hover:bg-zinc-200 transition-colors flex items-center gap-1"
                        >
                          <span>Review Cut</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SMM PUBLISHING VIDEOS TAB                                              */}
      {/* ========================================================================= */}
      {activeTab === 'published' && (
        <PublishedVideosView client={currentUser} canEditInsights={false} />
      )}

      {/* ========================================================================= */}
      {/* 3. APPROVALS TAB                                                         */}
      {/* ========================================================================= */}
      {activeTab === 'approvals' && (
        <div className="space-y-6">
          <div className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-white">Client Review &amp; Approvals</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Review completed video cuts before they are published to your channels.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full bg-black border border-zinc-700 text-xs font-black text-white">
              {readyForReviewDeliverables.length} Pending Approval
            </span>
          </div>

          {readyForReviewDeliverables.length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-zinc-900 border border-zinc-800">
              <CheckCircle2 className="w-10 h-10 text-white mx-auto mb-2" />
              <h3 className="text-sm font-bold text-white">All caught up!</h3>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                No video cuts are currently pending your approval. As soon as your editor submits a new cut, it will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {readyForReviewDeliverables.map((cut) => {
                const previewLink = cut.final_video_link || cut.preview_link;

                return (
                  <div
                    key={cut.id}
                    className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-md space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-black border border-zinc-800 text-zinc-300">
                        {cut.deliverable_type === 'reel' ? 'Vertical Reel (9:16)' : 'Full Episode (16:9)'}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-white text-black">
                        100% Ready
                      </span>
                    </div>

                    <h4 className="font-bold text-white text-base">
                      {cut.title}
                    </h4>

                    {previewLink && (
                      <div className="p-3 rounded-2xl bg-black border border-zinc-800 flex items-center justify-between">
                        <span className="text-xs text-zinc-300 font-bold truncate max-w-[200px]">
                          Preview Cut Available
                        </span>
                        <a
                          href={previewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold flex items-center gap-1 transition-colors"
                        >
                          <Play className="w-3 h-3" />
                          <span>Watch Cut</span>
                          <ExternalLink className="w-3 h-3 ml-0.5" />
                        </a>
                      </div>
                    )}

                    {cut.approval_notes && (
                      <div className="p-3 rounded-2xl bg-black/60 border border-zinc-800 text-xs text-zinc-400">
                        <strong className="text-zinc-300">Notes: </strong>
                        {cut.approval_notes}
                      </div>
                    )}

                    {/* Action Buttons: Approve vs Request Revision */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800/80">
                      <button
                        onClick={() => {
                          setRevisionCut(cut);
                          setRevisionNotes('');
                        }}
                        className="py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors border border-zinc-700"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Request Revision</span>
                      </button>

                      <button
                        onClick={() => handleApproveCut(cut)}
                        className="py-2.5 px-3 rounded-xl bg-white hover:bg-zinc-200 text-black font-black text-xs flex items-center justify-center gap-1.5 transition-colors shadow-md"
                      >
                        <Check className="w-4 h-4" />
                        <span>Approve Cut</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Approved History */}
          {approvedDeliverables.length > 0 && (
            <div className="space-y-3 pt-4">
              <h4 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
                Greenlit &amp; Approved History ({approvedDeliverables.length})
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {approvedDeliverables.map(del => (
                  <div key={del.id} className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
                    <div>
                      <h5 className="text-xs font-bold text-white truncate max-w-xs">{del.title}</h5>
                      <span className="text-[10px] text-zinc-500">Greenlit for publication</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-white text-[10px] font-black flex items-center gap-1">
                      <Check className="w-3 h-3 text-white" />
                      <span>Approved</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. CONNECTED CHANNELS TAB                                                 */}
      {/* ========================================================================= */}
      {activeTab === 'settings' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Radio className="w-5 h-5 text-white" />
                <h3 className="text-lg font-black text-white">Your Connected Social Channels</h3>
              </div>
              <p className="text-xs text-zinc-400">
                Official media channels and podcast brand destinations connected for {brandName}.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3.5 py-1.5 rounded-full bg-zinc-800 border border-zinc-700 text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-white" />
                <span>Verified Endpoints ({clientChannels.length})</span>
              </span>
            </div>
          </div>

          {clientChannels.length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
                <Radio className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">No custom channels connected yet</h3>
              <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                Your dedicated Social Media Manager or Studio Founder will connect and verify your official YouTube, Instagram, or Podcast channels here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {clientChannels.map(ch => (
                <div 
                  key={ch.id}
                  className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition shadow-md space-y-3 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-2xl bg-black border border-zinc-800 flex items-center justify-center text-white">
                        <Radio className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-sm group-hover:text-zinc-200 transition">
                          {ch.name}
                        </h4>
                        <span className="text-[11px] text-zinc-400">
                          {ch.client_name ? `Client Brand: ${ch.client_name}` : 'Dedicated Brand Channel'}
                        </span>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-white text-black flex items-center gap-1 shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                      <span>Live &amp; Synced</span>
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-black border border-zinc-800/80 text-[11px] text-zinc-400 flex items-center justify-between">
                    <span>Managed By:</span>
                    <strong className="text-white font-semibold">Studio SMM Lead &amp; Founder</strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Revision Request Modal */}
      {revisionCut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-base font-black text-white">Request Video Edit Revision</h3>
                <p className="text-xs text-zinc-400 truncate max-w-sm">{revisionCut.title}</p>
              </div>
              <button
                onClick={() => setRevisionCut(null)}
                className="p-1 rounded-full text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitRevision} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  Describe what adjustments the editor should make:
                </label>
                <textarea
                  required
                  rows={4}
                  value={revisionNotes}
                  onChange={(e) => setRevisionNotes(e.target.value)}
                  placeholder="e.g. Please trim the intro by 3 seconds, adjust the subtitle placement, and boost the background music volume..."
                  className="w-full p-3.5 rounded-2xl bg-black border border-zinc-800 text-white text-xs focus:outline-none focus:border-zinc-500 placeholder-zinc-600 transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRevisionCut(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRevision}
                  className="px-5 py-2.5 rounded-xl bg-white text-black font-black text-xs hover:bg-zinc-200 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmittingRevision ? 'Sending...' : 'Send to Editor'}
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
