const express = require('express');
const session = require('express-session');
const cors = require('cors');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const P = require('pino');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const logger = P({ level: 'silent' });

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'wa-checker-secret-change-in-prod',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static('.'));

// ─── Storage ───────────────────────────────────────────────────────────────────

const users = new Map();
const waSessions = new Map(); // sessionId → { sock, qr, isConnected, lastUpdate }

const AUTH_DIR = path.join(__dirname, 'auth_sessions');
const USERS_FILE = path.join(__dirname, 'users.json');

if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

function loadUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
            for (const [k, v] of Object.entries(data)) users.set(k, v);
            console.log(`[DB] Loaded ${users.size} users`);
        }
    } catch (e) {
        console.error('[DB] Load error:', e.message);
    }
}

function saveUsers() {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(Object.fromEntries(users), null, 2));
    } catch (e) {
        console.error('[DB] Save error:', e.message);
    }
}

loadUsers();

// ─── Auth Middleware ───────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
    if (!req.session?.userId) {
        return res.status(401).json({ error: 'Not authenticated', code: 'AUTH_REQUIRED' });
    }
    next();
}

// ─── WhatsApp Session Manager ──────────────────────────────────────────────────

async function connectWhatsApp(sessionId, usePairingCode = false, phoneNumber = null) {
    const existing = waSessions.get(sessionId);
    if (existing?.isConnected) return existing;

    const authPath = path.join(AUTH_DIR, sessionId);
    if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger,
        auth: state,
        browser: ['WA Checker', 'Chrome', '1.0.0'],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 30000,
        keepAliveIntervalMs: 25000,
        retryRequestDelayMs: 250,
        printQRInTerminal: false
    });

    const sd = { sock, qr: null, pairingCode: null, isConnected: false, lastUpdate: Date.now() };
    waSessions.set(sessionId, sd);

    // Request pairing code after socket opens (only if not already registered)
    if (usePairingCode && phoneNumber) {
        sock.ev.on('connection.update', async ({ connection }) => {
            if (connection === 'open') return; // already connected
        });
        // Wait for socket to be ready then request code
        setTimeout(async () => {
            try {
                if (!sock.authState.creds.registered) {
                    const code = await sock.requestPairingCode(phoneNumber);
                    sd.pairingCode = code;
                    sd.lastUpdate = Date.now();
                    console.log(`[WA] Pairing code for ${sessionId.slice(0,8)}: ${code}`);
                }
            } catch (e) {
                console.error('[WA] Pairing code error:', e.message);
            }
        }, 3000);
    }

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            try {
                sd.qr = await QRCode.toDataURL(qr);
                sd.lastUpdate = Date.now();
            } catch (e) { /* ignore */ }
        }

        if (connection === 'open') {
            sd.isConnected = true;
            sd.qr = null;
            sd.lastUpdate = Date.now();
            console.log(`[WA] Connected: ${sessionId.slice(0, 8)}`);
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            sd.isConnected = false;
            sd.lastUpdate = Date.now();
            console.log(`[WA] Closed: ${sessionId.slice(0, 8)} code=${code}`);

            if (code !== DisconnectReason.loggedOut) {
                waSessions.delete(sessionId);
                setTimeout(() => connectWhatsApp(sessionId).catch(() => {}), 5000);
            } else {
                waSessions.delete(sessionId);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
    return sd;
}

// ─── API Routes ────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), users: users.size });
});

// Register
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required', code: 'MISSING_FIELDS' });

    const u = username.toLowerCase().trim();
    if (u.length < 3) return res.status(400).json({ error: 'Username min 3 characters', code: 'USERNAME_TOO_SHORT' });
    if (!/^[a-z0-9_]+$/.test(u)) return res.status(400).json({ error: 'Username: letters, numbers, underscore only', code: 'INVALID_USERNAME' });
    if (password.length < 6) return res.status(400).json({ error: 'Password min 6 characters', code: 'PASSWORD_TOO_SHORT' });
    if (users.has(u)) return res.status(400).json({ error: 'Username already exists', code: 'USERNAME_EXISTS' });

    try {
        const hashed = await bcrypt.hash(password, 10);
        users.set(u, { password: hashed, sessionId: uuidv4(), createdAt: new Date().toISOString() });
        saveUsers();
        res.json({ success: true, username: u });
    } catch (e) {
        res.status(500).json({ error: 'Server error', code: 'SERVER_ERROR' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required', code: 'MISSING_FIELDS' });

    const u = username.toLowerCase().trim();
    const user = users.get(u);
    if (!user) return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });

    try {
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });

        req.session.userId = u;
        req.session.sessionId = user.sessionId;
        req.session.save(err => {
            if (err) return res.status(500).json({ error: 'Session error', code: 'SESSION_ERROR' });
            res.json({ success: true, username: u });
        });
    } catch (e) {
        res.status(500).json({ error: 'Server error', code: 'SERVER_ERROR' });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
});

// Auth status
app.get('/api/auth/status', (req, res) => {
    if (req.session?.userId) {
        res.json({ authenticated: true, username: req.session.userId });
    } else {
        res.json({ authenticated: false });
    }
});

// Connect WhatsApp (requires auth)
app.post('/api/connect', requireAuth, async (req, res) => {
    const sessionId = req.session.sessionId;
    try {
        await connectWhatsApp(sessionId);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to start connection', code: 'CONNECTION_ERROR' });
    }
});

// Get QR code (requires auth)
app.get('/api/qr', requireAuth, (req, res) => {
    const sd = waSessions.get(req.session.sessionId);
    if (!sd) return res.json({ connected: false, qr: null });
    if (sd.isConnected) return res.json({ connected: true, qr: null });
    res.json({ connected: false, qr: sd.qr || null });
});

