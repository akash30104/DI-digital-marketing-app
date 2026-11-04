import { supabase } from './supabase';

const STORAGE_PURGED_TASKS_KEY = 'STUDIO_PURGED_ALL_TASKS_AT';
const STORAGE_PURGED_RECORDINGS_KEY = 'STUDIO_PURGED_ALL_RECORDINGS_AT';
const STORAGE_PURGED_PUBLISHING_KEY = 'STUDIO_PURGED_ALL_PUBLISHING_AT';
const STORAGE_DELETED_DELIVERABLES_KEY = 'STUDIO_DELETED_DELIVERABLE_IDS';
const STORAGE_DELETED_RECORDINGS_KEY = 'STUDIO_DELETED_RECORDING_IDS';
const STORAGE_DELETED_PUBLISHING_KEY = 'STUDIO_DELETED_PUBLISHING_IDS';

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

export function isTaskDeleted(task: { id: string; created_at?: string; editing_status?: string }): boolean {
  if (!task || !task.id) return false;
  if (task.editing_status === 'cancelled' || task.editing_status === 'deleted') return true;

  const deletedIds = getSet(STORAGE_DELETED_DELIVERABLES_KEY);
  if (deletedIds.has(task.id)) return true;

  const purgeAt = localStorage.getItem(STORAGE_PURGED_TASKS_KEY);
  if (purgeAt) {
    if (!task.created_at || new Date(task.created_at).getTime() <= new Date(purgeAt).getTime()) {
      return true;
    }
  }

  return false;
}

export function filterDeliverables<T extends { id: string; created_at?: string; editing_status?: string }>(tasks: T[]): T[] {
  if (!Array.isArray(tasks)) return [];
  return tasks.filter(t => !isTaskDeleted(t));
}

export function isRecordingDeleted(rec: { id: string; created_at?: string }): boolean {
  if (!rec || !rec.id) return false;
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

export function isPublishingLogDeleted(log: { id: string; published_at?: string; created_at?: string }): boolean {
  if (!log || !log.id) return false;
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
 * Purges all recordings / podcasts and linked deliverables
 */
export async function purgeAllRecordings(idsToPurge?: string[]): Promise<void> {
  localStorage.setItem(STORAGE_PURGED_RECORDINGS_KEY, new Date().toISOString());
  if (idsToPurge && idsToPurge.length > 0) {
    addManyToSet(STORAGE_DELETED_RECORDINGS_KEY, idsToPurge);
  }

  // Also purge all deliverables linked to these recordings
  await purgeAllDeliverables();

  // Attempt hard DELETE on recordings
  try {
    await supabase.from('recordings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  } catch (e) {
    console.warn('Delete recordings note:', e);
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
