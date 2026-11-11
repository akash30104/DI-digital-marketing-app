import { supabase } from './supabase';
import { filterProjects, filterClients, deleteSingleProject, deleteSingleClient, isInternalBrand, isClientDeleted } from './deletionFilter';
import { 
  Client, Project, SocialChannel, Invitation, Deliverable, 
  VideoVersion, ApprovalFeedback, PublishingProof, NotificationItem, 
  AuditLog, Profile, UserRole, PlatformType, Priority, DeliverableType, AspectRatio
} from '../types';

// Fallback Storage Keys (for seamless zero-downtime operation if tables not migrated yet)
const STORAGE_KEYS = {
  CLIENTS: 'di_platform_clients_v2',
  PROJECTS: 'di_platform_projects_v2',
  CHANNELS: 'di_platform_channels_v2',
  INVITATIONS: 'di_platform_invitations_v2',
  VERSIONS: 'di_platform_versions_v2',
  FEEDBACK: 'di_platform_feedback_v2',
  PROOFS: 'di_platform_proofs_v2',
  AUDIT: 'di_platform_audit_v2',
  NOTIFS: 'di_platform_notifs_v2',
  PROFILES: 'di_platform_profiles_v2'
};

const getLocal = <T>(key: string, defaultValue: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
};

const setLocal = <T>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event('storage'));
  } catch (e) {
    console.warn('LocalStorage error for key:', key, e);
  }
};

// ==============================================================================
// 1. AUDIT LOGGING SERVICE
// ==============================================================================
export async function logAuditEvent(
  action: string, 
  entityType: string, 
  entityId?: string, 
  details?: Record<string, any>,
  user?: Profile | null
): Promise<void> {
  const logItem: AuditLog = {
    id: crypto.randomUUID ? crypto.randomUUID() : `audit-${Date.now()}-${Math.random()}`,
    user_id: user?.id,
    actor_id: user?.id,
    user_email: user?.email,
    actor_email: user?.email,
    user_role: user?.role,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details: details || {},
    created_at: new Date().toISOString()
  };

  try {
    const { error } = await supabase.from('audit_logs').insert([logItem]);
    if (error && error.message.includes('schema cache')) {
      const logs = getLocal<AuditLog[]>(STORAGE_KEYS.AUDIT, []);
      logs.unshift(logItem);
      setLocal(STORAGE_KEYS.AUDIT, logs.slice(0, 500));
    }
  } catch {
    const logs = getLocal<AuditLog[]>(STORAGE_KEYS.AUDIT, []);
    logs.unshift(logItem);
    setLocal(STORAGE_KEYS.AUDIT, logs.slice(0, 500));
  }
}

export async function createAuditLog(
  action: string,
  entityType: string,
  entityId?: string,
  actorId?: string,
  actorEmail?: string,
  details?: Record<string, any>
): Promise<void> {
  const logItem: AuditLog = {
    id: crypto.randomUUID ? crypto.randomUUID() : `audit-${Date.now()}-${Math.random()}`,
    user_id: actorId,
    actor_id: actorId,
    user_email: actorEmail,
    actor_email: actorEmail,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details: details || {},
    created_at: new Date().toISOString()
  };

  try {
    const { error } = await supabase.from('audit_logs').insert([logItem]);
    if (error && error.message.includes('schema cache')) {
      const logs = getLocal<AuditLog[]>(STORAGE_KEYS.AUDIT, []);
      logs.unshift(logItem);
      setLocal(STORAGE_KEYS.AUDIT, logs.slice(0, 500));
    }
  } catch {
    const logs = getLocal<AuditLog[]>(STORAGE_KEYS.AUDIT, []);
    logs.unshift(logItem);
    setLocal(STORAGE_KEYS.AUDIT, logs.slice(0, 500));
  }
}

export async function fetchAuditLogs(limit = 100): Promise<AuditLog[]> {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && data && data.length > 0) {
      return data as AuditLog[];
    }
  } catch {
    // fallback
  }
  return getLocal<AuditLog[]>(STORAGE_KEYS.AUDIT, []).slice(0, limit);
}

export const getAuditLogs = fetchAuditLogs;

// ==============================================================================
// 2. NOTIFICATIONS SERVICE
// ==============================================================================
export async function createNotification(
  userId: string,
  title: string,
  body: string,
  link?: string,
  type?: NotificationItem['type']
): Promise<void> {
  const notif: NotificationItem = {
    id: crypto.randomUUID ? crypto.randomUUID() : `notif-${Date.now()}`,
    user_id: userId,
    title,
    body,
    link,
    type: type || 'system',
    is_read: false,
    created_at: new Date().toISOString()
  };

  try {
    const { error } = await supabase.from('notifications').insert([{
      id: notif.id,
      user_id: notif.user_id,
      title: notif.title,
      body: notif.body,
      is_read: false
    }]);

    if (error) {
      const list = getLocal<NotificationItem[]>(STORAGE_KEYS.NOTIFS, []);
      list.unshift(notif);
      setLocal(STORAGE_KEYS.NOTIFS, list.slice(0, 200));
    }
  } catch {
    const list = getLocal<NotificationItem[]>(STORAGE_KEYS.NOTIFS, []);
    list.unshift(notif);
    setLocal(STORAGE_KEYS.NOTIFS, list.slice(0, 200));
  }
}

