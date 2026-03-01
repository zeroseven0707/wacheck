# WhatsApp Bio Checker - Multi-Session

Web-based tool untuk mengecek informasi WhatsApp dengan sistem multi-session. Setiap user memiliki session WhatsApp sendiri.

## Fitur

- 🔐 Multi-user authentication (Login/Register)
- 📱 Multi-session WhatsApp (setiap user punya session sendiri)
- ✅ Cek nomor terdaftar WhatsApp (REAL)
- 📝 Deteksi bio/status (REAL)
- 🏢 Deteksi akun bisnis (REAL)
- ✅ Deteksi Meta Verified (REAL)
- 💼 Deteksi Meta Business (REAL)
- 📊 Statistik real-time
- ⚡ Progress bar
- 🎨 UI modern dan responsif
- 🔐 Session-based authentication

## Instalasi

1. Install Node.js (versi 16 atau lebih baru)

2. Install dependencies:
```bash
npm install
```

## Cara Menggunakan

1. Jalankan server:
```bash
npm start
```

2. Buka browser dan akses:
```
http://localhost:3000
```

3. Register akun baru:
   - Masukkan username dan password (min 6 karakter)
   - Klik "Register"
   - Login dengan akun yang baru dibuat

4. Connect WhatsApp:
   - Klik tombol "Connect WhatsApp"
   - Scan QR code yang muncul dengan WhatsApp Anda
   - Buka WhatsApp di HP → Menu (⋮) → Linked Devices → Link a Device → Scan QR

5. Setelah status hijau "✅ Connected", masukkan nomor dan mulai cek!

## Multi-Session

Setiap user yang register akan mendapatkan:
- Session ID unik
- Folder auth tersendiri di `auth_sessions/[session-id]/`
- WhatsApp connection terpisah
- Data session tersimpan, tidak perlu scan QR berulang

Contoh:
- User "alice" → session: `abc-123` → auth: `auth_sessions/abc-123/`
- User "bob" → session: `def-456` → auth: `auth_sessions/def-456/`

## Format Nomor

Gunakan format internasional tanpa tanda +:
- ✅ Benar: `6281234567890`
- ✅ Benar: `628123456789`
- ❌ Salah: `+6281234567890`
- ❌ Salah: `081234567890`

## Teknologi

- **Backend**: Node.js + Express
- **Auth**: express-session + bcrypt
- **WhatsApp API**: Baileys (Multi-device)
- **Frontend**: Vanilla JavaScript
- **QR Code**: qrcode library
- **Storage**: JSON file (users.json)

## Struktur File

```
whatsapp-checker/
├── server.js           # Backend server dengan multi-session
├── app.js              # Frontend logic dengan auth
├── index.html          # UI dengan login/register
├── package.json        # Dependencies
├── users.json          # User database (auto-generated)
├── auth_sessions/      # WhatsApp sessions per user
│   ├── [session-id-1]/ # Session user 1
│   └── [session-id-2]/ # Session user 2
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/register` - Register user baru
- `POST /api/login` - Login user
- `POST /api/logout` - Logout user
- `GET /api/auth/status` - Cek status auth

### WhatsApp
- `POST /api/connect` - Start WhatsApp connection
- `GET /api/qr` - Get QR code
- `GET /api/status` - Cek status koneksi
- `POST /api/check` - Cek nomor WhatsApp
- `POST /api/disconnect` - Disconnect WhatsApp

## Catatan Penting

⚠️ **Penting untuk diketahui:**

1. **Multi-Session**: Setiap user punya WhatsApp session sendiri
2. **Rate Limiting**: Jangan cek terlalu banyak nomor sekaligus (max 50-100 per sesi)
3. **Delay**: Ada delay 1 detik antar pengecekan untuk menghindari ban
4. **Session Storage**: Session tersimpan di folder `auth_sessions/[session-id]/`
5. **User Data**: User data tersimpan di `users.json`
6. **Privacy**: Bio yang private tidak bisa diambil
7. **Business Info**: Hanya akun bisnis yang punya info business profile

## Troubleshooting

**QR Code tidak muncul:**
- Klik tombol "Connect WhatsApp"
- Refresh browser
- Cek apakah sudah login

**Connection closed:**
- Cek koneksi internet
- Restart server
- Login ulang dan scan QR code

**Error saat cek nomor:**
- Pastikan format nomor benar (dengan kode negara)
- Cek apakah WhatsApp masih terhubung (status hijau)
- Pastikan sudah login

**Lupa password:**
- Hapus user dari `users.json`
- Register ulang dengan username yang sama

## Development

Untuk development dengan auto-reload:
```bash
npm run dev
```

## Security Notes

- Password di-hash dengan bcrypt
- Session menggunakan express-session
- Setiap user punya session WhatsApp terpisah
- Cookie-based authentication
- Untuk production, gunakan HTTPS dan secure cookie

## License

MIT

## Disclaimer

Tool ini hanya untuk keperluan edukasi dan testing. Gunakan dengan bijak dan patuhi Terms of Service WhatsApp.

