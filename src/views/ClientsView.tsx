import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Deliverable, Recording, PublishingLog, Profile } from '../types';
import { filterDeliverables, filterPublishingLogs, filterRecordings, filterClients, isClientDeleted, deleteSingleClient, deleteSingleRecording, isInternalBrand } from '../lib/deletionFilter';
import { createInvitation, createClient, createAuditLog } from '../lib/api';
import { 
  Briefcase, Film, CheckCircle2, Clock, ExternalLink, Search, 
  RefreshCw, User, Tv, Plus, Calendar, HardDrive, Folder, 
  MessageSquare, ChevronRight, X, Sparkles, AlertCircle, Share2,
  Copy, Key, ShieldCheck, Eye, EyeOff, Check, Mail, Send, Trash2, Radio
} from 'lucide-react';
import { fetchAllChannels, addNewChannel, removeChannel, filterChannelsForUser, ChannelItem } from '../lib/channels';

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
  const [targetBrandName, setTargetBrandName] = useState('');
  const [isCreatingWork, setIsCreatingWork] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal to register a brand client (Founder & SMM only)
  const [showRegisterClientModal, setShowRegisterClientModal] = useState(false);
  const [regContactName, setRegContactName] = useState('');
  const [regBrandName, setRegBrandName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [isRegisteringClient, setIsRegisteringClient] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [createdInviteInfo, setCreatedInviteInfo] = useState<{
    full_name: string;
    brand_name: string;
    email: string;
    token: string;
    invite_link: string;
    mailto_url: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Channels Management Sub-Tab
  const [activeSubTab, setActiveSubTab] = useState<'clients' | 'channels'>('clients');
  const [channelsList, setChannelsList] = useState<ChannelItem[]>([]);
  const [channelFilter, setChannelFilter] = useState<'all' | 'inhouse' | 'client'>('all');
  const [channelSearch, setChannelSearch] = useState('');
  const [showAddChannelModal, setShowAddChannelModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [channelOwnership, setChannelOwnership] = useState<'inhouse' | 'client'>('inhouse');
  const [channelTargetClientId, setChannelTargetClientId] = useState('');
  const [isAddingChannel, setIsAddingChannel] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleInviteClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setRegError(null);
    setIsRegisteringClient(true);

    try {
      const cleanEmail = regEmail.trim().toLowerCase();
      const cleanBrand = regBrandName.trim();
      const cleanContact = regContactName.trim();

      // 1. Create client workspace record in database / DAL
      try {
        await createClient({
          name: cleanContact,
          brand_name: cleanBrand,
          contact_name: cleanContact,
          email: cleanEmail,
          status: 'active',
          assigned_smm_id: currentUser.id,
          assigned_smm_name: currentUser.full_name || 'Social Media Manager'
        });
      } catch (cErr) {
        console.warn('createClient note:', cErr);
      }

      // 2. Generate 24-hour one-time invitation token
      const inv = await createInvitation(
        cleanEmail,
        'client',
        currentUser.id,
        cleanBrand
      );

      const inviteLink = `${window.location.origin}/?invite=${inv.token}`;

      // 3. Prepare professional branded invitation email message
      const emailSubject = `Invitation to Digital Inertia Client Portal — ${cleanBrand}`;
      const emailBody = `Hello ${cleanContact},

You have been invited by ${currentUser.full_name || 'Digital Inertia Management'} to access your dedicated Client Portal for ${cleanBrand}.

Please click the secure link below to set your account password and activate your workspace (link valid for 24 hours):
${inviteLink}

Once activated, you will be able to:
• Review your video deliverables and edits
• Approve cuts or request revisions
• Monitor social media publishing proofs and live links

Best regards,
Digital Inertia Production Team`;

      const mailtoUrl = `mailto:${cleanEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

      setCreatedInviteInfo({
        full_name: cleanContact,
        brand_name: cleanBrand,
        email: cleanEmail,
        token: inv.token,
        invite_link: inviteLink,
        mailto_url: mailtoUrl
      });

      // 4. Automatically redirect / launch default email client with invitation message!
      window.location.href = mailtoUrl;

      // 5. Audit log
      await createAuditLog(
        'invite_sent',
        'invitations',
        inv.id,
        currentUser.id,
        currentUser.email,
        { email: cleanEmail, role: 'client', client_brand: cleanBrand }
      );

      showToast(`✉️ Invitation generated & email redirected for ${cleanBrand}!`);
      loadData();
    } catch (err: any) {
      setRegError(err.message || 'Invitation failed');
    } finally {
      setIsRegisteringClient(false);
    }
  };

  const copyInviteLink = () => {
    if (!createdInviteInfo) return;
    navigator.clipboard.writeText(createdInviteInfo.invite_link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const handleDeleteClient = async (clientId: string, clientName: string) => {
    if (!window.confirm(`Are you sure you want to delete client account "${clientName}"? This will remove the client profile and associated channels.`)) return;
    try {
      setClients(prev => prev.filter(c => c.id !== clientId));
      await deleteSingleClient(clientId, clientName);
      showToast(`Client account "${clientName}" deleted.`);
      loadData();
    } catch (err: any) {
      alert(`Failed to delete client: ${err.message}`);
      loadData();
    }
  };

  const handleDeleteRecording = async (recId: string, title?: string) => {
    if (!window.confirm(`Delete shoot "${title || 'recording'}"? This will remove it from the list.`)) return;
    try {
      setRecordings(prev => prev.filter(r => r.id !== recId));
      await deleteSingleRecording(recId);
      showToast(`Shoot "${title || 'item'}" deleted.`);
      loadData();
    } catch (err: any) {
      alert(`Failed to delete shoot: ${err.message}`);
      loadData();
    }
  };

  const resetRegisterModal = () => {
    setShowRegisterClientModal(false);
    setRegContactName('');
    setRegBrandName('');
    setRegEmail('');
    setRegError(null);
    setCreatedInviteInfo(null);
    setCopiedLink(false);
  };

  const loadChannels = async () => {
    try {
      const chans = await fetchAllChannels();
      const filtered = filterChannelsForUser(chans, role, currentUser?.id, currentUser?.full_name);
      setChannelsList(filtered);
    } catch (e) {
      console.warn('ClientsView channels load note:', e);
    }
  };

  const handleAddNewChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    setIsAddingChannel(true);
    setChannelError(null);

    try {
      let clientObj: { id: string; name: string } | undefined;
      if (channelOwnership === 'client' && channelTargetClientId) {
        const found = clients.find(c => c.id === channelTargetClientId);
        if (found) {
          clientObj = {
            id: found.id,
            name: getClientBrandName(found) || found.full_name || 'Client'
          };
        }
      }

      await addNewChannel(newChannelName.trim(), clientObj);
      showToast(`Channel "${newChannelName.trim()}" created & synced to all SMMs and Founder!`);
      setNewChannelName('');
      setChannelOwnership('inhouse');
      setChannelTargetClientId('');
      setShowAddChannelModal(false);
      await loadChannels();
    } catch (err: any) {
      setChannelError(err.message || 'Failed to add channel.');
    } finally {
      setIsAddingChannel(false);
    }
  };

  const handleDeleteChannel = async (ch: ChannelItem) => {
    if (!window.confirm(`Are you sure you want to delete channel "${ch.name}"? This will remove it for all users.`)) return;
    try {
      await removeChannel(ch.id, ch.name, ch.client_id);
      showToast(`Channel "${ch.name}" deleted.`);
      await loadChannels();
    } catch (err: any) {
      showToast(`Error: ${err.message || 'Could not delete channel'}`);
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      await loadChannels();
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
        setClients(filterClients(clientProfiles));
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

    const rSub = supabase
      .channel('clients-view-recordings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recordings' }, () => loadData())
      .subscribe();

    const lSub = supabase
      .channel('clients-view-publishing')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'publishing_logs' }, () => loadData())
      .subscribe();

    const cSub = supabase
      .channel('clients-view-realtime-chans')
      .on('broadcast', { event: 'channel-added' }, () => loadChannels())
      .on('broadcast', { event: 'channel-removed' }, () => loadChannels())
      .subscribe();

    const handleSync = () => loadData();
    window.addEventListener('storage', handleSync);
    window.addEventListener('channels-updated', handleSync);
    window.addEventListener('focus', handleSync);

    return () => {
      supabase.removeChannel(pSub);
      supabase.removeChannel(dSub);
      supabase.removeChannel(rSub);
      supabase.removeChannel(lSub);
      supabase.removeChannel(cSub);
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('channels-updated', handleSync);
      window.removeEventListener('focus', handleSync);
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

  // Helper to match a deliverable or recording to a client with safe word-boundary matching
  const isWorkForClient = (title: string = '', notes: string = '', client: Profile): boolean => {
    const brand = getClientBrandName(client).trim().toLowerCase();
    const clientName = (client.full_name || '').trim().toLowerCase();
    const cleanTitle = title.toLowerCase();
    const cleanNotes = notes.toLowerCase();

    if (client.id && cleanNotes.includes(`[client: ${client.id.toLowerCase()}]`)) {
      return true;
    }

    const matchesToken = (text: string, token: string): boolean => {
      if (!text || !token) return false;
      if (token.length > 3) {
        return text.includes(token);
      }
      const regex = new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`, 'i');
      return regex.test(text);
    };

    if (brand && (matchesToken(cleanTitle, brand) || matchesToken(cleanNotes, brand))) {
      return true;
    }
    if (clientName && (matchesToken(cleanTitle, clientName) || matchesToken(cleanNotes, clientName))) {
      return true;
    }
    return false;
  };

  // Client summaries calculation supporting registered clients and direct brand recordings
  const clientSummaries = useMemo(() => {
    const brandMap = new Map<string, { client: Profile; brand: string }>();

    // 1. Registered clients
    clients.forEach(client => {
      const bName = getClientBrandName(client);
      brandMap.set(bName.toLowerCase(), { client, brand: bName });
    });

    // 2. Discover direct brands from recordings
    recordings.forEach(rec => {
      const brandMatch = rec.notes?.match(/\[Brand:\s*([^\]]+)\]/i);
      let brandFromRec = brandMatch ? brandMatch[1].trim() : '';
      if (!brandFromRec && rec.title.includes(' - ')) {
        brandFromRec = rec.title.split(' - ')[0].trim();
      }
      if (brandFromRec && !brandMap.has(brandFromRec.toLowerCase())) {
        if (isInternalBrand(brandFromRec) || isClientDeleted({ brand_name: brandFromRec, name: brandFromRec, full_name: brandFromRec })) {
          return;
        }
        brandMap.set(brandFromRec.toLowerCase(), {
          client: {
            id: `brand-${brandFromRec.toLowerCase().replace(/\s+/g, '-')}`,
            email: `${brandFromRec.toLowerCase().replace(/\s+/g, '')}@brand.client`,
            full_name: `${brandFromRec} (Client Partner)`,
            role: 'client',
            created_at: rec.created_at || new Date().toISOString()
          },
          brand: brandFromRec
        });
      }
    });

    return Array.from(brandMap.values()).map(({ client, brand }) => {
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

  // Handle Quick Create Shoot & Reels for this client (typed or selected)
  const handleCreateClientWork = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanBrand = targetBrandName.trim();
    if (!newShootTitle.trim() || !cleanBrand || !currentUser) return;
    setIsCreatingWork(true);

    try {
      const targetClient = clients.find(c => 
        c.id === targetClientId || 
        getClientBrandName(c).toLowerCase() === cleanBrand.toLowerCase()
      );
      
      const fullShootTitle = !newShootTitle.toLowerCase().includes(cleanBrand.toLowerCase())
        ? `${cleanBrand} - ${newShootTitle.trim()}`
        : newShootTitle.trim();

      // 1. Insert Recording
      const { data: recData, error: recError } = await supabase
        .from('recordings')
        .insert([{
          title: fullShootTitle,
          recording_date: newShootDate,
          date_received: newShootDate,
          hard_disk_name: 'Cloud / Studio Drives',
          folder_path: `/clients/${cleanBrand.toLowerCase().replace(/\s+/g, '-') || 'general'}`,
          notes: `[Client: ${targetClient ? targetClient.id : 'Direct'}] [Brand: ${cleanBrand}] Created by ${isFounder ? 'Founder' : 'SMM'}`,
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
          description: `Full master episode for ${cleanBrand}`
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
          description: `Vertical 9:16 reel for ${cleanBrand}`
        });
      }

      const { error: delError } = await supabase
        .from('deliverables')
        .insert(delivInserts);

      if (delError) throw delError;

      showToast(`🚀 Shoot & ${newReelCount} reels created for ${cleanBrand}!`);
      setShowAddWorkModal(false);
      setNewShootTitle('');
      setTargetBrandName('');
      setTargetClientId('');
      loadData();
    } catch (err: any) {
      console.error('Failed to create client work:', err);
      alert(`Error creating work: ${err.message}`);
    } finally {
      setIsCreatingWork(false);
    }
  };

  const filteredChannels = useMemo(() => {
    return channelsList.filter(ch => {
      if (channelFilter === 'inhouse' && (ch.client_id || ch.client_name)) return false;
      if (channelFilter === 'client' && !ch.client_id && !ch.client_name) return false;
      if (channelSearch.trim()) {
        const q = channelSearch.toLowerCase();
        const matchesName = ch.name.toLowerCase().includes(q);
        const matchesClient = (ch.client_name || '').toLowerCase().includes(q);
        if (!matchesName && !matchesClient) return false;
      }
      return true;
    });
  }, [channelsList, channelFilter, channelSearch]);

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
              {activeSubTab === 'clients' ? 'Client Workspace' : 'Broadcast Networks'}
            </span>
            <span className="text-zinc-600">•</span>
            <span className="text-xs font-medium text-zinc-400">
              {activeSubTab === 'clients' 
                ? `${clients.length} Registered Brand ${clients.length === 1 ? 'Client' : 'Clients'}`
                : `${channelsList.length} Connected ${channelsList.length === 1 ? 'Channel' : 'Channels'}`}
            </span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            {activeSubTab === 'clients' ? (
              <>
                <Briefcase className="w-6 h-6 text-zinc-300" />
                <span>Client Partners &amp; Works</span>
              </>
            ) : (
              <>
                <Radio className="w-6 h-6 text-zinc-300" />
                <span>Official &amp; Client Channels</span>
              </>
            )}
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            {activeSubTab === 'clients'
              ? 'Dedicated client overview: shoots, editing cut progress, Google Drive review links, and published works.'
              : 'Add, manage, and broadcast channels for in-house studio productions and client partner brands.'}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {activeSubTab === 'clients' ? (
            <>
              {(isFounder || isSMM) && (
                <button
                  onClick={() => {
                    resetRegisterModal();
                    setShowRegisterClientModal(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black bg-white text-black hover:bg-zinc-200 transition shadow-sm"
                >
                  <Mail className="w-4 h-4" />
                  <span>Invite Client Partner</span>
                </button>
              )}

              <button
                onClick={() => {
                  const matched = selectedClientId !== 'all' 
                    ? clients.find(c => c.id === selectedClientId) 
                    : clients[0];
                  setTargetClientId(matched?.id || '');
                  setTargetBrandName(matched ? getClientBrandName(matched) : '');
                  setShowAddWorkModal(true);
                }}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-zinc-800 border border-zinc-700 text-white hover:bg-zinc-700 transition shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Add Work for Client</span>
              </button>
            </>
          ) : (
            <>
              {(isFounder || isSMM) && (
                <button
                  onClick={() => {
                    setChannelError(null);
                    setNewChannelName('');
                    setChannelOwnership('inhouse');
                    setChannelTargetClientId('');
                    setShowAddChannelModal(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black bg-white text-black hover:bg-zinc-200 transition shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Channel</span>
                </button>
              )}
            </>
          )}

          <button
            onClick={() => { setRefreshing(true); loadData(); }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-[#18181B] border border-zinc-800 text-zinc-200 hover:bg-zinc-800 hover:border-zinc-700 transition shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Sub-tab Switcher: Clients vs Channels */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
        <button
          onClick={() => setActiveSubTab('clients')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition ${
            activeSubTab === 'clients'
              ? 'bg-white text-black shadow-md'
              : 'text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5" />
          <span>Client Partners ({clients.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('channels')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition ${
            activeSubTab === 'channels'
              ? 'bg-white text-black shadow-md'
              : 'text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Official &amp; Client Channels ({channelsList.length})</span>
        </button>
      </div>

      {activeSubTab === 'clients' && (
        <>
          {/* CLIENT CARDS SELECTOR / STRIP */}
      {clients.length === 0 ? (
        <div className="p-8 rounded-3xl bg-zinc-900 border border-zinc-800 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-800 border border-zinc-700 mx-auto flex items-center justify-center text-zinc-400">
            <Briefcase className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-white">No Client Accounts Connected Yet</h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
            Invite new brand clients below. An invitation email with a secure 24-hour setup link will be prepared so the client can set their own password and sign in to their private portal.
          </p>
          {(isFounder || isSMM) && (
            <button
              onClick={() => {
                resetRegisterModal();
                setShowRegisterClientModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black bg-white text-black hover:bg-zinc-200 transition shadow-sm"
            >
              <Mail className="w-4 h-4" />
              <span>Invite First Brand Client</span>
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
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-black border border-zinc-800 px-2 py-0.5 rounded-full text-zinc-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        Client
                      </span>
                      {(isFounder || isSMM) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClient(client.id, client.full_name || brand);
                          }}
                          className="p-1 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition active:scale-95"
                          title="Delete Client"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
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

      {/* CLIENT WORKS DRILLDOWN SECTION (REMOVED FOR FOUNDER) */}
      {!isFounder && (
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
            {selectedSummary && (
              <button
                type="button"
                onClick={() => {
                  setTargetClientId(selectedSummary.client.id);
                  setTargetBrandName(selectedSummary.brand);
                  setShowAddWorkModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white text-black hover:bg-zinc-200 transition shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Work for {selectedSummary.brand}</span>
              </button>
            )}
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
            // Resolve current scope items strictly for client brands (exclude internal studio bloopers/shoots)
            const clientRecIdSet = new Set(clientSummaries.flatMap(s => s.recordings.map(r => r.id)));
            const targetRecs = selectedSummary 
              ? selectedSummary.recordings 
              : recordings.filter(r => 
                  clientRecIdSet.has(r.id) && 
                  !isInternalBrand(r.hard_disk_name) && 
                  !isInternalBrand(r.title)
                );

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
                        <div key={rec.id} className="p-4 rounded-2xl bg-[#121214] border border-[#27272A] space-y-2 group relative">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white truncate pr-2">
                              {rec.title}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] font-bold text-zinc-400 bg-black px-2 py-0.5 rounded border border-zinc-800">
                                {rec.recording_date}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeleteRecording(rec.id, rec.title)}
                                className="p-1 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition active:scale-95"
                                title="Delete Shoot"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
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
              </div>
            );
          })()}
        </div>
      )}
        </>
      )}

      {/* CHANNELS MANAGEMENT SUB-TAB */}
      {activeSubTab === 'channels' && (
        <div className="space-y-4">
          {/* Channels Filter and Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/60 p-3 rounded-2xl border border-zinc-800">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setChannelFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  channelFilter === 'all' ? 'bg-white text-black font-black shadow-sm' : 'text-zinc-400 hover:text-white bg-zinc-800'
                }`}
              >
                All Channels ({channelsList.length})
              </button>
              <button
                type="button"
                onClick={() => setChannelFilter('inhouse')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  channelFilter === 'inhouse' ? 'bg-white text-black font-black shadow-sm' : 'text-zinc-400 hover:text-white bg-zinc-800'
                }`}
              >
                Studio In-House ({channelsList.filter(c => !c.client_id && !c.client_name).length})
              </button>
              <button
                type="button"
                onClick={() => setChannelFilter('client')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  channelFilter === 'client' ? 'bg-white text-black font-black shadow-sm' : 'text-zinc-400 hover:text-white bg-zinc-800'
                }`}
              >
                Client Channels ({channelsList.filter(c => Boolean(c.client_id || c.client_name)).length})
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search channels..."
                value={channelSearch}
                onChange={(e) => setChannelSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-black border border-zinc-800 text-white focus:outline-none focus:border-zinc-500 font-medium"
              />
            </div>
          </div>

          {/* Channels Cards Grid */}
          {filteredChannels.length === 0 ? (
            <div className="p-8 text-center bg-zinc-900 border border-zinc-800 rounded-3xl space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-800 border border-zinc-700 mx-auto flex items-center justify-center text-zinc-400">
                <Radio className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white">No Channels Found</h3>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                {channelSearch ? 'No channels matched your search filter.' : 'Click "+ Add Channel" above to add your official broadcast channel.'}
              </p>
              {(isFounder || isSMM) && (
                <button
                  type="button"
                  onClick={() => setShowAddChannelModal(true)}
                  className="px-4 py-2 rounded-xl text-xs font-black bg-white text-black hover:bg-zinc-200 transition shadow-sm"
                >
                  + Add Channel
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredChannels.map(ch => {
                const isDefault = ch.is_default || ch.source === 'default';
                const isClient = Boolean(ch.client_id || ch.client_name);

                return (
                  <div
                    key={ch.id}
                    className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition space-y-3 group relative"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-white font-bold shrink-0">
                          <Radio className="w-4 h-4 text-zinc-300" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-black text-white text-sm truncate group-hover:text-zinc-200 transition">
                            {ch.name}
                          </h4>
                          <span className="text-[10px] text-zinc-500 truncate block">
                            {isDefault ? 'Official Studio Channel' : isClient ? `Client: ${ch.client_name || ch.name}` : 'In-House Studio Channel'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isDefault ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-zinc-800 text-zinc-300 border border-zinc-700">
                            Studio
                          </span>
                        ) : isClient ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-white text-black">
                            Client
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-zinc-800 text-zinc-300 border border-zinc-700">
                            In-House
                          </span>
                        )}

                        {!isDefault && (isFounder || isSMM) && (
                          <button
                            type="button"
                            onClick={() => handleDeleteChannel(ch)}
                            className="p-1 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition"
                            title="Delete Channel"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs">
                      <span className="text-[10px] text-zinc-500">
                        {isClient ? 'Visible to Client, Founder & SMM' : 'Visible to Founder & all SMMs'}
                      </span>
                      {onNavigateTab && (
                        <button
                          type="button"
                          onClick={() => onNavigateTab('publishing')}
                          className="flex items-center gap-1 text-[11px] font-bold text-zinc-300 hover:text-white transition"
                        >
                          <span>Publish</span>
                          <ExternalLink className="w-3 h-3" />
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
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-zinc-300">
                    Client Brand Name *
                  </label>
                  <span className="text-[10px] text-zinc-500">Type or select brand</span>
                </div>
                <input
                  type="text"
                  required
                  list="client-brand-options"
                  placeholder="e.g. LLBS Podcast, Adidas, Nike..."
                  value={targetBrandName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTargetBrandName(val);
                    const matched = clients.find(c => 
                      getClientBrandName(c).toLowerCase() === val.trim().toLowerCase() ||
                      (c.full_name && c.full_name.toLowerCase() === val.trim().toLowerCase())
                    );
                    if (matched) {
                      setTargetClientId(matched.id);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-black border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 font-medium"
                />
                <datalist id="client-brand-options">
                  {clients.map(c => {
                    const bName = getClientBrandName(c);
                    return <option key={c.id} value={bName}>{c.full_name || bName} ({c.email})</option>;
                  })}
                </datalist>

                {clients.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-zinc-500">Registered:</span>
                    {clients.map(c => {
                      const bName = getClientBrandName(c);
                      const isSelected = targetBrandName.trim().toLowerCase() === bName.toLowerCase();
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setTargetBrandName(bName);
                            setTargetClientId(c.id);
                          }}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition ${
                            isSelected
                              ? 'bg-white text-black border-white'
                              : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700'
                          }`}
                        >
                          {bName}
                        </button>
                      );
                    })}
                  </div>
                )}
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
      {/* MODAL: INVITE CLIENT PARTNER (FOUNDER & SMM ONLY)                         */}
      {/* ========================================================================= */}
      {showRegisterClientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-white text-black flex items-center justify-center font-bold">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    Invite Client Partner
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Generate 24-hour setup invitation and launch pre-filled email.
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

            {createdInviteInfo ? (
              /* Success / Invitation Ready to Send View */
              <div className="space-y-4 py-2">
                <div className="p-4 rounded-2xl bg-black border border-zinc-700 space-y-3">
                  <div className="flex items-center gap-2 text-white">
                    <CheckCircle2 className="w-5 h-5 text-white" />
                    <span className="font-bold text-sm">Invitation Generated & Email Client Opened!</span>
                  </div>

                  <div className="space-y-2 pt-2 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-zinc-800">
                      <span className="text-zinc-400">Brand Name:</span>
                      <strong className="text-white font-mono">{createdInviteInfo.brand_name}</strong>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-zinc-800">
                      <span className="text-zinc-400">Client Contact:</span>
                      <strong className="text-white font-mono">{createdInviteInfo.full_name}</strong>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-zinc-800">
                      <span className="text-zinc-400">Invited Email:</span>
                      <strong className="text-white font-mono">{createdInviteInfo.email}</strong>
                    </div>
                    <div className="flex flex-col gap-1 py-1.5">
                      <span className="text-zinc-400">Personalized Setup Link (Valid 24h):</span>
                      <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 font-mono text-[11px] text-zinc-300 break-all select-all">
                        {createdInviteInfo.invite_link}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <button
                    onClick={copyInviteLink}
                    className="flex-1 py-3 px-4 rounded-xl bg-white text-black font-black text-xs hover:bg-zinc-200 transition flex items-center justify-center gap-1.5 shadow-md"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-4 h-4 text-black" />
                        <span>Invite Link Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy Invitation Link</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={resetRegisterModal}
                    className="py-3 px-5 rounded-xl bg-zinc-900 text-zinc-300 hover:text-white font-bold text-xs hover:bg-zinc-800 transition border border-zinc-800"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              /* Invitation Form */
              <form onSubmit={handleInviteClient} className="space-y-3.5">
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
                      placeholder="Brand or Channel Name"
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
                      placeholder="Contact Person Name"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1">
                    Client Email Address *
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
                    The client will receive an invitation email with a one-time link to create their own password and access their workspace.
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-black/60 border border-zinc-800 text-[11px] text-zinc-400 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-white">
                    <Mail className="w-3.5 h-3.5" />
                    <span>How the invitation works:</span>
                  </div>
                  <p>
                    Clicking <strong>Send Invitation &amp; Open Email</strong> generates a 24-hour secure setup token and automatically launches your email app with a pre-filled invitation message. The client opens the link to set their own password and sign in to their private portal.
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
                    <Send className="w-3.5 h-3.5" />
                    {isRegisteringClient ? 'Creating Invitation...' : 'Send Invitation & Open Email'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL: ADD CHANNEL (FOUNDER & SMM) */}
      {showAddChannelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-white text-black flex items-center justify-center font-bold">
                  <Radio className="w-4 h-4" />
                </div>
                <h3 className="text-base font-black text-white">Add Broadcast Channel</h3>
              </div>
              <button
                onClick={() => setShowAddChannelModal(false)}
                className="text-zinc-500 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {channelError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400">
                {channelError}
              </div>
            )}

            <form onSubmit={handleAddNewChannel} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  Channel Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Unfiltered Podcast India or Tech Talk Shorts"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-black border border-zinc-800 text-white font-medium focus:outline-none focus:border-zinc-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  Channel Ownership &amp; Visibility *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setChannelOwnership('inhouse');
                      setChannelTargetClientId('');
                    }}
                    className={`p-3 rounded-xl border text-left transition ${
                      channelOwnership === 'inhouse'
                        ? 'border-white bg-zinc-800 text-white'
                        : 'border-zinc-800 bg-black text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5" />
                      <span>Studio In-House</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      Visible only to Founder &amp; all SMMs. Clients never see it.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setChannelOwnership('client')}
                    className={`p-3 rounded-xl border text-left transition ${
                      channelOwnership === 'client'
                        ? 'border-white bg-zinc-800 text-white'
                        : 'border-zinc-800 bg-black text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      <span>Client Brand</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      Visible to Client, Founder &amp; all SMMs.
                    </p>
                  </button>
                </div>
              </div>

              {channelOwnership === 'client' && (
                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                    Assign to Client Brand *
                  </label>
                  <select
                    required
                    value={channelTargetClientId}
                    onChange={(e) => setChannelTargetClientId(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-black border border-zinc-800 text-white font-medium focus:outline-none focus:border-zinc-500"
                  >
                    <option value="">Select Client Brand...</option>
                    {filterClients(clients).map(c => (
                      <option key={c.id} value={c.id}>
                        {getClientBrandName(c) || c.full_name || c.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="p-3 rounded-xl bg-black border border-zinc-800 text-[11px] text-zinc-400 space-y-1">
                <div className="font-bold text-zinc-300 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                  <span>Real-Time Database Sync</span>
                </div>
                <p>
                  This channel will be saved immediately to the database and broadcasted in real time to all Social Media Managers and Founder.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAddChannelModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-800 text-zinc-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingChannel || !newChannelName.trim()}
                  className="px-5 py-2 rounded-xl text-xs font-black bg-white text-black hover:bg-zinc-200 transition shadow disabled:opacity-50"
                >
                  {isAddingChannel ? 'Saving Channel...' : 'Save & Broadcast Channel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
