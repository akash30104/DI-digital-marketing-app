import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Project, Client, Profile, SocialChannel } from '../types';
import { getProjects, createProject, updateProject, getClients, getProfiles, getSocialChannels, createAuditLog } from '../lib/api';
import { 
  FolderKanban, Plus, Calendar, CheckCircle2, Clock, 
  Users, Briefcase, Share2, AlertCircle, ArrowUpRight,
  Filter, Search
} from 'lucide-react';

interface ProjectsViewProps {
  onSelectProject?: (project: Project) => void;
  onNavigateTab?: (tab: string) => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({ onSelectProject, onNavigateTab }) => {
  const { currentUser, role } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);
  const [channels, setChannels] = useState<SocialChannel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // New Project Modal
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [smmId, setSmmId] = useState('');
  const [assignedEditorIds, setAssignedEditorIds] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [deadline, setDeadline] = useState('');
  const [requiredVideoCount, setRequiredVideoCount] = useState(10);
  const [platforms, setPlatforms] = useState<string[]>(['instagram_reels', 'youtube_shorts']);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [clientApprovalRequired, setClientApprovalRequired] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    const [projList, clientList, members, chanList] = await Promise.all([
      getProjects(),
      getClients(),
      getProfiles(),
      getSocialChannels(),
    ]);

