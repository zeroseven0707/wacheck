const API_URL = 'http://localhost:3000/api';

let isChecking = false;
let isConnected = false;
let isConnecting = false;
let connectionCheckInterval = null;
let isAuthenticated = false;
let currentUsername = '';
let stats = {
    total: 0,
    registered: 0,
    bio: 0,
    business: 0,
    verified: 0,
    metaBusiness: 0
};
let results = [];

// Utility function untuk handle fetch errors
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

// Cek auth status saat load
async function checkAuthStatus() {
    const result = await safeFetch(`${API_URL}/auth/status`);
    
    if (result.success && result.data.authenticated) {
        isAuthenticated = true;
        currentUsername = result.data.username;
        showMainApp();
        checkInitialStatus();
    } else {
        showAuthForm();
    }
}

function showAuthForm() {
    const authContainer = document.getElementById('authContainer');
    const mainContainer = document.getElementById('mainContainer');
    
    if (authContainer) authContainer.style.display = 'block';
    if (mainContainer) mainContainer.style.display = 'none';
}

function showMainApp() {
    const authContainer = document.getElementById('authContainer');
    const mainContainer = document.getElementById('mainContainer');
    const currentUserEl = document.getElementById('currentUser');
    
    if (authContainer) authContainer.style.display = 'none';
    if (mainContainer) mainContainer.style.display = 'block';
    if (currentUserEl) currentUserEl.textContent = currentUsername;
}

function showAuthMessage(message, isError = false) {
    const msgEl = document.getElementById('authMessage');
    if (!msgEl) return;
    
    msgEl.textContent = message;
    msgEl.style.display = 'block';
    msgEl.style.background = isError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(37, 211, 102, 0.2)';
    msgEl.style.color = isError ? '#ef4444' : 'var(--primary)';
    msgEl.style.border = `1px solid ${isError ? 'rgba(239, 68, 68, 0.3)' : 'rgba(37, 211, 102, 0.3)'}`;
    
    // Auto hide after 5 seconds
    setTimeout(() => {
        if (msgEl) msgEl.style.display = 'none';
    }, 5000);
}

// Login
async function login() {
    const usernameEl = document.getElementById('username');
    const passwordEl = document.getElementById('password');
    
    if (!usernameEl || !passwordEl) {
        console.error('Form elements not found');
        return;
    }
    
    const username = usernameEl.value.trim();
    const password = passwordEl.value;
    
    if (!username || !password) {
        showAuthMessage('Username dan password harus diisi!', true);
        return;
    }
    
    showAuthMessage('Logging in...', false);
    
    const result = await safeFetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    
    if (result.success) {
        isAuthenticated = true;
        currentUsername = result.data.username;
        showMainApp();
        checkInitialStatus();
    } else {
        showAuthMessage(result.error || 'Login gagal!', true);
    }
}

// Register
async function register() {
    const usernameEl = document.getElementById('username');
    const passwordEl = document.getElementById('password');
    
    if (!usernameEl || !passwordEl) {
        console.error('Form elements not found');
        return;
    }
    
    const username = usernameEl.value.trim();
    const password = passwordEl.value;
    
    if (!username || !password) {
        showAuthMessage('Username dan password harus diisi!', true);
        return;
    }
    
    if (username.length < 3) {
        showAuthMessage('Username minimal 3 karakter!', true);
        return;
    }
    
    if (password.length < 6) {
        showAuthMessage('Password minimal 6 karakter!', true);
        return;
    }
    
    showAuthMessage('Registering...', false);
    
    const result = await safeFetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    
    if (result.success) {
        showAuthMessage('✅ Register berhasil! Silakan login.', false);
        passwordEl.value = '';
    } else {
        showAuthMessage(result.error || 'Register gagal!', true);
    }
}

// Logout
async function logoutUser() {
    if (!confirm('Yakin ingin logout?')) return;
    
    const result = await safeFetch(`${API_URL}/logout`, {
        method: 'POST'
    });
    
    isAuthenticated = false;
    currentUsername = '';
    isConnected = false;
    isConnecting = false;
    
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
        connectionCheckInterval = null;
    }
    
    showAuthForm();
    
    const usernameEl = document.getElementById('username');
    const passwordEl = document.getElementById('password');
    if (usernameEl) usernameEl.value = '';
    if (passwordEl) passwordEl.value = '';
}