export async function fetchNotifications(userId: string): Promise<NotificationItem[]> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      return data.map((d: any) => ({
        id: d.id,
        user_id: d.user_id,
        title: d.title,
        body: d.body || d.message || '',
        link: d.link,
        type: d.type || 'system',
        is_read: !!d.is_read,
        created_at: d.created_at
      }));
    }
  } catch {
    // fallback
  }
  return getLocal<NotificationItem[]>(STORAGE_KEYS.NOTIFS, [])
    .filter(n => n.user_id === userId);
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  } catch {
    // fallback
  }
  const list = getLocal<NotificationItem[]>(STORAGE_KEYS.NOTIFS, []);
  const updated = list.map(n => n.id === id ? { ...n, is_read: true } : n);
  setLocal(STORAGE_KEYS.NOTIFS, updated);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  try {
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId);
  } catch {
    // fallback
  }
  const list = getLocal<NotificationItem[]>(STORAGE_KEYS.NOTIFS, []);
  const updated = list.map(n => n.user_id === userId ? { ...n, is_read: true } : n);
  setLocal(STORAGE_KEYS.NOTIFS, updated);
}

export const getInAppNotifications = fetchNotifications;
export const markNotificationAsRead = markNotificationRead;

// ==============================================================================
// 3. INVITATIONS SERVICE (Self-Contained 24-Hour Expiration, Universal Cross-Device)
// ==============================================================================

function toUrlSafeBase64(str: string): string {
  try {
    const utf8Bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < utf8Bytes.length; i++) {
      binary += String.fromCharCode(utf8Bytes[i]);
    }
    const b64 = typeof window !== 'undefined' && window.btoa 
      ? window.btoa(binary) 
      : (typeof Buffer !== 'undefined' ? Buffer.from(binary, 'binary').toString('base64') : '');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch (e) {
    console.error('Base64 encoding error:', e);
    return '';
  }
}

