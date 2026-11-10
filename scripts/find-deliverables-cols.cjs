const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://jjscejejzzspgnxyrsin.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impqc2NlamVqenpzcGdueHlyc2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzU2NjYsImV4cCI6MjEwNjQxMTY2Nn0.6lcNkVZrDBRLXF_laYFVJLStVLkP68r7tK9PPETOEsM'
);

async function findDeliverableCols() {
  const candidates = [
    'id', 'recording_id', 'title', 'deliverable_type', 'assigned_editor_id', 
    'editing_status', 'progress_percentage', 'priority', 'deadline', 
    'preview_link', 'final_video_link', 'thumbnail_url', 'caption', 
    'description', 'hashtags', 'approved_by', 'approved_at', 'approval_notes', 
    'created_at', 'updated_at', 'project_id', 'client_id', 'aspect_ratio', 
    'instructions', 'source_footage_url', 'reference_video_url', 'version_history'
  ];
  for (const c of candidates) {
    const { error } = await s.from('deliverables').select(c).limit(1);
    if (!error) {
      console.log('deliverables HAS column:', c);
    }
  }
}

findDeliverableCols().catch(console.error);
