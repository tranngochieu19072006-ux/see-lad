/**
 * SEE LAD - Master Application Orchestrator
 * Điều phối Theme Sáng/Tối, Điều hướng Tab, Thông báo Toast và Khởi chạy toàn hệ thống
 */

class AppController {
  constructor() {
    this.currentTheme = 'dark';
    this.activeTab = 'chat'; // 'chat' | 'radar' | 'hub' | 'qr' | 'schedule'
  }

  init() {
    // 1. Theme initialization
    const savedTheme = localStorage.getItem('see_lad_theme') || 'dark';
    this.setTheme(savedTheme, false);

    // 2. Tab switching & Global Navigation
    this.bindNavigation();

    // 3. Initialize all sub-modules
    if (window.sounds) window.sounds.init();
    if (window.intro) window.intro.init();
    if (window.auth) window.auth.init();
    if (window.chat) window.chat.init();
    if (window.streak) window.streak.init();
    if (window.call) window.call.init();
    if (window.recorder) window.recorder.init();
    if (window.qrStudio) window.qrStudio.init();
    if (window.fileHub) window.fileHub.init();
    if (window.chatBubble) window.chatBubble.init();
    if (window.scheduler) window.scheduler.init();
    if (window.feed) window.feed.init();

    // Lucide icons render
    if (window.lucide) window.lucide.createIcons();

    // Listen to theme toggle button
    const themeBtn = document.getElementById('btn-toggle-theme');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const next = this.currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(next);
      });
    }

    // Edit Profile Modal
    const btnOpenProfile = document.getElementById('btn-open-user-profile');
    const modalProfile = document.getElementById('modal-user-profile');
    const btnCloseProfile = document.getElementById('btn-close-user-profile');

    if (btnOpenProfile && modalProfile) {
      btnOpenProfile.addEventListener('click', () => modalProfile.classList.remove('hidden'));
      if (btnCloseProfile) btnCloseProfile.addEventListener('click', () => modalProfile.classList.add('hidden'));
    }
  }

  setTheme(theme, animate = true) {
    this.currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('see_lad_theme', theme);

    const themeIcon = document.getElementById('theme-toggle-icon');
    if (themeIcon) {
      themeIcon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
      if (window.lucide) window.lucide.createIcons();
    }

    // Update Leaflet tile if map is ready
    if (window.radar && typeof window.radar.updateTileTheme === 'function') {
      try {
        window.radar.updateTileTheme(theme === 'dark');
      } catch (err) {
        console.warn("Radar updateTileTheme error:", err);
      }
    }

    if (animate && window.app) {
      this.showToast(`Đã chuyển sang giao diện: ${theme === 'dark' ? 'Tối (Dark Mode)' : 'Sáng (Light Mode)'}`);
    }
  }

  bindNavigation() {
    document.querySelectorAll('.app-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (tab === 'profile' && window.feed) {
          window.feed.viewingUserId = null;
          window.feed.viewingUser = null;
          window.feed.viewingUserPosts = [];
        }
        this.switchTab(tab);
      });
    });
  }

  switchTab(tabName) {
    this.activeTab = tabName;

    // Update active nav button styles
    document.querySelectorAll('.app-nav-btn').forEach(btn => {
      const tab = btn.getAttribute('data-tab');
      if (tab === tabName) {
        btn.classList.add('active');
        btn.classList.remove('text-slate-400');
      } else {
        btn.classList.remove('active');
        btn.classList.add('text-slate-400');
      }
    });

    // Toggle content views
    const views = {
      'chat': document.getElementById('tab-view-chat'),
      'feed': document.getElementById('tab-view-feed'),
      'profile': document.getElementById('tab-view-profile'),
      'streak': document.getElementById('tab-view-streak'),
      'radar': document.getElementById('tab-view-radar'),
      'hub': document.getElementById('tab-view-hub'),
      'qr': document.getElementById('tab-view-qr'),
      'schedule': document.getElementById('tab-view-schedule')
    };

    Object.keys(views).forEach(k => {
      if (views[k]) {
        if (k === tabName) {
          views[k].classList.remove('hidden');
          views[k].classList.add('animate-fade-in');
        } else {
          views[k].classList.add('hidden');
        }
      }
    });

    const mainNav = document.querySelector('nav');
    const mainHeader = document.querySelector('header');
    if (tabName !== 'chat') {
      if (mainNav) mainNav.classList.remove('hidden');
      if (mainHeader) mainHeader.classList.remove('hidden');
    } else {
      if (window.chat) window.chat.syncResponsiveChatLayout();
    }

    if (tabName === 'feed' && window.feed) {
      window.feed.loadFeed();
    }

    if (tabName === 'profile' && window.feed) {
      window.feed.renderProfileCard();
      window.feed.renderProfilePosts();
      window.feed.detectRealLocation();
    }

    // Special trigger for Leaflet when radar becomes visible
    if (tabName === 'radar' && window.radar) {
      setTimeout(() => {
        if (window.radar.map) {
          window.radar.map.invalidateSize();
        } else {
          window.radar.init();
        }
      }, 100);
    }

    if (tabName === 'streak' && window.streak) {
      window.streak.loadStreaks();
    }

    if (tabName === 'schedule' && window.scheduler) {
      window.scheduler.populateRecipients();
    }

    if (tabName === 'qr' && window.qrStudio) {
      window.qrStudio.updateQRText();
      window.qrStudio.renderQR();
    }
  }

  showToast(message, type = 'info') {
    const toast = document.getElementById('global-toast');
    const toastText = document.getElementById('global-toast-text');
    const iconWrap = document.getElementById('global-toast-icon-wrap');
    const toastIcon = document.getElementById('global-toast-icon');

    if (!toast || !toastText) return;

    toastText.textContent = message;

    if (iconWrap) {
      const iconName = type === 'warning' ? 'alert-circle' : (type === 'error' ? 'alert-triangle' : 'sparkles');
      const iconColor = type === 'warning' ? 'text-amber-400' : (type === 'error' ? 'text-rose-400' : 'text-indigo-400');
      iconWrap.innerHTML = `<i id="global-toast-icon" data-lucide="${iconName}" class="w-4 h-4 ${iconColor} shrink-0"></i>`;
      if (window.lucide) window.lucide.createIcons();
    } else if (toastIcon) {
      try {
        const cls = type === 'warning' ? 'w-4 h-4 text-amber-400 shrink-0' : 'w-4 h-4 text-indigo-400 shrink-0';
        toastIcon.setAttribute('class', cls);
      } catch (err) {
        console.warn("Could not set toastIcon class:", err);
      }
    }

    toast.classList.remove('-translate-y-16', 'opacity-0', 'pointer-events-none');
    toast.classList.add('translate-y-0', 'opacity-100');

    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.add('-translate-y-16', 'opacity-0', 'pointer-events-none');
      toast.classList.remove('translate-y-0', 'opacity-100');
    }, 3200);
  }
}

window.app = new AppController();

// Boot application upon DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.app.init();
  });
} else {
  window.app.init();
}
