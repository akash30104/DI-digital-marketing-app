import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';
import { useAuth } from '../context/AuthContext';
import { ReportingExport } from './ReportingExport';
import { 
  Target, Users, FileSpreadsheet, Save, CheckCircle2, 
  AlertCircle, Shield, Clock, HardDrive, Smartphone, Trash2, RotateCcw,
  Radio, Plus, Briefcase, Sparkles, Building, Film, Check, ExternalLink, ShieldCheck
} from 'lucide-react';
import { 
  purgeAllDeliverables, purgeAllRecordings, purgeAllPublishingHistory,
  isClientDeleted, isInternalBrand
} from '../lib/deletionFilter';
import { fetchDailyTargets, saveDailyTargets } from '../lib/targets';
import { 
  fetchAllChannels, addNewChannel, removeChannel, ChannelItem, 
  extractClientBrandName, filterChannelsForUser
} from '../lib/channels';

interface FounderMoreProps {
  onNavigateTab?: (tab: string) => void;
}

export const FounderMore: React.FC<FounderMoreProps> = ({ onNavigateTab }) => {
  const { role } = useAuth();
  const isFounder = role === 'founder';
  const isSMM = role === 'social_media_manager';

  const [activeSubTab, setActiveSubTab] = useState<'channels' | 'targets' | 'team' | 'exports' | 'cleanup'>('channels');
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanMessage, setCleanMessage] = useState<string | null>(null);

  // Channels state
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [selectedClientForChannel, setSelectedClientForChannel] = useState<string>('none');
  const [isAddingChannel, setIsAddingChannel] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [channelSuccess, setChannelSuccess] = useState<string | null>(null);

  // Targets state
  const [shortsTarget, setShortsTarget] = useState(3);
  const [fullTarget, setFullTarget] = useState(1);
  const [reelsTarget, setReelsTarget] = useState(3);
  const [fbTarget, setFbTarget] = useState(2);
  const [xTarget, setXTarget] = useState(2);
  const [savingTargets, setSavingTargets] = useState(false);
  const [targetSuccess, setTargetSuccess] = useState(false);

  // Team state
  const [profiles, setProfiles] = useState<Profile[]>([]);

  // Load Channels
  const loadChannels = async () => {
    setIsLoadingChannels(true);
    try {
      const list = await fetchAllChannels();
      setChannels(list);
    } catch (err) {
      console.error('Failed to load channels:', err);
    } finally {
      setIsLoadingChannels(false);
    }
  };

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    setIsAddingChannel(true);
    setChannelError(null);
    setChannelSuccess(null);
    try {
      let clientObj: { id?: string; name?: string } | undefined = undefined;
      if (selectedClientForChannel !== 'none') {
        const cl = profiles.find(p => p.id === selectedClientForChannel);
        if (cl) {
          clientObj = { id: cl.id, name: cl.full_name };
        }
      }
      const updated = await addNewChannel(newChannelName.trim(), clientObj);
      setChannels(updated);
      setNewChannelName('');
      setSelectedClientForChannel('none');
      setChannelSuccess(`🎉 Channel "${newChannelName.trim()}" added successfully!`);
      setTimeout(() => setChannelSuccess(null), 3500);
    } catch (err: any) {
      setChannelError(err.message || 'Failed to add channel');
    } finally {
      setIsAddingChannel(false);
    }
  };

  const handleRemoveChannel = async (ch: ChannelItem) => {
    if (ch.is_default) {
      alert('Default studio channels cannot be deleted.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete channel "${ch.name}"?`)) return;
    try {
      // 1. Optimistic removal: remove from state immediately so user sees instant deletion
      setChannels(prev => prev.filter(c => c.id !== ch.id && c.name.toLowerCase() !== ch.name.toLowerCase()));
      // 2. Deep deletion: blacklist ID & name, unlink client profile if applicable
      const updated = await removeChannel(ch.id, ch.name, ch.client_id);
      setChannels(updated);
      setChannelSuccess(`Channel "${ch.name}" deleted successfully.`);
      setTimeout(() => setChannelSuccess(null), 3000);
    } catch (err: any) {
      alert(`Failed to remove channel: ${err.message}`);
      loadChannels();
    }
  };

  const handleDeleteMember = async (profile: Profile) => {
    if (profile.role === 'founder') {
      alert('Founder account cannot be deleted.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete ${profile.role === 'client' ? 'client' : 'team member'} "${profile.full_name || profile.email}"?`)) return;
    try {
      setProfiles(prev => prev.filter(x => x.id !== profile.id));
      await supabase.from('profiles').delete().eq('id', profile.id);
      if (profile.full_name) {
        await removeChannel(`client-${profile.id}`, profile.full_name, profile.id);
      }
      showCleanToast(`Account "${profile.full_name || profile.email}" deleted successfully.`);
      fetchTeam();
      loadChannels();
    } catch (err: any) {
      alert(`Failed to delete account: ${err.message}`);
      fetchTeam();
    }
  };

  // Fetch current targets
  const fetchTargets = async () => {
    try {
      const t = await fetchDailyTargets();
      setShortsTarget(t.shorts);
      setReelsTarget(t.reels);
      setFullTarget(t.full);
      setFbTarget(t.fb);
      setXTarget(t.x);
    } catch (err) {
      console.error('Failed to fetch targets:', err);
    }
  };

  const saveTargets = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTargets(true);
    setTargetSuccess(false);
    try {
      await saveDailyTargets({
        shorts: Number(shortsTarget),
        reels: Number(reelsTarget),
        full: Number(fullTarget),
        fb: Number(fbTarget),
        x: Number(xTarget)
      });

      setTargetSuccess(true);
      setTimeout(() => setTargetSuccess(false), 3000);
    } catch (err: any) {
      alert(`Failed to save targets: ${err.message}`);
    } finally {
      setSavingTargets(false);
    }
  };

  // Fetch Team Profiles
  const fetchTeam = async () => {
    try {
      const { data } = await supabase.from('profiles').select('*').order('role');
      if (data) setProfiles(data);
    } catch (err) {
      console.error('Failed to load team:', err);
    }
  };

  const showCleanToast = (msg: string) => {
    setCleanMessage(msg);
    setTimeout(() => setCleanMessage(null), 3500);
  };

  const handleDeletePublishingHistory = async () => {
    const ok = window.confirm('⚠️ Are you sure you want to delete ALL publishing history (posted reels & proof links)? This will reset daily counts.');
    if (!ok) return;
    setIsCleaning(true);
    try {
      await purgeAllPublishingHistory();
      showCleanToast('All publishing history deleted successfully!');
    } catch (e: any) {
      alert(`Failed to delete history: ${e.message}`);
    } finally {
      setIsCleaning(false);
    }
  };

  const handleDeleteTasks = async () => {
    const ok = window.confirm('⚠️ Are you sure you want to delete ALL tasks and deliverables?');
    if (!ok) return;
    setIsCleaning(true);
    try {
      await purgeAllDeliverables();
      showCleanToast('All editing tasks & deliverables deleted successfully!');
    } catch (e: any) {
      alert(`Failed to delete tasks: ${e.message}`);
    } finally {
      setIsCleaning(false);
    }
  };

  const handleDeleteRecordings = async () => {
    const ok = window.confirm('⚠️ Are you sure you want to delete ALL podcasts and shoot recordings?');
    if (!ok) return;
    setIsCleaning(true);
    try {
      await purgeAllRecordings();
      showCleanToast('All shoot recordings & podcasts deleted successfully!');
    } catch (e: any) {
      alert(`Failed to delete recordings: ${e.message}`);
    } finally {
      setIsCleaning(false);
    }
  };

  const handleDeleteNonFounderUsers = async () => {
    const ok = window.confirm('⚠️ Are you sure you want to delete all team members (except founder)?');
    if (!ok) return;
    setIsCleaning(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .neq('role', 'founder');
      if (error) console.warn('Supabase profile delete note:', error);
      await fetchTeam();
      showCleanToast('Team accounts deleted!');
    } catch (e: any) {
      alert(`Failed to delete users: ${e.message}`);
    } finally {
      setIsCleaning(false);
    }
  };

  const handleFullReset = async () => {
    const ok = window.confirm('🚨 FULL SYSTEM RESET: This will permanently delete ALL tasks, posted reels, recordings, and non-founder users. Are you absolutely sure?');
    if (!ok) return;
    setIsCleaning(true);
    try {
      await purgeAllPublishingHistory();
      await purgeAllRecordings();
      await purgeAllDeliverables();

      try {
        await supabase.from('profiles').delete().neq('role', 'founder');
      } catch (pe) {
        console.warn('Profile cleanup note:', pe);
      }
      await fetchTeam();
      showCleanToast('System completely reset to fresh state! 🎉');
    } catch (e: any) {
      alert(`Reset failed: ${e.message}`);
    } finally {
      setIsCleaning(false);
    }
  };

  useEffect(() => {
    fetchTargets();
    fetchTeam();
    loadChannels();

    const handleSync = () => loadChannels();
    window.addEventListener('channels-updated', handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener('channels-updated', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  const clientProfiles = profiles.filter(p => 
    (p.role === 'client' || (p.full_name && p.full_name.includes('(') && p.role !== 'founder')) &&
    !isClientDeleted(p) &&
    !isInternalBrand(p.full_name)
  );

  return (
    <div className="space-y-6 pb-20">
      {/* Sub-tab Navigation */}
      <div className="flex bg-zinc-900 border border-zinc-800 p-1 rounded-2xl overflow-x-auto gap-1">
        <button
          onClick={() => setActiveSubTab('channels')}
          className={`flex-1 min-w-[120px] py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeSubTab === 'channels'
              ? 'bg-white text-black font-black shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Radio className="w-4 h-4" />
          Channels ({channels.length})
        </button>

        <button
          onClick={() => setActiveSubTab('targets')}
          className={`flex-1 min-w-[120px] py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeSubTab === 'targets'
              ? 'bg-white text-black font-black shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Target className="w-4 h-4" />
          Daily Targets
        </button>

        <button
          onClick={() => setActiveSubTab('team')}
          className={`flex-1 min-w-[120px] py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeSubTab === 'team'
              ? 'bg-white text-black font-black shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          Team ({profiles.length})
        </button>

        <button
          onClick={() => setActiveSubTab('exports')}
          className={`flex-1 min-w-[120px] py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeSubTab === 'exports'
              ? 'bg-white text-black font-black shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          Data Exports
        </button>

        {isFounder && (
          <button
            onClick={() => setActiveSubTab('cleanup')}
            className={`flex-1 min-w-[120px] py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeSubTab === 'cleanup'
                ? 'bg-white text-black font-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            Data Reset
          </button>
        )}
      </div>

      {/* 0. CHANNELS & BRANDS SCREEN */}
      {activeSubTab === 'channels' && (
        <div className="space-y-6">
          {/* Channel Setup Card */}
          <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Radio className="w-5 h-5 text-white" />
                  Official &amp; Client Channels
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Add custom media channels or client podcast brands. Channels configured here appear in the Social Media Manager and Founder publishing options.
                </p>
              </div>

              <div className="px-3 py-1.5 rounded-full bg-zinc-800/80 border border-zinc-700/80 text-[11px] font-bold text-zinc-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-white" />
                <span>Auto-Client Sync Active</span>
              </div>
            </div>

            {/* Add Channel Form */}
            <form onSubmit={handleAddChannel} className="p-4 rounded-2xl bg-black/60 border border-zinc-800 space-y-3">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-300 block">
                + Add New Channel
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                    Channel / Podcast Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Real Estate Insider, Tamil Tech Talks"
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                    Link to Client Brand (Optional)
                  </label>
                  <select
                    value={selectedClientForChannel}
                    onChange={(e) => setSelectedClientForChannel(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-zinc-900 border border-zinc-800 text-white focus:outline-none focus:border-zinc-500"
                  >
                    <option value="none">— None (Studio In-House Channel) —</option>
                    {clientProfiles.map(cl => (
                      <option key={cl.id} value={cl.id}>
                        {cl.full_name} ({cl.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {channelError && (
                <div className="text-xs text-red-400 font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{channelError}</span>
                </div>
              )}

              {channelSuccess && (
                <div className="text-xs text-white font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{channelSuccess}</span>
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={isAddingChannel || !newChannelName.trim()}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-white text-black hover:bg-zinc-200 transition shadow disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isAddingChannel ? 'Adding...' : 'Add Channel'}</span>
                </button>
              </div>
            </form>

            {/* Explanatory Box: Channel Visibility Rules */}
            <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 flex items-start gap-3">
              <Building className="w-5 h-5 text-white shrink-0 mt-0.5" />
              <div className="text-xs text-zinc-400 leading-relaxed space-y-1.5">
                <p className="font-bold text-white">
                  Channel Visibility &amp; Synchronization Rules:
                </p>
                <p>
                  • <strong className="text-white">🏢 Studio In-House Channel:</strong> When added without a client link, it automatically syncs and shows up across <strong className="text-zinc-200">ALL Social Media Managers and Founder</strong> dashboards across all devices. Clients will never see in-house channels.
                </p>
                <p>
                  • <strong className="text-white">💼 Client Brand Channel:</strong> When linked to a client partner, it appears for <strong className="text-zinc-200">THAT Client in their Connected Channels Portal</strong>, as well as for Founder and all SMMs.
                </p>
              </div>
            </div>

            {/* Channels List */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-400">
                  Active Publishing Channels ({channels.length})
                </span>
                <button
                  type="button"
                  onClick={loadChannels}
                  disabled={isLoadingChannels}
                  className="text-[11px] font-bold text-zinc-400 hover:text-white flex items-center gap-1"
                >
                  <RotateCcw className={`w-3 h-3 ${isLoadingChannels ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {channels.map((ch) => {
                  const isInHouse = !ch.client_id && !ch.client_name;
                  return (
                    <div
                      key={ch.id}
                      className="p-3.5 rounded-2xl bg-black border border-zinc-800 flex items-center justify-between gap-3 group"
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <div className="w-7 h-7 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
                          <Radio className="w-3.5 h-3.5 text-zinc-300" />
                        </div>
                        <div className="truncate">
                          <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                            <span>{ch.name}</span>
                          </div>
                          <div className="text-[10px] text-zinc-400 truncate">
                            {isInHouse ? (
                              <span className="text-zinc-400">🏢 In-House • Visible to all SMMs &amp; Founder</span>
                            ) : (
                              <span className="text-zinc-300 font-semibold">💼 Client: {ch.client_name || 'Partner'} • Visible to Client, Founder &amp; SMMs</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isInHouse ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-zinc-800 border border-zinc-700 text-zinc-300">
                            🏢 In-House
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-white text-black font-black">
                            💼 Client Channel
                          </span>
                        )}
                        {!ch.is_default && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveChannel(ch);
                            }}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition active:scale-95"
                            title="Delete Channel"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 1. Targets Screen */}
      {activeSubTab === 'targets' && (
        <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6 shadow-xl">
          <div className="mb-6">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-white" />
              Configure Daily Publishing Targets
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Targets set the daily goals visible across the Founder Dashboard and iPhone home-screen widget.
            </p>
          </div>

          <form onSubmit={saveTargets} className="space-y-4 max-w-lg">
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                YouTube Shorts Daily Goal (videos/day)
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={shortsTarget}
                onChange={(e) => setShortsTarget(parseInt(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-black border border-zinc-800 text-white focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                Instagram Reels Daily Goal (videos/day)
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={reelsTarget}
                onChange={(e) => setReelsTarget(parseInt(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-black border border-zinc-800 text-white focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                YouTube Full-Length Videos Daily Goal (episodes/day)
              </label>
              <input
                type="number"
                min="0"
                max="20"
                value={fullTarget}
                onChange={(e) => setFullTarget(parseInt(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-black border border-zinc-800 text-white focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                Facebook Daily Goal (posts/day)
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={fbTarget}
                onChange={(e) => setFbTarget(parseInt(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-black border border-zinc-800 text-white focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                X (Twitter) Daily Goal (posts/day)
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={xTarget}
                onChange={(e) => setXTarget(parseInt(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-black border border-zinc-800 text-white focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={savingTargets}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-black bg-white hover:bg-zinc-200 text-black shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {savingTargets ? 'Saving...' : 'Save Publishing Targets'}
              </button>

              {targetSuccess && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-white">
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  Targets updated!
                </span>
              )}
            </div>
          </form>
        </div>
      )}

      {/* 2. Team Screen */}
      {activeSubTab === 'team' && (
        <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-white" />
                Registered Team Accounts
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Active members authenticated via Supabase Row Level Security
              </p>
            </div>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('team')}
                className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-zinc-200 text-black rounded-xl text-xs font-black shadow-md transition self-start sm:self-auto active:scale-[0.99]"
              >
                <Plus className="w-4 h-4" />
                <span>+ Invite Member or SMM</span>
              </button>
            )}
          </div>

          <div className="divide-y divide-zinc-800">
            {profiles.map(p => (
              <div key={p.id} className="py-3.5 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-white">
                    {p.full_name}
                  </div>
                  <div className="text-xs text-zinc-400">
                    {p.email}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider bg-zinc-800 text-zinc-200 border border-zinc-700">
                    {p.role === 'client' ? 'Client Partner' : p.role.replace('_', ' ')}
                  </span>
                  {p.role !== 'founder' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteMember(p)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition"
                      title="Delete Account"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exports Screen */}
      {activeSubTab === 'exports' && (
        <ReportingExport />
      )}

      {/* 4. Data & History Reset Screen */}
      {activeSubTab === 'cleanup' && (
        <div className="space-y-4">
          <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6 shadow-xl space-y-6">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-zinc-300" />
                Data &amp; History Reset Control
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Safely delete all tasks, published reels history, and test records to start fresh.
              </p>
            </div>

            {cleanMessage && (
              <div className="p-3.5 rounded-2xl bg-white text-black font-black text-xs flex items-center gap-2 shadow-md">
                <CheckCircle2 className="w-4 h-4 text-black" />
                <span>{cleanMessage}</span>
              </div>
            )}

            <div className="space-y-3">
              {/* Reset History */}
              <div className="p-4 rounded-2xl bg-black border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-white text-sm">Delete All Publishing History</h4>
                  <p className="text-xs text-zinc-400">Permanently deletes all posted reels, live proofs, and resets today's output count and streak.</p>
                </div>
                <button
                  type="button"
                  disabled={isCleaning}
                  onClick={handleDeletePublishingHistory}
                  className="px-4 py-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-all border border-zinc-700 active:scale-95 disabled:opacity-50 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                  Delete All History
                </button>
              </div>

              {/* Reset Tasks & Deliverables */}
              <div className="p-4 rounded-2xl bg-black border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-white text-sm">Delete All Tasks &amp; Deliverables</h4>
                  <p className="text-xs text-zinc-400">Deletes all assigned reels and full-length video cuts across all editors.</p>
                </div>
                <button
                  type="button"
                  disabled={isCleaning}
                  onClick={handleDeleteTasks}
                  className="px-4 py-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-all border border-zinc-700 active:scale-95 disabled:opacity-50 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                  Delete All Tasks
                </button>
              </div>

              {/* Reset Shoot Recordings */}
              <div className="p-4 rounded-2xl bg-black border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-white text-sm">Delete All Shoot Recordings (Podcasts)</h4>
                  <p className="text-xs text-zinc-400">Deletes all registered podcasts and footage transfers.</p>
                </div>
                <button
                  type="button"
                  disabled={isCleaning}
                  onClick={handleDeleteRecordings}
                  className="px-4 py-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-all border border-zinc-700 active:scale-95 disabled:opacity-50 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                  Delete All Shoots
                </button>
              </div>

              {/* Delete Test Non-Founder Users */}
              <div className="p-4 rounded-2xl bg-black border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-white text-sm">Delete Team Accounts (Except Founder)</h4>
                  <p className="text-xs text-zinc-400">Cleans up test editors and social media manager accounts.</p>
                </div>
                <button
                  type="button"
                  disabled={isCleaning}
                  onClick={handleDeleteNonFounderUsers}
                  className="px-4 py-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-all border border-zinc-700 active:scale-95 disabled:opacity-50 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                  Delete Team Users
                </button>
              </div>

              {/* Full Factory Clean Start */}
              <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4">
                <div>
                  <h4 className="font-black text-white text-sm flex items-center gap-1.5">
                    <span>🚨 Full System Reset</span>
                  </h4>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Purges all tasks, posted reels, shoots, and caches in a single action for a completely clean fresh start.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isCleaning}
                  onClick={handleFullReset}
                  className="px-6 py-2.5 rounded-full bg-white text-black font-black text-xs hover:bg-zinc-200 shadow-md active:scale-95 disabled:opacity-50 shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5 inline mr-1.5" />
                  {isCleaning ? 'Resetting...' : 'Full System Reset'}
                </button>
              </div>

              {/* App Info & Privacy Policy Card */}
              <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs mt-4">
                <div>
                  <p className="font-bold text-white">Digital Inertia Production &amp; Marketing</p>
                  <p className="text-[11px] text-zinc-500">Official Android App &bull; Google Play Compliant Privacy Policy</p>
                </div>
                <a
                  href="/privacy-policy.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-bold text-white transition-all shadow-sm self-start sm:self-auto"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-white" />
                  <span>Privacy Policy &nearr;</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
