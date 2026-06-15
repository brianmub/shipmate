const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://lgnhcfppovtwxtmjyfty.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnbmhjZnBwb3Z0d3h0bWp5ZnR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MTUyOTEsImV4cCI6MjA4ODM5MTI5MX0.B7S4HTymOOcoXjhtC9JontWs3jrAQ_LmXtENpUNK49w";

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: false
    }
});

async function createAccount(email, password, role, fullName) {
    console.log(`Signing up ${email} as ${role}...`);
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                role: role,
                full_name: fullName
            }
        }
    });

    if (error) {
        if (error.message.includes("already registered")) {
            console.log(`${email} is already signed up!`);
            return;
        }
        throw error;
    }
    console.log(`Successfully signed up ${email}. User ID:`, data.user.id);
    return data.user.id;
}

async function configureDriver(email, password) {
    console.log(`Signing in as driver (${email}) to update profile...`);
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (authError) {
        throw authError;
    }

    const userId = authData.user.id;
    console.log(`Signed in successfully. User ID: ${userId}. Updating profile status...`);

    // Update the driver's own profile to approved/verified
    const { error: updateError } = await supabase
        .from('drivers')
        .update({
            verification_status: 'approved',
            is_identity_verified: true,
            is_online: true,
            national_id_number: '1234567890',
            license_number: 'DRV-12345',
            emergency_contact_name: 'Platform Test Support',
            emergency_contact_phone: '+263770000000'
        })
        .eq('id', userId);

    if (updateError) {
        throw updateError;
    }

    console.log(`Successfully updated driver ${email} profile to approved and online.`);
}

async function run() {
    try {
        // 1. Create Customer Account
        await createAccount('customer.test@shipmate.co.zw', 'TestPass123!', 'customer', 'Test Customer');

        // 2. Create Driver Account
        await createAccount('driver.test@shipmate.co.zw', 'TestPass123!', 'driver', 'Test Driver');

        // 3. Configure Driver Status
        await configureDriver('driver.test@shipmate.co.zw', 'TestPass123!');

        console.log("All test accounts have been created and configured successfully!");
    } catch (err) {
        console.error("Execution failed:", err);
    }
}

run();