function fromUrlSafeBase64(base64: string): string {
  try {
    let standard = base64.replace(/-/g, '+').replace(/_/g, '/');
    while (standard.length % 4 !== 0) {
      standard += '=';
    }
    const binary = typeof window !== 'undefined' && window.atob 
      ? window.atob(standard) 
      : (typeof Buffer !== 'undefined' ? Buffer.from(standard, 'base64').toString('binary') : '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch (e) {
    return '';
  }
}

export function extractInvitationToken(input: string): string {
  if (!input) return '';
  let cleaned = input.trim();
  
  if (cleaned.includes('?')) {
    const queryPart = cleaned.split('?')[1] || '';
    const match = queryPart.match(/(?:invite|token)=([^&#\s]+)/i);
    if (match && match[1]) {
      cleaned = match[1];
    }
  } else if (cleaned.includes('invite=')) {
    cleaned = cleaned.split('invite=')[1]?.split('&')[0] || cleaned;
  } else if (cleaned.includes('token=')) {
    cleaned = cleaned.split('token=')[1]?.split('&')[0] || cleaned;
  }
  
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {}
  cleaned = cleaned.replace(/^["']|["']$/g, '').trim();
  return cleaned;
}

export function encodeInvitationToken(inv: {
  id: string;
  email: string;
  role: UserRole;
  fullName?: string;
  clientBrand?: string;
  invitedBy?: string;
  createdAt: number;
  expiresAt: number;
}): string {
  const payload = {
    v: 1,
    id: inv.id,
    e: inv.email,
    r: inv.role,
    n: inv.fullName || '',
    b: inv.clientBrand || '',
    by: inv.invitedBy || 'founder',
    c: inv.createdAt,
    x: inv.expiresAt
  };
  return 'inv_' + toUrlSafeBase64(JSON.stringify(payload));
}

export function decodeInvitationToken(rawToken: string): Invitation | null {
  const token = extractInvitationToken(rawToken);
  if (!token) return null;

  // 1. Try decoding self-contained modern token (starts with inv_ followed by base64)
  if (token.startsWith('inv_')) {
    const rawPayload = token.substring(4);
    try {
      const jsonStr = fromUrlSafeBase64(rawPayload);
      if (jsonStr) {
        const p = JSON.parse(jsonStr);
        if (p && p.e && p.r && p.x) {
          const isExpired = Date.now() > p.x;
          return {
            id: p.id || `inv-${p.c || Date.now()}`,
            email: (p.e || '').trim().toLowerCase(),
            role: p.r as UserRole,
            full_name: p.n || undefined,
            client_brand: p.b || undefined,
            client_name: p.b || undefined,
            invited_by: p.by || 'founder',
            token: token,
            expires_at: new Date(p.x).toISOString(),
            status: isExpired ? 'expired' : 'pending',
            created_at: new Date(p.c || (p.x - 24 * 60 * 60 * 1000)).toISOString()
          };
        }
      }
    } catch {
      // Not base64 json, fall through to legacy check
    }

    // 2. Try decoding legacy timestamp-based token: inv_<timestamp>_<random>
    const parts = token.split('_');
    const ts = parseInt(parts[1], 10);
    if (!isNaN(ts) && ts > 1700000000000) {
      const expiresAtMs = ts + 24 * 60 * 60 * 1000;
      const isExpired = Date.now() > expiresAtMs;
      return {
        id: `legacy-${ts}`,
        email: '',
        role: 'social_media_manager',
        invited_by: 'founder',
        token: token,
        expires_at: new Date(expiresAtMs).toISOString(),
        status: isExpired ? 'expired' : 'pending',
        created_at: new Date(ts).toISOString(),
        is_legacy: true
      };
    }
  }

  return null;
}

export async function createInvitation(
  arg1: {
    email: string;
    role: UserRole;
    fullName?: string;
    clientId?: string;
    clientName?: string;
    clientBrand?: string;
    invitedBy: string;
  } | string,
  role?: UserRole,
  invitedBy?: string,
  clientBrand?: string
): Promise<Invitation> {
  let email: string;
  let r: UserRole;
  let invBy: string;
  let fullName: string | undefined;
  let clientName: string | undefined;

  if (typeof arg1 === 'object') {
    email = arg1.email;
    r = arg1.role;
    invBy = arg1.invitedBy;
    fullName = arg1.fullName;
    clientName = arg1.clientName || arg1.clientBrand;
  } else {
    email = arg1;
    r = role || 'editor';
    invBy = invitedBy || 'founder';
    clientName = clientBrand;
  }

  const now = Date.now();
  const expiresAtMs = now + 24 * 60 * 60 * 1000; // 24 hours
  const expiresAt = new Date(expiresAtMs).toISOString();
  const invId = crypto.randomUUID ? crypto.randomUUID() : `inv-${now}`;

  // Self-contained universal token readable on any browser/device without DB query
  const token = encodeInvitationToken({
    id: invId,
    email: email.trim().toLowerCase(),
    role: r,
    fullName: fullName?.trim(),
    clientBrand: clientName?.trim(),
    invitedBy: invBy,
    createdAt: now,
    expiresAt: expiresAtMs
  });

  const inv: Invitation = {
    id: invId,
    email: email.trim().toLowerCase(),
    role: r,
    full_name: fullName?.trim(),
    client_name: clientName?.trim(),
    client_brand: clientName?.trim(),
    invited_by: invBy,
    token,
    expires_at: expiresAt,
    status: 'pending',
    created_at: new Date(now).toISOString()
  };

  // Always store in localStorage for local device dashboard
  const invs = getLocal<Invitation[]>(STORAGE_KEYS.INVITATIONS, []);
  invs.unshift(inv);
  setLocal(STORAGE_KEYS.INVITATIONS, invs);

  // Attempt to write to Supabase if table exists
  try {
    await supabase.from('invitations').insert([inv]);
  } catch {}

  return inv;
}

export async function fetchInvitations(): Promise<Invitation[]> {
  const localList = getLocal<Invitation[]>(STORAGE_KEYS.INVITATIONS, []);
  const deletedInvs = new Set(getLocal<string[]>('STUDIO_DELETED_INVITATION_IDS', []));
  
  // Exclude any deleted or revoked invitations so deleted accounts disappear completely from UI
  const cleanList = localList.filter(i => 
    i.status !== 'revoked' && 
    !deletedInvs.has(i.id) && 
    !deletedInvs.has(i.token) &&
    !isClientDeleted({ full_name: i.full_name, brand_name: i.client_brand || i.client_name, email: i.email })
  );

  // Permanently purge revoked or deleted invitations from localStorage
  if (cleanList.length !== localList.length) {
    setLocal(STORAGE_KEYS.INVITATIONS, cleanList);
  }

  const redeemed = getLocal<string[]>('di_redeemed_tokens', []);
  const redeemedEmails = getLocal<string[]>('di_redeemed_emails', []);
  const redeemedIds = getLocal<string[]>('di_redeemed_invitation_ids', []);

  // Fetch registered profiles from Supabase to automatically sync accepted invitations
  let registeredEmails: string[] = [];
  try {
    const { data: profs } = await supabase.from('profiles').select('email');
    if (profs && profs.length > 0) {
      registeredEmails = profs.map(p => (p.email || '').trim().toLowerCase()).filter(Boolean);
    }
  } catch {}

  const synced = cleanList.map(inv => {
    const clean = extractInvitationToken(inv.token);
    const emailClean = (inv.email || '').trim().toLowerCase();
    const isRedeemed = 
      inv.status === 'accepted' ||
      redeemed.includes(clean) ||
      redeemed.includes(inv.token) ||
      (inv.id && redeemedIds.includes(inv.id)) ||
      (emailClean && (redeemedEmails.includes(emailClean) || registeredEmails.includes(emailClean)));

    if (isRedeemed) {
      return {
        ...inv,
        status: 'accepted' as const,
        expires_at: new Date(0).toISOString() // Once redeemed, immediately expired!
      };
    }
    return inv;
  });

  // Filter out any revoked or explicitly deleted items
  return synced.filter(i => 
    i.status !== 'revoked' && 
    !deletedInvs.has(i.id) && 
    !deletedInvs.has(i.token) && 
    !isClientDeleted({ full_name: i.full_name, brand_name: i.client_brand || i.client_name, email: i.email })
  );
}

export const getInvitations = fetchInvitations;

export async function getInvitationByToken(rawToken: string): Promise<Invitation | null> {
  const cleanToken = extractInvitationToken(rawToken);
  if (!cleanToken) return null;

  // Check if token was marked redeemed locally
  const redeemed = getLocal<string[]>('di_redeemed_tokens', []);
  const redeemedIds = getLocal<string[]>('di_redeemed_invitation_ids', []);
  const redeemedEmails = getLocal<string[]>('di_redeemed_emails', []);

  const isRedeemedLocal = 
    redeemed.includes(cleanToken) || 
    redeemed.includes(rawToken);

  // 1. Try decoding self-contained / legacy token
  const decoded = decodeInvitationToken(cleanToken);

  // 2. Also check local storage (origin device has full record)
  const localInvs = getLocal<Invitation[]>(STORAGE_KEYS.INVITATIONS, []);
  const localMatch = localInvs.find(i => 
    i.token === cleanToken || 
    i.token === rawToken || 
    (decoded && i.id === decoded.id)
  );

  const finalInv = localMatch || decoded;
  if (!finalInv) return null;

  const invEmail = (finalInv.email || decoded?.email || '').trim().toLowerCase();
  const invId = finalInv.id || decoded?.id;

  // 3. Immediately expire if token, id, or email was redeemed locally
  if (
    isRedeemedLocal || 
    finalInv.status === 'accepted' || 
    (invId && redeemedIds.includes(invId)) || 
    (invEmail && redeemedEmails.includes(invEmail))
  ) {
    return { ...finalInv, status: 'accepted', expires_at: new Date(0).toISOString() };
  }

  // 4. Check if account already exists locally for this email
  if (invEmail && typeof localStorage !== 'undefined') {
    const creds = localStorage.getItem(`di_team_creds_${invEmail}`);
    if (creds) {
      markInvitationAccepted(cleanToken);
      return { ...finalInv, status: 'accepted', expires_at: new Date(0).toISOString() };
    }
  }

  // 5. Cross-device check: Check if token, invite ID, or user was already registered in Supabase
  try {
    const safeInvId = invId ? invId.replace(/[^a-zA-Z0-9_-]/g, '') : '';
    const safeTokenAlphanum = cleanToken.replace(/[^a-zA-Z0-9]/g, '').substring(0, 30);

    const { data: allProfs } = await supabase
      .from('profiles')
      .select('id, email, avatar_url, bio');

    if (allProfs && allProfs.length > 0) {
      const match = allProfs.find(p => {
        const pEmail = (p.email || '').trim().toLowerCase();
        const pAvatar = p.avatar_url || '';
        const pBio = p.bio || '';

        // 1. Matches fixed invite email
        if (invEmail && pEmail === invEmail) return true;
        // 2. Matches invitation ID in avatar_url or bio
        if (safeInvId && (pAvatar.includes(safeInvId) || pBio.includes(safeInvId))) return true;
        // 3. Matches token signature in avatar_url or bio
        if (safeTokenAlphanum && (pAvatar.includes(safeTokenAlphanum) || pBio.includes(safeTokenAlphanum))) return true;

        return false;
      });

      if (match) {
        markInvitationAccepted(cleanToken);
        if (invId) {
          const rIds = getLocal<string[]>('di_redeemed_invitation_ids', []);
          if (!rIds.includes(invId)) { rIds.push(invId); setLocal('di_redeemed_invitation_ids', rIds); }
        }
        return { 
          ...finalInv, 
          status: 'accepted', 
          expires_at: new Date(0).toISOString() 
        };
      }
    }

    // Also check invitations table if exists
    try {
      const { data: dbInv } = await supabase
        .from('invitations')
        .select('*')
        .or(`id.eq.${invId},token.eq.${cleanToken}`)
        .maybeSingle();

      if (dbInv && (dbInv.status === 'accepted' || dbInv.status === 'revoked')) {
        markInvitationAccepted(cleanToken);
        return { ...finalInv, status: dbInv.status, expires_at: new Date(0).toISOString() };
      }
    } catch {}
  } catch {}

  // Check revocation locally
  const revoked = getLocal<string[]>('di_revoked_tokens', []);
  if (revoked.includes(cleanToken) || finalInv.status === 'revoked') {
    return { ...finalInv, status: 'revoked' };
  }

  // Check expiration (past 24 hours or marked expired)
  if (new Date(finalInv.expires_at).getTime() < Date.now()) {
    return { ...finalInv, status: 'expired' };
  }

  return finalInv;
}

export function markInvitationAccepted(token: string): void {
  const clean = extractInvitationToken(token);
  const redeemed = getLocal<string[]>('di_redeemed_tokens', []);
  if (!redeemed.includes(clean)) {
    redeemed.push(clean);
  }
  if (!redeemed.includes(token)) {
    redeemed.push(token);
  }
  setLocal('di_redeemed_tokens', redeemed);

  const decoded = decodeInvitationToken(clean);
  if (decoded?.id) {
    const redeemedIds = getLocal<string[]>('di_redeemed_invitation_ids', []);
    if (!redeemedIds.includes(decoded.id)) {
      redeemedIds.push(decoded.id);
      setLocal('di_redeemed_invitation_ids', redeemedIds);
    }
  }

  if (decoded?.email) {
    const cleanE = decoded.email.trim().toLowerCase();
    const redeemedEmails = getLocal<string[]>('di_redeemed_emails', []);
    if (!redeemedEmails.includes(cleanE)) {
      redeemedEmails.push(cleanE);
      setLocal('di_redeemed_emails', redeemedEmails);
    }
  }

  const invs = getLocal<Invitation[]>(STORAGE_KEYS.INVITATIONS, []);
  const updated = invs.map(i => {
    const isMatch = 
      i.token === clean || 
      i.token === token || 
      (decoded && i.id === decoded.id) || 
      (decoded?.email && i.email?.toLowerCase() === decoded.email.toLowerCase());

    if (isMatch) {
      return {
        ...i,
        status: 'accepted' as const,
        accepted_at: new Date().toISOString(),
        expires_at: new Date(0).toISOString() // Expire immediately upon redemption!
      };
    }
    return i;
  });
  setLocal(STORAGE_KEYS.INVITATIONS, updated);
}

export async function revokeInvitation(idOrToken: string): Promise<boolean> {
  const clean = extractInvitationToken(idOrToken);
  const revoked = getLocal<string[]>('di_revoked_tokens', []);
  if (!revoked.includes(clean)) {
    revoked.push(clean);
    setLocal('di_revoked_tokens', revoked);
  }

  const invs = getLocal<Invitation[]>(STORAGE_KEYS.INVITATIONS, []);
  const targetInv = invs.find(i => i.id === idOrToken || i.token === clean || i.token === idOrToken);

  // If this invitation was for a client partner, purge the client workspace immediately
  if (targetInv && (targetInv.role === 'client' || targetInv.client_brand || targetInv.client_name)) {
    const brandName = targetInv.client_brand || targetInv.client_name;
    deleteSingleClient('', brandName);
    if (targetInv.email) deleteSingleClient('', targetInv.email);
  }

  // Remove revoked invitation completely from local list so it disappears permanently
  const updated = invs.filter(i => i.id !== idOrToken && i.token !== clean && i.token !== idOrToken);
  setLocal(STORAGE_KEYS.INVITATIONS, updated);

  try {
    await supabase.from('invitations').update({ status: 'revoked' }).or(`id.eq.${idOrToken},token.eq.${clean}`);
    await supabase.from('invitations').delete().or(`id.eq.${idOrToken},token.eq.${clean}`);
  } catch {}
  return true;
}

export async function deleteInvitation(idOrToken: string, tokenParam?: string): Promise<boolean> {
  const clean = extractInvitationToken(tokenParam || idOrToken);

  // 1. Invalidate token permanently
  const revoked = getLocal<string[]>('di_revoked_tokens', []);
  if (clean && !revoked.includes(clean)) revoked.push(clean);
  if (!revoked.includes(idOrToken)) revoked.push(idOrToken);
  setLocal('di_revoked_tokens', revoked);

  // 2. Mark as deleted in deletion set
  const deletedInvs = getLocal<string[]>('STUDIO_DELETED_INVITATION_IDS', []);
  if (!deletedInvs.includes(idOrToken)) deletedInvs.push(idOrToken);
  if (clean && !deletedInvs.includes(clean)) deletedInvs.push(clean);
  setLocal('STUDIO_DELETED_INVITATION_IDS', deletedInvs);

  // 3. Remove from local storage & purge any associated client workspace
  const invs = getLocal<Invitation[]>(STORAGE_KEYS.INVITATIONS, []);
  const targetInv = invs.find(i => i.id === idOrToken || i.token === clean || i.token === idOrToken);
  if (targetInv && (targetInv.role === 'client' || targetInv.client_brand || targetInv.client_name)) {
    const brandName = targetInv.client_brand || targetInv.client_name;
    deleteSingleClient('', brandName);
    if (targetInv.email) deleteSingleClient('', targetInv.email);
  }

  const filtered = invs.filter(i => i.id !== idOrToken && i.token !== clean && i.token !== idOrToken);
  setLocal(STORAGE_KEYS.INVITATIONS, filtered);

  // 4. Delete from Supabase invitations table if exists
  try {
    await supabase.from('invitations').delete().or(`id.eq.${idOrToken},token.eq.${clean}`);
  } catch {}

  return true;
}

// ==============================================================================
// USER PROFILES & SUSPENSION
// ==============================================================================
export async function fetchProfiles(): Promise<Profile[]> {
  let list: Profile[] = [];
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      list = data as Profile[];
    }
  } catch {
    // fallback
  }
  if (list.length === 0) {
    list = getLocal<Profile[]>(STORAGE_KEYS.PROFILES, []);
  }
  return list.filter(p => !isClientDeleted(p));
}

export const getProfiles = fetchProfiles;

export async function updateProfileRole(userId: string, newRole: UserRole): Promise<boolean> {
  try {
    const { error } = await supabase.from('profiles').update({ role: newRole, updated_at: new Date().toISOString() }).eq('id', userId);
    return !error;
  } catch {
    return false;
  }
}

export async function toggleUserSuspension(userId: string, isSuspended: boolean): Promise<boolean> {
  try {
    const { error } = await supabase.from('profiles').update({ is_suspended: isSuspended, updated_at: new Date().toISOString() }).eq('id', userId);
    return !error;
  } catch {
    return false;
  }
}

// ==============================================================================
// 4. CLIENTS SERVICE (Isolated Workspaces)
// ==============================================================================
export async function fetchClients(): Promise<Client[]> {
  let clients: Client[] = [];
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      clients = data as Client[];
    }
  } catch {
    // fallback
  }

  if (clients.length === 0) {
    clients = getLocal<Client[]>(STORAGE_KEYS.CLIENTS, [
      {
        id: 'client-llbs',
        name: 'LLBS Media Group',
        brand_name: 'LLBS',
        contact_name: 'Arjun Kumar',
        email: 'arjun@llbsmedia.com',
        phone: '+91 98765 43210',
        status: 'active',
        notes: 'Weekly Podcast & Reel Production',
        created_at: new Date(Date.now() - 30 * 86400000).toISOString()
      },
      {
        id: 'client-pulse',
        name: 'Pulse Fitness India',
        brand_name: 'PulseFit',
        contact_name: 'Sarah Mitchell',
        email: 'marketing@pulsefit.in',
        phone: '+91 98765 12345',
        status: 'active',
        notes: 'Daily Fitness Tips & YouTube Shorts',
        created_at: new Date(Date.now() - 15 * 86400000).toISOString()
      }
    ]);
  }

  return filterClients(clients);
}

export async function createClient(data: Omit<Client, 'id' | 'created_at' | 'updated_at'>): Promise<Client> {
  const client: Client = {
    ...data,
    id: crypto.randomUUID ? crypto.randomUUID() : `client-${Date.now()}`,
    status: data.status || 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    const { error } = await supabase.from('clients').insert([client]);
    if (error && error.message.includes('schema cache')) {
      const clients = getLocal<Client[]>(STORAGE_KEYS.CLIENTS, []);
      clients.unshift(client);
      setLocal(STORAGE_KEYS.CLIENTS, clients);
    }
  } catch {
    const clients = getLocal<Client[]>(STORAGE_KEYS.CLIENTS, []);
    clients.unshift(client);
    setLocal(STORAGE_KEYS.CLIENTS, clients);
  }

  return client;
}

export async function updateClient(id: string, updates: Partial<Client>): Promise<void> {
  try {
    await supabase.from('clients').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
  } catch {
    // fallback
  }
  const clients = getLocal<Client[]>(STORAGE_KEYS.CLIENTS, []);
  const updated = clients.map(c => c.id === id ? { ...c, ...updates, updated_at: new Date().toISOString() } : c);
  setLocal(STORAGE_KEYS.CLIENTS, updated);
}

export async function deleteClient(id: string): Promise<void> {
  try {
    await supabase.from('clients').delete().eq('id', id);
  } catch {
    // fallback
  }
  const clients = getLocal<Client[]>(STORAGE_KEYS.CLIENTS, []);
  setLocal(STORAGE_KEYS.CLIENTS, clients.filter(c => c.id !== id));
}

// ==============================================================================
// 5. PROJECTS SERVICE
// ==============================================================================
export async function fetchProjects(clientId?: string): Promise<Project[]> {
  const localProjects = getLocal<Project[]>(STORAGE_KEYS.PROJECTS, []);
  let all: Project[] = [...localProjects];

  try {
    let q = supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (clientId) {
      q = q.eq('client_id', clientId);
    }
    const { data, error } = await q;
    if (!error && data && data.length > 0) {
      const dbIds = new Set(data.map((p: any) => p.id));
      const localOnly = localProjects.filter(p => !dbIds.has(p.id));
      all = [...(data as Project[]), ...localOnly];
    }
  } catch {
    // fallback
  }

  // Purge any residual mock project from localStorage
  const cleanProjects = all.filter(p => p.id !== 'proj-llbs-podcast' && !p.name?.toLowerCase().includes('unfiltered podcast'));
  if (cleanProjects.length !== localProjects.length) {
    setLocal(STORAGE_KEYS.PROJECTS, cleanProjects);
  }

  const cleanList = filterProjects(cleanProjects);
  return clientId ? cleanList.filter(p => p.client_id === clientId) : cleanList;
}

export async function createProject(data: Omit<Project, 'id' | 'created_at' | 'updated_at'>): Promise<Project> {
  const proj: Project = {
    ...data,
    id: crypto.randomUUID ? crypto.randomUUID() : `proj-${Date.now()}`,
    status: data.status || 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // 1. Immediately store in local cache so UI, board & editor workspace reflect it instantly
  const list = getLocal<Project[]>(STORAGE_KEYS.PROJECTS, []);
  const clean = list.filter(p => p.id !== proj.id);
  clean.unshift(proj);
  setLocal(STORAGE_KEYS.PROJECTS, clean);

  // 2. Try Supabase insert with schema-compliant payload
  try {
    const isValidUuid = (val?: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val || '');
    const dbPayload: Record<string, any> = {
      name: proj.name,
      description: proj.description || null,
      status: proj.status || 'active',
      start_date: proj.start_date || null,
      deadline: proj.deadline || null,
      platforms: proj.platforms || []
    };
    if (isValidUuid(proj.id)) dbPayload.id = proj.id;
    if (isValidUuid(proj.client_id)) dbPayload.client_id = proj.client_id;
    if (isValidUuid(proj.smm_id)) dbPayload.assigned_smm_id = proj.smm_id;
    await supabase.from('projects').insert([dbPayload]);
  } catch (e) {
    console.warn('DB project insert note:', e);
  }

  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new CustomEvent('channels-updated'));

  return proj;
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<void> {
  try {
    await supabase.from('projects').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
  } catch {
    // fallback
  }
  const list = getLocal<Project[]>(STORAGE_KEYS.PROJECTS, []);
  const updated = list.map(p => p.id === id ? { ...p, ...updates, updated_at: new Date().toISOString() } : p);
  setLocal(STORAGE_KEYS.PROJECTS, updated);
}

export async function deleteProject(id: string): Promise<void> {
  await deleteSingleProject(id);
  const list = getLocal<Project[]>(STORAGE_KEYS.PROJECTS, []);
  setLocal(STORAGE_KEYS.PROJECTS, list.filter(p => p.id !== id));
}

export async function deleteFounderProfile(): Promise<void> {
  try {
    await supabase.from('profiles').delete().eq('role', 'founder');
  } catch {}

  const profs = getLocal<Profile[]>(STORAGE_KEYS.PROFILES, []);
  setLocal(STORAGE_KEYS.PROFILES, profs.filter(p => p.role !== 'founder'));

  try {
    localStorage.removeItem('DI_PLATFORM_FOUNDER_CLAIMED');
  } catch {}
}

// ==============================================================================
// 6. SOCIAL MEDIA CHANNELS SERVICE
// ==============================================================================
export async function fetchSocialChannels(clientId?: string): Promise<SocialChannel[]> {
  try {
    let q = supabase.from('social_channels').select('*').order('created_at', { ascending: false });
    if (clientId) {
      q = q.eq('client_id', clientId);
    }
    const { data, error } = await q;
    if (!error && data && data.length > 0) {
      return data as SocialChannel[];
    }
  } catch {
    // fallback
  }

  const all = getLocal<SocialChannel[]>(STORAGE_KEYS.CHANNELS, [
    {
      id: 'chan-1',
      client_id: 'client-llbs',
      client_name: 'LLBS Media Group',
      platform: 'youtube',
      channel_name: 'LLBS Podcast Official',
      channel_url: 'https://youtube.com/@llbspodcast',
      is_active: true,
      created_at: new Date().toISOString()
    },
    {
      id: 'chan-2',
      client_id: 'client-llbs',
      client_name: 'LLBS Media Group',
      platform: 'instagram',
      channel_name: '@llbs.media',
      channel_url: 'https://instagram.com/llbs.media',
      is_active: true,
      created_at: new Date().toISOString()
    },
    {
      id: 'chan-3',
      platform: 'youtube',
      channel_name: 'Digital Inertia Studio',
      channel_url: 'https://youtube.com/@digitalinertia',
      is_active: true,
      created_at: new Date().toISOString()
    }
  ]);

  return clientId ? all.filter(c => c.client_id === clientId) : all;
}

export async function createSocialChannel(data: Omit<SocialChannel, 'id' | 'created_at' | 'updated_at'>): Promise<SocialChannel> {
  const chan: SocialChannel = {
    ...data,
    id: crypto.randomUUID ? crypto.randomUUID() : `chan-${Date.now()}`,
    is_active: data.is_active !== undefined ? data.is_active : true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    const { error } = await supabase.from('social_channels').insert([chan]);
    if (error && error.message.includes('schema cache')) {
      const list = getLocal<SocialChannel[]>(STORAGE_KEYS.CHANNELS, []);
      list.unshift(chan);
      setLocal(STORAGE_KEYS.CHANNELS, list);
    }
  } catch {
    const list = getLocal<SocialChannel[]>(STORAGE_KEYS.CHANNELS, []);
    list.unshift(chan);
    setLocal(STORAGE_KEYS.CHANNELS, list);
  }

  return chan;
}

export async function deleteSocialChannel(id: string): Promise<void> {
  try {
    await supabase.from('social_channels').delete().eq('id', id);
  } catch {
    // fallback
  }
  const list = getLocal<SocialChannel[]>(STORAGE_KEYS.CHANNELS, []);
  setLocal(STORAGE_KEYS.CHANNELS, list.filter(c => c.id !== id));
}

// ==============================================================================
// 7. TASK VERSIONS & APPROVAL FEEDBACK
// ==============================================================================
export async function recordTaskVersion(version: Omit<VideoVersion, 'id' | 'submitted_at'>): Promise<VideoVersion> {
  const item: VideoVersion = {
    ...version,
    id: crypto.randomUUID ? crypto.randomUUID() : `ver-${Date.now()}`,
    submitted_at: new Date().toISOString()
  };

  try {
    const { error } = await supabase.from('video_versions').insert([item]);
    if (error && error.message.includes('schema cache')) {
      const list = getLocal<VideoVersion[]>(STORAGE_KEYS.VERSIONS, []);
      list.unshift(item);
      setLocal(STORAGE_KEYS.VERSIONS, list);
    }
  } catch {
    const list = getLocal<VideoVersion[]>(STORAGE_KEYS.VERSIONS, []);
    list.unshift(item);
    setLocal(STORAGE_KEYS.VERSIONS, list);
  }

  return item;
}

export async function fetchTaskVersions(taskId: string): Promise<VideoVersion[]> {
  try {
    const { data, error } = await supabase
      .from('video_versions')
      .select('*')
      .eq('task_id', taskId)
      .order('version_number', { ascending: false });

    if (!error && data && data.length > 0) {
      return data as VideoVersion[];
    }
  } catch {
    // fallback
  }
  const list = getLocal<VideoVersion[]>(STORAGE_KEYS.VERSIONS, []);
  return list.filter(v => v.task_id === taskId);
}

export async function recordApprovalFeedback(feedback: Omit<ApprovalFeedback, 'id' | 'created_at'>): Promise<ApprovalFeedback> {
  const item: ApprovalFeedback = {
    ...feedback,
    id: crypto.randomUUID ? crypto.randomUUID() : `fb-${Date.now()}`,
    created_at: new Date().toISOString()
  };

  try {
    const { error } = await supabase.from('approval_feedback').insert([item]);
    if (error && error.message.includes('schema cache')) {
      const list = getLocal<ApprovalFeedback[]>(STORAGE_KEYS.FEEDBACK, []);
      list.unshift(item);
      setLocal(STORAGE_KEYS.FEEDBACK, list);
    }
  } catch {
    const list = getLocal<ApprovalFeedback[]>(STORAGE_KEYS.FEEDBACK, []);
    list.unshift(item);
    setLocal(STORAGE_KEYS.FEEDBACK, list);
  }

  return item;
}

export async function fetchTaskFeedback(taskId: string): Promise<ApprovalFeedback[]> {
  try {
    const { data, error } = await supabase
      .from('approval_feedback')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      return data as ApprovalFeedback[];
    }
  } catch {
    // fallback
  }
  const list = getLocal<ApprovalFeedback[]>(STORAGE_KEYS.FEEDBACK, []);
  return list.filter(f => f.task_id === taskId);
}

// ==============================================================================
// 8. PUBLISHING PROOF SERVICE (Mandatory)
// ==============================================================================
export async function submitPublishingProof(proof: Omit<PublishingProof, 'id' | 'created_at'>): Promise<PublishingProof> {
  const item: PublishingProof = {
    ...proof,
    id: crypto.randomUUID ? crypto.randomUUID() : `proof-${Date.now()}`,
    created_at: new Date().toISOString()
  };

  try {
    const { error } = await supabase.from('publishing_proofs').insert([item]);
    if (error && error.message.includes('schema cache')) {
      const list = getLocal<PublishingProof[]>(STORAGE_KEYS.PROOFS, []);
      list.unshift(item);
      setLocal(STORAGE_KEYS.PROOFS, list);
    }
  } catch {
    const list = getLocal<PublishingProof[]>(STORAGE_KEYS.PROOFS, []);
    list.unshift(item);
    setLocal(STORAGE_KEYS.PROOFS, list);
  }

  // Also update deliverable status to published
  try {
    await supabase.from('deliverables').update({
      editing_status: 'published',
      updated_at: new Date().toISOString()
    }).eq('id', proof.task_id);
  } catch (e) {
    console.warn('Could not update deliverable status to published:', e);
  }

  // Also record in publishing_logs table for legacy analytics sync
  try {
    await supabase.from('publishing_logs').insert([{
      deliverable_id: proof.task_id,
      recording_id: proof.project_id || proof.task_id,
      platform: proof.platform,
      publication_status: 'published',
      published_by: proof.publisher_id,
      published_at: proof.published_at,
      post_url: proof.post_url,
      channel_name: proof.channel_name,
      notes: proof.notes || 'Verified live post proof submitted',
      reporting_date: proof.published_at.split('T')[0]
    }]);
  } catch (e) {
    console.warn('Could not mirror publishing log:', e);
  }

  return item;
}

export async function fetchPublishingProofs(clientId?: string): Promise<PublishingProof[]> {
  try {
    let q = supabase.from('publishing_proofs').select('*').order('created_at', { ascending: false });
    if (clientId) {
      q = q.eq('client_id', clientId);
    }
    const { data, error } = await q;
    if (!error && data && data.length > 0) {
      return data as PublishingProof[];
    }
  } catch {
    // fallback
  }

  const list = getLocal<PublishingProof[]>(STORAGE_KEYS.PROOFS, []);
  return clientId ? list.filter(p => p.client_id === clientId) : list;
}

export const getClients = fetchClients;
export const getProjects = fetchProjects;
export const getSocialChannels = fetchSocialChannels;
