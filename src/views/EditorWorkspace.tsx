import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Deliverable, EditingStatus, Profile } from '../types';
import { StatusBadge } from '../components/StatComponents';
import { 
  Sliders, HardDrive, Folder, AlertCircle, Send, Check, 
  CheckCircle2, PlaySquare, Tv, Clock, ExternalLink, Sparkles, 
  UserCheck, X, ChevronRight, ChevronLeft, ArrowRight, ListTodo, 
  CheckSquare, Plus, ArrowLeft, Cloud, Film, Calendar, RefreshCw, User, Trash2, Briefcase
} from 'lucide-react';
import { filterDeliverables, filterRecordings, deleteSingleDeliverable, deleteSingleRecording } from '../lib/deletionFilter';
import { getClientBrandName } from '../lib/clientIsolation';
import { recordTaskVersion, createNotification, createAuditLog, getProjects } from '../lib/api';

interface EditorWorkspaceProps {
  mode?: 'all' | 'my';
  onNavigateTab?: (tab: string) => void;
}

const ACCEPTED_PODCASTS_KEY_PREFIX = 'di_editor_accepted_podcasts_';

const getAcceptedPodcastIds = (userId: string): Set<string> => {
  try {
    const raw = localStorage.getItem(`${ACCEPTED_PODCASTS_KEY_PREFIX}${userId}`);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
};

const saveAcceptedPodcastId = (userId: string, podcastId: string) => {
  try {
    const set = getAcceptedPodcastIds(userId);
    set.add(podcastId);
    localStorage.setItem(`${ACCEPTED_PODCASTS_KEY_PREFIX}${userId}`, JSON.stringify(Array.from(set)));
  } catch (e) {
    console.warn('Failed to save accepted podcast to local storage:', e);
  }
};

const updateDeliverableCache = (cutId: string, updates: Record<string, any>) => {
  try {
    const raw = localStorage.getItem('di_deliverable_progress_cache') || '{}';
    const cache = JSON.parse(raw);
    cache[cutId] = { ...(cache[cutId] || {}), ...updates, updated_at: new Date().toISOString() };
    localStorage.setItem('di_deliverable_progress_cache', JSON.stringify(cache));

    const rawP = localStorage.getItem('di_project_deliverables');
    if (rawP) {
      const pDelivs: Deliverable[] = JSON.parse(rawP);
      const updated = pDelivs.map(d => d.id === cutId ? { ...d, ...updates } : d);
      localStorage.setItem('di_project_deliverables', JSON.stringify(updated));
    }
  } catch (e) {
    console.warn('Local deliverable cache update note:', e);
  }
};

interface PodcastItem {
  id: string;
  title: string;
  recording_date: string;
  hard_disk_name: string;
  folder_path: string;
  notes?: string;
  deadline: string | null;
  assigned_editor_id?: string;
  editor_name: string;
  deliverables: Deliverable[];
  totalCuts: number;
  completedCuts: number;
  progressPercentage: number;
  isMyPodcast: boolean;
  isClientWork: boolean;
  clientBrandName: string;
}

export const EditorWorkspace: React.FC<EditorWorkspaceProps> = ({ 
  mode = 'my', 
  onNavigateTab 
}) => {
  const { currentUser } = useAuth();
  const [podcasts, setPodcasts] = useState<PodcastItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activePodcastId, setActivePodcastId] = useState<string | null>(null);
  const [workFilter, setWorkFilter] = useState<'all' | 'client' | 'studio'>('all');

  // 100% Google Drive Submission Modal State
  const [driveModalCut, setDriveModalCut] = useState<Deliverable | null>(null);
  const [driveUrl, setDriveUrl] = useState('');
  const [driveNotes, setDriveNotes] = useState('');
  const [isSubmittingDrive, setIsSubmittingDrive] = useState(false);

  // Toast message
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const extractDeadline = (recNotes?: string, delivList?: Deliverable[]): string | null => {
    if (delivList && delivList.length > 0) {
      const withDeadline = delivList.find(d => d.deadline);
      if (withDeadline?.deadline) return withDeadline.deadline;
    }
    if (recNotes) {
      const match = recNotes.match(/\[Deadline:\s*([^\]]+)\]/i);
      if (match) return match[1];
    }
    return null;
  };

  const extractClientBrandInfo = (
    recNotes?: string, 
    recTitle?: string, 
    podDelivs: Deliverable[] = [],
    clientProfiles: Profile[] = []
  ): { isClientWork: boolean; clientBrandName: string } => {
    const notes = (recNotes || '').trim();
    const title = (recTitle || '').trim();

    // 1. Tag [Brand: XYZ] in notes
    const brandMatch = notes.match(/\[Brand:\s*([^\]]+)\]/i);
    if (brandMatch && brandMatch[1]) {
      return { isClientWork: true, clientBrandName: brandMatch[1].trim() };
    }

    // 2. Tag [Client: XYZ] in notes
    const clientMatch = notes.match(/\[Client:\s*([^\]]+)\]/i);
    if (clientMatch && clientMatch[1]) {
      const rawVal = clientMatch[1].trim();
      const matchedProfile = clientProfiles.find(c => c.id === rawVal);
      if (matchedProfile) {
        return { isClientWork: true, clientBrandName: getClientBrandName(matchedProfile) };
      }
      return { isClientWork: true, clientBrandName: rawVal };
    }

    // 3. Match against known client profiles (full_name, brand parentheses e.g. "LLBS")
    for (const client of clientProfiles) {
      const brand = getClientBrandName(client);
      const clientName = client.full_name || '';
      if (brand && (title.toLowerCase().includes(brand.toLowerCase()) || notes.toLowerCase().includes(brand.toLowerCase()))) {
        return { isClientWork: true, clientBrandName: brand };
      }
      if (clientName && (title.toLowerCase().includes(clientName.toLowerCase()) || notes.toLowerCase().includes(clientName.toLowerCase()))) {
        return { isClientWork: true, clientBrandName: brand || clientName };
      }
      if (notes.includes(client.id)) {
        return { isClientWork: true, clientBrandName: brand || clientName };
      }
    }

    // 4. Check deliverables notes or title
    for (const d of podDelivs) {
      const dNotes = `${d.approval_notes || ''} ${d.description || ''}`;
      const dBrandMatch = dNotes.match(/\[Brand:\s*([^\]]+)\]/i);
      if (dBrandMatch && dBrandMatch[1]) {
        return { isClientWork: true, clientBrandName: dBrandMatch[1].trim() };
      }
      for (const client of clientProfiles) {
        const brand = getClientBrandName(client);
        if (brand && (d.title.toLowerCase().includes(brand.toLowerCase()) || dNotes.toLowerCase().includes(brand.toLowerCase()))) {
          return { isClientWork: true, clientBrandName: brand };
        }
      }
    }

    // 5. Keyword heuristic
    if (/\[Client/i.test(notes) || /Client Work/i.test(notes) || /Client Work/i.test(title)) {
      return { isClientWork: true, clientBrandName: 'Client Brand' };
    }

    return { isClientWork: false, clientBrandName: '' };
  };

  const loadData = async (showSpinner = false) => {
    if (!currentUser) return;
    if (showSpinner) setIsLoading(true);

    try {
      const [recsRes, delivRes, clientsRes, projectsList] = await Promise.all([
        supabase
          .from('recordings')
          .select('*')
          .order('recording_date', { ascending: false }),
        supabase
          .from('deliverables')
          .select(`
            *,
            recordings (title, episode_number, recording_date, hard_disk_name, folder_path, notes),
            profiles:assigned_editor_id (full_name)
          `)
          .order('created_at', { ascending: true }),
        supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .eq('role', 'client'),
        getProjects()
      ]);

      const clientProfiles = (clientsRes.data || []) as Profile[];
      const recs = filterRecordings(recsRes.data || []);

      let cachedProjectDelivs: Deliverable[] = [];
      try {
        const raw = localStorage.getItem('di_project_deliverables');
        if (raw) cachedProjectDelivs = JSON.parse(raw);
      } catch {}

      let progressCache: Record<string, any> = {};
      try {
        const raw = localStorage.getItem('di_deliverable_progress_cache');
        if (raw) progressCache = JSON.parse(raw);
      } catch {}

      const rawDels: Deliverable[] = (delivRes.data || []).map((d: any) => ({
        ...d,
        recording_title: d.recordings?.title,
        episode_number: d.recordings?.episode_number,
        hard_disk_name: d.recordings?.hard_disk_name,
        folder_path: d.recordings?.folder_path,
        editor_name: d.profiles?.full_name || 'Unassigned'
      }));

      // Combine with locally cached project deliverables
      const seenDelivIds = new Set(rawDels.map(d => d.id));
      for (const cd of cachedProjectDelivs) {
        if (!seenDelivIds.has(cd.id)) {
          rawDels.push(cd);
          seenDelivIds.add(cd.id);
        }
      }

      // Apply any progress/status overrides from cache
      for (const d of rawDels) {
        if (progressCache[d.id]) {
          Object.assign(d, progressCache[d.id]);
        }
      }

      const dels = filterDeliverables(rawDels);
      const acceptedSet = getAcceptedPodcastIds(currentUser.id);
      const items: PodcastItem[] = [];
      const handledProjectIds = new Set<string>();

      for (const rec of recs as any[]) {
        const podDelivs = dels.filter(d => d.recording_id === rec.id);

        // If all tasks for this podcast have been deleted (0 deliverables),
        // do NOT display this empty card in the editor's workspace!
        if (podDelivs.length === 0) {
          continue;
        }

        const deadline = extractDeadline(rec.notes, podDelivs);

        // Find primary assigned editor for this podcast
        const assignedDeliv = podDelivs.find(d => d.assigned_editor_id);
        const assignedEditorId = assignedDeliv?.assigned_editor_id;
        const editorName = assignedDeliv?.editor_name || (assignedEditorId === currentUser.id ? currentUser.full_name : 'Unassigned');

        // Check if assigned to current editor
        const isAssignedDirectly = podDelivs.some(d => d.assigned_editor_id === currentUser.id);
        const isAccepted = acceptedSet.has(rec.id);
        const isMyPodcast = isAssignedDirectly || isAccepted;

        // Completion calculation
        const completedCuts = podDelivs.filter(d => 
          (d.progress_percentage || 0) === 100 || 
          d.editing_status === 'approved' || 
          d.editing_status === 'submitted_for_approval'
        ).length;

        const totalCuts = podDelivs.length;
        const progressPercentage = totalCuts > 0
          ? Math.round(podDelivs.reduce((acc, d) => acc + (d.progress_percentage || 0), 0) / totalCuts)
          : 0;

        const { isClientWork, clientBrandName } = extractClientBrandInfo(rec.notes, rec.title, podDelivs, clientProfiles);

        items.push({
          id: rec.id,
          title: rec.title,
          recording_date: rec.recording_date,
          hard_disk_name: rec.hard_disk_name,
          folder_path: rec.folder_path,
          notes: rec.notes || undefined,
          deadline,
          assigned_editor_id: assignedEditorId,
          editor_name: editorName,
          deliverables: podDelivs,
          totalCuts,
          completedCuts,
          progressPercentage,
          isMyPodcast,
          isClientWork,
          clientBrandName
        });

        // Mark associated project handled
        if (rec.notes) {
          const match = rec.notes.match(/\[Project:\s*([^\]]+)\]/i);
          if (match && match[1]) handledProjectIds.add(match[1].trim());
        }
        for (const p of (projectsList || [])) {
          if (p.name && rec.title && rec.title.toLowerCase().includes(p.name.toLowerCase())) {
            handledProjectIds.add(p.id);
          }
        }
      }

      // Ensure every project created by SMM/Founder is present in Editor Workspace
      for (const proj of (projectsList || [])) {
        if (handledProjectIds.has(proj.id)) continue;

        let projDelivs = dels.filter(d => 
          d.project_id === proj.id || 
          d.recording_id === proj.id || 
          (d.title && proj.name && d.title.toLowerCase().startsWith(proj.name.toLowerCase()))
        );

        const videoCount = Math.max(1, proj.required_video_count || proj.required_videos_count || 1);
        const projPlatforms = (proj.platforms as string[]) || [];
        const isFullVideo = 
          projPlatforms.includes('youtube_full') || 
          projPlatforms.includes('full') || 
          proj.name.toLowerCase().includes('full video') || 
          proj.name.toLowerCase().includes('full episode');

        const primaryEditorId = proj.assigned_editor_ids?.[0] || undefined;
        const editorName = primaryEditorId === currentUser.id ? currentUser.full_name : (primaryEditorId ? 'Assigned Editor' : 'Unassigned');

        // Synthesize deliverables if not created yet
        if (projDelivs.length === 0) {
          const generated: Deliverable[] = [];
          for (let i = 1; i <= videoCount; i++) {
            const dTitle = videoCount === 1 
              ? `${proj.name} - ${isFullVideo ? 'Full Episode Video (16:9)' : 'Reel (9:16)'}`
              : `${proj.name} - ${isFullVideo ? 'Full Video Cut' : 'Reel'} #${i}`;
            
            const dId = `deliv-${proj.id}-${i}`;
            const cachedProps = progressCache[dId] || {};

            generated.push({
              id: dId,
              recording_id: proj.id,
              project_id: proj.id,
              client_id: proj.client_id,
              client_name: proj.client_name,
              client_brand: proj.client_name,
              title: dTitle,
              deliverable_type: isFullVideo ? 'full_length_video' : 'reel',
              aspect_ratio: isFullVideo ? '16:9' : '9:16',
              assigned_editor_id: primaryEditorId,
              editor_name: editorName,
              editing_status: primaryEditorId ? 'assigned' : 'not_started',
              priority: isFullVideo ? 'high' : 'medium',
              deadline: proj.deadline || null,
              progress_percentage: 0,
              created_at: proj.created_at || new Date().toISOString(),
              ...cachedProps
            });
          }
          projDelivs = generated;
        }

        const isAssignedDirectly = 
          (proj.assigned_editor_ids && proj.assigned_editor_ids.includes(currentUser.id)) ||
          projDelivs.some(d => d.assigned_editor_id === currentUser.id);
        const isAccepted = acceptedSet.has(proj.id);
        const isMyPodcast = isAssignedDirectly || isAccepted;

        const completedCuts = projDelivs.filter(d => 
          (d.progress_percentage || 0) === 100 || 
          d.editing_status === 'approved' || 
          d.editing_status === 'submitted_for_approval'
        ).length;

        const totalCuts = projDelivs.length;
        const progressPercentage = totalCuts > 0
          ? Math.round(projDelivs.reduce((acc, d) => acc + (d.progress_percentage || 0), 0) / totalCuts)
          : 0;

        items.push({
          id: proj.id,
          title: proj.name,
          recording_date: proj.start_date || (proj.created_at ? proj.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
          hard_disk_name: proj.client_name || 'Project Production',
          folder_path: `/projects/${proj.name.replace(/\s+/g, '_')}`,
          notes: `[Project: ${proj.id}] ${proj.description || ''}`,
          deadline: proj.deadline || null,
          assigned_editor_id: primaryEditorId,
          editor_name: editorName,
          deliverables: projDelivs,
          totalCuts,
          completedCuts,
          progressPercentage,
          isMyPodcast,
          isClientWork: !!proj.client_id && proj.client_id !== 'internal',
          clientBrandName: proj.client_name || 'Client'
        });

        handledProjectIds.add(proj.id);
      }

      // Also include deliverables from standalone items that aren't tied to an existing recording or handled project
      const matchedRecIds = new Set((recs as any[]).map(r => r.id));
      const unmatchedDelivs = dels.filter(d => 
        !matchedRecIds.has(d.recording_id) && 
        (!d.project_id || !handledProjectIds.has(d.project_id))
      );

      if (unmatchedDelivs.length > 0) {
        const projectGroups = new Map<string, Deliverable[]>();
        for (const d of unmatchedDelivs) {
          const groupKey = d.project_id || d.recording_id || d.recording_title || d.client_name || 'studio-project';
          if (!projectGroups.has(groupKey)) {
            projectGroups.set(groupKey, []);
          }
          projectGroups.get(groupKey)!.push(d);
        }

        for (const [groupKey, groupDelivs] of projectGroups.entries()) {
          const firstDel = groupDelivs[0];
          const groupTitle = firstDel.recording_title || firstDel.client_name || firstDel.title || 'Project Video Tasks';
          const assignedDeliv = groupDelivs.find(d => d.assigned_editor_id);
          const assignedEditorId = assignedDeliv?.assigned_editor_id;
          const editorName = assignedDeliv?.editor_name || (assignedEditorId === currentUser.id ? currentUser.full_name : 'Unassigned');

          const isAssignedDirectly = groupDelivs.some(d => d.assigned_editor_id === currentUser.id);
          const isAccepted = acceptedSet.has(groupKey);
          const isMyPodcast = isAssignedDirectly || isAccepted;

          const completedCuts = groupDelivs.filter(d => 
            (d.progress_percentage || 0) === 100 || 
            d.editing_status === 'approved' || 
            d.editing_status === 'submitted_for_approval'
          ).length;

          const totalCuts = groupDelivs.length;
          const progressPercentage = totalCuts > 0
            ? Math.round(groupDelivs.reduce((acc, d) => acc + (d.progress_percentage || 0), 0) / totalCuts)
            : 0;

          items.push({
            id: groupKey,
            title: groupTitle,
            recording_date: new Date().toISOString().split('T')[0],
            hard_disk_name: firstDel.client_name || 'Project Production',
            folder_path: `/projects/${groupKey}`,
            notes: `[Project: ${groupKey}]`,
            deadline: firstDel.deadline || null,
            assigned_editor_id: assignedEditorId,
            editor_name: editorName,
            deliverables: groupDelivs,
            totalCuts,
            completedCuts,
            progressPercentage,
            isMyPodcast,
            isClientWork: !!firstDel.client_id || !!firstDel.client_name,
            clientBrandName: firstDel.client_name || 'Client'
          });
        }
      }

      setPodcasts(items);
    } catch (err) {
      console.error('Failed to load podcasts for editor workspace:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData(true);

    const channel = supabase
      .channel('editor-podcasts-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recordings' }, () => loadData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliverables' }, () => loadData(false))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  // Filter podcasts based on workspace mode: 'my' (My Tasks) vs 'all' (Open Tasks Queue)
  const displayedPodcasts = useMemo(() => {
    if (mode === 'my') {
      return podcasts.filter(p => p.isMyPodcast);
    } else {
      // In 'all' queue (Available Tasks), show all available tasks / open to editor
      return podcasts;
    }
  }, [podcasts, mode]);

  // Client work vs Studio work counts and filtering
  const clientWorksCount = useMemo(() => displayedPodcasts.filter(p => p.isClientWork).length, [displayedPodcasts]);
  const studioWorksCount = useMemo(() => displayedPodcasts.filter(p => !p.isClientWork).length, [displayedPodcasts]);

  const filteredPodcasts = useMemo(() => {
    return displayedPodcasts.filter(p => {
      if (workFilter === 'client') return p.isClientWork;
      if (workFilter === 'studio') return !p.isClientWork;
      return true;
    });
  }, [displayedPodcasts, workFilter]);

  // Active Podcast currently opened inside
  const activePodcast = useMemo(() => {
    if (!activePodcastId) return null;
    return podcasts.find(p => p.id === activePodcastId) || null;
  }, [podcasts, activePodcastId]);

  // Claim / Accept entire Podcast action
  const handleClaimPodcast = async (podcast: PodcastItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!currentUser) return;

    saveAcceptedPodcastId(currentUser.id, podcast.id);

    // Update in local cache
    for (const d of podcast.deliverables) {
      updateDeliverableCache(d.id, {
        assigned_editor_id: currentUser.id,
        editor_name: currentUser.full_name,
        editing_status: 'editing_in_progress'
      });
    }

    // Update in Supabase: assign all deliverables of this podcast to this editor
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('deliverables')
        .update({
          assigned_editor_id: currentUser.id,
          editing_status: 'editing_in_progress',
          updated_at: now
        })
        .eq('recording_id', podcast.id);

      if (error) console.warn('Deliverables update note:', error);

      showToast(`🎬 Claimed "${podcast.title}"! Opening podcast cuts.`);
      if (onNavigateTab) onNavigateTab('my_tasks');
      setActivePodcastId(podcast.id);
      loadData(false);
    } catch (err) {
      console.error('Error claiming podcast:', err);
    }
  };

  // Delete / Dismiss entire Podcast action
  const handleDeletePodcast = async (podcast: PodcastItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Delete podcast shoot "${podcast.title}" and all its deliverables?`)) return;
    await deleteSingleRecording(podcast.id);
    setPodcasts(prev => prev.filter(p => p.id !== podcast.id));
    if (activePodcastId === podcast.id) {
      setActivePodcastId(null);
    }
    showToast(`🗑️ "${podcast.title}" deleted.`);
  };

  // Real-time slider mouse movement (60fps optimistic update)
  const handleSliderChange = (cut: Deliverable, newProgress: number) => {
    const val = Math.max(0, Math.min(100, Math.round(newProgress)));
    setPodcasts(prev => prev.map(p => {
      if (p.id !== cut.recording_id) return p;
      const updatedDelivs = p.deliverables.map(d => d.id === cut.id ? {
        ...d,
        progress_percentage: val,
        editing_status: (val === 100 
          ? (d.editing_status === 'approved' ? 'approved' : d.editing_status) 
          : (d.editing_status === 'submitted_for_approval' ? 'editing_in_progress' : d.editing_status)) as EditingStatus
      } : d);

      const completedCuts = updatedDelivs.filter(d => (d.progress_percentage || 0) === 100).length;
      const progressPercentage = Math.round(
        updatedDelivs.reduce((acc, d) => acc + (d.progress_percentage || 0), 0) / (updatedDelivs.length || 1)
      );

      return {
        ...p,
        deliverables: updatedDelivs,
        completedCuts,
        progressPercentage
      };
    }));
  };

  // Commit slider progress to database on mouse release
  const handleSliderCommit = async (cut: Deliverable, finalProgress: number) => {
    if (!currentUser) return;
    const val = Math.max(0, Math.min(100, Math.round(finalProgress)));
    const now = new Date().toISOString();

    try {
      const updatePayload: any = {
        progress_percentage: val,
        assigned_editor_id: currentUser.id,
        updated_at: now
      };
      if (val < 100 && cut.editing_status === 'submitted_for_approval') {
        updatePayload.editing_status = 'editing_in_progress';
      }

      updateDeliverableCache(cut.id, updatePayload);

      const { error } = await supabase
        .from('deliverables')
        .update(updatePayload)
        .eq('id', cut.id);

      if (error) throw error;

      if (val === 100) {
        showToast(`🎉 "${cut.title}" reached 100%! Ready to submit for SMM approval.`);
        if (!cut.final_video_link) {
          openDriveModal(cut);
        }
      }
    } catch (err: any) {
      console.error('Failed to commit cut progress in DB:', err);
    }
  };

  // Quick Progress Update (25%, 50%, 75%, 100%)
  const handleQuickProgress = async (cut: Deliverable, newProgress: number) => {
    if (!currentUser) return;
    handleSliderChange(cut, newProgress);
    await handleSliderCommit(cut, newProgress);
  };

  // Open 100% Google Drive Submission Modal
  const openDriveModal = (cut: Deliverable) => {
    setDriveModalCut(cut);
    setDriveUrl(cut.final_video_link || cut.preview_link || '');
    setDriveNotes('');
  };

  // Confirm and Submit 100% Google Drive Link
  const handleSubmitDriveLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driveModalCut || !currentUser) return;

    if (!driveUrl.trim()) {
      alert('Please provide the Google Drive link for this cut.');
      return;
    }

    setIsSubmittingDrive(true);
    const now = new Date().toISOString();
    const finalLink = driveUrl.trim();

    updateDeliverableCache(driveModalCut.id, {
      progress_percentage: 100,
      final_video_link: finalLink,
      preview_link: finalLink,
      editing_status: 'submitted_for_approval',
      approval_notes: `Submitted by Editor (${currentUser.full_name || 'Editor'}) with Google Drive link for Social Media Manager Review`,
      assigned_editor_id: currentUser.id
    });

    try {
      const { error } = await supabase
        .from('deliverables')
        .update({
          progress_percentage: 100,
          final_video_link: finalLink,
          preview_link: finalLink,
          editing_status: 'submitted_for_approval', // Automatically sends for SMM review
          approval_notes: `Submitted by Editor (${currentUser.full_name || 'Editor'}) with Google Drive link for Social Media Manager Review`,
          assigned_editor_id: currentUser.id,
          updated_at: now
        })
        .eq('id', driveModalCut.id);

      if (error) throw error;

      // Record in video_versions
      try {
        await recordTaskVersion({
          task_id: driveModalCut.id,
          version_number: 1,
          google_drive_link: finalLink,
          video_url: finalLink,
          notes: driveNotes.trim() || undefined,
          editor_id: currentUser.id,
          submitted_by: currentUser.id,
        });
      } catch (verErr) {
        console.warn('Version record note:', verErr);
      }

      // Record audit log
      try {
        await createAuditLog(
          'video_submitted',
          'deliverables',
          driveModalCut.id,
          currentUser.id,
          currentUser.email,
          { title: driveModalCut.title, url: finalLink, notes: driveNotes }
        );
      } catch (auditErr) {
        console.warn('Audit log note:', auditErr);
      }

      showToast(`🚀 "${driveModalCut.title}" saved & sent to Social Media Manager for approval!`);
      setDriveModalCut(null);
      setDriveUrl('');
      loadData(false);
    } catch (err: any) {
      alert(`Failed to save final cut: ${err.message}`);
    } finally {
      setIsSubmittingDrive(false);
    }
  };

  // Explicit Send cut to Social Media Manager for Review
  const handleSendToSMM = async (cut: Deliverable) => {
    if (!currentUser) return;
    if (!cut.final_video_link && (cut.progress_percentage || 0) < 100) {
      openDriveModal(cut);
      return;
    }

    try {
      const now = new Date().toISOString();
      const editorName = currentUser.full_name || 'Editor';
      const { error } = await supabase
        .from('deliverables')
        .update({
          editing_status: 'submitted_for_approval',
          progress_percentage: 100,
          approval_notes: `Submitted by Editor (${editorName}) for Social Media Manager Review`,
          assigned_editor_id: currentUser.id,
          updated_at: now
        })
        .eq('id', cut.id);

      if (error) throw error;

      showToast(`🚀 "${cut.title}" sent to Social Media Manager for approval!`);
      loadData(false);
    } catch (err: any) {
      alert(`Failed to send for approval: ${err.message}`);
    }
  };

  // Send all ready cuts for this podcast to SMM
  const handleSendAllToSMM = async () => {
    if (!activePodcast || !currentUser) return;
    const readyCuts = activePodcast.deliverables.filter(d => 
      (d.final_video_link || (d.progress_percentage || 0) === 100) &&
      d.editing_status !== 'submitted_for_approval' &&
      d.editing_status !== 'approved'
    );

    if (readyCuts.length === 0) {
      showToast('No ready cuts to submit. Provide a Google Drive link or mark 100% first.');
      return;
    }

    try {
      const now = new Date().toISOString();
      const editorName = currentUser.full_name || 'Editor';
      for (const cut of readyCuts) {
        await supabase
          .from('deliverables')
          .update({
            editing_status: 'submitted_for_approval',
            progress_percentage: 100,
            approval_notes: `Submitted by Editor (${editorName}) for Social Media Manager Review`,
            assigned_editor_id: currentUser.id,
            updated_at: now
          })
          .eq('id', cut.id);
      }

      showToast(`🚀 Sent ${readyCuts.length} cuts to Social Media Manager for approval!`);
      loadData(false);
    } catch (err: any) {
      alert(`Failed to send cuts: ${err.message}`);
    }
  };

  // Add more Reels / Full Videos inside this Podcast
  const handleAddReel = async () => {
    if (!activePodcast || !currentUser) return;

    const existingReels = activePodcast.deliverables.filter(d => d.deliverable_type === 'reel');
    const nextNumber = existingReels.length + 1;
    const title = `${activePodcast.title} - Reel #${nextNumber}`;

    try {
      const { error } = await supabase
        .from('deliverables')
        .insert([{
          recording_id: activePodcast.id,
          title: title,
          deliverable_type: 'reel',
          assigned_editor_id: currentUser.id,
          editing_status: 'editing_in_progress',
          priority: 'medium',
          deadline: activePodcast.deadline || null,
          progress_percentage: 0
        }]);

      if (error) throw error;
      showToast(`+ Added ${title} to podcast!`);
      loadData(false);
    } catch (err: any) {
      alert(`Failed to add reel: ${err.message}`);
    }
  };

  const handleAddFullVideo = async () => {
    if (!activePodcast || !currentUser) return;

    const title = `${activePodcast.title} - Full Episode Video`;

    try {
      const { error } = await supabase
        .from('deliverables')
        .insert([{
          recording_id: activePodcast.id,
          title: title,
          deliverable_type: 'full_length_video',
          assigned_editor_id: currentUser.id,
          editing_status: 'editing_in_progress',
          priority: 'high',
          deadline: activePodcast.deadline || null,
          progress_percentage: 0
        }]);

      if (error) throw error;
      showToast(`+ Added Full Episode Video to podcast!`);
      loadData(false);
    } catch (err: any) {
      alert(`Failed to add full video: ${err.message}`);
    }
  };

  const handleDeleteCut = async (cutId: string, cutTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Delete cut "${cutTitle}"?`)) return;
    await deleteSingleDeliverable(cutId);
    showToast(`Cut deleted.`);
    loadData(false);
  };

  // ==========================================
  // VIEW 2: INSIDE PODCAST CUTS WORKSPACE
  // ==========================================
  if (activePodcast) {
    const reels = activePodcast.deliverables.filter(d => d.deliverable_type === 'reel');
    const fullVideos = activePodcast.deliverables.filter(d => d.deliverable_type === 'full_length_video');
    const otherCuts = activePodcast.deliverables.filter(d => d.deliverable_type !== 'reel' && d.deliverable_type !== 'full_length_video');

    const completedReels = reels.filter(r => (r.progress_percentage || 0) === 100).length;
    const completedFull = fullVideos.filter(f => (f.progress_percentage || 0) === 100).length;

    return (
      <div className="space-y-6 animate-in fade-in duration-300 pb-20">
        {/* Toast Feedback */}
        {toastMessage && (
          <div className="fixed top-20 right-4 z-50 bg-white text-black font-black px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 border border-zinc-200 animate-in slide-in-from-top-2">
            <CheckCircle2 className="w-4 h-4 text-black" />
            <span className="text-xs">{toastMessage}</span>
          </div>
        )}

        {/* Back Navigation Bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setActivePodcastId(null)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to All Podcasts</span>
          </button>

          <span className="text-xs font-bold px-3 py-1 rounded-full bg-zinc-800 text-zinc-200 border border-zinc-700">
            1 Podcast = 1 Dedicated Editor
          </span>
        </div>

        {/* CLIENT WORK BANNER (WHITE STYLING) */}
        {activePodcast.isClientWork && (
          <div className="p-4 sm:p-5 rounded-3xl bg-white text-black shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-2 border-white animate-in slide-in-from-top-2">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-black text-white flex items-center justify-center shrink-0 shadow-md">
                <Briefcase className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase tracking-widest bg-black text-white px-2.5 py-0.5 rounded-full">
                    CLIENT WORK
                  </span>
                  <span className="text-sm font-black text-black uppercase tracking-wider">
                    {activePodcast.clientBrandName || 'Client Partner Deliverable'}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-900 border border-zinc-300">
                    Dedicated Brand Project
                  </span>
                </div>
                <p className="text-xs font-semibold text-zinc-800 mt-1">
                  These video cuts are for client review. Submissions sync directly to the Client Portal for approval.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
              <span className="text-xs font-black px-3.5 py-1.5 rounded-full bg-black text-white shadow-md flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5" />
                <span>Syncs with Client Portal 💼</span>
              </span>
            </div>
          </div>
        )}

        {/* PODCAST HERO CARD */}
        <div className="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
                Active Podcast Production
              </span>
              <h2 className="text-2xl font-black text-white tracking-tight mt-0.5">
                {activePodcast.title}
              </h2>
            </div>

            {/* DEADLINE BADGE & ACTIONS */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={(e) => handleDeletePodcast(activePodcast, e)}
                className="px-3 py-2 rounded-2xl bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-400 hover:text-white text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
                title="Delete this podcast shoot"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Shoot</span>
              </button>

              {activePodcast.deadline ? (
                <div className="px-4 py-2 rounded-2xl bg-zinc-800 border border-zinc-700 text-white flex items-center gap-2 shadow-sm">
                  <Clock className="w-4 h-4 text-white" />
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400 block">
                      Deadline by SMM
                    </span>
                    <span className="text-xs font-black text-white">
                      {activePodcast.deadline}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="px-3.5 py-1.5 rounded-2xl bg-zinc-800/60 border border-zinc-800 text-zinc-400 text-xs flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>No deadline set</span>
                </div>
              )}

              <div className="px-3.5 py-2 rounded-2xl bg-zinc-800/80 border border-zinc-700/60 text-zinc-200 text-xs font-bold flex items-center gap-2">
                <Calendar className="w-4 h-4 text-zinc-400" />
                <span>Shot: {activePodcast.recording_date}</span>
              </div>
            </div>
          </div>

          {/* Storage & Editor Info */}
          {(activePodcast.hard_disk_name || activePodcast.folder_path) && (
            <div className="p-3 rounded-2xl bg-black border border-zinc-800 flex items-center justify-between gap-3 flex-wrap text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-700">
                  {activePodcast.hard_disk_name}
                </span>
                <span className="text-zinc-300">
                  {activePodcast.folder_path}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-zinc-400">
                <User className="w-3.5 h-3.5 text-zinc-300" />
                <span>Editor: <strong className="text-white">{currentUser?.full_name}</strong></span>
              </div>
            </div>
          )}

          {/* Overall Podcast Progress Bar */}
          <div className="space-y-2 pt-2 border-t border-zinc-800">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-black text-white text-sm">
                  {activePodcast.completedCuts} of {activePodcast.totalCuts} Cuts Completed
                </span>
                <span className="text-zinc-400 text-xs">
                  ({completedReels} Reels • {completedFull} Full Video)
                </span>
              </div>

              <span className="font-black text-xs px-2.5 py-0.5 rounded-full bg-zinc-800 text-white border border-zinc-700">
                {activePodcast.progressPercentage}% Total Progress
              </span>
            </div>

            <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-white h-full rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                style={{ width: `${activePodcast.progressPercentage}%` }}
              />
            </div>
          </div>
        </div>

        {/* CUTS MANAGER HEADER & ACTION BUTTONS */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Film className="w-5 h-5 text-white" />
              <span>Podcast Video Cuts ({activePodcast.deliverables.length})</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Update progress as you edit. When a reel reaches 100%, provide the Google Drive link to complete it.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSendAllToSMM}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-black text-xs font-black hover:bg-zinc-200 transition-all shadow-md active:scale-95"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send Ready Cuts to SMM 🚀</span>
            </button>

            <button
              onClick={handleAddReel}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-zinc-800 border border-zinc-700 text-white text-xs font-bold hover:bg-zinc-700 transition-all shadow-sm active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Reel</span>
            </button>

            <button
              onClick={handleAddFullVideo}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-zinc-800 border border-zinc-700 text-white text-xs font-bold hover:bg-zinc-700 transition-all shadow-sm active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Full Video</span>
            </button>
          </div>
        </div>

        {/* DELIVERABLE CUTS LIST */}
        <div className="space-y-3">
          {activePodcast.deliverables.map((cut) => {
            const isCompleted = (cut.progress_percentage || 0) === 100 || cut.editing_status === 'approved' || cut.editing_status === 'submitted_for_approval';

            return (
              <div
                key={cut.id}
                className={`p-5 rounded-3xl bg-zinc-900 border space-y-4 transition-all ${
                  activePodcast.isClientWork
                    ? 'border-zinc-700 hover:border-white shadow-[0_0_15px_rgba(255,255,255,0.06)]'
                    : 'border-zinc-800 hover:border-zinc-700 shadow-sm'
                }`}
              >
                {/* Cut Header */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {activePodcast.isClientWork && (
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-white text-black border border-white flex items-center gap-1 shadow-sm">
                        <Briefcase className="w-3 h-3 text-black" />
                        <span>CLIENT WORK: {activePodcast.clientBrandName || 'Deliverable'}</span>
                      </span>
                    )}

                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-200 flex items-center gap-1">
                      {cut.deliverable_type === 'full_length_video' ? (
                        <>
                          <Tv className="w-3 h-3 text-zinc-300" />
                          <span>📺 Full Video (16:9)</span>
                        </>
                      ) : (
                        <>
                          <PlaySquare className="w-3 h-3 text-zinc-300" />
                          <span>📱 Reel / Short (9:16)</span>
                        </>
                      )}
                    </span>

                    {cut.editing_status === 'approved' ? (
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-white text-black border border-white flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        <span>✓ Approved by Founder (Greenlit)</span>
                      </span>
                    ) : cut.editing_status === 'submitted_for_approval' ? (
                      cut.approval_notes?.includes('Sent to Founder') ? (
                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-200 border border-zinc-700 flex items-center gap-1">
                          <span>👑 Approved by SMM • In Founder Review</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-200 border border-zinc-700 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-white" />
                          <span>⏳ Awaiting SMM Approval</span>
                        </span>
                      )
                    ) : cut.editing_status === 'changes_requested' ? (
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-zinc-800 text-white border border-zinc-700 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-white" />
                        <span>⚠️ Changes Requested</span>
                      </span>
                    ) : isCompleted ? (
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-zinc-800 text-white border border-zinc-700 flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        <span>100% Completed</span>
                      </span>
                    ) : (
                      <StatusBadge status={cut.editing_status} />
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Google Drive Link if provided */}
                    {cut.final_video_link && (
                      <a
                        href={cut.final_video_link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-xs font-bold text-white hover:bg-zinc-700 transition-all"
                      >
                        <Cloud className="w-3.5 h-3.5 text-zinc-300" />
                        <span>Google Drive Cut</span>
                        <ExternalLink className="w-3 h-3 text-zinc-400" />
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={(e) => handleDeleteCut(cut.id, cut.title, e)}
                      className="p-1.5 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800 border border-transparent hover:border-zinc-700 transition-colors"
                      title="Delete this cut"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Revision Feedback box if changes were requested */}
                {cut.editing_status === 'changes_requested' && cut.approval_notes && (
                  <div className="p-3.5 rounded-2xl bg-black border border-zinc-700 text-xs space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 text-white" />
                      Feedback from Reviewer:
                    </span>
                    <p className="text-white font-medium">{cut.approval_notes}</p>
                  </div>
                )}

                {/* Title & Interactive Progress Slider */}
                <div>
                  <h4 className="font-black text-white text-base">
                    {cut.title}
                  </h4>
                  <div className="flex items-center justify-between mt-1 text-xs text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <span>Current Editing Progress:</span>
                      <span className="text-[10px] text-zinc-500 font-medium hidden sm:inline">(drag slider to set)</span>
                    </span>
                    <span className="font-black text-white text-sm tracking-tight">
                      {cut.progress_percentage || 0}% Done
                    </span>
                  </div>

                  {/* Custom Draggable Progress Slider */}
                  <div className="relative w-full flex items-center py-2 select-none group">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={cut.progress_percentage || 0}
                      onChange={(e) => handleSliderChange(cut, Number(e.target.value))}
                      onPointerUp={(e) => handleSliderCommit(cut, Number((e.target as HTMLInputElement).value))}
                      onTouchEnd={(e) => handleSliderCommit(cut, Number((e.target as HTMLInputElement).value))}
                      onKeyUp={(e) => handleSliderCommit(cut, Number((e.target as HTMLInputElement).value))}
                      className="stealth-slider w-full cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, #ffffff 0%, #ffffff ${cut.progress_percentage || 0}%, #18181b ${cut.progress_percentage || 0}%, #18181b 100%)`
                      }}
                      title={`Drag to adjust progress (${cut.progress_percentage || 0}%)`}
                    />
                  </div>
                </div>

                {/* Quick Progress Buttons & Actions */}
                <div className="pt-2 border-t border-zinc-800 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase mr-1">
                      Quick Set:
                    </span>
                    {[25, 50, 75, 100].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => handleQuickProgress(cut, pct)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          (cut.progress_percentage || 0) === pct
                            ? 'bg-white text-black font-black shadow-md'
                            : 'bg-black border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Google Drive Link Modal Trigger */}
                    <button
                      type="button"
                      onClick={() => openDriveModal(cut)}
                      className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-all active:scale-95"
                    >
                      <Cloud className="w-3.5 h-3.5" />
                      <span>{cut.final_video_link ? 'Edit Drive Link' : '+ Drive Link'}</span>
                    </button>

                    {/* Status badges & SMM Approval button (ONLY visible when 100% complete) */}
                    {cut.editing_status === 'submitted_for_approval' ? (
                      <span className="text-xs font-bold text-zinc-400 bg-zinc-800 px-3 py-1.5 rounded-full border border-zinc-700 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-zinc-300" />
                        <span>{cut.approval_notes?.includes('Sent to Founder') ? 'With Founder' : 'With SMM'}</span>
                      </span>
                    ) : cut.editing_status === 'approved' ? (
                      <span className="text-xs font-bold text-white bg-zinc-800 px-3 py-1.5 rounded-full border border-zinc-700 flex items-center gap-1">
                        <Check className="w-3 h-3 text-white" />
                        <span>Greenlit ✓</span>
                      </span>
                    ) : (cut.progress_percentage || 0) === 100 ? (
                      <button
                        type="button"
                        onClick={() => handleSendToSMM(cut)}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-black bg-white text-black hover:bg-zinc-200 transition-all active:scale-95 shadow-md animate-in fade-in"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{cut.editing_status === 'changes_requested' ? 'Re-Submit to SMM 🚀' : 'Send to SMM for Approval 🚀'}</span>
                      </button>
                    ) : (
                      <span className="text-[11px] font-medium text-zinc-500 bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-full">
                        Reach 100% to submit
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 100% GOOGLE DRIVE SUBMISSION MODAL */}
        {driveModalCut && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-800 overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-zinc-800 border border-zinc-700 text-white flex items-center justify-center">
                    <Cloud className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">
                      100% Cut Completion
                    </span>
                    <h3 className="font-black text-white text-base">
                      Provide Google Drive Link
                    </h3>
                  </div>
                </div>

                <button
                  onClick={() => setDriveModalCut(null)}
                  className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitDriveLink} className="p-5 space-y-4">
                <div className="p-3 rounded-2xl bg-black border border-zinc-800 text-xs">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase block mb-0.5">
                    Submitting Cut:
                  </span>
                  <span className="font-black text-white text-sm">
                    {driveModalCut.title}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1.5 flex items-center justify-between">
                    <span>Google Drive Link (Required) *</span>
                    <span className="text-[10px] text-zinc-400 font-medium">View / Download Link</span>
                  </label>
                  <input
                    type="url"
                    required
                    value={driveUrl}
                    onChange={(e) => setDriveUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/... or folder URL"
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white font-medium focus:outline-none focus:border-zinc-500"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Once submitted, this cut will be marked as 100% completed and immediately available to the Social Media Manager and Founder for publishing.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Notes / Quality Info (Optional)
                  </label>
                  <input
                    type="text"
                    value={driveNotes}
                    onChange={(e) => setDriveNotes(e.target.value)}
                    placeholder="e.g. 4K 60fps export, color graded, captions burned in"
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setDriveModalCut(null)}
                    className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white rounded-full transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingDrive}
                    className="px-6 py-2.5 rounded-full text-xs font-black bg-white hover:bg-zinc-200 text-black shadow-md transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isSubmittingDrive ? 'Saving...' : 'Confirm & Complete Cut ✓'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // VIEW 1: FRONT PODCASTS LIST VIEW
  // ==========================================
  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 bg-white text-black font-black px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 border border-zinc-200 animate-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-black" />
          <span className="text-xs">{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
            {mode === 'my' ? 'My Active Work' : 'Podcast Production Queue'}
          </span>
          <h2 className="text-2xl font-black text-white tracking-tight">
            {mode === 'my' ? 'My Assigned Podcasts' : 'Available Podcasts for Editing'}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            1 Podcast = 1 Dedicated Video Editor. Click any podcast to manage its reels, update editing progress, and submit final Google Drive links.
          </p>
        </div>

        <button
          onClick={() => loadData(true)}
          disabled={isLoading}
          className="p-2 rounded-full border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 shadow-sm transition-all self-start sm:self-auto"
          title="Refresh Podcasts"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Work Type Filter Tabs (Client Works vs Studio Works) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setWorkFilter('all')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
            workFilter === 'all'
              ? 'bg-white text-black font-black shadow-md'
              : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          All Tasks ({displayedPodcasts.length})
        </button>

        <button
          type="button"
          onClick={() => setWorkFilter('client')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
            workFilter === 'client'
              ? 'bg-white text-black font-black shadow-lg ring-2 ring-white/50'
              : 'bg-zinc-900 text-white border-2 border-white/60 hover:border-white shadow-sm'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5" />
          <span>Client Works ({clientWorksCount})</span>
          <span className="w-2 h-2 rounded-full bg-white shadow-[0_0_6px_#fff]" />
        </button>

        <button
          type="button"
          onClick={() => setWorkFilter('studio')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
            workFilter === 'studio'
              ? 'bg-white text-black font-black shadow-md'
              : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          Studio Internal ({studioWorksCount})
        </button>
      </div>

      {/* PODCASTS LIST */}
      {isLoading ? (
        <div className="py-20 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-zinc-700 border-t-white rounded-full mx-auto" />
          <p className="mt-3 text-xs text-zinc-500">Loading podcasts &amp; editing status...</p>
        </div>
      ) : displayedPodcasts.length === 0 ? (
        <div className="py-16 text-center rounded-3xl bg-zinc-900 border border-zinc-800 p-8 space-y-2">
          <Film className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-white">
            {mode === 'my' ? 'No podcasts currently assigned to you' : 'No open podcasts in queue'}
          </h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            {mode === 'my' 
              ? 'Switch to the "Tasks" tab to claim and accept an open podcast shoot.' 
              : 'All podcasts have been claimed by editors. Check back when the Social Media Manager shares new footage.'}
          </p>
        </div>
      ) : filteredPodcasts.length === 0 ? (
        <div className="py-14 text-center rounded-3xl bg-zinc-900 border border-zinc-800 p-6 space-y-2">
          <Briefcase className="w-8 h-8 text-zinc-600 mx-auto mb-1" />
          <h3 className="text-sm font-bold text-white">
            {workFilter === 'client' ? 'No Client Works in this view' : 'No Studio Works in this view'}
          </h3>
          <p className="text-xs text-zinc-400">
            {workFilter === 'client' 
              ? 'When client footage or brand projects are created, they will stand out here in white.' 
              : 'Switch filter to "All Tasks" to view everything.'}
          </p>
          <button
            type="button"
            onClick={() => setWorkFilter('all')}
            className="mt-2 px-4 py-1.5 rounded-full text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-white"
          >
            Show All Tasks
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPodcasts.map((podcast) => {
            const reels = podcast.deliverables.filter(d => d.deliverable_type === 'reel');
            const fullVideos = podcast.deliverables.filter(d => d.deliverable_type === 'full_length_video');
            const completedReels = reels.filter(r => (r.progress_percentage || 0) === 100).length;
            const completedFull = fullVideos.filter(f => (f.progress_percentage || 0) === 100).length;

            if (podcast.isClientWork) {
              return (
                <div
                  key={podcast.id}
                  onClick={() => setActivePodcastId(podcast.id)}
                  className="p-5 rounded-3xl bg-zinc-950 border-2 border-white shadow-[0_0_30px_rgba(255,255,255,0.22)] ring-1 ring-white/60 hover:shadow-[0_0_36px_rgba(255,255,255,0.3)] transition-all duration-200 cursor-pointer space-y-4 group relative overflow-hidden"
                >
                  {/* Top Banner in pure white */}
                  <div className="bg-white text-black px-4 py-2 rounded-2xl flex items-center justify-between font-black text-xs shadow-md">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-5 h-5 rounded-md bg-black text-white flex items-center justify-center shrink-0">
                        <Briefcase className="w-3 h-3 text-white" />
                      </div>
                      <span className="tracking-wider uppercase font-black text-[11px]">CLIENT WORK</span>
                      <span className="font-extrabold text-zinc-800 text-[11px] truncate">
                        • {podcast.clientBrandName || 'Brand Deliverable'}
                      </span>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-wider bg-black text-white px-2.5 py-0.5 rounded-full border border-black shrink-0">
                      Dedicated Client
                    </span>
                  </div>

                  {/* Header Row: Title & Deadline */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-white text-black border border-white inline-flex items-center gap-1 shadow-sm">
                          <Briefcase className="w-2.5 h-2.5 text-black" />
                          CLIENT
                        </span>
                        <span className="text-xs font-black text-zinc-300 uppercase">
                          {podcast.clientBrandName}
                        </span>
                      </div>
                      <h3 className="font-black text-white text-base group-hover:text-zinc-100 transition-colors">
                        {podcast.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-zinc-500" />
                          Shot: {podcast.recording_date}
                        </span>

                        {/* DEADLINE DISPLAY (BY SMM) */}
                        {podcast.deadline && (
                          <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-zinc-800 text-white border border-zinc-700 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-white" />
                            <span>Deadline: {podcast.deadline}</span>
                          </span>
                        )}

                        <span className="text-[10px] font-semibold text-zinc-400 flex items-center gap-1">
                          <User className="w-3 h-3 text-zinc-500" />
                          <span>Editor: <strong className="text-zinc-200">{podcast.editor_name}</strong></span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {podcast.isMyPodcast ? (
                        <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-white text-black border border-white shrink-0 shadow-md">
                          Assigned to You
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => handleClaimPodcast(podcast, e)}
                          className="px-3.5 py-1.5 rounded-full bg-white text-black text-xs font-black hover:bg-zinc-200 transition-all shadow-[0_0_15px_rgba(255,255,255,0.4)] active:scale-95 shrink-0"
                        >
                          🎬 Claim Client Task
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => handleDeletePodcast(podcast, e)}
                        className="p-1.5 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                        title="Delete podcast"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Overall Podcast Progress Bar with White Highlight */}
                  <div className="space-y-1.5 pt-1 border-t border-zinc-800">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-300 font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_5px_#fff]" />
                        <span>{podcast.completedCuts} of {podcast.totalCuts} Cuts Done ({completedReels} Reels, {completedFull} Full)</span>
                      </span>
                      <span className="font-black text-black bg-white px-2.5 py-0.5 rounded-full text-[11px] shadow-sm">
                        {podcast.progressPercentage}%
                      </span>
                    </div>

                    <div className="w-full bg-black h-2.5 rounded-full overflow-hidden border border-white/60">
                      <div
                        className="bg-white h-full rounded-full transition-all duration-300 shadow-[0_0_10px_#ffffff]"
                        style={{ width: `${podcast.progressPercentage}%` }}
                      />
                    </div>
                  </div>

                  {/* Open Podcast Button */}
                  <div className="pt-2 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-zinc-400 font-medium">
                      Click to open client cuts &amp; upload deliverables
                    </span>
                    <div className="flex items-center gap-1 font-black text-white group-hover:translate-x-1 transition-transform">
                      <span>Manage Client Cuts</span>
                      <ChevronRight className="w-4 h-4 text-white" />
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={podcast.id}
                onClick={() => setActivePodcastId(podcast.id)}
                className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-sm hover:border-zinc-700 hover:shadow-xl transition-all duration-200 cursor-pointer space-y-4 group"
              >
                {/* Header Row: Title & Deadline */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black text-white text-base group-hover:text-zinc-200 transition-colors">
                      {podcast.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-zinc-500" />
                        Shot: {podcast.recording_date}
                      </span>

                      {/* DEADLINE DISPLAY (BY SMM) */}
                      {podcast.deadline && (
                        <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-zinc-800 text-white border border-zinc-700 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-white" />
                          <span>Deadline: {podcast.deadline}</span>
                        </span>
                      )}

                      <span className="text-[10px] font-semibold text-zinc-400 flex items-center gap-1">
                        <User className="w-3 h-3 text-zinc-500" />
                        <span>Editor: <strong className="text-zinc-200">{podcast.editor_name}</strong></span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {podcast.isMyPodcast ? (
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-white text-black border border-white shrink-0">
                        Assigned to You
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => handleClaimPodcast(podcast, e)}
                        className="px-3.5 py-1.5 rounded-full bg-white text-black text-xs font-black hover:bg-zinc-200 transition-all shadow-md active:scale-95 shrink-0"
                      >
                        🎬 Claim Podcast
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => handleDeletePodcast(podcast, e)}
                      className="p-1.5 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                      title="Delete podcast"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Overall Podcast Progress Bar */}
                <div className="space-y-1.5 pt-1 border-t border-zinc-800">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400 font-bold">
                      {podcast.completedCuts} of {podcast.totalCuts} Cuts Done ({completedReels} Reels, {completedFull} Full)
                    </span>
                    <span className="font-black text-white bg-zinc-800 px-2 py-0.5 rounded-full text-[11px] border border-zinc-700">
                      {podcast.progressPercentage}%
                    </span>
                  </div>

                  <div className="w-full bg-black h-2 rounded-full overflow-hidden border border-zinc-800">
                    <div
                      className="bg-white h-full rounded-full transition-all duration-300"
                      style={{ width: `${podcast.progressPercentage}%` }}
                    />
                  </div>
                </div>

                {/* Open Podcast Button */}
                <div className="pt-2 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-zinc-500 font-medium">
                    Click to add / manage reels &amp; submit Drive link
                  </span>
                  <div className="flex items-center gap-1 font-bold text-white group-hover:translate-x-1 transition-transform">
                    <span>Manage Cuts</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
