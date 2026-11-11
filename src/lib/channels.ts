import { supabase } from './supabase';
import { Profile } from '../types';
import { filterClients } from './deletionFilter';

export interface ChannelItem {
  id: string;
  name: string;
  client_id?: string | null;
  client_name?: string | null;
  is_default?: boolean;
  source: 'default' | 'custom' | 'client';
  created_at?: string;
}

export const DEFAULT_CHANNELS: string[] = [
  'Digital Inertia',
  'Unfiltered Podcast',
  'LLBS Podcast',
  'Best Podcast'
];

const STORAGE_KEY = 'APP_CUSTOM_CHANNELS';
const DELETED_STORAGE_KEY = 'APP_DELETED_CHANNELS';

/**
 * Extracts clean brand name from a client profile (e.g. "AK (LLBS)" -> "LLBS")
 */
export function extractClientBrandName(client: { full_name?: string }): string {
  if (!client.full_name) return 'Client Brand';
  const match = client.full_name.match(/\(([^)]+)\)/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return client.full_name.trim();
}

/**
 * Reads locally cached custom channels
 */
export function getCachedCustomChannels(): ChannelItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Error reading custom channels cache:', e);
    return [];
  }
}

/**
 * Reads locally cached deleted / blacklisted channel IDs and names
 */
export function getDeletedChannels(): string[] {
  try {
    const raw = localStorage.getItem(DELETED_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

/**
 * Saves deleted channel blacklist to localStorage
 */
export function saveDeletedChannels(list: string[]): void {
  try {
    localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('channels-updated'));
  } catch (e) {
    console.warn('Error saving deleted channels:', e);
  }
}

/**
 * Saves custom channels to local storage and notifies components
 */
export function cacheCustomChannels(channels: ChannelItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(channels));
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('channels-updated'));
  } catch (e) {
    console.warn('Error saving custom channels to cache:', e);
  }
}

/**
 * Syncs custom channels and deleted blacklist to Supabase across Founder and SMM accounts
 */
async function syncCustomChannelsToSupabase(
  customChannels: ChannelItem[],
  deletedChannels?: string[]
): Promise<void> {
  const channelsJson = JSON.stringify(customChannels);
  const delList = deletedChannels || getDeletedChannels();
  const deletedJson = JSON.stringify(delList);

  // 1. Sync to the authenticated user's own profile bio (guaranteed allowed by Supabase RLS for any SMM or Founder)
  try {
    const { data: authData } = await supabase.auth.getUser();
    const currentUserId = authData?.user?.id;

    if (currentUserId) {
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('bio')
        .eq('id', currentUserId)
        .maybeSingle();

      let existingBio = myProfile?.bio || '';
      const targetsMatch = existingBio.match(/(TARGETS:[^\n]+)/);
      const targetsPrefix = targetsMatch ? targetsMatch[1] : '';

      const parts: string[] = [];
      if (targetsPrefix) parts.push(targetsPrefix);
      parts.push(`CHANNELS:${channelsJson}`);
      parts.push(`DELETED_CHANNELS:${deletedJson}`);

      await supabase
        .from('profiles')
        .update({ bio: parts.join('\n') })
        .eq('id', currentUserId);
    }
  } catch (err) {
    console.warn('Could not sync channels to current user profile bio:', err);
  }

  // 2. Also try updating founder profile bio if founder is logged in
  try {
    const { data: founderProfile } = await supabase
      .from('profiles')
      .select('id, bio')
      .eq('role', 'founder')
      .limit(1)
      .maybeSingle();

    if (founderProfile) {
      let existingBio = founderProfile.bio || '';
      const targetsMatch = existingBio.match(/(TARGETS:[^\n]+)/);
      const targetsPrefix = targetsMatch ? targetsMatch[1] : '';

      const parts: string[] = [];
      if (targetsPrefix) parts.push(targetsPrefix);
      parts.push(`CHANNELS:${channelsJson}`);
      parts.push(`DELETED_CHANNELS:${deletedJson}`);

      await supabase
        .from('profiles')
        .update({ bio: parts.join('\n') })
        .eq('id', founderProfile.id);
    }
  } catch (err) {}
}

