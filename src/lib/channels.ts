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
 * Syncs custom channels and deleted blacklist to Supabase (founder profile bio backup)
 */
async function syncCustomChannelsToSupabase(
  customChannels: ChannelItem[],
  deletedChannels?: string[]
): Promise<void> {
  try {
    const { data: founderProfile } = await supabase
      .from('profiles')
      .select('id, bio')
      .eq('role', 'founder')
      .limit(1)
      .maybeSingle();

    if (!founderProfile) return;

    let existingBio = founderProfile.bio || '';
    const targetsMatch = existingBio.match(/(TARGETS:[^\n]+)/);
    const targetsPrefix = targetsMatch ? targetsMatch[1] : '';

    const channelsJson = JSON.stringify(customChannels);
    const delList = deletedChannels || getDeletedChannels();
    const deletedJson = JSON.stringify(delList);

    const parts: string[] = [];
    if (targetsPrefix) parts.push(targetsPrefix);
    parts.push(`CHANNELS:${channelsJson}`);
    parts.push(`DELETED_CHANNELS:${deletedJson}`);

    await supabase
      .from('profiles')
      .update({ bio: parts.join('\n') })
      .eq('id', founderProfile.id);
  } catch (err) {
    console.warn('Could not sync channels to Supabase bio:', err);
  }
}

/**
 * Loads custom channels and deleted blacklist from Supabase backup
 */
async function loadCustomChannelsFromSupabase(): Promise<{
  channels: ChannelItem[];
  deleted: string[];
}> {
  try {
    const { data: founderProfile } = await supabase
      .from('profiles')
      .select('bio')
      .eq('role', 'founder')
      .limit(1)
      .maybeSingle();

    if (founderProfile?.bio) {
      let channels: ChannelItem[] = [];
      let deleted: string[] = [];

      const match = founderProfile.bio.match(/CHANNELS:([^\n]+)/);
      if (match && match[1]) {
        try {
          channels = JSON.parse(match[1]);
        } catch (e) {}
      }

      const delMatch = founderProfile.bio.match(/DELETED_CHANNELS:([^\n]+)/);
      if (delMatch && delMatch[1]) {
        try {
          deleted = JSON.parse(delMatch[1]);
        } catch (e) {}
      }

      return { channels, deleted };
    }
  } catch (err) {
    console.warn('Could not read channels from Supabase bio:', err);
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
          addUnique({
            id: `logged-${name.toLowerCase().replace(/\s+/g, '-')}`,
            name,
            source: 'custom'
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
    source: 'custom',
    created_at: new Date().toISOString()
  };

  const currentCustom = getCachedCustomChannels();
  const updatedCustom = [newChannel, ...currentCustom];

  cacheCustomChannels(updatedCustom);
  await syncCustomChannelsToSupabase(updatedCustom, updatedDeleted);

  return fetchAllChannels();
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
