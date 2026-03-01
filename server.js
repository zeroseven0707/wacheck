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

// Middleware - CORS harus sebelum routes
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'whatsapp-checker-secret-key-2024-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // set true jika pakai HTTPS
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 jam
    }
}));

// Serve static files AFTER session
app.use(express.static('.'));

const logger = P({ level: 'silent' });

// Storage untuk users dan WhatsApp sessions
const users = new Map();
const whatsappSessions = new Map();

// Ensure directories exist
const AUTH_SESSIONS_DIR = path.join(__dirname, 'auth_sessions');
if (!fs.existsSync(AUTH_SESSIONS_DIR)) {
    fs.mkdirSync(AUTH_SESSIONS_DIR, { recursive: true });
}

// Load users dari file
const USERS_FILE = path.join(__dirname, 'users.json');

function loadUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
            Object.entries(data).forEach(([username, userData]) => {
                users.set(username, userData);
            });
            console.log(`Loaded ${users.size} users from database`);
        }
    } catch (error) {
        console.error('Error loading users:', error.message);
    }
}

function saveUsers() {
    try {
        const data = Object.fromEntries(users);
        fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('Error saving users:', error.message);
    }
}

loadUsers();

// Middleware untuk cek auth
function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated', code: 'AUTH_REQUIRED' });
    }
    next();
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        sessions: whatsappSessions.size,
        users: users.size
    });
});

// Endpoint register
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        console.log('[REGISTER] Attempt:', username);
        
        // Validation
        if (!username || !password) {
            return res.status(400).json({ 
                error: 'Username and password required',
                code: 'MISSING_FIELDS'
            });
        }

        if (username.length < 3) {
            return res.status(400).json({ 
                error: 'Username must be at least 3 characters',
                code: 'USERNAME_TOO_SHORT'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({ 
                error: 'Password must be at least 6 characters',
                code: 'PASSWORD_TOO_SHORT'
            });
        }

        // Sanitize username
        const sanitizedUsername = username.toLowerCase().trim();
        
        if (users.has(sanitizedUsername)) {
            return res.status(400).json({ 
                error: 'Username already exists',
                code: 'USERNAME_EXISTS'
            });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        const sessionId = uuidv4();
        
        // Save user
        users.set(sanitizedUsername, {
            password: hashedPassword,
            sessionId: sessionId,
            createdAt: new Date().toISOString()
        });
        
        saveUsers();
        
        console.log('[REGISTER] Success:', sanitizedUsername);
        res.json({ 
            success: true, 
            message: 'User registered successfully',
            username: sanitizedUsername
        });
    } catch (error) {
        console.error('[REGISTER] Error:', error);
        res.status(500).json({ 
            error: 'Internal server error', 
            code: 'SERVER_ERROR',
            details: error.message 
        });
    }
});

// Endpoint login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        console.log('[LOGIN] Attempt:', username);
        
        if (!username || !password) {
            return res.status(400).json({ 
                error: 'Username and password required',
                code: 'MISSING_FIELDS'
            });
        }

        const sanitizedUsername = username.toLowerCase().trim();
        const user = users.get(sanitizedUsername);
        
        if (!user) {
            return res.status(401).json({ 
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ 
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }
        
        // Set session
        req.session.userId = sanitizedUsername;
        req.session.sessionId = user.sessionId;
        
        // Save session
        req.session.save((err) => {
            if (err) {
                console.error('[LOGIN] Session save error:', err);
                return res.status(500).json({ 
                    error: 'Failed to create session',
                    code: 'SESSION_ERROR'
                });
            }
            
            console.log('[LOGIN] Success:', sanitizedUsername);
            res.json({ 
                success: true, 
                username: sanitizedUsername,
                message: 'Login successful' 
            });
        });
    } catch (error) {
        console.error('[LOGIN] Error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            code: 'SERVER_ERROR',
            details: error.message 
        });
    }
});

// Endpoint logout
app.post('/api/logout', (req, res) => {
    const username = req.session?.userId;
    
    req.session.destroy((err) => {
        if (err) {
            console.error('[LOGOUT] Error:', err);
            return res.status(500).json({ 
                error: 'Failed to logout',
                code: 'LOGOUT_ERROR'
            });
        }
        
        console.log('[LOGOUT] Success:', username);
        res.json({ success: true });
    });
});

