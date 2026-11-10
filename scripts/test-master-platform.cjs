const { createClient } = require('@supabase/supabase-js');

// Load environment from .env or vite config
const SUPABASE_URL = 'https://jjscejejzzspgnxyrsin.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impqc2NlamVqenpzcGdueHlyc2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzU2NjYsImV4cCI6MjEwNjQxMTY2Nn0.6lcNkVZrDBRLXF_laYFVJLStVLkP68r7tK9PPETOEsM';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

async function runEndToEndScenario() {
  console.log('================================================================');
  console.log('DIGITAL INERTIA MASTER PLATFORM - END-TO-END VALIDATION SUITE');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${message}`);
    }
  }

  try {
    // 1. Connection check
    console.log('--> Test 1: Supabase Connectivity');
    const { data: profiles, error: profErr } = await supabase.from('profiles').select('id, email, role').limit(5);
    assert(!profErr, 'Profiles accessible from Supabase');
    console.log(`   Found ${profiles ? profiles.length : 0} profiles in database.`);

    // 2. Deliverables and recordings check
    console.log('\n--> Test 2: Deliverables & Production Pipeline Check');
    const { data: deliverables, error: delivErr } = await supabase.from('deliverables').select('*').limit(10);
    assert(!delivErr, 'Deliverables accessible');
    console.log(`   Found ${deliverables ? deliverables.length : 0} deliverables in database.`);

    // 3. Publishing Logs Check
    console.log('\n--> Test 3: Publishing Proofs & Logs Check');
    const { data: logs, error: logErr } = await supabase.from('publishing_logs').select('*').limit(5);
    assert(!logErr, 'Publishing logs accessible');
    console.log(`   Found ${logs ? logs.length : 0} published logs in database.`);

    // 4. Notifications Check
    console.log('\n--> Test 4: Real-time In-App Notifications Check');
    const { data: notifs, error: notifErr } = await supabase.from('notifications').select('*').limit(5);
    assert(!notifErr, 'Notifications accessible');
    console.log(`   Found ${notifs ? notifs.length : 0} notifications.`);

    // 5. Build Artifacts Check
    console.log('\n--> Test 5: Production Build Output Verification');
    const fs = require('fs');
    const path = require('path');
    const distPath = path.resolve(__dirname, '..', 'dist');
    const indexHtml = path.join(distPath, 'index.html');
    const hasDist = fs.existsSync(distPath);
    const hasHtml = fs.existsSync(indexHtml);
    assert(hasDist && hasHtml, 'Production dist/ bundle exists and index.html is present');

    const htmlContent = fs.readFileSync(indexHtml, 'utf8');
    assert(htmlContent.includes('Digital Inertia'), 'Branding title "Digital Inertia" present in index.html');

    // 6. Summary
    console.log('\n================================================================');
    console.log(`RESULTS: ${passedTests} / ${totalTests} test suites passed cleanly.`);
    console.log('================================================================');
  } catch (err) {
    console.error('Fatal error during scenario test:', err);
  }
}

runEndToEndScenario();
