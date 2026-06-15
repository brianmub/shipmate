const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://lgnhcfppovtwxtmjyfty.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnbmhjZnBwb3Z0d3h0bWp5ZnR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MTUyOTEsImV4cCI6MjA4ODM5MTI5MX0.B7S4HTymOOcoXjhtC9JontWs3jrAQ_LmXtENpUNK49w";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const testUsers = [
    {
        email: 'admin@shipmate.com',
        password: 'Password123!',
        fullName: 'System Admin',
        role: 'admin'
    },
    {
        email: 'customer@shipmate.com',
        password: 'Password123!',
        fullName: 'John Customer',
        role: 'customer'
    },
    {
        email: 'driver@shipmate.com',
        password: 'Password123!',
        fullName: 'Dave Driver',
        role: 'driver'
    }
];

async function createUsers() {
    console.log("🚀 Creating default test users in Supabase...");
    
    for (const u of testUsers) {
        try {
            const { data, error } = await supabase.auth.signUp({
                email: u.email,
                password: u.password,
                options: {
                    data: {
                        full_name: u.fullName,
                        role: u.role
                    }
                }
            });

            if (error) {
                if (error.message.includes('already registered') || error.message.includes('already exists')) {
                    console.log(`ℹ️  User ${u.email} is already registered.`);
                } else {
                    console.error(`❌ Error creating ${u.email}:`, error.message);
                }
            } else {
                console.log(`✅ User ${u.email} registered successfully! Role: ${u.role}`);
            }
        } catch (err) {
            console.error(`❌ Unexpected error for ${u.email}:`, err);
        }
    }
    
    console.log("✨ Default test users setup finished.");
}

createUsers();
