const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://jjscejejzzspgnxyrsin.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impqc2NlamVqenpzcGdueHlyc2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzU2NjYsImV4cCI6MjEwNjQxMTY2Nn0.6lcNkVZrDBRLXF_laYFVJLStVLkP68r7tK9PPETOEsM'
);

async function testNotif() {
  const testObj = {
    id: '00000000-0000-0000-0000-000000000001',
    user_id: '00000000-0000-0000-0000-000000000000',
    title: 'Test',
    message: 'Test message',
    is_read: false
  };
  const { error } = await s.from('notifications').insert([testObj]);
  console.log('notifications insert result:', error ? error.message : 'SUCCESS');
}

testNotif().catch(console.error);
