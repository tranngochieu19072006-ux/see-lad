/**
 * SEE LAD - Realistic 2-Way Daily Streak & Dynamic Animated Flame Engine
 * - Chuỗi chỉ tăng khi 2 người nhắn tin qua lại cho nhau trong ngày (Mỗi ngày tối đa +1 chuỗi)
 * - 5 Cấp độ Lửa Động Tinh Gọn & Hiệu ứng ngọn lửa sống động ở đầu ngọn lửa
 * - Tự động hết hạn sau 48 tiếng nếu không ai nhắn tin
 * - Bảng xếp hạng giữ chuỗi bền vững, gọn gàng, tinh tế
 */

class StreakController {
  constructor() {
    this.streaks = [];
    this.countdownTimer = null;
  }

  async init() {
    await this.loadStreaks();
    this.startLiveCountdown();
  }

  async loadStreaks() {
    const currentUserId = window.auth?.currentUser?.id || 'user_hieu';
    try {
      const res = await fetch(`/api/streaks?user_id=${encodeURIComponent(currentUserId)}`);
      const data = await res.json();
      if (data.streaks && Array.isArray(data.streaks)) {
        this.streaks = data.streaks;
      }
    } catch (e) {
      console.warn("Could not fetch streaks:", e);
    }

    // Sắp xếp người giữ chuỗi lâu nhất lên đầu
    this.streaks.sort((a, b) => {
      if (b.streak_count !== a.streak_count) return b.streak_count - a.streak_count;
      return (b.total_messages || 0) - (a.total_messages || 0);
    });

    this.renderStreakDashboard();
    this.updateSidebarBadge();
  }

  startLiveCountdown() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      let needsReRender = false;
      this.streaks.forEach(s => {
        if (s.status === 'active' && s.remaining_seconds > 0) {
          s.remaining_seconds = Math.max(0, s.remaining_seconds - 1);
          if (s.remaining_seconds === 0) {
            s.status = 'lost';
            s.streak_count = 0;
            needsReRender = true;
          }
        }
      });

