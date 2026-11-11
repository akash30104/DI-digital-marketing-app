import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Client, Project, Profile, Priority, AspectRatio, DeliverableType } from '../types';
import { getClients, getProjects, getProfiles, createNotification, createAuditLog } from '../lib/api';
import { supabase } from '../lib/supabase';
import { filterClients, isClientDeleted } from '../lib/deletionFilter';
import { Plus, Film, Link as LinkIcon, Calendar, Clock, AlertTriangle, Sparkles, Check } from 'lucide-react';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated?: () => void;
  defaultClientId?: string;
  defaultProjectId?: string;
}

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  isOpen,
  onClose,
  onTaskCreated,
  defaultClientId,
  defaultProjectId,
}) => {
  const { currentUser } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [editors, setEditors] = useState<Profile[]>([]);

  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState(defaultClientId || '');
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [deliverableType, setDeliverableType] = useState<DeliverableType>('reel');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [outputFormat, setOutputFormat] = useState('MP4 (H.264)');
  const [expectedDuration, setExpectedDuration] = useState('30-60s');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [referenceVideoUrl, setReferenceVideoUrl] = useState('');
  const [sourceFootageUrl, setSourceFootageUrl] = useState('');
  const [assignedEditorId, setAssignedEditorId] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [deadline, setDeadline] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadDependencies();
    }
  }, [isOpen]);

  const loadDependencies = async () => {
    const [clientList, projectList, memberList] = await Promise.all([
      getClients(),
      getProjects(),
      getProfiles(),
    ]);
    const validClients = filterClients(clientList);
    setClients(validClients);
    setProjects(projectList);
    setEditors(memberList.filter((m: Profile) => m.role === 'editor' && !m.is_suspended));
    if (validClients.length > 0 && !clientId) {
      setClientId(validClients[0].id);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!title.trim()) {
      setErrorMessage('Task title is required.');
      return;
    }
    if (!sourceFootageUrl.trim()) {
      setErrorMessage('Source footage link (Drive/Dropbox/Raw) is required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const clientObj = clients.find(c => c.id === clientId);
    const clientName = clientObj?.brand_name || clientObj?.company_name || clientObj?.name || 'Studio Production';
    const clientTag = clientId ? `[Client: ${clientId}] [Brand: ${clientName}] ` : '';
    const todayStr = new Date().toISOString().split('T')[0];

    try {
      // 1. Create a Recording entry container
      const { data: recData, error: recError } = await supabase
        .from('recordings')
        .insert([
          {
            title: `${clientName} - ${title.trim()}`,
            recording_date: todayStr,
            date_received: todayStr,
            hard_disk_name: 'Cloud Drive Footage',
            folder_path: sourceFootageUrl.trim(),
            notes: `${clientTag}[Ref: ${referenceVideoUrl.trim()}] [Ratio: ${aspectRatio}] ${instructions.trim()}`,
            registered_by: currentUser.id,
          }
        ])
        .select()
        .single();

      if (recError || !recData) {
        throw new Error(recError?.message || 'Failed to create recording container');
      }

      // 2. Insert Deliverable
      const { data: delivData, error: delivError } = await supabase
        .from('deliverables')
        .insert([
          {
            recording_id: recData.id,
            title: title.trim(),
            deliverable_type: deliverableType,
            assigned_editor_id: assignedEditorId || null,
            editing_status: 'assigned',
            priority: priority,
            deadline: deadline || null,
            progress_percentage: 0,
            aspect_ratio: aspectRatio,
            output_format: outputFormat,
            instructions: instructions.trim(),
            reference_url: referenceVideoUrl.trim(),
            description: description.trim(),
            source_footage_url: sourceFootageUrl.trim(),
            project_id: projectId || null,
            client_id: clientId || null,
            client_name: clientName,
          }
        ])
        .select()
        .single();

      if (delivError) {
        console.warn('Deliverable insert fallback:', delivError);
      }

      // 3. Notify assigned editor if assigned
      if (assignedEditorId) {
        await createNotification(
          assignedEditorId,
          `New Editing Task: ${title.trim()}`,
          `You have been assigned to edit "${title.trim()}" for ${clientName}. Priority: ${priority.toUpperCase()}.`
        );
      }

      // 4. Audit Log
      await createAuditLog(
        'task_assigned',
        'deliverables',
        delivData?.id || recData.id,
        currentUser.id,
        currentUser.email,
        { title: title.trim(), client: clientName, editor_id: assignedEditorId, priority }
      );

      if (onTaskCreated) onTaskCreated();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create task.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto space-y-5 animate-in fade-in duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Film className="w-5 h-5 text-white" />
            <h2 className="text-base font-black text-white">Create Video Editing Task</h2>
          </div>
          <button
            onClick={onClose}
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

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1.5">
              Task Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Customer Testimonial Hook Cut #1"
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Client & Project Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                Client Brand *
              </label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500 font-semibold"
              >
                <option value="">Studio In-House Production</option>
                {clients.filter(c => !isClientDeleted(c)).map(c => (
                  <option key={c.id} value={c.id}>{c.brand_name || c.company_name || c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                Campaign Project
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500 font-semibold"
              >
                <option value="">General Deliverables</option>
                {projects.filter(p => !clientId || p.client_id === clientId).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Source Footage URL & Reference Video URL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                Source Footage URL (Drive / Cloud) *
              </label>
              <input
                type="url"
                required
                value={sourceFootageUrl}
                onChange={(e) => setSourceFootageUrl(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                Reference Video URL (Optional)
              </label>
              <input
                type="url"
                value={referenceVideoUrl}
                onChange={(e) => setReferenceVideoUrl(e.target.value)}
                placeholder="https://instagram.com/reel/... or YouTube"
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500 font-mono"
              />
            </div>
          </div>

          {/* Assigned Editor & Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                Assigned Video Editor
              </label>
              <select
                value={assignedEditorId}
                onChange={(e) => setAssignedEditorId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500 font-semibold"
              >
                <option value="">Leave Unassigned (Open Pool)</option>
                {editors.map(ed => (
                  <option key={ed.id} value={ed.id}>{ed.full_name || ed.email}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                Task Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500 font-semibold capitalize"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent 🔥</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                Task Deadline
              </label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          {/* Video Specs (Aspect ratio, Duration, Type) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                Format / Deliverable
              </label>
              <select
                value={deliverableType}
                onChange={(e) => setDeliverableType(e.target.value as DeliverableType)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500 font-semibold"
              >
                <option value="reel">Short Form / Reel / TikTok</option>
                <option value="full_length_video">Full Length Video</option>
                <option value="other">Promo / Ad / Teaser</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                Aspect Ratio
              </label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500 font-semibold"
              >
                <option value="9:16">9:16 (Vertical Reels / Shorts)</option>
                <option value="16:9">16:9 (Horizontal Full Video)</option>
                <option value="1:1">1:1 (Square Feed Post)</option>
                <option value="4:5">4:5 (Portrait Feed)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                Expected Duration
              </label>
              <input
                type="text"
                value={expectedDuration}
                onChange={(e) => setExpectedDuration(e.target.value)}
                placeholder="e.g. 45-60 seconds"
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          {/* Detailed Instructions */}
          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1.5">
              Editing Instructions &amp; Creative Brief
            </label>
            <textarea
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Specify jump cut pacing, dynamic captions font/color, B-roll insertions, hook phrasing, background music intensity, sound effects..."
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-xs font-black bg-white hover:bg-zinc-200 text-black shadow-lg transition active:scale-[0.99] disabled:opacity-50"
            >
              {isSubmitting ? 'Creating Task...' : 'Assign & Dispatch Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
