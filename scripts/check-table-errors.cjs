const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://jjscejejzzspgnxyrsin.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impqc2NlamVqenpzcGdueHlyc2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzU2NjYsImV4cCI6MjEwNjQxMTY2Nn0.6lcNkVZrDBRLXF_laYFVJLStVLkP68r7tK9PPETOEsM'
);

async function inspectErrors() {
  const tables = ['clients', 'projects', 'social_channels', 'invitations', 'video_versions', 'approval_feedback', 'publishing_proofs', 'audit_logs'];
  for (const t of tables) {
    const res = await s.from(t).select('*').limit(1);
    console.log(`Table ${t}:`, res.error ? res.error.message : 'OK');
  }
}

inspectErrors().catch(console.error);
