// ============================================
// WhatsApp Bio Checker Pro - Backend Integration
// ============================================

const API_URL = 'http://localhost:3000/api';

// State Management
let isLoggedIn = false;
let isConnected = false;
let isScanning = false;
let isConnecting = false;
let connectionCheckInterval = null;
let currentUsername = '';
let currentAuthMode = 'login'; // 'login' or 'register'
let scanInterval = null;
let currentNumbers = [];
let results = [];
let stats = {
    total: 0,
    registered: 0,
    bio: 0,
    business: 0,
    verified: 0,
    metaBusiness: 0,
    enterprise: 0,
    hasPhoto: 0,
    privacyHidden: 0
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

async function safeFetch(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }
        
        return { success: true, data };
    } catch (error) {
        console.error('Fetch error:', error);
        return { success: false, error: error.message };
    }
}

function showError(message) {
    const errorDiv = document.getElementById('authError');
    if (errorDiv) {
        errorDiv.innerText = message;
        errorDiv.classList.remove('hidden');
        setTimeout(() => errorDiv.classList.add('hidden'), 5000);
    }
}

// ============================================
// AUTH FUNCTIONS
// ============================================

function switchAuth(type) {
    currentAuthMode = type;
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const btnText = document.getElementById('authBtnText');
    
    if (type === 'login') {
        tabLogin.className = "flex-1 py-2 rounded-lg text-sm font-medium transition-all bg-brand-accent/10 text-brand-accent border border-brand-accent/20";
        tabRegister.className = "flex-1 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white transition-all";
        btnText.innerText = "Access Dashboard";
    } else {
        tabRegister.className = "flex-1 py-2 rounded-lg text-sm font-medium transition-all bg-brand-accent/10 text-brand-accent border border-brand-accent/20";
        tabLogin.className = "flex-1 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white transition-all";
        btnText.innerText = "Create Account";
    }
}

