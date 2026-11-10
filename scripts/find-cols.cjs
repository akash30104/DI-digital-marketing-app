const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://jjscejejzzspgnxyrsin.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impqc2NlamVqenpzcGdueHlyc2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzU2NjYsImV4cCI6MjEwNjQxMTY2Nn0.6lcNkVZrDBRLXF_laYFVJLStVLkP68r7tK9PPETOEsM'
);

async function findCols() {
  const candidates = ['title', 'content', 'body', 'text', 'type', 'link', 'url', 'created_at', 'read', 'is_read', 'status', 'user_id', 'recipient_id', 'profile_id'];
  for (const c of candidates) {
    const { error } = await s.from('notifications').select(c).limit(1);
    if (!error) {
      console.log('notifications HAS column:', c);
    }
  }
}

findCols().catch(console.error);