// Endpoint cek auth status
app.get('/api/auth/status', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({ 
            authenticated: true, 
            username: req.session.userId 
        });
    } else {
        res.json({ authenticated: false });
    }
});

// Fungsi untuk connect WhatsApp per session
async function connectWhatsApp(sessionId) {
    try {
        // Check if already exists and connected
        if (whatsappSessions.has(sessionId)) {
            const existing = whatsappSessions.get(sessionId);
            if (existing.isConnected) {
                return existing;
            }
        }
        
        const authPath = path.join(AUTH_SESSIONS_DIR, sessionId);
        if (!fs.existsSync(authPath)) {
            fs.mkdirSync(authPath, { recursive: true });
        }
        
        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger,
            auth: state,
            browser: ['WhatsApp Checker', 'Chrome', '1.0.0'],
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000
        });

        const sessionData = {
            sock: sock,
            qr: null,
            isConnected: false,
            lastUpdate: Date.now()
        };

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                try {
                    sessionData.qr = await QRCode.toDataURL(qr);
                    sessionData.lastUpdate = Date.now();
                    console.log(`[WA] QR generated for session: ${sessionId.substring(0, 8)}...`);
                } catch (error) {
                    console.error('[WA] QR generation error:', error);
                }
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                console.log(`[WA] Connection closed for ${sessionId.substring(0, 8)}... Status: ${statusCode}, Reconnect: ${shouldReconnect}`);
                
                sessionData.isConnected = false;
                sessionData.lastUpdate = Date.now();
                
                if (shouldReconnect) {
                    whatsappSessions.delete(sessionId);
                    setTimeout(() => {
                        console.log(`[WA] Reconnecting session: ${sessionId.substring(0, 8)}...`);
                        connectWhatsApp(sessionId).catch(err => {
                            console.error('[WA] Reconnection failed:', err);
                        });
                    }, 3000);
                } else {
                    whatsappSessions.delete(sessionId);
                }
            } else if (connection === 'open') {
                console.log(`[WA] Connected for session: ${sessionId.substring(0, 8)}...`);
                sessionData.isConnected = true;
                sessionData.qr = null;
                sessionData.lastUpdate = Date.now();
            }
        });

        sock.ev.on('creds.update', saveCreds);
        
        whatsappSessions.set(sessionId, sessionData);
        return sessionData;
    } catch (error) {
        console.error('[WA] Connection error:', error);
        throw error;
    }
}

// Endpoint untuk start connection
app.post('/api/connect', requireAuth, async (req, res) => {
    const sessionId = req.session.sessionId;
    
    try {
        console.log(`[CONNECT] Starting for session: ${sessionId.substring(0, 8)}...`);
        await connectWhatsApp(sessionId);
        res.json({ success: true, message: 'Connection started' });
    } catch (error) {
        console.error('[CONNECT] Error:', error);
        res.status(500).json({ 
            error: 'Failed to start connection',
            code: 'CONNECTION_ERROR',
            details: error.message 
        });
    }
});

// Endpoint untuk mendapatkan QR code
app.get('/api/qr', requireAuth, (req, res) => {
    const sessionId = req.session.sessionId;
    const session = whatsappSessions.get(sessionId);
    
    if (!session) {
        return res.json({ 
            connected: false, 
            qr: null, 
            message: 'Not started' 
        });
    }
    
    if (session.isConnected) {
        res.json({ connected: true, qr: null });
    } else if (session.qr) {
        res.json({ connected: false, qr: session.qr });
    } else {
        res.json({ 
            connected: false, 
            qr: null, 
            message: 'Generating QR...' 
        });
    }
});

// Endpoint untuk cek status koneksi
app.get('/api/status', requireAuth, (req, res) => {
    const sessionId = req.session.sessionId;
    const session = whatsappSessions.get(sessionId);
    
    let deviceInfo = null;
    
    if (session && session.isConnected && session.sock) {
        try {
            // Get device info from Baileys
            const authState = session.sock.authState;
            if (authState && authState.creds) {
                const platform = authState.creds.platform || 'Unknown';
                const deviceModel = authState.creds.deviceModel || 'Unknown Device';
                const phoneNumber = authState.creds.me?.id?.split(':')[0] || 'Unknown';
                
                deviceInfo = {
                    platform: platform,
                    model: deviceModel,
                    number: phoneNumber
                };
            }
        } catch (error) {
            console.error('[STATUS] Error getting device info:', error);
        }
    }
    
    res.json({ 
        connected: session ? session.isConnected : false,
        lastUpdate: session ? session.lastUpdate : null,
        device: deviceInfo
    });
});

