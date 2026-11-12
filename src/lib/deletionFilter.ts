import { supabase } from './supabase';

const STORAGE_PURGED_TASKS_KEY = 'STUDIO_PURGED_ALL_TASKS_AT';
const STORAGE_PURGED_RECORDINGS_KEY = 'STUDIO_PURGED_ALL_RECORDINGS_AT';
const STORAGE_PURGED_PUBLISHING_KEY = 'STUDIO_PURGED_ALL_PUBLISHING_AT';
const STORAGE_PURGED_PROJECTS_KEY = 'STUDIO_PURGED_ALL_PROJECTS_AT';
const STORAGE_PURGED_CLIENTS_KEY = 'STUDIO_PURGED_ALL_CLIENTS_AT';
const STORAGE_DELETED_DELIVERABLES_KEY = 'STUDIO_DELETED_DELIVERABLE_IDS';
const STORAGE_DELETED_RECORDINGS_KEY = 'STUDIO_DELETED_RECORDING_IDS';
const STORAGE_DELETED_PUBLISHING_KEY = 'STUDIO_DELETED_PUBLISHING_IDS';
const STORAGE_DELETED_CLIENTS_KEY = 'STUDIO_DELETED_CLIENT_IDS';
const STORAGE_DELETED_CLIENT_NAMES_KEY = 'STUDIO_DELETED_CLIENT_NAMES';
const STORAGE_DELETED_PROJECTS_KEY = 'STUDIO_DELETED_PROJECT_IDS';

function getSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function addToSet(key: string, id: string) {
  try {
    const set = getSet(key);
    set.add(id);
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch (e) {
    console.error('Failed to update deletion set:', e);
  }
}

function addManyToSet(key: string, ids: string[]) {
  try {
    const set = getSet(key);
    ids.forEach(id => set.add(id));
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch (e) {
    console.error('Failed to update deletion set:', e);
  }
}

export function isTaskDeleted(task: { 
  id: string; 
  created_at?: string; 
  editing_status?: string;
  updated_at?: string;
  progress_percentage?: number;
  final_video_link?: string;
  preview_link?: string;
}): boolean {
  if (!task || !task.id) return false;
  if (task.editing_status === 'cancelled' || task.editing_status === 'deleted') return true;

  const deletedIds = getSet(STORAGE_DELETED_DELIVERABLES_KEY);
  if (deletedIds.has(task.id)) return true;

  const purgeAt = localStorage.getItem(STORAGE_PURGED_TASKS_KEY);
  if (purgeAt) {
    if (task.updated_at && new Date(task.updated_at).getTime() > new Date(purgeAt).getTime()) {
      return false;
    }
    if (!task.created_at || new Date(task.created_at).getTime() <= new Date(purgeAt).getTime()) {
      return true;
    }
  }

  // Active work with edited video links or progress is never deleted
  if ((task.progress_percentage || 0) > 0 || task.final_video_link || task.preview_link) {
    return false;
  }

  // Tasks explicitly stored in active project deliverables cache are never deleted
  try {
    const rawP = localStorage.getItem('di_project_deliverables');
    if (rawP && rawP.includes(task.id)) {
      return false;
    }
  } catch {}

  return false;
}

export function filterDeliverables<T extends { id: string; created_at?: string; editing_status?: string }>(tasks: T[]): T[] {
  if (!Array.isArray(tasks)) return [];
  return tasks.filter(t => !isTaskDeleted(t));
}

export function isDeliverablePublished(
  task: {
    id?: string;
    editing_status?: string;
    publication_status?: string;
    approval_notes?: string;
    description?: string;
    title?: string;
    notes?: string;
  },
  publishedIds?: Set<string>
): boolean {
  if (!task) return false;

  // 1. Explicit published status
  if (task.editing_status === 'published' || task.publication_status === 'published') {
    return true;
  }

  // 2. Known published task ID set from publishing_logs or proofs
  if (task.id && publishedIds && publishedIds.has(task.id)) {
    return true;
  }

  // 3. Check local storage publishing caches & proofs
  if (task.id) {
    try {
      const proofsRaw = localStorage.getItem('di_platform_proofs_v2');
      if (proofsRaw && proofsRaw.includes(task.id)) return true;

      const logsRaw = localStorage.getItem('di_publishing_logs_v2');
      if (logsRaw && logsRaw.includes(task.id)) return true;

      const progressCache = localStorage.getItem('di_deliverable_progress_cache');
      if (progressCache) {
        const parsed = JSON.parse(progressCache);
        if (parsed[task.id]?.editing_status === 'published') return true;
        if (parsed[task.id]?.approval_notes && /published to|& published|approved & published/i.test(parsed[task.id].approval_notes)) {
          return true;
        }
      }
    } catch {}
  }

  // 4. Content / note keywords indicating publication
  const text = `${task.approval_notes || ''} ${task.description || ''} ${task.notes || ''} ${task.title || ''}`.toLowerCase();
  if (
    text.includes('approved & published') ||
    text.includes('& published to') ||
    text.includes('published to') ||
    text.includes('already published') ||
    text.includes('publication proof submitted') ||
    text.includes('proof submitted')
  ) {
    return true;
  }

  return false;
}

export function isRecordingDeleted(rec: { id: string; created_at?: string; folder_path?: string; title?: string }): boolean {
  if (!rec || !rec.id) return false;
  if (
    rec.id === 'system-channels-config' || 
    rec.folder_path === '/system/channels' || 
    (rec.title && rec.title.startsWith('[SystemConfig]'))
  ) {
    return true;
  }
  const deletedIds = getSet(STORAGE_DELETED_RECORDINGS_KEY);
  if (deletedIds.has(rec.id)) return true;

  const purgeAt = localStorage.getItem(STORAGE_PURGED_RECORDINGS_KEY);
  if (purgeAt) {
    if (!rec.created_at || new Date(rec.created_at).getTime() <= new Date(purgeAt).getTime()) {
      return true;
    }
  }

  return false;
}

export function filterRecordings<T extends { id: string; created_at?: string }>(recs: T[]): T[] {
  if (!Array.isArray(recs)) return [];
  return recs.filter(r => !isRecordingDeleted(r));
}

export function isPublishingLogDeleted(log: { id: string; published_at?: string; created_at?: string; notes?: string }): boolean {
  if (!log || !log.id) return false;
  if (log.notes && log.notes.includes('[ChannelConfig]')) return true;
  const deletedIds = getSet(STORAGE_DELETED_PUBLISHING_KEY);
  if (deletedIds.has(log.id)) return true;

  const purgeAt = localStorage.getItem(STORAGE_PURGED_PUBLISHING_KEY);
  if (purgeAt) {
    const timestamp = log.published_at || log.created_at;
    if (!timestamp || new Date(timestamp).getTime() <= new Date(purgeAt).getTime()) {
      return true;
    }
  }

  return false;
}

export function filterPublishingLogs<T extends { id: string; published_at?: string; created_at?: string }>(logs: T[]): T[] {
  if (!Array.isArray(logs)) return [];
  return logs.filter(l => !isPublishingLogDeleted(l));
}

export function isInternalBrand(name?: string | null): boolean {
  if (!name) return true;
  const n = name.trim().toLowerCase();
  return (
    n === '' ||
    n === 'internal' ||
    n === 'internal studio' ||
    n === 'internal studio production' ||
    n === 'studio in-house production' ||
    n === 'studio in-house' ||
    n === 'studio production' ||
    n === 'studio internal' ||
    n === 'studio general' ||
    n === 'studio general (no specific client)' ||
    n === 'studio footage' ||
    n === 'studio' ||
    n === 'direct' ||
    n === 'in-house' ||
    n === 'inhouse' ||
    n.includes('internal studio') ||
    n.includes('studio internal') ||
    n.includes('studio production') ||
    n.includes('studio in-house') ||
    n.includes('studio general') ||
    n.includes('studio footage')
  );
}

const DEFAULT_DELETED_CLIENT_NAMES = new Set([
  'adad',
  'sge',
  'ah',
  'llbsspotlight@gmail.com',
  'srgtterg@gmail.com',
  'vtu23129@veltech.edu.in'
]);

export function isClientDeleted(client: { 
  id?: string; 
  role?: string;
  full_name?: string; 
  email?: string;
  brand_name?: string;
  name?: string;
  company_name?: string;
  created_at?: string;
}): boolean {
  if (!client) return false;

  // IMPORTANT: TEAM MEMBERS (Founders, SMMs, Editors) are NEVER clients and must NEVER be deleted by client filters!
  if (client.role && client.role !== 'client') {
    return false;
  }

  // If this is an external client partner named "ak" (from deleted invite/account), treat as deleted
  if (client.role === 'client') {
    const bName = (client.brand_name || client.name || client.full_name || '').trim().toLowerCase();
    if (bName === 'ak') {
      return true;
    }
  }

  const deletedIds = getSet(STORAGE_DELETED_CLIENTS_KEY);
  if (client.id && deletedIds.has(client.id)) return true;

  const purgeAt = localStorage.getItem(STORAGE_PURGED_CLIENTS_KEY);
  if (purgeAt) {
    if (client.created_at && new Date(client.created_at).getTime() > new Date(purgeAt).getTime()) {
      // newly created client after purge
    } else {
      return true;
    }
  }

  const deletedNames = getSet(STORAGE_DELETED_CLIENT_NAMES_KEY);
  DEFAULT_DELETED_CLIENT_NAMES.forEach(n => deletedNames.add(n));

  // Check any revoked invitations from local storage
  try {
    const rawInvs = localStorage.getItem('di_platform_invitations_v2');
    if (rawInvs) {
      const parsed = JSON.parse(rawInvs);
      if (Array.isArray(parsed)) {
        parsed.forEach((inv: any) => {
          if (inv.status === 'revoked') {
            if (inv.client_brand) deletedNames.add(inv.client_brand.trim().toLowerCase());
            if (inv.client_name) deletedNames.add(inv.client_name.trim().toLowerCase());
            if (inv.email) deletedNames.add(inv.email.trim().toLowerCase());
          }
        });
      }
    }
  } catch {}

  const namesToCheck = [
    client.full_name,
    client.brand_name,
    client.name,
    client.company_name,
    client.email
  ].filter(Boolean).map(s => (s as string).trim().toLowerCase());

  for (const n of namesToCheck) {
    if (deletedNames.has(n)) return true;
    const match = n.match(/\(([^)]+)\)/);
    if (match && match[1] && deletedNames.has(match[1].trim().toLowerCase())) return true;
    const matchPrefix = n.match(/^([^(]+)/);
    if (matchPrefix && matchPrefix[1] && deletedNames.has(matchPrefix[1].trim().toLowerCase())) return true;
  }

  return false;
}

export function filterClients<T extends { 
  id?: string; 
  full_name?: string; 
  email?: string;
  brand_name?: string;
  name?: string;
  company_name?: string;
}>(clients: T[]): T[] {
  if (!Array.isArray(clients)) return [];
  return clients.filter(c => {
    if (isClientDeleted(c)) return false;
    const brand = c.brand_name || c.company_name || c.name || c.full_name;
    if (isInternalBrand(brand)) return false;
    return true;
  });
}

// Immediately purge known removed client workspaces and run global purge of projects, tasks & clients
const AUTO_PURGE_SYNC_KEY = 'STUDIO_GLOBAL_PURGE_PROJECTS_TASKS_CLIENTS_20261111';
try {
  const deletedNames = getSet(STORAGE_DELETED_CLIENT_NAMES_KEY);
  DEFAULT_DELETED_CLIENT_NAMES.forEach(n => deletedNames.add(n));

  const rawInvs = localStorage.getItem('di_platform_invitations_v2');
  if (rawInvs) {
    const parsed = JSON.parse(rawInvs);
    if (Array.isArray(parsed)) {
      parsed.forEach((inv: any) => {
        if (inv.status === 'revoked' || inv.role === 'client') {
          if (inv.client_brand) deletedNames.add(inv.client_brand.trim().toLowerCase());
          if (inv.client_name) deletedNames.add(inv.client_name.trim().toLowerCase());
          if (inv.email) deletedNames.add(inv.email.trim().toLowerCase());
        }
      });
      // Purge revoked and client invites from local list so they don't linger
      const activeInvs = parsed.filter((i: any) => i.status !== 'revoked' && i.role !== 'client');
      localStorage.setItem('di_platform_invitations_v2', JSON.stringify(activeInvs));
    }
  }

  localStorage.setItem(STORAGE_DELETED_CLIENT_NAMES_KEY, JSON.stringify(Array.from(deletedNames)));

  // One-time master purge of all projects, tasks & clients across devices
  if (typeof localStorage !== 'undefined' && localStorage.getItem(AUTO_PURGE_SYNC_KEY) !== 'done') {
    const now = new Date().toISOString();
    localStorage.setItem(STORAGE_PURGED_TASKS_KEY, now);
    localStorage.setItem(STORAGE_PURGED_RECORDINGS_KEY, now);
    localStorage.setItem(STORAGE_PURGED_PROJECTS_KEY, now);
    localStorage.setItem(STORAGE_PURGED_CLIENTS_KEY, now);

    localStorage.removeItem('di_platform_projects_v2');
    localStorage.removeItem('di_platform_clients_v2');
    localStorage.removeItem('di_platform_deliverables_v2');
    localStorage.removeItem('di_project_deliverables');
    localStorage.removeItem('progressCache');
    localStorage.removeItem('di_progress_cache');
    localStorage.removeItem('di_platform_versions_v2');
    localStorage.removeItem('di_platform_feedback_v2');

    const rawProfs = localStorage.getItem('di_platform_profiles_v2');
    if (rawProfs) {
      const parsed = JSON.parse(rawProfs);
      if (Array.isArray(parsed)) {
        localStorage.setItem('di_platform_profiles_v2', JSON.stringify(parsed.filter((p: any) => p.role !== 'client')));
      }
    }

    localStorage.setItem(AUTO_PURGE_SYNC_KEY, 'done');
  }

  // Also clean up Supabase tables asynchronously
  setTimeout(async () => {
    try {
      await supabase.from('deliverables').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('recordings').delete().neq('folder_path', '/system/channels');
      await supabase.from('projects').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('clients').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('profiles').delete().eq('role', 'client');
      await supabase.from('invitations').delete().eq('role', 'client');
      for (const name of Array.from(DEFAULT_DELETED_CLIENT_NAMES)) {
        await supabase.from('clients').delete().ilike('brand_name', name);
        await supabase.from('clients').delete().ilike('name', name);
        await supabase.from('clients').delete().ilike('email', name);
      }
    } catch {}
  }, 100);
} catch {}

export async function deleteSingleClient(clientId: string, clientName?: string): Promise<void> {
  if (clientId) {
    addToSet(STORAGE_DELETED_CLIENTS_KEY, clientId);
  }
  if (clientName) {
    addToSet(STORAGE_DELETED_CLIENT_NAMES_KEY, clientName.trim().toLowerCase());
    const match = clientName.match(/\(([^)]+)\)/);
    if (match && match[1]) {
      addToSet(STORAGE_DELETED_CLIENT_NAMES_KEY, match[1].trim().toLowerCase());
    }
  }

  // Also remove from di_platform_clients_v2 cache
  try {
    const rawClients = localStorage.getItem('di_platform_clients_v2');
    if (rawClients) {
      const parsedClients = JSON.parse(rawClients);
      const toKeepClients = parsedClients.filter((c: any) => {
        const matches = 
          (clientId && (c.id === clientId || c.client_id === clientId)) ||
          (clientName && (
            (c.brand_name && c.brand_name.toLowerCase() === clientName.toLowerCase()) ||
            (c.name && c.name.toLowerCase() === clientName.toLowerCase()) ||
            (c.company_name && c.company_name.toLowerCase() === clientName.toLowerCase()) ||
            (c.email && c.email.toLowerCase() === clientName.toLowerCase())
          ));
        return !matches;
      });
      localStorage.setItem('di_platform_clients_v2', JSON.stringify(toKeepClients));
    }
  } catch {}

  // Delete from Supabase clients table
  try {
    if (clientId) {
      await supabase.from('clients').delete().eq('id', clientId);
    }
    if (clientName) {
      await supabase.from('clients').delete().ilike('brand_name', clientName);
    }
  } catch {}

  // Remove channel association
  try {
    const { removeChannel } = await import('./channels');
    await removeChannel(`client-${clientId}`, clientName, clientId);
  } catch (e) {
    console.warn('Channel removal note on client delete:', e);
  }

  // Hard delete profile from Supabase (strictly client profiles only!)
  try {
    if (clientId) {
      await supabase.from('profiles').delete().eq('role', 'client').eq('id', clientId);
    }
    if (clientName) {
      await supabase.from('profiles').delete().eq('role', 'client').ilike('full_name', `%${clientName}%`);
      await supabase.from('profiles').delete().eq('role', 'client').ilike('email', `%${clientName}%`);
    }
  } catch (e) {
    console.warn('Delete profile note:', e);
  }

  // Also remove associated invitations for this client from local cache & Supabase
  try {
    if (clientId) {
      await supabase.from('invitations').delete().or(`id.eq.${clientId},token.eq.${clientId}`);
    }
    if (clientName) {
      await supabase.from('invitations').delete().ilike('client_brand', clientName);
      await supabase.from('invitations').delete().ilike('email', clientName);
    }
    const raw = localStorage.getItem('di_platform_invitations_v2');
    if (raw) {
      const invs = JSON.parse(raw);
      const toKeep = invs.filter((i: any) => {
        const matchesClient = 
          (clientId && (i.client_id === clientId || i.id === clientId)) ||
          (clientName && (
            (i.client_brand && i.client_brand.toLowerCase() === clientName.toLowerCase()) ||
            (i.client_name && i.client_name.toLowerCase() === clientName.toLowerCase()) ||
            (i.email && i.email.toLowerCase() === clientName.toLowerCase())
          ));
        return !matchesClient;
      });
      localStorage.setItem('di_platform_invitations_v2', JSON.stringify(toKeep));
    }
  } catch {}

  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new CustomEvent('channels-updated'));
}