async function handleAuth() {
    const user = document.getElementById('authUser').value.trim();
    const pass = document.getElementById('authPass').value;
    const errorDiv = document.getElementById('authError');
    const btn = document.querySelector('button[type="submit"]');
    
    // Validation
    if (user.length < 3) {
        showError("Username must be at least 3 characters");
        return;
    }
    
    if (pass.length < 6) {
        showError("Password must be at least 6 characters");
        return;
    }
    
    // Show loading
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<div class="loader border-white/30 border-t-white w-5 h-5"></div>';
    btn.disabled = true;
    
    try {
        let result;
        
        if (currentAuthMode === 'register') {
            result = await safeFetch(`${API_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: user, password: pass })
            });
            
            if (result.success) {
                showError("✅ Registration successful! Please login.");
                errorDiv.classList.remove('bg-red-400/10', 'border-red-400/20', 'text-red-400');
                errorDiv.classList.add('bg-green-400/10', 'border-green-400/20', 'text-green-400');
                
                // Switch to login
                setTimeout(() => {
                    switchAuth('login');
                    document.getElementById('authPass').value = '';
                }, 2000);
                
                btn.innerHTML = originalContent;
                btn.disabled = false;
                return;
            }
        } else {
            result = await safeFetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: user, password: pass })
            });
        }
        
        if (result.success) {
            isLoggedIn = true;
            currentUsername = result.data.username;
            document.getElementById('displayUser').innerText = currentUsername;
            
            // Animation Transition
            gsap.to("#authView", {
                opacity: 0, 
                y: -20, 
                duration: 0.5, 
                onComplete: () => {
                    document.getElementById('authView').classList.add('hidden');
                    document.getElementById('dashboardView').classList.remove('hidden');
                    gsap.fromTo("#dashboardView", 
                        { opacity: 0, y: 20 }, 
                        { opacity: 1, y: 0, duration: 0.5 }
                    );
                    
                    // Check if already connected
                    checkInitialStatus();
                }
            });
        } else {
            showError(result.error || 'Authentication failed');
            btn.innerHTML = originalContent;
            btn.disabled = false;
        }
    } catch (error) {
        showError('Connection error: ' + error.message);
        btn.innerHTML = originalContent;
        btn.disabled = false;
    }
}

async function logout() {
    if (!confirm('Are you sure you want to logout?')) return;
    
    await safeFetch(`${API_URL}/logout`, { method: 'POST' });
    
    // Clear intervals
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
        connectionCheckInterval = null;
    }
    if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = null;
    }
    
    // Reset state
    isLoggedIn = false;
    isConnected = false;
    isScanning = false;
    currentUsername = '';
    
    location.reload();
}

// Check auth status on load
async function checkAuthStatus() {
    const result = await safeFetch(`${API_URL}/auth/status`);
    
    if (result.success && result.data.authenticated) {
        isLoggedIn = true;
        currentUsername = result.data.username;
        document.getElementById('displayUser').innerText = currentUsername;
        
        // Show dashboard
        document.getElementById('authView').classList.add('hidden');
        document.getElementById('dashboardView').classList.remove('hidden');
        
        // Check connection status
        checkInitialStatus();
    }
}

// ============================================
// CONNECTION FUNCTIONS
// ============================================

async function initiateConnection() {
    console.log('[DEBUG] initiateConnection called');
    
    if (isConnecting) {
        console.log('[DEBUG] Already connecting, skipping');
        return;
    }
    
    isConnecting = true;
    
    // UI Updates
    console.log('[DEBUG] Updating UI to show scan mode');
    document.getElementById('connectionIdle').classList.add('hidden');
    document.getElementById('connectionScan').classList.remove('hidden');
    
    // Start connection
    console.log('[DEBUG] Calling API /connect');
    const result = await safeFetch(`${API_URL}/connect`, {
        method: 'POST'
    });
    
    if (!result.success) {
        console.error('[DEBUG] Connection failed:', result.error);
        alert('Failed to start connection: ' + result.error);
        isConnecting = false;
        document.getElementById('connectionScan').classList.add('hidden');
        document.getElementById('connectionIdle').classList.remove('hidden');
        return;
    }
    
    console.log('[DEBUG] Connection started successfully');
    
    // Hide QR loading after 1s
    setTimeout(() => {
        console.log('[DEBUG] Hiding QR loading overlay');
        const qrLoading = document.getElementById('qrLoading');
        if (qrLoading) {
            qrLoading.style.display = 'none';
        }
    }, 1000);
    
    // Start checking for QR and connection
    if (!connectionCheckInterval) {
        console.log('[DEBUG] Starting connection check interval');
        connectionCheckInterval = setInterval(checkConnection, 2000);
    }
    checkConnection();
}

async function checkConnection() {
    if (!isConnecting && !isConnected) return;
    
    const result = await safeFetch(`${API_URL}/status`);
    
    if (!result.success) {
        console.error('Status check failed:', result.error);
        return;
    }
    
    isConnected = result.data.connected;
    
    if (isConnected) {
        // Show connected state
        document.getElementById('connectionScan').classList.add('hidden');
        document.getElementById('connectionActive').classList.remove('hidden');
        
        // Update device info if available
        if (result.data.device) {
            const device = result.data.device;
            console.log('[DEBUG] Device info:', device);
            
            // Update device name
            const deviceName = document.getElementById('deviceName');
            if (deviceName) {
                deviceName.textContent = device.model || 'Connected Device';
            }
            
            // Update device number
            const deviceNumber = document.getElementById('deviceNumber');
            if (deviceNumber && device.number) {
                deviceNumber.textContent = `+${device.number}`;
            }
            
            // Update platform
            const devicePlatform = document.getElementById('devicePlatform');
            if (devicePlatform && device.platform) {
                devicePlatform.textContent = device.platform;
            }
            
            // Update avatar
            const deviceAvatar = document.getElementById('deviceAvatar');
            if (deviceAvatar && device.model) {
                const initials = device.model.substring(0, 2).toUpperCase();
                deviceAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=25D366&color=fff`;
            }
        }
        
        // Entrance animation
        if (typeof gsap !== 'undefined') {
            gsap.from("#connectionActive > div", {x: -20, opacity: 0, duration: 0.4, stagger: 0.1});
        }
        
        isConnecting = false;
    } else if (isConnecting) {
        // Check for QR code
        checkQRCode();
    }
}

