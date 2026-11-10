const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://jjscejejzzspgnxyrsin.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impqc2NlamVqenpzcGdueHlyc2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzU2NjYsImV4cCI6MjEwNjQxMTY2Nn0.6lcNkVZrDBRLXF_laYFVJLStVLkP68r7tK9PPETOEsM'
);

async function check() {
  const rpc = await s.rpc('check_founder_exists');
  console.log('RPC check_founder_exists:', rpc);

  const tables = ['profiles', 'recordings', 'deliverables', 'publishing_logs', 'daily_targets', 'social_channels', 'clients', 'projects', 'invitations', 'notifications', 'audit_logs'];
  for (const table of tables) {
    const { count, error } = await s.from(table).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`Table "${table}": error ->`, error.message, `(code: ${error.code})`);
    } else {
      console.log(`Table "${table}": exists, count = ${count}`);
    }
  }
}

check().catch(console.error);