// ---------------- Action Helpers ----------------

/**
 * Permanently deletes / cancels an individual deliverable task
 */
export async function deleteSingleDeliverable(id: string): Promise<void> {
  // 1. Mark in client storage immediately
  addToSet(STORAGE_DELETED_DELIVERABLES_KEY, id);

  // 2. Set editing_status to 'cancelled' (RLS UPDATE policy allows this)
  try {
    await supabase.from('deliverables').update({
      editing_status: 'cancelled',
      updated_at: new Date().toISOString()
    }).eq('id', id);
  } catch (e) {
    console.warn('Update deliverable to cancelled note:', e);
  }

  // 3. Attempt hard DELETE
  try {
    await supabase.from('deliverables').delete().eq('id', id);
  } catch (e) {
    console.warn('Delete deliverable note:', e);
  }
}

/**
 * Purges all deliverable tasks
 */
export async function purgeAllDeliverables(idsToPurge?: string[]): Promise<void> {
  // 1. Mark purge timestamp and IDs
  localStorage.setItem(STORAGE_PURGED_TASKS_KEY, new Date().toISOString());
  if (idsToPurge && idsToPurge.length > 0) {
    addManyToSet(STORAGE_DELETED_DELIVERABLES_KEY, idsToPurge);
  }

  // 2. Update status of active deliverables to cancelled in Supabase
  try {
    await supabase.from('deliverables').update({
      editing_status: 'cancelled',
      updated_at: new Date().toISOString()
    }).neq('id', '00000000-0000-0000-0000-000000000000');
  } catch (e) {
    console.warn('Update deliverables to cancelled note:', e);
  }

  // 3. Attempt hard DELETE
  try {
    await supabase.from('deliverables').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  } catch (e) {
    console.warn('Delete deliverables note:', e);
  }
}

