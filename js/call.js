/**
 * SEE LAD - Full HD WebRTC Video & Voice Calling + Beauty Filter & AI Noise Cancellation
 * Hỗ trợ gọi trực tiếp 2 chiều (Dual-Channel SSE + Fast Poll), cấp quyền Camera 1080p sắc nét,
 * Bộ lọc làm đẹp trắng sáng da thời gian thực và Khử tạp âm tuyệt đối
 */

class CallController {
  constructor() {
    this.isInCall = false;
    this.callType = 'voice'; // 'voice' | 'video'
    this.callDuration = 0;
    this.timerInterval = null;
    this.rawStream = null;
    this.localStream = null;
    this.remoteStream = null;
    this.audioCleanCtx = null;
    this.peerConnection = null;
    this.targetUserId = null;
    this.incomingCaller = null;
    this.isMuted = false;
    this.isVideoOff = false;
    this.facingMode = 'user'; // 'user' (trước) | 'environment' (sau)
    this.queuedCandidates = [];
    this.callTimeout = null;
    this.wasConnected = false;

    // Beauty & Sharpness Filter State
    this.activeFilter = 'beauty_glow';
    this.skinBrightness = 65; // 0..100
    this.sharpnessLevel = 80; // 0..100

    // Dual-channel signal polling state
    this.processedSignals = new Set();
    this.pollTimer = null;

    // Multi-STUN configuration for fast NAT traversal
    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
      ],
      iceCandidatePoolSize: 10
    };
  }

  init() {
    this.bindEvents();
    this.startSignalPoller();

    // Unlock Web Audio Context on first user interaction
    const unlockAudio = () => {
      if (window.sounds?.ctx && window.sounds.ctx.state === 'suspended') {
        window.sounds.ctx.resume().catch(() => {});
      }
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('click', unlockAudio);
    };
    document.addEventListener('touchstart', unlockAudio, { passive: true });
    document.addEventListener('click', unlockAudio);
  }

  /**
   * Background fast signal poller so calls always ring immediately even if SSE is buffered by mobile/tunnel
   */
  startSignalPoller() {
    if (this.pollTimer) clearTimeout(this.pollTimer);

    const pollTick = async () => {
      const currentUserId = window.auth?.currentUser?.id;
      if (currentUserId) {
        try {
          const res = await fetch(`/api/call/poll?user_id=${encodeURIComponent(currentUserId)}`);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.signals)) {
              for (const sig of data.signals) {
                await this.handleIncomingSignal(sig);
              }
            }
          }
        } catch (e) {
          // Ignore transient network errors
        }
      }
      const nextDelay = (this.isInCall || this.incomingCaller) ? 350 : 1500;
      this.pollTimer = setTimeout(pollTick, nextDelay);
    };

    this.pollTimer = setTimeout(pollTick, 1000);
  }

  bindEvents() {
    const btnVoice = document.getElementById('btn-start-voice-call');
    const btnVideo = document.getElementById('btn-start-video-call');

    if (btnVoice) {
      btnVoice.addEventListener('click', () => {
        const contact = window.chat?.contacts.find(c => c.id === window.chat?.activeChatId);
        if (contact) this.startCall(contact, 'voice');
        else if (window.app) window.app.showToast('Vui lòng chọn một người bạn để gọi thoại!', 'warning');
      });
    }

    if (btnVideo) {
      btnVideo.addEventListener('click', () => {
        const contact = window.chat?.contacts.find(c => c.id === window.chat?.activeChatId);
        if (contact) this.startCall(contact, 'video');
        else if (window.app) window.app.showToast('Vui lòng chọn một người bạn để gọi video!', 'warning');
      });
    }

    const btnMute = document.getElementById('btn-call-toggle-mute');
    const btnCam = document.getElementById('btn-call-toggle-cam');
    const btnSwitchCam = document.getElementById('btn-call-switch-cam');
    const btnBeauty = document.getElementById('btn-call-toggle-beauty');
    const btnGrantPerm = document.getElementById('btn-grant-camera-perm');
    const btnEnd = document.getElementById('btn-call-end');

    if (btnMute) btnMute.addEventListener('click', () => this.toggleMute());
    if (btnCam) btnCam.addEventListener('click', () => this.toggleCamera());
    if (btnSwitchCam) btnSwitchCam.addEventListener('click', () => this.switchCameraFacing());
    if (btnBeauty) {
      btnBeauty.addEventListener('click', () => {
        const panel = document.getElementById('call-beauty-panel');
        if (panel) panel.classList.toggle('hidden');
      });
    }
    if (btnGrantPerm) {
      btnGrantPerm.addEventListener('click', () => this.requestAndAttachCamera());
    }
    if (btnEnd) btnEnd.addEventListener('click', () => this.endCall(true));

    // Beauty Filter Preset Buttons
    document.querySelectorAll('.call-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.call-filter-btn').forEach(b => {
          b.classList.remove('border-pink-400', 'bg-pink-500/20', 'text-white', 'font-bold');
          b.classList.add('border-white/10', 'bg-white/5', 'text-slate-300');
        });
        btn.classList.remove('border-white/10', 'bg-white/5', 'text-slate-300');
        btn.classList.add('border-pink-400', 'bg-pink-500/20', 'text-white', 'font-bold');

        this.activeFilter = btn.getAttribute('data-filter') || 'beauty_glow';
        const badgeEl = document.getElementById('call-local-filter-badge');
        if (badgeEl) badgeEl.textContent = btn.textContent.trim();
        this.applyBeautyFilter();
        this.syncFilterToPeer();
      });
    });

    // Skin Brightness & Sharpness Sliders
    const brightSlider = document.getElementById('call-skin-brightness-slider');
    const sharpSlider = document.getElementById('call-sharpness-slider');
    const levelText = document.getElementById('call-beauty-level-text');

    if (brightSlider) {
      brightSlider.addEventListener('input', (e) => {
        this.skinBrightness = parseInt(e.target.value, 10) || 0;
        if (levelText) levelText.textContent = `Độ sáng da: ${this.skinBrightness}%`;
        this.applyBeautyFilter();
        this.syncFilterToPeer();
      });
    }

    if (sharpSlider) {
      sharpSlider.addEventListener('input', (e) => {
        this.sharpnessLevel = parseInt(e.target.value, 10) || 0;
        this.applyBeautyFilter();
        this.syncFilterToPeer();
      });
    }
  }

  /**
   * Compute crisp CSS + SVG filter string for skin brightening & HD sharpness (never blurry)
   */
  buildFilterCssString(filterName, brightnessVal, sharpnessVal) {
    // Normalize 0..100 slider into subtle optical multipliers
    const bBoost = (brightnessVal / 100) * 0.24; // up to +24% skin luminance
    const cBoost = (sharpnessVal / 100) * 0.14;  // up to +14% crisp contrast
    const useSvgSharp = sharpnessVal >= 25 ? 'url(#seelad-beauty-sharp) ' : '';

    switch (filterName) {
      case 'porcelain':
        return `${useSvgSharp}brightness(${(1.04 + bBoost).toFixed(2)}) contrast(${(1.02 + cBoost).toFixed(2)}) saturate(1.04) hue-rotate(3deg)`;
      case 'peach':
        return `${useSvgSharp}brightness(${(1.02 + bBoost).toFixed(2)}) contrast(${(1.02 + cBoost).toFixed(2)}) saturate(1.22) hue-rotate(-4deg)`;
      case 'ultra_sharp':
        return `url(#seelad-beauty-sharp) brightness(${(1.0 + bBoost * 0.7).toFixed(2)}) contrast(${(1.08 + cBoost).toFixed(2)}) saturate(1.12)`;
      case 'golden':
        return `${useSvgSharp}brightness(${(1.02 + bBoost).toFixed(2)}) contrast(${(1.02 + cBoost).toFixed(2)}) saturate(1.20) sepia(0.10)`;
      case 'original':
        return sharpnessVal > 40 ? `url(#seelad-beauty-sharp) brightness(1.02) contrast(1.04)` : 'none';
      case 'beauty_glow':
      default:
        return `${useSvgSharp}brightness(${(1.03 + bBoost).toFixed(2)}) contrast(${(1.02 + cBoost).toFixed(2)}) saturate(1.12)`;
    }
  }

  applyBeautyFilter() {
    const localVideo = document.getElementById('call-local-video');
    if (!localVideo) return;
    const cssFilter = this.buildFilterCssString(this.activeFilter, this.skinBrightness, this.sharpnessLevel);
    localVideo.style.filter = cssFilter;
    const remoteVideo = document.getElementById('call-remote-video');
    if (remoteVideo && !this.remoteStream) {
      remoteVideo.style.filter = cssFilter;
    }
  }

  syncFilterToPeer() {
    if (this.isInCall && this.targetUserId) {
      this.sendSignal(this.targetUserId, 'video_filter', {
        filter: this.activeFilter,
        brightness: this.skinBrightness,
        sharpness: this.sharpnessLevel
      });
    }
  }

  /**
   * Build studio noise-cancelled audio track (cuts <95Hz rumble/fan noise & >9200Hz hiss)
   */
  createNoiseCancelledAudioStream(rawMediaStream) {
    try {
      const audioTracks = rawMediaStream.getAudioTracks();
      if (!audioTracks.length) return rawMediaStream;

      if (this.audioCleanCtx && this.audioCleanCtx.state !== 'closed') {
        this.audioCleanCtx.close().catch(() => {});
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioCleanCtx = new AudioCtx({ sampleRate: 48000 });
      const source = this.audioCleanCtx.createMediaStreamSource(rawMediaStream);

      // 1. High-pass filter at 95Hz (blocks fan noise, wind, AC hum, table rumble)
      const highpass = this.audioCleanCtx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.setValueAtTime(95, this.audioCleanCtx.currentTime);

      // 2. Low-pass filter at 9200Hz (blocks high-pitched electronic static/hiss)
      const lowpass = this.audioCleanCtx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(9200, this.audioCleanCtx.currentTime);

      // 3. Smooth voice dynamics compressor
      const compressor = this.audioCleanCtx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-24, this.audioCleanCtx.currentTime);
      compressor.knee.setValueAtTime(20, this.audioCleanCtx.currentTime);
      compressor.ratio.setValueAtTime(8, this.audioCleanCtx.currentTime);
      compressor.attack.setValueAtTime(0.003, this.audioCleanCtx.currentTime);
      compressor.release.setValueAtTime(0.18, this.audioCleanCtx.currentTime);

      const destination = this.audioCleanCtx.createMediaStreamDestination();
      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(compressor);
      compressor.connect(destination);

      const combinedStream = new MediaStream();
      destination.stream.getAudioTracks().forEach(t => combinedStream.addTrack(t));
      rawMediaStream.getVideoTracks().forEach(vt => {
        if ('contentHint' in vt) vt.contentHint = 'detail';
        combinedStream.addTrack(vt);
      });
      return combinedStream;
    } catch (e) {
      console.warn('WebAudio noise gate fallback to hardware DSP:', e);
      return rawMediaStream;
    }
  }

  /**
   * Request Camera (1080p Full HD) & Microphone (Noise Cancelled) ONLY when in a call
   */
  async initLocalMedia(needVideo = true) {
    this.stopLocalMediaOnly();
    const permBanner = document.getElementById('call-camera-perm-banner');
    if (permBanner) permBanner.classList.add('hidden');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (needVideo && permBanner) permBanner.classList.remove('hidden');
      if (window.app) window.app.showToast('Trình duyệt yêu cầu kết nối HTTPS để bật Camera/Micro!', 'warning');
      return;
    }

    const audioConstraints = {
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl: { ideal: true },
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48000 }
    };

    try {
      if (needVideo) {
        try {
          // Try Full HD 1080p sharp camera first
          this.rawStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1920, min: 1280 },
              height: { ideal: 1080, min: 720 },
              frameRate: { ideal: 30, min: 24 },
              facingMode: this.facingMode
            },
            audio: audioConstraints
          });
        } catch (hdErr) {
          // Fallback to standard HD camera
          try {
            this.rawStream = await navigator.mediaDevices.getUserMedia({
              video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: this.facingMode
              },
              audio: audioConstraints
            });
          } catch (camErr) {
            console.warn('Camera permission denied or unavailable, trying audio-only:', camErr);
            if (permBanner) permBanner.classList.remove('hidden');
            this.rawStream = await navigator.mediaDevices.getUserMedia({
              video: false,
              audio: audioConstraints
            });
          }
        }
      } else {
        this.rawStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: audioConstraints
        });
      }

      if (this.rawStream) {
        this.localStream = this.createNoiseCancelledAudioStream(this.rawStream);
        const localVideo = document.getElementById('call-local-video');
        if (localVideo) {
          localVideo.srcObject = this.rawStream;
          localVideo.muted = true;
          localVideo.volume = 0;
          localVideo.classList.toggle('scale-x-[-1]', this.facingMode === 'user');
          localVideo.play().catch(() => {});
          this.applyBeautyFilter();
        }
      }
    } catch (err) {
      console.warn('Media permission not granted yet:', err);
      if (needVideo && permBanner) permBanner.classList.remove('hidden');
      if (window.app) {
        window.app.showToast('Vui lòng bấm "Cho phép" quyền Camera & Micro trên trình duyệt để gọi!', 'warning');
      }
    }
  }

  /**
   * Explicitly request camera permission and attach video track to active call
   */
  async requestAndAttachCamera() {
    this.callType = 'video';
    this.isVideoOff = false;

    const videoContainer = document.getElementById('call-video-container');
    const voiceContainer = document.getElementById('call-voice-container');
    const beautyPanel = document.getElementById('call-beauty-panel');
    if (videoContainer) videoContainer.classList.remove('hidden');
    if (voiceContainer) voiceContainer.classList.add('hidden');
    if (beautyPanel) beautyPanel.classList.remove('hidden');

    await this.initLocalMedia(true);

    if (this.peerConnection && this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        const sender = this.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(videoTrack);
          await this.boostVideoSenderQuality(sender);
        } else {
          const newSender = this.peerConnection.addTrack(videoTrack, this.localStream);
          await this.boostVideoSenderQuality(newSender);
          // Renegotiate offer so peer receives newly added video track
          try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            if (this.targetUserId) {
              await this.sendSignal(this.targetUserId, 'offer', { sdp: offer });
            }
          } catch (e) {
            console.warn('Renegotiation warning:', e);
          }
        }
        if (window.app) window.app.showToast('Đã bật Camera Full HD & Bộ lọc làm đẹp! 📸');
      }
    }
  }

  /**
   * Switch between front ('user') and back ('environment') camera on mobile
   */
  async switchCameraFacing() {
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    await this.requestAndAttachCamera();
    if (window.app) {
      window.app.showToast(this.facingMode === 'user' ? 'Đã chuyển sang Camera trước' : 'Đã chuyển sang Camera sau');
    }
  }

  /**
   * Boost WebRTC Video Bitrate (2.5 Mbps) & maintain resolution so video is never blurry
   */
  async boostVideoSenderQuality(sender) {
    if (!sender || typeof sender.getParameters !== 'function') return;
    try {
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) {
        params.encodings = [{}];
      }
      params.encodings[0].maxBitrate = 2500000; // 2.5 Mbps Full HD
      params.encodings[0].maxFramerate = 30;
      params.degradationPreference = 'maintain-resolution';
      await sender.setParameters(params);
    } catch (e) {
      // Browser may not support all RTP sender parameters
    }
  }

  async createPeerConnection() {
    if (this.peerConnection) {
      try { this.peerConnection.close(); } catch (e) {}
      this.peerConnection = null;
    }

    this.peerConnection = new RTCPeerConnection(this.rtcConfig);

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.targetUserId) {
        this.sendSignal(this.targetUserId, 'ice_candidate', { candidate: event.candidate });
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      const statusEl = document.getElementById('call-status-label');
      if (state === 'connected') {
        this.wasConnected = true;
        if (window.sounds) window.sounds.stopRinging();
        this.startTimer();
        this.syncFilterToPeer();
      } else if (state === 'failed' || state === 'disconnected') {
        if (statusEl && this.isInCall) {
          statusEl.textContent = 'Đang khôi phục tín hiệu mạng...';
        }
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const iceState = this.peerConnection?.iceConnectionState;
      if (iceState === 'connected' || iceState === 'completed') {
        this.wasConnected = true;
        if (window.sounds) window.sounds.stopRinging();
        this.startTimer();
      }
    };

    // Receive remote audio/video tracks
    this.peerConnection.ontrack = (event) => {
      this.wasConnected = true;
      this.remoteStream = event.streams[0] || new MediaStream([event.track]);

      const remoteVideo = document.getElementById('call-remote-video');
      const remoteAudio = document.getElementById('call-remote-audio');
      const placeholder = document.getElementById('call-remote-placeholder');

      if (remoteVideo) {
        remoteVideo.srcObject = this.remoteStream;
        remoteVideo.play().catch(e => console.warn('Remote video play warning:', e));
      }
      if (remoteAudio) {
        remoteAudio.srcObject = this.remoteStream;
        remoteAudio.play().catch(e => console.warn('Remote audio play warning:', e));
      }

      const hasRemoteVideo = this.remoteStream.getVideoTracks().length > 0;
      if (hasRemoteVideo) {
        if (placeholder) placeholder.classList.add('opacity-0');
        const videoContainer = document.getElementById('call-video-container');
        const voiceContainer = document.getElementById('call-voice-container');
        if (videoContainer) videoContainer.classList.remove('hidden');
        if (voiceContainer) voiceContainer.classList.add('hidden');
      }

      if (window.sounds) window.sounds.stopRinging();
      this.startTimer();
    };

    // Add local tracks & boost HD video bitrate
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        try {
          const sender = this.peerConnection.addTrack(track, this.localStream);
          if (track.kind === 'video') {
            await this.boostVideoSenderQuality(sender);
          }
        } catch (err) {
          console.warn('Could not add track:', err);
        }
      }
    }
  }

  async startCall(contact, type = 'voice', isGroup = false) {
    if (!contact && window.chat?.activeChatId) {
      contact = window.chat.contacts.find(c => c.id === window.chat.activeChatId);
    }
    if (!contact) return;

    // Support calling startCall('voice') directly when contact is first arg or string
    if (typeof contact === 'string') {
      type = contact;
      contact = window.chat?.contacts.find(c => c.id === window.chat?.activeChatId);
      if (!contact) return;
    }

    this.isInCall = true;
    this.callType = type;
    this.targetUserId = contact.id;
    this.callDuration = 0;
    this.wasConnected = false;
    this.isMuted = false;
    this.isVideoOff = type !== 'video';
    this.queuedCandidates = [];

    if (window.auth) window.auth.setStatus('busy');

    const modal = document.getElementById('call-modal-overlay');
    const nameEl = document.getElementById('call-user-name');
    const avatarEl = document.getElementById('call-user-avatar');
    const remoteAvatarEl = document.getElementById('call-video-remote-avatar');
    const placeholder = document.getElementById('call-remote-placeholder');
    const placeholderText = document.getElementById('call-remote-placeholder-text');
    const statusEl = document.getElementById('call-status-label');
    const videoContainer = document.getElementById('call-video-container');
    const voiceContainer = document.getElementById('call-voice-container');
    const beautyPanel = document.getElementById('call-beauty-panel');
    const btnTest = document.getElementById('btn-call-test-simulation');

    if (btnTest) btnTest.classList.remove('hidden');

    const avatarSrc = contact.avatar || '/uploads/avatar_hieu.jpg';
    if (nameEl) nameEl.textContent = contact.name;
    if (avatarEl) avatarEl.src = avatarSrc;
    if (remoteAvatarEl) remoteAvatarEl.src = avatarSrc;
    if (placeholder) placeholder.classList.remove('opacity-0');
    if (placeholderText) placeholderText.textContent = `Đang đổ chuông tới ${contact.name}...`;
    if (statusEl) statusEl.textContent = `Đang gọi ${type === 'video' ? 'Video Full HD' : 'Thoại HD'}...`;

    if (type === 'video') {
      if (videoContainer) videoContainer.classList.remove('hidden');
      if (voiceContainer) voiceContainer.classList.add('hidden');
      if (beautyPanel) beautyPanel.classList.remove('hidden');
    } else {
      if (videoContainer) videoContainer.classList.add('hidden');
      if (voiceContainer) voiceContainer.classList.remove('hidden');
      if (beautyPanel) beautyPanel.classList.add('hidden');
    }

    if (modal) modal.classList.remove('hidden');
    if (window.sounds) window.sounds.startIncomingRing();
    if (window.lucide) window.lucide.createIcons();

    // 1. Initialize Camera & Noise-Cancelled Mic
    await this.initLocalMedia(type === 'video');

    // 2. Create PeerConnection
    await this.createPeerConnection();

    // 3. Create SDP Offer with explicit audio/video receive directions
    try {
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === 'video'
      });
      await this.peerConnection.setLocalDescription(offer);

      const currentUserId = window.auth?.currentUser?.id || 'user_hieu';
      const callerName = window.auth?.currentUser?.name || 'Người dùng SEE LAD';
      const callerAvatar = window.auth?.currentUser?.avatar || '';

      await this.sendSignal(contact.id, 'call_start', {
        type: type,
        callerId: currentUserId,
        callerName: callerName,
        callerAvatar: callerAvatar,
        sdp: offer,
        filter: {
          filter: this.activeFilter,
          brightness: this.skinBrightness,
          sharpness: this.sharpnessLevel
        }
      });
    } catch (e) {
      console.error('Error creating call offer:', e);
    }

    // Ring timeout 35 seconds
    if (this.callTimeout) clearTimeout(this.callTimeout);
    this.callTimeout = setTimeout(() => {
      if (this.isInCall && !this.wasConnected) {
        if (window.app) window.app.showToast('Đối phương hiện không nhấc máy', 'warning');
        this.endCall(true);
      }
    }, 35000);
  }

  async handleIncomingSignal(data) {
    if (!data) return;
    if (data.sig_id) {
      if (this.processedSignals.has(data.sig_id)) return;
      this.processedSignals.add(data.sig_id);
    }

    const { signal_type, sender_id, payload } = data;

    if (signal_type === 'call_start') {
      this.incomingCaller = {
        id: sender_id,
        name: payload?.callerName || 'Người dùng SEE LAD',
        avatar: payload?.callerAvatar || '/uploads/avatar_hieu.jpg',
        type: payload?.type || 'voice',
        sdp: payload?.sdp,
        remoteFilter: payload?.filter
      };

      const incomingModal = document.getElementById('modal-incoming-call');
      const avatarEl = document.getElementById('incoming-call-avatar');
      const nameEl = document.getElementById('incoming-call-name');
      const typeText = document.getElementById('incoming-call-type-text');

      if (avatarEl) avatarEl.src = this.incomingCaller.avatar;
      if (nameEl) nameEl.textContent = this.incomingCaller.name;
      if (typeText) {
        typeText.textContent = `Đang gọi ${this.incomingCaller.type === 'video' ? 'Video Full HD' : 'Thoại HD'} cho bạn...`;
      }

      document.getElementById('modal-friend-requests')?.classList.add('hidden');
      document.getElementById('modal-user-profile')?.classList.add('hidden');
      document.getElementById('shared-profile-modal')?.classList.add('hidden');

      if (incomingModal) {
        incomingModal.classList.remove('hidden');
        incomingModal.classList.add('flex');
      }

      if (window.sounds) window.sounds.startIncomingRing();
      if (navigator.vibrate) {
        try { navigator.vibrate([500, 250, 500, 250, 500]); } catch (e) {}
      }
      if (window.lucide) window.lucide.createIcons();

    } else if (signal_type === 'call_accept') {
      this.wasConnected = true;
      if (this.callTimeout) clearTimeout(this.callTimeout);
      if (window.sounds) window.sounds.stopRinging();

      const statusEl = document.getElementById('call-status-label');
      const placeholder = document.getElementById('call-remote-placeholder');
      const btnTest = document.getElementById('btn-call-test-simulation');
      if (btnTest) btnTest.classList.add('hidden');
      if (statusEl) statusEl.textContent = '00:00 • Đã kết nối HD';

      if (payload?.sdp && this.peerConnection) {
        try {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          while (this.queuedCandidates.length > 0) {
            const c = this.queuedCandidates.shift();
            try {
              await this.peerConnection.addIceCandidate(new RTCIceCandidate(c));
            } catch (err) {}
          }
        } catch (e) {
          console.warn('Caller setRemoteDescription error:', e);
        }
      }
      if (this.callType === 'video' && placeholder) {
        placeholder.classList.add('opacity-0');
      }
      this.startTimer();

    } else if (signal_type === 'offer') {
      if (this.peerConnection && payload?.sdp) {
        try {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);
          await this.sendSignal(sender_id, 'answer', { sdp: answer });
        } catch (e) {
          console.warn('Offer renegotiation error:', e);
        }
      }

    } else if (signal_type === 'answer') {
      if (this.peerConnection && payload?.sdp) {
        this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp)).catch(() => {});
      }

    } else if (signal_type === 'ice_candidate') {
      const candidate = payload?.candidate;
      if (!candidate) return;
      if (this.peerConnection && this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
        this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        this.queuedCandidates.push(candidate);
      }

    } else if (signal_type === 'video_filter') {
      // Apply peer's chosen beauty filter to remote video stream
      const remoteVideo = document.getElementById('call-remote-video');
      if (remoteVideo && payload) {
        remoteVideo.style.filter = this.buildFilterCssString(
          payload.filter || 'beauty_glow',
          payload.brightness ?? 65,
          payload.sharpness ?? 80
        );
      }

    } else if (signal_type === 'call_end' || signal_type === 'call_rejected') {
      if (window.sounds) window.sounds.stopRinging();
      const incomingModal = document.getElementById('modal-incoming-call');
      if (incomingModal) incomingModal.classList.add('hidden');
      this.endCall(false);
    }
  }

  async acceptIncomingCall() {
    if (!this.incomingCaller) return;
    if (window.sounds) window.sounds.stopRinging();

    const incomingModal = document.getElementById('modal-incoming-call');
    if (incomingModal) incomingModal.classList.add('hidden');

    const caller = this.incomingCaller;
    this.incomingCaller = null;
    this.isInCall = true;
    this.callType = caller.type;
    this.targetUserId = caller.id;
    this.callDuration = 0;
    this.wasConnected = true;
    this.isMuted = false;
    this.isVideoOff = caller.type !== 'video';

    if (window.auth) window.auth.setStatus('busy');

    const modal = document.getElementById('call-modal-overlay');
    const nameEl = document.getElementById('call-user-name');
    const avatarEl = document.getElementById('call-user-avatar');
    const remoteAvatarEl = document.getElementById('call-video-remote-avatar');
    const placeholder = document.getElementById('call-remote-placeholder');
    const statusEl = document.getElementById('call-status-label');
    const videoContainer = document.getElementById('call-video-container');
    const voiceContainer = document.getElementById('call-voice-container');
    const beautyPanel = document.getElementById('call-beauty-panel');
    const btnTest = document.getElementById('btn-call-test-simulation');

    if (btnTest) btnTest.classList.add('hidden');

    if (nameEl) nameEl.textContent = caller.name;
    if (avatarEl) avatarEl.src = caller.avatar;
    if (remoteAvatarEl) remoteAvatarEl.src = caller.avatar;
    if (statusEl) statusEl.textContent = '00:00 • Đang kết nối HD...';

    if (caller.type === 'video') {
      if (videoContainer) videoContainer.classList.remove('hidden');
      if (voiceContainer) voiceContainer.classList.add('hidden');
      if (beautyPanel) beautyPanel.classList.remove('hidden');
      if (placeholder) placeholder.classList.add('opacity-0');
    } else {
      if (videoContainer) videoContainer.classList.add('hidden');
      if (voiceContainer) voiceContainer.classList.remove('hidden');
      if (beautyPanel) beautyPanel.classList.add('hidden');
    }

    if (modal) modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();

    // 1. Initialize Receiver Camera & Noise-Cancelled Mic
    await this.initLocalMedia(caller.type === 'video');

    // 2. Create PeerConnection
    await this.createPeerConnection();

    // 3. Apply Remote Offer & Send Answer
    try {
      if (caller.sdp) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(caller.sdp));

        while (this.queuedCandidates.length > 0) {
          const c = this.queuedCandidates.shift();
          try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(c));
          } catch (err) {}
        }

        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        await this.sendSignal(caller.id, 'call_accept', { sdp: answer });
        this.syncFilterToPeer();
      }
    } catch (e) {
      console.error('Error accepting call:', e);
    }

    this.startTimer();
  }

  declineIncomingCall() {
    if (window.sounds) window.sounds.stopRinging();
    const incomingModal = document.getElementById('modal-incoming-call');
    if (incomingModal) incomingModal.classList.add('hidden');

    if (this.incomingCaller) {
      this.sendSignal(this.incomingCaller.id, 'call_rejected', {
        was_connected: false,
        duration: 0,
        type: this.incomingCaller.type || 'voice'
      });
      this.incomingCaller = null;
    }
    this.stopLocalMediaOnly();
    if (window.app) window.app.showToast('Đã từ chối cuộc gọi');
  }

  async sendSignal(targetId, type, payload = {}) {
    const currentUserId = window.auth?.currentUser?.id || 'user_hieu';
    try {
      const res = await fetch('/api/call/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: currentUserId,
          target_user_id: targetId,
          signal_type: type,
          payload: payload
        })
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  simulateAnswerTest() {
    if (window.sounds) window.sounds.stopRinging();
    if (this.callTimeout) clearTimeout(this.callTimeout);

    const statusEl = document.getElementById('call-status-label');
    const btnTest = document.getElementById('btn-call-test-simulation');
    const placeholder = document.getElementById('call-remote-placeholder');
    const remoteVideo = document.getElementById('call-remote-video');

    if (btnTest) btnTest.classList.add('hidden');
    if (placeholder) placeholder.classList.add('opacity-0');

    // Mirror local stream onto main remote screen so user can inspect their Full HD camera & Beauty Filter
    if (remoteVideo && this.rawStream && this.rawStream.getVideoTracks().length > 0) {
      remoteVideo.srcObject = new MediaStream(this.rawStream.getVideoTracks());
      remoteVideo.muted = true;
      remoteVideo.classList.toggle('scale-x-[-1]', this.facingMode === 'user');
      remoteVideo.style.filter = this.buildFilterCssString(this.activeFilter, this.skinBrightness, this.sharpnessLevel);
      remoteVideo.play().catch(() => {});
    }

    if (statusEl) statusEl.textContent = '00:00 • Chế độ Thử nghiệm Camera & Filter';
    if (window.sounds) window.sounds.playTypewriterBell();
    if (window.app) window.app.showToast('Đã bật chế độ kiểm tra Camera Full HD & Filter làm đẹp! ✨');

    this.startTimer();
  }

  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    const statusEl = document.getElementById('call-status-label');

    this.timerInterval = setInterval(() => {
      this.callDuration++;
      const mins = String(Math.floor(this.callDuration / 60)).padStart(2, '0');
      const secs = String(this.callDuration % 60).padStart(2, '0');
      if (statusEl) statusEl.textContent = `${mins}:${secs} • HD`;
    }, 1000);
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    const btnMute = document.getElementById('btn-call-toggle-mute');
    if (btnMute) {
      btnMute.classList.toggle('bg-red-500/80', this.isMuted);
      btnMute.classList.toggle('bg-slate-800/90', !this.isMuted);
    }
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => (t.enabled = !this.isMuted));
    }
    if (this.rawStream) {
      this.rawStream.getAudioTracks().forEach(t => (t.enabled = !this.isMuted));
    }
    if (window.app) window.app.showToast(this.isMuted ? 'Đã tắt Micro' : 'Đã bật Micro (Khử tạp âm AI)');
  }

  async toggleCamera() {
    // If no video track yet (e.g., started as voice call or permission not granted), request camera now
    const hasVideoTrack = this.rawStream && this.rawStream.getVideoTracks().length > 0;
    if (!hasVideoTrack) {
      await this.requestAndAttachCamera();
      return;
    }

    this.isVideoOff = !this.isVideoOff;
    const btnCam = document.getElementById('btn-call-toggle-cam');
    if (btnCam) {
      btnCam.classList.toggle('bg-red-500/80', this.isVideoOff);
      btnCam.classList.toggle('bg-slate-800/90', !this.isVideoOff);
    }
    if (this.rawStream) {
      this.rawStream.getVideoTracks().forEach(t => (t.enabled = !this.isVideoOff));
    }
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(t => (t.enabled = !this.isVideoOff));
    }
    if (window.app) window.app.showToast(this.isVideoOff ? 'Đã tạm tắt Camera' : 'Đã bật Camera Full HD');
  }

  /**
   * Completely release Microphone, Camera, and AudioContext so there is ZERO noise when not calling
   */
  stopLocalMediaOnly() {
    if (this.rawStream) {
      this.rawStream.getTracks().forEach(t => {
        try { t.stop(); } catch (e) {}
      });
      this.rawStream = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => {
        try { t.stop(); } catch (e) {}
      });
      this.localStream = null;
    }
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(t => {
        try { t.stop(); } catch (e) {}
      });
      this.remoteStream = null;
    }
    if (this.audioCleanCtx && this.audioCleanCtx.state !== 'closed') {
      this.audioCleanCtx.close().catch(() => {});
      this.audioCleanCtx = null;
    }

    const localVideo = document.getElementById('call-local-video');
    const remoteVideo = document.getElementById('call-remote-video');
    const remoteAudio = document.getElementById('call-remote-audio');

    if (localVideo) {
      localVideo.pause();
      localVideo.srcObject = null;
    }
    if (remoteVideo) {
      remoteVideo.pause();
      remoteVideo.srcObject = null;
    }
    if (remoteAudio) {
      remoteAudio.pause();
      remoteAudio.srcObject = null;
    }
  }

  endCall(notifyPeer = true) {
    if (notifyPeer && this.targetUserId) {
      this.sendSignal(this.targetUserId, 'call_end', {
        was_connected: this.wasConnected,
        duration: this.callDuration,
        type: this.callType
      });
    }

    if (this.callTimeout) clearTimeout(this.callTimeout);
    if (window.sounds) window.sounds.stopRinging();

    this.isInCall = false;
    this.incomingCaller = null;
    this.targetUserId = null;
    this.queuedCandidates = [];

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    if (this.peerConnection) {
      try { this.peerConnection.close(); } catch (e) {}
      this.peerConnection = null;
    }

    // Strictly release all hardware mic & camera tracks so zero background noise occurs outside calls
    this.stopLocalMediaOnly();

    if (window.auth) window.auth.setStatus('online');
    if (window.sounds) window.sounds.playCallEnd();

    const modal = document.getElementById('call-modal-overlay');
    if (modal) modal.classList.add('hidden');

    const incomingModal = document.getElementById('modal-incoming-call');
    if (incomingModal) incomingModal.classList.add('hidden');

    if (window.app) window.app.showToast('Cuộc gọi đã kết thúc');
  }
}

window.call = new CallController();
