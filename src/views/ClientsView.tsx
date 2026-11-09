import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Deliverable, Recording, PublishingLog, Profile } from '../types';
import { filterDeliverables, filterPublishingLogs, filterRecordings } from '../lib/deletionFilter';
import { 
  Briefcase, Film, CheckCircle2, Clock, ExternalLink, Search, 
  RefreshCw, User, Tv, Plus, Calendar, HardDrive, Folder, 
  MessageSquare, ChevronRight, X, Sparkles, AlertCircle, Share2
} from 'lucide-react';

export const ClientsView: React.FC = () => {
  const { currentUser, role } = useAuth();
  const isFounder = role === 'founder';
  const isSMM = role === 'social_media_manager';

  const [clients, setClients] = useState<Profile[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [publishingLogs, setPublishingLogs] = useState<PublishingLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Selected Client Filter ('all' or clientId)
  const [selectedClientId, setSelectedClientId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [workTypeFilter, setWorkTypeFilter] = useState<'all' | 'shoots' | 'reels' | 'full' | 'published'>('all');

  // Modal to add/link work to a client
  const [showAddWorkModal, setShowAddWorkModal] = useState(false);
  const [newShootTitle, setNewShootTitle] = useState('');
  const [newReelCount, setNewReelCount] = useState(3);
  const [newShootDate, setNewShootDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [targetClientId, setTargetClientId] = useState('');
  const [isCreatingWork, setIsCreatingWork] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [profilesRes, recsRes, delivRes, logsRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('recordings').select('*').order('recording_date', { ascending: false }),
        supabase.from('deliverables').select(`
          *,
          recordings (title, episode_number, hard_disk_name, folder_path),
          profiles:assigned_editor_id (full_name)
        `).order('created_at', { ascending: false }),
        supabase.from('publishing_logs').select(`
          *,
          deliverables:deliverable_id (title, deliverable_type)
        `).order('published_at', { ascending: false })
      ]);

      if (profilesRes.data) {
        // Filter profiles where role === 'client' OR full_name contains brand indicator '(Brand)'
        const clientProfiles = profilesRes.data.filter(p => 
          p.role === 'client' || (p.full_name && p.full_name.includes('(') && p.role !== 'founder')
        );
        setClients(clientProfiles);
      }

      if (recsRes.data) {
        setRecordings(filterRecordings(recsRes.data));
      }

      if (delivRes.data) {
        const mapped: Deliverable[] = delivRes.data.map((d: any) => ({
          ...d,
          recording_title: d.recordings?.title,
          episode_number: d.recordings?.episode_number,
          hard_disk_name: d.recordings?.hard_disk_name,
          folder_path: d.recordings?.folder_path,
          editor_name: d.profiles?.full_name || 'Unassigned'
        }));
        setDeliverables(filterDeliverables(mapped));
      }

      if (logsRes.data) {
        setPublishingLogs(filterPublishingLogs(logsRes.data));
      }
    } catch (err) {
      console.error('Failed to load clients data:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();

    const pSub = supabase
      .channel('clients-view-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadData())
      .subscribe();

    const dSub = supabase
      .channel('clients-view-deliverables')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliverables' }, () => loadData())
      .subscribe();

    return () => {
      supabase.removeChannel(pSub);
      supabase.removeChannel(dSub);
    };
  }, []);

  // Helper to extract brand name from client full_name e.g. "AK (LLBS)" -> "LLBS"
  const getClientBrandName = (client: Profile): string => {
    if (!client.full_name) return 'Brand Client';
    const match = client.full_name.match(/\(([^)]+)\)/);
    if (match && match[1]) {
      return match[1].trim();
    }
    return client.full_name;
  };

  // Helper to match a deliverable or recording to a client
  const isWorkForClient = (title: string = '', notes: string = '', client: Profile): boolean => {
    const brand = getClientBrandName(client).toLowerCase();
    const clientName = (client.full_name || '').toLowerCase();
    const cleanTitle = title.toLowerCase();
    const cleanNotes = notes.toLowerCase();

    if (brand && (cleanTitle.includes(brand) || cleanNotes.includes(brand))) {
      return true;
    }
    if (clientName && (cleanTitle.includes(clientName) || cleanNotes.includes(clientName))) {
      return true;
    }
    if (cleanNotes.includes(`[client: ${client.id}]`)) {
      return true;
    }
    return false;
  };

  // Client summaries calculation
  const clientSummaries = useMemo(() => {
    return clients.map(client => {
      const brand = getClientBrandName(client);

      const clientRecs = recordings.filter(r => isWorkForClient(r.title, r.notes || '', client));
      const clientRecIds = new Set(clientRecs.map(r => r.id));

      const clientDelivs = deliverables.filter(d => 
        clientRecIds.has(d.recording_id) || 
        isWorkForClient(d.title, `${d.approval_notes || ''} ${d.description || ''}`, client)
      );

      const reels = clientDelivs.filter(d => d.deliverable_type === 'reel');
      const fullVideos = clientDelivs.filter(d => d.deliverable_type === 'full_length_video');
      const completedCuts = clientDelivs.filter(d => 
        (d.progress_percentage || 0) === 100 || d.editing_status === 'approved'
      );

      const clientDelivIds = new Set(clientDelivs.map(d => d.id));
      const clientLogs = publishingLogs.filter(log => 
        (log.deliverable_id && clientDelivIds.has(log.deliverable_id)) ||
        isWorkForClient(log.channel_name || '', log.notes || '', client)
      );

      const totalProgress = clientDelivs.reduce((acc, d) => acc + (d.progress_percentage || 0), 0);
      const avgProgress = clientDelivs.length > 0 ? Math.round(totalProgress / clientDelivs.length) : 0;

      return {
        client,
        brand,
        recordings: clientRecs,
        deliverables: clientDelivs,
        reels,
        fullVideos,
        completedCuts,
        publishingLogs: clientLogs,
        avgProgress
      };
    });
  }, [clients, recordings, deliverables, publishingLogs]);

  // Selected client summary
  const selectedSummary = useMemo(() => {
    if (selectedClientId === 'all') return null;
    return clientSummaries.find(cs => cs.client.id === selectedClientId) || null;
  }, [clientSummaries, selectedClientId]);

  // Handle Quick Create Shoot & Reels for this client
  const handleCreateClientWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShootTitle.trim() || !currentUser) return;
    setIsCreatingWork(true);

    try {
      const targetClient = clients.find(c => c.id === targetClientId) || selectedSummary?.client;
      const brandName = targetClient ? getClientBrandName(targetClient) : '';
      const fullShootTitle = brandName && !newShootTitle.toLowerCase().includes(brandName.toLowerCase())
        ? `${brandName} - ${newShootTitle.trim()}`
        : newShootTitle.trim();

      // 1. Insert Recording
      const { data: recData, error: recError } = await supabase
        .from('recordings')
        .insert([{
          title: fullShootTitle,
          recording_date: newShootDate,
          date_received: newShootDate,
          hard_disk_name: 'Cloud / Studio Drives',
          folder_path: `/clients/${brandName.toLowerCase().replace(/\s+/g, '-') || 'general'}`,
          notes: `[Client: ${targetClient ? targetClient.id : 'Direct'}] [Brand: ${brandName}] Created by ${isFounder ? 'Founder' : 'SMM'}`,
          registered_by: currentUser.id
        }])
        .select()
        .single();

      if (recError) throw recError;

      // 2. Insert Full Length Episode
      const delivInserts: any[] = [
        {
          recording_id: recData.id,
          title: `${fullShootTitle} - Full Episode Video`,
          deliverable_type: 'full_length_video',
          editing_status: 'not_started',
          progress_percentage: 0,
          priority: 'high',
          description: `Full master episode for ${brandName || 'Client'}`
        }
      ];

      // 3. Insert Reels
      for (let i = 1; i <= newReelCount; i++) {
        delivInserts.push({
          recording_id: recData.id,
          title: `${fullShootTitle} - Reel #${i}`,
          deliverable_type: 'reel',
          editing_status: 'not_started',
          progress_percentage: 0,
          priority: 'medium',
          description: `Vertical 9:16 reel for ${brandName || 'Client'}`
        });
      }

      const { error: delError } = await supabase
        .from('deliverables')
        .insert(delivInserts);

      if (delError) throw delError;

      showToast(`🚀 Shoot & ${newReelCount} reels created for ${brandName || 'Client'}!`);
      setShowAddWorkModal(false);
      setNewShootTitle('');
      loadData();
    } catch (err: any) {
      console.error('Failed to create client work:', err);
      alert(`Error creating work: ${err.message}`);
    } finally {
      setIsCreatingWork(false);
    }
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-200">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full bg-white text-black text-xs font-bold shadow-2xl flex items-center gap-2 animate-in slide-in-from-bottom duration-200">
          <CheckCircle2 className="w-4 h-4 text-black shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase bg-zinc-800 border border-zinc-700 text-zinc-300">
              Client Management
            </span>
            <span className="text-zinc-600">•</span>
            <span className="text-xs font-medium text-zinc-400">
              {clients.length} Registered Brand {clients.length === 1 ? 'Client' : 'Clients'}
            </span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-zinc-300" />
            <span>Client Partners &amp; Works</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Dedicated client overview: shoots, editing cut progress, Google Drive review links, and published works.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={() => {
              setTargetClientId(selectedClientId !== 'all' ? selectedClientId : (clients[0]?.id || ''));
              setShowAddWorkModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-white text-black hover:bg-zinc-200 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Work for Client</span>
          </button>

          <button
            onClick={() => { setRefreshing(true); loadData(); }}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#18181B] border border-zinc-800 text-zinc-200 hover:bg-zinc-800 hover:border-zinc-700 transition shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* CLIENT CARDS SELECTOR / STRIP */}
      {clients.length === 0 ? (
        <div className="p-8 rounded-3xl bg-zinc-900 border border-zinc-800 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-800 border border-zinc-700 mx-auto flex items-center justify-center text-zinc-400">
            <Briefcase className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-white">No Client Accounts Registered Yet</h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
            When brand clients register via the <strong>Client Portal</strong> toggle on the login screen, their account and all their podcast deliverables will automatically appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-bold text-zinc-300 uppercase tracking-wider text-[10px]">
              Select Client Brand to View Works:
            </span>
            <span>{clients.length} Client {clients.length === 1 ? 'Account' : 'Accounts'}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* "All Clients" Card */}
            <div
              onClick={() => setSelectedClientId('all')}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                selectedClientId === 'all'
                  ? 'bg-zinc-800/90 border-white text-white shadow-md'
                  : 'bg-[#121214] border-[#27272A] text-zinc-400 hover:border-zinc-700 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Global View
                </span>
                <span className="text-[10px] font-bold bg-zinc-700 px-2 py-0.5 rounded-full text-zinc-200">
                  All Brands
                </span>
              </div>
              <div className="text-base font-black text-white">All Client Partners</div>
              <div className="text-xs text-zinc-400 mt-1">
                {recordings.length} total shoots • {deliverables.length} total cuts
              </div>
            </div>

            {/* Individual Client Cards */}
            {clientSummaries.map(({ client, brand, recordings: cRecs, deliverables: cDels, reels, completedCuts, avgProgress }) => {
              const isSelected = selectedClientId === client.id;
              return (
                <div
                  key={client.id}
                  onClick={() => setSelectedClientId(client.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-zinc-800/90 border-white text-white shadow-md'
                      : 'bg-[#121214] border-[#27272A] text-zinc-400 hover:border-zinc-700 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                      Brand: {brand}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-black border border-zinc-800 px-2 py-0.5 rounded-full text-zinc-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      Client
                    </span>
                  </div>

                  <div className="text-base font-black text-white truncate">
                    {client.full_name || brand}
                  </div>
                  <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                    {client.email}
                  </div>

                  {/* Quick Metrics */}
                  <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-300">
                      {cRecs.length} {cRecs.length === 1 ? 'Shoot' : 'Shoots'} • {reels.length} Reels
                    </span>
                    <span className="font-black text-white">
                      {completedCuts.length}/{cDels.length} Done ({avgProgress}%)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CLIENT WORKS DRILLDOWN SECTION */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-white">
              {selectedSummary ? `${selectedSummary.brand} Production Works` : 'All Client Production Works'}
            </h2>
            {selectedSummary && (
              <span className="text-[10px] font-bold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-700">
                Filtered: {selectedSummary.client.full_name}
              </span>
            )}
          </div>

          {/* Work Type Filter */}
          <div className="flex items-center gap-1 p-1 bg-black border border-zinc-800 rounded-xl text-xs">
            <button
              onClick={() => setWorkTypeFilter('all')}
              className={`px-3 py-1 rounded-lg font-bold transition ${
                workTypeFilter === 'all' ? 'bg-white text-black font-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              All Works
            </button>
            <button
              onClick={() => setWorkTypeFilter('shoots')}
              className={`px-3 py-1 rounded-lg font-bold transition ${
                workTypeFilter === 'shoots' ? 'bg-white text-black font-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Shoots
            </button>
            <button
              onClick={() => setWorkTypeFilter('reels')}
              className={`px-3 py-1 rounded-lg font-bold transition ${
                workTypeFilter === 'reels' ? 'bg-white text-black font-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Reels
            </button>
            <button
              onClick={() => setWorkTypeFilter('full')}
              className={`px-3 py-1 rounded-lg font-bold transition ${
                workTypeFilter === 'full' ? 'bg-white text-black font-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Full Videos
            </button>
            <button
              onClick={() => setWorkTypeFilter('published')}
              className={`px-3 py-1 rounded-lg font-bold transition ${
                workTypeFilter === 'published' ? 'bg-white text-black font-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Published
            </button>
          </div>
        </div>

        {/* WORK ITEMS DISPLAY */}
        {(() => {
          // Resolve current scope items
          const targetRecs = selectedSummary ? selectedSummary.recordings : recordings;
          const targetDelivs = selectedSummary ? selectedSummary.deliverables : deliverables;
          const targetLogs = selectedSummary ? selectedSummary.publishingLogs : publishingLogs;

          const filteredDelivs = targetDelivs.filter(d => {
            if (workTypeFilter === 'reels') return d.deliverable_type === 'reel';
            if (workTypeFilter === 'full') return d.deliverable_type === 'full_length_video';
            return true;
          });

          return (
            <div className="space-y-4">
              {/* SHOOTS (if all or shoots) */}
              {(workTypeFilter === 'all' || workTypeFilter === 'shoots') && targetRecs.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-zinc-300" />
                    <span>Podcast Shoots &amp; Source Footage ({targetRecs.length})</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {targetRecs.map(rec => (
                      <div key={rec.id} className="p-4 rounded-2xl bg-[#121214] border border-[#27272A] space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white truncate">
                            {rec.title}
                          </span>
                          <span className="text-[10px] font-bold text-zinc-400 bg-black px-2 py-0.5 rounded border border-zinc-800">
                            {rec.recording_date}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400 space-y-0.5">
                          <div>Storage: <strong className="text-zinc-200">{rec.hard_disk_name}</strong></div>
                          <div className="truncate">Folder: <span className="font-mono text-zinc-500">{rec.folder_path}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* DELIVERABLES / CUTS */}
              {(workTypeFilter === 'all' || workTypeFilter === 'reels' || workTypeFilter === 'full') && (
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                    <span>Editing Deliverables &amp; Review Progress ({filteredDelivs.length})</span>
                  </div>

                  {filteredDelivs.length === 0 ? (
                    <div className="p-6 rounded-2xl bg-[#121214] border border-[#27272A] text-center text-xs text-zinc-500">
                      No deliverables created yet for this client view. Click "+ Add Work for Client" above to create one.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {filteredDelivs.map(cut => {
                        const isDone = (cut.progress_percentage || 0) === 100 || cut.editing_status === 'approved';
                        return (
                          <div key={cut.id} className="p-4 rounded-2xl bg-[#121214] border border-[#27272A] space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-xs font-bold text-white flex items-center gap-2">
                                  <span>{cut.title}</span>
                                  <span className="text-[9px] font-bold bg-black text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-800">
                                    {cut.deliverable_type === 'full_length_video' ? 'Full 16:9' : 'Reel 9:16'}
                                  </span>
                                </div>
                                <div className="text-[10px] text-zinc-500 mt-0.5">
                                  Shoot: {cut.recording_title || 'Podcast'} • Editor: <strong className="text-zinc-300">{cut.editor_name || 'Unassigned'}</strong>
                                </div>
                              </div>

                              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${
                                isDone
                                  ? 'bg-zinc-800 text-white border-zinc-700'
                                  : 'bg-zinc-900 text-zinc-300 border-zinc-800'
                              }`}>
                                {cut.progress_percentage || 0}% Done
                              </span>
                            </div>

                            {/* Progress bar */}
                            <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-white h-full transition-all duration-300"
                                style={{ width: `${cut.progress_percentage || 0}%` }}
                              />
                            </div>

                            {/* Links & Client Revision Notes */}
                            <div className="flex items-center justify-between pt-1 border-t border-zinc-900 text-[11px]">
                              <span className="text-zinc-500 uppercase tracking-tight text-[10px] font-semibold">
                                Status: {cut.editing_status.replace(/_/g, ' ')}
                              </span>

                              {(cut.final_video_link || cut.preview_link) && (
                                <a
                                  href={cut.final_video_link || cut.preview_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-white hover:underline font-bold"
                                >
                                  <span>View Drive</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>

                            {/* Client Feedback / Revision Request notes */}
                            {cut.approval_notes && (
                              <div className="p-2 rounded-xl bg-black border border-zinc-800 text-[11px] text-zinc-300">
                                <span className="font-bold text-zinc-400 block text-[10px] uppercase">Notes / Client Feedback:</span>
                                <span>{cut.approval_notes}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* PUBLISHED POSTS */}
              {(workTypeFilter === 'all' || workTypeFilter === 'published') && targetLogs.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Share2 className="w-3.5 h-3.5 text-zinc-300" />
                    <span>Live Published Social Media Posts ({targetLogs.length})</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {targetLogs.map((log: any) => (
                      <div key={log.id} className="p-3.5 rounded-2xl bg-[#121214] border border-[#27272A] space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white truncate">
                            {log.deliverables?.title || log.channel_name || 'Social Post'}
                          </span>
                          <span className="text-[10px] font-bold text-zinc-400 bg-black px-2 py-0.5 rounded border border-zinc-800 uppercase">
                            {log.platform.replace(/_/g, ' ')}
                          </span>
                        </div>
                        {log.post_url && (
                          <a
                            href={log.post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-white hover:underline font-bold truncate max-w-full"
                          >
                            <span>Open Live Post</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* MODAL: ADD WORK FOR CLIENT */}
      {showAddWorkModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setShowAddWorkModal(false)}
        >
          <div 
            className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-zinc-300" />
                <span>Add Work for Client Partner</span>
              </h3>
              <button 
                onClick={() => setShowAddWorkModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClientWork} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  Select Client Brand
                </label>
                <select
                  value={targetClientId}
                  onChange={(e) => setTargetClientId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-black border border-zinc-800 text-white focus:outline-none focus:border-zinc-500"
                >
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.full_name || getClientBrandName(c)} ({c.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  Podcast / Shoot Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Episode 12 - Market Insights"
                  value={newShootTitle}
                  onChange={(e) => setNewShootTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-black border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  Shoot Date
                </label>
                <input
                  type="date"
                  required
                  value={newShootDate}
                  onChange={(e) => setNewShootDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-black border border-zinc-800 text-white focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  Number of Reels (9:16) to Generate
                </label>
                <input
                  type="number"
                  min="1"
                  max="15"
                  value={newReelCount}
                  onChange={(e) => setNewReelCount(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-black border border-zinc-800 text-white focus:outline-none focus:border-zinc-500"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Generates 1 Full Episode video (16:9) and {newReelCount} Reels (9:16) for this client.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAddWorkModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-800 text-zinc-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingWork}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-white text-black hover:bg-zinc-200 transition shadow disabled:opacity-50"
                >
                  {isCreatingWork ? 'Creating Work...' : 'Create & Assign to Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