// Fungsi untuk connect WhatsApp
async function connectWhatsApp() {
    if (isConnecting) return;
    
    const connectBtn = document.getElementById('connectBtn');
    const connectButtonSection = document.getElementById('connectButtonSection');
    const qrSection = document.getElementById('qrSection');
    
    if (!connectBtn || !connectButtonSection || !qrSection) {
        console.error('UI elements not found');
        return;
    }
    
    isConnecting = true;
    connectBtn.disabled = true;
    connectBtn.textContent = '⏳ Connecting...';
    connectButtonSection.style.display = 'none';
    qrSection.style.display = 'block';
    
    const result = await safeFetch(`${API_URL}/connect`, {
        method: 'POST'
    });
    
    if (!result.success) {
        alert('Gagal memulai koneksi: ' + result.error);
        isConnecting = false;
        connectBtn.disabled = false;
        connectBtn.textContent = '📱 Connect WhatsApp';
        connectButtonSection.style.display = 'block';
        qrSection.style.display = 'none';
        return;
    }
    
    // Mulai auto-refresh status
    if (!connectionCheckInterval) {
        connectionCheckInterval = setInterval(checkConnection, 2000);
    }
    checkConnection();
}

// Cek status koneksi WhatsApp
async function checkConnection() {
    if (!isConnecting && !isConnected) return;
    
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    
    if (!statusIndicator || !statusText) return;
    
    const result = await safeFetch(`${API_URL}/status`);
    
    if (!result.success) {
        statusIndicator.className = 'status-dot disconnected';
        statusText.textContent = '❌ Server Error';
        return;
    }
    
    isConnected = result.data.connected;
    
    if (isConnected) {
        statusIndicator.className = 'status-dot connected';
        statusText.textContent = '✅ Connected';
        
        const qrSection = document.getElementById('qrSection');
        const connectButtonSection = document.getElementById('connectButtonSection');
        if (qrSection) qrSection.style.display = 'none';
        if (connectButtonSection) connectButtonSection.style.display = 'none';
        
        isConnecting = false;
    } else {
        statusIndicator.className = 'status-dot disconnected';
        statusText.textContent = '⏳ Waiting for scan...';
        checkQRCode();
    }
}

// Ambil QR code
async function checkQRCode() {
    const qrSection = document.getElementById('qrSection');
    if (!qrSection) return;
    
    const result = await safeFetch(`${API_URL}/qr`);
    
    if (!result.success) {
        qrSection.innerHTML = '<p style="color: #e74c3c;">❌ Error loading QR Code</p>';
        return;
    }
    
    const data = result.data;
    
    if (data.connected) {
        qrSection.style.display = 'none';
    } else if (data.qr) {
        qrSection.innerHTML = `
            <p style="color: var(--text-secondary); margin-bottom: 12px;">📱 Scan QR Code dengan WhatsApp Anda:</p>
            <img src="${data.qr}" alt="QR Code" style="max-width: 280px; margin: 0 auto; display: block; border: 3px solid var(--primary); border-radius: 16px; padding: 12px; background: white;">
        `;
        qrSection.style.display = 'block';
    } else {
        qrSection.innerHTML = `
            <div class="qr-placeholder"></div>
            <div class="loading">
                <span></span>
                <span></span>
                <span></span>
            </div>
            <p style="color: var(--text-secondary); font-size: 0.9rem;">Generating QR Code...</p>
        `;
        qrSection.style.display = 'block';
    }
}

