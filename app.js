// ─── Config ────────────────────────────────────────────────────────────────────
const API_URL = '/api';
const FAST_MODE = true;
const BATCH_SIZE = 30;
const BATCH_DELAY = 800; // ms between batches

// ─── State ─────────────────────────────────────────────────────────────────────
const state = {
    isLoggedIn: false,
    isConnected: false,
    isScanning: false,
    isConnecting: false,
    authMode: 'login',
    username: '',
    connectionTimer: null,
    scanTimer: null,
    stats: { total: 0, registered: 0, bio: 0, business: 0, verified: 0, hasPhoto: 0 }
};

// ─── DOM Helpers ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const show = id => $(id)?.classList.remove('hidden');
const hide = id => $(id)?.classList.add('hidden');

function escapeHtml(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

function showNotification(msg, type = 'error') {
    const el = $('authError');
    if (!el) return;
    el.textContent = msg;
    el.className = type === 'success'
        ? 'text-sm text-center py-2 rounded-lg border bg-green-400/10 border-green-400/20 text-green-400'
        : 'text-sm text-center py-2 rounded-lg border bg-red-400/10 border-red-400/20 text-red-400';
    show('authError');
    setTimeout(() => hide('authError'), 5000);
}

function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'fixed bottom-4 right-4 bg-brand-accent text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm';
    t.innerHTML = `<i class="fa-solid fa-check mr-2"></i>${msg}`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
}

// ─── API ───────────────────────────────────────────────────────────────────────
async function api(endpoint, options = {}) {
    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', ...options.headers }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return { ok: true, data };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

// ─── Auth ──────────────────────────────────────────────────────────────────────
function switchAuth(type) {
    state.authMode = type;
    const isLogin = type === 'login';
    const activeClass = 'flex-1 py-2 rounded-lg text-sm font-medium transition-all bg-brand-accent/10 text-brand-accent border border-brand-accent/20';
    const inactiveClass = 'flex-1 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white transition-all';
    $('tabLogin').className = isLogin ? activeClass : inactiveClass;
    $('tabRegister').className = isLogin ? inactiveClass : activeClass;
    $('authBtnText').textContent = isLogin ? 'Access Dashboard' : 'Create Account';
}

async function handleAuth() {
    const user = $('authUser').value.trim();
    const pass = $('authPass').value;
    const btn = document.querySelector('button[type="submit"]');

    if (user.length < 3) return showNotification('Username min 3 characters');
    if (pass.length < 6) return showNotification('Password min 6 characters');

    const orig = btn.innerHTML;
    btn.innerHTML = '<div class="loader border-white/30 border-t-white w-5 h-5 mx-auto"></div>';
    btn.disabled = true;

    if (state.authMode === 'register') {
        const r = await api('/register', { method: 'POST', body: JSON.stringify({ username: user, password: pass }) });
        btn.innerHTML = orig;
        btn.disabled = false;
        if (r.ok) {
            showNotification('Registration successful! Please login.', 'success');
            setTimeout(() => { switchAuth('login'); $('authPass').value = ''; }, 2000);
        } else {
            showNotification(r.error || 'Registration failed');
        }
        return;
    }

    const r = await api('/login', { method: 'POST', body: JSON.stringify({ username: user, password: pass }) });
    if (r.ok) {
        state.isLoggedIn = true;
        state.username = r.data.username;
        $('displayUser').textContent = state.username;
        gsap.to('#authView', { opacity: 0, y: -20, duration: 0.4, onComplete: () => {
            hide('authView');
            show('dashboardView');
            gsap.fromTo('#dashboardView', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 });
            checkInitialStatus();
        }});
    } else {
        showNotification(r.error || 'Authentication failed');
        btn.innerHTML = orig;
        btn.disabled = false;
    }
}

async function logout() {
    if (!confirm('Logout?')) return;
    await api('/logout', { method: 'POST' });
    clearInterval(state.connectionTimer);
    state.connectionTimer = null;
    location.reload();
}

async function checkAuthStatus() {
    const r = await api('/auth/status');
    if (r.ok && r.data.authenticated) {
        state.isLoggedIn = true;
        state.username = r.data.username;
        $('displayUser').textContent = state.username;
        hide('authView');
        show('dashboardView');
        checkInitialStatus();
    }
    // If not authenticated, authView stays visible (default)
}

