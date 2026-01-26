// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULE VERIFIER v1.0
// Patikrina visus modulius dėl trūkstamų eksportų
// ════════════════════════════════════════════════════════════════

// js/verifier-run.js
import { verifyModules } from './verifier.js';

verifyModules().then(results => {
    console.log('Verification complete:', results);
});

const MODULE_TESTS = [
    {
        name: 'db.js',
        path: './js/db.js',
        imports: ['db', 'initSupabase', 'getCurrentUser', 'isAuthenticated']
    },
    {
        name: 'state.js',
        path: './js/state.js',
        imports: ['state', 'debugState']
    },
    {
        name: 'utils.js',
        path: './js/utils.js',
        imports: ['showToast', 'vibrate', 'formatCurrency', 'formatDate', 'formatTime', 'debounce', 'throttle']
    },
    {
        name: 'auth.js',
        path: './js/modules/auth.js',
        imports: ['login', 'logout', 'checkSession']
    },
    {
        name: 'ui.js',
        path: './js/modules/ui.js',
        imports: ['switchTab', 'cycleTheme', 'applyTheme', 'openModal', 'closeModals', 'updateShiftControlsUI']
    },
    {
        name: 'shifts.js',
        path: './js/modules/shifts.js',
        imports: ['initShiftsModals']
    },
    {
        name: 'settings.js',
        path: './js/modules/settings.js',
        imports: ['initSettingsModal', 'loadSettings', 'openSettings', 'saveSettings']
    },
    {
        name: 'garage.js',
        path: './js/modules/garage.js',
        imports: ['initGarageModals', 'loadFleet', 'openGarage', 'renderGarageList', 'saveVehicle', 'deleteVehicle', 'confirmDeleteVehicle', 'cancelDeleteVehicle', 'setVehType', 'toggleTestMode']
    },
    {
        name: 'finance.js',
        path: './js/modules/finance.js',
        imports: ['initFinanceModals', 'refreshAudit', 'openTxModal', 'setExpType', 'confirmTx']
    },
    {
        name: 'costs.js',
        path: './js/modules/costs.js',
        imports: ['calculateDailyCost', 'calculateWeeklyRentalProgress', 'calculateShiftEarnings', 'calculateRunway']
    }
];

async function verifyModules() {
    console.log('🔍 ROBERT OS - MODULE VERIFICATION');
    console.log('═══════════════════════════════════════');
    
    let totalModules = 0;
    let passedModules = 0;
    let failedModules = 0;
    
    for (const test of MODULE_TESTS) {
        totalModules++;
        console.log(`\n📦 Testing: ${test.name}`);
        
        try {
            // Importuojame modulį dinamiškai
            const module = await import(test.path);
            const moduleExports = Object.keys(module);
            
            // Tikriname trūkstamus eksportus
            const missingExports = test.imports.filter(imp => !moduleExports.includes(imp));
            const extraExports = moduleExports.filter(exp => !test.imports.includes(exp) && exp !== 'default');
            
            if (missingExports.length === 0) {
                console.log(`✅ PASS: All exports found (${moduleExports.length} total)`);
                
                if (extraExports.length > 0) {
                    console.log(`ℹ️  Extra exports: ${extraExports.join(', ')}`);
                }
                
                passedModules++;
            } else {
                console.log(`❌ FAIL: Missing exports: ${missingExports.join(', ')}`);
                console.log(`   Found: ${moduleExports.join(', ') || 'none'}`);
                
                if (extraExports.length > 0) {
                    console.log(`   Extra: ${extraExports.join(', ')}`);
                }
                
                failedModules++;
            }
            
        } catch (error) {
            console.log(`🚨 ERROR: ${error.message}`);
            failedModules++;
        }
    }
    
    // Rezultatų suvestinė
    console.log('\n═══════════════════════════════════════');
    console.log('📊 VERIFICATION SUMMARY:');
    console.log(`   Total Modules: ${totalModules}`);
    console.log(`   ✅ Passed: ${passedModules}`);
    console.log(`   ❌ Failed: ${failedModules}`);
    console.log(`   🚨 Errors: ${failedModules - (totalModules - passedModules)}`);
    
    if (failedModules === 0) {
        console.log('\n🎉 All modules are correctly exported!');
    } else {
        console.log('\n⚠️  Some modules need fixes. Check the list above.');
    }
    
    return { totalModules, passedModules, failedModules };
}