async function checkQRCode() {
    const result = await safeFetch(`${API_URL}/qr`);
    
    if (!result.success) return;
    
    const data = result.data;
    
    if (data.qr) {
        // Replace dummy QR with real QR
        const qrContainer = document.querySelector('#connectionScan .relative.w-48');
        if (qrContainer) {
            qrContainer.innerHTML = `
                <img src="${data.qr}" alt="QR Code" class="w-full h-full object-contain rounded-xl">
                <div class="scan-line"></div>
            `;
        }
    }
}

async function disconnect() {
    if (!confirm('Disconnect WhatsApp?')) return;
    
    await safeFetch(`${API_URL}/disconnect`, { method: 'POST' });
    
    isConnected = false;
    document.getElementById('connectionActive').classList.add('hidden');
    document.getElementById('connectionIdle').classList.remove('hidden');
}

async function checkInitialStatus() {
    const result = await safeFetch(`${API_URL}/status`);
    
    if (result.success && result.data.connected) {
        isConnected = true;
        document.getElementById('connectionIdle').classList.add('hidden');
        document.getElementById('connectionActive').classList.remove('hidden');
        
        if (!connectionCheckInterval) {
            connectionCheckInterval = setInterval(checkConnection, 3000);
        }
    }
}

// ============================================
// INPUT FUNCTIONS
// ============================================

const inputArea = document.getElementById('numberInput');
if (inputArea) {
    inputArea.addEventListener('input', (e) => {
        const lines = e.target.value.split('\n').filter(line => line.trim() !== '');
        document.getElementById('inputCount').innerText = `${lines.length} numbers`;
    });
}

function clearInput() {
    if (inputArea) {
        inputArea.value = '';
        document.getElementById('inputCount').innerText = `0 numbers`;
    }
}

// ============================================
// SCANNING FUNCTIONS
// ============================================