/**
 * Loads custom channels and deleted blacklist from Supabase across all SMM and Founder profiles
 */
async function loadCustomChannelsFromSupabase(): Promise<{
  channels: ChannelItem[];
  deleted: string[];
}> {
  try {
    // Read profiles of all founders and social media managers
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, role, bio')
      .or('role.eq.founder,role.eq.social_media_manager');

    if (profiles && profiles.length > 0) {
      const channelMap = new Map<string, ChannelItem>();
      const deletedSet = new Set<string>();

      profiles.forEach(p => {
        if (!p.bio) return;

        const match = p.bio.match(/CHANNELS:([^\n]+)/);
        if (match && match[1]) {
          try {
            const list: ChannelItem[] = JSON.parse(match[1]);
            if (Array.isArray(list)) {
              list.forEach(c => {
                if (c && c.name && !channelMap.has(c.name.toLowerCase())) {
                  channelMap.set(c.name.toLowerCase(), c);
                }
              });
            }
          } catch (e) {}
        }

        const delMatch = p.bio.match(/DELETED_CHANNELS:([^\n]+)/);
        if (delMatch && delMatch[1]) {
          try {
            const dList: string[] = JSON.parse(delMatch[1]);
            if (Array.isArray(dList)) {
              dList.forEach(d => deletedSet.add(d));
            }
          } catch (e) {}
        }
      });

      return {
        channels: Array.from(channelMap.values()),
        deleted: Array.from(deletedSet)
      };
    }
  } catch (err) {
    console.warn('Could not read channels from Supabase profiles:', err);
  }
  return { channels: [], deleted: [] };
}

/**
 * Combines:
 * 1. Default studio channels
 * 2. Custom channels added by Founder/SMM
 * 3. Client channels (automatically generated if a client is added)
 * 4. Channels found in past publishing logs
 * Filters out any channels that have been deleted/blacklisted.
 */
export async function fetchAllChannels(): Promise<ChannelItem[]> {
  const result: ChannelItem[] = [];
  const seenNames = new Set<string>();

  // Fetch remote updates
  try {
    const remote = await loadCustomChannelsFromSupabase();
    if (remote.deleted && remote.deleted.length > 0) {
      const mergedDeleted = Array.from(new Set([...getDeletedChannels(), ...remote.deleted]));
      saveDeletedChannels(mergedDeleted);
    }
    if (remote.channels && remote.channels.length > 0) {
      const current = getCachedCustomChannels();
      const existingIds = new Set(current.map(c => c.id));
      remote.channels.forEach(rc => {
        if (!existingIds.has(rc.id)) {
          current.push(rc);
        }
      });
      cacheCustomChannels(current);
    }
  } catch (err) {
    console.warn('Failed to load remote custom channels:', err);
  }

  const deletedList = getDeletedChannels().map(s => s.trim().toLowerCase());
  const isDeleted = (id: string, name: string) => {
    const normId = (id || '').trim().toLowerCase();
    const normName = (name || '').trim().toLowerCase();
    return (
      (normId && deletedList.includes(normId)) ||
      (normName && deletedList.includes(normName))
    );
  };

  const addUnique = (item: ChannelItem) => {
    const norm = item.name.trim().toLowerCase();
    if (!norm || seenNames.has(norm)) return;
    if (isDeleted(item.id, item.name)) return;
    seenNames.add(norm);
    result.push(item);
  };

  // 1. Add Default Channels
  DEFAULT_CHANNELS.forEach(name => {
    addUnique({
      id: `default-${name.toLowerCase().replace(/\s+/g, '-')}`,
      name,
      is_default: true,
      source: 'default'
    });
  });

  // 2. Fetch Custom Channels (from cache & Supabase)
  const customChannels = getCachedCustomChannels();
  customChannels.forEach(c => {
    addUnique({
      ...c,
      source: 'custom'
    });
  });

  // 3. AUTOMATIC CLIENT SYNC: If client is added in profiles, ensure their channel exists (unless deleted)
  try {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (profiles) {
      const clientProfiles = filterClients(
        profiles.filter(p => 
          p.role === 'client' || (p.full_name && p.full_name.includes('(') && p.role !== 'founder')
        )
      );

      clientProfiles.forEach(client => {
        const brand = extractClientBrandName(client);
        if (brand) {
          const channelName = brand.toLowerCase().includes('podcast') || brand.toLowerCase().includes('channel') 
            ? brand 
            : `${brand} Podcast`;

          addUnique({
            id: `client-${client.id}`,
            name: channelName,
            client_id: client.id,
            client_name: client.full_name,
            source: 'client'
          });

          if (channelName !== brand) {
            addUnique({
              id: `client-brand-${client.id}`,
              name: brand,
              client_id: client.id,
              client_name: client.full_name,
              source: 'client'
            });
          }
        }
      });
    }
  } catch (err) {
    console.warn('Failed to auto-sync client channels:', err);
  }

  // 4. Discover any channels previously logged in publishing_logs
  try {
    const { data: logs } = await supabase
      .from('publishing_logs')
      .select('channel_name, notes')
      .order('published_at', { ascending: false })
      .limit(50);

    if (logs) {
      logs.forEach(l => {
        let name = (l.channel_name || '').trim();
        if (!name && l.notes) {
          const match = l.notes.match(/\[Channel:\s*([^\]]+)\]/i);
          if (match && match[1]) name = match[1].trim();
        }
        if (name) {
          let clientId: string | null = null;
          let clientName: string | null = null;
          let isClient = false;
          if (l.notes) {
            const cMatch = l.notes.match(/\[Client:\s*([^\]]+)\]/i);
            const idMatch = l.notes.match(/\[ClientId:\s*([^\]]+)\]/i);
            const typeMatch = l.notes.match(/\[Type:\s*([^\]]+)\]/i);
            if (cMatch && cMatch[1]) clientName = cMatch[1].trim();
            if (idMatch && idMatch[1]) clientId = idMatch[1].trim();
            if (typeMatch && typeMatch[1].trim() === 'client') isClient = true;
          }

          addUnique({
            id: `logged-${name.toLowerCase().replace(/\s+/g, '-')}`,
            name,
            client_id: clientId,
            client_name: clientName,
            is_default: false,
            source: isClient ? 'client' : 'custom'
          });
        }
      });
    }
  } catch (err) {
    console.warn('Failed to load channels from publishing logs:', err);
  }

  return result.filter(c => !isDeleted(c.id, c.name));
}