// ────────────────────────────────────────────────────────────────
// HTML INTERFACE (jei norite naudoti naršyklėje)
// ────────────────────────────────────────────────────────────────

function createHTMLInterface() {
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Robert OS - Module Verifier</title>
            <style>
                body { font-family: monospace; padding: 20px; background: #111; color: #fff; }
                .container { max-width: 800px; margin: 0 auto; }
                h1 { color: #0ea5e9; }
                .module { margin: 10px 0; padding: 10px; border-radius: 5px; }
                .pass { background: #10b98120; border-left: 4px solid #10b981; }
                .fail { background: #ef444420; border-left: 4px solid #ef4444; }
                .error { background: #f59e0b20; border-left: 4px solid #f59e0b; }
                button { background: #0ea5e9; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; }
                .summary { margin-top: 20px; padding: 15px; background: #1f2937; border-radius: 5px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🔍 Robert OS Module Verifier</h1>
                <button onclick="runVerification()">Run Verification</button>
                <div id="results"></div>
                <div id="summary" class="summary" style="display:none;"></div>
            </div>
            
            <script>
                async function runVerification() {
                    const resultsDiv = document.getElementById('results');
                    const summaryDiv = document.getElementById('summary');
                    
                    resultsDiv.innerHTML = '<p>Running tests...</p>';
                    summaryDiv.style.display = 'none';
                    
                    const tests = ${JSON.stringify(MODULE_TESTS)};
                    let passed = 0;
                    let failed = 0;
                    let html = '';
                    
                    for (const test of tests) {
                        try {
                            const module = await import(test.path);
                            const exports = Object.keys(module);
                            const missing = test.imports.filter(imp => !exports.includes(imp));
                            
                            if (missing.length === 0) {
                                html += \`
                                    <div class="module pass">
                                        <strong>✅ \${test.name}</strong><br>
                                        Exports: \${exports.length} found
                                    </div>
                                \`;
                                passed++;
                            } else {
                                html += \`
                                    <div class="module fail">
                                        <strong>❌ \${test.name}</strong><br>
                                        Missing: \${missing.join(', ')}<br>
                                        Found: \${exports.join(', ') || 'none'}
                                    </div>
                                \`;
                                failed++;
                            }
                        } catch (error) {
                            html += \`
                                <div class="module error">
                                    <strong>🚨 \${test.name}</strong><br>
                                    Error: \${error.message}
                                </div>
                            \`;
                            failed++;
                        }
                    }
                    
                    resultsDiv.innerHTML = html;
                    summaryDiv.innerHTML = \`
                        <h3>📊 Summary</h3>
                        <p>Total Modules: \${tests.length}</p>
                        <p>✅ Passed: \${passed}</p>
                        <p>❌ Failed: \${failed}</p>
                    \`;
                    summaryDiv.style.display = 'block';
                }
            </script>
        </body>
        </html>
    `;
    
    return html;
}

// ────────────────────────────────────────────────────────────────
// NAUDOJIMAS:
// ────────────────────────────────────────────────────────────────

// Variantas 1: Paleisti konsolėje
if (typeof window !== 'undefined') {
    window.verifyModules = verifyModules;
    console.log('Module verifier loaded. Run: verifyModules()');
}

// Variantas 2: Sukurti HTML failą
if (typeof window !== 'undefined' && window.location.pathname.includes('verifier.html')) {
    document.body.innerHTML = createHTMLInterface();
}

// Variantas 3: Paleisti automatiškai (išjungti komentarą)
// verifyModules().catch(console.error);
