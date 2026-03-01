# Troubleshooting Guide

## Error: "Error connecting to server!"

### Solusi:

1. **Pastikan server berjalan:**
   ```bash
   npm start
   ```
   Harus muncul output:
   ```
   Server running on http://localhost:3000
   Multi-session WhatsApp Checker ready!
   ```

2. **Clear browser cache:**
   - Chrome: Ctrl+Shift+Delete → Clear cache
   - Atau buka Incognito/Private mode

3. **Cek console browser:**
   - Tekan F12 → Tab Console
   - Lihat error message yang muncul
   - Screenshot dan share jika perlu bantuan

4. **Test API manual:**
   - Buka `test-api.html` di browser
   - Klik "Test Register"
   - Jika berhasil, berarti server OK

5. **Restart server:**
   ```bash
   # Stop server (Ctrl+C)
   # Start lagi
   npm start
   ```

6. **Cek port 3000:**
   ```bash
   # Windows
   netstat -ano | findstr :3000
   
   # Jika ada proses lain, kill atau ganti port di server.js
   ```

## Error: "Username already exists"

User sudah terdaftar. Gunakan username lain atau hapus dari `users.json`:

```bash
# Hapus file users.json
del users.json

# Restart server
npm start
```

## Error: "Invalid credentials"

Password salah atau user belum register. Pastikan:
1. Username dan password benar
2. Sudah register terlebih dahulu

## QR Code tidak muncul

1. Pastikan sudah login
2. Klik tombol "Connect WhatsApp"
3. Tunggu 2-3 detik
4. Refresh browser jika perlu

## WhatsApp tidak connect

1. Pastikan HP terhubung internet
2. Buka WhatsApp → Menu → Linked Devices
3. Scan QR code yang muncul di browser
4. Tunggu hingga status jadi "✅ Connected"

## Session hilang setelah restart

Normal. Session tersimpan di memory. Untuk persistent session:
- Session WhatsApp tetap tersimpan di `auth_sessions/`
- Tidak perlu scan QR lagi
- Cukup login dan status akan otomatis connected

## Port sudah digunakan

Ganti port di `server.js`:

```javascript
const PORT = 3001; // Ganti dari 3000 ke 3001
```

Dan di `app.js`:

```javascript
const API_URL = 'http://localhost:3001/api'; // Ganti port
```

## Masih error?

1. Cek log server di terminal
2. Cek console browser (F12)
3. Screenshot error dan share
4. Pastikan Node.js versi 16+:
   ```bash
   node --version
   ```