// Endpoint untuk cek nomor WhatsApp
app.post('/api/check', requireAuth, async (req, res) => {
    const sessionId = req.session.sessionId;
    const session = whatsappSessions.get(sessionId);
    
    if (!session || !session.isConnected || !session.sock) {
        return res.status(503).json({ 
            error: 'WhatsApp not connected',
            code: 'NOT_CONNECTED'
        });
    }

    const { number } = req.body;
    
    if (!number) {
        return res.status(400).json({ 
            error: 'Number required',
            code: 'MISSING_NUMBER'
        });
    }

    try {
        // Format nomor - remove all non-numeric characters
        let formattedNumber = number.toString().replace(/[^0-9]/g, '');
        
        console.log(`[CHECK] Checking number: ${formattedNumber} (original: ${number})`);
        
        // Validate number - allow international numbers (8-15 digits)
        // Examples:
        // - Indonesia: 628xxx (12-13 digits)
        // - USA: 1xxx (11 digits)
        // - Ivory Coast: 225xxx (12-13 digits)
        // - UK: 44xxx (12-13 digits)
        if (formattedNumber.length < 8 || formattedNumber.length > 15) {
            console.log(`[CHECK] Invalid length: ${formattedNumber.length} digits`);
            return res.json({ 
                registered: false,
                number: number,
                error: `Invalid number length (${formattedNumber.length} digits). Must be 8-15 digits.`
            });
        }

        // Cek apakah nomor terdaftar
        console.log(`[CHECK] Calling onWhatsApp for: ${formattedNumber}`);
        const [result] = await session.sock.onWhatsApp(formattedNumber);
        
        if (!result || !result.exists) {
            console.log(`[CHECK] Number not registered: ${formattedNumber}`);
            return res.json({ 
                registered: false,
                number: number
            });
        }

        console.log(`[CHECK] Number registered: ${formattedNumber}`);
        const jid = result.jid || `${formattedNumber}@s.whatsapp.net`;

        // Initialize response data
        let responseData = {
            registered: true,
            number: number,
            jid: jid,
            bio: '',
            isBusiness: false,
            isVerified: false,
            isMetaBusiness: false,
            businessInfo: null,
            profilePicture: null,
            profilePictureHD: null,
            lastSeen: null,
            pushName: '',
            verifiedName: '',
            isEnterprise: false,
            deviceInfo: null,
            privacySettings: {}
        };

        // 1. Ambil Bio/Status
        try {
            console.log(`[CHECK] Fetching status for ${formattedNumber}`);
            const status = await session.sock.fetchStatus(jid);
            responseData.bio = status?.status || '';
            console.log(`[CHECK] Bio: ${responseData.bio ? 'Found' : 'Empty'}`);
        } catch (e) {
            console.log(`[CHECK] Bio not available: ${e.message}`);
        }

        // 2. Ambil Business Profile (jika ada)
        try {
            console.log(`[CHECK] Fetching business profile for ${formattedNumber}`);
            const businessProfile = await session.sock.getBusinessProfile(jid);
            
            if (businessProfile) {
                responseData.isBusiness = true;
                responseData.isVerified = businessProfile.verified_level === 'verified' || 
                                         businessProfile.verified_level === 'official';
                responseData.isMetaBusiness = responseData.isVerified;
                
                // Extract detailed business info
                responseData.businessInfo = {
                    description: businessProfile.description || '',
                    category: businessProfile.category || '',
                    email: businessProfile.email || '',
                    website: businessProfile.website || [],
                    address: businessProfile.address || '',
                    verifiedLevel: businessProfile.verified_level || 'none',
                    catalogCount: businessProfile.catalog_count || 0,
                    hasCatalog: (businessProfile.catalog_count || 0) > 0
                };
                
                console.log(`[CHECK] Business profile found:`, {
                    category: responseData.businessInfo.category,
                    verified: responseData.isVerified,
                    catalog: responseData.businessInfo.hasCatalog,
                    catalogCount: responseData.businessInfo.catalogCount
                });
            }
        } catch (e) {
            console.log(`[CHECK] Not a business account or profile unavailable: ${e.message}`);
        }

        // 3. Ambil Profile Picture URL (normal & HD)
        try {
            const ppUrl = await session.sock.profilePictureUrl(jid, 'image');
            responseData.profilePicture = ppUrl;
            console.log(`[CHECK] Profile picture: Found`);
            
            // Try to get HD version
            try {
                const ppUrlHD = await session.sock.profilePictureUrl(jid, 'preview');
                responseData.profilePictureHD = ppUrlHD;
            } catch (e) {
                console.log(`[CHECK] HD profile picture: Not available`);
            }
        } catch (e) {
            console.log(`[CHECK] Profile picture: Not available`);
        }

        // 4. Ambil info tambahan dari contact
        try {
            const contact = await session.sock.getContact(jid);
            if (contact) {
                if (contact.notify) responseData.pushName = contact.notify;
                if (contact.verifiedName) responseData.verifiedName = contact.verifiedName;
                if (contact.name) responseData.contactName = contact.name;
            }
        } catch (e) {
            console.log(`[CHECK] Contact info not available`);
        }

        // 5. Cek Enterprise/Official Business Account
        try {
            if (responseData.isBusiness && responseData.businessInfo) {
                responseData.isEnterprise = responseData.businessInfo.verifiedLevel === 'official';
            }
        } catch (e) {
            console.log(`[CHECK] Enterprise check failed`);
        }

        // 6. Ambil informasi presence (online/offline/typing)
        try {
            await session.sock.presenceSubscribe(jid);
            // Note: presence updates come via events, not direct query
        } catch (e) {
            console.log(`[CHECK] Presence subscription failed`);
        }

        // 7. Cek privacy settings (best effort)
        try {
            responseData.privacySettings = {
                profilePicture: responseData.profilePicture ? 'visible' : 'hidden',
                status: responseData.bio ? 'visible' : 'hidden'
            };
        } catch (e) {
            console.log(`[CHECK] Privacy settings check failed`);
        }

        console.log(`[CHECK] Final data for ${formattedNumber}:`, {
            registered: true,
            hasBio: !!responseData.bio,
            isBusiness: responseData.isBusiness,
            isVerified: responseData.isVerified,
            isEnterprise: responseData.isEnterprise,
            hasCatalog: responseData.businessInfo?.hasCatalog || false,
            catalogCount: responseData.businessInfo?.catalogCount || 0,
            hasProfilePicture: !!responseData.profilePicture,
            hasHDPicture: !!responseData.profilePictureHD,
            pushName: responseData.pushName || 'N/A',
            verifiedName: responseData.verifiedName || 'N/A'
        });

        res.json(responseData);

    } catch (error) {
        console.error('[CHECK] Error checking number:', error);
        res.status(500).json({ 
            error: 'Failed to check number',
            code: 'CHECK_ERROR',
            details: error.message 
        });
    }
});

