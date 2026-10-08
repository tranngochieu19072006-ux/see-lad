/**
 * SEE LAD - Real-Time Location Radar & GPS Sync
 * Đồng bộ vị trí thực tế của bạn và bạn bè với máy chủ
 */

class RadarController {
  constructor() {
    this.map = null;
    this.userMarker = null;
    this.friendMarkers = [];
    this.userCoords = { lat: 10.7769, lng: 106.7009 };
  }

  init() {
    if (typeof L === 'undefined') return;

    const mapContainer = document.getElementById('leaflet-map');
    if (!mapContainer || this.map) return;

    this.map = L.map('leaflet-map', { zoomControl: false }).setView([this.userCoords.lat, this.userCoords.lng], 14);
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    this.tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(this.map);

    // Get real GPS
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          this.userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          if (this.map) this.map.setView([this.userCoords.lat, this.userCoords.lng], 14);
          await this.syncLocationToServer(this.userCoords.lat, this.userCoords.lng);
          this.renderMarkers();
        },
        (err) => {
          this.renderMarkers();
        }
      );
    } else {
      this.renderMarkers();
    }

    this.bindEvents();
    this.renderFriendsRadarList();
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

  bindEvents() {
    const btnScan = document.getElementById('btn-scan-radar');
    if (btnScan) btnScan.addEventListener('click', () => this.triggerRadarScan());

    const btnLocateMe = document.getElementById('btn-locate-me');
    if (btnLocateMe) {
      btnLocateMe.addEventListener('click', () => {
        if (this.map) this.map.flyTo([this.userCoords.lat, this.userCoords.lng], 15);
      });
    }
  }

  renderMarkers() {
    if (!this.map) return;

    this.friendMarkers.forEach(m => this.map.removeLayer(m));
    this.friendMarkers = [];

    const userAvatar = window.auth?.currentUser?.avatar || window.SEE_LAD_CONFIG.currentUser.avatar;
    const userIcon = L.divIcon({
      className: 'radar-user-icon',
      html: `
        <div class="relative flex items-center justify-center">
          <div class="w-12 h-12 rounded-full border-2 border-indigo-500 overflow-hidden shadow-2xl bg-slate-900 z-10">
            <img src="${userAvatar}" class="w-full h-full object-cover" />
          </div>
          <div class="absolute -inset-2 rounded-full bg-indigo-500/30 animate-ping"></div>
          <span class="absolute -top-6 bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-md">
            Bạn ở đây
          </span>
        </div>
      `,
      iconSize: [48, 48],
      iconAnchor: [24, 24]
    });

    if (this.userMarker) this.map.removeLayer(this.userMarker);
    this.userMarker = L.marker([this.userCoords.lat, this.userCoords.lng], { icon: userIcon }).addTo(this.map);

    const friends = (window.chat?.contacts || []).filter(c => !c.isGroup && c.location);
    friends.forEach(c => {
      const statusColor = c.status === 'online' ? '#10b981' : c.status === 'busy' ? '#f59e0b' : '#ef4444';
      
      const friendIcon = L.divIcon({
        className: 'radar-friend-icon',
        html: `
          <div class="relative flex items-center justify-center group cursor-pointer" onclick="window.radar.focusFriend('${c.id}')">
            <div class="w-10 h-10 rounded-full border-2 overflow-hidden shadow-lg bg-slate-900" style="border-color: ${statusColor}">
              <img src="${c.avatar}" class="w-full h-full object-cover" />
            </div>
            <span class="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900" style="background-color: ${statusColor}"></span>
            <div class="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-[10px] font-medium px-2 py-0.5 rounded-lg whitespace-nowrap border border-white/10 shadow-lg">
              ${c.name}
            </div>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      });

      const marker = L.marker([c.location.lat, c.location.lng], { icon: friendIcon }).addTo(this.map);
      marker.bindPopup(`
        <div class="p-2 text-slate-900 dark:text-white">
          <div class="flex items-center gap-2 mb-2">
            <img src="${c.avatar}" class="w-8 h-8 rounded-full object-cover" />
            <div>
              <p class="font-bold text-xs">${c.name}</p>
              <p class="text-[11px] text-slate-500">${c.location.name || 'TP.HCM'}</p>
            </div>
          </div>
          <button onclick="window.radar.startChatWith('${c.id}')" class="w-full py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold">
            Nhắn tin ngay
          </button>
        </div>
      `);
      this.friendMarkers.push(marker);
    });
  }

  renderFriendsRadarList() {
    const listEl = document.getElementById('radar-friends-list');
    if (!listEl) return;

    const friends = (window.chat?.contacts || []).filter(c => !c.isGroup && c.location);

    listEl.innerHTML = friends.map(c => `
      <div class="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10 hover:border-indigo-500/40 transition-all cursor-pointer" onclick="window.radar.focusFriend('${c.id}')">
        <div class="flex items-center gap-3">
          <div class="relative">
            <img src="${c.avatar}" class="w-11 h-11 rounded-2xl object-cover" />
            <span class="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-900 ${c.status === 'online' ? 'status-online' : c.status === 'busy' ? 'status-busy' : 'status-offline'}"></span>
          </div>
          <div>
            <h5 class="font-semibold text-sm text-white">${c.name}</h5>
            <p class="text-xs text-indigo-400 font-medium">${c.location.distance || '1.2 km'} • ${c.location.name || 'TP.HCM'}</p>
          </div>
        </div>
        <div class="flex items-center gap-1.5">
          <button onclick="event.stopPropagation(); window.radar.startChatWith('${c.id}')" class="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white transition-colors" title="Nhắn tin">
            <i data-lucide="message-circle" class="w-4 h-4"></i>
          </button>
          <button onclick="event.stopPropagation(); window.radar.startCallWith('${c.id}')" class="p-2 rounded-xl bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white transition-colors" title="Gọi điện">
            <i data-lucide="phone" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  focusFriend(friendId) {
    const c = (window.chat?.contacts || []).find(x => x.id === friendId);
    if (c && c.location && this.map) {
      this.map.flyTo([c.location.lat, c.location.lng], 16, { duration: 1.2 });
    }
  }

  startChatWith(friendId) {
    if (window.app) window.app.switchTab('chat');
    if (window.chat) window.chat.selectChat(friendId);
  }

  startCallWith(friendId) {
    const c = (window.chat?.contacts || []).find(x => x.id === friendId);
    if (c && window.call) window.call.startCall(c, 'voice');
  }

  triggerRadarScan() {
    const sweep = document.getElementById('radar-sweep-effect');
    if (sweep) {
      sweep.classList.remove('hidden');
      setTimeout(() => sweep.classList.add('hidden'), 4000);
    }
    if (window.sounds) window.sounds.playKeystroke();
    if (window.app) window.app.showToast("Đang quét vị trí bạn bè xung quanh trong bán kính 10km... 📡");
  }

  updateTileTheme(isDark) {
    // OpenStreetMap tiles automatically theme via CSS filter in main.css
  }
}

window.radar = new RadarController();
