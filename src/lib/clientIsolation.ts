import { Profile, Deliverable, Recording, PublishingLog } from '../types';

/**
 * Extracts brand name from client profile full_name e.g.:
 * "AK (LLBS)" -> "LLBS"
 * "Acme Corp" -> "Acme Corp"
 */
export const getClientBrandName = (client: Profile | null | undefined): string => {
  if (!client || !client.full_name) return '';
  const match = client.full_name.match(/\(([^)]+)\)/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return client.full_name.trim();
};

/**
 * Determine if a recording belongs strictly to this client
 */
export const isRecordingForClient = (rec: Recording, client: Profile): boolean => {
  if (!client) return false;
  if (rec.registered_by === client.id) return true;
  const brand = getClientBrandName(client).toLowerCase();
  const clientName = (client.full_name || '').toLowerCase();
  const notes = (rec.notes || '').toLowerCase();
  const title = (rec.title || '').toLowerCase();
  
  if (notes.includes(`[client: ${client.id.toLowerCase()}]`) || notes.includes(`client: ${client.id.toLowerCase()}`)) {
    return true;
  }
  if (brand && (title.includes(brand) || notes.includes(brand))) {
    return true;
  }
  if (clientName && (title.includes(clientName) || notes.includes(clientName))) {
    return true;
  }
  return false;
};

/**
 * Determine if a deliverable belongs strictly to this client
 */
export const isDeliverableForClient = (
  del: Deliverable, 
  client: Profile, 
  clientRecIds: Set<string>
): boolean => {
  if (!client) return false;
  if (clientRecIds.has(del.recording_id)) return true;
  const brand = getClientBrandName(client).toLowerCase();
  const clientName = (client.full_name || '').toLowerCase();
  const title = (del.title || '').toLowerCase();
  const notes = `${del.approval_notes || ''} ${del.description || ''} ${del.recording_title || ''}`.toLowerCase();
  
  if (notes.includes(`[client: ${client.id.toLowerCase()}]`) || notes.includes(`client: ${client.id.toLowerCase()}`)) {
    return true;
  }
  if (brand && (title.includes(brand) || notes.includes(brand))) {
    return true;
  }
  if (clientName && (title.includes(clientName) || notes.includes(clientName))) {
    return true;
  }
  return false;
};

/**
 * Determine if a publishing log belongs strictly to this client
 */
export const isPublishingLogForClient = (
  log: PublishingLog,
  client: Profile,
  clientDeliverableIds: Set<string>
): boolean => {
  if (!client) return false;
  if (log.deliverable_id && clientDeliverableIds.has(log.deliverable_id)) return true;
  const brand = getClientBrandName(client).toLowerCase();
  const clientName = (client.full_name || '').toLowerCase();
  const channel = (log.channel_name || '').toLowerCase();
  const title = (log.deliverable_title || '').toLowerCase();
  const notes = (log.notes || '').toLowerCase();

  if (notes.includes(`[client: ${client.id.toLowerCase()}]`) || notes.includes(`client: ${client.id.toLowerCase()}`)) {
    return true;
  }
  if (brand && (channel.includes(brand) || title.includes(brand) || notes.includes(brand))) {
    return true;
  }
  if (clientName && (channel.includes(clientName) || title.includes(clientName) || notes.includes(clientName))) {
    return true;
  }
  return false;
};
