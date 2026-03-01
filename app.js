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
    metaBusiness: 0
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
        
        // Entrance animation
        gsap.from("#connectionActive > div", {x: -20, opacity: 0, duration: 0.4, stagger: 0.1});
        
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
    
    if (currentNumbers.length > 100) {
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
    
    let index = 0;
    const total = currentNumbers.length;
    
    // Process numbers one by one
    for (let i = 0; i < total; i++) {
        if (!isScanning) break;
        
        const num = currentNumbers[i];
        await processNumber(num, i + 1, total);
        
        // Update Progress
        const percent = Math.round(((i + 1) / total) * 100);
        document.getElementById('progressBar').style.width = `${percent}%`;
        document.getElementById('progressPercent').innerText = `${percent}%`;
        document.getElementById('currentNumber').innerText = `Checking: ${num}`;
        
        // Delay to avoid rate limit
        await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    if (isScanning) {
        stopScan();
        alert(`Scan completed!\n\nTotal: ${stats.total}\nRegistered: ${stats.registered}\nWith Bio: ${stats.bio}\nBusiness: ${stats.business}`);
    }
}

async function processNumber(number, current, total) {
    stats.total = current;
    
    // Call real API
    const result = await safeFetch(`${API_URL}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number })
    });
    
    if (!result.success) {
        console.error('Check failed for', number, result.error);
        updateStats();
        return;
    }
    
    const data = result.data;
    
    if (data.registered) {
        stats.registered++;
        if (data.bio) stats.bio++;
        if (data.isBusiness) stats.business++;
        if (data.isVerified) stats.verified++;
        if (data.isMetaBusiness) stats.metaBusiness++;
        
        // Create Result Element
        const resultHTML = `
            <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-3 flex items-center gap-3 animate-fade-in hover:bg-slate-800 transition-colors">
                <div class="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-600 flex items-center justify-center text-xs font-bold text-white">
                    ${number.substring(number.length - 2)}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-white truncate">+${number}</span>
                        ${data.isVerified ? '<i class="fa-solid fa-circle-check text-brand-secondary text-xs" title="Verified"></i>' : ''}
                    </div>
                    <p class="text-xs text-slate-400 truncate">${data.bio || "No Bio"}</p>
                </div>
                ${data.isBusiness ? '<span class="px-2 py-1 rounded bg-brand-purple/20 text-brand-purple text-[10px] font-bold uppercase">Biz</span>' : ''}
                ${data.isMetaBusiness ? '<span class="px-2 py-1 rounded bg-brand-pink/20 text-brand-pink text-[10px] font-bold uppercase">Meta</span>' : ''}
            </div>
        `;
        
        const list = document.getElementById('resultsList');
        
        // Remove empty state if exists
        if (list.children.length > 0 && list.children[0].innerText.includes('No data')) {
            list.innerHTML = '';
        }
        
        list.insertAdjacentHTML('afterbegin', resultHTML);
        
        // Animate entry
        if (typeof gsap !== 'undefined') {
            gsap.from(list.firstElementChild, {x: -20, opacity: 0, duration: 0.3});
        }
    }
    
    updateStats();
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

// ============================================
// INITIALIZATION
// ============================================

window.addEventListener('DOMContentLoaded', () => {
    console.log('[DEBUG] App.js loaded');
    
    // Check auth status
    checkAuthStatus();
});