/**
 * Permanently deletes an individual recording / podcast and its linked deliverables
 */
export async function deleteSingleRecording(id: string): Promise<void> {
  // 1. Mark in client storage immediately
  addToSet(STORAGE_DELETED_RECORDINGS_KEY, id);

  // 2. Cancel and delete all deliverables linked to this recording
  try {
    await supabase.from('deliverables').update({
      editing_status: 'cancelled',
      updated_at: new Date().toISOString()
    }).eq('recording_id', id);
  } catch (e) {
    console.warn('Update deliverables to cancelled note:', e);
  }

  try {
    await supabase.from('deliverables').delete().eq('recording_id', id);
  } catch (e) {
    console.warn('Delete recording deliverables note:', e);
  }

  // 3. Attempt hard DELETE on recording
  try {
    await supabase.from('recordings').delete().eq('id', id);
  } catch (e) {
    console.warn('Delete recording note:', e);
  }
}

/**
 * Purges all recordings / podcasts and linked deliverables
 */
export async function purgeAllRecordings(idsToPurge?: string[]): Promise<void> {
  localStorage.setItem(STORAGE_PURGED_RECORDINGS_KEY, new Date().toISOString());
  if (idsToPurge && idsToPurge.length > 0) {
    addManyToSet(STORAGE_DELETED_RECORDINGS_KEY, idsToPurge);
    for (const id of idsToPurge) {
      await deleteSingleRecording(id);
    }
  } else {
    // Also purge all deliverables linked to these recordings
    await purgeAllDeliverables();

    // Attempt hard DELETE on recordings
    try {
      await supabase.from('recordings').delete().neq('folder_path', '/system/channels');
    } catch (e) {
      console.warn('Delete recordings note:', e);
    }
  }
}

