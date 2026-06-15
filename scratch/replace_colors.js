const fs = require('fs');
const path = require('path');

const replacements = [
    // 1. active marker outer layout background color (rgb: 176, 106, 40)
    {
        pattern: /rgba\(52,\s*168,\s*83,\s*0\.[23]\)/g,
        replacement: 'rgba(176, 106, 40, 0.3)'
    },
    // 2. OrderHistoryScreen specific statuses
    {
        pattern: /backgroundColor:\s*item\.status\s*===\s*'pending'\s*\?\s*'#F59E0B'\s*:\s*'#34A853'/g,
        replacement: "backgroundColor: item.status === 'pending' ? '#F59E0B' : (item.status === 'completed' || item.status === 'delivered') ? '#22C55E' : '#055FEE'"
    },
    {
        pattern: /status_completed:\s*\{\s*backgroundColor:\s*'rgba\(16,\s*185,\s*129,\s*0\.15\)'\s*\}/g,
        replacement: "status_completed: { backgroundColor: 'rgba(34, 197, 94, 0.15)' }"
    },
    {
        pattern: /statusText_completed:\s*\{\s*color:\s*'#059669'\s*\}/g,
        replacement: "statusText_completed: { color: '#22C55E' }"
    },
    // 3. CustomerTrackingScreen statusText dynamic coloring
    {
        pattern: /statusText:\s*\{\s*fontSize:\s*14,\s*color:\s*'#34A853',\s*fontWeight:\s*'600'\s*\}/g,
        replacement: "statusText: { fontSize: 14, fontWeight: '600' }"
    },
    {
        pattern: /<Text\s+style=\{styles\.statusText\}>/g,
        replacement: "<Text style={[styles.statusText, { color: (order.status === 'completed' || order.status === 'delivered') ? '#22C55E' : '#055FEE' }]}>"
    },
    // 4. Success checkmarks / checkmark-circle indicators (e.g. DocumentUploadScreen) -> #22C55E
    {
        pattern: /name="checkmark-circle"\s+size=\{32\}\s+color="#34A853"/g,
        replacement: 'name="checkmark-circle" size={32} color="#22C55E"'
    },
    {
        pattern: /name="checkmark-circle"\s+size=\{32\}\s+color="#34a853"/g,
        replacement: 'name="checkmark-circle" size={32} color="#22C55E"'
    },
    {
        pattern: /name="checkmark-circle"\s+size=\{24\}\s+color="#34A853"/g,
        replacement: 'name="checkmark-circle" size={24} color="#22C55E"'
    },
    {
        pattern: /name="checkmark-circle"\s+size=\{24\}\s+color="#34a853"/g,
        replacement: 'name="checkmark-circle" size={24} color="#22C55E"'
    },
    {
        pattern: /name="checkmark-circle"\s+color="#34A853"/g,
        replacement: 'name="checkmark-circle" color="#22C55E"'
    },
    {
        pattern: /name="checkmark-circle"\s+color="#34a853"/g,
        replacement: 'name="checkmark-circle" color="#22C55E"'
    },
    // Earnings transaction arrows and texts
    {
        pattern: /name=\{tx\.type\s*===\s*'payout'\s*\?\s*"arrow-up"\s*:\s*"arrow-down"\}\s*\n?\s*size=\{18\}\s*\n?\s*color=\{tx\.type\s*===\s*'payout'\s*\?\s*"#EF4444"\s*:\s*"#34A853"\}/g,
        replacement: 'name={tx.type === \'payout\' ? "arrow-up" : "arrow-down"}\n                                                size={18}\n                                                color={tx.type === \'payout\' ? "#EF4444" : "#22C55E"}'
    },
    {
        pattern: /color:\s*tx\.type\s*===\s*'payout'\s*\?\s*"#EF4444"\s*:\s*"#34A853"/g,
        replacement: 'color: tx.type === \'payout\' ? "#EF4444" : "#22C55E"'
    },
    {
        pattern: /backgroundColor:\s*tx\.type\s*===\s*'payout'\s*\?\s*'rgba\(239,\s*68,\s*68,\s*0\.1\)'\s*:\s*'rgba\(52,\s*168,\s*83,\s*0\.1\)'/g,
        replacement: "backgroundColor: tx.type === 'payout' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)'"
    },
    // 5. Replace other #34A853 to #055FEE
    {
        pattern: /#34A853/gi,
        replacement: '#055FEE'
    },
    // 6. Replace other #2E9348 to #5B99F2
    {
        pattern: /#2E9348/gi,
        replacement: '#5B99F2'
    },
    // 7. General rgba(52, 168, 83) to rgba(5, 95, 238)
    {
        pattern: /rgba\(52,\s*168,\s*83,/gi,
        replacement: 'rgba(5, 95, 238,'
    },
    {
        pattern: /rgba\(52,168,83,/gi,
        replacement: 'rgba(5,95,238,'
    }
];

function processFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    let modified = content;
    for (const r of replacements) {
        modified = modified.replace(r.pattern, r.replacement);
    }
    if (modified !== content) {
        fs.writeFileSync(filePath, modified, 'utf8');
        console.log(`Updated: ${filePath}`);
    }
}

function traverse(dir) {
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.git' && file !== '.expo' && file !== 'dist') {
                traverse(fullPath);
            }
        } else {
            if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.jsx')) {
                processFile(fullPath);
            }
        }
    }
}

const targetDirs = [
    path.join(__dirname, '..', 'src'),
    path.join(__dirname, '..', 'mobile', 'src')
];

for (const dir of targetDirs) {
    if (fs.existsSync(dir)) {
        console.log(`Processing directory: ${dir}`);
        traverse(dir);
    } else {
        console.log(`Directory not found: ${dir}`);
    }
}

console.log('Branding replacement done.');
