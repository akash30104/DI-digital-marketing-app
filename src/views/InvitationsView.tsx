import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole, Invitation, Profile } from '../types';
import { 
  createInvitation, getInvitations, revokeInvitation, 
  createAuditLog, getProfiles, updateProfileRole, toggleUserSuspension,
  deleteFounderProfile
} from '../lib/api';
import { supabase } from '../lib/supabase';
import { 
  Users, Mail, Plus, Copy, Check, Clock, 
  Trash2, RefreshCw, ShieldAlert, CheckCircle2, 
  Crown, Megaphone, Film, Briefcase, ExternalLink, Send
} from 'lucide-react';

export const InvitationsView: React.FC = () => {
  const { currentUser, role } = useAuth();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'invites' | 'members'>('invites');

  // New Invite Form State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('social_media_manager');
  const [clientBrand, setClientBrand] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdInvite, setCreatedInvite] = useState<Invitation | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    const [invs, profiles] = await Promise.all([
      getInvitations(),
      getProfiles(),
    ]);
    setInvitations(invs);
    setTeamMembers(profiles);
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    const inv = await createInvitation(
      inviteEmail.trim().toLowerCase(),
      inviteRole,
      currentUser.id,
      inviteRole === 'client' ? clientBrand.trim() : undefined
    );

    setIsSubmitting(false);

    if (inv) {
      setCreatedInvite(inv);
      setInvitations(prev => [inv, ...prev]);
      setInviteEmail('');
      setClientBrand('');
      await createAuditLog(
        'invite_sent',
        'invitations',
        inv.id,
        currentUser.id,
        currentUser.email,
        { email: inv.email, role: inv.role, client_brand: inv.client_brand }
      );
    } else {
      setErrorMessage('Failed to generate invitation. Please check your network connection.');
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this invitation? The link will become immediately invalid.')) return;
    const ok = await revokeInvitation(id);
    if (ok) {
      setInvitations(prev => prev.map(inv => inv.id === id ? { ...inv, status: 'revoked' } : inv));
      if (currentUser) {
        await createAuditLog('invite_revoked', 'invitations', id, currentUser.id, currentUser.email, { id });
      }
    }
  };

  const handleToggleSuspension = async (member: Profile) => {
    const newStatus = !member.is_suspended;
    const actionWord = newStatus ? 'suspend' : 'reinstate';
    if (!confirm(`Are you sure you want to ${actionWord} ${member.full_name || member.email}?`)) return;

    const ok = await toggleUserSuspension(member.id, newStatus);
    if (ok) {
      setTeamMembers(prev => prev.map(m => m.id === member.id ? { ...m, is_suspended: newStatus } : m));
      if (currentUser) {
        await createAuditLog(
          newStatus ? 'user_suspended' : 'user_reinstated',
          'profiles',
          member.id,
          currentUser.id,
          currentUser.email,
          { target_email: member.email, suspended: newStatus }
        );
      }
    }
  };

  const handleDeleteMember = async (member: Profile) => {
    if (member.role === 'founder') {
      alert('The Founder account is protected and cannot be deleted.');
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently delete profile "${member.full_name || member.email}"?`)) return;
    try {
      await supabase.from('profiles').delete().eq('id', member.id);
    } catch {}
    setTeamMembers(prev => prev.filter(m => m.id !== member.id));
    if (currentUser) {
      await createAuditLog('profile_deleted', 'profiles', member.id, currentUser.id, currentUser.email, { email: member.email, role: member.role });
    }
  };

  const copyToClipboard = (token: string) => {
    const link = `${window.location.origin}/?invite=${token}`;
    navigator.clipboard.writeText(link);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt).getTime() < Date.now();
  };

  const formatRole = (r: UserRole) => {
    switch (r) {
      case 'founder': return 'Founder';
      case 'social_media_manager': return 'Social Media Manager';
      case 'editor': return 'Video Editor';
      case 'client': return 'Client Partner';
      default: return r;
    }
  };

  const getRoleIcon = (r: UserRole) => {
    switch (r) {
      case 'founder': return <Crown className="w-3.5 h-3.5" />;
      case 'social_media_manager': return <Megaphone className="w-3.5 h-3.5" />;
      case 'editor': return <Film className="w-3.5 h-3.5" />;
      case 'client': return <Briefcase className="w-3.5 h-3.5" />;
      default: return <Users className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Team &amp; Invitations</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Manage organization members, issue 24-hour single-use invitation tokens, and control workspace access.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={() => { setInviteRole('editor'); setShowInviteModal(true); setCreatedInvite(null); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-zinc-200 text-black rounded-xl text-xs font-black shadow-lg transition active:scale-[0.99] shrink-0"
            title="Invite a new Video Editor"
          >
            <Film className="w-4 h-4" />
            <span>+ Invite Editor</span>
          </button>
          <button
            onClick={() => { setInviteRole('social_media_manager'); setShowInviteModal(true); setCreatedInvite(null); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold border border-zinc-700 transition active:scale-[0.99] shrink-0"
            title="Invite a new Social Media Manager"
          >
            <Megaphone className="w-4 h-4 text-white" />
            <span>+ Invite SMM</span>
          </button>
          <button
            onClick={() => { setInviteRole('client'); setShowInviteModal(true); setCreatedInvite(null); }}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-xl text-xs font-bold border border-zinc-800 transition active:scale-[0.99] shrink-0"
            title="Invite a Client Partner"
          >
            <Briefcase className="w-4 h-4 text-zinc-400" />
            <span>+ Invite Client</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
          <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Active Members</span>
          <div className="text-2xl font-black text-white mt-1">
            {teamMembers.filter(m => !m.is_suspended).length}
          </div>
        </div>

        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
          <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Pending Invitations</span>
          <div className="text-2xl font-black text-white mt-1">
            {invitations.filter(i => i.status === 'pending' && !isExpired(i.expires_at)).length}
          </div>
        </div>

        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
          <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Accepted Invites</span>
          <div className="text-2xl font-black text-white mt-1">
            {invitations.filter(i => i.status === 'accepted').length}
          </div>
        </div>

        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
          <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Suspended Accounts</span>
          <div className="text-2xl font-black text-white mt-1">
            {teamMembers.filter(m => m.is_suspended).length}
          </div>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex border-b border-zinc-800 gap-6 text-xs font-bold">
        <button
          onClick={() => setActiveSubTab('invites')}
          className={`pb-3 relative transition ${
            activeSubTab === 'invites' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <span>Invitations Queue ({invitations.length})</span>
          {activeSubTab === 'invites' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('members')}
          className={`pb-3 relative transition ${
            activeSubTab === 'members' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <span>Active Team &amp; Clients ({teamMembers.length})</span>
          {activeSubTab === 'members' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
          )}
        </button>
      </div>

      {/* Invitations Table */}
      {activeSubTab === 'invites' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/40 text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
                  <th className="py-3 px-4">Invitee Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Client Brand</th>
                  <th className="py-3 px-4">Expires In</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {invitations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-zinc-500">
                      No invitations issued yet. Click "Invite Member or Client" to send one.
                    </td>
                  </tr>
                ) : (
                  invitations.map((inv) => {
                    const expired = isExpired(inv.expires_at);
                    const link = `${window.location.origin}/?invite=${inv.token}`;
                    return (
                      <tr key={inv.id} className="hover:bg-zinc-800/40 transition">
                        <td className="py-3 px-4 font-semibold text-white">
                          {inv.email}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 border border-zinc-700 text-zinc-200">
                            {getRoleIcon(inv.role)}
                            {formatRole(inv.role)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-zinc-400">
                          {inv.client_brand || '—'}
                        </td>
                        <td className="py-3 px-4 text-zinc-400">
                          {inv.status === 'accepted' ? (
                            <span className="text-zinc-500 font-bold">Redeemed &amp; Expired</span>
                          ) : expired ? (
                            <span className="text-zinc-500 font-bold">Expired</span>
                          ) : (
                            <span className="flex items-center gap-1 text-zinc-300">
                              <Clock className="w-3 h-3 text-zinc-500" />
                              {new Date(inv.expires_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {inv.status === 'accepted' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-zinc-800 text-zinc-400 border border-zinc-700">
                              Redeemed (Expired)
                            </span>
                          ) : inv.status === 'revoked' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-500">
                              Revoked
                            </span>
                          ) : expired ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-400">
                              Expired
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-200 border border-zinc-700">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {inv.status === 'pending' && !expired && (
                              <>
                                <button
                                  onClick={() => copyToClipboard(inv.token)}
                                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition"
                                  title="Copy Invitation Link"
                                >
                                  {copiedToken === inv.token ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  onClick={() => handleRevoke(inv.id)}
                                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition"
                                  title="Revoke Invitation"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Team Members Table */}
      {activeSubTab === 'members' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/40 text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
                  <th className="py-3 px-4">Member Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Access Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {teamMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-zinc-800/40 transition">
                    <td className="py-3 px-4 font-bold text-white">
                      {member.full_name || 'Unnamed Member'}
                    </td>
                    <td className="py-3 px-4 text-zinc-300">
                      {member.email}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 border border-zinc-700 text-zinc-200">
                        {getRoleIcon(member.role)}
                        {formatRole(member.role)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {member.is_suspended ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-zinc-800 text-zinc-400 border border-zinc-700">
                          Suspended
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-white text-black">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {member.role !== 'founder' && (
                          <button
                            onClick={() => handleToggleSuspension(member)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                              member.is_suspended
                                ? 'bg-white text-black font-black hover:bg-zinc-200'
                                : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                            }`}
                          >
                            {member.is_suspended ? 'Reactivate' : 'Suspend'}
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteMember(member)}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition"
                          title="Delete Profile"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE INVITATION MODAL */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-white" />
                <h2 className="text-base font-black text-white">Generate 24-Hour Invitation</h2>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-zinc-500 hover:text-white text-xs font-bold"
              >
                Close ✕
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white">
                {errorMessage}
              </div>
            )}

            {!createdInvite ? (
              <form onSubmit={handleCreateInvitation} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1.5 flex items-center justify-between">
                    <span>Invitee Email Address</span>
                    <span className="text-[10px] text-zinc-500 font-normal">Optional (leave blank for universal link)</span>
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="editor@agency.com (or leave blank for shareable token)"
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                    Workspace Role
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as UserRole)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500 font-semibold"
                  >
                    <option value="editor">🎬 Video Editor (Assign editing cuts & tasks)</option>
                    <option value="social_media_manager">📣 Social Media Manager (SMM - review & publish)</option>
                    <option value="client">💼 External Client Partner (Brand deliverables)</option>
                  </select>
                </div>

                {inviteRole === 'client' && (
                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                      Client Brand / Company Name
                    </label>
                    <input
                      type="text"
                      required
                      value={clientBrand}
                      onChange={(e) => setClientBrand(e.target.value)}
                      placeholder="e.g. Acme Health, Nike Fitness"
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                    />
                    <p className="text-[11px] text-zinc-500 mt-1">
                      Client will be restricted strictly to their brand workspace.
                    </p>
                  </div>
                )}

                <div className="p-3 bg-black border border-zinc-800 rounded-xl space-y-1 text-xs text-zinc-400">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-white" />
                    <span>24-Hour Expiry Policy</span>
                  </div>
                  <p className="text-[11px]">
                    This link expires in exactly 24 hours and becomes single-use. Once redeemed, the token is permanently invalidated.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 rounded-xl text-xs font-black bg-white hover:bg-zinc-200 text-black shadow-lg transition active:scale-[0.99] disabled:opacity-50"
                  >
                    {isSubmitting ? 'Generating Token...' : 'Create Invitation Link'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-zinc-800/80 border border-zinc-700 rounded-2xl flex items-center gap-2.5 text-white text-xs">
                  <CheckCircle2 className="w-5 h-5 text-white shrink-0" />
                  <span>Invitation created successfully for <strong>{createdInvite.email}</strong>!</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                    One-Time Invitation Link
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/?invite=${createdInvite.token}`}
                      className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border border-zinc-800 bg-black text-white focus:outline-none"
                    />
                    <button
                      onClick={() => copyToClipboard(createdInvite.token)}
                      className="px-4 py-2.5 bg-white text-black font-black rounded-xl text-xs flex items-center gap-1.5 shrink-0 hover:bg-zinc-200 transition"
                    >
                      {copiedToken === createdInvite.token ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedToken === createdInvite.token ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                {/* Branded Email Template Preview */}
                <div className="p-4 bg-black border border-zinc-800 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-400 border-b border-zinc-800 pb-2">
                    <span>Branded Email Invitation Preview</span>
                    <a
                      href={`mailto:${createdInvite.email}?subject=${encodeURIComponent("You're invited to Digital Inertia Video Platform")}&body=${encodeURIComponent(`Hello,\n\nYou have been invited to join the Digital Inertia Video Management Platform as a ${formatRole(createdInvite.role)}.\n\nClick the link below to set your password and access your workspace (valid for 24 hours):\n${window.location.origin}/?invite=${createdInvite.token}\n\nBest regards,\nDigital Inertia Team`)}`}
                      className="text-white hover:underline flex items-center gap-1 text-[11px]"
                    >
                      <Send className="w-3 h-3" />
                      <span>Send via Mailto</span>
                    </a>
                  </div>

                  <div className="text-xs text-zinc-300 space-y-2 font-sans bg-zinc-950 p-3 rounded-xl border border-zinc-800/80">
                    <div className="font-bold text-white">Subject: You're invited to Digital Inertia Video Platform</div>
                    <p>Hello,</p>
                    <p>
                      You have been invited by {currentUser?.full_name || 'Management'} to join Digital Inertia as a <strong>{formatRole(createdInvite.role)}</strong>
                      {createdInvite.client_brand && ` for ${createdInvite.client_brand}`}.
                    </p>
                    <div className="py-1">
                      <span className="inline-block px-3 py-1.5 rounded-lg bg-white text-black font-black text-xs">
                        Activate Account &rarr;
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500">
                      Link valid for 24 hours: {window.location.origin}/?invite={createdInvite.token}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => { setShowInviteModal(false); setCreatedInvite(null); }}
                    className="px-5 py-2.5 rounded-xl text-xs font-black bg-white hover:bg-zinc-200 text-black shadow-lg transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
