/**
 * SEE LAD - Real-Time Authentication & User Controller
 * Kết nối API Backend thật và duy trì phiên đăng nhập
 */

class AuthController {
  constructor() {
    this.currentUser = null;
    this.status = 'online';
    this.eventSource = null;
  }

  async init() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('logout') === '1') {
      localStorage.removeItem('see_lad_user');
      localStorage.removeItem('seelad_current_user');
      document.cookie = "see_lad_user_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
      document.documentElement.classList.remove('user-logged-in');
      this.currentUser = null;
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } else {
      const savedUser = localStorage.getItem('see_lad_user');
      if (savedUser) {
        try {
          this.currentUser = JSON.parse(savedUser);
          this.status = this.currentUser.status || 'online';
        } catch (e) {
          this.currentUser = null;
        }
      }
    }

    this.bindEvents();

    // Tự động điền email và mật khẩu mặc định để người dùng đăng nhập trực tiếp tức thì
    const emailInput = document.getElementById('login-email');
    const pwInput = document.getElementById('login-password');
    if (emailInput && !emailInput.value) {
      emailInput.value = localStorage.getItem('see_lad_last_email') || 'tranngochieu19072006@gmail.com';
    }
    if (pwInput && !pwInput.value) {
      pwInput.value = '123456';
    }

    if (this.currentUser) {
      this.status = 'online';
      this.updateUserUI();
      this.startRealtimeStream();

      // Vào thẳng giao diện ứng dụng chính
      const introScreen = document.getElementById('intro-screen');
      const authScreen = document.getElementById('auth-screen');
      const mainApp = document.getElementById('main-app');
      if (introScreen) introScreen.classList.add('hidden');
      if (authScreen) authScreen.classList.add('hidden');
      if (mainApp) {
        mainApp.classList.remove('hidden');
        mainApp.style.opacity = '1';
        mainApp.style.transform = 'none';
      }

      if (window.chat) {
        window.chat.loadContacts();
      }
    }

    // Tự động chuyển sang Ngoại tuyến (Offline - chấm đỏ) khi đóng tab / ứng dụng
    window.addEventListener('beforeunload', () => {
      if (this.currentUser) {
        const payload = JSON.stringify({ user_id: this.currentUser.id, status: 'offline' });
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/auth/status', new Blob([payload], { type: 'application/json' }));
        }
      }
    });
  }

  bindEvents() {
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');
    const linkToRegister = document.getElementById('link-to-register');
    const linkToLogin = document.getElementById('link-to-login');

    // Chuyển đổi giữa Đăng nhập & Đăng ký
    if (linkToRegister && formLogin && formRegister) {
      linkToRegister.addEventListener('click', (e) => {
        e.preventDefault();
        formLogin.classList.add('hidden');
        formRegister.classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons();
      });
    }

    if (linkToLogin && formLogin && formRegister) {
      linkToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        formRegister.classList.add('hidden');
        formLogin.classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons();
      });
    }

    // Nút ẩn/hiện mật khẩu
    const loginTogglePw = document.getElementById('login-toggle-pw');
    const loginPassword = document.getElementById('login-password');
    if (loginTogglePw && loginPassword) {
      loginTogglePw.addEventListener('click', () => {
        const isPw = loginPassword.type === 'password';
        loginPassword.type = isPw ? 'text' : 'password';
        loginTogglePw.innerHTML = isPw ? '<i data-lucide="eye-off" class="w-4 h-4"></i>' : '<i data-lucide="eye" class="w-4 h-4"></i>';
        if (window.lucide) window.lucide.createIcons();
      });
    }

    const regTogglePw = document.getElementById('reg-toggle-pw');
    const regPassword = document.getElementById('reg-password');
    if (regTogglePw && regPassword) {
      regTogglePw.addEventListener('click', () => {
        const isPw = regPassword.type === 'password';
        regPassword.type = isPw ? 'text' : 'password';
        regTogglePw.innerHTML = isPw ? '<i data-lucide="eye-off" class="w-4 h-4"></i>' : '<i data-lucide="eye" class="w-4 h-4"></i>';
        if (window.lucide) window.lucide.createIcons();
      });
    }

    // Nút mạng xã hội: Google, Facebook, GitHub - Chuyển hướng trực tiếp tới trang ủy quyền chính thức
    document.querySelectorAll('.btn-social-auth').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const provider = btn.getAttribute('data-provider') || 'google';
        const providerNames = { google: 'Google', facebook: 'Facebook', github: 'GitHub' };
        if (window.app) {
          window.app.showToast(`Đang chuyển hướng sang trang đăng nhập ${providerNames[provider] || provider}... 🚀`);
        }
        window.location.href = `/api/oauth/login/${provider}`;
      });
    });

    // Xử lý gửi Form Đăng nhập
    if (formLogin) {
      formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById('login-email');
        const pwInput = document.getElementById('login-password');
        const submitBtn = document.getElementById('btn-submit-login') || formLogin.querySelector('button[type="submit"]');
        const submitText = document.getElementById('btn-login-text') || submitBtn;

        let email = emailInput ? emailInput.value.trim() : '';
        const pw = pwInput ? pwInput.value : '123456';

        // Tự động dùng tài khoản mặc định nếu người dùng để trống
        if (!email) {
          email = localStorage.getItem('see_lad_last_email') || 'tranngochieu19072006@gmail.com';
          if (emailInput) emailInput.value = email;
        }

        localStorage.setItem('see_lad_last_email', email);

        const prevHtml = submitText ? submitText.innerHTML : 'Đăng nhập';
        if (submitBtn) submitBtn.disabled = true;
        if (submitText) submitText.innerHTML = '<span>Đang đăng nhập... ⏳</span>';

        try {
          await this.login(email, pw);
        } catch (err) {
          console.error("Login submit error:", err);
        } finally {
          if (submitBtn) submitBtn.disabled = false;
          if (submitText) submitText.innerHTML = prevHtml;
        }
      });
    }

    // Xử lý gửi Form Đăng ký (đúng 4 trường theo giao diện yêu cầu)
    if (formRegister) {
      formRegister.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const pw = document.getElementById('reg-password').value;
        const terms = document.getElementById('reg-terms');
        const avatar = document.getElementById('reg-avatar-preview')?.src;

        if (!name) return alert("Vui lòng nhập họ và tên của bạn!");
        if (!email) return alert("Vui lòng nhập địa chỉ email!");
        if (!pw) return alert("Vui lòng tạo mật khẩu!");
        if (terms && !terms.checked) return alert("Vui lòng đồng ý với Điều khoản sử dụng và Chính sách bảo mật!");

        await this.register(name, email, pw, avatar);
      });
    }

    const statusBtn = document.getElementById('current-status-btn');
    const statusMenu = document.getElementById('status-dropdown-menu');

    if (statusBtn && statusMenu) {
      statusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        statusMenu.classList.toggle('hidden');
      });

      document.addEventListener('click', () => {
        statusMenu.classList.add('hidden');
      });

      document.querySelectorAll('.status-option').forEach((opt) => {
        opt.addEventListener('click', () => {
          const newStatus = opt.getAttribute('data-status');
          this.setStatus(newStatus);
          statusMenu.classList.add('hidden');
        });
      });
    }

    // Tải ảnh đại diện trong form Đăng ký mới
    const regAvatarInput = document.getElementById('reg-avatar-file-input');
    const regAvatarPreview = document.getElementById('reg-avatar-preview');
    if (regAvatarInput && regAvatarPreview) {
      regAvatarInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Preview ngay lập tức trên giao diện
        const reader = new FileReader();
        reader.onload = (event) => {
          regAvatarPreview.src = event.target.result;
        };
        reader.readAsDataURL(file);

        // Upload lên máy chủ thật
        const formData = new FormData();
        formData.append('file', file);
        try {
          const res = await fetch('/api/upload', { method: 'POST', body: formData });
          const data = await res.json();
          if (data.fileUrl) {
            regAvatarPreview.src = data.fileUrl;
            if (window.app) window.app.showToast("Đã tải ảnh đại diện lên thành công! 📸");
          }
        } catch (err) {
          console.error("Upload avatar error:", err);
        }
      });
    }

    // Tải ảnh đại diện trực tiếp trên giao diện chính hoặc Cài đặt hồ sơ cá nhân
    const handleAvatarUpload = async (file) => {
      if (!file) return;
      if (window.app) window.app.showToast("Đang tải ảnh đại diện lên máy chủ... ⏳");

      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.fileUrl && this.currentUser) {
          this.currentUser.avatar = data.fileUrl;
          this.saveUser();
          this.updateUserUI();

          // Cập nhật vào cơ sở dữ liệu thật seelad.db
          await fetch('/api/auth/update_avatar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: this.currentUser.id, avatar: data.fileUrl })
          });

          if (window.app) window.app.showToast("Đã cập nhật ảnh đại diện của bạn thành công! 📸");
        }
      } catch (err) {
        console.error("Profile avatar update error:", err);
      }
    };

    const quickAvatarInput = document.getElementById('quick-avatar-upload-input');
    if (quickAvatarInput) {
      quickAvatarInput.addEventListener('change', (e) => handleAvatarUpload(e.target.files[0]));
    }

    const avatarInput = document.getElementById('profile-avatar-input');
    if (avatarInput) {
      avatarInput.addEventListener('change', (e) => handleAvatarUpload(e.target.files[0]));
    }
  }

  async login(emailOrUsername, password) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailOrUsername, username: emailOrUsername, password })
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Đăng nhập thất bại");
        return;
      }

      this.currentUser = data.user;
      this.status = this.currentUser.status || 'online';
      this.saveUser();
      this.updateUserUI();
      this.startRealtimeStream();
      this.saveAndEnter();

      if (window.chat) window.chat.loadContacts();
    } catch (e) {
      console.warn("Backend not reached, falling back:", e);
      this.currentUser = window.SEE_LAD_CONFIG?.currentUser || { id: 'user_guest', name: 'Người dùng SEE LAD', username: 'seelad_user' };
      this.saveAndEnter();
    }
  }

  async register(name, email, password, avatar) {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, avatar })
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Đăng ký thất bại");
        return;
      }

      this.currentUser = data.user;
      this.status = 'online';
      this.saveUser();
      this.updateUserUI();
      this.startRealtimeStream();
      this.saveAndEnter();

      if (window.chat) window.chat.loadContacts();
    } catch (e) {
      alert("Lỗi kết nối máy chủ: " + e.message);
    }
  }

  async handleDirectSocialLogin(provider) {
    const emailInput = document.getElementById('login-email');
    const enteredEmail = emailInput ? emailInput.value.trim() : '';

    let name = 'Trần Ngọc Hiếu';
    let email = 'tranngochieu19072006@gmail.com';
    let avatar = 'https://ui-avatars.com/api/?name=Trần+Ngọc+Hiếu&background=4285F4&color=fff&size=200&bold=true';

    // Nếu người dùng đã gõ email riêng vào ô email thì dùng email đó
    if (enteredEmail && enteredEmail.includes('@')) {
      email = enteredEmail;
      const raw = email.split('@')[0];
      name = raw.charAt(0).toUpperCase() + raw.slice(1);
      avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=38e1e8&color=000&size=200&bold=true`;
    }

    const providerNames = { google: 'Google', facebook: 'Facebook', github: 'GitHub' };
    const pName = providerNames[provider] || provider;

    if (window.app) window.app.showToast(`Đang đăng nhập trực tiếp qua ${pName}... ⚡`);

    await this.socialLogin(provider, name, email, avatar);
  }

  async socialLogin(provider, name, email, avatar) {
    if (window.app) window.app.showToast(`Đang xác thực bảo mật với ${provider.toUpperCase()}... 🔒`);

    try {
      const res = await fetch('/api/auth/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, name, email, avatar })
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Xác thực xã hội thất bại");
        return;
      }

      this.currentUser = data.user;
      this.status = 'online';
      this.saveUser();
      this.updateUserUI();
      this.startRealtimeStream();
      this.saveAndEnter();

      if (window.chat) window.chat.loadContacts();
      if (window.app) {
        const provName = provider === 'google' ? 'Google' : provider === 'facebook' ? 'Facebook' : 'GitHub';
        window.app.showToast(`Đăng nhập thành công với tài khoản ${provName}! 🎉`);
      }
    } catch (e) {
      alert("Lỗi kết nối xác thực mạng xã hội: " + e.message);
    }
  }

  startRealtimeStream() {
    if (!this.currentUser) return;
    if (this.eventSource) {
      try { this.eventSource.close(); } catch (e) {}
    }
    if (this._sseReconnectTimer) {
      clearTimeout(this._sseReconnectTimer);
      this._sseReconnectTimer = null;
    }

    try {
      const sinceTs = this.lastStreamTs || 0;
      this.eventSource = new EventSource(`/api/stream?user_id=${encodeURIComponent(this.currentUser.id)}&since_ts=${sinceTs}`);

      this.eventSource.onopen = () => {
        // SSE connection live
      };

      this.eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.server_ts) {
            this.lastStreamTs = data.server_ts;
          } else {
            this.lastStreamTs = Date.now() / 1000;
          }
          this.handleRealtimeEvent(data);
        } catch (err) {
          console.error("Invalid SSE data", err);
        }
      };

      this.eventSource.onerror = () => {
        try { this.eventSource.close(); } catch (e) {}
        this.eventSource = null;
        // Fast reconnect after 2.5s
        if (!this._sseReconnectTimer) {
          this._sseReconnectTimer = setTimeout(() => {
            this.startRealtimeStream();
          }, 2500);
        }
      };
    } catch (e) {
      console.warn("SSE not supported or server down", e);
    }

    if (!this._hasBoundVisibilitySync) {
      this._hasBoundVisibilitySync = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.startRealtimeStream();
          if (window.chat && typeof window.chat.triggerLiveSync === 'function') {
            window.chat.triggerLiveSync();
          }
        }
      });
      window.addEventListener('focus', () => {
        if (!this.eventSource || this.eventSource.readyState === EventSource.CLOSED) {
          this.startRealtimeStream();
        }
        if (window.chat && typeof window.chat.triggerLiveSync === 'function') {
          window.chat.triggerLiveSync();
        }
      });
      window.addEventListener('online', () => {
        this.startRealtimeStream();
        if (window.chat && typeof window.chat.triggerLiveSync === 'function') {
          window.chat.triggerLiveSync();
        }
      });
    }
  }

  handleRealtimeEvent(data) {
    if (data.type === 'new_message') {
      const msg = data.message;
      if (window.chat) {
        window.chat.receiveRealtimeMessage(msg);
      }
      if (window.sounds) window.sounds.playMessageReceived();
    } else if (data.type === 'call_signal') {
      if (window.call) {
        window.call.handleIncomingSignal(data);
      }
    } else if (data.type === 'status_update') {
      if (window.chat) {
        window.chat.updateUserOnlineStatus(data.user_id, data.status);
      }
    } else if (data.type === 'friend_added') {
      if (window.chat) {
        window.chat.loadContacts();
        window.chat.loadFriendRequests();
      }
      if (window.app) window.app.showToast("Bạn có một người bạn mới vừa kết nối! 🎉");
    } else if (data.type === 'friend_request_received') {
      if (window.chat) {
        window.chat.loadFriendRequests();
      }
      if (window.sounds) window.sounds.playTypewriterBell();
      const msgTxt = data.message ? `: "${data.message}"` : '';
      if (window.app) window.app.showToast(`🔔 ${data.sender_name} gửi lời mời kết bạn${msgTxt}`);
    } else if (data.type === 'friend_request_accepted') {
      if (window.chat) {
        window.chat.loadContacts();
        window.chat.loadFriendRequests();
      }
      if (window.streak) window.streak.loadStreaks();
      if (window.sounds) window.sounds.playTypewriterBell();
      if (window.app) window.app.showToast(`🎉 ${data.name || 'Một người bạn'} đã đồng ý lời mời kết bạn của bạn!`);
    } else if (data.type === 'group_created') {
      if (window.chat) {
        window.chat.loadContacts();
      }
      if (window.sounds) window.sounds.playTypewriterBell();
      if (window.app && data.group) {
        window.app.showToast(`👥 Bạn vừa được thêm vào nhóm "${data.group.name}"!`);
      }
    }
  }

  saveAndEnter() {
    const authScreen = document.getElementById('auth-screen');
    const mainApp = document.getElementById('main-app');
    const introScreen = document.getElementById('intro-screen');

    document.documentElement.classList.add('user-logged-in');

    if (introScreen) {
      introScreen.classList.add('hidden');
      introScreen.style.display = 'none';
    }

    if (authScreen && mainApp) {
      authScreen.style.transition = 'all 0.35s ease';
      authScreen.style.opacity = '0';
      authScreen.style.transform = 'scale(0.96)';

      setTimeout(() => {
        authScreen.classList.add('hidden');
        authScreen.style.display = 'none';
        authScreen.style.pointerEvents = 'none';

        mainApp.classList.remove('hidden');
        mainApp.style.display = 'flex';
        mainApp.style.opacity = '0';
        mainApp.style.transform = 'translateY(12px)';

        requestAnimationFrame(() => {
          mainApp.style.transition = 'all 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)';
          mainApp.style.opacity = '1';
          mainApp.style.transform = 'translateY(0)';
          
          if (window.confetti) {
            window.confetti({ particleCount: 70, spread: 60, origin: { y: 0.7 } });
          }
          if (window.app) {
            window.app.showToast(`Chào mừng ${this.currentUser.name} trở lại SEE LAD! 🎉`);
          }
          if (window.qrStudio) {
            window.qrStudio.renderQR();
            window.qrStudio.checkIncomingProfileUrl();
          }
        });
      }, 300);
    } else if (mainApp) {
      mainApp.classList.remove('hidden');
      mainApp.style.display = 'flex';
      mainApp.style.opacity = '1';
      mainApp.style.transform = 'none';
    }
  }

  async setStatus(newStatus) {
    this.status = newStatus;
    if (this.currentUser) {
      this.currentUser.status = newStatus;
      this.saveUser();
      this.updateUserUI();

      try {
        await fetch('/api/auth/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: this.currentUser.id, status: newStatus })
        });
      } catch (e) {}

      const statusLabels = {
        'online': 'Trực tuyến (Online)',
        'busy': 'Đang bận (Busy)',
        'offline': 'Ngoại tuyến (Offline)'
      };
      if (window.app) window.app.showToast(`Đã chuyển trạng thái sang: ${statusLabels[newStatus]}`);
    }
  }

  updateUserUI() {
    if (!this.currentUser) return;

    document.querySelectorAll('.user-display-name').forEach(el => el.textContent = this.currentUser.name);
    document.querySelectorAll('.user-display-username').forEach(el => el.textContent = this.currentUser.username ? (this.currentUser.username.startsWith('@') ? this.currentUser.username : '@' + this.currentUser.username) : '@user');
    document.querySelectorAll('.user-display-avatar').forEach(el => el.src = this.currentUser.avatar);

    const statusDots = document.querySelectorAll('.user-status-dot');
    const statusTexts = document.querySelectorAll('.user-status-text');

    statusDots.forEach(dot => {
      dot.setAttribute('class', 'status-dot user-status-dot');
      if (this.status === 'online') {
        dot.classList.add('status-online', 'pulse');
      } else if (this.status === 'busy') {
        dot.classList.add('status-busy');
      } else {
        dot.classList.add('status-offline');
      }
    });

    statusTexts.forEach(txt => {
      if (this.status === 'online') txt.textContent = 'Trực tuyến';
      else if (this.status === 'busy') txt.textContent = 'Đang bận';
      else txt.textContent = 'Ngoại tuyến';
    });
  }

  saveUser() {
    localStorage.setItem('see_lad_user', JSON.stringify(this.currentUser));
  }

  logout() {
    if (this.eventSource) this.eventSource.close();
    localStorage.removeItem('see_lad_user');
    localStorage.removeItem('seelad_current_user');
    document.cookie = "see_lad_user_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
    document.documentElement.classList.remove('user-logged-in');
    this.currentUser = null;
    window.location.replace('/');
  }
}

window.auth = new AuthController();
