import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Deliverable, Recording, PublishingLog, Profile } from '../types';
import { filterDeliverables, filterPublishingLogs, filterRecordings } from '../lib/deletionFilter';
import { registerNewClientAccount } from '../lib/clientRegistration';
import { 
  Briefcase, Film, CheckCircle2, Clock, ExternalLink, Search, 
  RefreshCw, User, Tv, Plus, Calendar, HardDrive, Folder, 
  MessageSquare, ChevronRight, X, Sparkles, AlertCircle, Share2,
  Copy, Key, ShieldCheck, Eye, EyeOff, Check
} from 'lucide-react';

interface ClientsViewProps {
  onNavigateTab?: (tab: string) => void;
}

export const ClientsView: React.FC<ClientsViewProps> = ({ onNavigateTab }) => {
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

  // Modal to add/link work to a client
  const [showAddWorkModal, setShowAddWorkModal] = useState(false);
  const [newShootTitle, setNewShootTitle] = useState('');
  const [newReelCount, setNewReelCount] = useState(3);
  const [newShootDate, setNewShootDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [targetClientId, setTargetClientId] = useState('');
  const [isCreatingWork, setIsCreatingWork] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal to register a brand client (Founder & SMM only)
  const [showRegisterClientModal, setShowRegisterClientModal] = useState(false);
  const [regContactName, setRegContactName] = useState('');
  const [regBrandName, setRegBrandName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [isRegisteringClient, setIsRegisteringClient] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [createdClientInfo, setCreatedClientInfo] = useState<{
    full_name: string;
    brand_name: string;
    email: string;
    password: string;
  } | null>(null);
  const [copiedCredentials, setCopiedCredentials] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleRegisterClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setIsRegisteringClient(true);
    try {
      const res = await registerNewClientAccount(
        regEmail,
        regPassword,
        regContactName,
        regBrandName
      );

      if (!res.success) {
        setRegError(res.error || 'Failed to create client account.');
        return;
      }

      setCreatedClientInfo({
        full_name: res.client!.full_name,
        brand_name: res.client!.brand_name,
        email: res.client!.email,
        password: res.client!.password
      });

      showToast(`🎉 Brand account "${res.client!.brand_name}" created successfully!`);
      loadData();
    } catch (err: any) {
      setRegError(err.message || 'Registration failed');
    } finally {
      setIsRegisteringClient(false);
    }
  };

  const copyClientCredentials = () => {
    if (!createdClientInfo) return;
    const text = `🎬 Digital Inertia — Client Portal Login Details\nBrand: ${createdClientInfo.brand_name}\nContact: ${createdClientInfo.full_name}\nLogin ID / Email: ${createdClientInfo.email}\nPassword: ${createdClientInfo.password}\n\nSign in on the app or web via Client Portal.`;
    navigator.clipboard.writeText(text);
    setCopiedCredentials(true);
    setTimeout(() => setCopiedCredentials(false), 3000);
  };

  const resetRegisterModal = () => {
    setShowRegisterClientModal(false);
    setRegContactName('');
    setRegBrandName('');
    setRegEmail('');
    setRegPassword('');
    setRegError(null);
    setCreatedClientInfo(null);
    setCopiedCredentials(false);
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
          {(isFounder || isSMM) && (
            <button
              onClick={() => {
                resetRegisterModal();
                setShowRegisterClientModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black bg-white text-black hover:bg-zinc-200 transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>+ Register New Client</span>
            </button>
          )}

          <button
            onClick={() => {
              setTargetClientId(selectedClientId !== 'all' ? selectedClientId : (clients[0]?.id || ''));
              setShowAddWorkModal(true);
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-zinc-800 border border-zinc-700 text-white hover:bg-zinc-700 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Work for Client</span>
          </button>

          <button
            onClick={() => { setRefreshing(true); loadData(); }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-[#18181B] border border-zinc-800 text-zinc-200 hover:bg-zinc-800 hover:border-zinc-700 transition shadow-sm"
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
            Register new brand clients below. You will set their login email and password, which the client can use to sign in to their private portal.
          </p>
          {(isFounder || isSMM) && (
            <button
              onClick={() => {
                resetRegisterModal();
                setShowRegisterClientModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black bg-white text-black hover:bg-zinc-200 transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Register First Brand Client</span>
            </button>
          )}
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
        </div>

        {/* Editing Tab Redirection Notice */}
        <div className="p-3.5 rounded-2xl bg-[#121214] border border-[#27272A] flex items-center justify-between text-xs flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-zinc-400 shrink-0" />
            <span className="text-zinc-300">
              Active video editing deliverables and review progress are managed exclusively in the <strong className="text-white">Editing</strong> tab.
            </span>
          </div>
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab(isFounder ? 'production' : 'pipeline')}
              className="text-xs font-bold text-black bg-white hover:bg-zinc-200 px-3 py-1.5 rounded-xl transition shadow-sm"
            >
              Open Editing Tab ↗
            </button>
          )}
        </div>

        {/* WORK ITEMS DISPLAY */}
        {(() => {
          // Resolve current scope items
          const targetRecs = selectedSummary ? selectedSummary.recordings : recordings;
          const targetLogs = selectedSummary ? selectedSummary.publishingLogs : publishingLogs;

          return (
            <div className="space-y-4">
              {/* SHOOTS */}
              {targetRecs.length > 0 && (
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

              {/* PUBLISHED POSTS */}
              {targetLogs.length > 0 && (
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

      {/* ========================================================================= */}
      {/* MODAL: REGISTER NEW CLIENT ACCOUNT (FOUNDER & SMM ONLY)                   */}
      {/* ========================================================================= */}
      {showRegisterClientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-white text-black flex items-center justify-center font-bold">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    Register New Client (Brand)
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Create login ID and password for your client partner.
                  </p>
                </div>
              </div>
              <button
                onClick={resetRegisterModal}
                className="p-1 rounded-full text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createdClientInfo ? (
              /* Success / Credentials Ready to Copy View */
              <div className="space-y-4 py-2">
                <div className="p-4 rounded-2xl bg-black border border-zinc-700 space-y-3">
                  <div className="flex items-center gap-2 text-white">
                    <CheckCircle2 className="w-5 h-5 text-white" />
                    <span className="font-bold text-sm">Client Account Created Successfully!</span>
                  </div>

                  <div className="space-y-2 pt-2 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-zinc-800">
                      <span className="text-zinc-400">Brand Name:</span>
                      <strong className="text-white font-mono">{createdClientInfo.brand_name}</strong>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-zinc-800">
                      <span className="text-zinc-400">Client Contact:</span>
                      <strong className="text-white font-mono">{createdClientInfo.full_name}</strong>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-zinc-800">
                      <span className="text-zinc-400">Login ID / Email:</span>
                      <strong className="text-white font-mono">{createdClientInfo.email}</strong>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-zinc-400">Password:</span>
                      <strong className="text-white font-mono">{createdClientInfo.password}</strong>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <button
                    onClick={copyClientCredentials}
                    className="flex-1 py-3 px-4 rounded-xl bg-white text-black font-black text-xs hover:bg-zinc-200 transition flex items-center justify-center gap-1.5 shadow-md"
                  >
                    {copiedCredentials ? (
                      <>
                        <Check className="w-4 h-4 text-black" />
                        <span>Credentials Copied to Clipboard!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy Login Credentials</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={resetRegisterModal}
                    className="py-3 px-5 rounded-xl bg-zinc-800 text-white font-bold text-xs hover:bg-zinc-700 transition border border-zinc-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              /* Registration Form */
              <form onSubmit={handleRegisterClient} className="space-y-3.5">
                {regError && (
                  <div className="p-3 rounded-xl bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-white shrink-0" />
                    <span>{regError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1">
                      Brand / Channel Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={regBrandName}
                      onChange={(e) => setRegBrandName(e.target.value)}
                      placeholder="e.g. LLBS Podcast"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1">
                      Client Contact Person *
                    </label>
                    <input
                      type="text"
                      required
                      value={regContactName}
                      onChange={(e) => setRegContactName(e.target.value)}
                      placeholder="e.g. Akash Sharma"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1">
                    Client Login Email / ID *
                  </label>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="client@brand.com"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">
                    The client will enter this email on the login screen under &quot;Client Portal&quot;.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-zinc-300">
                      Create Client Password *
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const randomPass = 'DI_' + Math.random().toString(36).substring(2, 8) + '!' + Math.floor(10 + Math.random() * 90);
                        setRegPassword(randomPass);
                      }}
                      className="text-[10px] font-bold text-zinc-400 hover:text-white underline"
                    >
                      Generate Secure Password
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Min. 6 characters"
                      className="w-full pl-3 pr-10 py-2 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(prev => !prev)}
                      className="absolute right-3 top-2.5 text-zinc-400 hover:text-white"
                    >
                      {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-black/60 border border-zinc-800 text-[11px] text-zinc-400 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-white">
                    <Key className="w-3.5 h-3.5" />
                    <span>How the client will sign in:</span>
                  </div>
                  <p>
                    Provide this Email and Password to your client. They tap <strong>Client Portal</strong> on the login screen and enter these credentials to view only their brand&apos;s videos, reviews, and published insights.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={resetRegisterModal}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isRegisteringClient}
                    className="px-5 py-2.5 rounded-xl bg-white text-black font-black text-xs hover:bg-zinc-200 transition shadow disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isRegisteringClient ? 'Creating Account...' : 'Create Client Account'}
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
