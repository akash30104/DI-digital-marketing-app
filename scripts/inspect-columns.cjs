const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://jjscejejzzspgnxyrsin.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impqc2NlamVqenpzcGdueHlyc2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzU2NjYsImV4cCI6MjEwNjQxMTY2Nn0.6lcNkVZrDBRLXF_laYFVJLStVLkP68r7tK9PPETOEsM'
);

async function inspectCols() {
  const { data, error } = await s.from('notifications').select('*').limit(1);
  console.log('notifications select:', { data, error });
  
  const { data: dData, error: dErr } = await s.from('deliverables').select('*').limit(1);
  console.log('deliverables select:', { dData, error: dErr });

  const { data: rData, error: rErr } = await s.from('recordings').select('*').limit(1);
  console.log('recordings select:', { rData, error: rErr });

  const { data: pData, error: pErr } = await s.from('publishing_logs').select('*').limit(1);
  console.log('publishing_logs select:', { pData, error: pErr });
}

inspectCols().catch(console.error);