// ─── Connection ────────────────────────────────────────────────────────────────
async function initiateConnection() {
    if (state.isConnecting) return;
    state.isConnecting = true;

    hide('connectionIdle');
    show('connectionScan');

    const r = await api('/connect', { method: 'POST' });
    if (!r.ok) {
        if (r.error === 'Not authenticated') { logout(); return; }
        alert('Failed to connect: ' + r.error);
        state.isConnecting = false;
        hide('connectionScan');
        show('connectionIdle');
        return;
    }

    setTimeout(() => { const el = $('qrLoading'); if (el) el.style.display = 'none'; }, 1200);

    if (!state.connectionTimer) {
        state.connectionTimer = setInterval(checkConnection, 2000);
    }
    checkConnection();
}

async function checkConnection() {
    if (!state.isConnecting && !state.isConnected) return;

    const r = await api('/status');
    if (!r.ok) return;

    if (r.data.connected) {
        state.isConnected = true;
        state.isConnecting = false;
        clearInterval(state.connectionTimer);
        state.connectionTimer = setInterval(checkConnection, 10000); // keep-alive check

        hide('connectionScan');
        show('connectionActive');

        if (r.data.device) {
            const d = r.data.device;
            const el = $('deviceName'); if (el) el.textContent = d.model || 'Connected Device';
            const en = $('deviceNumber'); if (en) en.textContent = d.number ? `+${d.number}` : 'Active';
            const ep = $('devicePlatform'); if (ep) ep.textContent = d.platform || 'WhatsApp';
            const ea = $('deviceAvatar');
            if (ea && d.model) ea.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(d.model.slice(0,2))}&background=25D366&color=fff`;
        }

        gsap.from('#connectionActive > div', { x: -20, opacity: 0, duration: 0.4, stagger: 0.1 });
    } else if (state.isConnecting) {
        pollQR();
    }
}

async function pollQR() {
    const r = await api('/qr');
    if (!r.ok || !r.data.qr) return;

    const container = document.querySelector('#connectionScan .relative.w-48');
    if (container) {
        container.innerHTML = `<img src="${r.data.qr}" alt="QR Code" class="w-full h-full object-contain rounded-xl"><div class="scan-line"></div>`;
    }
}

async function disconnect() {
    if (!confirm('Disconnect WhatsApp?')) return;
    await api('/disconnect', { method: 'POST' });
    state.isConnected = false;
    clearInterval(state.connectionTimer);
    state.connectionTimer = null;
    hide('connectionActive');
    show('connectionIdle');
}

async function checkInitialStatus() {
    const r = await api('/status');
    if (r.ok && r.data.connected) {
        state.isConnected = true;
        hide('connectionIdle');
        show('connectionActive');
        if (!state.connectionTimer) {
            state.connectionTimer = setInterval(checkConnection, 10000);
        }
    }
}

// ─── Input ─────────────────────────────────────────────────────────────────────
const inputArea = $('numberInput');
if (inputArea) {
    inputArea.addEventListener('input', () => {
        const count = inputArea.value.split('\n').filter(l => l.trim()).length;
        $('inputCount').textContent = `${count} numbers`;
    });
}

function clearInput() {
    if (inputArea) { inputArea.value = ''; $('inputCount').textContent = '0 numbers'; }
}

// ─── Scan ──────────────────────────────────────────────────────────────────────
async function startScan() {
    if (!state.isConnected) { alert('Connect WhatsApp first!'); return; }

    const numbers = inputArea.value.split('\n').map(n => n.trim()).filter(Boolean);
    if (!numbers.length) { alert('Enter phone numbers to check.'); return; }
    if (numbers.length > 500 && !confirm(`Check ${numbers.length} numbers? This may take a while.`)) return;

    state.isScanning = true;
    state.stats = { total: 0, registered: 0, bio: 0, business: 0, verified: 0, hasPhoto: 0 };

    $('btnStart').disabled = true;
    $('btnStart').classList.add('opacity-50', 'cursor-not-allowed');
    $('btnStop').disabled = false;
    $('btnStop').classList.remove('bg-slate-800', 'text-slate-400', 'cursor-not-allowed');
    $('btnStop').classList.add('bg-red-500/20', 'text-red-400', 'hover:bg-red-500/30');
    show('progressArea');
    $('resultsList').innerHTML = '';
    updateStats();

    const total = numbers.length;
    let processed = 0;

    for (let i = 0; i < numbers.length; i += BATCH_SIZE) {
        if (!state.isScanning) break;

        const batch = numbers.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(n => processNumber(n)));
        processed += batch.length;

        const pct = Math.round((processed / total) * 100);
        $('progressBar').style.width = `${pct}%`;
        $('progressPercent').textContent = `${pct}%`;
        $('currentNumber').textContent = `${processed}/${total} processed`;

        if (i + BATCH_SIZE < numbers.length) {
            await new Promise(r => setTimeout(r, BATCH_DELAY));
        }
    }

    if (state.isScanning) {
        stopScan();
        showToast(`Done! ${state.stats.registered}/${state.stats.total} registered`);
    }
}

async function processNumber(number) {
    const r = await api('/check', {
        method: 'POST',
        body: JSON.stringify({ number, fastMode: FAST_MODE })
    });

    if (!r.ok) return;
    const d = r.data;

    state.stats.total++;
    if (!d.registered) { updateStats(); return; }

    state.stats.registered++;
    if (d.bio) state.stats.bio++;
    if (d.isBusiness) state.stats.business++;
    if (d.isVerified) state.stats.verified++;
    if (d.profilePicture) state.stats.hasPhoto++;
    updateStats();

    renderResult(number, d);
}

function renderResult(number, d) {
    const list = $('resultsList');
    if (!list) return;

    // Clear empty state
    if (list.firstElementChild?.classList.contains('empty-state')) list.innerHTML = '';

    const badges = [
        d.isVerifiedBlue ? `<span class="badge bg-blue-500/20 text-blue-400 border-blue-500/30"><i class="fa-solid fa-circle-check text-[8px]"></i>BLUE ✓</span>` : '',
        d.isVerifiedGreen && !d.isVerifiedBlue ? `<span class="badge bg-green-500/20 text-green-400 border-green-500/30"><i class="fa-solid fa-circle-check text-[8px]"></i>GREEN ✓</span>` : '',
        d.isBusiness ? `<span class="badge bg-brand-purple/20 text-brand-purple border-brand-purple/30">BUSINESS</span>` : `<span class="badge bg-slate-700/50 text-slate-400 border-transparent">PERSONAL</span>`,
        d.isMetaBusiness ? `<span class="badge bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><i class="fa-solid fa-certificate text-[8px]"></i>META</span>` : '',
        d.isEnterprise ? `<span class="badge bg-orange-500/20 text-orange-400 border-orange-500/30">OFFICIAL</span>` : ''
    ].filter(Boolean).join('');

    const avatar = d.profilePicture
        ? `<img src="${d.profilePicture}" class="w-12 h-12 rounded-full border-2 ${d.isBusiness ? 'border-brand-purple' : 'border-brand-accent'} flex-shrink-0" onerror="this.outerHTML='<div class=\\'w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-brand-accent\\'>${number.slice(-2)}</div>'">`
        : `<div class="w-12 h-12 rounded-full ${d.isBusiness ? 'bg-brand-purple/20 text-brand-purple' : 'bg-brand-accent/10 text-brand-accent'} flex items-center justify-center text-sm font-bold flex-shrink-0">${number.slice(-2)}</div>`;

    const bizBadge = d.isBusiness ? `<div class="absolute -bottom-1 -right-1 w-5 h-5 bg-brand-purple rounded-full flex items-center justify-center border-2 border-slate-800"><i class="fa-solid fa-briefcase text-white text-[8px]"></i></div>` : '';

    const bizInfo = d.businessInfo ? `
        <div class="mt-2 p-2 bg-slate-900/50 rounded-lg border border-slate-700/50 space-y-1 text-xs text-slate-400">
            ${d.businessInfo.category ? `<p><i class="fa-solid fa-tag text-slate-500 mr-1"></i>${escapeHtml(d.businessInfo.category)}</p>` : ''}
            ${d.businessInfo.description ? `<p class="italic">"${escapeHtml(d.businessInfo.description)}"</p>` : ''}
            ${d.businessInfo.email ? `<p><i class="fa-solid fa-envelope text-slate-500 mr-1"></i>${escapeHtml(d.businessInfo.email)}</p>` : ''}
            ${d.businessInfo.website?.[0] ? `<p><i class="fa-solid fa-globe text-slate-500 mr-1"></i>${escapeHtml(d.businessInfo.website[0])}</p>` : ''}
            ${d.businessInfo.address ? `<p><i class="fa-solid fa-location-dot text-slate-500 mr-1"></i>${escapeHtml(d.businessInfo.address)}</p>` : ''}
            ${d.businessInfo.hasCatalog ? `<p class="text-blue-400 font-semibold"><i class="fa-solid fa-shopping-bag mr-1"></i>${d.businessInfo.catalogCount} Product${d.businessInfo.catalogCount > 1 ? 's' : ''}</p>` : ''}
        </div>` : '';

    const html = `
        <div class="bg-slate-800/50 border ${d.isBusiness ? 'border-brand-purple/40' : 'border-slate-700'} rounded-xl p-4 hover:bg-slate-800 transition-all hover:border-brand-accent/30 group">
            <div class="flex items-start gap-3">
                <div class="relative flex-shrink-0">${avatar}${bizBadge}</div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1 flex-wrap">
                        <span class="text-sm font-semibold text-white">+${escapeHtml(number)}</span>
                        <button onclick="copyNumber('${escapeHtml(number)}')" class="text-slate-500 hover:text-brand-accent transition-colors" title="Copy"><i class="fa-solid fa-copy text-xs"></i></button>
                        ${badges}
                    </div>
                    ${d.pushName ? `<p class="text-xs text-slate-400 mb-1"><i class="fa-solid fa-user text-[10px] mr-1"></i>${escapeHtml(d.pushName)}</p>` : ''}
                    ${d.verifiedName ? `<p class="text-xs text-blue-400 mb-1 font-semibold"><i class="fa-solid fa-certificate text-[10px] mr-1"></i>${escapeHtml(d.verifiedName)}</p>` : ''}
                    ${d.bio
                        ? `<div class="bg-slate-900/50 rounded-lg p-2 mb-2 border border-slate-700/50"><p class="text-xs text-slate-300">${escapeHtml(d.bio)}</p></div>`
                        : `<p class="text-xs text-slate-500 italic mb-2">No bio</p>`}
                    ${bizInfo}
                </div>
            </div>
        </div>`;

    list.insertAdjacentHTML('afterbegin', html);
    if (typeof gsap !== 'undefined') gsap.from(list.firstElementChild, { x: -20, opacity: 0, duration: 0.25 });
}

