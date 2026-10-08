/**
 * SEE LAD - Optical QR Studio & Shared Profile Landing Controller
 * Bộ công cụ thiết kế mã QR cá nhân hóa chuẩn ISO/IEC 18004 (Quét siêu nhạy 100%)
 * Tích hợp Trang Giao Diện Cá Nhân khi quét mã QR hoặc chia sẻ liên kết (/u/username)
 */

class QRStudioController {
  constructor() {
    this.fgColor = '#4f46e5';
    this.fgColor2 = '#9333ea';
    this.useGradient = true;
    this.bgColor = '#ffffff';
    this.dotStyle = 'rounded'; // 'rounded' | 'dots' | 'diamond' | 'square'
    this.eyeStyle = 'rounded'; // 'rounded' | 'circle' | 'square'
    this.hasLogo = true;
    this.qrText = '';
    this.publicOrigin = '';
    this.cachedMatrix = null;
    this.cachedMatrixText = '';
    this.sharedProfileUser = null;
  }

  async init() {
    await this.resolvePublicOrigin();
    this.updateQRText();
    this.bindEvents();
    this.renderQR();
    this.checkIncomingProfileUrl();
  }

  async resolvePublicOrigin() {
    const loc = window.location;
    this.publicOrigin = loc.origin;
    if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
      try {
        const res = await fetch('/api/public-url');
        const data = await res.json();
        if (data && data.public_url && data.public_url.startsWith('http')) {
          this.publicOrigin = data.public_url;
        }
      } catch (e) {
        // Fallback to current origin
      }
    }
  }

  getCurrentUser() {
    return window.auth?.currentUser || window.SEE_LAD_CONFIG?.currentUser || {
      id: 'user',
      username: 'seelad_user',
      name: 'Người dùng SEE LAD',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
      bio: 'Thành viên kết nối trên SEE LAD 🌟',
      location_name: 'TP. Hồ Chí Minh'
    };
  }

  updateQRText() {
    const user = this.getCurrentUser();
    const base = this.publicOrigin || window.location.origin;
    const handle = (user.username || user.id || 'user').toString().replace(/^@/, '').trim();
    if (user.qr_token) {
      this.qrText = `${base}/u/${encodeURIComponent(handle)}?token=${encodeURIComponent(user.qr_token)}`;
    } else {
      this.qrText = `${base}/u/${encodeURIComponent(handle)}`;
    }

    const urlDisplay = document.getElementById('qr-share-url-display');
    if (urlDisplay) {
      urlDisplay.value = this.qrText;
    }
  }

  bindEvents() {
    const fgInput = document.getElementById('qr-fg-color');
    const fg2Input = document.getElementById('qr-fg-color-2');
    const fgHex = document.getElementById('qr-fg-hex');
    const fg2Hex = document.getElementById('qr-fg2-hex');
    const gradCb = document.getElementById('qr-use-gradient-cb');

    if (fgInput) {
      fgInput.addEventListener('input', (e) => {
        this.fgColor = e.target.value;
        if (fgHex) fgHex.textContent = this.fgColor.toUpperCase();
        this.highlightPreset(null);
        this.updateCardAmbientGlow();
        this.renderQR();
      });
    }

    if (fg2Input) {
      fg2Input.addEventListener('input', (e) => {
        this.fgColor2 = e.target.value;
        if (fg2Hex) fg2Hex.textContent = this.fgColor2.toUpperCase();
        this.useGradient = true;
        if (gradCb) gradCb.checked = true;
        this.highlightPreset(null);
        this.updateCardAmbientGlow();
        this.renderQR();
      });
    }

    if (gradCb) {
      gradCb.addEventListener('change', (e) => {
        this.useGradient = e.target.checked;
        this.renderQR();
      });
    }

    // Color preset buttons
    document.querySelectorAll('.qr-color-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        this.fgColor = btn.getAttribute('data-color') || '#4f46e5';
        this.fgColor2 = btn.getAttribute('data-color2') || this.fgColor;
        if (fgInput) fgInput.value = this.fgColor;
        if (fg2Input) fg2Input.value = this.fgColor2;
        if (fgHex) fgHex.textContent = this.fgColor.toUpperCase();
        if (fg2Hex) fg2Hex.textContent = this.fgColor2.toUpperCase();
        this.highlightPreset(btn);
        this.updateCardAmbientGlow();
        this.renderQR();
      });
    });

    // Dot Style switchers
    document.querySelectorAll('.qr-style-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.qr-style-btn').forEach(b => {
          b.classList.remove('border-indigo-500', 'bg-indigo-500/20', 'text-white');
          b.classList.add('border-white/10', 'text-slate-300');
        });
        btn.classList.remove('border-white/10', 'text-slate-300');
        btn.classList.add('border-indigo-500', 'bg-indigo-500/20', 'text-white');
        this.dotStyle = btn.getAttribute('data-style') || 'rounded';
        this.renderQR();
      });
    });

    // Corner Eye Style switchers
    document.querySelectorAll('.qr-eye-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.qr-eye-btn').forEach(b => {
          b.classList.remove('border-indigo-500', 'bg-indigo-500/20', 'text-white');
          b.classList.add('border-white/10', 'text-slate-300');
        });
        btn.classList.remove('border-white/10', 'text-slate-300');
        btn.classList.add('border-indigo-500', 'bg-indigo-500/20', 'text-white');
        this.eyeStyle = btn.getAttribute('data-eye') || 'rounded';
        this.renderQR();
      });
    });

    // Toggle center avatar checkbox
    const logoCb = document.getElementById('qr-has-logo-cb');
    if (logoCb) {
      logoCb.addEventListener('change', (e) => {
        this.hasLogo = e.target.checked;
        this.renderQR();
      });
    }

    // Download QR Button
    const btnDownload = document.getElementById('btn-download-qr');
    if (btnDownload) {
      btnDownload.addEventListener('click', () => this.downloadQRPNG());
    }

    // Copy link button
    const btnCopy = document.getElementById('btn-copy-profile-link');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        this.updateQRText();
        navigator.clipboard.writeText(this.qrText);
        if (window.app) window.app.showToast('Đã sao chép liên kết Trang Cá Nhân của bạn! 🔗');
      });
    }

    // Native share / share button
    const btnShare = document.getElementById('btn-share-profile-qr');
    if (btnShare) {
      btnShare.addEventListener('click', async () => {
        this.updateQRText();
        const user = this.getCurrentUser();
        if (navigator.share) {
          try {
            await navigator.share({
              title: `${user.name} trên SEE LAD`,
              text: `Kết nối và nhắn tin trực tiếp với ${user.name} trên SEE LAD:`,
              url: this.qrText
            });
            return;
          } catch (err) {
            // User cancelled or share failed, fallback to copy
          }
        }
        navigator.clipboard.writeText(this.qrText);
        if (window.app) window.app.showToast('Đã sao chép liên kết Trang Cá Nhân để chia sẻ! 🚀');
      });
    }

    // Preview my profile button
    const btnPreview = document.getElementById('btn-preview-my-profile');
    if (btnPreview) {
      btnPreview.addEventListener('click', () => {
        this.openSharedProfileModal();
      });
    }

    // Shared Profile Modal close & actions
    const btnCloseModal = document.getElementById('btn-close-shared-profile');
    const modal = document.getElementById('shared-profile-modal');
    if (btnCloseModal && modal) {
      btnCloseModal.addEventListener('click', () => {
        modal.classList.add('hidden');
      });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
      });
    }

    const btnModalCopy = document.getElementById('btn-shared-profile-copy');
    if (btnModalCopy) {
      btnModalCopy.addEventListener('click', () => {
        const u = this.sharedProfileUser || this.getCurrentUser();
        const base = this.publicOrigin || window.location.origin;
        const handle = (u.username || u.id || 'user').toString().replace(/^@/, '');
        const link = `${base}/u/${encodeURIComponent(handle)}`;
        navigator.clipboard.writeText(link);
        if (window.app) window.app.showToast('Đã sao chép liên kết hồ sơ người dùng! 🔗');
      });
    }

    const btnModalChat = document.getElementById('btn-shared-profile-chat');
    if (btnModalChat) {
      btnModalChat.addEventListener('click', () => this.handleSharedProfileChat());
    }

    const btnModalAdd = document.getElementById('btn-shared-profile-add');
    if (btnModalAdd) {
      btnModalAdd.addEventListener('click', () => this.handleSharedProfileAddFriend());
    }

    const btnModalCall = document.getElementById('btn-shared-profile-call');
    if (btnModalCall) {
      btnModalCall.addEventListener('click', () => this.handleSharedProfileCall());
    }

    // Reset QR token button
    const btnResetQR = document.getElementById('btn-reset-qr-token');
    if (btnResetQR) {
      btnResetQR.addEventListener('click', () => this.handleResetQRToken());
    }
  }

  async handleResetQRToken() {
    if (!confirm("Bạn có chắc chắn muốn đổi mã QR mới không? Mã QR cũ và các hình ảnh in/lưu trước đây sẽ không còn hiệu lực.")) return;
    const user = this.getCurrentUser();
    try {
      const res = await fetch('/api/qr/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id })
      });
      const data = await res.json();
      if (data.success) {
        if (window.auth && window.auth.currentUser) {
          window.auth.currentUser.qr_token = data.qr_token;
        }
        user.qr_token = data.qr_token;
        this.updateQRText();
        this.cachedMatrix = null;
        this.renderQR();
        if (window.app) window.app.showToast("Đã cấp đổi mã QR mới an toàn thành công! ✨");
      }
    } catch (e) {
      console.error("Reset QR error:", e);
    }
  }

  highlightPreset(activeBtn) {
    document.querySelectorAll('.qr-color-preset').forEach(b => {
      b.classList.remove('border-indigo-500', 'bg-indigo-500/15');
      b.classList.add('border-white/10');
    });
    if (activeBtn) {
      activeBtn.classList.remove('border-white/10');
      activeBtn.classList.add('border-indigo-500', 'bg-indigo-500/15');
    }
  }

  updateCardAmbientGlow() {
    const glow = document.getElementById('qr-card-ambient-glow');
    if (glow) {
      glow.style.background = `radial-gradient(circle, ${this.fgColor}55 0%, transparent 70%)`;
    }
  }

  /**
   * Ensure foreground color is dark enough against white background so cameras always scan it
   */
  ensureScannableColor(hex) {
    if (!hex || !hex.startsWith('#') || hex.length < 7) return '#4f46e5';
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    // Perceived luminance (0..255)
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum > 175) {
      const factor = 155 / lum;
      r = Math.max(0, Math.min(255, Math.round(r * factor)));
      g = Math.max(0, Math.min(255, Math.round(g * factor)));
      b = Math.max(0, Math.min(255, Math.round(b * factor)));
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    return hex;
  }

  /**
   * Obtain real ISO/IEC 18004 QR boolean matrix (client-side qrcode-generator or server API fallback)
   */
  async getQRMatrix(text) {
    if (this.cachedMatrix && this.cachedMatrixText === text) {
      return this.cachedMatrix;
    }

    // 1. Try client-side qrcode-generator library (instant, synchronous)
    if (typeof window.qrcode === 'function') {
      try {
        const qr = window.qrcode(0, 'H');
        qr.addData(text);
        qr.make();
        const count = qr.getModuleCount();
        const modules = [];
        for (let r = 0; r < count; r++) {
          const row = [];
          for (let c = 0; c < count; c++) {
            row.push(qr.isDark(r, c));
          }
          modules.push(row);
        }
        this.cachedMatrix = modules;
        this.cachedMatrixText = text;
        return modules;
      } catch (e) {
        console.warn('Client qrcode-generator fallback to server:', e);
      }
    }

    // 2. Fallback to Python server real QR matrix endpoint
    try {
      const res = await fetch(`/api/qr/matrix?text=${encodeURIComponent(text)}&ecc=H`);
      const data = await res.json();
      if (data && data.success && Array.isArray(data.modules)) {
        this.cachedMatrix = data.modules;
        this.cachedMatrixText = text;
        return data.modules;
      }
    } catch (e) {
      console.error('QR matrix fetch failed:', e);
    }
    return null;
  }

  async renderQR() {
    this.updateQRText();
    const canvas = document.getElementById('qr-preview-canvas');
    if (!canvas) return;

    const matrix = await this.getQRMatrix(this.qrText);
    if (!matrix || !matrix.length) return;

    const size = 600;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    await this.drawStyledQR(ctx, size, matrix);
  }

  isFinderPattern(r, c, count) {
    if (r < 7 && c < 7) return true;
    if (r < 7 && c >= count - 7) return true;
    if (r >= count - 7 && c < 7) return true;
    return false;
  }

  isCenterLogoZone(r, c, count) {
    if (!this.hasLogo) return false;
    const center = (count - 1) / 2;
    const maxDist = count * 0.115; // Safe <23% diameter for Level H (30% recovery)
    const dr = Math.abs(r - center);
    const dc = Math.abs(c - center);
    return Math.sqrt(dr * dr + dc * dc) <= maxDist;
  }

  drawFinderEye(ctx, x, y, cellSize, fillStyle) {
    const outerSize = 7 * cellSize;
    const innerOffset = 2 * cellSize;
    const innerSize = 3 * cellSize;
    const lineW = cellSize;

    ctx.save();
    ctx.strokeStyle = fillStyle;
    ctx.fillStyle = fillStyle;
    ctx.lineWidth = lineW;

    const half = lineW / 2;
    const frameX = x + half;
    const frameY = y + half;
    const frameS = outerSize - lineW;

    // Outer 7x7 ring
    ctx.beginPath();
    if (this.eyeStyle === 'circle') {
      ctx.arc(x + outerSize / 2, y + outerSize / 2, frameS / 2, 0, Math.PI * 2);
    } else if (this.eyeStyle === 'rounded') {
      ctx.roundRect(frameX, frameY, frameS, frameS, cellSize * 1.8);
    } else {
      ctx.rect(frameX, frameY, frameS, frameS);
    }
    ctx.stroke();

    // Inner 3x3 core
    ctx.beginPath();
    if (this.eyeStyle === 'circle') {
      ctx.arc(x + outerSize / 2, y + outerSize / 2, innerSize / 2, 0, Math.PI * 2);
    } else if (this.eyeStyle === 'rounded') {
      ctx.roundRect(x + innerOffset, y + innerOffset, innerSize, innerSize, cellSize * 0.85);
    } else {
      ctx.rect(x + innerOffset, y + innerOffset, innerSize, innerSize);
    }
    ctx.fill();
    ctx.restore();
  }

  async drawStyledQR(ctx, size, matrix) {
    const count = matrix.length;
    const quietZoneModules = 3.2; // Standard optical quiet zone margin
    const totalModules = count + quietZoneModules * 2;
    const cellSize = size / totalModules;
    const offset = quietZoneModules * cellSize;

    // 1. Pure crisp background
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    // 2. Build foreground fill (Solid or Gradient) with guaranteed scan contrast
    const c1 = this.ensureScannableColor(this.fgColor);
    const c2 = this.ensureScannableColor(this.fgColor2 || this.fgColor);
    let fillStyle = c1;
    if (this.useGradient && c1 !== c2) {
      const grad = ctx.createLinearGradient(offset, offset, size - offset, size - offset);
      grad.addColorStop(0, c1);
      grad.addColorStop(1, c2);
      fillStyle = grad;
    }

    ctx.fillStyle = fillStyle;

    // 3. Draw 3 Precision Finder Eyes (Top-Left, Top-Right, Bottom-Left)
    this.drawFinderEye(ctx, offset, offset, cellSize, fillStyle);
    this.drawFinderEye(ctx, offset + (count - 7) * cellSize, offset, cellSize, fillStyle);
    this.drawFinderEye(ctx, offset, offset + (count - 7) * cellSize, cellSize, fillStyle);

    // 4. Draw Data Modules
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (!matrix[r][c]) continue;
        if (this.isFinderPattern(r, c, count)) continue;
        if (this.isCenterLogoZone(r, c, count)) continue;

        const x = offset + c * cellSize;
        const y = offset + r * cellSize;

        if (this.dotStyle === 'dots') {
          ctx.beginPath();
          ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize * 0.44, 0, Math.PI * 2);
          ctx.fill();
        } else if (this.dotStyle === 'diamond') {
          const cx = x + cellSize / 2;
          const cy = y + cellSize / 2;
          const rad = cellSize * 0.48;
          ctx.beginPath();
          ctx.moveTo(cx, cy - rad);
          ctx.lineTo(cx + rad, cy);
          ctx.lineTo(cx, cy + rad);
          ctx.lineTo(cx - rad, cy);
          ctx.closePath();
          ctx.fill();
        } else if (this.dotStyle === 'rounded') {
          const pad = cellSize * 0.05;
          const s = cellSize - pad * 2;
          ctx.beginPath();
          ctx.roundRect(x + pad, y + pad, s, s, s * 0.36);
          ctx.fill();
        } else {
          // Classic crisp square
          ctx.fillRect(x + 0.2, y + 0.2, cellSize - 0.4, cellSize - 0.4);
        }
      }
    }

    // 5. Draw Center Avatar / Logo if enabled
    if (this.hasLogo) {
      await this.drawCenterAvatar(ctx, size, c1, c2);
    }
  }

  drawCenterAvatar(ctx, size, c1, c2) {
    return new Promise((resolve) => {
      const user = this.getCurrentUser();
      const avatarUrl = user.avatar;
      const center = size / 2;
      const radius = Math.round(size * 0.095); // ~57px on 600px canvas (19% diameter)

      const drawBadgeFrame = () => {
        ctx.save();
        // White quiet ring
        ctx.beginPath();
        ctx.arc(center, center, radius + 8, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(15, 23, 42, 0.22)';
        ctx.shadowBlur = 14;
        ctx.fill();
        ctx.restore();

        // Colored gradient ring
        ctx.save();
        ctx.beginPath();
        ctx.arc(center, center, radius + 3, 0, Math.PI * 2);
        const ringGrad = ctx.createLinearGradient(center - radius, center - radius, center + radius, center + radius);
        ringGrad.addColorStop(0, c1 || '#4f46e5');
        ringGrad.addColorStop(1, c2 || '#06b6d4');
        ctx.strokeStyle = ringGrad;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();
      };

      const drawFallbackEmblem = () => {
        drawBadgeFrame();
        ctx.save();
        ctx.beginPath();
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        const bgGrad = ctx.createLinearGradient(center - radius, center - radius, center + radius, center + radius);
        bgGrad.addColorStop(0, c1 || '#4f46e5');
        bgGrad.addColorStop(1, c2 || '#9333ea');
        ctx.fillStyle = bgGrad;
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = `800 ${Math.round(radius * 0.78)}px "Be Vietnam Pro", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const initials = (user.name || 'SL').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
        ctx.fillText(initials || 'SL', center, center + 2);
        ctx.restore();
        resolve();
      };

      if (!avatarUrl) {
        drawFallbackEmblem();
        return;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        drawBadgeFrame();
        ctx.save();
        ctx.beginPath();
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, center - radius, center - radius, radius * 2, radius * 2);
        ctx.restore();
        resolve();
      };
      img.onerror = () => {
        drawFallbackEmblem();
      };
      img.src = avatarUrl;
    });
  }

  async downloadQRPNG() {
    const canvas = document.getElementById('qr-preview-canvas');
    if (!canvas) return;

    // Ensure latest QR is rendered
    await this.renderQR();

    const dlCanvas = document.createElement('canvas');
    const dlCtx = dlCanvas.getContext('2d');
    dlCanvas.width = 720;
    dlCanvas.height = 940;

    const c1 = this.ensureScannableColor(this.fgColor);
    const c2 = this.ensureScannableColor(this.fgColor2 || this.fgColor);

    // 1. Dark VIP Card Background
    const bgGrad = dlCtx.createLinearGradient(0, 0, 720, 940);
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(0.5, '#090d1a');
    bgGrad.addColorStop(1, '#05070f');
    dlCtx.fillStyle = bgGrad;
    dlCtx.beginPath();
    dlCtx.roundRect(0, 0, 720, 940, 44);
    dlCtx.fill();

    // 2. Ambient Top Glow
    const radGrad = dlCtx.createRadialGradient(360, 120, 20, 360, 120, 340);
    radGrad.addColorStop(0, `${c1}44`);
    radGrad.addColorStop(1, 'transparent');
    dlCtx.fillStyle = radGrad;
    dlCtx.fillRect(0, 0, 720, 500);

    // 3. Outer Border
    dlCtx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    dlCtx.lineWidth = 3;
    dlCtx.beginPath();
    dlCtx.roundRect(1.5, 1.5, 717, 937, 44);
    dlCtx.stroke();

    // 4. Header Badge
    const pillGrad = dlCtx.createLinearGradient(220, 44, 500, 44);
    pillGrad.addColorStop(0, c1);
    pillGrad.addColorStop(1, c2);
    dlCtx.fillStyle = pillGrad;
    dlCtx.beginPath();
    dlCtx.roundRect(220, 42, 280, 38, 19);
    dlCtx.fill();

    dlCtx.fillStyle = '#ffffff';
    dlCtx.font = 'bold 13px "Be Vietnam Pro", sans-serif';
    dlCtx.textAlign = 'center';
    dlCtx.fillText('★ THẺ ĐỊNH DANH SEE LAD ★', 360, 66);

    // 5. Brand Title
    dlCtx.fillStyle = '#ffffff';
    dlCtx.font = '800 30px "Be Vietnam Pro", sans-serif';
    dlCtx.fillText('SEE LAD NEXUS', 360, 125);

    // 6. White Optical Container for QR
    dlCtx.save();
    dlCtx.fillStyle = '#ffffff';
    dlCtx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    dlCtx.shadowBlur = 35;
    dlCtx.beginPath();
    dlCtx.roundRect(110, 160, 500, 500, 36);
    dlCtx.fill();
    dlCtx.restore();

    // Draw high-res QR canvas inside container
    dlCtx.drawImage(canvas, 130, 180, 460, 460);

    // 7. User Name & Handle
    const user = this.getCurrentUser();
    dlCtx.fillStyle = '#ffffff';
    dlCtx.font = 'bold 28px "Be Vietnam Pro", sans-serif';
    dlCtx.fillText(user.name || 'Người dùng SEE LAD', 360, 725);

    const handle = `@${(user.username || 'user').replace(/^@/, '')}`;
    dlCtx.fillStyle = '#38bdf8';
    dlCtx.font = '600 18px "JetBrains Mono", monospace';
    dlCtx.fillText(handle, 360, 760);

    // 8. Share URL Pill
    dlCtx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    dlCtx.beginPath();
    dlCtx.roundRect(120, 790, 480, 44, 22);
    dlCtx.fill();

    dlCtx.fillStyle = '#cbd5e1';
    dlCtx.font = '500 14px "Be Vietnam Pro", sans-serif';
    dlCtx.fillText('Quét mã bằng Camera hoặc Zalo để mở Trang Cá Nhân', 360, 817);

    dlCtx.fillStyle = '#64748b';
    dlCtx.font = '12px monospace';
    dlCtx.fillText(this.qrText, 360, 875);

    try {
      const dataUrl = dlCanvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `SEELAD_QR_${(user.username || 'user').replace(/^@/, '')}.png`;
      link.href = dataUrl;
      link.click();
      if (window.app) window.app.showToast('Đã tải Thẻ QR PNG độ nét cao về thiết bị! 📥');
    } catch (err) {
      console.warn('CORS taint fallback on download:', err);
      // Re-render without external image taint and download
      const prevLogo = this.hasLogo;
      this.hasLogo = false;
      await this.renderQR();
      dlCtx.fillStyle = '#ffffff';
      dlCtx.fillRect(125, 175, 470, 470);
      dlCtx.drawImage(canvas, 130, 180, 460, 460);
      this.hasLogo = prevLogo;
      await this.renderQR();

      const link = document.createElement('a');
      link.download = `SEELAD_QR_${(user.username || 'user').replace(/^@/, '')}.png`;
      link.href = dlCanvas.toDataURL('image/png');
      link.click();
      if (window.app) window.app.showToast('Đã tải Thẻ QR PNG độ nét cao về thiết bị! 📥');
    }
  }

  /**
   * Check if visitor arrived via QR code scan or shared profile link (?u=..., ?add_friend=..., /u/...)
   */
  checkIncomingProfileUrl() {
    const params = new URLSearchParams(window.location.search);
    let targetId = params.get('u') || params.get('add_friend') || params.get('profile');

    if (!targetId && window.location.pathname.startsWith('/u/')) {
      targetId = decodeURIComponent(window.location.pathname.slice(3).replace(/\/+$/, ''));
    }

    if (!targetId) {
      targetId = sessionStorage.getItem('see_lad_pending_profile');
    }

    if (targetId) {
      sessionStorage.removeItem('see_lad_pending_profile');
      // Clean URL query gracefully while keeping state
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
      setTimeout(() => {
        this.openSharedProfileModal(targetId);
      }, 350);
    }
  }

  /**
   * Open the Shared User Profile Landing Page Modal for any user (or current user if omitted)
   */
  async openSharedProfileModal(identifier = null) {
    const modal = document.getElementById('shared-profile-modal');
    if (!modal) return;

    const currentUser = window.auth?.currentUser;
    const targetIdentifier = identifier || (currentUser?.username || currentUser?.id);

    let profileUser = null;
    if (targetIdentifier) {
      try {
        const viewerParam = currentUser?.id ? `?viewer_id=${encodeURIComponent(currentUser.id)}` : '';
        const res = await fetch(`/api/users/profile/${encodeURIComponent(targetIdentifier)}${viewerParam}`);
        const data = await res.json();
        if (res.ok && data.user) {
          profileUser = data.user;
        }
      } catch (e) {
        console.warn('Could not fetch remote profile, using local fallback:', e);
      }
    }

    if (!profileUser) {
      const fallback = this.getCurrentUser();
      profileUser = {
        ...fallback,
        is_online: true,
        friends_count: 12,
        relationship: 'self'
      };
    }

    this.sharedProfileUser = profileUser;

    // Populate UI elements
    const avatarEl = document.getElementById('shared-profile-avatar');
    const statusDotEl = document.getElementById('shared-profile-status-dot');
    const nameEl = document.getElementById('shared-profile-name');
    const usernameEl = document.getElementById('shared-profile-username');
    const statusTextEl = document.getElementById('shared-profile-status-text');
    const bioEl = document.getElementById('shared-profile-bio');
    const locEl = document.getElementById('shared-profile-location');
    const friendsEl = document.getElementById('shared-profile-friends');
    const addBtnText = document.getElementById('btn-shared-profile-add-text');

    if (avatarEl) {
      avatarEl.src = profileUser.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80';
    }
    if (nameEl) nameEl.textContent = profileUser.name || 'Người dùng SEE LAD';
    if (usernameEl) usernameEl.textContent = `@${(profileUser.username || 'user').replace(/^@/, '')}`;
    if (bioEl) bioEl.textContent = profileUser.bio || 'Thành viên kết nối trên nền tảng nhắn tin thời gian thực SEE LAD 🌟';
    if (locEl) locEl.textContent = profileUser.location_name || 'TP. Hồ Chí Minh';
    if (friendsEl) {
      const cnt = profileUser.friends_count || 0;
      friendsEl.textContent = cnt > 0 ? `${cnt} bạn bè kết nối` : 'Thành viên xác thực SEE LAD';
    }

    const isOnline = profileUser.is_online !== false && profileUser.status !== 'offline';
    if (statusDotEl) {
      statusDotEl.className = `absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full ring-4 ring-[#0b101e] ${isOnline ? 'bg-emerald-400' : 'bg-rose-500'}`;
    }
    if (statusTextEl) {
      statusTextEl.textContent = isOnline ? 'Đang trực tuyến' : 'Ngoại tuyến';
      statusTextEl.className = `text-xs font-semibold ${isOnline ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    if (addBtnText) {
      if (profileUser.relationship === 'self') {
        addBtnText.textContent = 'Hồ sơ của bạn';
      } else if (profileUser.relationship === 'friend') {
        addBtnText.textContent = 'Đã là bạn bè';
      } else if (profileUser.relationship === 'pending_sent') {
        addBtnText.textContent = 'Đã gửi lời mời';
      } else {
        addBtnText.textContent = 'Kết bạn ngay';
      }
    }

    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  async handleSharedProfileChat() {
    const target = this.sharedProfileUser;
    const modal = document.getElementById('shared-profile-modal');
    if (!target) return;

    const currentUser = window.auth?.currentUser;
    if (!currentUser) {
      // Visitor is not logged in yet -> save target and prompt login
      sessionStorage.setItem('see_lad_pending_profile', target.username || target.id);
      if (modal) modal.classList.add('hidden');
      const introScreen = document.getElementById('intro-screen');
      const authScreen = document.getElementById('auth-screen');
      if (introScreen) introScreen.classList.add('hidden');
      if (authScreen) {
        authScreen.classList.remove('hidden');
        authScreen.style.opacity = '1';
      }
      if (window.app) {
        window.app.showToast(`Vui lòng đăng nhập để nhắn tin trực tiếp với ${target.name}! 💬`);
      }
      return;
    }

    if (target.id === currentUser.id) {
      if (modal) modal.classList.add('hidden');
      if (window.app) window.app.switchTab('chat');
      if (window.app) window.app.showToast('Đây là Trang Cá Nhân của chính bạn! ✨');
      return;
    }

    // Ensure friendship exists so they appear in each other's chat list immediately
    try {
      await fetch('/api/friends/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, target_id: target.id })
      });
    } catch (e) {
      console.warn('Error auto-connecting friend for chat:', e);
    }

    if (modal) modal.classList.add('hidden');
    if (window.app) window.app.switchTab('chat');

    if (window.chat) {
      await window.chat.loadContacts();
      window.chat.selectConversation(target.id);
    }
    if (window.app) {
      window.app.showToast(`Đã mở cuộc trò chuyện với ${target.name}! 💬`);
    }
  }

  async handleSharedProfileAddFriend() {
    const target = this.sharedProfileUser;
    if (!target) return;

    const currentUser = window.auth?.currentUser;
    if (!currentUser) {
      this.handleSharedProfileChat();
      return;
    }

    if (target.id === currentUser.id) {
      const modal = document.getElementById('shared-profile-modal');
      if (modal) modal.classList.add('hidden');
      const profileModal = document.getElementById('modal-user-profile');
      if (profileModal) profileModal.classList.remove('hidden');
      return;
    }

    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: currentUser.id,
          receiver_id: target.id,
          message: `Xin chào ${target.name}, mình quét mã QR trang cá nhân của bạn trên SEE LAD!`
        })
      });
      const data = await res.json();
      const addBtnText = document.getElementById('btn-shared-profile-add-text');
      if (res.ok && data.success) {
        if (addBtnText) addBtnText.textContent = 'Đã gửi lời mời';
        if (window.app) window.app.showToast(`Đã gửi lời mời kết bạn tới ${target.name}! 👋`);
      } else {
        // Fallback: if already friends, open chat
        if (addBtnText) addBtnText.textContent = 'Đã là bạn bè';
        if (window.app) window.app.showToast(data.error || `Hai bạn đã kết nối trên SEE LAD!`);
      }
    } catch (e) {
      if (window.app) window.app.showToast('Không thể gửi lời mời kết bạn lúc này', 'error');
    }
  }

  async handleSharedProfileCall() {
    await this.handleSharedProfileChat();
    setTimeout(() => {
      if (window.call) {
        window.call.startCall('voice');
      }
    }, 400);
  }
}

window.qrStudio = new QRStudioController();
