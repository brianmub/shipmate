const supabaseUrl = "https://lgnhcfppovtwxtmjyfty.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnbmhjZnBwb3Z0d3h0bWp5ZnR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MTUyOTEsImV4cCI6MjA4ODM5MTI5MX0.B7S4HTymOOcoXjhtC9JontWs3jrAQ_LmXtENpUNK49w";

async function fetchUsers() {
    try {
        const url = `${supabaseUrl}/rest/v1/users?select=id,email,full_name,role`;
        const res = await fetch(url, {
            headers: {
                "apikey": supabaseAnonKey,
                "Authorization": `Bearer ${supabaseAnonKey}`
            }
        });
        if (res.ok) {
            const users = await res.json();
            console.log("Existing Users in DB:");
            console.log(JSON.stringify(users, null, 2));
        } else {
            console.log(`Failed to fetch users: ${res.status} ${await res.text()}`);
        }
    } catch (err) {
        console.error("Error connecting:", err);
    }
}

fetchUsers();
