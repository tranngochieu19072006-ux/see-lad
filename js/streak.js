/**
 * SEE LAD - Unlimited Fire Streak Engine (Cày Chuỗi Lửa Vô Hạn 🔥)
 * - Xếp hạng những người bạn nhắn tin nhiều nhất
 * - Chuỗi vô hạn (Cày bao nhiêu cũng được, tự động +1 khi nhắn tin hoặc bấm Cày Chuỗi)
 * - Tự động đếm ngược và mất chuỗi sau 48 tiếng (172.800 giây) không tương tác
 * - Trung tâm Khôi phục chuỗi hiển thị rõ tên từng người ("Khôi phục chuỗi với [Tên người đó]")
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

    // Đồng bộ thêm từ danh bạ chat nếu có bạn bè chưa nằm trong danh sách
    if (window.chat && Array.isArray(window.chat.contacts)) {
      const directFriends = window.chat.contacts.filter(c => !c.isGroup);
      directFriends.forEach(f => {
        if (!this.streaks.some(s => s.friend_id === f.id)) {
          this.streaks.push({
            friend_id: f.id,
            friend_name: f.name,
            friend_username: f.username || 'user',
            friend_avatar: f.avatar,
            friend_status: f.status || 'online',
            streak_count: f.streak_count || 1,
            total_messages: f.streak_count || 1,
            remaining_seconds: 48 * 3600,
            status: f.streak_status || 'active',
            lost_streak_count: f.lost_streak_count || 0,
            restored_count: 0
          });
        }
      });
    }

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
            s.lost_streak_count = Math.max(s.streak_count, s.lost_streak_count || 0, 1);
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

  getStreakTier(count) {
    if (count >= 100) return { label: '👑 Huyền Thoại Vô Hạn', color: 'from-amber-400 via-orange-500 to-rose-500', badge: 'bg-amber-500/20 text-amber-300 border-amber-400/40' };
    if (count >= 30) return { label: '💎 Lửa Kim Cương', color: 'from-cyan-400 via-indigo-500 to-purple-500', badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40' };
    if (count >= 10) return { label: '⚡ Siêu Bùng Nổ', color: 'from-orange-500 via-rose-500 to-pink-500', badge: 'bg-rose-500/20 text-rose-300 border-rose-400/40' };
    return { label: '🔥 Chiến Thần Cày Chuỗi', color: 'from-orange-400 to-red-500', badge: 'bg-orange-500/20 text-orange-300 border-orange-400/40' };
  }

  updateSidebarBadge() {
    const navBadge = document.getElementById('nav-streak-total-badge');
    const totalActive = this.streaks.reduce((acc, s) => acc + (s.status === 'active' ? (s.streak_count || 0) : 0), 0);
    if (navBadge) {
      navBadge.textContent = totalActive > 999 ? '999+' : `${totalActive}🔥`;
      if (totalActive > 0) navBadge.classList.remove('hidden');
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
    const topFriend = this.streaks[0];

    if (statTotalEl) statTotalEl.textContent = `${totalPoints} 🔥`;
    if (statTopFriendEl) statTopFriendEl.textContent = topFriend ? `${topFriend.friend_name} (${topFriend.streak_count} 🔥)` : 'Chưa có';
    if (statLostCountEl) statLostCountEl.textContent = lostList.length > 0 ? `${lostList.length} chuỗi cần khôi phục` : 'Tất cả đang giữ lửa';

    if (!leaderboardEl) return;

    if (this.streaks.length === 0) {
      leaderboardEl.innerHTML = `
        <div class="glass p-8 rounded-3xl text-center border border-white/10">
          <div class="w-16 h-16 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center mx-auto mb-3 text-3xl">🔥</div>
          <h4 class="font-bold text-base text-white mb-1">Chưa có bạn bè để bắt đầu Cày Chuỗi</h4>
          <p class="text-xs text-slate-400 mb-4">Hãy kết bạn và nhắn tin để bắt đầu thắp lửa chuỗi vô hạn 48h!</p>
          <button onclick="window.app.switchTab('chat')" class="btn-gradient px-5 py-2.5 rounded-2xl text-xs font-bold">Mở Hộp Thư Kết Bạn</button>
        </div>
      `;
      if (restoreListEl) restoreListEl.innerHTML = '';
      return;
    }

    // 1. Render Leaderboard (Những ai nhắn tin nhiều nhất)
    leaderboardEl.innerHTML = this.streaks.map((s, idx) => {
      const rank = idx + 1;
      const isLost = s.status === 'lost';
      const tier = this.getStreakTier(s.streak_count || 0);
      const pct48h = Math.min(100, Math.max(4, Math.round(((s.remaining_seconds || 0) / (48 * 3600)) * 100)));
      const rankMedal = rank === 1 ? '🥇 TOP 1' : rank === 2 ? '🥈 TOP 2' : rank === 3 ? '🥉 TOP 3' : `#${rank}`;

      return `
        <div class="glass p-4 sm:p-5 rounded-3xl border ${isLost ? 'border-rose-500/40 bg-rose-950/20' : (rank === 1 ? 'border-orange-500/40 bg-gradient-to-r from-orange-500/10 via-slate-900/60 to-indigo-500/10' : 'border-white/10')} transition-all hover:border-orange-400/50 shadow-xl">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <!-- Left: Rank + Avatar + Friend Info -->
            <div class="flex items-center gap-3.5 min-w-0">
              <div class="flex flex-col items-center justify-center shrink-0">
                <span class="px-2 py-0.5 rounded-lg text-[10px] font-extrabold ${rank === 1 ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30' : 'bg-white/10 text-slate-300'}">${rankMedal}</span>
                <div class="relative mt-1.5">
                  <img src="${s.friend_avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + s.friend_id}" class="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl object-cover border-2 ${isLost ? 'border-rose-500 grayscale' : 'border-orange-400'}" alt="${this.escapeHtml(s.friend_name)}" />
                  <span class="absolute -bottom-1 -right-1 w-6 h-6 rounded-full ${isLost ? 'bg-rose-600' : 'bg-gradient-to-tr from-orange-500 to-amber-400'} text-white text-xs flex items-center justify-center shadow-md">
                    ${isLost ? '❄️' : '🔥'}
                  </span>
                </div>
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h4 class="font-heading font-extrabold text-base sm:text-lg text-white truncate">${this.escapeHtml(s.friend_name)}</h4>
                  <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${isLost ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : tier.badge}">
                    ${isLost ? '⚠️ Đã mất chuỗi (Quá 48h)' : tier.label}
                  </span>
                </div>

                <div class="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-300">
                  <span class="flex items-center gap-1 font-semibold text-orange-300">
                    <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
                    <span>Tổng tương tác: <b>${s.total_messages || 1}</b> tin nhắn</span>
                  </span>
                  <span class="text-slate-600">•</span>
                  <span class="text-[11px] text-cyan-300 font-mono">Giới hạn: Vô hạn ∞</span>
                </div>

                <!-- 48-Hour Countdown Bar -->
                <div class="mt-2.5">
                  <div class="flex items-center justify-between text-[11px] mb-1">
                    <span class="text-slate-400 flex items-center gap-1">
                      <i data-lucide="clock" class="w-3 h-3 ${isLost ? 'text-rose-400' : 'text-amber-400'}"></i>
                      <span>${isLost ? `Đã quá 48 tiếng (Mất mốc ${s.lost_streak_count} 🔥)` : 'Tự động mất chuỗi sau (48h):'}</span>
                    </span>
                    <span id="streak-timer-${s.friend_id}" class="font-mono font-bold ${isLost ? 'text-rose-400' : 'text-amber-300'}">
                      ${isLost ? '00h : 00p : 00s (Đã tắt)' : this.formatCountdown(s.remaining_seconds)}
                    </span>
                  </div>
                  <div class="w-full h-2 bg-black/40 rounded-full overflow-hidden border border-white/5">
                    <div class="h-full rounded-full transition-all duration-500 ${isLost ? 'bg-rose-600 w-full opacity-40' : 'bg-gradient-to-r from-orange-500 via-amber-400 to-emerald-400'}" style="width: ${isLost ? 100 : pct48h}%"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Right: Giant Streak Counter + Action Buttons -->
            <div class="flex sm:flex-col items-center sm:items-end justify-between gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/10 shrink-0">
              <div class="text-left sm:text-right">
                <div class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl ${isLost ? 'bg-rose-500/15 border border-rose-500/30' : 'bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-orange-400/40'}">
                  <span class="text-xl sm:text-2xl ${isLost ? '' : 'animate-bounce'}">${isLost ? '💔' : '🔥'}</span>
                  <span class="font-heading font-extrabold text-xl sm:text-2xl ${isLost ? 'text-rose-400 line-through' : 'text-amber-300'}">
                    ${isLost ? s.lost_streak_count : s.streak_count}
                  </span>
                  <span class="text-[10px] font-extrabold uppercase tracking-wider text-orange-200">Chuỗi</span>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                ${isLost ? `
                  <button type="button" onclick="window.streak.restoreStreak('${s.friend_id}')" class="px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-500 via-orange-500 to-amber-500 hover:brightness-110 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-lg shadow-orange-500/30 animate-pulse">
                    <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
                    <span>Khôi phục chuỗi với ${this.escapeHtml(s.friend_name)}</span>
                  </button>
                ` : `
                  <button type="button" onclick="window.streak.grindStreak('${s.friend_id}')" class="px-3.5 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-pink-600 hover:brightness-110 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-lg shadow-orange-500/25 transition-transform active:scale-95">
                    <i data-lucide="flame" class="w-3.5 h-3.5"></i>
                    <span>Cày chuỗi (+1)</span>
                  </button>
                  <button type="button" onclick="window.streak.openChatWithFriend('${s.friend_id}')" class="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center gap-1.5 transition-all">
                    <i data-lucide="message-square" class="w-3.5 h-3.5 text-cyan-400"></i>
                    <span>Nhắn tin</span>
                  </button>
                  <button type="button" onclick="window.streak.simulateExpire('${s.friend_id}')" class="px-2.5 py-2 rounded-xl bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 text-[11px] font-semibold transition-all" title="Giả lập quá 48h để thử tính năng Khôi phục chuỗi">
                    <i data-lucide="timer-off" class="w-3.5 h-3.5"></i>
                  </button>
                `}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // 2. Render Recovery Center ("Khôi phục chuỗi với [Tên người đó]")
    if (restoreListEl) {
      restoreListEl.innerHTML = this.streaks.map(s => {
        const isLost = s.status === 'lost';
        const targetStreakNum = isLost ? Math.max(s.lost_streak_count || 1, 1) : (s.streak_count || 1);
        return `
          <div class="p-4 rounded-2xl ${isLost ? 'bg-gradient-to-r from-rose-950/60 via-orange-950/40 to-slate-900/70 border-2 border-orange-500/50 shadow-lg shadow-orange-500/10' : 'bg-black/30 border border-white/10'} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all">
            <div class="flex items-center gap-3 min-w-0">
              <div class="relative shrink-0">
                <img src="${s.friend_avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + s.friend_id}" class="w-11 h-11 rounded-2xl object-cover border ${isLost ? 'border-rose-400' : 'border-white/15'}" />
                <span class="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${isLost ? 'bg-rose-600 text-white' : 'bg-orange-500 text-white'}">
                  ${targetStreakNum}🔥
                </span>
              </div>
              <div class="min-w-0">
                <p class="font-bold text-xs sm:text-sm text-white truncate">
                  Khôi phục chuỗi với <span class="text-amber-300 font-extrabold">${this.escapeHtml(s.friend_name)}</span>
                </p>
                <p class="text-[11px] ${isLost ? 'text-rose-300 font-medium' : 'text-slate-400'} mt-0.5">
                  ${isLost
                    ? `⚠️ Chuỗi ${targetStreakNum} 🔥 đã bị mất sau 48 tiếng! Bấm để khôi phục ngay lập tức.`
                    : `Đang giữ chuỗi ${targetStreakNum} 🔥 (Còn ${Math.ceil((s.remaining_seconds || 0) / 3600)}h / 48h) • Bấm để làm mới 48h & cộng chuỗi`}
                </p>
              </div>
            </div>

            <button type="button" onclick="window.streak.restoreStreak('${s.friend_id}')" class="w-full sm:w-auto px-4 py-2.5 rounded-xl ${isLost ? 'bg-gradient-to-r from-orange-500 via-amber-500 to-rose-500 text-white shadow-lg shadow-orange-500/30' : 'bg-white/10 hover:bg-orange-500/25 text-amber-300 border border-orange-400/30'} text-xs font-extrabold flex items-center justify-center gap-2 shrink-0 transition-all active:scale-95">
              <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
              <span>Khôi phục chuỗi với ${this.escapeHtml(s.friend_name)}</span>
            </button>
          </div>
        `;
      }).join('');
    }

    if (window.lucide) window.lucide.createIcons();
  }

  async grindStreak(friendId) {
    const currentUserId = window.auth?.currentUser?.id || 'user_hieu';
    try {
      const res = await fetch('/api/streaks/grind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUserId, friend_id: friendId })
      });
      const data = await res.json();
      if (data.success) {
        if (window.sounds) window.sounds.playMessageSent();
        if (window.confetti) {
          window.confetti({ particleCount: 35, spread: 60, origin: { y: 0.7 } });
        }
        if (window.app) {
          window.app.showToast(`🔥 Đã cày chuỗi thành công với ${data.friend_name}! Chuỗi hiện tại: ${data.streak_count} 🔥`);
        }
        await this.loadStreaks();
        if (window.chat) await window.chat.loadContacts();
      }
    } catch (e) {
      console.error("Grind streak error:", e);
    }
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
        if (window.sounds) window.sounds.playTypewriterBell();
        if (window.confetti) {
          window.confetti({ particleCount: 70, spread: 80, origin: { y: 0.6 } });
        }
        if (window.app) {
          window.app.showToast(`🔄🔥 Đã khôi phục chuỗi với ${data.friend_name} (${data.restored_streak} 🔥) & làm mới 48 tiếng!`);
        }
        await this.loadStreaks();
        if (window.chat) await window.chat.loadContacts();
      }
    } catch (e) {
      console.error("Restore streak error:", e);
    }
  }

  async simulateExpire(friendId) {
    const currentUserId = window.auth?.currentUser?.id || 'user_hieu';
    try {
      await fetch('/api/streaks/simulate-expire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUserId, friend_id: friendId })
      });
      const target = this.streaks.find(s => s.friend_id === friendId);
      const fname = target ? target.friend_name : 'bạn bè';
      if (window.app) {
        window.app.showToast(`⏳ Đã giả lập quá hạn 48 tiếng! Bây giờ bạn có thể bấm "Khôi phục chuỗi với ${fname}"`, "warning");
      }
      await this.loadStreaks();
      if (window.chat) await window.chat.loadContacts();
    } catch (e) {
      console.error(e);
    }
  }

  openChatWithFriend(friendId) {
    if (window.app) window.app.switchTab('chat');
    if (window.chat) window.chat.selectChat(friendId);
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

window.streak = new StreakController();