      if (needsReRender) {
        this.renderStreakDashboard();
        this.updateSidebarBadge();
      } else {
        this.updateCountdownDOM();
      }
    }, 1000);
  }

  formatCountdown(sec) {
    const total = Math.max(0, Math.floor(sec));
    const h = String(Math.floor(total / 3600)).padStart(2, '0');
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${h}h : ${m}p : ${s}s`;
  }

  updateCountdownDOM() {
    this.streaks.forEach(s => {
      const el = document.getElementById(`streak-timer-${s.friend_id}`);
      if (el && s.status === 'active') {
        el.textContent = this.formatCountdown(s.remaining_seconds);
      }
    });
  }

  getFlameTier(count) {
    if (count >= 30) {
      return {
        name: 'Hoàng Kim Cực Quang',
        color: '#fbbf24',
        badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-400/40 shadow-amber-500/20',
        glowColor: 'rgba(251, 191, 36, 0.6)',
        icon: '🌟',
        label: 'Cực Quang (30+ ngày)'
      };
    }
    if (count >= 15) {
      return {
        name: 'Plasma Băng Giá',
        color: '#06b6d4',
        badgeBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40 shadow-cyan-500/20',
        glowColor: 'rgba(6, 182, 212, 0.6)',
        icon: '⚡',
        label: 'Plasma (15-29 ngày)'
      };
    }
    if (count >= 8) {
      return {
        name: 'Tím Huyền Ảo',
        color: '#c084fc',
        badgeBg: 'bg-purple-500/20 text-purple-300 border-purple-400/40 shadow-purple-500/20',
        glowColor: 'rgba(192, 132, 252, 0.6)',
        icon: '💜',
        label: 'Tím Huyền Ảo (8-14 ngày)'
      };
    }
    if (count >= 4) {
      return {
        name: 'Đỏ Nhiệt Huyết',
        color: '#f43f5e',
        badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-400/40 shadow-rose-500/20',
        glowColor: 'rgba(244, 63, 94, 0.6)',
        icon: '🔴',
        label: 'Nhiệt Huyết (4-7 ngày)'
      };
    }
    return {
      name: 'Cam Khởi Đầu',
      color: '#f97316',
      badgeBg: 'bg-orange-500/20 text-orange-300 border-orange-400/40 shadow-orange-500/20',
      glowColor: 'rgba(249, 115, 22, 0.5)',
      icon: '🔥',
      label: 'Khởi Đầu (1-3 ngày)'
    };
  }

  updateSidebarBadge() {
    const navBadge = document.getElementById('nav-streak-total-badge');
    const totalActive = this.streaks.reduce((acc, s) => acc + (s.status === 'active' ? (s.streak_count || 0) : 0), 0);
    if (navBadge) {
      if (totalActive > 0) {
        navBadge.textContent = totalActive > 999 ? '999+' : `${totalActive} 🔥`;
        navBadge.classList.remove('hidden');
      } else {
        navBadge.classList.add('hidden');
      }
    }
  }

  renderStreakDashboard() {
    const leaderboardEl = document.getElementById('streak-leaderboard-list');
    const restoreListEl = document.getElementById('streak-restore-list');
    const statTotalEl = document.getElementById('streak-stat-total');
    const statTopFriendEl = document.getElementById('streak-stat-top-friend');
    const statLostCountEl = document.getElementById('streak-stat-lost-count');

    const totalPoints = this.streaks.reduce((sum, s) => sum + (s.streak_count || 0), 0);
    const lostList = this.streaks.filter(s => s.status === 'lost');
    const topFriend = this.streaks.find(s => (s.streak_count || 0) > 0) || this.streaks[0];

    if (statTotalEl) statTotalEl.textContent = `${totalPoints} 🔥`;
    if (statTopFriendEl) statTopFriendEl.textContent = topFriend ? `${topFriend.friend_name} (${topFriend.streak_count || 0} ngày)` : 'Chưa có';
    if (statLostCountEl) statLostCountEl.textContent = lostList.length > 0 ? `${lostList.length} chuỗi bị gián đoạn` : 'Đang duy trì tốt';

    if (!leaderboardEl) return;

    if (this.streaks.length === 0) {
      leaderboardEl.innerHTML = `
        <div class="glass p-8 rounded-3xl text-center border border-white/10">
          <div class="w-16 h-16 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center mx-auto mb-3 text-3xl">🔥</div>
          <h4 class="font-bold text-base text-white mb-1">Chưa có bạn bè để tạo chuỗi</h4>
          <p class="text-xs text-slate-400 mb-4">Hãy kết bạn và cùng nhau nhắn tin qua lại hàng ngày để thắp sáng chuỗi lửa!</p>
          <button onclick="window.app.switchTab('chat')" class="btn-gradient px-5 py-2.5 rounded-2xl text-xs font-bold">Mở Đoạn Chat</button>
        </div>
      `;
      if (restoreListEl) restoreListEl.innerHTML = '';
      return;
    }

    // 1. Render Clean Persistent Leaderboard (Bảng xếp hạng gọn gàng)
    leaderboardEl.innerHTML = this.streaks.map((s, idx) => {
      const rank = idx + 1;
      const isLost = s.status === 'lost';
      const streakCount = s.streak_count || 0;
      const tier = this.getFlameTier(streakCount);
      const pct48h = Math.min(100, Math.max(4, Math.round(((s.remaining_seconds || 0) / (48 * 3600)) * 100)));
      const rankMedal = rank === 1 ? '🥇 TOP 1' : rank === 2 ? '🥈 TOP 2' : rank === 3 ? '🥉 TOP 3' : `#${rank}`;

      return `
        <div class="glass p-4 rounded-2xl border ${isLost ? 'border-rose-500/30 bg-rose-950/10' : (rank === 1 ? 'border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-slate-900/40 to-indigo-500/10' : 'border-white/10')} transition-all hover:border-orange-400/40 shadow-lg">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <!-- Left: Rank + Avatar + Friend Info -->
            <div class="flex items-center gap-3 min-w-0">
              <div class="flex flex-col items-center justify-center shrink-0">
                <span class="px-2 py-0.5 rounded-lg text-[9px] font-extrabold ${rank === 1 ? 'bg-amber-500 text-slate-950 shadow-sm' : 'bg-white/10 text-slate-300'}">${rankMedal}</span>
                <div class="relative mt-1">
                  <img src="${s.friend_avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + s.friend_id}" class="w-12 h-12 rounded-2xl object-cover border-2 ${isLost ? 'border-slate-600 grayscale' : 'border-orange-400'}" alt="${this.escapeHtml(s.friend_name)}" />
                  <span class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full ${isLost ? 'bg-slate-700' : 'bg-orange-500'} text-white text-[10px] flex items-center justify-center shadow">
                    ${isLost ? '❄️' : '🔥'}
                  </span>
                </div>
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h4 class="font-extrabold text-sm sm:text-base text-white truncate">${this.escapeHtml(s.friend_name)}</h4>
                  <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border shadow-sm ${isLost ? 'bg-slate-800 text-slate-400 border-slate-700' : tier.badgeBg}">
                    ${isLost ? 'Đã tắt lửa (Quá 48h)' : tier.label}
                  </span>
                </div>

                <div class="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                  <span>Hôm nay: ${s.has_messaged_today ? '✅ Cả hai đã tương tác' : '⏳ Cần nhắn tin để duy trì'}</span>
                  <span>•</span>
                  <span>Tổng trao đổi: <b class="text-white">${s.total_messages || 0}</b></span>
                </div>

                <!-- 48-Hour Countdown Bar -->
                <div class="mt-2 max-w-sm">
                  <div class="flex items-center justify-between text-[10px] mb-1">
                    <span class="text-slate-400 flex items-center gap-1">
                      <i data-lucide="clock" class="w-3 h-3 ${isLost ? 'text-rose-400' : 'text-amber-400'}"></i>
                      <span>${isLost ? 'Đã gián đoạn chuỗi' : 'Hết hạn sau:'}</span>
                    </span>
                    <span id="streak-timer-${s.friend_id}" class="font-mono font-bold ${isLost ? 'text-rose-400' : 'text-amber-300'}">
                      ${isLost ? '00h : 00p : 00s' : this.formatCountdown(s.remaining_seconds)}
                    </span>
                  </div>
                  <div class="w-full h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
                    <div class="h-full rounded-full transition-all duration-500 ${isLost ? 'bg-slate-700 w-full opacity-30' : 'bg-gradient-to-r from-orange-500 via-amber-400 to-emerald-400'}" style="width: ${isLost ? 100 : pct48h}%"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Right: Dynamic Animated Flame Badge & Chat Action -->
            <div class="flex items-center sm:flex-col sm:items-end justify-between gap-2.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/10">
              <!-- Compact Flame Tip Badge with Animated Glow -->
              <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-2xl ${isLost ? 'bg-white/5 border border-white/10' : 'bg-slate-900/80 border border-white/15'}" style="${!isLost ? `box-shadow: 0 0 16px ${tier.glowColor}; border-color: ${tier.color};` : ''}">
                <!-- Animated Flame Tip Icon -->
                <div class="relative flex items-center justify-center">
                  <svg class="w-6 h-6 ${!isLost ? 'animate-pulse' : 'opacity-40'}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <!-- Flame Tip Glow -->
                    <path d="M12 2C8.5 7 6 9.5 6 13.5C6 17 8.7 20 12 20C15.3 20 18 17 18 13.5C18 9.5 15.5 7 12 2Z" fill="${isLost ? '#94a3b8' : tier.color}" opacity="0.9"/>
                    <!-- Inner Flame Core Animation -->
                    <path d="M12 8C10.5 11 9 12.5 9 15C9 17 10.3 18.5 12 18.5C13.7 18.5 15 17 15 15C15 12.5 13.5 11 12 8Z" fill="#ffffff" opacity="0.75" class="${!isLost ? 'animate-ping' : ''}"/>
                  </svg>
                  ${!isLost && streakCount >= 30 ? '<span class="absolute -top-1 -right-1 text-[10px] animate-spin">✨</span>' : ''}
                </div>
                
                <span class="font-heading font-extrabold text-xl ${isLost ? 'text-slate-400' : 'text-white'}" style="${!isLost ? `color: ${tier.color}` : ''}">
                  ${streakCount}
                </span>
                <span class="text-[10px] font-extrabold uppercase text-slate-400">ngày</span>
              </div>

              <!-- Action: Just direct clean Chat button -->
              <button type="button" onclick="window.streak.openChatWithFriend('${s.friend_id}')" class="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95">
                <i data-lucide="message-square" class="w-3.5 h-3.5"></i>
                <span>Nhắn tin</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // 2. Recovery Center (Khôi phục chuỗi khi cần)
    if (restoreListEl) {
      if (lostList.length === 0) {
        restoreListEl.innerHTML = `
          <div class="p-3 text-center text-xs text-slate-400">
            Tất cả chuỗi với bạn bè đều đang được giữ lửa an toàn! 🔥
          </div>
        `;
      } else {
        restoreListEl.innerHTML = lostList.map(s => `
          <div class="p-3.5 rounded-2xl bg-black/40 border border-rose-500/30 flex items-center justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <img src="${s.friend_avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + s.friend_id}" class="w-10 h-10 rounded-2xl object-cover border border-white/10" />
              <div class="min-w-0">
                <h5 class="font-bold text-xs sm:text-sm text-white truncate">${this.escapeHtml(s.friend_name)}</h5>
                <p class="text-[11px] text-slate-400">Đã quá 48h không tương tác</p>
              </div>
            </div>
            <button onclick="window.streak.restoreStreak('${s.friend_id}')" class="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shrink-0 flex items-center gap-1 shadow transition-all">
              <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
              <span>Khôi phục chuỗi</span>
            </button>
          </div>
        `).join('');
      }
    }

    if (window.lucide) window.lucide.createIcons();
  }

  async restoreStreak(friendId) {
    const currentUserId = window.auth?.currentUser?.id || 'user_hieu';
    try {
      const res = await fetch('/api/streaks/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUserId, friend_id: friendId })
      });
      const data = await res.json();
      if (data.success) {
        if (window.app) window.app.showToast(data.message || "Đã khôi phục chuỗi thành công! 🔥");
        await this.loadStreaks();
      }
    } catch (e) {
      console.error("Restore streak error:", e);
    }
  }

  openChatWithFriend(friendId) {
    if (window.app) window.app.switchTab('chat');
    if (window.chat) window.chat.selectChat(friendId);
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

window.streak = new StreakController();
