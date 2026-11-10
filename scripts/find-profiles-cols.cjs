const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://jjscejejzzspgnxyrsin.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impqc2NlamVqenpzcGdueHlyc2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzU2NjYsImV4cCI6MjEwNjQxMTY2Nn0.6lcNkVZrDBRLXF_laYFVJLStVLkP68r7tK9PPETOEsM'
);

async function findProfilesCols() {
  const candidates = [
    'id', 'email', 'full_name', 'role', 'avatar_url', 'created_at', 'updated_at', 
    'is_suspended', 'status', 'organization_id', 'invited_by'
  ];
  for (const c of candidates) {
    const { error } = await s.from('profiles').select(c).limit(1);
    if (!error) {
      console.log('profiles HAS column:', c);
    }
  }
}

findProfilesCols().catch(console.error);