function stopScan() {
    state.isScanning = false;
    $('btnStart').disabled = false;
    $('btnStart').classList.remove('opacity-50', 'cursor-not-allowed');
    $('btnStop').disabled = true;
    $('btnStop').classList.add('bg-slate-800', 'text-slate-400', 'cursor-not-allowed');
    $('btnStop').classList.remove('bg-red-500/20', 'text-red-400', 'hover:bg-red-500/30');
    $('currentNumber').textContent = 'Completed';
    $('currentNumber').classList.add('text-brand-accent');
}

function updateStats() {
    const s = state.stats;
    [['statTotal', s.total], ['statRegistered', s.registered], ['statBio', s.bio],
     ['statBusiness', s.business], ['statVerified', s.verified], ['statHasPhoto', s.hasPhoto]]
        .forEach(([id, val]) => { const el = $(id); if (el) el.textContent = val; });
}

// ─── Export ────────────────────────────────────────────────────────────────────
function exportResults() {
    if (!state.stats.total) { alert('No data to export'); return; }

    const rows = [['Number', 'Registered', 'Has Bio', 'Business', 'Verified', 'Push Name', 'Bio Text']];
    document.querySelectorAll('#resultsList > div').forEach(el => {
        const num = el.querySelector('.text-white')?.textContent?.replace('+', '') || '';
        const hasBio = !el.querySelector('.italic')?.textContent?.includes('No bio');
        const isBiz = el.textContent.includes('BUSINESS');
        const isVerified = !!el.querySelector('.fa-circle-check');
        const pushName = el.querySelector('.fa-user')?.parentElement?.textContent?.trim() || '';
        const bio = el.querySelector('.text-slate-300')?.textContent?.trim() || '';
        rows.push([num, 'Yes', hasBio ? 'Yes' : 'No', isBiz ? 'Yes' : 'No', isVerified ? 'Yes' : 'No', pushName, `"${bio}"`]);
    });

    const csv = rows.map(r => r.join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
        download: `wa-check-${Date.now()}.csv`
    });
    a.click();
    URL.revokeObjectURL(a.href);
}

// ─── Utilities ─────────────────────────────────────────────────────────────────
function copyNumber(number) {
    navigator.clipboard.writeText(number)
        .then(() => showToast('Copied!'))
        .catch(() => alert('Copy failed'));
}

// ─── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    updateStats();
    checkAuthStatus();
});
