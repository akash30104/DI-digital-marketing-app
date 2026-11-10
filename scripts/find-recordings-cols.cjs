const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://jjscejejzzspgnxyrsin.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impqc2NlamVqenpzcGdueHlyc2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzU2NjYsImV4cCI6MjEwNjQxMTY2Nn0.6lcNkVZrDBRLXF_laYFVJLStVLkP68r7tK9PPETOEsM'
);

async function findRecordingCols() {
  const candidates = [
    'id', 'title', 'episode_number', 'recording_date', 'date_received', 
    'hard_disk_name', 'hard_disk_id', 'folder_path', 'source_footage_reference', 
    'notes', 'registered_by', 'created_at', 'updated_at', 'client_id', 'project_id'
  ];
  for (const c of candidates) {
    const { error } = await s.from('recordings').select(c).limit(1);
    if (!error) {
      console.log('recordings HAS column:', c);
    }
  }
}

findRecordingCols().catch(console.error);