    setProjects(projList);
    setClients(clientList);
    setTeamMembers(members);
    setChannels(chanList);
    if (clientList.length > 0 && !clientId) {
      setClientId(clientList[0].id);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setIsSubmitting(true);

    const clientObj = clients.find(c => c.id === clientId);
    const smmObj = teamMembers.find(m => m.id === smmId);

    const newProj = await createProject({
      name: name.trim(),
      client_id: clientId || '',
      client_name: clientObj?.brand_name || clientObj?.company_name || clientObj?.name || 'Internal Studio',
      smm_id: smmId || undefined,
      smm_name: smmObj?.full_name || undefined,
      assigned_editor_ids: assignedEditorIds,
      description: description.trim(),
      start_date: startDate,
      deadline: deadline || undefined,
      required_videos_count: Number(requiredVideoCount) || 1,
      required_video_count: Number(requiredVideoCount) || 1,
      platforms: platforms as any,
      channels: selectedChannelIds,
      channel_ids: selectedChannelIds,
      requires_client_approval: clientApprovalRequired,
      approval_requirements: {
        smm_approval_required: true,
        founder_approval_required: true,
        client_approval_required: clientApprovalRequired,
      },
      status: 'active',
    });

    setIsSubmitting(false);

    if (newProj) {
      setProjects(prev => [newProj, ...prev]);
      setShowModal(false);
      resetForm();
      await createAuditLog(
        'project_created',
        'projects',
        newProj.id,
        currentUser.id,
        currentUser.email,
        { name: newProj.name, client: newProj.client_name }
      );
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setDeadline('');
    setRequiredVideoCount(10);
    setPlatforms(['instagram_reels', 'youtube_shorts']);
    setSelectedChannelIds([]);
    setAssignedEditorIds([]);
  };

  const togglePlatform = (p: string) => {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const toggleEditor = (id: string) => {
    setAssignedEditorIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleChannel = (id: string) => {
    setSelectedChannelIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Filtered projects
  const filteredProjects = projects.filter(p => {
    if (selectedClientFilter !== 'all' && p.client_id !== selectedClientFilter) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.client_name || '').toLowerCase().includes(q);
    }
    return true;
  });

  const editors = teamMembers.filter(m => m.role === 'editor' && !m.is_suspended);
  const smms = teamMembers.filter(m => m.role === 'social_media_manager' && !m.is_suspended);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Project Management</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Organize client video deliverables, assign SMMs and editors, and enforce approval pipelines.
          </p>
        </div>

        {(role === 'founder' || role === 'social_media_manager') && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-zinc-200 text-black rounded-xl text-xs font-black shadow-lg transition active:scale-[0.99] shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Project</span>
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-zinc-900 border border-zinc-800 p-3 rounded-2xl">
        <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
          <Search className="w-4 h-4 text-zinc-500 ml-1" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            className="bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none w-full"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          <select
            value={selectedClientFilter}
            onChange={(e) => setSelectedClientFilter(e.target.value)}
            className="px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-300 font-semibold focus:outline-none"
          >
            <option value="all">All Clients</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.brand_name || c.company_name || c.name}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-300 font-semibold focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="on_hold">On Hold</option>
          </select>
        </div>
      </div>

      {/* Project Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProjects.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-zinc-900 border border-zinc-800 rounded-2xl">
            <FolderKanban className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-white">No projects found</h3>
            <p className="text-xs text-zinc-500 mt-1">Create a new project to start organizing video tasks.</p>
          </div>
        ) : (
          filteredProjects.map((p) => {
            const completedCount = p.completed_video_count || 0;
            const targetCount = p.required_video_count || p.required_videos_count || 1;
            const progressPct = Math.min(100, Math.round((completedCount / targetCount) * 100));

            return (
              <div
                key={p.id}
                className="p-5 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-zinc-700 transition flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 border border-zinc-700 text-zinc-300">
                      {p.client_name || 'Studio Project'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      p.status === 'completed'
                        ? 'bg-white text-black'
                        : p.status === 'active'
                        ? 'bg-zinc-800 text-white border border-zinc-700'
                        : 'bg-zinc-800 text-zinc-500'
                    }`}>
                      {p.status}
                    </span>
                  </div>

                  <h3 className="text-base font-black text-white mt-2 leading-snug">
                    {p.name}
                  </h3>

                  {p.description && (
                    <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                      {p.description}
                    </p>
                  )}
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400 font-semibold">Video Deliverables</span>
                    <span className="text-white font-black">{completedCount} / {targetCount} ({progressPct}%)</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white transition-all duration-300 rounded-full"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>

                {/* Details Footer */}
                <div className="pt-3 border-t border-zinc-800/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-zinc-500" />
                      <span>SMM Lead:</span>
                    </span>
                    <span className="text-zinc-200 font-semibold truncate max-w-[150px]">
                      {p.smm_name || 'Unassigned'}
                    </span>
                  </div>

                  {p.deadline && (
                    <div className="flex items-center justify-between text-zinc-400">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Deadline:</span>
                      </span>
                      <span className="text-zinc-200 font-semibold">
                        {new Date(p.deadline).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  )}

                  {/* Platforms */}
                  {p.platforms && p.platforms.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {p.platforms.map(plat => (
                        <span key={plat} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-950 border border-zinc-800 text-zinc-400 uppercase">
                          {plat.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* CREATE PROJECT MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <FolderKanban className="w-5 h-5 text-white" />
                <h2 className="text-base font-black text-white">Create New Project</h2>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-zinc-500 hover:text-white text-xs font-bold"
              >
                Close ✕
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  Project Title *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Q4 Brand Launch - 15 Reels Campaign"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                    Client Workspace *
                  </label>
                  <select
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500 font-semibold"
                  >
                    <option value="">Internal Studio Production</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.brand_name || c.company_name || c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                    Assigned SMM Lead
                  </label>
                  <select
                    value={smmId}
                    onChange={(e) => setSmmId(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500 font-semibold"
                  >
                    <option value="">Select SMM...</option>
                    {smms.map(m => (
                      <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  Project Description &amp; Scope
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Briefly describe deliverables, style guidelines, and campaign goals..."
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                    Required Number of Videos
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={requiredVideoCount}
                    onChange={(e) => setRequiredVideoCount(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                    Delivery Deadline
                  </label>
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>

              {/* Target Platforms */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  Target Social Platforms
                </label>
                <div className="flex gap-2 flex-wrap">
                  {['instagram_reels', 'youtube_shorts', 'facebook', 'x'].map(plat => (
                    <button
                      key={plat}
                      type="button"
                      onClick={() => togglePlatform(plat)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                        platforms.includes(plat)
                          ? 'bg-white text-black font-black'
                          : 'bg-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {plat.replace(/_/g, ' ').toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assigned Editors */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  Assigned Video Editors
                </label>
                <div className="flex gap-2 flex-wrap max-h-32 overflow-y-auto">
                  {editors.length === 0 ? (
                    <span className="text-xs text-zinc-500">No editors available.</span>
                  ) : (
                    editors.map(ed => (
                      <button
                        key={ed.id}
                        type="button"
                        onClick={() => toggleEditor(ed.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                          assignedEditorIds.includes(ed.id)
                            ? 'bg-white text-black font-black'
                            : 'bg-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {ed.full_name || ed.email}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Client Approval Toggle */}
              <div className="p-3 bg-black border border-zinc-800 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Require Client Approval</span>
                  <span className="text-[11px] text-zinc-400">
                    If checked, videos approved by Founder will be sent to the Client Portal for final client approval before publishing.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={clientApprovalRequired}
                  onChange={(e) => setClientApprovalRequired(e.target.checked)}
                  className="w-4 h-4 accent-white rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl text-xs font-black bg-white hover:bg-zinc-200 text-black shadow-lg transition active:scale-[0.99] disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating Project...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
