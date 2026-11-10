const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://jjscejejzzspgnxyrsin.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impqc2NlamVqenpzcGdueHlyc2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzU2NjYsImV4cCI6MjEwNjQxMTY2Nn0.6lcNkVZrDBRLXF_laYFVJLStVLkP68r7tK9PPETOEsM'
);

async function testRpc() {
  const rpcs = ['exec_sql', 'run_sql', 'execute', 'sql'];
  for (const r of rpcs) {
    const res = await s.rpc(r, { query: 'SELECT 1;' });
    console.log(`RPC ${r}:`, res.error ? res.error.message : 'SUCCESS');
  }
}

testRpc().catch(console.error);