/**
 * Purges all publishing history
 */
export async function purgeAllPublishingHistory(idsToPurge?: string[]): Promise<void> {
  localStorage.setItem(STORAGE_PURGED_PUBLISHING_KEY, new Date().toISOString());
  if (idsToPurge && idsToPurge.length > 0) {
    addManyToSet(STORAGE_DELETED_PUBLISHING_KEY, idsToPurge);
  }

  localStorage.removeItem('di_last_published_log');
  localStorage.removeItem('di_published_history_cache');

  try {
    await supabase.from('publishing_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  } catch (e) {
    console.warn('Delete publishing logs note:', e);
  }
}

/**
 * Deletes a single publishing log entry
 */
export async function deleteSinglePublishingLog(id: string): Promise<void> {
  addToSet(STORAGE_DELETED_PUBLISHING_KEY, id);
  localStorage.removeItem('di_last_published_log');
  localStorage.removeItem('di_published_history_cache');

  try {
    await supabase.from('publishing_logs').delete().eq('id', id);
  } catch (e) {
    console.warn('Delete publishing log note:', e);
  }
}

/**
 * Filter & deletion helpers for Projects
 */
export function isProjectDeleted(project: { id: string; name?: string; created_at?: string }): boolean {
  if (!project || !project.id) return false;
  if (project.id === 'proj-llbs-podcast' || project.name?.toLowerCase().includes('unfiltered podcast')) return true;
  const deletedIds = getSet(STORAGE_DELETED_PROJECTS_KEY);
  if (deletedIds.has(project.id)) return true;

  const purgeAt = localStorage.getItem(STORAGE_PURGED_PROJECTS_KEY);
  if (purgeAt) {
    if (project.created_at && new Date(project.created_at).getTime() > new Date(purgeAt).getTime()) {
      return false;
    }
    return true;
  }

  return false;
}

export function filterProjects<T extends { id: string; created_at?: string }>(projects: T[]): T[] {
  if (!Array.isArray(projects)) return [];
  return projects.filter(p => !isProjectDeleted(p));
}

export async function deleteSingleProject(id: string): Promise<void> {
  addToSet(STORAGE_DELETED_PROJECTS_KEY, id);
  try {
    await supabase.from('projects').delete().eq('id', id);
  } catch (e) {
    console.warn('Delete project note:', e);
  }
}

export async function purgeAllProjects(): Promise<void> {
  localStorage.setItem(STORAGE_PURGED_PROJECTS_KEY, new Date().toISOString());
  localStorage.removeItem('di_platform_projects_v2');
  try {
    await supabase.from('projects').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  } catch (e) {
    console.warn('Delete projects note:', e);
  }
}

export async function purgeAllClients(): Promise<void> {
  localStorage.setItem(STORAGE_PURGED_CLIENTS_KEY, new Date().toISOString());
  localStorage.removeItem('di_platform_clients_v2');

  // Purge client invitations
  try {
    const rawInvs = localStorage.getItem('di_platform_invitations_v2');
    if (rawInvs) {
      const parsed = JSON.parse(rawInvs);
      if (Array.isArray(parsed)) {
        localStorage.setItem('di_platform_invitations_v2', JSON.stringify(parsed.filter((i: any) => i.role !== 'client')));
      }
    }
  } catch {}

  // Purge client profiles
  try {
    const rawProfs = localStorage.getItem('di_platform_profiles_v2');
    if (rawProfs) {
      const parsed = JSON.parse(rawProfs);
      if (Array.isArray(parsed)) {
        localStorage.setItem('di_platform_profiles_v2', JSON.stringify(parsed.filter((p: any) => p.role !== 'client')));
      }
    }
  } catch {}

  try {
    await supabase.from('clients').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  } catch {}
  try {
    await supabase.from('profiles').delete().eq('role', 'client');
  } catch {}
  try {
    await supabase.from('invitations').delete().eq('role', 'client');
  } catch {}
}

export async function purgeAllProjectsTasksAndClients(): Promise<void> {
  const now = new Date().toISOString();
  localStorage.setItem(STORAGE_PURGED_TASKS_KEY, now);
  localStorage.setItem(STORAGE_PURGED_RECORDINGS_KEY, now);
  localStorage.setItem(STORAGE_PURGED_PROJECTS_KEY, now);
  localStorage.setItem(STORAGE_PURGED_CLIENTS_KEY, now);

  localStorage.removeItem('di_platform_projects_v2');
  localStorage.removeItem('di_platform_clients_v2');
  localStorage.removeItem('di_platform_deliverables_v2');
  localStorage.removeItem('di_project_deliverables');
  localStorage.removeItem('progressCache');
  localStorage.removeItem('di_progress_cache');
  localStorage.removeItem('di_platform_versions_v2');
  localStorage.removeItem('di_platform_feedback_v2');

  await Promise.allSettled([
    purgeAllDeliverables(),
    purgeAllRecordings(),
    purgeAllProjects(),
    purgeAllClients()
  ]);

  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new CustomEvent('channels-updated'));
}