// Fungsi cek WhatsApp number
async function checkWhatsAppNumber(number) {
    const result = await safeFetch(`${API_URL}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number })
    });
    
    if (!result.success) {
        return { registered: false, error: true, message: result.error };
    }
    
    return result.data;
}

// Cek status awal saat load
async function checkInitialStatus() {
    const result = await safeFetch(`${API_URL}/status`);
    
    if (result.success && result.data.connected) {
        isConnected = true;
        isConnecting = true;
        
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        const connectButtonSection = document.getElementById('connectButtonSection');
        const qrSection = document.getElementById('qrSection');
        
        if (statusIndicator) statusIndicator.className = 'status-dot connected';
        if (statusText) statusText.textContent = '✅ Connected';
        if (connectButtonSection) connectButtonSection.style.display = 'none';
        if (qrSection) qrSection.style.display = 'none';
        
        if (!connectionCheckInterval) {
            connectionCheckInterval = setInterval(checkConnection, 3000);
        }
    }
}

function updateStats() {
    const elements = {
        totalCount: document.getElementById('totalCount'),
        registeredCount: document.getElementById('registeredCount'),
        bioCount: document.getElementById('bioCount'),
        businessCount: document.getElementById('businessCount'),
        verifiedCount: document.getElementById('verifiedCount'),
        metaBusinessCount: document.getElementById('metaBusinessCount')
    };
    
    if (elements.totalCount) elements.totalCount.textContent = stats.total;
    if (elements.registeredCount) elements.registeredCount.textContent = stats.registered;
    if (elements.bioCount) elements.bioCount.textContent = stats.bio;
    if (elements.businessCount) elements.businessCount.textContent = stats.business;
    if (elements.verifiedCount) elements.verifiedCount.textContent = stats.verified;
    if (elements.metaBusinessCount) elements.metaBusinessCount.textContent = stats.metaBusiness;
}

function updateProgress(current, total) {
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    if (!progressFill || !progressText) return;
    
    const percentage = Math.round((current / total) * 100);
    progressFill.style.width = percentage + '%';
    progressText.textContent = `${current}/${total} (${percentage}%)`;
}

function addResult(data) {
    const resultsContainer = document.getElementById('results');
    if (!resultsContainer) return;
    
    // Remove empty state
    const emptyState = resultsContainer.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }
    
    const resultDiv = document.createElement('div');
    resultDiv.className = 'result-item';
    
    let badges = '';
    if (data.isVerified) {
        badges += '<span class="badge badge-verified">✅ Verified</span>';
    }
    if (data.isMetaBusiness) {
        badges += '<span class="badge badge-meta">💼 Meta Business</span>';
    } else if (data.isBusiness) {
        badges += '<span class="badge badge-business">🏢 Business</span>';
    }
    
    const numberStr = String(data.number);
    const initial = numberStr.charAt(numberStr.length - 2).toUpperCase() || '?';
    
    resultDiv.innerHTML = `
        <div class="result-avatar">${initial}</div>
        <div class="result-info">
            <div class="result-number">+${data.number}</div>
            ${data.bio ? `<div class="result-bio">${escapeHtml(data.bio)}</div>` : '<div class="result-bio" style="color: var(--text-secondary); font-style: italic;">No bio</div>'}
        </div>
        <div class="result-badges">${badges}</div>
    `;
    
    resultsContainer.insertBefore(resultDiv, resultsContainer.firstChild);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function startCheck() {
    if (!isConnected) {
        alert('WhatsApp belum terhubung! Scan QR code terlebih dahulu.');
        return;
    }
    
    const numberInput = document.getElementById('numberInput');
    if (!numberInput) return;
    
    const input = numberInput.value.trim();
    if (!input) {
        alert('Masukkan nomor WhatsApp terlebih dahulu!');
        return;
    }
    
    const numbers = input.split('\n').filter(n => n.trim()).map(n => n.trim());
    if (numbers.length === 0) {
        alert('Tidak ada nomor yang valid!');
        return;
    }
    
    if (numbers.length > 100) {
        if (!confirm(`Anda akan mengecek ${numbers.length} nomor. Ini mungkin memakan waktu lama. Lanjutkan?`)) {
            return;
        }
    }
    
    isChecking = true;
    stats = { total: numbers.length, registered: 0, bio: 0, business: 0, verified: 0, metaBusiness: 0 };
    results = [];
    
    const resultsContainer = document.getElementById('results');
    if (resultsContainer) resultsContainer.innerHTML = '';
    
    updateStats();
    
    const checkBtn = document.getElementById('checkBtn');
    const stopBtn = document.getElementById('stopBtn');
    if (checkBtn) checkBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
    
    let processed = 0;
    
    for (const number of numbers) {
        if (!isChecking) break;
        
        const result = await checkWhatsAppNumber(number);
        
        if (result.error) {
            console.error('Error checking:', number, result.message);
        } else if (result.registered) {
            stats.registered++;
            if (result.bio) stats.bio++;
            if (result.isBusiness) stats.business++;
            if (result.isVerified) stats.verified++;
            if (result.isMetaBusiness) stats.metaBusiness++;
            
            if (result.isBusiness || result.bio) {
                addResult(result);
            }
        }
        
        processed++;
        updateStats();
        updateProgress(processed, numbers.length);
        
        // Delay untuk menghindari rate limit
        await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    if (checkBtn) checkBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    isChecking = false;
    
    alert(`Pengecekan selesai!\n\nTotal: ${stats.total}\nTerdaftar: ${stats.registered}\nPunya Bio: ${stats.bio}\nBusiness: ${stats.business}`);
}

function stopCheck() {
    isChecking = false;
    const checkBtn = document.getElementById('checkBtn');
    const stopBtn = document.getElementById('stopBtn');
    if (checkBtn) checkBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
}

// Enter key support
document.addEventListener('DOMContentLoaded', () => {
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    
    if (usernameInput) {
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') login();
        });
    }
    
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') login();
        });
    }
    
    // Check auth status
    checkAuthStatus();
});