// Endpoint untuk disconnect WhatsApp
app.post('/api/disconnect', requireAuth, async (req, res) => {
    const sessionId = req.session.sessionId;
    const session = whatsappSessions.get(sessionId);
    
    if (session && session.sock) {
        try {
            await session.sock.logout();
            console.log(`[DISCONNECT] Logged out session: ${sessionId.substring(0, 8)}...`);
        } catch (error) {
            console.error('[DISCONNECT] Error during logout:', error);
        }
        whatsappSessions.delete(sessionId);
    }
    
    res.json({ success: true });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('[ERROR]', err);
    res.status(500).json({ 
        error: 'Internal server error',
        code: 'SERVER_ERROR',
        message: err.message 
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Not found',
        code: 'NOT_FOUND',
        path: req.path 
    });
});

// Cleanup on exit
process.on('SIGINT', async () => {
    console.log('\n[SHUTDOWN] Cleaning up...');
    
    for (const [sessionId, session] of whatsappSessions.entries()) {
        if (session.sock) {
            try {
                await session.sock.logout();
                console.log(`[SHUTDOWN] Logged out session: ${sessionId.substring(0, 8)}...`);
            } catch (error) {
                console.error('[SHUTDOWN] Error:', error);
            }
        }
    }
    
    process.exit(0);
});

app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   WhatsApp Bio Checker - Multi-Session ║
╚════════════════════════════════════════╝

Server: http://localhost:${PORT}
Status: Ready ✓
Users: ${users.size}
Sessions: ${whatsappSessions.size}

Press Ctrl+C to stop
    `);
});
