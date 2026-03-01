# Quick Start Guide

## 🚀 Installation (5 minutes)

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Server
```bash
npm start
```

You should see:
```
╔════════════════════════════════════════╗
║   WhatsApp Bio Checker - Multi-Session ║
╚════════════════════════════════════════╝

Server: http://localhost:3000
Status: Ready ✓
Users: 0
Sessions: 0
```

### 3. Open Browser
Navigate to: `http://localhost:3000`

## 👤 First Time Setup

### Step 1: Register Account
1. Enter username (min 3 characters)
2. Enter password (min 6 characters)
3. Click "Register"
4. Wait for success message

### Step 2: Login
1. Enter your username
2. Enter your password
3. Click "Login"
4. You'll be redirected to main app

### Step 3: Connect WhatsApp
1. Click "Connect WhatsApp" button
2. Wait for QR code to appear (2-3 seconds)
3. Open WhatsApp on your phone:
   - Android: Menu (⋮) → Linked Devices → Link a Device
   - iOS: Settings → Linked Devices → Link a Device
4. Scan the QR code
5. Wait for "✅ Connected" status

### Step 4: Check Numbers
1. Enter WhatsApp numbers (one per line)
   ```
   6281234567890
   6281234567891
   6281234567892
   ```
2. Click "Mulai Cek"
3. Watch the progress bar
4. See results in real-time

## 📱 Number Format

✅ **Correct:**
```
6281234567890
628123456789
6285123456789
```

❌ **Wrong:**
```
+6281234567890  (no + sign)
081234567890    (must include country code)
62-812-3456-7890 (no dashes)
```

## 🔄 Daily Usage

### Login
1. Open `http://localhost:3000`
2. Enter username & password
3. Click "Login"
4. If WhatsApp was connected before, it will auto-connect

### Check Numbers
1. Make sure status is "✅ Connected"
2. Paste numbers (one per line)
3. Click "Mulai Cek"
4. Wait for results

### Logout
1. Click "Logout" button
2. Confirm logout
3. Your WhatsApp session is saved (no need to re-scan QR)

## 🎯 Tips & Best Practices

### Rate Limiting
- ⚠️ Don't check more than 100 numbers at once
- ⚠️ Wait 1.5 seconds between checks (automatic)
- ⚠️ Don't run multiple checks simultaneously

### Session Management
- ✅ Your WhatsApp session persists after logout
- ✅ No need to re-scan QR every time
- ✅ Session expires after 24 hours of inactivity

### Multiple Users
- ✅ Each user has their own WhatsApp session
- ✅ Multiple users can use the tool simultaneously
- ✅ Each user needs their own WhatsApp number

### Data Privacy
- 🔒 Passwords are hashed (bcrypt)
- 🔒 Sessions are secure (httpOnly cookies)
- 🔒 No data is sent to external servers

## 🐛 Common Issues

### "Error connecting to server"
**Solution:** Make sure server is running
```bash
npm start
```

### QR Code not showing
**Solution:** 
1. Click "Connect WhatsApp" button
2. Wait 2-3 seconds
3. Refresh browser if needed

### "WhatsApp not connected"
**Solution:**
1. Check if status shows "✅ Connected"
2. If not, click "Connect WhatsApp"
3. Scan QR code again

### Numbers not being checked
**Solution:**
1. Check number format (must include country code)
2. Make sure WhatsApp is connected
3. Check console for errors (F12)

## 📊 Understanding Results

### Statistics
- **Total:** Total numbers checked
- **Terdaftar:** Numbers registered on WhatsApp
- **Punya Bio:** Numbers with bio/status
- **Business:** Business accounts
- **Verified:** Verified business accounts
- **Meta Business:** Meta verified business accounts

### Result Display
Only shows interesting results:
- ✅ Numbers with bio
- ✅ Business accounts
- ✅ Verified accounts

Empty results are not displayed to save space.

## 🔧 Advanced

### Change Port
Edit `server.js`:
```javascript
const PORT = 3001; // Change from 3000
```

Edit `app.js`:
```javascript
const API_URL = 'http://localhost:3001/api';
```

### Development Mode
```bash
npm run dev
```
Auto-restarts on file changes.

### Check Server Health
```bash
curl http://localhost:3000/api/health
```

### View Logs
Server logs are displayed in terminal where you ran `npm start`.

## 📞 Support

If you encounter issues:
1. Check `TROUBLESHOOTING.md`
2. Check `CHANGELOG.md` for recent changes
3. Check server logs in terminal
4. Check browser console (F12)

## 🎉 You're Ready!

Start checking WhatsApp numbers now! 🚀
