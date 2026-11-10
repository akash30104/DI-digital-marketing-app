const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://jjscejejzzspgnxyrsin.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impqc2NlamVqenpzcGdueHlyc2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzU2NjYsImV4cCI6MjEwNjQxMTY2Nn0.6lcNkVZrDBRLXF_laYFVJLStVLkP68r7tK9PPETOEsM'
);

async function findPubCols() {
  const candidates = [
    'id', 'deliverable_id', 'recording_id', 'platform', 'publication_status', 
    'published_by', 'published_at', 'post_url', 'channel_name', 'notes', 
    'reporting_date', 'created_at', 'screenshot_url', 'proof_url', 'client_id'
  ];
  for (const c of candidates) {
    const { error } = await s.from('publishing_logs').select(c).limit(1);
    if (!error) {
      console.log('publishing_logs HAS column:', c);
    }
  }
}

findPubCols().catch(console.error);
