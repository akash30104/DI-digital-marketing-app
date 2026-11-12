import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Project, Client, Profile, SocialChannel, Deliverable, DeliverableType, AspectRatio } from '../types';
import { 
  getProjects, createProject, updateProject, deleteProject, 
  getClients, getProfiles, getSocialChannels, createAuditLog, createNotification 
} from '../lib/api';
import { supabase } from '../lib/supabase';
import { filterDeliverables, filterClients, isClientDeleted, isInternalBrand } from '../lib/deletionFilter';
import { 
  FolderKanban, Plus, Calendar, CheckCircle2, Clock, 
  Users, Briefcase, Share2, AlertCircle, ArrowUpRight,
  Filter, Search, Trash2, Film, Tv, ExternalLink, X, ChevronRight, Layers
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
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Selected project for detailed view modal
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [delivFilterType, setDelivFilterType] = useState<'all' | 'reel' | 'full_length_video'>('all');

  // Quick Add Deliverable inside project modal
  const [showAddDeliverableModal, setShowAddDeliverableModal] = useState(false);
  const [newDelivTitle, setNewDelivTitle] = useState('');
  const [newDelivType, setNewDelivType] = useState<DeliverableType>('reel');
  const [newDelivEditorId, setNewDelivEditorId] = useState('');
  const [newDelivDriveLink, setNewDelivDriveLink] = useState('');
  const [isAddingDeliverable, setIsAddingDeliverable] = useState(false);

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

  const loadData = async () => {
    setIsLoading(true);
    const [projList, clientList, members, chanList, delivRes] = await Promise.all([
      getProjects(),
      getClients(),
      getProfiles(),
      getSocialChannels(),
      supabase.from('deliverables').select('*').order('created_at', { ascending: false })
    ]);

    setProjects(projList);
    setClients(filterClients(clientList));
    setTeamMembers(members);
    setChannels(chanList);

    const existingDelivs = (delivRes.data as Deliverable[]) || [];
    const backfilledDelivs: Deliverable[] = [];

    // Auto-generate missing recording & deliverables for projects that have 0 deliverables
    for (const proj of projList) {
      if (proj.id === 'proj-llbs-podcast' || proj.name?.toLowerCase().includes('unfiltered podcast')) continue;
      const matched = existingDelivs.filter(d => 
        d.project_id === proj.id || 
        (d.title && proj.name && d.title.toLowerCase().includes(proj.name.toLowerCase()))
      );

      if (matched.length === 0) {
        const assignedEdId = proj.assigned_editor_ids?.[0] || undefined;
        const edObj = members.find(m => m.id === assignedEdId);
        const todayStr = new Date().toISOString().split('T')[0];
        const projPlatforms = (proj.platforms as string[]) || [];
        const isFull = 
          projPlatforms.includes('youtube_full') ||
          projPlatforms.includes('full') ||
          proj.name.toLowerCase().includes('full video') ||
          proj.name.toLowerCase().includes('full episode');

        const recId = crypto.randomUUID ? crypto.randomUUID() : `rec-${proj.id}`;

        // Insert recording so editor workspace can load it
        try {
          const isInternalP = isInternalBrand(proj.client_name) || !proj.client_id || proj.client_id === 'internal';
          const cTag = isInternalP ? '[Studio Internal]' : `[Client: ${proj.client_name || ''}]`;
          await supabase.from('recordings').insert([{
            id: recId,
            title: proj.name,
            recording_date: todayStr,
            date_received: todayStr,
            hard_disk_name: isInternalP ? 'Internal Studio' : (proj.client_name || 'Studio Production'),
            folder_path: `/projects/${proj.name.replace(/\s+/g, '_')}`,
            notes: `[Project: ${proj.id}] ${cTag} [Deadline: ${proj.deadline || todayStr}]`,
            registered_by: currentUser?.id
          }]);
        } catch {}

        const count = Math.max(1, proj.required_video_count || proj.required_videos_count || 1);
        for (let i = 1; i <= count; i++) {
          const dTitle = count === 1
            ? `${proj.name} - ${isFull ? 'Full Episode Video (16:9)' : 'Reel (9:16)'}`
            : `${proj.name} - ${isFull ? 'Full Video Cut' : 'Reel'} #${i}`;

          const newD: Deliverable = {
            id: crypto.randomUUID ? crypto.randomUUID() : `deliv-${proj.id}-${i}`,
            recording_id: recId,
            project_id: proj.id,
            client_id: proj.client_id,
            client_name: proj.client_name,
            client_brand: proj.client_name,
            title: dTitle,
            deliverable_type: isFull ? 'full_length_video' : 'reel',
            aspect_ratio: isFull ? '16:9' : '9:16',
            assigned_editor_id: assignedEdId || undefined,
            editor_name: edObj?.full_name || 'Unassigned',
            editing_status: assignedEdId ? 'assigned' : 'not_started',
            priority: isFull ? 'high' : 'medium',
            deadline: proj.deadline || todayStr,
            progress_percentage: 0,
            created_at: new Date().toISOString()
          };
          backfilledDelivs.push(newD);
        }

        try {
          const dbDelivs = backfilledDelivs.map(d => ({
            recording_id: d.recording_id,
            title: d.title,
            deliverable_type: d.deliverable_type,
            assigned_editor_id: d.assigned_editor_id || null,
            editing_status: d.editing_status,
            priority: d.priority,
            deadline: d.deadline || null,
            progress_percentage: 0
          }));
          await supabase.from('deliverables').insert(dbDelivs);
        } catch {}
      }
    }

    if (backfilledDelivs.length > 0) {
      try {
        const raw = localStorage.getItem('di_project_deliverables');
        const list: Deliverable[] = raw ? JSON.parse(raw) : [];
        const existingIds = new Set(list.map(d => d.id));
        const toAdd = backfilledDelivs.filter(d => !existingIds.has(d.id));
        localStorage.setItem('di_project_deliverables', JSON.stringify([...toAdd, ...list]));
      } catch {}
    }

    const allDelivs = filterDeliverables([...backfilledDelivs, ...existingDelivs]);
    setDeliverables(allDelivs);

    setIsLoading(false);
  };

  useEffect(() => {
    loadData();

    const dSub = supabase
      .channel('projects-view-delivs-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliverables' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(dSub);
    };
  }, []);

  const getProjectDeliverables = (proj: Project): Deliverable[] => {
    return deliverables.filter(d => 
      d.project_id === proj.id ||
      (proj.client_id && d.client_id === proj.client_id) ||
      (proj.client_name && d.client_brand && d.client_brand.toLowerCase() === proj.client_name.toLowerCase()) ||
      (proj.name && d.title && d.title.toLowerCase().includes(proj.name.toLowerCase()))
    );
  };

  const handleDeleteProject = async (id: string, projectName: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete project "${projectName}"? This action cannot be undone.`)) {
      return;
    }
    await deleteProject(id);
    setProjects(prev => prev.filter(p => p.id !== id));
    if (selectedProject?.id === id) {
      setSelectedProject(null);
    }
    if (currentUser) {
      await createAuditLog(
        'project_deleted',
        'projects',
        id,
        currentUser.id,
        currentUser.email,
        { name: projectName }
      );
    }
  };

  const handleCreateDeliverable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !newDelivTitle.trim()) return;
    setIsAddingDeliverable(true);

    const editorObj = teamMembers.find(m => m.id === newDelivEditorId);
    const newDeliv: Deliverable = {
      id: crypto.randomUUID ? crypto.randomUUID() : `deliv-${Date.now()}`,
      recording_id: `rec-${selectedProject.id}`,
      project_id: selectedProject.id,
      client_id: selectedProject.client_id,
      client_name: selectedProject.client_name,
      client_brand: selectedProject.client_name,
      title: newDelivTitle.trim(),
      deliverable_type: newDelivType,
      aspect_ratio: newDelivType === 'reel' ? '9:16' : '16:9',
      editing_status: 'not_started',
      progress_percentage: 0,
      priority: 'high',
      assigned_editor_id: newDelivEditorId || undefined,
      editor_name: editorObj?.full_name || undefined,
      preview_link: newDelivDriveLink.trim() || undefined,
      final_video_link: newDelivDriveLink.trim() || undefined,
      created_at: new Date().toISOString()
    };

    try {
      await supabase.from('deliverables').insert([newDeliv]);
    } catch {}

    setDeliverables(prev => [newDeliv, ...prev]);
    setNewDelivTitle('');
    setNewDelivDriveLink('');
    setIsAddingDeliverable(false);
    setShowAddDeliverableModal(false);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setIsSubmitting(true);

    const clientObj = clients.find(c => c.id === clientId);
    const smmObj = teamMembers.find(m => m.id === smmId);

    const isInternalChoice = !clientId || clientId === 'internal' || isInternalBrand(clientObj?.brand_name || clientObj?.company_name || clientObj?.name);
    const chosenClientName = isInternalChoice ? 'Internal Studio' : (clientObj?.brand_name || clientObj?.company_name || clientObj?.name || 'Client');

    const newProj = await createProject({
      name: name.trim(),
      client_id: isInternalChoice ? 'internal' : (clientId || 'internal'),
      client_name: chosenClientName,
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
      requires_client_approval: true,
      approval_requirements: {
        smm_approval_required: true,
        founder_approval_required: true,
        client_approval_required: true,
      },
      status: 'active',
    });

    setIsSubmitting(false);

    if (newProj) {
      // 1. Immediately create a Recording representation for this project so editors can access it
      const primaryEditorId = assignedEditorIds[0] || undefined;
      const editorObj = teamMembers.find(m => m.id === primaryEditorId);
      const todayStr = new Date().toISOString().split('T')[0];
      const finalDeadline = deadline || todayStr;
      const isInternal = !clientId || clientId === 'internal' || isInternalBrand(clientObj?.brand_name || clientObj?.company_name || clientObj?.name);
      const clientName = isInternal ? 'Internal Studio' : (clientObj?.brand_name || clientObj?.company_name || clientObj?.name || 'Client');
      const clientTag = isInternal ? '[Studio Internal]' : `[Client: ${clientName}]`;

      let recId = newProj.id;
      try {
        const { data: recData } = await supabase.from('recordings').insert([{
          title: newProj.name,
          recording_date: todayStr,
          date_received: todayStr,
          hard_disk_name: clientName,
          folder_path: `/projects/${newProj.name.replace(/\s+/g, '_')}`,
          notes: `[Project: ${newProj.id}] ${clientTag} [Deadline: ${finalDeadline}] [Editor: ${editorObj?.full_name || 'Unassigned'}] [EditorId: ${primaryEditorId || ''}] ${newProj.description || ''}`,
          registered_by: currentUser.id
        }]).select().maybeSingle();

        if (recData?.id) {
          recId = recData.id;
        }
      } catch (e) {
        console.warn('Project recording insert note:', e);
      }

      // 2. Generate Deliverable tasks for the assigned editor(s)
      const isFullVideo = 
        platforms.includes('youtube_full') || 
        platforms.includes('full') || 
        newProj.name.toLowerCase().includes('full video') || 
        newProj.name.toLowerCase().includes('full episode');

      const videoCount = Math.max(1, Number(requiredVideoCount) || 1);
      const deliverablesToInsert: Deliverable[] = [];

      for (let i = 1; i <= videoCount; i++) {
        const dTitle = videoCount === 1 
          ? `${newProj.name} - ${isFullVideo ? 'Full Episode Video (16:9)' : 'Reel (9:16)'}`
          : `${newProj.name} - ${isFullVideo ? 'Full Video Cut' : 'Reel'} #${i}`;

        deliverablesToInsert.push({
          id: `deliv-${newProj.id}-${i}`,
          recording_id: recId,
          project_id: newProj.id,
          client_id: isInternal ? 'internal' : newProj.client_id,
          client_name: clientName,
          client_brand: clientName,
          title: dTitle,
          deliverable_type: isFullVideo ? 'full_length_video' : 'reel',
          aspect_ratio: isFullVideo ? '16:9' : '9:16',
          assigned_editor_id: primaryEditorId || undefined,
          editor_name: editorObj?.full_name || 'Unassigned',
          editing_status: primaryEditorId ? 'assigned' : 'not_started',
          priority: isFullVideo ? 'high' : 'medium',
          deadline: finalDeadline,
          progress_percentage: 0,
          created_at: new Date().toISOString()
        });
      }

      // Persist in localStorage so EditorWorkspace & ProductionBoard can immediately discover all project tasks
      try {
        const existingRaw = localStorage.getItem('di_project_deliverables');
        const existingList: Deliverable[] = existingRaw ? JSON.parse(existingRaw) : [];
        const mergedList = [...deliverablesToInsert, ...existingList.filter(d => d.project_id !== newProj.id)];
        localStorage.setItem('di_project_deliverables', JSON.stringify(mergedList));
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new CustomEvent('channels-updated'));
      } catch (e) {
        console.warn('Local deliverables caching note:', e);
      }

      // Try database insert with schema-compliant payload
      try {
        const dbPayload = deliverablesToInsert.map(d => ({
          recording_id: recId,
          title: d.title,
          deliverable_type: d.deliverable_type,
          assigned_editor_id: d.assigned_editor_id || null,
          editing_status: d.editing_status,
          priority: d.priority,
          deadline: d.deadline || null,
          progress_percentage: 0
        }));
        await supabase.from('deliverables').insert(dbPayload);
      } catch (e) {
        console.warn('Project deliverables insert note:', e);
      }

      setDeliverables(prev => [...deliverablesToInsert, ...prev]);

      // Send in-app notification to the assigned editor
      if (primaryEditorId) {
        try {
          await createNotification(
            primaryEditorId,
            'New Video Task Assigned',
            `You have been assigned to edit "${newProj.name}" (${videoCount} ${isFullVideo ? 'full video' : 'reel'} cut${videoCount > 1 ? 's' : ''}).`
          );
        } catch {}
      }

      setProjects(prev => [newProj, ...prev]);
      setShowModal(false);
      resetForm();
      await createAuditLog(
        'project_created',
        'projects',
        newProj.id,
        currentUser.id,
        currentUser.email,
        { name: newProj.name, client: newProj.client_name, full_video: isFullVideo, video_count: videoCount }
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
            {clients.filter(c => !isClientDeleted(c) && !isInternalBrand(c.brand_name || c.company_name || c.name)).map(c => (
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
            const projectDelivs = getProjectDeliverables(p);
            const reels = projectDelivs.filter(d => d.deliverable_type === 'reel');
            const fullVideos = projectDelivs.filter(d => d.deliverable_type === 'full_length_video');
            const completedCount = projectDelivs.filter(d => d.editing_status === 'approved' || d.editing_status === 'published' || d.progress_percentage === 100).length;
            const targetCount = p.required_video_count || p.required_videos_count || (projectDelivs.length > 0 ? projectDelivs.length : 1);
            const progressPct = Math.min(100, Math.round((completedCount / targetCount) * 100));

            return (
              <div
                key={p.id}
                onClick={() => setSelectedProject(p)}
                className="p-5 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-zinc-600 transition-all flex flex-col justify-between space-y-4 cursor-pointer group active:scale-[0.99] shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 border border-zinc-700 text-zinc-300">
                      {p.client_name || 'Studio Project'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        p.status === 'completed'
                          ? 'bg-white text-black'
                          : p.status === 'active'
                          ? 'bg-zinc-800 text-white border border-zinc-700'
                          : 'bg-zinc-800 text-zinc-500'
                      }`}>
                        {p.status}
                      </span>
                      {(role === 'founder' || role === 'social_media_manager') && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProject(p.id, p.name);
                          }}
                          className="p-1 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition"
                          title="Delete Project"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <h3 className="text-base font-black text-white mt-2 leading-snug group-hover:text-zinc-200 transition">
                    {p.name}
                  </h3>

                  {p.description && (
                    <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                      {p.description}
                    </p>
                  )}

                  {/* Reel and Full Video Count Badges */}
                  <div className="flex items-center gap-2 pt-2 text-xs">
                    <span className="px-2.5 py-1 rounded-xl bg-black border border-zinc-800 text-zinc-200 font-bold flex items-center gap-1.5 shadow-sm">
                      <Film className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{reels.length} Reels</span>
                    </span>
                    <span className="px-2.5 py-1 rounded-xl bg-black border border-zinc-800 text-zinc-200 font-bold flex items-center gap-1.5 shadow-sm">
                      <Tv className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{fullVideos.length} Full Videos</span>
                    </span>
                  </div>
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

                  {/* View Details Click Prompt */}
                  <div className="pt-1 flex items-center justify-between text-[11px] text-zinc-500 group-hover:text-white transition">
                    <span>Click to view reels &amp; details</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ========================================================================= */}
      {/* DETAILED PROJECT MODAL (REELS & FULL VIDEOS BREAKDOWN) */}
      {/* ========================================================================= */}
      {selectedProject && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedProject(null)}
        >
          <div 
            className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-zinc-800 gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 border border-zinc-700 text-zinc-200">
                    {selectedProject.client_name || 'Studio Project'}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white text-black">
                    {selectedProject.status}
                  </span>
                </div>
                <h2 className="text-xl font-black text-white tracking-tight">
                  {selectedProject.name}
                </h2>
                {selectedProject.description && (
                  <p className="text-xs text-zinc-400">
                    {selectedProject.description}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {(role === 'founder' || role === 'social_media_manager') && (
                  <button
                    type="button"
                    onClick={() => handleDeleteProject(selectedProject.id, selectedProject.name)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-950/40 border border-red-800/60 text-red-400 hover:bg-red-900/60 transition text-xs font-bold"
                    title="Delete Project"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Project</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedProject(null)}
                  className="p-1.5 text-zinc-400 hover:text-white rounded-lg bg-zinc-800 hover:bg-zinc-700 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Breakdown Cards: Number of Reels and Full Videos */}
            {(() => {
              const projectDelivs = getProjectDeliverables(selectedProject);
              const reels = projectDelivs.filter(d => d.deliverable_type === 'reel');
              const fullVideos = projectDelivs.filter(d => d.deliverable_type === 'full_length_video');
              const completedCount = projectDelivs.filter(d => d.editing_status === 'approved' || d.editing_status === 'published' || d.progress_percentage === 100).length;

              const displayedDelivs = projectDelivs.filter(d => {
                if (delivFilterType === 'reel') return d.deliverable_type === 'reel';
                if (delivFilterType === 'full_length_video') return d.deliverable_type === 'full_length_video';
                return true;
              });

              return (
                <div className="space-y-5">
                  {/* KPI Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-2xl bg-black border border-zinc-800 space-y-1">
                      <div className="flex items-center gap-1.5 text-zinc-400 text-[11px] font-bold">
                        <Film className="w-3.5 h-3.5 text-zinc-300" />
                        <span>Vertical Reels</span>
                      </div>
                      <div className="text-2xl font-black text-white">{reels.length}</div>
                      <span className="text-[10px] text-zinc-500">9:16 Shorts / Reels</span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-black border border-zinc-800 space-y-1">
                      <div className="flex items-center gap-1.5 text-zinc-400 text-[11px] font-bold">
                        <Tv className="w-3.5 h-3.5 text-zinc-300" />
                        <span>Full Videos</span>
                      </div>
                      <div className="text-2xl font-black text-white">{fullVideos.length}</div>
                      <span className="text-[10px] text-zinc-500">16:9 Episodes</span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-black border border-zinc-800 space-y-1">
                      <div className="flex items-center gap-1.5 text-zinc-400 text-[11px] font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-zinc-300" />
                        <span>Completed</span>
                      </div>
                      <div className="text-2xl font-black text-white">
                        {completedCount} <span className="text-xs text-zinc-500 font-normal">/ {projectDelivs.length}</span>
                      </div>
                      <span className="text-[10px] text-zinc-500">Approved / Live</span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-black border border-zinc-800 space-y-1">
                      <div className="flex items-center gap-1.5 text-zinc-400 text-[11px] font-bold">
                        <Users className="w-3.5 h-3.5 text-zinc-300" />
                        <span>SMM Lead</span>
                      </div>
                      <div className="text-sm font-bold text-white truncate mt-1">
                        {selectedProject.smm_name || 'Unassigned'}
                      </div>
                      <span className="text-[10px] text-zinc-500">Manager in Charge</span>
                    </div>
                  </div>

                  {/* Deliverables Section Header & Filter */}
                  <div className="space-y-3 pt-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase tracking-wider text-white">
                          Project Video Deliverables ({projectDelivs.length})
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Type Tabs */}
                        <div className="flex items-center bg-black border border-zinc-800 rounded-xl p-0.5 text-xs">
                          <button
                            type="button"
                            onClick={() => setDelivFilterType('all')}
                            className={`px-2.5 py-1 rounded-lg font-bold transition ${delivFilterType === 'all' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
                          >
                            All ({projectDelivs.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setDelivFilterType('reel')}
                            className={`px-2.5 py-1 rounded-lg font-bold transition ${delivFilterType === 'reel' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
                          >
                            Reels ({reels.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setDelivFilterType('full_length_video')}
                            className={`px-2.5 py-1 rounded-lg font-bold transition ${delivFilterType === 'full_length_video' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
                          >
                            Full ({fullVideos.length})
                          </button>
                        </div>

                        {(role === 'founder' || role === 'social_media_manager') && (
                          <button
                            type="button"
                            onClick={() => setShowAddDeliverableModal(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-black hover:bg-zinc-200 text-xs font-black transition shadow-sm"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Video</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Deliverables List */}
                    {displayedDelivs.length === 0 ? (
                      <div className="p-8 text-center bg-black border border-zinc-800 rounded-2xl">
                        <Film className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                        <h4 className="text-xs font-bold text-white">No video deliverables in this project yet</h4>
                        <p className="text-[11px] text-zinc-500 mt-1">
                          Click "Add Video" to add reels or full episodes to this project.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {displayedDelivs.map(deliv => (
                          <div 
                            key={deliv.id} 
                            className="p-3.5 rounded-2xl bg-black border border-zinc-800 hover:border-zinc-700 transition flex items-center justify-between gap-3"
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                  deliv.deliverable_type === 'reel' 
                                    ? 'bg-zinc-800 border border-zinc-700 text-zinc-200' 
                                    : 'bg-white text-black font-black'
                                }`}>
                                  {deliv.deliverable_type === 'reel' ? 'Reel (9:16)' : 'Full Video (16:9)'}
                                </span>
                                <span className="text-[10px] text-zinc-500 font-semibold">
                                  {deliv.editor_name ? `Editor: ${deliv.editor_name}` : 'No editor assigned'}
                                </span>
                              </div>
                              <h5 className="text-xs font-bold text-white truncate">{deliv.title}</h5>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                deliv.editing_status === 'approved' || deliv.editing_status === 'published'
                                  ? 'bg-white text-black font-black'
                                  : deliv.editing_status === 'submitted_for_approval' || deliv.editing_status === 'internal_review'
                                  ? 'bg-zinc-800 text-white border border-zinc-600 font-bold'
                                  : 'bg-zinc-900 border border-zinc-800 text-zinc-400'
                              }`}>
                                {deliv.editing_status.replace(/_/g, ' ')}
                              </span>

                              {deliv.preview_link && (
                                <a
                                  href={deliv.preview_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white transition flex items-center gap-1 text-[11px]"
                                  title="Open Preview / Google Drive"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* QUICK ADD DELIVERABLE MODAL */}
      {showAddDeliverableModal && selectedProject && (
        <div 
          className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setShowAddDeliverableModal(false)}
        >
          <div 
            className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-zinc-300" />
                <span>Add Video to {selectedProject.name}</span>
              </h3>
              <button
                onClick={() => setShowAddDeliverableModal(false)}
                className="text-zinc-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDeliverable} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  Video Cut Title *
                </label>
                <input
                  type="text"
                  required
                  value={newDelivTitle}
                  onChange={(e) => setNewDelivTitle(e.target.value)}
                  placeholder="e.g. Episode 01 Reel #3 - Key Insight"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                    Deliverable Format
                  </label>
                  <select
                    value={newDelivType}
                    onChange={(e) => setNewDelivType(e.target.value as DeliverableType)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500 font-semibold"
                  >
                    <option value="reel">Vertical Reel (9:16)</option>
                    <option value="full_length_video">Full Episode (16:9)</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-zinc-300">
                      Assign Editor
                    </label>
                    {onNavigateTab && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProject(null);
                          onNavigateTab('team');
                        }}
                        className="text-[10px] text-zinc-400 hover:text-white font-bold flex items-center gap-1 transition"
                        title="Invite a new Video Editor"
                      >
                        <Plus className="w-3 h-3" />
                        <span>+ Invite</span>
                      </button>
                    )}
                  </div>
                  <select
                    value={newDelivEditorId}
                    onChange={(e) => setNewDelivEditorId(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500 font-semibold"
                  >
                    <option value="">Unassigned</option>
                    {editors.map(ed => (
                      <option key={ed.id} value={ed.id}>{ed.full_name || ed.email}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  Google Drive / Video Link (Optional)
                </label>
                <input
                  type="url"
                  value={newDelivDriveLink}
                  onChange={(e) => setNewDelivDriveLink(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAddDeliverableModal(false)}
                  className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingDeliverable}
                  className="px-5 py-2 rounded-xl text-xs font-black bg-white hover:bg-zinc-200 text-black transition disabled:opacity-50"
                >
                  {isAddingDeliverable ? 'Adding...' : 'Add Deliverable'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                    {filterClients(clients).map(c => (
                      <option key={c.id} value={c.id}>{c.brand_name || c.company_name || c.name || (c as any).full_name}</option>
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

              {/* Target Platforms & Format */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5 flex items-center justify-between">
                  <span>Target Social Platforms &amp; Video Format</span>
                  <span className="text-[10px] text-zinc-400 font-semibold">Select Full Video (16:9) or Shorts</span>
                </label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { id: 'youtube_full', label: 'FULL VIDEO (16:9)', isFull: true },
                    { id: 'youtube_shorts', label: 'YOUTUBE SHORTS', isFull: false },
                    { id: 'instagram_reels', label: 'INSTAGRAM REELS', isFull: false },
                    { id: 'facebook', label: 'FACEBOOK', isFull: false },
                    { id: 'x', label: 'X', isFull: false },
                  ].map(plat => (
                    <button
                      key={plat.id}
                      type="button"
                      onClick={() => togglePlatform(plat.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                        platforms.includes(plat.id)
                          ? 'bg-white text-black font-black shadow-md'
                          : 'bg-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {plat.isFull && <Tv className="w-3.5 h-3.5" />}
                      {!plat.isFull && plat.id === 'youtube_shorts' && <Film className="w-3.5 h-3.5" />}
                      <span>{plat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Assigned Editors */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-zinc-300">
                    Assigned Video Editors
                  </label>
                  {onNavigateTab && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowModal(false);
                        onNavigateTab('team');
                      }}
                      className="text-[10px] text-zinc-400 hover:text-white font-bold flex items-center gap-1 transition"
                      title="Invite a new Video Editor"
                    >
                      <Plus className="w-3 h-3" />
                      <span>+ Invite New Editor</span>
                    </button>
                  )}
                </div>
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
