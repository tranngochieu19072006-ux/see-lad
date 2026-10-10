/**
 * SEE LAD - Real-Time Location Radar & Google Maps Global Sync
 * Tích hợp bản đồ Google Maps (Roadmap & Vệ tinh)
 * Đồng bộ vị trí thực tế GPS của bạn và bạn bè toàn cầu
 * Hiển thị chính xác vị trí cuối cùng đối với bạn bè ngoại tuyến
 */

class RadarController {
  constructor() {
    this.map = null;
    this.userMarker = null;
    this.friendMarkers = [];
    this.userCoords = { lat: 10.7769, lng: 106.7009 };
    this.mapType = 'roadmap'; // 'roadmap' | 'satellite'
    this.radarUsers = [];
  }

  async init() {
    if (typeof L === 'undefined') return;

    const mapContainer = document.getElementById('leaflet-map');
    if (!mapContainer || this.map) return;

    // Khởi tạo Leaflet với Google Maps
    this.map = L.map('leaflet-map', { zoomControl: false }).setView([this.userCoords.lat, this.userCoords.lng], 14);
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Google Maps Layer (Roadmap lyrs=m, Satellite lyrs=y)
    this.roadmapLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      attribution: '&copy; Google Maps'
    });
    this.satelliteLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      attribution: '&copy; Google Maps'
    });

    this.roadmapLayer.addTo(this.map);

    // Lấy GPS chính xác từ thiết bị
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          this.userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          if (this.map) this.map.setView([this.userCoords.lat, this.userCoords.lng], 14);
          await this.syncLocationToServer(this.userCoords.lat, this.userCoords.lng);
          await this.loadRadarUsers();
        },
        async (err) => {
          await this.loadRadarUsers();
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      await this.loadRadarUsers();
    }

    this.bindEvents();
  }

  updateTileTheme(isDark) {
    // Google Maps tiles handle standard rendering
  }

  async syncLocationToServer(lat, lng) {
    const currentUserId = window.auth?.currentUser?.id;
    if (!currentUserId) return;
    try {
      await fetch('/api/auth/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUserId, lat, lng })
      });
    } catch (e) {}
  }

  async loadRadarUsers() {
    const currentUserId = window.auth?.currentUser?.id || 'user_hieu';
    try {
      const res = await fetch(`/api/radar/users?user_id=${encodeURIComponent(currentUserId)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.users)) {
        this.radarUsers = data.users;
      }
    } catch (e) {
      console.warn("Could not load radar users:", e);
    }

    this.renderMarkers();
    this.renderFriendsRadarList();
  }

  bindEvents() {
    const btnScan = document.getElementById('btn-scan-radar');
    if (btnScan) btnScan.addEventListener('click', () => this.triggerRadarScan());

    const btnLocateMe = document.getElementById('btn-locate-me');
    if (btnLocateMe) {
      btnLocateMe.addEventListener('click', () => {
        if (this.map) this.map.flyTo([this.userCoords.lat, this.userCoords.lng], 16, { duration: 1.2 });
      });
    }

    const btnToggleMap = document.getElementById('btn-toggle-map-layer');
    if (btnToggleMap) {
      btnToggleMap.addEventListener('click', () => this.toggleMapLayer());
    }
  }

  toggleMapLayer() {
    if (!this.map) return;
    if (this.mapType === 'roadmap') {
      this.map.removeLayer(this.roadmapLayer);
      this.satelliteLayer.addTo(this.map);
      this.mapType = 'satellite';
      if (window.app) window.app.showToast("Đã chuyển sang chế độ Google Maps Vệ Tinh 🛰️");
    } else {
      this.map.removeLayer(this.satelliteLayer);
      this.roadmapLayer.addTo(this.map);
      this.mapType = 'roadmap';
      if (window.app) window.app.showToast("Đã chuyển sang chế độ Google Maps Tiêu Chuẩn 🗺️");
    }
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return '1.2 km';
    const R = 6371; // Bán kính Trái Đất (km)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const d = R * c;
    if (d < 1) return `${Math.round(d * 1000)} m`;
    return `${d.toFixed(1)} km`;
  }

  renderMarkers() {
    if (!this.map) return;

    this.friendMarkers.forEach(m => this.map.removeLayer(m));
    this.friendMarkers = [];

    const userAvatar = window.auth?.currentUser?.avatar || window.SEE_LAD_CONFIG?.currentUser?.avatar || '/uploads/avatar_hieu.jpg';
    const userIcon = L.divIcon({
      className: 'radar-user-icon',
      html: `
        <div class="relative flex items-center justify-center">
          <div class="w-12 h-12 rounded-full border-2 border-indigo-500 overflow-hidden shadow-2xl bg-slate-900 z-10 ring-4 ring-indigo-500/20">
            <img src="${userAvatar}" class="w-full h-full object-cover" />
          </div>
          <div class="absolute -inset-2 rounded-full bg-indigo-500/30 animate-ping"></div>
          <span class="absolute -top-7 bg-indigo-600 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded-full whitespace-nowrap shadow-xl border border-white/20">
            Bạn ở đây 📍
          </span>
        </div>
      `,
      iconSize: [48, 48],
      iconAnchor: [24, 24]
    });

    if (this.userMarker) this.map.removeLayer(this.userMarker);
    this.userMarker = L.marker([this.userCoords.lat, this.userCoords.lng], { icon: userIcon }).addTo(this.map);

    this.radarUsers.forEach(u => {
      const lat = u.lat || 10.7769;
      const lng = u.lng || 106.7009;
      const isOnline = u.is_online;
      const statusColor = isOnline ? '#10b981' : '#64748b';
      const distance = this.calculateDistance(this.userCoords.lat, this.userCoords.lng, lat, lng);

      const friendIcon = L.divIcon({
        className: 'radar-friend-icon',
        html: `
          <div class="relative flex items-center justify-center group cursor-pointer" onclick="window.radar.focusFriend('${u.id}')">
            <div class="w-11 h-11 rounded-full border-2 overflow-hidden shadow-xl bg-slate-900 ${isOnline ? 'ring-2 ring-emerald-400/40' : 'opacity-85'}" style="border-color: ${statusColor}">
              <img src="${u.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + u.id}" class="w-full h-full object-cover ${isOnline ? '' : 'filter contrast-95'}" />
            </div>
            <span class="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 shadow" style="background-color: ${statusColor}"></span>
            <div class="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-950/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-lg whitespace-nowrap border border-white/10 shadow-2xl flex items-center gap-1">
              <span>${this.escapeHtml(u.name)}</span>
              ${!isOnline ? `<span class="text-[9px] text-slate-400">(${u.last_seen_text || 'Offline'})</span>` : ''}
            </div>
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      });

      const marker = L.marker([lat, lng], { icon: friendIcon }).addTo(this.map);
      marker.bindPopup(`
        <div class="p-3 text-slate-900 dark:text-white min-w-[200px]">
          <div class="flex items-center gap-2.5 mb-2.5">
            <img src="${u.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + u.id}" class="w-10 h-10 rounded-2xl object-cover border border-white/20" />
            <div class="min-w-0">
              <p class="font-extrabold text-xs text-white truncate">${this.escapeHtml(u.name)}</p>
              <p class="text-[11px] text-indigo-400 font-medium">${u.location_name || 'Việt Nam'} • ${distance}</p>
              <p class="text-[10px] ${isOnline ? 'text-emerald-400' : 'text-slate-400'} font-semibold mt-0.5">
                ${isOnline ? '🟢 Đang trực tuyến' : `⏱️ Vị trí cuối cùng: ${u.last_seen_text || 'Gần đây'}`}
              </p>
            </div>
          </div>
          <button onclick="window.radar.startChatWith('${u.id}')" class="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-colors">
            Nhắn tin ngay 💬
          </button>
        </div>
      `);
      this.friendMarkers.push(marker);
    });
  }

  renderFriendsRadarList() {
    const listEl = document.getElementById('radar-friends-list');
    if (!listEl) return;

    if (this.radarUsers.length === 0) {
      listEl.innerHTML = `
        <div class="py-6 text-center text-slate-400 text-xs">
          Chưa tìm thấy người dùng xung quanh. Hãy mời bạn bè tham gia SEE LAD!
        </div>
      `;
      return;
    }

    listEl.innerHTML = this.radarUsers.map(u => {
      const lat = u.lat || 10.7769;
      const lng = u.lng || 106.7009;
      const isOnline = u.is_online;
      const distance = this.calculateDistance(this.userCoords.lat, this.userCoords.lng, lat, lng);

      return `
        <div class="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-indigo-500/40 hover:bg-white/[0.06] transition-all cursor-pointer shadow-lg" onclick="window.radar.focusFriend('${u.id}')">
          <div class="flex items-center gap-3 min-w-0">
            <div class="relative shrink-0">
              <img src="${u.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + u.id}" class="w-11 h-11 rounded-2xl object-cover border border-white/10" />
              <span class="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${isOnline ? 'bg-emerald-500' : 'bg-slate-500'}"></span>
            </div>
            <div class="min-w-0">
              <h5 class="font-bold text-sm text-white truncate">${this.escapeHtml(u.name)}</h5>
              <p class="text-xs text-indigo-400 font-medium">${distance} • ${this.escapeHtml(u.location_name || 'Việt Nam')}</p>
              <p class="text-[10px] ${isOnline ? 'text-emerald-400' : 'text-slate-400'} mt-0.5 truncate">
                ${isOnline ? 'Đang trực tuyến 🟢' : `Vị trí cuối cùng: ${u.last_seen_text || 'Offline'}`}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button onclick="event.stopPropagation(); window.radar.startChatWith('${u.id}')" class="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white transition-colors" title="Nhắn tin">
              <i data-lucide="message-circle" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  focusFriend(friendId) {
    const u = this.radarUsers.find(x => x.id === friendId);
    if (u && this.map) {
      const lat = u.lat || 10.7769;
      const lng = u.lng || 106.7009;
      this.map.flyTo([lat, lng], 16, { duration: 1.2 });
    }
  }

  startChatWith(friendId) {
    if (window.app) window.app.switchTab('chat');
    if (window.chat) window.chat.selectChat(friendId);
  }

  triggerRadarScan() {
    const sweep = document.getElementById('radar-sweep-effect');
    if (sweep) {
      sweep.classList.remove('hidden');
      setTimeout(() => sweep.classList.add('hidden'), 4000);
    }
    if (window.sounds) window.sounds.playKeystroke();
    if (window.app) window.app.showToast("Đang quét vị trí bạn bè toàn cầu trên Google Maps... 📡");
    this.loadRadarUsers();
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

window.radar = new RadarController();
