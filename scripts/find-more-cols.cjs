const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://jjscejejzzspgnxyrsin.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impqc2NlamVqenpzcGdueHlyc2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzU2NjYsImV4cCI6MjEwNjQxMTY2Nn0.6lcNkVZrDBRLXF_laYFVJLStVLkP68r7tK9PPETOEsM'
);

async function findMoreCols() {
  const candidates = ['id', 'link', 'type', 'metadata', 'data', 'action_url'];
  for (const c of candidates) {
    const { error } = await s.from('notifications').select(c).limit(1);
    if (!error) {
      console.log('notifications HAS column:', c);
    }
  }
}

findMoreCols().catch(console.error);
