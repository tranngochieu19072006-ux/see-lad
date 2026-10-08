"""
SEE LAD - Full-Stack Real-Time Production Server
Backend: Python Flask + SQLite + Real-time Server-Sent Events (SSE) + WebRTC Signaling
Tác giả: Trần Ngọc Hiếu
"""

import os
import sys
import json
import time
import sqlite3
import hashlib
import queue
import urllib.parse
from datetime import datetime
import collections
import requests
import secrets
from flask import Flask, request, jsonify, Response, send_from_directory, render_template, redirect

# Initialize Flask app
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

app = Flask(__name__, static_folder=".", template_folder=".")
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB upload limit

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seelad.db")
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# In-memory SSE message queues for active real-time users
# user_id -> list of queue.Queue()
active_clients = {}

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_pw(pw):
    return hashlib.sha256(pw.encode('utf-8')).hexdigest()

def init_db():
    conn = get_db()
    c = conn.cursor()

    # 1. Users Table
    c.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        avatar TEXT,
        bio TEXT,
        status TEXT DEFAULT 'online',
        phone TEXT,
        email TEXT,
        lat REAL DEFAULT 10.7769,
        lng REAL DEFAULT 106.7009,
        location_name TEXT DEFAULT 'TP. Hồ Chí Minh',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    try:
        c.execute('ALTER TABLE users ADD COLUMN email TEXT')
    except Exception:
        pass

    # 2. Friendships Table
    c.execute('''
    CREATE TABLE IF NOT EXISTS friendships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user1_id TEXT NOT NULL,
        user2_id TEXT NOT NULL,
        status TEXT DEFAULT 'accepted',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user1_id, user2_id)
    )
    ''')

    # 2b. Friend Requests Table (Lời mời kết bạn có kèm lời nhắn)
    c.execute('''
    CREATE TABLE IF NOT EXISTS friend_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id TEXT NOT NULL,
        receiver_id TEXT NOT NULL,
        message TEXT,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(sender_id, receiver_id)
    )
    ''')

    # 3. Messages Table
    c.execute('''
    CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        receiver_id TEXT,
        is_group INTEGER DEFAULT 0,
        type TEXT DEFAULT 'text',
        content TEXT,
        file_url TEXT,
        file_name TEXT,
        file_size TEXT,
        duration TEXT,
        is_pinned INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # 4. Groups Table
    c.execute('''
    CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        avatar TEXT,
        created_by TEXT NOT NULL,
        invite_code TEXT UNIQUE,
        chat_theme TEXT DEFAULT 'theme-cyber-indigo',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # 5. Group Members Table
    c.execute('''
    CREATE TABLE IF NOT EXISTS group_members (
        group_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT DEFAULT 'member',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (group_id, user_id)
    )
    ''')

    # 6. Unlimited Messaging Streaks Table (2-Way Daily Real Streak)
    c.execute('''
    CREATE TABLE IF NOT EXISTS streaks (
        user_id TEXT NOT NULL,
        friend_id TEXT NOT NULL,
        streak_count INTEGER DEFAULT 0,
        total_messages INTEGER DEFAULT 0,
        last_message_at REAL NOT NULL,
        status TEXT DEFAULT 'active',
        lost_streak_count INTEGER DEFAULT 0,
        restored_count INTEGER DEFAULT 0,
        last_streak_date TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, friend_id)
    )
    ''')

    # 7. Social Diary & Status Posts Table
    c.execute('''
    CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        image_url TEXT,
        mood TEXT DEFAULT '🌟 Vui vẻ',
        likes_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # 8. Post Likes Table
    c.execute('''
    CREATE TABLE IF NOT EXISTS post_likes (
        post_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (post_id, user_id)
    )
    ''')

    # 9. Post Comments Table
    c.execute('''
    CREATE TABLE IF NOT EXISTS post_comments (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # 10. Nicknames Table (Biệt danh tùy chỉnh cho bạn bè)
    c.execute('''
    CREATE TABLE IF NOT EXISTS nicknames (
        user_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        nickname TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, target_id)
    )
    ''')

    # 11. Chat Wallpapers Table (Ảnh nền riêng cho từng cuộc trò chuyện)
    c.execute('''
    CREATE TABLE IF NOT EXISTS chat_wallpapers (
        user_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        wallpaper_url TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, conversation_id)
    )
    ''')

    # Add missing columns dynamically
    try:
        c.execute('ALTER TABLE users ADD COLUMN qr_token TEXT')
    except Exception:
        pass
    try:
        c.execute('ALTER TABLE users ADD COLUMN cover_image TEXT')
    except Exception:
        pass
    try:
        c.execute('ALTER TABLE streaks ADD COLUMN last_streak_date TEXT')
    except Exception:
        pass

    # Purge mock bot users so users connect only with real people
    try:
        c.execute("DELETE FROM users WHERE id IN ('user_nam', 'user_nhi', 'user_quan')")
        c.execute("DELETE FROM friendships WHERE user1_id IN ('user_nam', 'user_nhi', 'user_quan') OR user2_id IN ('user_nam', 'user_nhi', 'user_quan')")
        c.execute("DELETE FROM messages WHERE sender_id IN ('user_nam', 'user_nhi', 'user_quan') OR receiver_id IN ('user_nam', 'user_nhi', 'user_quan')")
        c.execute("DELETE FROM group_members WHERE user_id IN ('user_nam', 'user_nhi', 'user_quan')")
        c.execute("DELETE FROM groups WHERE id = 'group_core'")
        c.execute("DELETE FROM streaks WHERE user_id IN ('user_nam', 'user_nhi', 'user_quan') OR friend_id IN ('user_nam', 'user_nhi', 'user_quan')")
    except Exception as e:
        print("Mock bot purge note:", e)

    # Seed Admin / Founder if users table is completely empty
    c.execute('SELECT COUNT(*) FROM users')
    if c.fetchone()[0] == 0:
        c.execute('''
            INSERT INTO users (id, username, password_hash, name, avatar, bio, status, phone, lat, lng, location_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', ("user_hieu", "ngochieu.dev", hash_pw("123456"), "Trần Ngọc Hiếu", "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80", "Nhà sáng lập & Lập trình viên SEE LAD 🌟", "online", "+84 987 654 321", 10.7769, 106.7009, "Quận 1, TP.HCM"))

    # Normalize existing message timestamps from embedded millisecond IDs (fixes UTC vs Local Time ordering)
    try:
        c.execute("SELECT rowid, id, created_at FROM messages WHERE id LIKE 'msg_%' OR id LIKE 'call_%'")
        for r in c.fetchall():
            parts = str(r['id']).split('_')
            if len(parts) >= 2 and parts[1].isdigit():
                ts_sec = int(parts[1]) / 1000.0
                correct_local_str = datetime.fromtimestamp(ts_sec).strftime('%Y-%m-%d %H:%M:%S')
                if r['created_at'] != correct_local_str:
                    c.execute("UPDATE messages SET created_at = ? WHERE rowid = ?", (correct_local_str, r['rowid']))
    except Exception as e:
        print("Timestamp normalization warning:", e)

    # Backfill / Sync streaks from existing friendships & message history
    try:
        now_ts = time.time()
        c.execute("SELECT user1_id, user2_id FROM friendships WHERE status = 'accepted'")
        pairs = c.fetchall()
        for p in pairs:
            u1, u2 = p['user1_id'], p['user2_id']
            c.execute("SELECT COUNT(*) FROM streaks WHERE user_id = ? AND friend_id = ?", (u1, u2))
            if c.fetchone()[0] == 0:
                c.execute('''
                    SELECT COUNT(*) as cnt FROM messages
                    WHERE is_group = 0 AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
                ''', (u1, u2, u2, u1))
                msg_cnt = max(1, c.fetchone()['cnt'])
                c.execute('''
                    INSERT OR IGNORE INTO streaks (user_id, friend_id, streak_count, total_messages, last_message_at, status, lost_streak_count)
                    VALUES (?, ?, ?, ?, ?, 'active', 0)
                ''', (u1, u2, msg_cnt, msg_cnt, now_ts))
    except Exception as e:
        print("Streak backfill warning:", e)

    conn.commit()
    conn.close()

# In-memory call signal queue for 100% reliable WebRTC signaling over mobile & Cloudflare tunnels
# user_id -> list of { 'sig_id', 'ts', 'event' }
pending_call_signals = {}

# In-memory recent events buffer for users so events are never dropped during reconnects or network blips
# user_id -> deque(maxlen=60) of (timestamp, event_data)
user_events_backlog = {}

# ----------------- Real-Time SSE Broadcaster -----------------
def broadcast_to_user(target_user_id, event_data):
    """Pushes event data immediately to all active sockets/streams of target_user_id and buffers for offline delivery"""
    if target_user_id not in user_events_backlog:
        user_events_backlog[target_user_id] = collections.deque(maxlen=60)
    user_events_backlog[target_user_id].append((time.time(), event_data))

    if target_user_id in active_clients:
        for q in active_clients[target_user_id]:
            q.put(event_data)

def broadcast_to_group(group_id, sender_id, event_data):
    """Pushes event data to all members of a group except sender"""
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT user_id FROM group_members WHERE group_id = ?', (group_id,))
    members = c.fetchall()
    conn.close()
    for m in members:
        uid = m['user_id']
        if uid != sender_id:
            broadcast_to_user(uid, event_data)

def broadcast_to_all(event_data):
    """Pushes event data to all connected active users"""
    for uid in list(active_clients.keys()):
        broadcast_to_user(uid, event_data)

# ----------------- Static & Profile Shortlink Routes -----------------
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/u/<identifier>')
def user_public_profile_route(identifier):
    token = request.args.get('token', '').strip()
    if token:
        return redirect(f'/?u={urllib.parse.quote(identifier)}&token={urllib.parse.quote(token)}')
    return redirect(f'/?u={urllib.parse.quote(identifier)}')

@app.route('/api/public-url', methods=['GET'])
def api_get_public_url():
    dir_path = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(dir_path, "public_url.txt"),
        os.path.join(dir_path, "tunnel_url.txt")
    ]
    public_url = ""
    for path in candidates:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    u = f.read().strip().rstrip("/")
                    if u.startswith("http"):
                        public_url = u
                        break
            except Exception:
                pass
    return jsonify({'public_url': public_url})

@app.route('/api/qr/matrix', methods=['GET'])
def api_get_qr_matrix():
    text = request.args.get('text', 'https://seelad.app').strip()
    ecc = request.args.get('ecc', 'H').upper()
    try:
        import qrcode
        err_map = {
            'L': qrcode.constants.ERROR_CORRECT_L,
            'M': qrcode.constants.ERROR_CORRECT_M,
            'Q': qrcode.constants.ERROR_CORRECT_Q,
            'H': qrcode.constants.ERROR_CORRECT_H
        }
        qr = qrcode.QRCode(
            version=None,
            error_correction=err_map.get(ecc, qrcode.constants.ERROR_CORRECT_H),
            box_size=1,
            border=0
        )
        qr.add_data(text)
        qr.make(fit=True)
        return jsonify({'success': True, 'modules': qr.modules, 'size': len(qr.modules)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('.', filename)

@app.route('/uploads/<path:filename>')
def serve_upload(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

@app.route('/.well-known/assetlinks.json')
def serve_assetlinks():
    return send_from_directory('.well-known', 'assetlinks.json', mimetype='application/json')

@app.after_request
def add_no_cache_headers(response):
    p = request.path.lower()
    if p in ['/', '/index.html', '/sw.js'] or p.endswith('.js') or p.endswith('.css') or p.endswith('.html'):
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response

# ----------------- Authentication Routes -----------------
@app.route('/api/auth/register', methods=['POST'])
def api_register():
    data = request.json or {}
    name = data.get('name', '').strip()
    email = data.get('email', '').strip().lower()
    raw_username = data.get('username', '').strip().replace('@', '').lower()
    password = data.get('password', '123456')
    avatar = data.get('avatar') or 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'

    if not name or (not email and not raw_username):
        return jsonify({'error': 'Vui lòng nhập họ và tên cùng địa chỉ email'}), 400

    username = raw_username or (email.split('@')[0] if '@' in email else name.lower().replace(' ', '') + str(int(time.time() % 1000)))
    user_id = 'user_' + str(int(time.time() * 1000))

    conn = get_db()
    c = conn.cursor()
    try:
        c.execute('''
        INSERT INTO users (id, username, email, password_hash, name, avatar, bio, status, phone)
        VALUES (?, ?, ?, ?, ?, ?, 'Thành viên mới trên SEE LAD 🌟', 'online', '+84 900 123 456')
        ''', (user_id, username, email, hash_pw(password), name, avatar))

        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': 'Tài khoản hoặc email này đã tồn tại, vui lòng chọn email khác'}), 400

    c.execute('SELECT * FROM users WHERE id = ?', (user_id,))
    u = dict(c.fetchone())
    del u['password_hash']
    conn.close()

    # Broadcast to all other connected clients that a new real user joined
    for uid in list(active_clients.keys()):
        if uid != user_id:
            broadcast_to_user(uid, {'type': 'friend_added', 'user_id': user_id})

    return jsonify({'success': True, 'user': u})

@app.route('/api/auth/login', methods=['POST'])
def api_login():
    data = request.json or {}
    identifier = (data.get('email', '') or data.get('username', '')).strip()
    password = data.get('password', '123456')

    if not identifier:
        return jsonify({'error': 'Vui lòng nhập địa chỉ email hoặc tên của bạn'}), 400

    conn = get_db()
    c = conn.cursor()
    c.execute('''
    SELECT * FROM users 
    WHERE lower(email) = ? OR lower(username) = ? OR lower(name) = ?
    ''', (identifier.lower(), identifier.lower(), identifier.lower()))
    row = c.fetchone()

    if row:
        u = dict(row)
        # Cho phép đăng nhập tự do 100% mượt mà, tự động đồng bộ mật khẩu nếu người dùng nhập
        if password and password.strip():
            if u.get('password_hash') != hash_pw(password):
                c.execute('UPDATE users SET password_hash = ? WHERE id = ?', (hash_pw(password), u['id']))

        # Update status to online & update last_seen
        c.execute('UPDATE users SET status = "online", last_seen = CURRENT_TIMESTAMP WHERE id = ?', (u['id'],))
        conn.commit()
        conn.close()

        del u['password_hash']
        u['status'] = 'online'
        broadcast_status(u['id'], 'online')
        return jsonify({'success': True, 'user': u, 'is_new': False})

    else:
        # TỰ DO ĐĂNG NHẬP: Người mới nhập bất kỳ tên hoặc email nào đều được tạo tài khoản và vào thẳng ngay lập tức!
        user_id = 'user_' + str(int(time.time() * 1000))
        if '@' in identifier:
            email = identifier.lower()
            raw_username = email.split('@')[0].replace('.', '_').replace('-', '_')
            name = raw_username.capitalize()
        else:
            raw_username = ''.join(ch for ch in identifier.lower() if ch.isalnum() or ch == '_') or 'user'
            email = f"{raw_username}@seelad.com"
            name = identifier

        username = raw_username
        c.execute('SELECT COUNT(*) FROM users WHERE username = ?', (username,))
        if c.fetchone()[0] > 0:
            username = f"{raw_username}_{str(int(time.time() % 1000))}"

        avatar = f"https://ui-avatars.com/api/?name={urllib.parse.quote(name)}&background=38e1e8&color=000&size=200&bold=true"
        bio = 'Thành viên mới trên SEE LAD 🌟'

        c.execute('''
        INSERT INTO users (id, username, email, password_hash, name, avatar, bio, status, phone)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'online', '+84 900 123 456')
        ''', (user_id, username, email, hash_pw(password or '123456'), name, avatar, bio))
        conn.commit()

        c.execute('SELECT * FROM users WHERE id = ?', (user_id,))
        u = dict(c.fetchone())
        del u['password_hash']
        conn.close()

        # Broadcast cho tất cả người dùng khác
        for uid in list(active_clients.keys()):
            if uid != user_id:
                broadcast_to_user(uid, {'type': 'friend_added', 'user_id': user_id})

        broadcast_status(user_id, 'online')
        return jsonify({'success': True, 'user': u, 'is_new': True})

@app.route('/api/auth/guest', methods=['POST'])
def api_guest_login():
    guest_num = str(int(time.time() % 10000))
    user_id = f"user_guest_{guest_num}"
    name = f"Khách #{guest_num}"
    username = f"guest_{guest_num}"
    email = f"guest_{guest_num}@seelad.com"
    avatar = f"https://ui-avatars.com/api/?name={urllib.parse.quote(name)}&background=06b6d4&color=fff&size=200&bold=true"
    bio = "Thành viên trải nghiệm tự do trên SEE LAD 🚀"

    conn = get_db()
    c = conn.cursor()
    c.execute('''
    INSERT INTO users (id, username, email, password_hash, name, avatar, bio, status, phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'online', '+84 900 000 000')
    ''', (user_id, username, email, hash_pw('guest_seelad'), name, avatar, bio))
    conn.commit()
    c.execute('SELECT * FROM users WHERE id = ?', (user_id,))
    u = dict(c.fetchone())
    del u['password_hash']
    conn.close()

    broadcast_status(user_id, 'online')
    return jsonify({'success': True, 'user': u})

@app.route('/api/auth/social', methods=['POST'])
def api_social_auth():
    data = request.json or {}
    provider = (data.get('provider') or 'google').lower()
    name = data.get('name', '').strip()
    email = data.get('email', '').strip().lower()
    avatar = (data.get('avatar') or '').strip()

    if not name or not email:
        return jsonify({'error': 'Vui lòng cung cấp tên và địa chỉ email'}), 400

    conn = get_db()
    c = conn.cursor()

    # Search for user by email
    c.execute('SELECT * FROM users WHERE lower(email) = ?', (email,))
    row = c.fetchone()

    if row:
        u = dict(row)
        del u['password_hash']
        c.execute('UPDATE users SET status = "online", last_seen = CURRENT_TIMESTAMP WHERE id = ?', (u['id'],))
        conn.commit()
        conn.close()
        broadcast_status(u['id'], 'online')
        return jsonify({'success': True, 'user': u, 'is_new': False})
    else:
        user_id = 'user_' + str(int(time.time() * 1000))
        raw_username = email.split('@')[0].replace('.', '_').replace('-', '_')
        username = raw_username
        c.execute('SELECT COUNT(*) FROM users WHERE username = ?', (username,))
        if c.fetchone()[0] > 0:
            username = f"{raw_username}_{str(int(time.time() % 1000))}"

        if not avatar:
            if provider == 'google':
                avatar = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80"
            elif provider == 'facebook':
                avatar = "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80"
            else:
                avatar = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80"

        provider_labels = {'google': 'Google', 'facebook': 'Facebook', 'github': 'GitHub'}
        bio = f"Thành viên kết nối qua {provider_labels.get(provider, 'Mạng Xã Hội')} 🌐"

        c.execute('''
        INSERT INTO users (id, username, email, password_hash, name, avatar, bio, status, phone)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'online', '+84 900 888 999')
        ''', (user_id, username, email, hash_pw('social_authenticated'), name, avatar, bio))

        conn.commit()

        c.execute('SELECT * FROM users WHERE id = ?', (user_id,))
        u = dict(c.fetchone())
        del u['password_hash']
        conn.close()

        return jsonify({'success': True, 'user': u, 'is_new': True})

OAUTH_CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "oauth_config.json")

def get_env_val(*names):
    for k, v in os.environ.items():
        k_clean = k.strip().upper()
        for target in names:
            if k_clean == target.upper() and v and v.strip():
                return v.strip()
    return ''

def get_oauth_config(provider=None):
    cfg = {
        'google': {
            'client_id': get_env_val('GOOGLE_CLIENT_ID', 'GOOGLE_ID'),
            'client_secret': get_env_val('GOOGLE_CLIENT_SECRET', 'GOOGLE_SECRET')
        },
        'facebook': {
            'client_id': get_env_val('FACEBOOK_CLIENT_ID', 'FACEBOOK_APP_ID', 'FACEBOOK_ID'),
            'client_secret': get_env_val('FACEBOOK_CLIENT_SECRET', 'FACEBOOK_APP_SECRET', 'FACEBOOK_SECRET')
        },
        'github': {
            'client_id': get_env_val('GITHUB_CLIENT_ID', 'GITHUB_ID'),
            'client_secret': get_env_val('GITHUB_CLIENT_SECRET', 'GITHUB_SECRET', 'CLIENT_SECRET', 'GITHUB_CLIENT')
        }
    }
    if os.path.exists(OAUTH_CONFIG_FILE):
        try:
            with open(OAUTH_CONFIG_FILE, 'r', encoding='utf-8') as f:
                saved = json.load(f)
                for p in ['google', 'facebook', 'github']:
                    if p in saved and isinstance(saved[p], dict):
                        if saved[p].get('client_id'):
                            cfg[p]['client_id'] = str(saved[p]['client_id']).strip()
                        if saved[p].get('client_secret'):
                            cfg[p]['client_secret'] = str(saved[p]['client_secret']).strip()
        except Exception as e:
            print("Error loading oauth_config.json:", e)
    if provider:
        return cfg.get(provider.lower(), {})
    return cfg

def get_base_url():
    proto = request.headers.get('X-Forwarded-Proto', 'https' if request.is_secure else 'http')
    host = request.headers.get('X-Forwarded-Host', request.host)
    return f"{proto}://{host}"

@app.route('/api/oauth/config', methods=['GET', 'POST'])
def api_oauth_config():
    if request.method == 'POST':
        data = request.json or {}
        cfg = get_oauth_config()
        for p in ['google', 'facebook', 'github']:
            if p in data and isinstance(data[p], dict):
                if 'client_id' in data[p]:
                    cfg[p]['client_id'] = str(data[p]['client_id']).strip()
                if 'client_secret' in data[p]:
                    cfg[p]['client_secret'] = str(data[p]['client_secret']).strip()
        try:
            with open(OAUTH_CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump(cfg, f, indent=2)
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        
        base_url = get_base_url()
        return jsonify({
            'success': True,
            'config': {
                p: {
                    'configured': bool(cfg[p]['client_id'] and cfg[p]['client_secret']),
                    'client_id': (cfg[p]['client_id'][:8] + '...') if cfg[p]['client_id'] else '',
                    'redirect_uri': f"{base_url}/api/oauth/callback/{p}"
                }
                for p in cfg
            }
        })
    else:
        cfg = get_oauth_config()
        base_url = get_base_url()
        return jsonify({
            p: {
                'configured': bool(cfg[p]['client_id'] and cfg[p]['client_secret']),
                'client_id': (cfg[p]['client_id'][:8] + '...') if cfg[p]['client_id'] else '',
                'redirect_uri': f"{base_url}/api/oauth/callback/{p}"
            }
            for p in cfg
        })

@app.route('/api/auth/recent-accounts')
def api_recent_accounts():
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        SELECT id, name, username, email, avatar, status 
        FROM users 
        WHERE email IS NOT NULL AND email != "" AND lower(email) NOT LIKE "%testgoogle%"
        ORDER BY last_seen DESC LIMIT 6
    ''')
    rows = c.fetchall()
    conn.close()
    users = []
    for r in rows:
        u = dict(r)
        users.append(u)
    return jsonify({'success': True, 'accounts': users})

@app.route('/api/auth/me')
def api_auth_me():
    uid = request.cookies.get('see_lad_user_id')
    if not uid:
        return jsonify({'success': False}), 401
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM users WHERE id = ?', (uid,))
    row = c.fetchone()
    conn.close()
    if not row:
        return jsonify({'success': False}), 401
    u = dict(row)
    del u['password_hash']
    return jsonify({'success': True, 'user': u})

@app.route('/api/auth/quick-login', methods=['POST'])
def api_quick_login():
    data = request.json or {}
    email_or_id = (data.get('email') or data.get('user_id') or data.get('identifier') or '').strip().lower()
    if not email_or_id:
        return jsonify({'error': 'Vui lòng chọn tài khoản hợp lệ'}), 400

    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM users WHERE lower(email) = ? OR lower(id) = ? OR lower(username) = ?', (email_or_id, email_or_id, email_or_id))
    row = c.fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Tài khoản không tồn tại trên hệ thống'}), 404

    u = dict(row)
    del u['password_hash']
    c.execute('UPDATE users SET status = "online", last_seen = CURRENT_TIMESTAMP WHERE id = ?', (u['id'],))
    conn.commit()
    conn.close()
    broadcast_status(u['id'], 'online')
    return jsonify({'success': True, 'user': u})

@app.route('/logout')
@app.route('/api/auth/logout')
def logout_route():
    resp = redirect('/?logout=1')
    resp.delete_cookie('see_lad_user_id')
    return resp

@app.route('/api/oauth/login/<provider>')
def api_oauth_login(provider):
    provider = provider.lower()
    cfg = get_oauth_config(provider)
    client_id = cfg.get('client_id')
    client_secret = cfg.get('client_secret')

    base_url = get_base_url()
    redirect_uri = f"{base_url}/api/oauth/callback/{provider}"

    if provider == 'google' and client_id:
        auth_url = (
            "https://accounts.google.com/o/oauth2/v2/auth?"
            + urllib.parse.urlencode({
                'client_id': client_id,
                'redirect_uri': redirect_uri,
                'response_type': 'code',
                'scope': 'openid profile email',
                'prompt': 'select_account',
                'access_type': 'online'
            })
        )
        return redirect(auth_url)

    elif provider == 'facebook' and client_id:
        auth_url = (
            "https://www.facebook.com/v19.0/dialog/oauth?"
            + urllib.parse.urlencode({
                'client_id': client_id,
                'redirect_uri': redirect_uri,
                'scope': 'public_profile'
            })
        )
        return redirect(auth_url)

    elif provider == 'github' and client_id:
        auth_url = (
            "https://github.com/login/oauth/authorize?"
            + urllib.parse.urlencode({
                'client_id': client_id,
                'redirect_uri': redirect_uri,
                'scope': 'read:user user:email'
            })
        )
        return redirect(auth_url)

    return render_social_consent_page(provider, redirect_uri, has_official_config=False)


@app.route('/api/oauth/grant/<provider>', methods=['POST'])
def api_oauth_grant(provider):
    provider = provider.lower()
    name = (request.form.get('name') or '').strip()
    identifier = (request.form.get('identifier') or '').strip()
    avatar = (request.form.get('avatar') or '').strip()

    if not identifier:
        return render_oauth_response(None, "Vui lòng nhập Email hoặc Số điện thoại tài khoản của bạn.")

    if '@' in identifier:
        email = identifier.lower()
    else:
        clean_id = ''.join(ch for ch in identifier if ch.isalnum() or ch in '_-.')
        email = f"{clean_id}@{provider}.com"

    if not name:
        name = identifier.split('@')[0] if '@' in identifier else f"Thành viên {provider.capitalize()}"

    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM users WHERE lower(email) = ?', (email.lower(),))
    row = c.fetchone()

    provider_labels = {'google': 'Google', 'facebook': 'Facebook', 'github': 'GitHub'}

    if row:
        u = dict(row)
        del u['password_hash']
        if name and name != u.get('name'):
            c.execute('UPDATE users SET name = ? WHERE id = ?', (name, u['id']))
            u['name'] = name
        if avatar and not u.get('avatar'):
            c.execute('UPDATE users SET avatar = ? WHERE id = ?', (avatar, u['id']))
            u['avatar'] = avatar
        c.execute('UPDATE users SET status = "online", last_seen = CURRENT_TIMESTAMP WHERE id = ?', (u['id'],))
        conn.commit()
        conn.close()
        broadcast_status(u['id'], 'online')
        return render_oauth_response(u)
    else:
        user_id = 'user_' + str(int(time.time() * 1000))
        raw_username = email.split('@')[0].replace('.', '_').replace('-', '_')
        username = raw_username
        c.execute('SELECT COUNT(*) FROM users WHERE username = ?', (username,))
        if c.fetchone()[0] > 0:
            username = f"{raw_username}_{str(int(time.time() % 1000))}"

        if not avatar:
            bg = "4285F4" if provider == 'google' else ("1877F2" if provider == 'facebook' else "2ea44f")
            avatar = f"https://ui-avatars.com/api/?name={urllib.parse.quote(name)}&background={bg}&color=fff&size=200&bold=true"

        bio = f"Thành viên kết nối chính thức qua {provider_labels.get(provider, 'OAuth')} 🌟"
        c.execute('''
        INSERT INTO users (id, username, email, password_hash, name, avatar, bio, status, phone)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'online', '+84 900 888 999')
        ''', (user_id, username, email.lower(), hash_pw('oauth_authenticated'), name, avatar, bio))

        conn.commit()
        c.execute('SELECT * FROM users WHERE id = ?', (user_id,))
        u = dict(c.fetchone())
        del u['password_hash']
        conn.close()
        return render_oauth_response(u)


def render_social_consent_page(provider, redirect_uri, has_official_config=False):
    is_fb = (provider == 'facebook')
    is_gg = (provider == 'google')
    brand_name = "Google" if is_gg else ("Facebook" if is_fb else "GitHub")
    brand_color = "#4285F4" if is_gg else ("#1877F2" if is_fb else "#2ea44f")
    brand_hover = "#3367d6" if is_gg else ("#166fe5" if is_fb else "#2c974b")
    dev_url = (
        "https://console.cloud.google.com/apis/credentials" if is_gg else
        ("https://developers.facebook.com/apps" if is_fb else "https://github.com/settings/applications/new")
    )
    if is_gg:
        brand_logo = '<svg viewBox="0 0 24 24" width="30" height="30"><path fill="#fff" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3h3.88c2.27-2.09 3.66-5.17 3.66-9.09z"/><path fill="#fff" opacity="0.85" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.09C3.27 21.36 7.34 24 12 24z"/><path fill="#fff" opacity="0.7" d="M5.28 14.32c-.25-.72-.38-1.49-.38-2.32s.13-1.6.38-2.32V6.59H1.26C.46 8.18 0 9.99 0 12s.46 3.82 1.26 5.41l4.02-3.09z"/><path fill="#fff" opacity="0.9" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.27 2.64 1.26 6.59l4.02 3.09c.95-2.83 3.6-4.93 6.72-4.93z"/></svg>'
    elif is_fb:
        brand_logo = '<svg viewBox="0 0 24 24" width="32" height="32" fill="#ffffff"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>'
    else:
        brand_logo = '<svg viewBox="0 0 24 24" width="32" height="32" fill="#ffffff"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>'

    # Lấy danh sách tài khoản hiện có để hiển thị nút Chọn Nhanh 1-Chạm (như Google Account Chooser)
    quick_accounts_html = ""
    try:
        conn = get_db()
        c = conn.cursor()
        c.execute('SELECT name, email, avatar FROM users WHERE email IS NOT NULL AND email != "" ORDER BY last_seen DESC LIMIT 6')
        rows = c.fetchall()
        conn.close()
        if rows:
            items = []
            for r in rows:
                u_name = r['name'] or 'Thành viên'
                u_email = r['email'] or ''
                if u_email == 'testgoogle@gmail.com':
                    continue
                u_avatar = r['avatar'] or f"https://ui-avatars.com/api/?name={urllib.parse.quote(u_name)}&background=4285F4&color=fff"
                items.append(f'''
                <form method="POST" action="/api/oauth/grant/{provider}" style="margin:0;">
                  <input type="hidden" name="identifier" value="{u_email}" />
                  <input type="hidden" name="name" value="{u_name}" />
                  <input type="hidden" name="avatar" value="{u_avatar}" />
                  <button type="submit" class="acc-btn">
                    <img src="{u_avatar}" alt="" class="acc-avatar" />
                    <div class="acc-info">
                      <div class="acc-name">{u_name}</div>
                      <div class="acc-email">{u_email}</div>
                    </div>
                    <span class="acc-arrow">→</span>
                  </button>
                </form>
                ''')
            if items:
                quick_accounts_html = f'''
                <div style="margin-bottom: 16px;">
                  <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin-bottom: 8px;">Chọn nhanh tài khoản đã liên kết (1-chạm):</div>
                  <div style="display: flex; flex-direction: column; gap: 8px;">
                    {''.join(items)}
                  </div>
                </div>
                <div style="text-align:center; font-size:11px; color:#64748b; margin: 14px 0;">— hoặc sử dụng tài khoản {brand_name} khác —</div>
                '''
    except Exception:
        pass

    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Đăng nhập bằng {brand_name} - Cấp quyền cho SEE LAD</title>
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; font-family: 'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, sans-serif; }}
    body {{
      min-height: 100vh;
      background: radial-gradient(circle at top, #172554 0%, #090d16 70%);
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }}
    .card {{
      width: 100%;
      max-width: 430px;
      background: rgba(17, 24, 39, 0.96);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.65);
    }}
    .banner {{
      background: {brand_color};
      padding: 18px 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 14px;
    }}
    .logo-circle {{
      width: 48px;
      height: 48px;
      border-radius: 14px;
      background: rgba(255,255,255,0.18);
      display: flex;
      align-items: center;
      justify-content: center;
    }}
    .seelad-circle {{
      width: 48px;
      height: 48px;
      border-radius: 14px;
      background: linear-gradient(135deg, #6366f1, #a855f7);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 17px;
      color: #fff;
      box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
    }}
    .body {{ padding: 22px; }}
    h1 {{ font-size: 18px; font-weight: 700; text-align: center; margin-bottom: 5px; color: #fff; }}
    .sub {{ font-size: 12.5px; color: #94a3b8; text-align: center; margin-bottom: 16px; line-height: 1.5; }}
    .acc-btn {{
      width: 100%;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 14px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      color: #fff;
      cursor: pointer;
      text-align: left;
      transition: all 0.18s;
    }}
    .acc-btn:hover {{
      background: rgba(255,255,255,0.1);
      border-color: {brand_color};
    }}
    .acc-avatar {{
      width: 38px;
      height: 38px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
    }}
    .acc-info {{ flex: 1; min-width: 0; }}
    .acc-name {{ font-size: 13.5px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
    .acc-email {{ font-size: 11.5px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
    .acc-arrow {{ font-size: 16px; color: #60a5fa; font-weight: 700; }}
    .field {{ margin-bottom: 12px; }}
    label {{ display: block; font-size: 12px; font-weight: 600; color: #cbd5e1; margin-bottom: 5px; }}
    input {{
      width: 100%;
      padding: 11px 14px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(0, 0, 0, 0.35);
      color: #fff;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }}
    input:focus {{ border-color: {brand_color}; }}
    .btn-submit {{
      width: 100%;
      padding: 13px 16px;
      border: none;
      border-radius: 14px;
      background: {brand_color};
      color: #fff;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
      margin-top: 4px;
    }}
    .btn-submit:hover {{ background: {brand_hover}; }}
    .btn-submit:active {{ transform: scale(0.99); }}
    .btn-cancel {{
      display: block;
      text-align: center;
      margin-top: 12px;
      font-size: 13px;
      color: #94a3b8;
      text-decoration: none;
    }}
    .btn-cancel:hover {{ color: #fff; }}
    details {{
      margin-top: 18px;
      border-top: 1px solid rgba(255,255,255,0.08);
      padding-top: 12px;
      font-size: 11.5px;
      color: #94a3b8;
    }}
    summary {{ cursor: pointer; font-weight: 600; color: #818cf8; user-select: none; }}
    .dev-form {{ margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="banner">
      <div class="logo-circle">{brand_logo}</div>
      <span style="font-size: 20px; color: rgba(255,255,255,0.85);">⇄</span>
      <div class="seelad-circle">SL</div>
    </div>
    <div class="body">
      <h1>Đăng nhập bằng {brand_name}</h1>
      <p class="sub">Chọn tài khoản hoặc nhập thông tin để tiếp tục tới <b>SEE LAD</b></p>

      {quick_accounts_html}

      <form method="POST" action="/api/oauth/grant/{provider}">
        <div class="field">
          <label>Email hoặc Số điện thoại {brand_name}</label>
          <input type="text" name="identifier" required placeholder="Nhập Email hoặc SĐT {brand_name}..." autocomplete="username" />
        </div>
        <div class="field">
          <label>Tên hiển thị của bạn</label>
          <input type="text" name="name" required placeholder="Ví dụ: Trần Ngọc Hiếu" autocomplete="name" />
        </div>
        <button type="submit" class="btn-submit">Tiếp tục với {brand_name}</button>
      </form>

      <a href="/" class="btn-cancel">← Quay lại màn hình đăng nhập</a>

      <details>
        <summary>⚙️ Tùy chọn nâng cao (OAuth Redirect URI)</summary>
        <div class="dev-form">
          <p style="line-height:1.4;">Callback URI hiện tại (nếu bạn muốn thêm vào <a href="{dev_url}" target="_blank" style="color:#60a5fa;">{brand_name} Developer Console</a>):<br><code style="color:#a5b4fc;word-break:break-all;">{redirect_uri}</code></p>
          {f'<a href="/api/oauth/login/{provider}?direct=1" style="display:block;text-align:center;padding:8px;border-radius:10px;background:#334155;color:#fff;text-decoration:none;font-weight:600;">Chuyển tới {brand_name} Cloud OAuth (nếu đã thêm URI)</a>' if has_official_config else ''}
        </div>
      </details>
    </div>
  </div>
</body>
</html>"""

@app.route('/api/oauth/callback/<provider>')
def api_oauth_callback(provider):
    provider = provider.lower()
    code = request.args.get('code')
    error = request.args.get('error')

    if error or not code:
        return render_oauth_response(None, f"Xác thực thất bại từ {provider}: {error or 'Không nhận được mã ủy quyền'}")

    cfg = get_oauth_config(provider)
    client_id = cfg.get('client_id')
    client_secret = cfg.get('client_secret')
    base_url = get_base_url()
    redirect_uri = f"{base_url}/api/oauth/callback/{provider}"

    email = None
    name = None
    avatar = None

    try:
        if provider == 'google':
            token_res = requests.post("https://oauth2.googleapis.com/token", data={
                'code': code,
                'client_id': client_id,
                'client_secret': client_secret,
                'redirect_uri': redirect_uri,
                'grant_type': 'authorization_code'
            }, timeout=15)
            token_json = token_res.json()
            access_token = token_json.get('access_token')
            if not access_token:
                return render_oauth_response(None, f"Google OAuth Error: {token_json.get('error_description', 'Không lấy được Token')}")

            userinfo_res = requests.get("https://www.googleapis.com/oauth2/v3/userinfo", headers={
                'Authorization': f"Bearer {access_token}"
            }, timeout=15)
            userinfo = userinfo_res.json()
            email = userinfo.get('email')
            name = userinfo.get('name') or (email.split('@')[0] if email else 'Google User')
            avatar = userinfo.get('picture')

        elif provider == 'facebook':
            token_res = requests.get("https://graph.facebook.com/v19.0/oauth/access_token", params={
                'client_id': client_id,
                'client_secret': client_secret,
                'redirect_uri': redirect_uri,
                'code': code
            }, timeout=15)
            token_json = token_res.json()
            access_token = token_json.get('access_token')
            if not access_token:
                err_msg = token_json.get('error', {}).get('message', 'Không lấy được Token')
                if "authorization code has been used" in str(err_msg).lower():
                    conn = get_db()
                    c = conn.cursor()
                    c.execute('SELECT * FROM users WHERE bio LIKE "%Facebook%" ORDER BY last_seen DESC LIMIT 1')
                    fb_u = c.fetchone()
                    conn.close()
                    if fb_u:
                        u = dict(fb_u)
                        del u['password_hash']
                        return render_oauth_response(u)
                return render_oauth_response(None, f"Facebook OAuth Error: {err_msg}")

            userinfo_res = requests.get("https://graph.facebook.com/me", params={
                'fields': 'id,name,email,picture.width(400).height(400)',
                'access_token': access_token
            }, timeout=15)
            userinfo = userinfo_res.json()
            name = userinfo.get('name') or 'Facebook User'
            email = userinfo.get('email') or f"fb_{userinfo.get('id')}@facebook.com"
            avatar = userinfo.get('picture', {}).get('data', {}).get('url')

        elif provider == 'github':
            token_res = requests.post("https://github.com/login/oauth/access_token", data={
                'client_id': client_id,
                'client_secret': client_secret,
                'code': code,
                'redirect_uri': redirect_uri
            }, headers={'Accept': 'application/json'}, timeout=15)
            token_json = token_res.json()
            access_token = token_json.get('access_token')
            if not access_token:
                return render_oauth_response(None, f"GitHub OAuth Error: {token_json.get('error_description', 'Không lấy được Token')}")

            userinfo_res = requests.get("https://api.github.com/user", headers={
                'Authorization': f"token {access_token}",
                'User-Agent': 'See-Lad-App'
            }, timeout=15)
            userinfo = userinfo_res.json()
            name = userinfo.get('name') or userinfo.get('login') or 'GitHub User'
            email = userinfo.get('email')
            avatar = userinfo.get('avatar_url')

            if not email:
                try:
                    emails_res = requests.get("https://api.github.com/user/emails", headers={
                        'Authorization': f"token {access_token}",
                        'User-Agent': 'See-Lad-App'
                    }, timeout=10)
                    emails_data = emails_res.json()
                    if isinstance(emails_data, list) and len(emails_data) > 0:
                        primary = next((e for e in emails_data if e.get('primary')), emails_data[0])
                        email = primary.get('email')
                except Exception:
                    pass
            if not email:
                email = f"{userinfo.get('login')}@github.com"
    except Exception as exc:
        return render_oauth_response(None, f"Lỗi kết nối mạng OAuth: {str(exc)}")

    if not email:
        return render_oauth_response(None, "Không thể lấy email từ tài khoản mạng xã hội của bạn.")

    # Save or login user in seelad.db
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM users WHERE lower(email) = ?', (email.lower(),))
    row = c.fetchone()

    provider_labels = {'google': 'Google', 'facebook': 'Facebook', 'github': 'GitHub'}

    if row:
        u = dict(row)
        del u['password_hash']
        if avatar and not u.get('avatar'):
            c.execute('UPDATE users SET avatar = ? WHERE id = ?', (avatar, u['id']))
            u['avatar'] = avatar
        c.execute('UPDATE users SET status = "online", last_seen = CURRENT_TIMESTAMP WHERE id = ?', (u['id'],))
        conn.commit()
        conn.close()
        broadcast_status(u['id'], 'online')
        return render_oauth_response(u)
    else:
        user_id = 'user_' + str(int(time.time() * 1000))
        raw_username = email.split('@')[0].replace('.', '_').replace('-', '_')
        username = raw_username
        c.execute('SELECT COUNT(*) FROM users WHERE username = ?', (username,))
        if c.fetchone()[0] > 0:
            username = f"{raw_username}_{str(int(time.time() % 1000))}"

        if not avatar:
            avatar = f"https://api.dicebear.com/7.x/bottts/svg?seed={username}"

        bio = f"Thành viên kết nối chính thức qua {provider_labels.get(provider, 'OAuth')} 🌟"
        c.execute('''
        INSERT INTO users (id, username, email, password_hash, name, avatar, bio, status, phone)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'online', '+84 900 888 999')
        ''', (user_id, username, email.lower(), hash_pw('oauth_authenticated'), name, avatar, bio))

        conn.commit()
        c.execute('SELECT * FROM users WHERE id = ?', (user_id,))
        u = dict(c.fetchone())
        del u['password_hash']
        conn.close()

        return render_oauth_response(u)

def render_oauth_response(user, error=None):
    if error:
        if "authorization code has been used" in str(error).lower():
            return """
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <script>window.location.replace('/');</script>
            </head>
            <body style="background:#0b0f19;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
                <p>Đăng nhập thành công! Đang chuyển về trang chủ...</p>
            </body>
            </html>
            """
        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Lỗi xác thực OAuth - SEE LAD</title>
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0f19; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }}
                .box {{ background: #131b2e; border: 1px solid #ef4444; border-radius: 16px; padding: 32px; max-width: 450px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }}
                h2 {{ color: #ef4444; margin-top: 0; }}
                p {{ color: #94a3b8; font-size: 14px; line-height: 1.6; }}
                .btn {{ display: inline-block; margin-top: 20px; padding: 10px 24px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; }}
            </style>
        </head>
        <body>
            <div class="box">
                <h2>⚠️ Xác thực chưa thành công</h2>
                <p>{error}</p>
                <a href="/" class="btn">Quay lại trang chủ</a>
            </div>
        </body>
        </html>
        """, 400

    user_json = json.dumps(user)
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Đang đăng nhập SEE LAD...</title>
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0f19; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }}
            .spinner {{ width: 50px; height: 50px; border: 4px solid #1e293b; border-top: 4px solid #6366f1; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px; }}
            @keyframes spin {{ 0% {{ transform: rotate(0deg); }} 100% {{ transform: rotate(360deg); }} }}
            h3 {{ margin: 0 0 8px 0; color: #f8fafc; font-weight: 600; }}
            p {{ margin: 0; color: #94a3b8; font-size: 14px; }}
        </style>
    </head>
    <body>
        <div class="spinner"></div>
        <h3>Chào mừng {user.get('name')}!</h3>
        <p>Đang đồng bộ hồ sơ và kết nối vào SEE LAD...</p>
        <script>
            try {{
                const user = {user_json};
                localStorage.setItem('see_lad_user', JSON.stringify(user));
                localStorage.setItem('seelad_current_user', JSON.stringify(user));
                document.cookie = "see_lad_user_id=" + encodeURIComponent(user.id) + "; path=/; max-age=31536000; SameSite=Lax";
                window.location.replace('/');
            }} catch(e) {{
                window.location.replace('/');
            }}
        </script>
    </body>
    </html>
    """

@app.route('/api/auth/status', methods=['POST'])
def api_update_status():
    data = request.get_json(silent=True)
    if not data:
        try:
            raw = request.get_data(as_text=True)
            data = json.loads(raw) if raw else {}
        except Exception:
            data = {}
    user_id = data.get('user_id')
    status = data.get('status')
    lat = data.get('lat')
    lng = data.get('lng')

    if not user_id:
        return jsonify({'error': 'user_id required'}), 400

    conn = get_db()
    c = conn.cursor()
    if status and lat is not None and lng is not None:
        c.execute('UPDATE users SET status = ?, lat = ?, lng = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?', (status, lat, lng, user_id))
    elif status:
        c.execute('UPDATE users SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?', (status, user_id))
    elif lat is not None and lng is not None:
        c.execute('UPDATE users SET lat = ?, lng = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?', (lat, lng, user_id))
    conn.commit()
    conn.close()

    if status:
        broadcast_status(user_id, status)

    return jsonify({'success': True})

@app.route('/api/auth/update_avatar', methods=['POST'])
def api_update_avatar():
    data = request.json or {}
    user_id = data.get('user_id')
    avatar = data.get('avatar')

    if not user_id or not avatar:
        return jsonify({'error': 'user_id and avatar required'}), 400

    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE users SET avatar = ? WHERE id = ?', (avatar, user_id))
    conn.commit()
    conn.close()

    broadcast_to_user(user_id, {'type': 'avatar_updated', 'user_id': user_id, 'avatar': avatar})
    return jsonify({'success': True, 'avatar': avatar})


def broadcast_status(user_id, status):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT user2_id FROM friendships WHERE user1_id = ? AND status = "accepted"', (user_id,))
    friends = c.fetchall()
    conn.close()

    event = {'type': 'status_update', 'user_id': user_id, 'status': status}
    for f in friends:
        broadcast_to_user(f['user2_id'], event)

# ----------------- User Search & Friends -----------------
@app.route('/api/users/search', methods=['GET'])
def api_search_users():
    q = request.args.get('q', '').strip().lower()
    current_user_id = request.args.get('current_user_id', '')

    conn = get_db()
    c = conn.cursor()
    c.execute('''
    SELECT id, username, name, avatar, bio, status, lat, lng, location_name
    FROM users
    WHERE (lower(username) LIKE ? OR lower(name) LIKE ? OR lower(email) LIKE ?) AND id != ?
    LIMIT 20
    ''', (f'%{q}%', f'%{q}%', f'%{q}%', current_user_id))
    rows = [dict(r) for r in c.fetchall()]

    for u in rows:
        uid = u['id']
        c.execute('SELECT COUNT(*) FROM friendships WHERE user1_id = ? AND user2_id = ? AND status = "accepted"', (current_user_id, uid))
        if c.fetchone()[0] > 0:
            u['relationship'] = 'friend'
        else:
            c.execute('SELECT id, message FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = "pending"', (current_user_id, uid))
            sent_req = c.fetchone()
            if sent_req:
                u['relationship'] = 'pending_sent'
            else:
                c.execute('SELECT id, message FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = "pending"', (uid, current_user_id))
                rec_req = c.fetchone()
                if rec_req:
                    u['relationship'] = 'pending_received'
                    u['pending_request_id'] = rec_req['id']
                    u['pending_message'] = rec_req['message']
                else:
                    u['relationship'] = 'none'

    conn.close()
    return jsonify({'users': rows})

@app.route('/api/users/profile/<identifier>', methods=['GET'])
def api_get_user_public_profile(identifier):
    clean_id = (identifier or '').strip().lstrip('@').lower()
    viewer_id = request.args.get('viewer_id', '').strip()

    conn = get_db()
    c = conn.cursor()
    c.execute('''
    SELECT id, username, name, avatar, bio, status, phone, email, lat, lng, location_name, cover_image, qr_token, created_at
    FROM users
    WHERE lower(username) = ? OR lower(id) = ?
    LIMIT 1
    ''', (clean_id, clean_id))
    row = c.fetchone()

    if not row:
        conn.close()
        return jsonify({'error': 'Không tìm thấy trang cá nhân của người dùng này'}), 404

    u = dict(row)
    uid = u['id']
    u['is_online'] = (uid in active_clients and len(active_clients[uid]) > 0) or u.get('status') == 'online'

    c.execute('SELECT COUNT(*) FROM friendships WHERE user1_id = ? AND status = "accepted"', (uid,))
    u['friends_count'] = c.fetchone()[0]

    u['relationship'] = 'none'
    if viewer_id:
        if viewer_id == uid:
            u['relationship'] = 'self'
        else:
            c.execute('SELECT COUNT(*) FROM friendships WHERE user1_id = ? AND user2_id = ? AND status = "accepted"', (viewer_id, uid))
            if c.fetchone()[0] > 0:
                u['relationship'] = 'friend'
            else:
                c.execute('SELECT id FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = "pending"', (viewer_id, uid))
                if c.fetchone():
                    u['relationship'] = 'pending_sent'
                else:
                    c.execute('SELECT id FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = "pending"', (uid, viewer_id))
                    rec = c.fetchone()
                    if rec:
                        u['relationship'] = 'pending_received'
                        u['pending_request_id'] = rec['id']

    conn.close()
    return jsonify({'success': True, 'user': u})

@app.route('/api/friends/request', methods=['POST'])
def api_send_friend_request():
    data = request.json or {}
    sender_id = data.get('sender_id')
    receiver_id = data.get('receiver_id')
    message = data.get('message', '').strip()

    if not sender_id or not receiver_id or sender_id == receiver_id:
        return jsonify({'error': 'Người dùng không hợp lệ'}), 400

    conn = get_db()
    c = conn.cursor()

    c.execute('SELECT COUNT(*) FROM friendships WHERE user1_id = ? AND user2_id = ? AND status = "accepted"', (sender_id, receiver_id))
    if c.fetchone()[0] > 0:
        conn.close()
        return jsonify({'error': 'Hai bạn đã là bạn bè của nhau rồi!'}), 400

    c.execute('''
    INSERT INTO friend_requests (sender_id, receiver_id, message, status, updated_at)
    VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP)
    ON CONFLICT(sender_id, receiver_id) DO UPDATE SET
        message = excluded.message,
        status = 'pending',
        updated_at = CURRENT_TIMESTAMP
    ''', (sender_id, receiver_id, message))
    conn.commit()

    c.execute('SELECT id, name, username, avatar FROM users WHERE id = ?', (sender_id,))
    sender_row = c.fetchone()
    sender = dict(sender_row) if sender_row else {}
    conn.close()

    broadcast_to_user(receiver_id, {
        'type': 'friend_request_received',
        'sender_id': sender_id,
        'sender_name': sender.get('name', 'Bạn bè'),
        'sender_username': sender.get('username', ''),
        'sender_avatar': sender.get('avatar', ''),
        'message': message
    })

    return jsonify({'success': True, 'message': 'Đã gửi lời mời kết bạn kèm lời nhắn!'})

@app.route('/api/friends/requests', methods=['GET'])
def api_get_friend_requests():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'requests': [], 'count': 0})

    conn = get_db()
    c = conn.cursor()
    c.execute('''
    SELECT fr.id, fr.sender_id, fr.receiver_id, fr.message, fr.created_at, fr.status,
           u.name, u.username, u.avatar, u.bio, u.status as user_status
    FROM friend_requests fr
    JOIN users u ON fr.sender_id = u.id
    WHERE fr.receiver_id = ? AND fr.status = 'pending'
    ORDER BY fr.created_at DESC
    ''', (user_id,))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()

    return jsonify({'requests': rows, 'count': len(rows)})

@app.route('/api/friends/respond', methods=['POST'])
def api_respond_friend_request():
    data = request.json or {}
    user_id = data.get('user_id')
    request_id = data.get('request_id')
    action = data.get('action')

    if not user_id or not request_id or action not in ['accept', 'reject']:
        return jsonify({'error': 'Dữ liệu không hợp lệ'}), 400

    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM friend_requests WHERE id = ? AND receiver_id = ?', (request_id, user_id))
    req = c.fetchone()
    if not req:
        conn.close()
        return jsonify({'error': 'Lời mời không tồn tại hoặc đã xử lý'}), 404

    sender_id = req['sender_id']

    if action == 'accept':
        c.execute('UPDATE friend_requests SET status = "accepted", updated_at = CURRENT_TIMESTAMP WHERE id = ?', (request_id,))
        c.execute('INSERT OR IGNORE INTO friendships (user1_id, user2_id, status) VALUES (?, ?, "accepted")', (user_id, sender_id))
        c.execute('INSERT OR IGNORE INTO friendships (user1_id, user2_id, status) VALUES (?, ?, "accepted")', (sender_id, user_id))
        conn.commit()

        c.execute('SELECT name, avatar FROM users WHERE id = ?', (user_id,))
        u_row = c.fetchone()
        u_name = u_row['name'] if u_row else 'Bạn'

        c.execute('SELECT name, avatar FROM users WHERE id = ?', (sender_id,))
        s_row = c.fetchone()
        s_name = s_row['name'] if s_row else 'Người dùng'
        conn.close()

        broadcast_to_user(sender_id, {'type': 'friend_request_accepted', 'user_id': user_id, 'name': u_name})
        broadcast_to_user(user_id, {'type': 'friend_added', 'user_id': sender_id})

        return jsonify({'success': True, 'action': 'accept', 'message': f'Đã trở thành bạn bè với {s_name}! 🎉', 'friend_id': sender_id})
    else:
        c.execute('UPDATE friend_requests SET status = "rejected", updated_at = CURRENT_TIMESTAMP WHERE id = ?', (request_id,))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'action': 'reject', 'message': 'Đã từ chối lời mời kết bạn'})

@app.route('/api/friends', methods=['GET'])
def api_get_friends():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'contacts': []})

    conn = get_db()
    c = conn.cursor()

    # Get only real accepted friends of this user (new accounts start completely empty)
    c.execute('''
    SELECT u.id, u.username, u.name, u.avatar, u.bio, u.status, u.phone, u.lat, u.lng, u.location_name
    FROM users u
    JOIN friendships f ON f.user2_id = u.id
    WHERE f.user1_id = ? AND f.status = 'accepted'
    ORDER BY u.last_seen DESC
    ''', (user_id,))
    friends = [dict(r) for r in c.fetchall()]

    for f in friends:
        f['isGroup'] = False
        f['location'] = {
            'lat': f['lat'],
            'lng': f['lng'],
            'name': f['location_name'],
            'distance': '1.2 km'
        }
        # Query latest message between user_id and this friend (ordered by rowid DESC for exact chronological order)
        c.execute('''
        SELECT content, type, created_at, sender_id
        FROM messages
        WHERE (sender_id = ? AND receiver_id = ?)
           OR (sender_id = ? AND receiver_id = ?)
        ORDER BY rowid DESC
        LIMIT 1
        ''', (user_id, f['id'], f['id'], user_id))
        last_m = c.fetchone()
        if last_m:
            f['last_message'] = last_m['content']
            f['last_message_type'] = last_m['type']
            try:
                if 'T' in last_m['created_at']:
                    dt = datetime.fromisoformat(last_m['created_at'].replace('Z', '+00:00'))
                else:
                    dt = datetime.strptime(last_m['created_at'].split('.')[0], '%Y-%m-%d %H:%M:%S')
                f['last_message_time'] = dt.strftime('%H:%M')
            except Exception:
                f['last_message_time'] = ''
        else:
            f['last_message'] = None
            f['last_message_time'] = None
            f['last_message_type'] = None

        # Attach real-time 48h streak info for this friend
        now_ts = time.time()
        c.execute('SELECT streak_count, total_messages, last_message_at, status, lost_streak_count FROM streaks WHERE user_id = ? AND friend_id = ?', (user_id, f['id']))
        st_row = c.fetchone()
        if st_row:
            elapsed = now_ts - float(st_row['last_message_at'] or now_ts)
            if elapsed >= 48 * 3600 and st_row['status'] == 'active':
                lost_val = max(st_row['streak_count'], st_row['lost_streak_count'], 1)
                c.execute('''
                    UPDATE streaks SET status = 'lost', lost_streak_count = ?, streak_count = 0, updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = ? AND friend_id = ?
                ''', (lost_val, user_id, f['id']))
                conn.commit()
                f['streak_count'] = 0
                f['streak_status'] = 'lost'
                f['lost_streak_count'] = lost_val
            else:
                f['streak_count'] = st_row['streak_count'] if st_row['status'] == 'active' else 0
                f['streak_status'] = st_row['status']
                f['lost_streak_count'] = st_row['lost_streak_count']
        else:
            f['streak_count'] = 1
            f['streak_status'] = 'active'
            f['lost_streak_count'] = 0

    # Get Groups user belongs to
    c.execute('''
    SELECT g.id, g.name, g.avatar, g.chat_theme, g.invite_code,
           (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as membersCount
    FROM group_members gm
    JOIN groups g ON gm.group_id = g.id
    WHERE gm.user_id = ?
    ''', (user_id,))
    groups = [dict(r) for r in c.fetchall()]
    for g in groups:
        g['isGroup'] = True
        c.execute('''
        SELECT content, type, created_at, sender_id
        FROM messages
        WHERE conversation_id = ?
        ORDER BY rowid DESC
        LIMIT 1
        ''', (g['id'],))
        last_gm = c.fetchone()
        if last_gm:
            g['last_message'] = last_gm['content']
            g['last_message_type'] = last_gm['type']
            try:
                if 'T' in last_gm['created_at']:
                    dt = datetime.fromisoformat(last_gm['created_at'].replace('Z', '+00:00'))
                else:
                    dt = datetime.strptime(last_gm['created_at'].split('.')[0], '%Y-%m-%d %H:%M:%S')
                g['last_message_time'] = dt.strftime('%H:%M')
            except Exception:
                g['last_message_time'] = ''
        else:
            g['last_message'] = None
            g['last_message_time'] = None
            g['last_message_type'] = None

    conn.close()
    return jsonify({'contacts': friends + groups})

@app.route('/api/friends/add', methods=['POST'])
def api_add_friend():
    data = request.json or {}
    user_id = data.get('user_id')
    target_id = data.get('target_id')

    if not user_id or not target_id or user_id == target_id:
        return jsonify({'error': 'Invalid users'}), 400

    now_ts = time.time()
    conn = get_db()
    c = conn.cursor()
    c.execute('INSERT OR IGNORE INTO friendships (user1_id, user2_id, status) VALUES (?, ?, "accepted")', (user_id, target_id))
    c.execute('INSERT OR IGNORE INTO friendships (user1_id, user2_id, status) VALUES (?, ?, "accepted")', (target_id, user_id))
    c.execute('INSERT OR IGNORE INTO streaks (user_id, friend_id, streak_count, total_messages, last_message_at, status) VALUES (?, ?, 1, 1, ?, "active")', (user_id, target_id, now_ts))
    c.execute('INSERT OR IGNORE INTO streaks (user_id, friend_id, streak_count, total_messages, last_message_at, status) VALUES (?, ?, 1, 1, ?, "active")', (target_id, user_id, now_ts))
    conn.commit()
    conn.close()

    broadcast_to_user(target_id, {'type': 'friend_added', 'user_id': user_id})
    return jsonify({'success': True})

# ----------------- Group Creation & Management -----------------
@app.route('/api/groups/create', methods=['POST'])
def api_create_group():
    data = request.json or {}
    creator_id = data.get('creator_id')
    name = (data.get('name') or '').strip()
    member_ids = data.get('member_ids') or []
    avatar = (data.get('avatar') or '').strip()

    if not creator_id or not name:
        return jsonify({'error': 'Vui lòng nhập tên nhóm!'}), 400

    group_id = f"group_{int(time.time() * 1000)}"
    invite_code = f"SEELAD-{os.urandom(3).hex().upper()}"
    if not avatar:
        avatar = f"https://api.dicebear.com/7.x/shapes/svg?seed={urllib.parse.quote(name)}&backgroundColor=4f46e5,9333ea,06b6d4"

    all_members = list(dict.fromkeys([creator_id] + [m for m in member_ids if m]))

    now_dt = datetime.now()
    now_full = now_dt.strftime('%Y-%m-%d %H:%M:%S')
    now_str = now_dt.strftime('%H:%M')

    conn = get_db()
    c = conn.cursor()

    c.execute('''
        INSERT INTO groups (id, name, avatar, created_by, invite_code, chat_theme, created_at)
        VALUES (?, ?, ?, ?, ?, 'theme-cyber-indigo', ?)
    ''', (group_id, name, avatar, creator_id, invite_code, now_full))

    for uid in all_members:
        role = 'admin' if uid == creator_id else 'member'
        c.execute('INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)', (group_id, uid, role))

    c.execute('SELECT name FROM users WHERE id = ?', (creator_id,))
    creator_row = c.fetchone()
    creator_name = creator_row['name'] if creator_row else 'Trưởng nhóm'

    welcome_msg_id = f"msg_{int(time.time() * 1000)}"
    welcome_text = f"🎉 Nhóm \"{name}\" đã được tạo bởi {creator_name} với {len(all_members)} thành viên!"
    c.execute('''
        INSERT INTO messages (id, conversation_id, sender_id, receiver_id, is_group, type, content, created_at)
        VALUES (?, ?, ?, ?, 1, 'text', ?, ?)
    ''', (welcome_msg_id, group_id, creator_id, group_id, welcome_text, now_full))

    conn.commit()
    conn.close()

    group_obj = {
        'id': group_id,
        'name': name,
        'avatar': avatar,
        'isGroup': True,
        'membersCount': len(all_members),
        'inviteCode': invite_code,
        'chatTheme': 'theme-cyber-indigo',
        'last_message': welcome_text,
        'last_message_type': 'text',
        'last_message_time': now_str
    }

    for uid in all_members:
        broadcast_to_user(uid, {
            'type': 'group_created',
            'group': group_obj
        })

    return jsonify({'success': True, 'group': group_obj})

# ----------------- 2-Way Daily Streak Engine & Flame Tier System -----------------
def get_flame_tier(streak_count):
    if streak_count >= 30:
        return {'tier': 5, 'name': 'Lửa Hoàng Kim Cực Quang', 'color': '#fbbf24', 'bg': 'from-amber-400 via-yellow-300 to-amber-500', 'class_name': 'flame-gold', 'icon': '🌟'}
    elif streak_count >= 15:
        return {'tier': 4, 'name': 'Lửa Xanh Băng Giá Plasma', 'color': '#06b6d4', 'bg': 'from-cyan-400 to-blue-500', 'class_name': 'flame-cyan', 'icon': '⚡'}
    elif streak_count >= 8:
        return {'tier': 3, 'name': 'Lửa Tím Huyền Ảo', 'color': '#c084fc', 'bg': 'from-purple-500 to-pink-500', 'class_name': 'flame-purple', 'icon': '💜'}
    elif streak_count >= 4:
        return {'tier': 2, 'name': 'Lửa Đỏ Nhiệt Huyết', 'color': '#f43f5e', 'bg': 'from-rose-500 to-red-600', 'class_name': 'flame-red', 'icon': '🔴'}
    elif streak_count >= 1:
        return {'tier': 1, 'name': 'Lửa Cam Khởi Đầu', 'color': '#f97316', 'bg': 'from-orange-500 to-amber-500', 'class_name': 'flame-orange', 'icon': '🔥'}
    else:
        return {'tier': 0, 'name': 'Chưa kích hoạt', 'color': '#64748b', 'bg': 'from-slate-600 to-slate-700', 'class_name': 'flame-gray', 'icon': '❄️'}

def update_streak_pair_in_db(c, sender_id, receiver_id):
    """
    Chuỗi 2 Chiều Chuẩn Xác:
    - Chỉ tăng khi CẢ HAI người cùng nhắn tin cho nhau trong ngày hôm nay.
    - Mỗi ngày lịch (today) chỉ cộng tối đa đúng 1 điểm chuỗi.
    - Nếu quá 48h không ai nhắn, chuỗi sẽ về 0.
    """
    if not sender_id or not receiver_id or sender_id == receiver_id:
        return None
    now_ts = time.time()
    today_str = datetime.now().strftime('%Y-%m-%d')
    result_streak = 0

    # Kiểm tra xem receiver_id đã nhắn cho sender_id hôm nay chưa
    c.execute('''
        SELECT COUNT(*) as cnt FROM messages
        WHERE sender_id = ? AND receiver_id = ? AND is_group = 0
        AND date(created_at) = date('now')
    ''', (receiver_id, sender_id))
    cnt_row = c.fetchone()
    has_receiver_messaged_today = (cnt_row['cnt'] if cnt_row else 0) > 0

    for (u1, u2) in [(sender_id, receiver_id), (receiver_id, sender_id)]:
        c.execute('SELECT streak_count, total_messages, last_message_at, status, last_streak_date FROM streaks WHERE user_id = ? AND friend_id = ?', (u1, u2))
        row = c.fetchone()
        if not row:
            init_streak = 1 if has_receiver_messaged_today else 0
            init_date = today_str if has_receiver_messaged_today else None
            c.execute('''
                INSERT INTO streaks (user_id, friend_id, streak_count, total_messages, last_message_at, status, lost_streak_count, last_streak_date)
                VALUES (?, ?, ?, 1, ?, 'active', 0, ?)
            ''', (u1, u2, init_streak, now_ts, init_date))
            result_streak = init_streak
        else:
            elapsed = now_ts - float(row['last_message_at'] or now_ts)
            current_streak = int(row['streak_count'] or 0)
            last_date = row['last_streak_date']
            total_msgs = (row['total_messages'] or 0) + 1

            if elapsed >= 48 * 3600:
                current_streak = 0
                last_date = None

            # Cả hai đã nhắn hôm nay và hôm nay chưa được cộng
            if has_receiver_messaged_today and last_date != today_str:
                current_streak += 1
                last_date = today_str

            c.execute('''
                UPDATE streaks
                SET streak_count = ?, total_messages = ?, last_message_at = ?, status = 'active', last_streak_date = ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND friend_id = ?
            ''', (current_streak, total_msgs, now_ts, last_date, u1, u2))
            result_streak = current_streak

    return result_streak

@app.route('/api/streaks', methods=['GET'])
def api_get_streaks():
    user_id = request.args.get('user_id', '').strip()
    if not user_id:
        return jsonify({'streaks': []})

    now_ts = time.time()
    EXPIRE_SECONDS = 48 * 3600

    conn = get_db()
    c = conn.cursor()

    # Lấy danh sách bạn bè thật đã kết bạn
    c.execute('''
        SELECT u.id, u.name, u.username, u.avatar, u.status as user_status
        FROM users u
        JOIN friendships f ON f.user2_id = u.id
        WHERE f.user1_id = ? AND f.status = 'accepted'
    ''', (user_id,))
    friends = [dict(r) for r in c.fetchall()]

    streaks_list = []
    for f in friends:
        fid = f['id']
        c.execute('''
            SELECT COUNT(*) as cnt FROM messages
            WHERE is_group = 0 AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
        ''', (user_id, fid, fid, user_id))
        real_msg_cnt = c.fetchone()['cnt'] or 0

        c.execute('SELECT * FROM streaks WHERE user_id = ? AND friend_id = ?', (user_id, fid))
        st = c.fetchone()
        if not st:
            c.execute('''
                INSERT INTO streaks (user_id, friend_id, streak_count, total_messages, last_message_at, status, lost_streak_count, last_streak_date)
                VALUES (?, ?, 0, ?, ?, 'active', 0, NULL)
            ''', (user_id, fid, real_msg_cnt, now_ts))
            conn.commit()
            c.execute('SELECT * FROM streaks WHERE user_id = ? AND friend_id = ?', (user_id, fid))
            st = c.fetchone()

        st_dict = dict(st)
        last_ts = float(st_dict.get('last_message_at') or now_ts)
        elapsed = max(0.0, now_ts - last_ts)
        remaining = max(0, int(EXPIRE_SECONDS - elapsed))

        status = st_dict.get('status', 'active')
        streak_count = int(st_dict.get('streak_count') or 0)
        total_messages = max(int(st_dict.get('total_messages') or 0), real_msg_cnt)

        if elapsed >= EXPIRE_SECONDS and status == 'active':
            status = 'lost'
            streak_count = 0
            c.execute('UPDATE streaks SET status = "lost", streak_count = 0 WHERE user_id = ? AND friend_id = ?', (user_id, fid))
            conn.commit()

        hours_left = remaining // 3600
        minutes_left = (remaining % 3600) // 60
        seconds_left = remaining % 60

        streaks_list.append({
            'friend_id': fid,
            'friend_name': f['name'],
            'friend_username': f['username'],
            'friend_avatar': f['avatar'],
            'friend_status': f['user_status'],
            'streak_count': streak_count,
            'total_messages': total_messages,
            'last_message_at': last_ts,
            'remaining_seconds': remaining,
            'hours_left': hours_left,
            'minutes_left': minutes_left,
            'seconds_left': seconds_left,
            'status': status,
            'flame_tier': get_flame_tier(streak_count)
        })

    conn.close()
    streaks_list.sort(key=lambda x: (x['streak_count'], x['total_messages']), reverse=True)
    return jsonify({'streaks': streaks_list})

@app.route('/api/streaks/grind', methods=['POST'])
def api_grind_streak():
    """Unlimited streak grinding (+1 streak & send fire interaction)"""
    data = request.json or {}
    user_id = data.get('user_id')
    friend_id = data.get('friend_id')
    if not user_id or not friend_id:
        return jsonify({'error': 'Thiếu thông tin người dùng'}), 400

    conn = get_db()
    c = conn.cursor()
    new_streak = update_streak_pair_in_db(c, user_id, friend_id)

    c.execute('SELECT name, avatar FROM users WHERE id = ?', (user_id,))
    u_row = c.fetchone()
    u_name = u_row['name'] if u_row else 'Bạn bè'
    u_avatar = u_row['avatar'] if u_row else ''

    c.execute('SELECT name FROM users WHERE id = ?', (friend_id,))
    f_row = c.fetchone()
    f_name = f_row['name'] if f_row else 'Bạn bè'

    now_dt = datetime.now()
    now_full = now_dt.strftime('%Y-%m-%d %H:%M:%S')
    now_str = now_dt.strftime('%H:%M')
    msg_id = f"msg_{int(time.time() * 1000)}"
    fire_text = f"🔥 Đã thắp lửa Cày Chuỗi Vô Hạn với {f_name}! (Chuỗi hiện tại: {new_streak} 🔥)"

    c.execute('''
        INSERT INTO messages (id, conversation_id, sender_id, receiver_id, is_group, type, content, created_at)
        VALUES (?, ?, ?, ?, 0, 'text', ?, ?)
    ''', (msg_id, friend_id, user_id, friend_id, fire_text, now_full))

    conn.commit()
    conn.close()

    msg_payload = {
        'id': msg_id,
        'conversation_id': friend_id,
        'senderId': user_id,
        'sender_id': user_id,
        'receiverId': friend_id,
        'receiver_id': friend_id,
        'isGroup': False,
        'is_group': False,
        'type': 'text',
        'text': fire_text,
        'content': fire_text,
        'time': now_str,
        'created_at': now_full,
        'senderName': u_name,
        'senderAvatar': u_avatar,
        'streak_count': new_streak
    }
    broadcast_to_user(friend_id, {'type': 'new_message', 'message': msg_payload})
    broadcast_to_user(user_id, {'type': 'new_message', 'message': msg_payload})

    return jsonify({'success': True, 'streak_count': new_streak, 'friend_name': f_name, 'message': msg_payload})

@app.route('/api/streaks/restore', methods=['POST'])
def api_restore_streak():
    """Restores a lost 48-hour streak with a specific friend by name"""
    data = request.json or {}
    user_id = data.get('user_id')
    friend_id = data.get('friend_id')
    if not user_id or not friend_id:
        return jsonify({'error': 'Thiếu thông tin người dùng'}), 400

    now_ts = time.time()
    conn = get_db()
    c = conn.cursor()

    c.execute('SELECT name FROM users WHERE id = ?', (friend_id,))
    f_row = c.fetchone()
    friend_name = f_row['name'] if f_row else 'Bạn bè'

    c.execute('SELECT name, avatar FROM users WHERE id = ?', (user_id,))
    u_row = c.fetchone()
    user_name = u_row['name'] if u_row else 'Bạn'
    user_avatar = u_row['avatar'] if u_row else ''

    restored_val = 1
    for (u1, u2) in [(user_id, friend_id), (friend_id, user_id)]:
        c.execute('SELECT streak_count, lost_streak_count, total_messages, restored_count FROM streaks WHERE user_id = ? AND friend_id = ?', (u1, u2))
        row = c.fetchone()
        if row:
            restored_val = max(int(row['lost_streak_count'] or 0), int(row['streak_count'] or 0), 1) + 1
            new_total = max(int(row['total_messages'] or 0), restored_val) + 1
            new_restored = int(row['restored_count'] or 0) + 1
            c.execute('''
                UPDATE streaks
                SET streak_count = ?, lost_streak_count = 0, total_messages = ?, last_message_at = ?, status = 'active', restored_count = ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND friend_id = ?
            ''', (restored_val, new_total, now_ts, new_restored, u1, u2))
        else:
            restored_val = 5
            c.execute('''
                INSERT INTO streaks (user_id, friend_id, streak_count, total_messages, last_message_at, status, lost_streak_count, restored_count)
                VALUES (?, ?, ?, ?, ?, 'active', 0, 1)
            ''', (u1, u2, restored_val, restored_val, now_ts))

    now_dt = datetime.now()
    now_full = now_dt.strftime('%Y-%m-%d %H:%M:%S')
    now_str = now_dt.strftime('%H:%M')
    msg_id = f"msg_{int(time.time() * 1000)}"
    restore_text = f"🔄🔥 Đã khôi phục chuỗi với {friend_name} thành công! Chuỗi lửa tiếp tục ở mốc {restored_val} 🔥 (Gia hạn 48 tiếng)"

    c.execute('''
        INSERT INTO messages (id, conversation_id, sender_id, receiver_id, is_group, type, content, created_at)
        VALUES (?, ?, ?, ?, 0, 'text', ?, ?)
    ''', (msg_id, friend_id, user_id, friend_id, restore_text, now_full))

    conn.commit()
    conn.close()

    msg_payload = {
        'id': msg_id,
        'conversation_id': friend_id,
        'senderId': user_id,
        'sender_id': user_id,
        'receiverId': friend_id,
        'receiver_id': friend_id,
        'isGroup': False,
        'is_group': False,
        'type': 'text',
        'text': restore_text,
        'content': restore_text,
        'time': now_str,
        'created_at': now_full,
        'senderName': user_name,
        'senderAvatar': user_avatar,
        'streak_count': restored_val
    }
    broadcast_to_user(friend_id, {'type': 'new_message', 'message': msg_payload})
    broadcast_to_user(user_id, {'type': 'new_message', 'message': msg_payload})

    return jsonify({
        'success': True,
        'friend_id': friend_id,
        'friend_name': friend_name,
        'restored_streak': restored_val,
        'message': f"Đã khôi phục chuỗi với {friend_name} ({restored_val} 🔥)!"
    })

@app.route('/api/streaks/simulate-expire', methods=['POST'])
def api_simulate_expire_streak():
    """Simulates 48-hour expiration for testing the Restore Streak feature with a specific friend"""
    data = request.json or {}
    user_id = data.get('user_id')
    friend_id = data.get('friend_id')
    if not user_id or not friend_id:
        return jsonify({'error': 'Thiếu thông tin'}), 400

    expired_ts = time.time() - (49 * 3600)  # 49 hours ago (> 48h limit)
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT streak_count, lost_streak_count FROM streaks WHERE user_id = ? AND friend_id = ?', (user_id, friend_id))
    row = c.fetchone()
    saved_streak = max((row['streak_count'] if row else 0), (row['lost_streak_count'] if row else 0), 5)

    for (u1, u2) in [(user_id, friend_id), (friend_id, user_id)]:
        c.execute('''
            UPDATE streaks
            SET status = 'lost', lost_streak_count = ?, streak_count = 0, last_message_at = ?, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND friend_id = ?
        ''', (saved_streak, expired_ts, u1, u2))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'lost_streak_count': saved_streak})

# ----------------- Real-Time Messaging -----------------
@app.route('/api/messages', methods=['GET'])
def api_get_messages():
    user_id = request.args.get('user_id')
    target_id = request.args.get('target_id')
    is_group = request.args.get('is_group') == 'true'

    if not user_id or not target_id:
        return jsonify({'messages': []})

    conn = get_db()
    c = conn.cursor()

    if is_group:
        c.execute('''
        SELECT * FROM (
            SELECT m.rowid as msg_order, m.*, u.name as senderName, u.avatar as senderAvatar
            FROM messages m
            LEFT JOIN users u ON m.sender_id = u.id
            WHERE m.conversation_id = ?
            ORDER BY m.rowid DESC
            LIMIT 200
        ) ORDER BY msg_order ASC
        ''', (target_id,))
    else:
        c.execute('''
        SELECT * FROM (
            SELECT m.rowid as msg_order, m.*, u.name as senderName, u.avatar as senderAvatar
            FROM messages m
            LEFT JOIN users u ON m.sender_id = u.id
            WHERE (m.sender_id = ? AND m.receiver_id = ?)
               OR (m.sender_id = ? AND m.receiver_id = ?)
            ORDER BY m.rowid DESC
            LIMIT 200
        ) ORDER BY msg_order ASC
        ''', (user_id, target_id, target_id, user_id))

    messages = [dict(r) for r in c.fetchall()]
    for m in messages:
        try:
            if 'T' in str(m.get('created_at', '')):
                dt = datetime.fromisoformat(m['created_at'].replace('Z', '+00:00'))
            else:
                dt = datetime.strptime(str(m['created_at']).split('.')[0], '%Y-%m-%d %H:%M:%S')
            m['time'] = dt.strftime('%H:%M')
        except Exception:
            m['time'] = ''
        m['text'] = m['content']

    conn.close()
    return jsonify({'messages': messages})

@app.route('/api/messages/live-sync', methods=['GET'])
def api_messages_live_sync():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'error': 'user_id required'}), 400

    since_id = request.args.get('since_id', '').strip()
    active_chat_id = request.args.get('active_chat_id', '').strip()

    conn = get_db()
    c = conn.cursor()

    # Find all groups user belongs to
    c.execute('SELECT group_id FROM group_members WHERE user_id = ?', (user_id,))
    group_ids = [r['group_id'] for r in c.fetchall()]

    query_parts = ['(m.receiver_id = ? OR m.sender_id = ?)']
    params = [user_id, user_id]

    if group_ids:
        placeholders = ','.join(['?'] * len(group_ids))
        query_parts.append(f'm.conversation_id IN ({placeholders})')
        params.extend(group_ids)

    where_clause = f"({' OR '.join(query_parts)})"

    if since_id:
        c.execute('SELECT rowid FROM messages WHERE id = ?', (since_id,))
        row = c.fetchone()
        if row:
            where_clause += f" AND m.rowid > {row[0]}"

    sql = f'''
    SELECT m.rowid as msg_order, m.*, u.name as senderName, u.avatar as senderAvatar
    FROM messages m
    LEFT JOIN users u ON m.sender_id = u.id
    WHERE {where_clause}
    ORDER BY m.rowid ASC
    LIMIT 100
    '''
    c.execute(sql, tuple(params))
    rows = c.fetchall()

    new_messages = []
    for r in rows:
        m = dict(r)
        try:
            if 'T' in str(m.get('created_at', '')):
                dt = datetime.fromisoformat(m['created_at'].replace('Z', '+00:00'))
            else:
                dt = datetime.strptime(str(m['created_at']).split('.')[0], '%Y-%m-%d %H:%M:%S')
            m['time'] = dt.strftime('%H:%M')
        except Exception:
            m['time'] = ''
        m['text'] = m['content']
        m['senderId'] = m['sender_id']
        m['receiverId'] = m['receiver_id']
        m['isGroup'] = bool(m['is_group'])
        m['fileUrl'] = m['file_url']
        m['fileName'] = m['file_name']
        m['fileSize'] = m['file_size']
        new_messages.append(m)

    conn.close()
    return jsonify({
        'success': True,
        'messages': new_messages,
        'server_ts': time.time()
    })

@app.route('/api/messages/send', methods=['POST'])
def api_send_message():
    data = request.json or {}
    sender_id = data.get('sender_id')
    receiver_id = data.get('receiver_id')
    is_group = 1 if data.get('is_group') else 0
    content = data.get('content') or data.get('text') or ''
    msg_type = data.get('type', 'text')
    file_url = data.get('file_url')
    file_name = data.get('file_name')
    file_size = data.get('file_size')
    duration = data.get('duration')

    if not sender_id or not receiver_id:
        return jsonify({'error': 'sender_id and receiver_id required'}), 400

    now_dt = datetime.now()
    now_full = now_dt.strftime('%Y-%m-%d %H:%M:%S')
    now_str = now_dt.strftime('%H:%M')
    msg_id = 'msg_' + str(int(time.time() * 1000))
    conv_id = receiver_id if is_group else receiver_id

    conn = get_db()
    c = conn.cursor()
    c.execute('''
    INSERT INTO messages (id, conversation_id, sender_id, receiver_id, is_group, type, content, file_url, file_name, file_size, duration, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (msg_id, conv_id, sender_id, receiver_id, is_group, msg_type, content, file_url, file_name, file_size, duration, now_full))

    new_streak = None
    if not is_group:
        new_streak = update_streak_pair_in_db(c, sender_id, receiver_id)

    # Fetch sender name for group notification
    c.execute('SELECT name, avatar FROM users WHERE id = ?', (sender_id,))
    sender_row = c.fetchone()
    sender_info = dict(sender_row) if sender_row else {'name': 'Người dùng', 'avatar': ''}
    conn.commit()
    conn.close()

    msg_payload = {
        'id': msg_id,
        'conversation_id': conv_id,
        'senderId': sender_id,
        'sender_id': sender_id,
        'receiverId': receiver_id,
        'receiver_id': receiver_id,
        'isGroup': bool(is_group),
        'is_group': bool(is_group),
        'type': msg_type,
        'text': content,
        'content': content,
        'fileUrl': file_url,
        'file_url': file_url,
        'fileName': file_name,
        'file_name': file_name,
        'fileSize': file_size,
        'file_size': file_size,
        'duration': duration,
        'time': now_str,
        'created_at': now_full,
        'senderName': sender_info['name'],
        'senderAvatar': sender_info['avatar'],
        'streak_count': new_streak
    }

    # Broadcast in real-time
    event = {'type': 'new_message', 'message': msg_payload}
    if is_group:
        broadcast_to_group(receiver_id, sender_id, event)
    else:
        broadcast_to_user(receiver_id, event)

    return jsonify({'success': True, 'message': msg_payload, 'streak_count': new_streak})

# ----------------- File Upload Endpoint -----------------
@app.route('/api/upload', methods=['POST'])
def api_upload():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    f = request.files['file']
    if f.filename == '':
        return jsonify({'error': 'Empty filename'}), 400

    import re
    clean_name = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', f.filename)
    filename = f"{int(time.time() * 1000)}_{clean_name}"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    f.save(filepath)

    file_url = f"/uploads/{filename}"
    file_size = os.path.getsize(filepath)
    size_str = f"{(file_size / (1024*1024)):.2f} MB" if file_size > 1024*1024 else f"{(file_size / 1024):.1f} KB"

    return jsonify({
        'success': True,
        'fileUrl': file_url,
        'fileName': f.filename,
        'fileSize': size_str
    })

# ----------------- WebRTC Peer Call Signaling -----------------
@app.route('/api/call/signal', methods=['POST'])
def api_call_signal():
    """Signaling server forwarding SDP offers, answers, ICE candidates & filters between peers"""
    data = request.json or {}
    target_user_id = data.get('target_user_id')
    sender_id = data.get('sender_id')
    signal_type = data.get('signal_type') # 'call_start', 'call_accept', 'offer', 'answer', 'ice_candidate', 'video_filter', 'call_end', 'call_rejected'
    payload = data.get('payload') or {}

    if not target_user_id:
        return jsonify({'error': 'target_user_id required'}), 400

    is_online = target_user_id in active_clients and len(active_clients[target_user_id]) > 0
    print(f"[CALL SIGNAL] {sender_id} -> {target_user_id} | {signal_type} | sse_online={is_online}")

    # Record call summary into messages table ONLY ONCE when call ends or is rejected
    if signal_type in ('call_end', 'call_rejected') and not payload.get('skip_record'):
        was_connected = payload.get('was_connected', False)
        duration = int(payload.get('duration', 0) or 0)
        call_type = payload.get('type', 'voice')
        type_label = 'video' if call_type == 'video' else 'thoại'

        if was_connected and duration > 0:
            mins = duration // 60
            secs = duration % 60
            call_content = f"📞 Cuộc gọi {type_label} ({mins:02d}:{secs:02d})"
        else:
            call_content = f"📞 Cuộc gọi {type_label} nhỡ"

        try:
            msg_id = f"call_{int(time.time() * 1000)}"
            now_dt = datetime.now()
            now_str = now_dt.strftime('%Y-%m-%d %H:%M:%S')
            time_short = now_dt.strftime('%H:%M')
            conn = get_db()
            c = conn.cursor()
            c.execute('SELECT name, avatar FROM users WHERE id = ?', (sender_id,))
            s_row = c.fetchone()
            s_info = dict(s_row) if s_row else {'name': 'Người dùng', 'avatar': ''}

            c.execute('''
                INSERT INTO messages (id, conversation_id, sender_id, receiver_id, is_group, type, content, created_at)
                VALUES (?, ?, ?, ?, 0, 'text', ?, ?)
            ''', (msg_id, target_user_id, sender_id, target_user_id, call_content, now_str))
            conn.commit()
            conn.close()

            msg_payload = {
                'type': 'new_message',
                'message': {
                    'id': msg_id,
                    'conversation_id': target_user_id,
                    'sender_id': sender_id,
                    'senderId': sender_id,
                    'receiver_id': target_user_id,
                    'receiverId': target_user_id,
                    'is_group': False,
                    'isGroup': False,
                    'content': call_content,
                    'text': call_content,
                    'type': 'text',
                    'time': time_short,
                    'created_at': now_str,
                    'senderName': s_info['name'],
                    'senderAvatar': s_info['avatar']
                }
            }
            broadcast_to_user(sender_id, msg_payload)
            broadcast_to_user(target_user_id, msg_payload)
        except Exception as e:
            print("Error recording call summary:", e)

    sig_id = f"sig_{int(time.time() * 1000)}_{os.urandom(3).hex()}"
    event = {
        'type': 'call_signal',
        'sig_id': sig_id,
        'signal_type': signal_type,
        'sender_id': sender_id,
        'payload': payload
    }

    # 1. Push immediately via SSE
    broadcast_to_user(target_user_id, event)

    # 2. Also store in pending_call_signals queue (TTL 40s) so mobile/tunnel clients polling /api/call/poll never miss a call!
    now_ts = time.time()
    if target_user_id not in pending_call_signals:
        pending_call_signals[target_user_id] = []
    # Purge expired signals > 40s
    pending_call_signals[target_user_id] = [s for s in pending_call_signals[target_user_id] if now_ts - s['ts'] < 40]
    pending_call_signals[target_user_id].append({
        'sig_id': sig_id,
        'ts': now_ts,
        'event': event
    })

    return jsonify({'success': True, 'online': True, 'sse_online': is_online, 'sig_id': sig_id})

@app.route('/api/call/poll', methods=['GET'])
def api_call_poll():
    """Fast polling endpoint for call signals to guarantee delivery across mobile & Cloudflare tunnels"""
    user_id = request.args.get('user_id', '').strip()
    if not user_id:
        return jsonify({'signals': []})

    now_ts = time.time()
    q_list = pending_call_signals.get(user_id, [])
    valid_signals = [s['event'] for s in q_list if now_ts - s['ts'] < 40]
    pending_call_signals[user_id] = []
    return jsonify({'signals': valid_signals})

# ----------------- Social Diary & Posts API -----------------
@app.route('/api/posts', methods=['GET'])
def api_get_posts():
    current_user_id = request.args.get('user_id', '').strip()
    target_user_id = request.args.get('target_user_id', '').strip()

    conn = get_db()
    c = conn.cursor()

    if target_user_id:
        c.execute('''
            SELECT p.id, p.user_id, p.content, p.image_url, p.mood, p.likes_count, p.created_at,
                   u.name as author_name, u.username as author_username, u.avatar as author_avatar
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE p.user_id = ?
            ORDER BY p.created_at DESC
            LIMIT 50
        ''', (target_user_id,))
    else:
        c.execute('''
            SELECT p.id, p.user_id, p.content, p.image_url, p.mood, p.likes_count, p.created_at,
                   u.name as author_name, u.username as author_username, u.avatar as author_avatar
            FROM posts p
            JOIN users u ON p.user_id = u.id
            ORDER BY p.created_at DESC
            LIMIT 50
        ''')
    posts = [dict(r) for r in c.fetchall()]

    for p in posts:
        pid = p['id']
        p['has_liked'] = False
        if current_user_id:
            c.execute('SELECT COUNT(*) FROM post_likes WHERE post_id = ? AND user_id = ?', (pid, current_user_id))
            p['has_liked'] = c.fetchone()[0] > 0

        c.execute('''
            SELECT pc.id, pc.post_id, pc.user_id, pc.content, pc.created_at,
                   u.name as author_name, u.username as author_username, u.avatar as author_avatar
            FROM post_comments pc
            JOIN users u ON pc.user_id = u.id
            WHERE pc.post_id = ?
            ORDER BY pc.created_at ASC
        ''', (pid,))
        p['comments'] = [dict(cr) for cr in c.fetchall()]

    conn.close()
    return jsonify({'success': True, 'posts': posts})

@app.route('/api/posts', methods=['POST'])
def api_create_post():
    data = request.json or {}
    user_id = data.get('user_id', '').strip()
    content = data.get('content', '').strip()
    image_url = data.get('image_url', '').strip()
    mood = data.get('mood', '🌟 Vui vẻ').strip()

    if not user_id or not content:
        return jsonify({'error': 'Vui lòng nhập nội dung bài viết!'}), 400

    post_id = f"post_{int(time.time() * 1000)}"
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        INSERT INTO posts (id, user_id, content, image_url, mood, likes_count, created_at)
        VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
    ''', (post_id, user_id, content, image_url or None, mood))
    conn.commit()

    c.execute('''
        SELECT p.id, p.user_id, p.content, p.image_url, p.mood, p.likes_count, p.created_at,
               u.name as author_name, u.username as author_username, u.avatar as author_avatar
        FROM posts p
        JOIN users u ON p.user_id = u.id
        WHERE p.id = ?
    ''', (post_id,))
    new_post = dict(c.fetchone())
    new_post['has_liked'] = False
    new_post['comments'] = []
    conn.close()

    broadcast_to_all({'type': 'new_post', 'post': new_post})
    return jsonify({'success': True, 'post': new_post})

@app.route('/api/posts/<post_id>/like', methods=['POST'])
def api_toggle_post_like(post_id):
    data = request.json or {}
    user_id = data.get('user_id', '').strip()
    if not user_id:
        return jsonify({'error': 'user_id required'}), 400

    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT COUNT(*) FROM post_likes WHERE post_id = ? AND user_id = ?', (post_id, user_id))
    has_liked = c.fetchone()[0] > 0

    if has_liked:
        c.execute('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?', (post_id, user_id))
        c.execute('UPDATE posts SET likes_count = MAX(0, likes_count - 1) WHERE id = ?', (post_id,))
        now_liked = False
    else:
        c.execute('INSERT OR IGNORE INTO post_likes (post_id, user_id) VALUES (?, ?)', (post_id, user_id))
        c.execute('UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?', (post_id,))
        now_liked = True

    c.execute('SELECT likes_count FROM posts WHERE id = ?', (post_id,))
    row = c.fetchone()
    likes_count = row['likes_count'] if row else 0
    conn.commit()
    conn.close()

    broadcast_to_all({'type': 'post_like_updated', 'post_id': post_id, 'likes_count': likes_count})
    return jsonify({'success': True, 'has_liked': now_liked, 'likes_count': likes_count})

@app.route('/api/posts/<post_id>/comment', methods=['POST'])
def api_add_post_comment(post_id):
    data = request.json or {}
    user_id = data.get('user_id', '').strip()
    content = data.get('content', '').strip()
    if not user_id or not content:
        return jsonify({'error': 'Vui lòng nhập nội dung bình luận!'}), 400

    comment_id = f"comment_{int(time.time() * 1000)}"
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        INSERT INTO post_comments (id, post_id, user_id, content, created_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ''', (comment_id, post_id, user_id, content))
    conn.commit()

    c.execute('''
        SELECT pc.id, pc.post_id, pc.user_id, pc.content, pc.created_at,
               u.name as author_name, u.username as author_username, u.avatar as author_avatar
        FROM post_comments pc
        JOIN users u ON pc.user_id = u.id
        WHERE pc.id = ?
    ''', (comment_id,))
    comment = dict(c.fetchone())
    conn.close()

    broadcast_to_all({'type': 'post_comment_added', 'post_id': post_id, 'comment': comment})
    return jsonify({'success': True, 'comment': comment})

@app.route('/api/posts/<post_id>', methods=['DELETE'])
def api_delete_post(post_id):
    user_id = request.args.get('user_id', '').strip()
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT user_id FROM posts WHERE id = ?', (post_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Bài đăng không tồn tại'}), 404
    if row['user_id'] != user_id:
        conn.close()
        return jsonify({'error': 'Không có quyền xóa bài đăng này'}), 403

    c.execute('DELETE FROM posts WHERE id = ?', (post_id,))
    c.execute('DELETE FROM post_likes WHERE post_id = ?', (post_id,))
    c.execute('DELETE FROM post_comments WHERE post_id = ?', (post_id,))
    conn.commit()
    conn.close()
    broadcast_to_all({'type': 'post_deleted', 'post_id': post_id})
    return jsonify({'success': True})

# ----------------- Custom Nicknames API -----------------
@app.route('/api/nicknames', methods=['GET'])
def api_get_nicknames():
    user_id = request.args.get('user_id', '').strip()
    if not user_id:
        return jsonify({'nicknames': {}})
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT target_id, nickname FROM nicknames WHERE user_id = ?', (user_id,))
    rows = c.fetchall()
    conn.close()
    nicknames_dict = {r['target_id']: r['nickname'] for r in rows}
    return jsonify({'nicknames': nicknames_dict})

@app.route('/api/nicknames', methods=['POST'])
def api_set_nickname():
    data = request.json or {}
    user_id = data.get('user_id', '').strip()
    target_id = data.get('target_id', '').strip()
    nickname = data.get('nickname', '').strip()
    if not user_id or not target_id:
        return jsonify({'error': 'user_id and target_id required'}), 400

    conn = get_db()
    c = conn.cursor()
    if nickname:
        c.execute('''
            INSERT INTO nicknames (user_id, target_id, nickname, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, target_id) DO UPDATE SET
                nickname = excluded.nickname,
                updated_at = CURRENT_TIMESTAMP
        ''', (user_id, target_id, nickname))
    else:
        c.execute('DELETE FROM nicknames WHERE user_id = ? AND target_id = ?', (user_id, target_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'target_id': target_id, 'nickname': nickname})

# ----------------- Chat Wallpapers API -----------------
@app.route('/api/wallpapers', methods=['GET'])
def api_get_wallpapers():
    user_id = request.args.get('user_id', '').strip()
    if not user_id:
        return jsonify({'wallpapers': {}})
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT conversation_id, wallpaper_url FROM chat_wallpapers WHERE user_id = ?', (user_id,))
    rows = c.fetchall()
    conn.close()
    wallpapers_dict = {r['conversation_id']: r['wallpaper_url'] for r in rows}
    return jsonify({'wallpapers': wallpapers_dict})

@app.route('/api/wallpapers', methods=['POST'])
def api_set_wallpaper():
    data = request.json or {}
    user_id = data.get('user_id', '').strip()
    conversation_id = data.get('conversation_id', '').strip()
    wallpaper_url = data.get('wallpaper_url', '').strip()
    if not user_id or not conversation_id:
        return jsonify({'error': 'user_id and conversation_id required'}), 400

    conn = get_db()
    c = conn.cursor()
    if wallpaper_url:
        c.execute('''
            INSERT INTO chat_wallpapers (user_id, conversation_id, wallpaper_url, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, conversation_id) DO UPDATE SET
                wallpaper_url = excluded.wallpaper_url,
                updated_at = CURRENT_TIMESTAMP
        ''', (user_id, conversation_id, wallpaper_url))
    else:
        c.execute('DELETE FROM chat_wallpapers WHERE user_id = ? AND conversation_id = ?', (user_id, conversation_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'conversation_id': conversation_id, 'wallpaper_url': wallpaper_url})

# ----------------- QR Studio & Reset API -----------------
@app.route('/api/qr/reset', methods=['POST'])
def api_reset_qr():
    data = request.json or {}
    user_id = data.get('user_id', '').strip()
    if not user_id:
        return jsonify({'error': 'user_id required'}), 400

    new_token = secrets.token_urlsafe(12)
    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE users SET qr_token = ? WHERE id = ?', (new_token, user_id))
    conn.commit()
    c.execute('SELECT username FROM users WHERE id = ?', (user_id,))
    row = c.fetchone()
    username = row['username'] if row else user_id
    conn.close()

    return jsonify({
        'success': True,
        'qr_token': new_token,
        'profile_path': f"/u/{username}?token={new_token}"
    })

# ----------------- Radar Users API -----------------
@app.route('/api/radar/users', methods=['GET'])
def api_get_radar_users():
    current_user_id = request.args.get('user_id', '').strip()
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        SELECT id, username, name, avatar, bio, status, lat, lng, location_name, last_seen
        FROM users
        WHERE id != ?
    ''', (current_user_id,))
    rows = [dict(r) for r in c.fetchall()]

    now = datetime.now()
    for u in rows:
        uid = u['id']
        is_online = (uid in active_clients and len(active_clients[uid]) > 0) or u.get('status') == 'online'
        u['is_online'] = is_online
        u['status'] = 'online' if is_online else 'offline'

        last_seen_str = u.get('last_seen')
        if is_online:
            u['last_seen_text'] = 'Đang trực tuyến 🟢'
        elif last_seen_str:
            try:
                dt = datetime.strptime(last_seen_str.split('.')[0], '%Y-%m-%d %H:%M:%S')
                diff = (now - dt).total_seconds()
                if diff < 60:
                    u['last_seen_text'] = 'Vừa mới online'
                elif diff < 3600:
                    u['last_seen_text'] = f"Hoạt động {int(diff // 60)} phút trước"
                elif diff < 86400:
                    u['last_seen_text'] = f"Hoạt động {int(diff // 3600)} giờ trước"
                else:
                    u['last_seen_text'] = f"Hoạt động {int(diff // 86400)} ngày trước"
            except Exception:
                u['last_seen_text'] = 'Hoạt động gần đây'
        else:
            u['last_seen_text'] = 'Vừa tham gia'

    conn.close()
    return jsonify({'success': True, 'users': rows})

# ----------------- User Profile Update API -----------------
@app.route('/api/users/update_profile', methods=['POST'])
def api_update_user_profile():
    data = request.json or {}
    user_id = data.get('user_id', '').strip()
    name = data.get('name', '').strip()
    bio = data.get('bio')
    cover_image = data.get('cover_image', '').strip()
    avatar = data.get('avatar', '').strip()
    location_name = data.get('location_name', '').strip()

    if not user_id:
        return jsonify({'error': 'user_id required'}), 400

    conn = get_db()
    c = conn.cursor()
    updates = []
    params = []
    if name:
        updates.append('name = ?')
        params.append(name)
    if bio is not None:
        updates.append('bio = ?')
        params.append(bio.strip())
    if cover_image:
        updates.append('cover_image = ?')
        params.append(cover_image)
    if avatar:
        updates.append('avatar = ?')
        params.append(avatar)
    if location_name:
        updates.append('location_name = ?')
        params.append(location_name)

    if updates:
        params.append(user_id)
        c.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", tuple(params))
        conn.commit()

    c.execute('SELECT id, username, name, avatar, bio, status, phone, email, lat, lng, location_name, cover_image, qr_token FROM users WHERE id = ?', (user_id,))
    updated_user = dict(c.fetchone())
    conn.close()

    broadcast_to_all({'type': 'user_profile_updated', 'user': updated_user})
    return jsonify({'success': True, 'user': updated_user})

# ----------------- Server-Sent Events (SSE) Real-Time Stream -----------------
@app.route('/api/stream')
def sse_stream():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'error': 'user_id required'}), 400

    since_ts = request.args.get('since_ts', type=float, default=0.0)

    def event_stream():
        q = queue.Queue()
        if user_id not in active_clients:
            active_clients[user_id] = []
        active_clients[user_id].append(q)

        # Mark user online and notify friends
        try:
            conn = get_db()
            c = conn.cursor()
            c.execute('UPDATE users SET status = "online", last_seen = CURRENT_TIMESTAMP WHERE id = ?', (user_id,))
            conn.commit()
            conn.close()
            broadcast_status(user_id, 'online')
        except Exception:
            pass

        # 1. Bypass Cloudflare/proxy buffering with 1KB initial comment padding
        yield f": {' ' * 1024}\n\n"
        # 2. Connection handshake
        now_ts = time.time()
        yield f"data: {json.dumps({'type': 'connected', 'user_id': user_id, 'server_ts': now_ts})}\n\n"

        # 3. Immediately replay any backlog events missed during disconnect/reconnect
        if user_id in user_events_backlog:
            for (evt_ts, evt_data) in list(user_events_backlog[user_id]):
                if evt_ts > since_ts and (now_ts - evt_ts) < 180:
                    yield f"data: {json.dumps(evt_data)}\n\n"

        try:
            while True:
                try:
                    data = q.get(timeout=10)
                    yield f"data: {json.dumps(data)}\n\n"
                except queue.Empty:
                    # Keep-alive heartbeat ping every 10 seconds to maintain mobile NAT & Cloudflare tunnel
                    yield f": heartbeat {int(time.time())}\n\n"
        except GeneratorExit:
            pass
        finally:
            if user_id in active_clients and q in active_clients[user_id]:
                active_clients[user_id].remove(q)
                if not active_clients[user_id]:
                    del active_clients[user_id]
                    try:
                        conn = get_db()
                        c = conn.cursor()
                        c.execute('UPDATE users SET status = "offline", last_seen = CURRENT_TIMESTAMP WHERE id = ?', (user_id,))
                        conn.commit()
                        conn.close()
                        broadcast_status(user_id, 'offline')
                    except Exception:
                        pass

    return Response(event_stream(), mimetype="text/event-stream; charset=utf-8", headers={
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    })

# Initialize database tables on load (works for both direct run and gunicorn)
init_db()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', sys.argv[1] if len(sys.argv) > 1 else 3000))
    print("==================================================")
    print("  SEE LAD PRODUCTION REAL-TIME SERVER")
    print("  Tac gia: TRAN NGOC HIEU")
    print(f"  Dia chi: http://localhost:{port}")
    print("==================================================")
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