/**
 * Adds a new channel (callable by both Social Media Manager and Founder)
 */
export async function addNewChannel(
  name: string,
  client?: { id?: string; name?: string }
): Promise<ChannelItem[]> {
  const cleanName = name.trim();
  if (!cleanName) {
    throw new Error('Channel name cannot be empty.');
  }

  const existing = await fetchAllChannels();
  if (existing.some(c => c.name.toLowerCase() === cleanName.toLowerCase())) {
    throw new Error(`A channel named "${cleanName}" already exists.`);
  }

  // If this channel was previously deleted/blacklisted, un-blacklist it
  const currentDeleted = getDeletedChannels();
  const updatedDeleted = currentDeleted.filter(
    d => d.toLowerCase() !== cleanName.toLowerCase()
  );
  saveDeletedChannels(updatedDeleted);

  const newChannel: ChannelItem = {
    id: `custom-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: cleanName,
    client_id: client?.id || null,
    client_name: client?.name || null,
    is_default: false,
    source: client?.id ? 'client' : 'custom',
    created_at: new Date().toISOString()
  };

  const currentCustom = getCachedCustomChannels();
  const updatedCustom = [newChannel, ...currentCustom];

  cacheCustomChannels(updatedCustom);

  // Sync to di_platform_channels_v2 API store
  try {
    const rawApi = localStorage.getItem('di_platform_channels_v2');
    const apiList = rawApi ? JSON.parse(rawApi) : [];
    const apiChannel = {
      id: newChannel.id,
      client_id: client?.id || undefined,
      client_name: client?.name || undefined,
      platform: 'youtube',
      channel_name: cleanName,
      channel_url: '',
      is_active: true,
      created_at: newChannel.created_at
    };
    localStorage.setItem(
      'di_platform_channels_v2', 
      JSON.stringify([apiChannel, ...apiList.filter((x: any) => (x.channel_name || '').toLowerCase() !== cleanName.toLowerCase())])
    );
  } catch {}

  // Cross-device sync to Supabase profile bios
  await syncCustomChannelsToSupabase(updatedCustom, updatedDeleted);

  // Backup to publishing_logs with [ChannelConfig] tag (guaranteed write permissions for SMM and Founder)
  try {
    const isInternal = !client?.id && !client?.name;
    await supabase.from('publishing_logs').insert([{
      channel_name: cleanName,
      platform: 'youtube',
      notes: `[ChannelConfig] [Type: ${isInternal ? 'inhouse' : 'client'}] [Client: ${client?.name || ''}] [ClientId: ${client?.id || ''}]`,
      published_at: new Date().toISOString()
    }]);
  } catch (e) {
    console.warn('Publishing logs channel sync note:', e);
  }

  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new CustomEvent('channels-updated'));

  return fetchAllChannels();
}

/**
 * Filters channels strictly based on the user's role and identity:
 * - Founder & SMM: see ALL in-house channels and ALL client channels.
 * - Client: ONLY see channels designated for their brand (never in-house studio channels or other clients' channels).
 */
export function filterChannelsForUser(
  channels: ChannelItem[],
  userRole?: string,
  userId?: string,
  userFullName?: string
): ChannelItem[] {
  if (!userRole) return channels;

  // 1. Founder and Social Media Manager see ALL in-house channels AND all client channels
  if (userRole === 'founder' || userRole === 'social_media_manager') {
    return channels;
  }

  // 2. Client role: strictly see channels designated for THIS client
  if (userRole === 'client') {
    const cleanUserName = (userFullName || '').trim().toLowerCase();
    const cleanBrandMatch = userFullName ? extractClientBrandName({ full_name: userFullName }).toLowerCase() : '';

    return channels.filter(ch => {
      // Exclude in-house default channels for clients
      if (ch.is_default || ch.source === 'default') return false;
      if (!ch.client_id && !ch.client_name) return false;

      // Check if linked to this client's user ID
      if (userId && ch.client_id === userId) return true;

      // Check if linked by client name or brand
      const chClientName = (ch.client_name || '').toLowerCase();
      const chName = (ch.name || '').toLowerCase();

      if (cleanUserName && (chClientName.includes(cleanUserName) || cleanUserName.includes(chClientName))) return true;
      if (cleanBrandMatch && (chClientName.includes(cleanBrandMatch) || chName.includes(cleanBrandMatch))) return true;

      return false;
    });
  }

  // Other roles (e.g. editor)
  return channels;
}

/**
 * Removes a channel permanently (custom, client-brand, or default if authorized).
 * Automatically blacklists the channel name/id and purges client profile if applicable.
 */
export async function removeChannel(
  channelId: string,
  channelName?: string,
  clientId?: string | null
): Promise<ChannelItem[]> {
  const normId = (channelId || '').trim().toLowerCase();
  const normName = (channelName || '').trim().toLowerCase();

  // 1. Blacklist in deleted channels list so fetchAllChannels never returns it
  const currentDeleted = getDeletedChannels();
  const updatedDeleted = Array.from(new Set([
    ...currentDeleted,
    ...(normId ? [normId] : []),
    ...(normName ? [normName] : [])
  ]));
  saveDeletedChannels(updatedDeleted);

  // 2. Remove from custom cached channels
  const currentCustom = getCachedCustomChannels();
  const updatedCustom = currentCustom.filter(c => {
    const cId = (c.id || '').trim().toLowerCase();
    const cName = (c.name || '').trim().toLowerCase();
    if (normId && (cId === normId || cName === normId)) return false;
    if (normName && cName === normName) return false;
    return true;
  });
  cacheCustomChannels(updatedCustom);

  // 3. Sync to Supabase founder bio backup
  await syncCustomChannelsToSupabase(updatedCustom, updatedDeleted);

  // 4. If linked to client profile, delete from Supabase profiles
  if (clientId) {
    try {
      await supabase.from('profiles').delete().eq('id', clientId);
    } catch (pe) {
      console.warn('Profile deletion note:', pe);
    }
  }

  // 5. Notify all components
  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new CustomEvent('channels-updated'));

  return fetchAllChannels();
}
