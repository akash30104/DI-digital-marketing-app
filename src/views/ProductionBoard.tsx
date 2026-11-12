import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Deliverable, EditingStatus, Profile, Recording } from '../types';
import { 
  Film, Search, RefreshCw, User, CheckCircle2, Clock, 
  Play, Sparkles, X, Trash2, ChevronRight, ExternalLink, Plus, UserPlus, PlaySquare
} from 'lucide-react';
import { 
  filterDeliverables, filterRecordings, 
  deleteSingleDeliverable, purgeAllDeliverables,
  isDeliverablePublished 
} from '../lib/deletionFilter';
import { getProjects, getProfiles } from '../lib/api';

interface ProductionBoardProps {
  onNavigateTab?: (tab: string) => void;
}

export const ProductionBoard: React.FC<ProductionBoardProps> = ({ onNavigateTab }) => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [editors, setEditors] = useState<Profile[]>([]);
  const [publishedIds, setPublishedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filter & Search
  const [activeTab, setActiveTab] = useState<'pending' | 'today' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal for editor-wise detailed breakdown
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [editorModalTab, setEditorModalTab] = useState<'all' | 'today' | 'pending'>('all');

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchBoardData = async () => {
    try {
      const [recsRes, delivRes, profilesRes, projectsList, pubLogsRes, proofsRes] = await Promise.all([
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
          .select('*')
          .eq('role', 'editor')
          .order('full_name'),
        getProjects(),
        supabase
          .from('publishing_logs')
          .select('id, deliverable_id, notes, recording_id, publication_status'),
        supabase
          .from('publishing_proofs')
          .select('id, task_id, project_id, notes')
      ]);

      const publishedDelivIds = new Set<string>();

      if (pubLogsRes?.data) {
        for (const log of pubLogsRes.data) {
          if (log.deliverable_id) publishedDelivIds.add(log.deliverable_id);
          if (log.notes) {
            const match = log.notes.match(/\[(?:TaskId|DelivId):\s*([^\]]+)\]/i);
            if (match && match[1]) publishedDelivIds.add(match[1].trim());
          }
        }
      }

      if (proofsRes?.data) {
        for (const proof of proofsRes.data) {
          if (proof.task_id) publishedDelivIds.add(proof.task_id);
        }
      }

      try {
        const localProofs = JSON.parse(localStorage.getItem('di_platform_proofs_v2') || '[]');
        if (Array.isArray(localProofs)) {
          for (const p of localProofs) {
            if (p.task_id) publishedDelivIds.add(p.task_id);
          }
        }
      } catch {}

      try {
        const localLogs = JSON.parse(localStorage.getItem('di_publishing_logs_v2') || '[]');
        if (Array.isArray(localLogs)) {
          for (const l of localLogs) {
            if (l.deliverable_id) publishedDelivIds.add(l.deliverable_id);
          }
        }
      } catch {}

      setPublishedIds(publishedDelivIds);

      if (recsRes.data) {
        setRecordings(filterRecordings(recsRes.data));
      }

      let editorList = (profilesRes.data || []) as Profile[];
      if (editorList.length === 0) {
        try {
          const allProfs = await getProfiles();
          editorList = allProfs.filter(p => p.role === 'editor');
        } catch {}
      }

      let cachedProjectDelivs: Deliverable[] = [];
      try {
        const raw = localStorage.getItem('di_project_deliverables');
        if (raw) {
          const parsed: Deliverable[] = JSON.parse(raw);
          cachedProjectDelivs = parsed.filter(d => 
            d.project_id !== 'proj-llbs-podcast' && 
            d.recording_id !== 'proj-llbs-podcast' &&
            !d.title?.toLowerCase().includes('unfiltered podcast')
          );
        }
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

      // Synthesize deliverables for projects created by SMM/Founder
      const validProjects = (projectsList || []).filter(p => 
        p.id !== 'proj-llbs-podcast' && 
        !p.name?.toLowerCase().includes('unfiltered podcast')
      );

      for (const proj of validProjects) {
        const hasDelivs = rawDels.some(d => 
          d.project_id === proj.id || 
          d.recording_id === proj.id || 
          (d.title && proj.name && d.title.toLowerCase().startsWith(proj.name.toLowerCase()))
        );
        if (!hasDelivs) {
          const videoCount = Math.max(1, proj.required_video_count || proj.required_videos_count || 1);
          const projPlatforms = (proj.platforms as string[]) || [];
          const isFullVideo = 
            projPlatforms.includes('youtube_full') || 
            projPlatforms.includes('full') || 
            proj.name.toLowerCase().includes('full video') || 
            proj.name.toLowerCase().includes('full episode');

          const primaryEditorId = proj.assigned_editor_ids?.[0] || undefined;
          const assignedEd = editorList.find(e => e.id === primaryEditorId);
          const editorName = assignedEd?.full_name || (primaryEditorId ? 'Assigned Editor' : 'Unassigned');

          for (let i = 1; i <= videoCount; i++) {
            const dTitle = videoCount === 1 
              ? `${proj.name} - ${isFullVideo ? 'Full Episode Video (16:9)' : 'Reel (9:16)'}`
              : `${proj.name} - ${isFullVideo ? 'Full Video Cut' : 'Reel'} #${i}`;
            
            const dId = `deliv-${proj.id}-${i}`;
            const cachedProps = progressCache[dId] || {};

            rawDels.push({
              id: dId,
              recording_id: proj.id,
              recording_title: proj.name,
              project_id: proj.id,
              client_id: proj.client_id,
              client_name: proj.client_name,
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
            seenDelivIds.add(dId);
          }
        }
      }

      // Synthesize deliverables for any recordings/shoots that don't have deliverables yet
      const cleanRecordings = (recsRes.data || []).filter((r: any) => 
        r.id !== 'proj-llbs-podcast' &&
        !r.title?.toLowerCase().includes('unfiltered podcast')
      );

      for (const rec of cleanRecordings) {
        const hasDelivs = rawDels.some(d => 
          d.recording_id === rec.id || 
          d.project_id === rec.id || 
          (d.title && rec.title && d.title.toLowerCase().startsWith(rec.title.toLowerCase()))
        );
        if (!hasDelivs) {
          const recTitle = rec.title || 'Studio Shoot';
          const isFullVideo = 
            recTitle.toLowerCase().includes('full video') || 
            recTitle.toLowerCase().includes('full episode') ||
            (rec.notes && /full video|16:9/i.test(rec.notes));

          let deadline: string | null = null;
          if (rec.notes) {
            const dlMatch = rec.notes.match(/\[Deadline:\s*([^\]]+)\]/i);
            if (dlMatch) deadline = dlMatch[1].trim();
          }

          let assignedEditorId: string | undefined = undefined;
          let editorName = 'Unassigned';
          if (rec.notes) {
            const edIdMatch = rec.notes.match(/\[EditorId:\s*([^\]]+)\]/i);
            const edNameMatch = rec.notes.match(/\[Editor:\s*([^\]]+)\]/i);
            if (edIdMatch && edIdMatch[1] && edIdMatch[1] !== 'undefined') {
              assignedEditorId = edIdMatch[1].trim();
            }
            if (edNameMatch && edNameMatch[1]) {
              editorName = edNameMatch[1].trim();
            }
            if (!assignedEditorId) {
              for (const ed of editorList) {
                if (ed.full_name && rec.notes.toLowerCase().includes(ed.full_name.toLowerCase())) {
                  assignedEditorId = ed.id;
                  editorName = ed.full_name || 'Editor';
                  break;
                }
              }
            }
          }

          const dId = `deliv-rec-${rec.id}-1`;
          const cachedProps = progressCache[dId] || progressCache[rec.id] || {};

          rawDels.push({
            id: dId,
            recording_id: rec.id,
            recording_title: recTitle,
            project_id: rec.id,
            client_id: rec.client_id || 'internal',
            client_name: rec.hard_disk_name || 'Internal Studio',
            title: `${recTitle} - ${isFullVideo ? 'Full Episode Video (16:9)' : 'Reel (9:16)'}`,
            deliverable_type: isFullVideo ? 'full_length_video' : 'reel',
            aspect_ratio: isFullVideo ? '16:9' : '9:16',
            assigned_editor_id: assignedEditorId,
            editor_name: editorName,
            editing_status: assignedEditorId ? 'assigned' : 'not_started',
            priority: isFullVideo ? 'high' : 'medium',
            deadline,
            progress_percentage: 0,
            created_at: rec.created_at || new Date().toISOString(),
            ...cachedProps
          });
          seenDelivIds.add(dId);
        }
      }

      // Apply cached updates (progress, video links, status)
      for (const d of rawDels) {
        if (progressCache[d.id]) {
          Object.assign(d, progressCache[d.id]);
        }
        if (!d.editor_name || d.editor_name === 'Unassigned') {
          if (d.assigned_editor_id) {
            const matchedEd = editorList.find(e => e.id === d.assigned_editor_id);
            if (matchedEd) d.editor_name = matchedEd.full_name || 'Editor';
          }
        }
        // If deliverable is published by status, proof, or publish notes, reconcile
        if (isDeliverablePublished(d, publishedDelivIds)) {
          publishedDelivIds.add(d.id);
          d.editing_status = 'published';
          d.progress_percentage = 100;
        }
      }

      // Ensure any editors assigned to deliverables are in editorList
      const allEditorIds = new Set(editorList.map(e => e.id));
      for (const d of rawDels) {
        if (d.assigned_editor_id && !allEditorIds.has(d.assigned_editor_id)) {
          editorList.push({
            id: d.assigned_editor_id,
            full_name: d.editor_name || 'Assigned Editor',
            email: '',
            role: 'editor'
          });
          allEditorIds.add(d.assigned_editor_id);
        }
      }

      setEditors(editorList);
      // Strictly exclude any published deliverables from the active Production Board
      const activeDeliverables = filterDeliverables(rawDels).filter(
        d => !isDeliverablePublished(d, publishedDelivIds) && d.editing_status !== 'published'
      );
      setDeliverables(activeDeliverables);
    } catch (err) {
      console.error('Failed to load production board:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleDeleteDeliverable = async (id: string, title?: string) => {
    if (!window.confirm(`Delete task "${title || 'item'}"?`)) return;
    setDeliverables(prev => prev.filter(d => d.id !== id));
    await deleteSingleDeliverable(id);
    showToast(`Task deleted successfully.`);
  };

  const handleDeleteAllTasks = async () => {
    if (deliverables.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ALL (${deliverables.length}) deliverables?`)) return;
    const ids = deliverables.map(d => d.id);
    setDeliverables([]);
    await purgeAllDeliverables(ids);
    showToast(`All deliverables deleted successfully.`);
  };

  useEffect(() => {
    fetchBoardData();

    const handleSync = () => {
      fetchBoardData();
    };
    window.addEventListener('storage', handleSync);
    window.addEventListener('channels-updated', handleSync);
    window.addEventListener('focus', handleSync);

    const delivSub = supabase
      .channel('production-board-deliverables')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliverables' }, () => {
        fetchBoardData();
      })
      .subscribe();

    const recSub = supabase
      .channel('production-board-recordings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recordings' }, () => {
        fetchBoardData();
      })
      .subscribe();

    const pubSub = supabase
      .channel('production-board-publishing')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'publishing_logs' }, () => {
        fetchBoardData();
      })
      .subscribe();

    return () => {
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('channels-updated', handleSync);
      window.removeEventListener('focus', handleSync);
      supabase.removeChannel(delivSub);
      supabase.removeChannel(recSub);
      supabase.removeChannel(pubSub);
    };
  }, []);

  const updateLocalDeliverable = (cutId: string, updates: Record<string, any>) => {
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
      console.warn('Error updating local deliverable cache:', e);
    }
  };

  const handleAssignEditor = async (deliverableId: string, editorId: string) => {
    try {
      const now = new Date().toISOString();
      const matchedEd = editors.find(e => e.id === editorId);
      const updates = {
        assigned_editor_id: editorId || undefined,
        editor_name: matchedEd?.full_name || (editorId ? 'Assigned Editor' : 'Unassigned'),
        editing_status: (editorId ? 'assigned' : 'not_started') as EditingStatus,
        updated_at: now
      };

      updateLocalDeliverable(deliverableId, updates);
      setDeliverables(prev => prev.map(d => d.id === deliverableId ? { ...d, ...updates } : d));

      try {
        await supabase
          .from('deliverables')
          .update({
            assigned_editor_id: editorId || null,
            editing_status: editorId ? 'assigned' : 'not_started',
            updated_at: now
          })
          .eq('id', deliverableId);
      } catch (e) {
        console.warn('DB assignment note:', e);
      }

      showToast(`Editor assignment updated to ${matchedEd?.full_name || 'Unassigned'}!`);
      fetchBoardData();
    } catch (e: any) {
      alert(`Assignment failed: ${e.message}`);
    }
  };

  const handleUpdateStatus = async (deliverableId: string, newStatus: EditingStatus, progress?: number) => {
    try {
      const now = new Date().toISOString();
      const updates: Record<string, any> = {
        editing_status: newStatus,
        updated_at: now
      };
      if (progress !== undefined) {
        updates.progress_percentage = progress;
      }

      updateLocalDeliverable(deliverableId, updates);
      setDeliverables(prev => prev.map(d => d.id === deliverableId ? { ...d, ...updates } : d));

      try {
        await supabase
          .from('deliverables')
          .update(updates)
          .eq('id', deliverableId);
      } catch (e) {
        console.warn('DB status update note:', e);
      }

      showToast(`Status updated to ${newStatus.replace(/_/g, ' ')}!`);
      fetchBoardData();
    } catch (e: any) {
      alert(`Status update failed: ${e.message}`);
    }
  };

  const handleRequestRevision = (deliverableId: string) => {
    const reason = window.prompt('Specify revision notes for the editor:');
    if (!reason || !reason.trim()) return;

    handleUpdateStatus(deliverableId, 'changes_requested');
    updateLocalDeliverable(deliverableId, {
      approval_notes: reason.trim(),
      updated_at: new Date().toISOString()
    });
    showToast('Revision notes sent to editor!');
  };

  // Today's date string in Asia/Kolkata
  const todayDateStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  }, []);

  // Watertight check to ensure published deliverables NEVER appear on the active production board
  const isAnyPublished = React.useCallback((d: Deliverable): boolean => {
    if (!d) return false;
    if (d.editing_status === 'published' || (d as any).publication_status === 'published') return true;
    if (isDeliverablePublished(d, publishedIds)) return true;
    const fullText = `${d.approval_notes || ''} ${d.description || ''} ${d.title || ''} ${(d as any).notes || ''} ${(d as any).editor_note || ''}`.toLowerCase();
    if (
      fullText.includes('published to') ||
      fullText.includes('& published') ||
      fullText.includes('approved & published') ||
      fullText.includes('already published') ||
      fullText.includes('publication proof')
    ) {
      return true;
    }
    return false;
  }, [publishedIds]);

  // Videos edited or actively in progress today, or ready with an edited video review link
  // NOTE: Published videos strictly belong in Published Archive and are excluded from the active Production Board
  const todayEditedVideos = useMemo(() => {
    return deliverables.filter(d => {
      if (d.editing_status === 'cancelled' || isAnyPublished(d)) return false;
      const updatedDate = d.updated_at 
        ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(d.updated_at)) 
        : '';
      const createdDate = d.created_at
        ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(d.created_at))
        : '';
      const isToday = updatedDate === todayDateStr || createdDate === todayDateStr;
      
      const hasEditedVideo = !!(d.final_video_link || d.preview_link);
      const isAwaitingApproval = d.editing_status === 'submitted_for_approval';
      const isApproved = d.editing_status === 'approved';
      const hasProgress = (d.progress_percentage || 0) > 0;
      const isActiveStatus = d.editing_status === 'editing_in_progress' || d.editing_status === 'internal_review';
      
      // Video is edited/active: has edited link, submitted for review, approved (awaiting publish), or edited today/progress > 0
      return hasEditedVideo || isAwaitingApproval || isApproved || (isToday && (hasProgress || isActiveStatus)) || hasProgress;
    });
  }, [deliverables, todayDateStr, isAnyPublished]);

  // Pending works (any task in pipeline not yet 100% completed & approved/published)
  const pendingDeliverables = useMemo(() => {
    return deliverables.filter(d => {
      if (d.editing_status === 'cancelled' || isAnyPublished(d)) return false;
      const isCompleted = (d.progress_percentage || 0) === 100 && d.editing_status === 'approved';
      return !isCompleted;
    });
  }, [deliverables, isAnyPublished]);

  // Unassigned deliverables in pipeline
  const unassignedDeliverables = useMemo(() => {
    return deliverables.filter(d => 
      !d.assigned_editor_id && 
      d.editing_status !== 'cancelled' && 
      !isAnyPublished(d)
    );
  }, [deliverables, isAnyPublished]);

  // Detailed editor-wise breakdown for the modal
  const editorBreakdowns = useMemo(() => {
    return editors.map(editor => {
      const assigned = deliverables.filter(d => 
        d.assigned_editor_id === editor.id && 
        d.editing_status !== 'cancelled' &&
        !isAnyPublished(d)
      );
      const todayVids = assigned.filter(d => todayEditedVideos.some(tv => tv.id === d.id));
      const pendingVids = assigned.filter(d => pendingDeliverables.some(pv => pv.id === d.id));
      const totalProgress = assigned.reduce((acc, d) => acc + (d.progress_percentage || 0), 0);
      const avgProgress = assigned.length > 0 ? Math.round(totalProgress / assigned.length) : 0;

      return {
        editorId: editor.id,
        editorName: editor.full_name || 'Editor',
        avatarUrl: editor.avatar_url,
        assignedTotal: assigned.length,
        todayVideos: todayVids,
        pendingVideos: pendingVids,
        avgProgress
      };
    });
  }, [editors, deliverables, todayEditedVideos, pendingDeliverables, isAnyPublished]);

  // Filtered list based on active tab and search query
  const displayedVideos = useMemo(() => {
    let list: Deliverable[] = [];
    if (activeTab === 'today') {
      list = todayEditedVideos;
    } else if (activeTab === 'pending') {
      list = pendingDeliverables;
    } else {
      list = deliverables.filter(d => !isAnyPublished(d));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(d => 
        d.title.toLowerCase().includes(q) || 
        (d.editor_name || '').toLowerCase().includes(q) ||
        (d.recording_title || '').toLowerCase().includes(q)
      );
    }

    // Double-safeguard: completely eliminate any published cuts
    return list.filter(d => !isAnyPublished(d));
  }, [activeTab, todayEditedVideos, pendingDeliverables, deliverables, searchQuery, isAnyPublished]);

interface ProductionProjectGroup {
  projectId: string;
  projectTitle: string;
  editorName: string;
  reelsCount: number;
  fullVideosCount: number;
  avgProgress: number;
  videos: Deliverable[];
}

  // Group displayed videos by project/recording ("show inside project show all")
  const groupedProjectVideos = useMemo<ProductionProjectGroup[]>(() => {
    const map = new Map<string, {
      projectId: string;
      projectTitle: string;
      editorName: string;
      videos: Deliverable[];
    }>();

    displayedVideos.forEach((cut: Deliverable) => {
      if (isAnyPublished(cut)) return;
      const projKey = cut.recording_id || (cut.recording_title ? cut.recording_title.trim() : '') || (cut.title.includes(' - ') ? cut.title.split(' - ')[0].trim() : 'Studio Project');
      const projTitle = cut.recording_title || (cut.title.includes(' - ') ? cut.title.split(' - ')[0].trim() : cut.title);

      if (!map.has(projKey)) {
        map.set(projKey, {
          projectId: projKey,
          projectTitle: projTitle,
          editorName: cut.editor_name || 'Unassigned',
          videos: []
        });
      }
      map.get(projKey)!.videos.push(cut);
    });

    return Array.from(map.values())
      .filter(g => g.videos.length > 0)
      .map(g => {
        const reels = g.videos.filter((v: Deliverable) => v.deliverable_type === 'reel');
        const fulls = g.videos.filter((v: Deliverable) => v.deliverable_type === 'full_length_video');
        const totalProg = g.videos.reduce((acc: number, v: Deliverable) => acc + (v.progress_percentage || 0), 0);
        const avgProg = g.videos.length > 0 ? Math.round(totalProg / g.videos.length) : 0;
        const primaryEditor = g.videos.find((v: Deliverable) => v.editor_name && v.editor_name !== 'Unassigned')?.editor_name || g.editorName;

        return {
          ...g,
          editorName: primaryEditor,
          reelsCount: reels.length,
          fullVideosCount: fulls.length,
          avgProgress: avgProg
        };
      });
  }, [displayedVideos, isAnyPublished]);

  const getStatusBadge = (status: EditingStatus) => {
    switch (status) {
      case 'published':
        return { label: 'Published (Archive)', bg: 'bg-zinc-800 text-zinc-300 border-zinc-700' };
      case 'not_started':
        return { label: 'Not Started', bg: 'bg-zinc-800 text-zinc-300 border-zinc-700' };
      case 'assigned':
        return { label: 'Assigned', bg: 'bg-zinc-800 text-zinc-200 border-zinc-700' };
      case 'editing_in_progress':
        return { label: 'Editing In Progress', bg: 'bg-zinc-800 text-zinc-100 border-zinc-600' };
      case 'internal_review':
        return { label: 'In Review', bg: 'bg-zinc-800 text-zinc-200 border-zinc-700' };
      case 'submitted_for_approval':
        return { label: 'Awaiting Approval', bg: 'bg-zinc-700 text-white border-zinc-500' };
      case 'changes_requested':
        return { label: 'Changes Requested', bg: 'bg-zinc-800 text-zinc-300 border-zinc-700' };
      case 'approved':
        return { label: 'Approved & Done', bg: 'bg-white text-black border-white' };
      case 'blocked':
        return { label: 'Blocked', bg: 'bg-zinc-900 text-zinc-400 border-zinc-800' };
      default:
        return { label: status, bg: 'bg-zinc-800 text-zinc-300 border-zinc-700' };
    }
  };

  return (
    <div className="space-y-6 pb-24 text-zinc-100">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-[#18181B] text-white px-5 py-3 rounded-2xl border border-zinc-700 shadow-2xl flex items-center gap-3 text-xs font-bold animate-in fade-in slide-in-from-top-4 duration-200">
          <Sparkles className="w-4 h-4 text-white shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Film className="w-6 h-6 text-zinc-300" />
            <span>Production Board</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Monitor videos editing today, pending pipeline tasks, and editor progress.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('team')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-zinc-200 text-black shadow-sm transition active:scale-[0.99]"
              title="Invite a new Video Editor"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+ Invite Editor</span>
            </button>
          )}

          {deliverables.length > 0 && (
            <button
              onClick={handleDeleteAllTasks}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#18181B] border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 transition shadow-sm"
              title="Delete all deliverables from board"
            >
              <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
              <span>Delete All Tasks</span>
            </button>
          )}

          <button
            onClick={() => { setRefreshing(true); fetchBoardData(); }}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#18181B] border border-zinc-800 text-zinc-200 hover:bg-zinc-800 hover:border-zinc-700 transition shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* The Two Main Focus Cards: VIDEOS EDITING TODAY & PENDING WORKS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* CARD 1: VIDEOS EDITING TODAY */}
        <div 
          onClick={() => {
            setActiveTab('today');
            setTimeout(() => {
              const el = document.getElementById('production-deliverables-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }, 50);
          }}
          className={`bg-[#121214] border p-4 rounded-2xl transition-all cursor-pointer group shadow-sm ${
            activeTab === 'today'
              ? 'border-white bg-zinc-900/80 ring-1 ring-white/20'
              : 'border-[#27272A] hover:border-zinc-600 hover:bg-zinc-900/50'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-white" />
              <span>Videos Editing Today</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditorModalTab('today');
                setShowEditorModal(true);
              }}
              className="text-[10px] font-bold text-zinc-300 group-hover:text-white flex items-center gap-1 transition-colors bg-zinc-800/90 px-2.5 py-1 rounded-full border border-zinc-700 hover:bg-zinc-700"
            >
              Editor Overview ↗
            </button>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white tracking-tight">
              {todayEditedVideos.length}
            </span>
            <span className="text-xs font-semibold text-zinc-400">
              {todayEditedVideos.length === 1 ? 'video active/edited' : 'videos active/edited'}
            </span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1 flex items-center justify-between">
            <span>Reels &amp; full videos with editor progress</span>
            <span className="text-zinc-400 group-hover:text-white transition-colors">
              Click to view videos ↓
            </span>
          </div>
        </div>

        {/* CARD 2: PENDING WORKS */}
        <div 
          onClick={() => {
            setActiveTab('pending');
            setTimeout(() => {
              const el = document.getElementById('production-deliverables-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }, 50);
          }}
          className={`bg-[#121214] border p-4 rounded-2xl transition-all cursor-pointer group shadow-sm ${
            activeTab === 'pending'
              ? 'border-white bg-zinc-900/80 ring-1 ring-white/20'
              : 'border-[#27272A] hover:border-zinc-600 hover:bg-zinc-900/50'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-zinc-300" />
              <span>Pending Works</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditorModalTab('pending');
                setShowEditorModal(true);
              }}
              className="text-[10px] font-bold text-zinc-300 group-hover:text-white flex items-center gap-1 transition-colors bg-zinc-800/90 px-2.5 py-1 rounded-full border border-zinc-700 hover:bg-zinc-700"
            >
              Editor Overview ↗
            </button>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white tracking-tight">
              {pendingDeliverables.length}
            </span>
            <span className="text-xs font-semibold text-zinc-400">
              {pendingDeliverables.length === 1 ? 'task in pipeline' : 'tasks in pipeline'}
            </span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1 flex items-center justify-between">
            <span>Assigned, in-progress &amp; revision tasks</span>
            <span className="text-zinc-400 group-hover:text-white transition-colors">
              Click to view pipeline tasks ↓
            </span>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-[#121214] border border-[#27272A] rounded-xl self-start">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'pending'
                ? 'bg-white text-black font-black shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pending Works ({pendingDeliverables.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('today')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'today'
                ? 'bg-white text-black font-black shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Editing Today ({todayEditedVideos.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'all'
                ? 'bg-white text-black font-black shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <span>All Works ({deliverables.length})</span>
          </button>
        </div>

        {/* Clean Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search videos or editor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-black border border-[#27272A] text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition"
          />
        </div>
      </div>

      {/* Videos List with Prominent Progress Bars */}
      {loading ? (
        <div className="py-24 text-center">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-white rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-xs text-zinc-500">Loading videos &amp; progress...</p>
        </div>
      ) : displayedVideos.length === 0 ? (
        <div className="py-16 text-center bg-[#121214] rounded-2xl border border-dashed border-[#27272A] p-6 space-y-2">
          <Film className="w-8 h-8 text-zinc-600 mx-auto" />
          <h3 className="text-sm font-bold text-zinc-300">
            {activeTab === 'today'
              ? 'No videos edited or active today yet'
              : activeTab === 'pending'
              ? 'No pending works in the pipeline'
              : 'No video deliverables found'}
          </h3>
          <p className="text-xs text-zinc-500">
            {activeTab === 'today'
              ? 'When editors start editing tasks or submit Drive links in Editor Workspace, their edited cuts will appear here.'
              : 'Register new footage or create projects to assign video tasks to editors.'}
          </p>
        </div>
      ) : (
        <div id="production-deliverables-section" className="space-y-3 pt-2 scroll-mt-6">
          {/* Section Header */}
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center justify-between pb-1">
            <div className="flex items-center gap-2">
              {activeTab === 'today' ? (
                <CheckCircle2 className="w-4 h-4 text-white" />
              ) : activeTab === 'pending' ? (
                <Clock className="w-4 h-4 text-zinc-300" />
              ) : (
                <Film className="w-4 h-4 text-zinc-300" />
              )}
              <span className="text-white font-black text-sm">
                {activeTab === 'today'
                  ? `🎬 Edited Videos & Active Cuts (${displayedVideos.length})`
                  : activeTab === 'pending'
                  ? `⏳ Pending Works in Pipeline (${displayedVideos.length})`
                  : `📋 All Video Deliverables (${displayedVideos.length})`}
              </span>
            </div>
            <span className="text-[11px] text-zinc-400 font-normal">
              {activeTab === 'today'
                ? 'Videos edited or submitted by video editors'
                : activeTab === 'pending'
                ? 'Tasks currently in progress or awaiting editor submission'
                : 'All deliverables across studio projects'}
            </span>
          </div>

          <div className="space-y-4">
            {groupedProjectVideos.map((project) => (
              <div
                key={project.projectId}
                className="p-5 rounded-3xl bg-[#121214] border border-[#27272A] shadow-sm space-y-4"
              >
                {/* Project Header Container */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                        🎬 Project
                      </span>
                      <span className="text-xs font-semibold text-zinc-400">
                        {project.videos.length} {project.videos.length === 1 ? 'Deliverable' : 'Deliverables'} ({project.reelsCount} {project.reelsCount === 1 ? 'Reel' : 'Reels'}{project.fullVideosCount > 0 ? ` • ${project.fullVideosCount} Full Video` : ''})
                      </span>
                    </div>
                    <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
                      {project.projectTitle}
                    </h3>
                    <div className="text-xs text-zinc-400">
                      Editor: <strong className="text-zinc-200">{project.editorName}</strong>
                    </div>
                  </div>

                  {/* Project Overall Progress Bar */}
                  <div className="bg-black/60 px-4 py-2 rounded-2xl border border-zinc-800 text-right min-w-[140px]">
                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                      Overall Progress
                    </div>
                    <div className="text-sm font-black text-white mt-0.5">
                      {project.avgProgress}% Done
                    </div>
                    <div className="w-full bg-zinc-800 rounded-full h-1 mt-1.5 overflow-hidden">
                      <div
                        className="bg-white h-full rounded-full transition-all duration-300"
                        style={{ width: `${project.avgProgress}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Inside Project: Show All Reels & Video Cuts */}
                <div className="space-y-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Project Deliverables &amp; Reels ({project.videos.length})
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {project.videos.map((cut) => {
                      const progress = cut.progress_percentage || 0;
                      const isDone = progress === 100 || cut.editing_status === 'approved';

                      return (
                        <div
                          key={cut.id}
                          className="p-3.5 rounded-2xl bg-black/60 border border-zinc-800/90 space-y-2.5 hover:border-zinc-700 transition"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1 pr-1">
                              <div className="text-xs font-bold text-white flex items-center gap-2 flex-wrap">
                                <span className="truncate">{cut.title}</span>
                                <span className="text-[9px] font-bold bg-zinc-900 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-800 shrink-0">
                                  {cut.deliverable_type === 'full_length_video' ? 'Full 16:9' : 'Reel 9:16'}
                                </span>
                              </div>
                              <div className="text-[10px] text-zinc-500 mt-0.5 truncate flex items-center gap-1.5">
                                <span>Editor:</span>
                                <strong className="text-zinc-200">{cut.editor_name || project.editorName}</strong>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                                isDone
                                  ? 'bg-zinc-800 text-white border-zinc-700'
                                  : 'bg-zinc-900 text-zinc-300 border-zinc-800'
                              }`}>
                                {progress}% Done
                              </span>

                              <button
                                type="button"
                                onClick={() => handleDeleteDeliverable(cut.id, cut.title)}
                                className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition"
                                title="Delete Task"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-white h-full transition-all duration-300"
                              style={{ width: `${progress}%` }}
                            />
                          </div>

                          {/* Editor Note if submitted with video */}
                          {(cut.approval_notes || cut.description) && (
                            <div className="text-[11px] text-zinc-300 bg-zinc-900/90 px-3 py-1.5 rounded-xl border border-zinc-800 flex items-start gap-1.5">
                              <span className="text-[10px] font-bold uppercase text-zinc-500 shrink-0">Editor Note:</span>
                              <span className="line-clamp-2">{cut.approval_notes || cut.description}</span>
                            </div>
                          )}

                          {/* Prominent Edited Video Watch Button / Review Bar */}
                          {(cut.final_video_link || cut.preview_link) && (
                            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-2 flex-wrap">
                              <a
                                href={cut.final_video_link || cut.preview_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-white text-black hover:bg-zinc-200 transition-all shadow-md active:scale-95 shrink-0"
                                title="Open Google Drive / video review link"
                              >
                                <PlaySquare className="w-3.5 h-3.5 fill-black text-white" />
                                <span>View Edited Video ↗</span>
                              </a>

                              {/* Founder / SMM Quick Review Actions */}
                              {cut.editing_status !== 'approved' && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateStatus(cut.id, 'approved', 100)}
                                    className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-white text-black hover:bg-zinc-200 transition flex items-center gap-1"
                                    title="Approve this cut"
                                  >
                                    <CheckCircle2 className="w-3 h-3 text-black" />
                                    <span>Approve Video</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRequestRevision(cut.id)}
                                    className="px-2 py-1 rounded-lg text-[10px] font-bold bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 transition"
                                    title="Request changes"
                                  >
                                    Revision
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Bottom Row: Status and actions */}
                          <div className="flex items-center justify-between pt-1 border-t border-zinc-900 text-[11px] gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="text-zinc-500 uppercase tracking-tight text-[10px] font-semibold">
                                STATUS: {cut.editing_status.toUpperCase().replace(/_/g, ' ')}
                              </span>
                              {cut.deadline && (
                                <span className="text-[10px] text-zinc-500">
                                  &bull; Due: {cut.deadline}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <select
                                value={cut.assigned_editor_id || ''}
                                onChange={(e) => handleAssignEditor(cut.id, e.target.value)}
                                className="text-[10px] font-bold rounded px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-300 focus:outline-none"
                              >
                                <option value="">{cut.assigned_editor_id ? 'Change' : '+ Assign'}</option>
                                {editors.map((ed) => (
                                  <option key={ed.id} value={ed.id}>{ed.full_name}</option>
                                ))}
                              </select>

                              {!cut.final_video_link && !cut.preview_link && (
                                <span className="text-[10px] text-zinc-500 italic">
                                  Pending editor upload
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EDITOR-WISE DETAILED OVERVIEW MODAL */}
      {showEditorModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setShowEditorModal(false)}
        >
          <div 
            className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-black/40 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <span>Editor-Wise Workload &amp; Output</span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Videos edited today vs pending works for each video editor.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowEditorModal(false)}
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Metrics & Filter Tabs */}
            <div className="px-5 py-3 border-b border-zinc-800/80 bg-zinc-950/60 flex items-center justify-between gap-2 flex-wrap shrink-0">
              <div className="flex items-center gap-1.5 p-1 bg-black border border-zinc-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setEditorModalTab('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    editorModalTab === 'all'
                      ? 'bg-white text-black shadow-sm font-black'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  All Statuses
                </button>
                <button
                  type="button"
                  onClick={() => setEditorModalTab('today')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    editorModalTab === 'today'
                      ? 'bg-white text-black shadow-sm font-black'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Edited Today ({todayEditedVideos.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditorModalTab('pending')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    editorModalTab === 'pending'
                      ? 'bg-white text-black shadow-sm font-black'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Pending Works ({pendingDeliverables.length})</span>
                </button>
              </div>

              <div className="text-[11px] text-zinc-400">
                <span className="font-bold text-white">{editors.length}</span> Registered {editors.length === 1 ? 'Editor' : 'Editors'}
              </div>
            </div>

            {/* Editor Cards List */}
            <div className="p-5 overflow-y-auto space-y-4">
              {editors.length === 0 ? (
                <div className="text-center py-10 text-zinc-500 text-xs">
                  No video editors registered in the system yet.
                </div>
              ) : editorBreakdowns.filter(item => 
                  editorModalTab === 'all' ||
                  (editorModalTab === 'today' && item.todayVideos.length > 0) ||
                  (editorModalTab === 'pending' && item.pendingVideos.length > 0)
                ).length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
                  {editorModalTab === 'today' ? (
                    <>
                      <CheckCircle2 className="w-8 h-8 text-zinc-500 mx-auto mb-1" />
                      <h4 className="text-sm font-bold text-white">No videos completed or edited today yet</h4>
                      <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                        When editors submit Google Drive video links or update task progress in Editor Workspace, their edited cuts will appear grouped by editor here.
                      </p>
                    </>
                  ) : (
                    <>
                      <Clock className="w-8 h-8 text-zinc-500 mx-auto mb-1" />
                      <h4 className="text-sm font-bold text-white">No pending tasks currently in pipeline</h4>
                      <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                        All assigned editor tasks have been completed or no pending deliverables are assigned.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                editorBreakdowns.map((item) => {
                  const showThisEditor =
                    editorModalTab === 'all' ||
                    (editorModalTab === 'today' && item.todayVideos.length > 0) ||
                    (editorModalTab === 'pending' && item.pendingVideos.length > 0);

                  if (!showThisEditor) return null;

                  return (
                    <div 
                      key={item.editorId}
                      className="bg-black/60 border border-zinc-800 rounded-2xl p-4 space-y-3 hover:border-zinc-700 transition"
                    >
                      {/* Editor Header */}
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 text-white font-black text-sm flex items-center justify-center">
                            {item.editorName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-black text-white flex items-center gap-2">
                              <span>{item.editorName}</span>
                              <span className="text-[10px] font-bold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-700">
                                🎬 Video Editor
                              </span>
                            </div>
                            <div className="text-[10px] text-zinc-500">
                              {item.assignedTotal} total assigned &bull; {item.avgProgress}% overall progress
                            </div>
                          </div>
                        </div>

                        {/* Badges */}
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-zinc-800 text-white border border-zinc-700">
                            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                            <span>{item.todayVideos.length} Edited Today</span>
                          </span>
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-zinc-900 text-zinc-300 border border-zinc-800">
                            <Clock className="w-3.5 h-3.5 text-zinc-400" />
                            <span>{item.pendingVideos.length} Pending</span>
                          </span>
                        </div>
                      </div>

                      {/* Content Sections */}
                      {(editorModalTab === 'all' || editorModalTab === 'today') && item.todayVideos.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-zinc-900">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-white" /> Videos Completed Today ({item.todayVideos.length})
                          </div>
                          <div className="space-y-1">
                            {item.todayVideos.map(vid => (
                              <div key={vid.id} className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between text-xs">
                                <div className="space-y-0.5 min-w-0 pr-2">
                                  <div className="font-bold text-white truncate flex items-center gap-2">
                                    <span>{vid.title}</span>
                                    <span className="text-[9px] font-semibold text-zinc-400 bg-black px-1.5 py-0.5 rounded border border-zinc-800 shrink-0">
                                      {vid.deliverable_type === 'full_length_video' ? 'Full 16:9' : 'Reel 9:16'}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-zinc-500 truncate">
                                    Shoot: {vid.recording_title || 'Podcast'}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[10px] font-black text-white bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-700">
                                    100% Done
                                  </span>
                                  {(vid.final_video_link || vid.preview_link) && (
                                    <a
                                      href={vid.final_video_link || vid.preview_link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-1 rounded bg-black hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition"
                                      title="Open Drive/Video Link"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {(editorModalTab === 'all' || editorModalTab === 'pending') && item.pendingVideos.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-zinc-900">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-zinc-400" /> Pending Works ({item.pendingVideos.length})
                          </div>
                          <div className="space-y-1">
                            {item.pendingVideos.map(vid => (
                              <div key={vid.id} className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between text-xs">
                                <div className="space-y-0.5 min-w-0 pr-2">
                                  <div className="font-bold text-white truncate flex items-center gap-2">
                                    <span>{vid.title}</span>
                                    <span className="text-[9px] font-semibold text-zinc-400 bg-black px-1.5 py-0.5 rounded border border-zinc-800 shrink-0">
                                      {vid.deliverable_type === 'full_length_video' ? 'Full 16:9' : 'Reel 9:16'}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-zinc-500 truncate flex items-center gap-2">
                                    <span>Shoot: {vid.recording_title || 'Podcast'}</span>
                                    {vid.deadline && (
                                      <span>&bull; Deadline: {vid.deadline}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <div className="text-right">
                                    <span className="text-[10px] font-bold text-zinc-300 block">
                                      {vid.progress_percentage || 0}% Done
                                    </span>
                                    <span className="text-[9px] text-zinc-500 uppercase font-semibold">
                                      {vid.editing_status.replace(/_/g, ' ')}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Empty state for this editor */}
                      {item.todayVideos.length === 0 && item.pendingVideos.length === 0 && (
                        <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-900 text-[11px] text-zinc-500 text-center">
                          ✨ All caught up — No active tasks currently assigned.
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* UNASSIGNED QUEUE (IF ANY DELIVERABLES ARE UNASSIGNED) */}
              {unassignedDeliverables.length > 0 && (
                <div className="bg-black/80 border border-zinc-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-zinc-200">
                        ⚠️ Unassigned Tasks Queue
                      </span>
                      <span className="text-[10px] font-bold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-700">
                        {unassignedDeliverables.length} Tasks
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-500">
                      Needs editor assignment
                    </span>
                  </div>
                  <div className="space-y-1">
                    {unassignedDeliverables.map(vid => (
                      <div key={vid.id} className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between text-xs">
                        <div className="space-y-0.5 min-w-0 pr-2">
                          <div className="font-bold text-white truncate">
                            {vid.title}
                          </div>
                          <div className="text-[10px] text-zinc-500 truncate">
                            Shoot: {vid.recording_title || 'Podcast'} &bull; {vid.deliverable_type === 'full_length_video' ? 'Full 16:9' : 'Reel 9:16'}
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-700 shrink-0">
                          Unassigned
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-zinc-800 bg-black/60 flex items-center justify-between gap-3 text-xs text-zinc-400 flex-wrap">
              <span>
                Total: <strong className="text-white">{todayEditedVideos.length}</strong> edited today &bull; <strong className="text-white">{pendingDeliverables.length}</strong> pending works
              </span>
              <div className="flex items-center gap-2">
                {onNavigateTab && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditorModal(false);
                      onNavigateTab('team');
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold transition border border-zinc-700 text-xs flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Invite New Editor</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowEditorModal(false)}
                  className="px-4 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-black font-bold transition shadow-sm text-xs"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
