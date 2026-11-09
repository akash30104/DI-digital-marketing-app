import { supabase } from './supabase';
import { Profile } from '../types';

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
 * Syncs custom channels to Supabase (founder profile bio backup)
 */
async function syncCustomChannelsToSupabase(customChannels: ChannelItem[]): Promise<void> {
  try {
    const { data: founderProfile } = await supabase
      .from('profiles')
      .select('id, bio')
      .eq('role', 'founder')
      .limit(1)
      .maybeSingle();

    if (!founderProfile) return;

    let existingBio = founderProfile.bio || '';
    // Preserve existing TARGETS tag if present
    const targetsMatch = existingBio.match(/(TARGETS:[^\n]+)/);
    const targetsPrefix = targetsMatch ? targetsMatch[1] : '';

    const channelsJson = JSON.stringify(customChannels);
    const newBio = targetsPrefix 
      ? `${targetsPrefix}\nCHANNELS:${channelsJson}`
      : `CHANNELS:${channelsJson}`;

    await supabase
      .from('profiles')
      .update({ bio: newBio })
      .eq('id', founderProfile.id);
  } catch (err) {
    console.warn('Could not sync channels to Supabase bio:', err);
  }
}

/**
 * Loads custom channels from Supabase backup
 */
async function loadCustomChannelsFromSupabase(): Promise<ChannelItem[]> {
  try {
    const { data: founderProfile } = await supabase
      .from('profiles')
      .select('bio')
      .eq('role', 'founder')
      .limit(1)
      .maybeSingle();

    if (founderProfile?.bio) {
      const match = founderProfile.bio.match(/CHANNELS:([^\n]+)/);
      if (match && match[1]) {
        return JSON.parse(match[1]);
      }
    }
  } catch (err) {
    console.warn('Could not read channels from Supabase bio:', err);
  }
  return [];
}

/**
 * Combines:
 * 1. Default studio channels
 * 2. Custom channels added by Founder/SMM
 * 3. Client channels (automatically generated if a client is added)
 * 4. Channels found in past publishing logs
 */
export async function fetchAllChannels(): Promise<ChannelItem[]> {
  const result: ChannelItem[] = [];
  const seenNames = new Set<string>();

  const addUnique = (item: ChannelItem) => {
    const norm = item.name.trim().toLowerCase();
    if (!norm || seenNames.has(norm)) return;
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
  let customChannels = getCachedCustomChannels();
  try {
    const remoteCustom = await loadCustomChannelsFromSupabase();
    if (remoteCustom && remoteCustom.length > 0) {
      // Merge unique
      const existingIds = new Set(customChannels.map(c => c.id));
      remoteCustom.forEach(rc => {
        if (!existingIds.has(rc.id)) {
          customChannels.push(rc);
        }
      });
      cacheCustomChannels(customChannels);
    }
  } catch (err) {
    console.warn('Failed to load remote custom channels:', err);
  }

  customChannels.forEach(c => {
    addUnique({
      ...c,
      source: 'custom'
    });
  });

  // 3. AUTOMATIC CLIENT SYNC: If client is added in profiles, ensure their channel exists
  try {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (profiles) {
      const clientProfiles = profiles.filter(p => 
        p.role === 'client' || (p.full_name && p.full_name.includes('(') && p.role !== 'founder')
      );

      clientProfiles.forEach(client => {
        const brand = extractClientBrandName(client);
        if (brand) {
          // If brand doesn't already have 'Podcast' or 'Channel', format nicely
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

          // Also allow bare brand name if distinct
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

  return result;
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
  await syncCustomChannelsToSupabase(updatedCustom);

  return fetchAllChannels();
}

/**
 * Removes a custom channel (callable by Social Media Manager and Founder)
 */
export async function removeChannel(channelId: string): Promise<ChannelItem[]> {
  const currentCustom = getCachedCustomChannels();
  const updatedCustom = currentCustom.filter(c => c.id !== channelId && c.name.toLowerCase() !== channelId.toLowerCase());

  cacheCustomChannels(updatedCustom);
  await syncCustomChannelsToSupabase(updatedCustom);

  return fetchAllChannels();
}