async function startScan() {
    if (!isConnected) {
        alert("Please connect your WhatsApp device first!");
        return;
    }
    
    const raw = inputArea.value;
    currentNumbers = raw.split('\n').filter(n => n.trim() !== '').map(n => n.trim());
    
    if (currentNumbers.length === 0) {
        alert("Please enter phone numbers to check.");
        return;
    }
    
    if (currentNumbers.length > 200) {
        if (!confirm(`You are about to check ${currentNumbers.length} numbers. This may take a while. Continue?`)) {
            return;
        }
    }
    
    // UI Updates
    isScanning = true;
    document.getElementById('btnStart').disabled = true;
    document.getElementById('btnStart').classList.add('opacity-50', 'cursor-not-allowed');
    document.getElementById('btnStop').disabled = false;
    document.getElementById('btnStop').classList.remove('bg-slate-800', 'text-slate-400', 'cursor-not-allowed');
    document.getElementById('btnStop').classList.add('bg-red-500/20', 'text-red-400', 'hover:bg-red-500/30');
    document.getElementById('progressArea').classList.remove('hidden');
    document.getElementById('resultsList').innerHTML = ''; // Clear previous
    
    // Reset Stats
    stats = { total: 0, registered: 0, bio: 0, business: 0, verified: 0, metaBusiness: 0 };
    updateStats();
    
    const total = currentNumbers.length;
    let processed = 0;
    
    // Process in batches of 30 for better performance
    const BATCH_SIZE = 30;
    const batches = [];
    
    for (let i = 0; i < currentNumbers.length; i += BATCH_SIZE) {
        batches.push(currentNumbers.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`[SCAN] Processing ${total} numbers in ${batches.length} batches`);
    
    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        if (!isScanning) break;
        
        const batch = batches[batchIndex];
        console.log(`[SCAN] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} numbers)`);
        
        // Process all numbers in batch simultaneously
        const promises = batch.map(async (number) => {
            if (!isScanning) return null;
            
            try {
                const result = await processNumber(number, 0, total);
                return result;
            } catch (error) {
                console.error(`[SCAN] Error processing ${number}:`, error);
                return null;
            }
        });
        
        // Wait for all in batch to complete
        await Promise.all(promises);
        
        processed += batch.length;
        
        // Update Progress
        const percent = Math.round((processed / total) * 100);
        document.getElementById('progressBar').style.width = `${percent}%`;
        document.getElementById('progressPercent').innerText = `${percent}%`;
        document.getElementById('currentNumber').innerText = `Processed: ${processed}/${total}`;
        
        // Small delay between batches to avoid overwhelming the server
        if (batchIndex < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    if (isScanning) {
        stopScan();
        alert(`Scan completed!\n\nTotal: ${stats.total}\nRegistered: ${stats.registered}\nWith Bio: ${stats.bio}\nBusiness: ${stats.business}\nVerified: ${stats.verified}`);
    }
}

async function processNumber(number, current, total) {
    // Call real API
    const result = await safeFetch(`${API_URL}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number })
    });
    
    if (!result.success) {
        console.error('[PROCESS] Check failed for', number, result.error);
        return null;
    }
    
    const data = result.data;
    
    // Debug logging
    console.log(`[PROCESS] Number: ${number}, Registered: ${data.registered}, Business: ${data.isBusiness}, Bio: ${data.bio ? 'Yes' : 'No'}`);
    
    // Update stats (thread-safe increment)
    stats.total++;
    
    if (data.registered) {
        console.log(`[PROCESS] Adding ${number} to results (Business: ${data.isBusiness})`);

        stats.registered++;
        if (data.bio) stats.bio++;
        if (data.isBusiness) stats.business++;
        if (data.isVerified) stats.verified++;
        if (data.isMetaBusiness) stats.metaBusiness++;
        if (data.isEnterprise) stats.enterprise++;
        if (data.profilePicture) stats.hasPhoto++;
        if (data.privacySettings && (data.privacySettings.profilePicture === 'hidden' || data.privacySettings.status === 'hidden')) {
            stats.privacyHidden++;
        }
        
        // Update stats display
        updateStats();
        
        // Create badges
        const badges = [];
        if (data.isMetaBusiness) {
            badges.push('<span class="px-2 py-1 rounded bg-yellow-500/20 text-yellow-400 text-[10px] font-bold uppercase flex items-center gap-1"><i class="fa-solid fa-certificate"></i> Meta Verified</span>');
        }
        if (data.isEnterprise) {
            badges.push('<span class="px-2 py-1 rounded bg-orange-500/20 text-orange-400 text-[10px] font-bold uppercase flex items-center gap-1"><i class="fa-solid fa-building"></i> Enterprise</span>');
        }
        if (data.isVerified && !data.isMetaBusiness) {
            badges.push('<span class="px-2 py-1 rounded bg-green-500/20 text-green-400 text-[10px] font-bold uppercase flex items-center gap-1"><i class="fa-solid fa-circle-check"></i> Verified</span>');
        }
        if (data.isBusiness) {
            badges.push('<span class="px-2 py-1 rounded bg-brand-purple/20 text-brand-purple text-[10px] font-bold uppercase flex items-center gap-1"><i class="fa-solid fa-briefcase"></i> Business</span>');
        }
        if (data.businessInfo?.hasCatalog) {
            badges.push(`<span class="px-2 py-1 rounded bg-blue-500/20 text-blue-400 text-[10px] font-bold uppercase flex items-center gap-1"><i class="fa-solid fa-store"></i> Catalog (${data.businessInfo.catalogCount})</span>`);
        }
        if (data.verifiedName) {
            badges.push(`<span class="px-2 py-1 rounded bg-cyan-500/20 text-cyan-400 text-[10px] font-bold uppercase flex items-center gap-1"><i class="fa-solid fa-award"></i> Official</span>`);
        }
        
        // Business info section
        let businessSection = '';
        if (data.businessInfo) {
            const info = data.businessInfo;
            businessSection = `
                <div class="mt-2 p-2 bg-slate-900/50 rounded-lg border border-slate-700/50 space-y-1">
                    <p class="text-[10px] font-bold text-brand-purple uppercase tracking-wide mb-1">Business Details</p>
                    ${info.category ? `<p class="text-xs text-slate-300"><i class="fa-solid fa-tag text-slate-500 mr-1"></i> ${escapeHtml(info.category)}</p>` : ''}
                    ${info.description ? `<p class="text-xs text-slate-400 italic">"${escapeHtml(info.description)}"</p>` : ''}
                    ${info.email ? `<p class="text-xs text-slate-400"><i class="fa-solid fa-envelope text-slate-500 mr-1"></i> ${escapeHtml(info.email)}</p>` : ''}
                    ${info.website && info.website.length > 0 ? `<p class="text-xs text-slate-400"><i class="fa-solid fa-globe text-slate-500 mr-1"></i> ${escapeHtml(info.website[0])}</p>` : ''}
                    ${info.address ? `<p class="text-xs text-slate-400"><i class="fa-solid fa-location-dot text-slate-500 mr-1"></i> ${escapeHtml(info.address)}</p>` : ''}
                    ${info.hasCatalog ? `
                        <div class="flex items-center gap-2 mt-2 pt-2 border-t border-slate-700/50">
                            <i class="fa-solid fa-shopping-bag text-blue-400"></i>
                            <span class="text-xs text-blue-400 font-semibold">${info.catalogCount} Product${info.catalogCount > 1 ? 's' : ''} in Catalog</span>
                        </div>
                    ` : ''}
                </div>
            `;
        }
        
        // Info grid items
        const infoItems = [];
        infoItems.push(`
            <div class="flex items-center gap-1 text-slate-400">
                <i class="fa-solid fa-user-check"></i>
                <span>Registered</span>
            </div>
        `);
        
        if (data.isBusiness) {
            infoItems.push(`
                <div class="flex items-center gap-1 text-brand-purple">
                    <i class="fa-solid fa-store"></i>
                    <span>Business Account</span>
                </div>
            `);
        }
        
        if (data.isEnterprise) {
            infoItems.push(`
                <div class="flex items-center gap-1 text-yellow-400">
                    <i class="fa-solid fa-building"></i>
                    <span>Enterprise</span>
                </div>
            `);
        }
        
        if (data.bio) {
            infoItems.push(`
                <div class="flex items-center gap-1 text-brand-secondary">
                    <i class="fa-solid fa-message"></i>
                    <span>Has Status</span>
                </div>
            `);
        }
        
        if (data.isVerified) {
            infoItems.push(`
                <div class="flex items-center gap-1 text-green-400">
                    <i class="fa-solid fa-shield-check"></i>
                    <span>Verified</span>
                </div>
            `);
        }
        
        if (data.profilePicture) {
            infoItems.push(`
                <div class="flex items-center gap-1 text-slate-400">
                    <i class="fa-solid fa-image"></i>
                    <span>Has Photo</span>
                </div>
            `);
        }
        
        if (data.pushName) {
            infoItems.push(`
                <div class="flex items-center gap-1 text-slate-400">
                    <i class="fa-solid fa-id-card"></i>
                    <span>${escapeHtml(data.pushName)}</span>
                </div>
            `);
        }
        
        if (data.verifiedName) {
            infoItems.push(`
                <div class="flex items-center gap-1 text-blue-400">
                    <i class="fa-solid fa-certificate"></i>
                    <span>${escapeHtml(data.verifiedName)}</span>
                </div>
            `);
        }
        
        if (data.contactName) {
            infoItems.push(`
                <div class="flex items-center gap-1 text-slate-400">
                    <i class="fa-solid fa-address-book"></i>
                    <span>${escapeHtml(data.contactName)}</span>
                </div>
            `);
        }
        
        // Privacy info
        if (data.privacySettings) {
            if (data.privacySettings.profilePicture === 'hidden') {
                infoItems.push(`
                    <div class="flex items-center gap-1 text-red-400">
                        <i class="fa-solid fa-eye-slash"></i>
                        <span>Photo Hidden</span>
                    </div>
                `);
            }
            if (data.privacySettings.status === 'hidden') {
                infoItems.push(`
                    <div class="flex items-center gap-1 text-red-400">
                        <i class="fa-solid fa-lock"></i>
                        <span>Status Hidden</span>
                    </div>
                `);
            }
        }
        
        const resultHTML = `
            <div class="bg-slate-800/50 border ${data.isBusiness ? 'border-brand-purple/50' : 'border-slate-700'} rounded-xl p-4 hover:bg-slate-800 transition-all hover:border-brand-accent/30 group ${data.isBusiness ? 'bg-gradient-to-r from-purple-900/10 to-transparent' : ''}">
                <div class="flex items-start gap-3">
                    <div class="relative">
                        ${data.profilePicture ? `
                            <img src="${data.profilePicture}" class="w-12 h-12 rounded-full border-2 ${data.isBusiness ? 'border-brand-purple' : 'border-brand-accent'} flex-shrink-0 group-hover:scale-110 transition-transform" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                            <div class="w-12 h-12 rounded-full bg-gradient-to-br from-brand-accent/20 to-brand-accent/5 flex items-center justify-center text-sm font-bold text-brand-accent flex-shrink-0 group-hover:scale-110 transition-transform" style="display:none;">
                                ${number.substring(number.length - 2)}
                            </div>
                        ` : `
                            <div class="w-12 h-12 rounded-full bg-gradient-to-br ${data.isBusiness ? 'from-brand-purple/30 to-brand-purple/10' : 'from-brand-accent/20 to-brand-accent/5'} flex items-center justify-center text-sm font-bold ${data.isBusiness ? 'text-brand-purple' : 'text-brand-accent'} flex-shrink-0 group-hover:scale-110 transition-transform">
                                ${number.substring(number.length - 2)}
                            </div>
                        `}
                        ${data.isBusiness ? `
                            <div class="absolute -bottom-1 -right-1 w-5 h-5 bg-brand-purple rounded-full flex items-center justify-center border-2 border-slate-800">
                                <i class="fa-solid fa-briefcase text-white text-[8px]"></i>
                            </div>
                        ` : ''}
                        ${data.isVerified || data.isMetaBusiness ? `
                            <div class="absolute -top-1 -right-1 w-5 h-5 ${data.isMetaBusiness ? 'bg-yellow-500' : 'bg-blue-500'} rounded-full flex items-center justify-center border-2 border-slate-800">
                                <i class="fa-solid fa-check text-white text-[8px]"></i>
                            </div>
                        ` : ''}
                        ${data.isEnterprise ? `
                            <div class="absolute -top-1 -left-1 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center border-2 border-slate-800">
                                <i class="fa-solid fa-building text-white text-[8px]"></i>
                            </div>
                        ` : ''}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1 flex-wrap">
                            <span class="text-sm font-semibold text-white">+${number}</span>
                            <button onclick="copyNumber('${number}')" class="text-slate-500 hover:text-brand-accent transition-colors" title="Copy number">
                                <i class="fa-solid fa-copy text-xs"></i>
                            </button>
                            ${data.isBusiness ? '<span class="px-1.5 py-0.5 bg-brand-purple/20 text-brand-purple text-[9px] font-bold rounded border border-brand-purple/30">BUSINESS</span>' : '<span class="px-1.5 py-0.5 bg-slate-700/50 text-slate-400 text-[9px] font-bold rounded">PERSONAL</span>'}
                            ${data.isMetaBusiness ? '<span class="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-[9px] font-bold rounded border border-yellow-500/30 flex items-center gap-1"><i class="fa-solid fa-certificate text-[8px]"></i>META</span>' : ''}
                            ${data.isVerified && !data.isMetaBusiness ? '<span class="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[9px] font-bold rounded border border-blue-500/30 flex items-center gap-1"><i class="fa-solid fa-shield-check text-[8px]"></i>VERIFIED</span>' : ''}
                        </div>
                        
                        ${data.pushName ? `<p class="text-xs text-slate-400 mb-1"><i class="fa-solid fa-user text-[10px] mr-1"></i>${escapeHtml(data.pushName)}</p>` : ''}
                        ${data.verifiedName ? `<p class="text-xs text-blue-400 mb-1 font-semibold"><i class="fa-solid fa-certificate text-[10px] mr-1"></i>${escapeHtml(data.verifiedName)}</p>` : ''}
                        ${data.contactName ? `<p class="text-xs text-slate-500 mb-1"><i class="fa-solid fa-address-book text-[10px] mr-1"></i>${escapeHtml(data.contactName)}</p>` : ''}
                        
                        ${data.bio ? `
                            <div class="bg-slate-900/50 rounded-lg p-2 mb-2 border border-slate-700/50">
                                <p class="text-xs text-slate-300 leading-relaxed">${escapeHtml(data.bio)}</p>
                            </div>
                        ` : '<p class="text-xs text-slate-500 italic mb-2"><i class="fa-solid fa-comment-slash text-[10px] mr-1"></i>No bio available</p>'}
                        
                        ${data.businessInfo?.hasCatalog ? `
                            <div class="flex items-center gap-2 mb-2 p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
                                <i class="fa-solid fa-shopping-bag text-blue-400"></i>
                                <span class="text-xs text-blue-400 font-semibold">${data.businessInfo.catalogCount} Product${data.businessInfo.catalogCount > 1 ? 's' : ''} in Catalog</span>
                            </div>
                        ` : ''}
                        
                        ${businessSection}
                        
                        ${data.privacySettings && (data.privacySettings.profilePicture === 'hidden' || data.privacySettings.status === 'hidden') ? `
                            <div class="mt-2 p-2 bg-red-900/20 rounded-lg border border-red-700/30 space-y-1">
                                <p class="text-[10px] font-bold text-red-400 uppercase tracking-wide mb-1"><i class="fa-solid fa-shield-halved mr-1"></i>Privacy Settings</p>
                                ${data.privacySettings.profilePicture === 'hidden' ? `<p class="text-xs text-red-300"><i class="fa-solid fa-eye-slash text-[10px] mr-1"></i>Profile picture is hidden</p>` : ''}
                                ${data.privacySettings.status === 'hidden' ? `<p class="text-xs text-red-300"><i class="fa-solid fa-lock text-[10px] mr-1"></i>Status/bio is hidden</p>` : ''}
                            </div>
                        ` : ''}
                        
                        <div class="grid grid-cols-2 gap-2 text-[10px] mt-2">
                            ${infoItems.join('')}
                        </div>
                        
                        ${data.profilePictureHD ? `
                            <div class="mt-2 pt-2 border-t border-slate-700/50">
                                <a href="${data.profilePictureHD}" target="_blank" class="text-xs text-brand-accent hover:text-brand-secondary transition-colors flex items-center gap-1">
                                    <i class="fa-solid fa-external-link"></i>
                                    <span>View HD Profile Picture</span>
                                </a>
                            </div>
                        ` : ''}
                        
                        ${data.jid ? `
                            <div class="mt-2 pt-2 border-t border-slate-700/50">
                                <p class="text-[9px] text-slate-600 font-mono truncate">${data.jid}</p>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        
        const list = document.getElementById('resultsList');
        
        // Debug: Check if list exists
        if (!list) {
            console.error('[PROCESS] ERROR: resultsList element not found!');
            return data;
        }
        
        console.log(`[PROCESS] Inserting ${number} into DOM (Business: ${data.isBusiness}, Current children: ${list.children.length})`);
        
        // Remove empty state if exists
        if (list.children.length > 0 && list.children[0].innerText.includes('No data')) {
            list.innerHTML = '';
        }
        
        try {
            list.insertAdjacentHTML('afterbegin', resultHTML);
            console.log(`[PROCESS] Successfully inserted ${number}. New children count: ${list.children.length}`);
        } catch (htmlError) {
            console.error(`[PROCESS] ERROR inserting HTML for ${number}:`, htmlError);
            console.error('[PROCESS] Problematic HTML:', resultHTML.substring(0, 200));
            return data;
        }
        
        // Animate entry
        if (typeof gsap !== 'undefined') {
            gsap.from(list.firstElementChild, {x: -20, opacity: 0, duration: 0.3});
        }
    } else {
        console.log(`[PROCESS] Number ${number} NOT registered - skipping DOM insertion`);
        updateStats();
    }
    
    return data;
}

function stopScan() {
    isScanning = false;
    
    document.getElementById('btnStart').disabled = false;
    document.getElementById('btnStart').classList.remove('opacity-50', 'cursor-not-allowed');
    document.getElementById('btnStop').disabled = true;
    document.getElementById('btnStop').classList.add('bg-slate-800', 'text-slate-400', 'cursor-not-allowed');
    document.getElementById('btnStop').classList.remove('bg-red-500/20', 'text-red-400', 'hover:bg-red-500/30');
    
    document.getElementById('currentNumber').innerText = "Completed";
    document.getElementById('currentNumber').classList.add('text-brand-accent');
}

function updateStats() {
    document.getElementById('statTotal').innerText = stats.total;
    document.getElementById('statRegistered').innerText = stats.registered;
    document.getElementById('statBio').innerText = stats.bio;
    document.getElementById('statBusiness').innerText = stats.business;
    document.getElementById('statVerified').innerText = stats.verified;
    document.getElementById('statEnterprise').innerText = stats.enterprise;
    document.getElementById('statHasPhoto').innerText = stats.hasPhoto;
    document.getElementById('statPrivacyHidden').innerText = stats.privacyHidden;
}

function exportResults() {
    if (stats.total === 0) {
        alert("No data to export");
        return;
    }
    
    // Create CSV
    let csv = "Number,Registered,Has Bio,Business,Verified,Meta Business,Bio Text\n";
    
    const resultElements = document.querySelectorAll('#resultsList > div');
    resultElements.forEach(el => {
        const number = el.querySelector('.text-white').textContent.replace('+', '');
        const bio = el.querySelector('.text-slate-400').textContent;
        const isBiz = el.querySelector('.uppercase')?.textContent.includes('Biz') || false;
        const isMeta = el.querySelector('.uppercase')?.textContent.includes('Meta') || false;
        const isVerified = el.querySelector('.fa-circle-check') !== null;
        
        csv += `${number},Yes,${bio !== 'No Bio' ? 'Yes' : 'No'},${isBiz ? 'Yes' : 'No'},${isVerified ? 'Yes' : 'No'},${isMeta ? 'Yes' : 'No'},"${bio}"\n`;
    });
    
    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whatsapp-check-${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Copy number to clipboard
function copyNumber(number) {
    navigator.clipboard.writeText(number).then(() => {
        // Show toast notification
        const toast = document.createElement('div');
        toast.className = 'fixed bottom-4 right-4 bg-brand-accent text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in';
        toast.innerHTML = '<i class="fa-solid fa-check mr-2"></i>Number copied!';
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy number');
    });
}

// ============================================
// INITIALIZATION
// ============================================

window.addEventListener('DOMContentLoaded', () => {
    console.log('[DEBUG] App.js loaded');
    
    // Check auth status
    checkAuthStatus();
});