// Connect with pairing code (requires auth)
app.post('/api/connect-code', requireAuth, async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required', code: 'MISSING_PHONE' });

    const cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.length < 8 || cleaned.length > 15) {
        return res.status(400).json({ error: 'Invalid phone number', code: 'INVALID_PHONE' });
    }

    const sessionId = req.session.sessionId;
    // Disconnect existing session if not connected
    const existing = waSessions.get(sessionId);
    if (existing && !existing.isConnected) {
        try { existing.sock?.end(); } catch (_) {}
        waSessions.delete(sessionId);
    }
    if (existing?.isConnected) return res.json({ success: true, connected: true });

    try {
        await connectWhatsApp(sessionId, true, cleaned);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to start connection', code: 'CONNECTION_ERROR' });
    }
});

// Get pairing code (requires auth)
app.get('/api/pair-code', requireAuth, (req, res) => {
    const sd = waSessions.get(req.session.sessionId);
    if (!sd) return res.json({ connected: false, code: null });
    if (sd.isConnected) return res.json({ connected: true, code: null });
    res.json({ connected: false, code: sd.pairingCode || null });
});

// Connection status (requires auth)
app.get('/api/status', requireAuth, (req, res) => {
    const sd = waSessions.get(req.session.sessionId);
    let device = null;

    if (sd?.isConnected && sd.sock?.authState?.creds) {
        const c = sd.sock.authState.creds;
        device = {
            platform: c.platform || 'Unknown',
            model: c.deviceModel || 'Connected Device',
            number: c.me?.id?.split(':')[0] || ''
        };
    }

    res.json({ connected: sd?.isConnected ?? false, device });
});

// Check number (requires auth + connected)
app.post('/api/check', requireAuth, async (req, res) => {
    const sd = waSessions.get(req.session.sessionId);
    if (!sd?.isConnected || !sd.sock) {
        return res.status(503).json({ error: 'WhatsApp not connected', code: 'NOT_CONNECTED' });
    }

    const { number, fastMode } = req.body;
    if (!number) return res.status(400).json({ error: 'Number required', code: 'MISSING_NUMBER' });

    const formatted = String(number).replace(/\D/g, '');
    if (formatted.length < 8 || formatted.length > 15) {
        return res.json({ registered: false, number, error: `Invalid length (${formatted.length} digits)` });
    }

    try {
        const [result] = await sd.sock.onWhatsApp(formatted);
        if (!result?.exists) return res.json({ registered: false, number });

        const jid = result.jid || `${formatted}@s.whatsapp.net`;
        const data = {
            registered: true,
            number,
            jid,
            bio: '',
            isBusiness: false,
            isVerified: false,
            isVerifiedBlue: false,
            isVerifiedGreen: false,
            isMetaBusiness: false,
            isEnterprise: false,
            businessInfo: null,
            profilePicture: null,
            pushName: ''
        };

        // Bio (skip in fast mode)
        if (!fastMode) {
            try {
                const status = await sd.sock.fetchStatus(jid);
                data.bio = status?.status || '';
            } catch (_) { /* privacy restricted */ }
        }

        // Business profile
        try {
            const bp = await sd.sock.getBusinessProfile(jid);
            if (bp) {
                data.isBusiness = true;
                const vl = bp.verified_level || '';
                data.isVerifiedBlue = vl === 'official';
                data.isVerifiedGreen = vl === 'verified';
                data.isVerified = data.isVerifiedBlue || data.isVerifiedGreen;
                data.businessInfo = {
                    description: bp.description || '',
                    category: bp.category || '',
                    email: bp.email || '',
                    website: bp.website || [],
                    address: bp.address || '',
                    catalogCount: bp.catalog_count || 0,
                    hasCatalog: (bp.catalog_count || 0) > 0
                };
            }
        } catch (_) { /* personal account */ }

        // Profile picture (skip in fast mode)
        if (!fastMode) {
            try {
                data.profilePicture = await sd.sock.profilePictureUrl(jid, 'image');
            } catch (_) { /* hidden */ }
        }

        // Push name from store
        try {
            const contact = sd.sock.store?.contacts?.[jid];
            if (contact?.notify) data.pushName = contact.notify;
        } catch (_) { /* ignore */ }

        res.json(data);
    } catch (e) {
        console.error('[CHECK] Error:', e.message);
        res.status(500).json({ error: 'Check failed', code: 'CHECK_ERROR' });
    }
});

// Disconnect (requires auth)
app.post('/api/disconnect', requireAuth, async (req, res) => {
    const sd = waSessions.get(req.session.sessionId);
    if (sd?.sock) {
        try { await sd.sock.logout(); } catch (_) { /* ignore */ }
        waSessions.delete(req.session.sessionId);
    }
    res.json({ success: true });
});

// ─── Error Handlers ────────────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
    console.error('[ERROR]', err.message);
    res.status(500).json({ error: 'Internal server error', code: 'SERVER_ERROR' });
});

app.use((req, res) => {
    res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
});

// ─── Graceful Shutdown ─────────────────────────────────────────────────────────

process.on('SIGINT', async () => {
    console.log('\n[SHUTDOWN] Cleaning up...');
    for (const [id, sd] of waSessions) {
        try { await sd.sock?.logout(); } catch (_) { /* ignore */ }
        console.log(`[SHUTDOWN] Closed: ${id.slice(0, 8)}`);
    }
    process.exit(0);
});

// ─── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`\n[SERVER] Running at http://localhost:${PORT} | Users: ${users.size}\n`);
});
