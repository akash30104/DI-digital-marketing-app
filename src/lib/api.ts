import { supabase } from './supabase';
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
  try {
    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      return data as Invitation[];
    }
  } catch {
    // fallback
  }
  return getLocal<Invitation[]>(STORAGE_KEYS.INVITATIONS, []);
}

export const getInvitations = fetchInvitations;

export async function getInvitationByToken(rawToken: string): Promise<Invitation | null> {
  const cleanToken = extractInvitationToken(rawToken);
  if (!cleanToken) return null;

  // Check if token was marked redeemed locally
  const redeemed = getLocal<string[]>('di_redeemed_tokens', []);
  const isRedeemed = redeemed.includes(cleanToken);

  // 1. Try decoding self-contained / legacy token
  const decoded = decodeInvitationToken(cleanToken);

  // 2. Also check local storage (origin device has full record)
  const localInvs = getLocal<Invitation[]>(STORAGE_KEYS.INVITATIONS, []);
  const localMatch = localInvs.find(i => i.token === cleanToken || i.token === rawToken);

  // 3. Try database if available
  let dbMatch: Invitation | null = null;
  try {
    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('token', cleanToken)
      .maybeSingle();

    if (!error && data) {
      dbMatch = data as Invitation;
    }
  } catch {}

  const finalInv = dbMatch || localMatch || decoded;
  if (!finalInv) return null;

  // Check revocation locally
  const revoked = getLocal<string[]>('di_revoked_tokens', []);
  if (revoked.includes(cleanToken) || finalInv.status === 'revoked') {
    return { ...finalInv, status: 'revoked' };
  }

  // Check redeemed status
  if (isRedeemed || finalInv.status === 'accepted') {
    return { ...finalInv, status: 'accepted' };
  }

  // Check expiration
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
    setLocal('di_redeemed_tokens', redeemed);
  }
  const invs = getLocal<Invitation[]>(STORAGE_KEYS.INVITATIONS, []);
  const updated = invs.map(i => (i.token === clean || i.token === token) ? { ...i, status: 'accepted' as const, accepted_at: new Date().toISOString() } : i);
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
  const updated = invs.map(i => (i.id === idOrToken || i.token === clean || i.token === idOrToken) ? { ...i, status: 'revoked' as const } : i);
  setLocal(STORAGE_KEYS.INVITATIONS, updated);

  try {
    await supabase.from('invitations').update({ status: 'revoked' }).or(`id.eq.${idOrToken},token.eq.${clean}`);
  } catch {}
  return true;
}

// ==============================================================================
// USER PROFILES & SUSPENSION
// ==============================================================================
export async function fetchProfiles(): Promise<Profile[]> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      return data as Profile[];
    }
  } catch {
    // fallback
  }
  return getLocal<Profile[]>(STORAGE_KEYS.PROFILES, []);
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
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      return data as Client[];
    }
  } catch {
    // fallback
  }
  return getLocal<Client[]>(STORAGE_KEYS.CLIENTS, [
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
  try {
    let q = supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (clientId) {
      q = q.eq('client_id', clientId);
    }
    const { data, error } = await q;
    if (!error && data && data.length > 0) {
      return data as Project[];
    }
  } catch {
    // fallback
  }

  const all = getLocal<Project[]>(STORAGE_KEYS.PROJECTS, [
    {
      id: 'proj-llbs-podcast',
      client_id: 'client-llbs',
      client_name: 'LLBS Media Group',
      client_brand: 'LLBS',
      name: 'Unfiltered Podcast Season 2',
      description: 'Weekly long-form podcast with 8 short-form vertical reels per episode.',
      start_date: new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0],
      deadline: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      required_videos_count: 8,
      platforms: ['youtube_shorts', 'instagram_reels', 'youtube_full'],
      channels: ['LLBS Podcast', 'Digital Inertia'],
      requires_client_approval: true,
      status: 'active',
      created_at: new Date().toISOString()
    }
  ]);

  return clientId ? all.filter(p => p.client_id === clientId) : all;
}

export async function createProject(data: Omit<Project, 'id' | 'created_at' | 'updated_at'>): Promise<Project> {
  const proj: Project = {
    ...data,
    id: crypto.randomUUID ? crypto.randomUUID() : `proj-${Date.now()}`,
    status: data.status || 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    const { error } = await supabase.from('projects').insert([proj]);
    if (error && error.message.includes('schema cache')) {
      const list = getLocal<Project[]>(STORAGE_KEYS.PROJECTS, []);
      list.unshift(proj);
      setLocal(STORAGE_KEYS.PROJECTS, list);
    }
  } catch {
    const list = getLocal<Project[]>(STORAGE_KEYS.PROJECTS, []);
    list.unshift(proj);
    setLocal(STORAGE_KEYS.PROJECTS, list);
  }

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
  try {
    await supabase.from('projects').delete().eq('id', id);
  } catch {
    // fallback
  }
  const list = getLocal<Project[]>(STORAGE_KEYS.PROJECTS, []);
  setLocal(STORAGE_KEYS.PROJECTS, list.filter(p => p.id !== id));
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
