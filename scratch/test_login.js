const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://lgnhcfppovtwxtmjyfty.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnbmhjZnBwb3Z0d3h0bWp5ZnR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MTUyOTEsImV4cCI6MjA4ODM5MTI5MX0.B7S4HTymOOcoXjhtC9JontWs3jrAQ_LmXtENpUNK49w";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const accounts = [
    { email: 'admin@shipmate.com', role: 'admin' },
    { email: 'customer@shipmate.com', role: 'customer' },
    { email: 'driver@shipmate.com', role: 'driver' }
];

async function test() {
    for (const acc of accounts) {
        console.log(`🔑 Attempting to sign in as ${acc.email}...`);
        const { data, error } = await supabase.auth.signInWithPassword({
            email: acc.email,
            password: 'Password123!'
        });
        if (error) {
            console.error(`❌ Sign in failed for ${acc.email}:`, error.message);
        } else {
            console.log(`✅ Sign in successful for ${acc.email}!`);
            console.log("Email confirmed:", !!data.user.email_confirmed_at);
            
            // Check driver onboarding status if it is a driver
            if (acc.role === 'driver') {
                const { data: driverProf, error: driverErr } = await supabase
                    .from('drivers')
                    .select('*')
                    .eq('id', data.user.id)
                    .single();
                if (driverErr) {
                    console.error("❌ Driver profile error:", driverErr.message);
                } else {
                    console.log("📋 Driver details:", driverProf);
                }
            }
        }
        console.log("--------------------------------------------------");
    }
}

test();
