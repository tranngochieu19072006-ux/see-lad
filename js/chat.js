/**
 * SEE LAD - Real-Time Chat Engine & Conversation Management
 * Nhắn tin thật qua Database SQLite, nhận tin tức thời qua SSE
 */

class ChatController {
  constructor() {
    this.activeChatId = null;
    this.messages = {};
    this.contacts = [];
    this.blockedUsers = new Set();
    this.pinnedMessages = {};
    this.stagedFile = null;
    this.lastSyncedMsgId = null;
    this.liveSyncInterval = null;
    this._isSyncing = false;
    this.wallpapers = {};
    this.nicknames = {};
  }

  async init() {
    await this.loadContacts();
    await this.loadWallpapers();
    await this.loadNicknames();
    await this.loadFriendRequests();
    this.bindEvents();
    this.startLiveSyncLoop();
  }

  startLiveSyncLoop() {
    if (this.liveSyncInterval) clearInterval(this.liveSyncInterval);
    // Immediate initial sync
    this.triggerLiveSync();
    // Continuous heartbeat live sync every 1800ms
    this.liveSyncInterval = setInterval(() => {
      this.triggerLiveSync();
    }, 1800);
  }

  async triggerLiveSync() {
    if (this._isSyncing) return;
    const currentUserId = window.auth?.currentUser?.id;
    if (!currentUserId) return;

    this._isSyncing = true;
    try {
      const url = `/api/messages/live-sync?user_id=${encodeURIComponent(currentUserId)}&since_id=${encodeURIComponent(this.lastSyncedMsgId || '')}&active_chat_id=${encodeURIComponent(this.activeChatId || '')}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Sync failed");
      const data = await res.json();
      if (data.messages && data.messages.length > 0) {
        let hadNewActiveMsg = false;
        for (const msg of data.messages) {
          this.lastSyncedMsgId = msg.id;
          const isNew = this.receiveRealtimeMessage(msg, false);
          if (isNew && this.activeChatId && (msg.sender_id === this.activeChatId || msg.conversation_id === this.activeChatId)) {
            hadNewActiveMsg = true;
          }
        }
        if (hadNewActiveMsg && window.sounds) {
          window.sounds.playMessageReceived();
        }
      }
    } catch (e) {
      // Quiet failover, will retry automatically next loop
    } finally {
      this._isSyncing = false;
    }
  }

  async loadContacts() {
    const currentUserId = window.auth?.currentUser?.id || 'user_guest';
    try {
      const res = await fetch(`/api/friends?user_id=${currentUserId}`);
      const data = await res.json();
      if (data.contacts && data.contacts.length > 0) {
        this.contacts = data.contacts;
      } else {
        this.contacts = [...window.SEE_LAD_CONFIG.contacts];
      }
    } catch (e) {
      this.contacts = [...window.SEE_LAD_CONFIG.contacts];
    }

    // Restore saved per-chat themes from localStorage
    try {
      const savedThemes = JSON.parse(localStorage.getItem('seelad_chat_themes') || '{}');
      this.contacts.forEach(c => {
        if (savedThemes[c.id]) c.chatTheme = savedThemes[c.id];
      });
    } catch (e) {}

    this.renderConversationList();

    const savedActiveId = localStorage.getItem('seelad_active_chat_id');
    const targetActiveId = (savedActiveId && this.contacts.find(c => c.id === savedActiveId))
      ? savedActiveId
      : (this.contacts.length === 1 ? this.contacts[0].id : null);

    if (this.contacts.length > 0) {
      if (window.innerWidth >= 768) {
        const defaultId = targetActiveId || (this.contacts.find(c => c.id === this.activeChatId) ? this.activeChatId : this.contacts[0].id);
        this.selectChat(defaultId);
      } else if (targetActiveId) {
        this.selectChat(targetActiveId);
      } else {
        this.syncResponsiveChatLayout();
      }
    }
    await this.loadFriendRequests();
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      this.syncResponsiveChatLayout();
    });

    const chatForm = document.getElementById('chat-input-form');
    const chatInput = document.getElementById('chat-text-input');

    if (chatForm && chatInput) {
      chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();

        // Nếu có ảnh / file đang được chọn chờ gửi
        if (this.stagedFile) {
          const fileToSend = this.stagedFile;
          this.clearStagedFile();
          chatInput.value = '';
          await this.uploadAndSendFile(fileToSend, text);
          return;
        }

        if (text) {
          chatInput.value = '';
          await this.sendMessage({ type: 'text', content: text });
        }
      });
    }

    const searchInput = document.getElementById('search-chat-input');
    if (searchInput) {
      searchInput.addEventListener('input', async (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (query.length >= 2) {
          await this.searchAndShowUsers(query);
        } else {
          this.renderConversationList(query);
        }
      });
    }

    document.querySelectorAll('.chat-filter-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.chat-filter-tab').forEach(t => {
          t.classList.remove('bg-indigo-600', 'text-white');
          t.classList.add('text-slate-400');
        });
        tab.classList.add('bg-indigo-600', 'text-white');
        tab.classList.remove('text-slate-400');

        const filter = tab.getAttribute('data-filter');
        this.renderConversationList('', filter);
      });
    });

    const btnOpenGroupModal = document.getElementById('btn-open-create-group');
    const modalCreateGroup = document.getElementById('modal-create-group');
    const btnCancelGroup = document.getElementById('btn-cancel-create-group');
    const formCreateGroup = document.getElementById('form-create-group');
    const groupMemberSearch = document.getElementById('group-member-search-input');
    const btnSelectAllGroup = document.getElementById('btn-group-select-all');

    if (btnOpenGroupModal && modalCreateGroup) {
      btnOpenGroupModal.addEventListener('click', async () => {
        modalCreateGroup.classList.remove('hidden');
        await this.populateGroupMembersCheckbox();
        if (window.lucide) window.lucide.createIcons();
        setTimeout(() => document.getElementById('group-name-input')?.focus(), 80);
      });

      if (btnCancelGroup) {
        btnCancelGroup.addEventListener('click', () => modalCreateGroup.classList.add('hidden'));
      }

      if (groupMemberSearch) {
        groupMemberSearch.addEventListener('input', (e) => {
          this.filterGroupMemberCards(e.target.value.trim().toLowerCase());
        });
      }

      if (btnSelectAllGroup) {
        btnSelectAllGroup.addEventListener('click', () => {
          this.toggleSelectAllGroupMembers();
        });
      }

      if (formCreateGroup) {
        formCreateGroup.addEventListener('submit', async (e) => {
          e.preventDefault();
          const nameInput = document.getElementById('group-name-input');
          const name = nameInput ? nameInput.value.trim() : '';
          const checked = Array.from(document.querySelectorAll('.group-member-cb:checked')).map(cb => cb.value);
          if (!name) {
            if (window.app) window.app.showToast("Vui lòng nhập tên nhóm chat!", "warning");
            return;
          }
          if (checked.length === 0) {
            if (window.app) window.app.showToast("Hãy nhấp chọn ít nhất 1 người bạn để tạo nhóm!", "warning");
            return;
          }
          await this.createNewGroup(name, checked);
          modalCreateGroup.classList.add('hidden');
          if (nameInput) nameInput.value = '';
        });
      }
    }

    const btnChatMenu = document.getElementById('btn-chat-options-menu');
    const menuChatOptions = document.getElementById('chat-options-dropdown');

    if (btnChatMenu && menuChatOptions) {
      btnChatMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        menuChatOptions.classList.toggle('hidden');
      });

      document.addEventListener('click', () => {
        menuChatOptions.classList.add('hidden');
      });
    }

    document.querySelectorAll('.btn-set-chat-theme').forEach(btn => {
      btn.addEventListener('click', () => {
        const theme = btn.getAttribute('data-theme');
        this.setChatTheme(this.activeChatId, theme);
      });
    });

    const btnBlock = document.getElementById('btn-action-block');
    if (btnBlock) {
      btnBlock.addEventListener('click', () => this.toggleBlockUser(this.activeChatId));
    }

    const btnReport = document.getElementById('btn-action-report');
    const modalReport = document.getElementById('modal-report-user');
    const btnCancelReport = document.getElementById('btn-cancel-report');
    const formReport = document.getElementById('form-report-user');

    if (btnReport && modalReport) {
      btnReport.addEventListener('click', () => modalReport.classList.remove('hidden'));
      if (btnCancelReport) btnCancelReport.addEventListener('click', () => modalReport.classList.add('hidden'));
      if (formReport) {
        formReport.addEventListener('submit', (e) => {
          e.preventDefault();
          modalReport.classList.add('hidden');
          if (window.app) window.app.showToast("Báo cáo vi phạm đã được ghi nhận trên hệ thống!");
        });
      }
    }

    const btnInvite = document.getElementById('btn-action-invite');
    const modalInvite = document.getElementById('modal-invite-link');
    const btnCloseInvite = document.getElementById('btn-close-invite');
    const btnResetInvite = document.getElementById('btn-reset-invite-link');
    const btnCopyInvite = document.getElementById('btn-copy-invite-link');

    if (btnInvite && modalInvite) {
      btnInvite.addEventListener('click', () => {
        this.updateInviteModalUI();
        modalInvite.classList.remove('hidden');
      });

      if (btnCloseInvite) btnCloseInvite.addEventListener('click', () => modalInvite.classList.add('hidden'));
      if (btnResetInvite) btnResetInvite.addEventListener('click', () => this.resetInviteCode(this.activeChatId));
      if (btnCopyInvite) {
        btnCopyInvite.addEventListener('click', () => {
          const input = document.getElementById('invite-link-input');
          if (input) {
            navigator.clipboard.writeText(input.value);
            if (window.app) window.app.showToast("Đã sao chép liên kết mời! 📋");
          }
        });
      }
    }

    const btnWallpaper = document.getElementById('btn-action-wallpaper');
    if (btnWallpaper) {
      btnWallpaper.addEventListener('click', () => this.openWallpaperModal());
    }

    const btnNickname = document.getElementById('btn-action-nickname');
    if (btnNickname) {
      btnNickname.addEventListener('click', () => this.openNicknameModal());
    }

    const btnEmoji = document.getElementById('btn-open-emoji');
    const emojiPopup = document.getElementById('emoji-picker-popup');
    if (btnEmoji && emojiPopup) {
      btnEmoji.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPopup.classList.toggle('hidden');
      });

      document.addEventListener('click', () => emojiPopup.classList.add('hidden'));
      document.querySelectorAll('.emoji-item').forEach(item => {
        item.addEventListener('click', () => {
          const chatInput = document.getElementById('chat-text-input');
          if (chatInput) {
            chatInput.value += item.textContent.trim();
            chatInput.focus();
          }
        });
      });
    }

    // 1. Tải ảnh chuyên dụng (Dedicated Image / Video Attachment)
    const imageAttachInput = document.getElementById('chat-image-attach-input');
    if (imageAttachInput) {
      imageAttachInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          this.stageFile(file, 'image');
        }
        imageAttachInput.value = '';
      });
    }

    // 2. Tải tệp tài liệu bất kỳ (Document / Any File)
    const fileAttachInput = document.getElementById('chat-file-attach-input');
    if (fileAttachInput) {
      fileAttachInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          this.stageFile(file);
        }
        fileAttachInput.value = '';
      });
    }

    // 3. Nút Gửi ngay trên thanh xem trước Media
    const btnSendPreview = document.getElementById('btn-send-preview-media');
    if (btnSendPreview) {
      btnSendPreview.addEventListener('click', async () => {
        if (this.stagedFile) {
          const fileToSend = this.stagedFile;
          const chatInput = document.getElementById('chat-text-input');
          const text = chatInput ? chatInput.value.trim() : '';
          if (chatInput) chatInput.value = '';
          this.clearStagedFile();
          await this.uploadAndSendFile(fileToSend, text);
        }
      });
    }

    // 4. Nút Hủy chọn Media
    const btnCancelPreview = document.getElementById('btn-cancel-media-preview');
    if (btnCancelPreview) {
      btnCancelPreview.addEventListener('click', () => {
        this.clearStagedFile();
      });
    }

    // 4b. Nút Chia sẻ Vị trí hiện tại
    const btnShareLocation = document.getElementById('btn-share-location-chat');
    if (btnShareLocation) {
      btnShareLocation.addEventListener('click', () => {
        this.shareCurrentLocation();
      });
    }

    // 5. Dán ảnh trực tiếp từ Clipboard (Ctrl + V)
    window.addEventListener('paste', (e) => {
      const mainApp = document.getElementById('main-app');
      if (!mainApp || mainApp.classList.contains('hidden')) return;

      const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            if (window.app) window.app.showToast("Đã nhận ảnh từ bộ nhớ tạm (Clipboard)! 📋");
            this.stageFile(file, 'image');
            break;
          }
        }
      }
    });

    // 6. Kéo thả ảnh hoặc tệp vào khung chat (Drag & Drop)
    const dropZone = document.getElementById('chat-messages-container');
    if (dropZone) {
      ['dragenter', 'dragover'].forEach(name => {
        dropZone.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropZone.classList.add('ring-2', 'ring-cyan-400', 'ring-inset');
        });
      });

      ['dragleave', 'drop'].forEach(name => {
        dropZone.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropZone.classList.remove('ring-2', 'ring-cyan-400', 'ring-inset');
        });
      });

      dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          const file = files[0];
          this.stageFile(file);
        }
      });
    }

    // 7. Nút Quay lại danh bạ trên điện thoại (Mobile Back Button)
    const btnBack = document.getElementById('btn-back-to-chat-list');
    if (btnBack) {
      btnBack.addEventListener('click', () => {
        this.closeMobileChat();
      });
    }

    // 8. Lời mời kết bạn: Mở modal danh sách lời mời
    const btnOpenReqSidebar = document.getElementById('btn-open-friend-requests');
    const btnOpenReqHeader = document.getElementById('btn-header-friend-requests');
    const btnCloseReq = document.getElementById('btn-close-friend-requests');
    const modalReq = document.getElementById('modal-friend-requests');

    if (btnOpenReqSidebar) {
      btnOpenReqSidebar.addEventListener('click', () => this.openFriendRequestsModal());
    }
    if (btnOpenReqHeader) {
      btnOpenReqHeader.addEventListener('click', () => this.openFriendRequestsModal());
    }
    if (btnCloseReq && modalReq) {
      btnCloseReq.addEventListener('click', () => modalReq.classList.add('hidden'));
    }

    // 9. Gửi lời mời kết bạn (kèm lời nhắn)
    const btnCloseSendReq = document.getElementById('btn-close-send-request');
    const btnCancelSendReq = document.getElementById('btn-cancel-send-request');
    const modalSendReq = document.getElementById('modal-send-friend-request');
    const formSendReq = document.getElementById('form-send-friend-request');

    if (btnCloseSendReq && modalSendReq) {
      btnCloseSendReq.addEventListener('click', () => modalSendReq.classList.add('hidden'));
    }
    if (btnCancelSendReq && modalSendReq) {
      btnCancelSendReq.addEventListener('click', () => modalSendReq.classList.add('hidden'));
    }
    if (formSendReq) {
      formSendReq.addEventListener('submit', async (e) => {
        e.preventDefault();
        const targetId = document.getElementById('send-request-target-id')?.value;
        const message = document.getElementById('send-request-message')?.value?.trim();
        await this.submitFriendRequest(targetId, message);
      });
    }

    // Tự động khôi phục bố cục 2 cột khi xoay ngang hoặc mở rộng màn hình
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 640) {
        const sidebar = document.getElementById('chat-sidebar');
        const chatWindow = document.getElementById('chat-active-window');
        if (sidebar) sidebar.classList.remove('hidden');
        if (chatWindow) {
          chatWindow.classList.remove('hidden');
          chatWindow.classList.add('flex');
        }
        const mainNav = document.querySelector('nav');
        if (mainNav) mainNav.classList.remove('hidden-on-mobile-chat');
        const mainHeader = document.querySelector('header');
        if (mainHeader) mainHeader.classList.remove('hidden-on-mobile-chat');
      }
    });
  }

  async searchAndShowUsers(query) {
    const listEl = document.getElementById('conversation-list');
    if (!listEl) return;

    const currentUserId = window.auth?.currentUser?.id || 'user_guest';
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}&current_user_id=${currentUserId}`);
      const data = await res.json();
      const users = data.users || [];

      if (users.length === 0) {
        listEl.innerHTML = `
          <div class="p-6 text-center text-xs text-slate-400">
            Không tìm thấy người dùng nào với từ khóa "${this.escapeHtml(query)}"
          </div>
        `;
        return;
      }

      listEl.innerHTML = `
        <div class="px-3 py-2 text-[11px] font-bold text-indigo-400 uppercase tracking-wider">Kết quả tìm kiếm toàn hệ thống:</div>
        <div class="space-y-2 p-1">
          ${users.map(u => {
            let actionBtn = '';
            if (u.relationship === 'friend') {
              actionBtn = `
                <button onclick="window.chat.selectChat('${u.id}')" class="px-3 py-1.5 rounded-xl bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white border border-emerald-500/30 text-xs font-semibold flex items-center gap-1 transition-all">
                  <i data-lucide="message-square" class="w-3.5 h-3.5"></i>
                  <span>Nhắn tin</span>
                </button>
              `;
            } else if (u.relationship === 'pending_sent') {
              actionBtn = `
                <span class="px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] font-semibold flex items-center gap-1">
                  <i data-lucide="clock" class="w-3 h-3"></i>
                  <span>Đã gửi lời mời</span>
                </span>
              `;
            } else if (u.relationship === 'pending_received') {
              actionBtn = `
                <button onclick="window.chat.openFriendRequestsModal()" class="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1 shadow-sm transition-all">
                  <i data-lucide="user-check" class="w-3.5 h-3.5"></i>
                  <span>Xem lời mời</span>
                </button>
              `;
            } else {
              actionBtn = `
                <button onclick="window.chat.openSendFriendRequestModal('${u.id}', '${this.escapeHtml(u.name)}', '${u.avatar || ''}', '${u.username || ''}')" class="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all">
                  <i data-lucide="user-plus" class="w-3.5 h-3.5"></i>
                  <span>Kết bạn</span>
                </button>
              `;
            }

            const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || 'User')}&background=4f46e5&color=fff&bold=true`;
            const avatarUrl = u.avatar || fallbackAvatar;
            const noteBadge = u.profile_note ? `
              <span class="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full bg-cyan-400 text-[9px] text-black font-extrabold shadow flex items-center gap-0.5" title="${this.escapeHtml(u.profile_note)}">
                <span>💭</span>
              </span>
            ` : '';

            return `
              <div class="flex items-center justify-between p-2.5 sm:p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors border border-white/5 group">
                <div class="flex items-center gap-3 min-w-0 cursor-pointer flex-1 group/user" onclick="if(window.feed) window.feed.openUserProfile('${u.id}')" title="Bấm để xem trang cá nhân của ${this.escapeHtml(u.name)}">
                  <div class="relative shrink-0">
                    <img src="${avatarUrl}" onerror="this.onerror=null; this.src='${fallbackAvatar}';" class="w-11 h-11 rounded-xl object-cover border border-white/10 group-hover/user:scale-105 transition-transform" />
                    ${noteBadge}
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                      <p class="font-bold text-xs text-white truncate group-hover/user:text-cyan-400 transition-colors">${this.escapeHtml(u.name)}</p>
                      <i data-lucide="external-link" class="w-3 h-3 text-slate-500 group-hover/user:text-cyan-400 opacity-0 group-hover/user:opacity-100 transition-opacity"></i>
                    </div>
                    <p class="text-[10px] font-mono text-cyan-400/90 truncate">@${this.escapeHtml(u.username || 'user')}</p>
                    <p class="text-[10px] text-slate-400 truncate">${this.escapeHtml(u.bio || 'Thành viên SEE LAD')}</p>
                  </div>
                </div>
                <div class="shrink-0 ml-2">
                  ${actionBtn}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      console.warn(e);
    }
  }

  openSendFriendRequestModal(targetId, targetName, targetAvatar, targetUsername) {
    const modal = document.getElementById('modal-send-friend-request');
    if (!modal) return;

    const inputId = document.getElementById('send-request-target-id');
    const nameEl = document.getElementById('send-request-target-name');
    const userEl = document.getElementById('send-request-target-username');
    const avatarEl = document.getElementById('send-request-target-avatar');
    const msgEl = document.getElementById('send-request-message');

    if (inputId) inputId.value = targetId;
    if (nameEl) nameEl.textContent = targetName;
    if (userEl) userEl.textContent = targetUsername ? '@' + targetUsername.replace('@', '') : '@user';
    if (avatarEl) avatarEl.src = targetAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${targetId}`;
    if (msgEl) {
      msgEl.value = `Chào ${targetName}, mình kết bạn trên SEE LAD để cùng trò chuyện và nhắn tin nhé!`;
    }

    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => msgEl?.focus(), 100);
  }

  async submitFriendRequest(targetId, message) {
    const currentUserId = window.auth?.currentUser?.id;
    if (!currentUserId) {
      alert("Vui lòng đăng nhập trước khi gửi lời mời kết bạn!");
      return;
    }

    const btnSubmit = document.getElementById('btn-submit-send-request');
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = '<span>Đang gửi...</span>';
    }

    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: currentUserId,
          receiver_id: targetId,
          message: message
        })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Gửi lời mời thất bại");
        return;
      }

      document.getElementById('modal-send-friend-request')?.classList.add('hidden');
      if (window.app) window.app.showToast("Đã gửi lời mời kết bạn kèm lời nhắn! 📨");

      const searchInput = document.getElementById('search-chat-input');
      if (searchInput && searchInput.value.trim()) {
        await this.searchAndShowUsers(searchInput.value.trim());
      }
    } catch (e) {
      alert("Lỗi kết nối máy chủ: " + e.message);
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<i data-lucide="send" class="w-3.5 h-3.5"></i><span>Gửi lời mời</span>';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  async loadFriendRequests() {
    const currentUserId = window.auth?.currentUser?.id || 'user_guest';
    try {
      const res = await fetch(`/api/friends/requests?user_id=${currentUserId}`);
      const data = await res.json();
      const requests = data.requests || [];
      const count = requests.length;

      const badgeSidebar = document.getElementById('badge-friend-requests-count');
      const badgeHeader = document.getElementById('badge-header-requests');
      const badgeModal = document.getElementById('friend-requests-count-badge');

      if (badgeSidebar) {
        badgeSidebar.textContent = count;
        if (count > 0) badgeSidebar.classList.remove('hidden');
        else badgeSidebar.classList.add('hidden');
      }

      if (badgeHeader) {
        badgeHeader.textContent = count;
        if (count > 0) badgeHeader.classList.remove('hidden');
        else badgeHeader.classList.add('hidden');
      }

      if (badgeModal) {
        badgeModal.textContent = count;
      }

      const banner = document.getElementById('friend-requests-banner');
      if (banner) {
        if (count > 0) {
          banner.classList.remove('hidden');
          banner.innerHTML = `
            <div onclick="window.chat.openFriendRequestsModal()" class="p-2.5 rounded-2xl bg-gradient-to-r from-rose-500/15 via-purple-500/15 to-indigo-500/15 border border-rose-500/30 flex items-center justify-between cursor-pointer hover:bg-rose-500/25 transition-all shadow-sm">
              <div class="flex items-center gap-2.5 min-w-0">
                <div class="w-8 h-8 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-md">
                  <i data-lucide="user-plus" class="w-4 h-4"></i>
                </div>
                <div class="min-w-0">
                  <p class="text-xs font-bold text-white truncate">Bạn có ${count} lời mời kết bạn mới!</p>
                  <p class="text-[10px] text-rose-300 truncate">Nhấn để xem lời nhắn & đồng ý</p>
                </div>
              </div>
              <span class="px-2.5 py-1 rounded-xl bg-rose-500 text-white text-[11px] font-bold shrink-0 shadow-sm">Xem</span>
            </div>
          `;
          if (window.lucide) window.lucide.createIcons();
        } else {
          banner.classList.add('hidden');
          banner.innerHTML = '';
        }
      }

      return requests;
    } catch (e) {
      console.warn("Could not load friend requests:", e);
      return [];
    }
  }

  async openFriendRequestsModal() {
    const modal = document.getElementById('modal-friend-requests');
    const listEl = document.getElementById('friend-requests-list');
    if (!modal || !listEl) return;

    modal.classList.remove('hidden');
    listEl.innerHTML = `
      <div class="p-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
        <div class="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <span>Đang tải danh sách lời mời...</span>
      </div>
    `;

    const requests = await this.loadFriendRequests();

    if (requests.length === 0) {
      listEl.innerHTML = `
        <div class="p-8 text-center flex flex-col items-center justify-center my-4">
          <div class="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-3">
            <i data-lucide="user-check" class="w-8 h-8 text-indigo-400"></i>
          </div>
          <h4 class="text-sm font-bold text-white mb-1">Không có lời mời kết bạn nào</h4>
          <p class="text-xs text-slate-400 max-w-[240px] leading-relaxed">
            Khi có ai đó gửi lời mời kết bạn và lời nhắn cho bạn, lời mời sẽ xuất hiện ở đây!
          </p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    listEl.innerHTML = requests.map(req => {
      const msgHtml = req.message ? `
        <div class="mt-2.5 p-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-indigo-200 flex items-start gap-2">
          <i data-lucide="message-square" class="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0"></i>
          <div class="min-w-0 flex-1">
            <span class="text-[10px] text-slate-400 font-bold block mb-0.5">Lời nhắn kèm theo:</span>
            <p class="italic text-slate-200 break-words">"${this.escapeHtml(req.message)}"</p>
          </div>
        </div>
      ` : `
        <div class="mt-1 text-[11px] text-slate-400 italic">Không có lời nhắn kèm theo</div>
      `;

      return `
        <div class="p-3.5 rounded-2xl bg-[#121824] border border-[#1f293d] hover:border-indigo-500/30 transition-all">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <img src="${req.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + req.sender_id}" class="w-12 h-12 rounded-2xl object-cover border border-white/10 shrink-0" />
              <div class="min-w-0">
                <h4 class="font-bold text-sm text-white truncate">${this.escapeHtml(req.name)}</h4>
                <p class="text-xs text-slate-400 truncate">@${this.escapeHtml(req.username || 'user')}</p>
                <p class="text-[10px] text-slate-500 mt-0.5">${new Date(req.created_at).toLocaleString('vi-VN')}</p>
              </div>
            </div>

            <div class="flex items-center gap-1.5 shrink-0">
              <button onclick="window.chat.respondFriendRequest(${req.id}, 'accept')" class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 shadow-sm transition-all">
                <i data-lucide="check" class="w-3.5 h-3.5"></i>
                <span>Đồng ý</span>
              </button>
              <button onclick="window.chat.respondFriendRequest(${req.id}, 'reject')" class="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-rose-400 text-xs font-semibold transition-all" title="Từ chối">
                <i data-lucide="x" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>

          ${msgHtml}
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  async respondFriendRequest(requestId, action) {
    const currentUserId = window.auth?.currentUser?.id || 'user_guest';
    try {
      const res = await fetch('/api/friends/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUserId, request_id: requestId, action })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Không thể xử lý yêu cầu");
        return;
      }

      if (action === 'accept') {
        if (window.sounds) window.sounds.playTypewriterBell();
        if (window.app) window.app.showToast(data.message || "Đã đồng ý kết bạn thành công! 🎉");
        await this.loadContacts();
        if (data.friend_id) {
          this.selectChat(data.friend_id);
        }
      } else {
        if (window.app) window.app.showToast("Đã từ chối lời mời kết bạn.");
      }

      const remaining = await this.loadFriendRequests();
      if (remaining.length === 0) {
        setTimeout(() => {
          document.getElementById('modal-friend-requests')?.classList.add('hidden');
        }, 1200);
      }
      await this.openFriendRequestsModal();
    } catch (e) {
      console.error("Error in respondFriendRequest:", e);
      alert("Lỗi kết nối máy chủ: " + e.message);
    }
  }

  async addFriendAndStartChat(targetId) {
    const currentUserId = window.auth?.currentUser?.id || 'user_guest';
    try {
      await fetch('/api/friends/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUserId, target_id: targetId })
      });
      await this.loadContacts();
      this.selectChat(targetId);
      if (window.app) window.app.showToast("Đã kết bạn thành công! Bắt đầu trò chuyện ngay 💬");
    } catch (e) {
      console.error(e);
    }
  }

  renderConversationList(query = '', filter = 'all') {
    const listEl = document.getElementById('conversation-list');
    if (!listEl) return;

    let filtered = this.contacts;
    if (filter === 'direct') filtered = filtered.filter(c => !c.isGroup);
    else if (filter === 'group') filtered = filtered.filter(c => c.isGroup);

    if (query) {
      filtered = filtered.filter(c => c.name.toLowerCase().includes(query) || (c.username && c.username.toLowerCase().includes(query)));
    }

    if (this.contacts.length === 0) {
      listEl.innerHTML = `
        <div class="p-6 text-center flex flex-col items-center justify-center my-6">
          <div class="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-3 shadow-lg">
            <i data-lucide="users" class="w-8 h-8 text-indigo-400"></i>
          </div>
          <h4 class="text-sm font-bold text-white mb-1">Chưa có bạn bè trong danh bạ</h4>
          <p class="text-xs text-slate-400 max-w-[210px] leading-relaxed mb-4">
            Hãy tìm kiếm bạn bè qua Tên, Email hoặc quét Mã QR để bắt đầu kết nối!
          </p>
          <button onclick="document.getElementById('search-chat-input')?.focus()" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md">
            <i data-lucide="user-plus" class="w-3.5 h-3.5"></i>
            <span>Tìm kiếm bạn bè</span>
          </button>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    if (filtered.length === 0 && query) {
      listEl.innerHTML = `
        <div class="p-6 text-center text-xs text-slate-400">
          Không tìm thấy liên hệ nào khớp với "${this.escapeHtml(query)}"
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered.map(c => {
      const isSelected = c.id === this.activeChatId;
      const msgs = this.messages[c.id] || [];
      const lastMsg = msgs[msgs.length - 1];
      
      let lastText = 'Bắt đầu cuộc trò chuyện';
      let time = '';
      if (lastMsg) {
        lastText = lastMsg.content || lastMsg.text || (lastMsg.type === 'image' ? '📷 Hình ảnh' : lastMsg.type === 'video' ? '🎬 Video' : lastMsg.type === 'audio' ? '🎙️ Tin nhắn thoại' : lastMsg.type === 'location' ? '📍 Vị trí GPS' : '📁 Tệp đính kèm');
        time = lastMsg.time || '';
      } else if (c.last_message) {
        lastText = c.last_message;
        if (c.last_message_type === 'image') lastText = '📷 Hình ảnh';
        else if (c.last_message_type === 'video') lastText = '🎬 Video';
        else if (c.last_message_type === 'audio') lastText = '🎙️ Tin nhắn thoại';
        else if (c.last_message_type === 'location') lastText = '📍 Vị trí GPS';
        time = c.last_message_time || '';
      }

      const statusDotClass = c.isGroup ? '' : (
        c.status === 'online' ? 'status-online pulse' :
        c.status === 'busy' ? 'status-busy' : 'status-offline'
      );

      let streakBadgeHtml = '';
      if (!c.isGroup) {
        if (c.streak_status === 'lost') {
          streakBadgeHtml = `<span onclick="event.stopPropagation(); if(window.app) window.app.switchTab('streak');" class="px-1.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-extrabold flex items-center gap-0.5 shrink-0 hover:bg-rose-500/30" title="Chuỗi đã mất sau 48h • Bấm để khôi phục">❄️ Khôi phục</span>`;
        } else {
          const stCount = c.streak_count || 1;
          streakBadgeHtml = `<span onclick="event.stopPropagation(); if(window.app) window.app.switchTab('streak');" class="px-1.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-400/35 text-amber-300 text-[10px] font-extrabold flex items-center gap-0.5 shrink-0 hover:bg-orange-500/25" title="Chuỗi lửa vô hạn: ${stCount} 🔥 (Mất sau 48h)">🔥 ${stCount}</span>`;
        }
      } else {
        streakBadgeHtml = `<span class="px-1.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-400/30 text-indigo-300 text-[9px] font-bold shrink-0">Nhóm</span>`;
      }

      return `
        <div class="flex items-center gap-3.5 p-3 rounded-2xl cursor-pointer transition-all duration-200 ${isSelected ? 'bg-indigo-600/15 border border-indigo-500/30 shadow-sm' : 'bg-white/[0.015] border border-white/[0.04] hover:bg-slate-800/40'}" onclick="window.chat.selectChat('${c.id}')">
          <div class="relative shrink-0">
            <img src="${c.avatar}" class="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl object-cover border border-white/10" alt="${c.name}" />
            ${!c.isGroup ? `<span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#090d16] ${statusDotClass}"></span>` : ''}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex justify-between items-center mb-1 gap-1.5">
              <div class="flex items-center gap-1.5 min-w-0">
                <h4 class="font-semibold text-[13.5px] sm:text-sm truncate text-white">${this.nicknames[c.id] ? `<span class="text-amber-300 font-bold">✏️ ${this.escapeHtml(this.nicknames[c.id])}</span>` : this.escapeHtml(c.name)}</h4>
                ${streakBadgeHtml}
              </div>
              <span class="text-[11px] text-slate-400 shrink-0 font-mono">${time}</span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs text-slate-400 truncate">${lastText}</p>
              ${c.unread ? `<span class="px-1.5 py-0.5 bg-indigo-500 text-white text-[10px] font-bold rounded-full shrink-0">${c.unread}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Hiển thị danh sách bạn bè để nhấp chọn tạo nhóm chat mới
   */
  async populateGroupMembersCheckbox() {
    const listContainer = document.getElementById('group-members-select-list');
    if (!listContainer) return;

    let candidateFriends = this.contacts.filter(c => !c.isGroup);

    // Nếu danh sách bạn bè còn ít, tải thêm người dùng trên hệ thống để dễ dàng chọn tạo nhóm
    if (candidateFriends.length < 2) {
      const currentUserId = window.auth?.currentUser?.id || 'user_hieu';
      try {
        const res = await fetch(`/api/users/search?q=&current_user_id=${encodeURIComponent(currentUserId)}`);
        const data = await res.json();
        if (data.users && data.users.length > 0) {
          data.users.forEach(u => {
            if (!candidateFriends.some(cf => cf.id === u.id)) {
              candidateFriends.push({
                id: u.id,
                name: u.name,
                username: u.username,
                avatar: u.avatar,
                status: u.status || 'online'
              });
            }
          });
        }
      } catch (e) {}
    }

    if (candidateFriends.length === 0) {
      listContainer.innerHTML = `
        <div class="p-6 text-center text-xs text-slate-400">
          Chưa có bạn bè nào. Hãy kết bạn trước để thêm vào nhóm nhé!
        </div>
      `;
      this.updateGroupSelectedSummary();
      return;
    }

    listContainer.innerHTML = candidateFriends.map(f => {
      const avatarUrl = f.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${f.id}`;
      return `
        <div class="group-member-card flex items-center justify-between p-2.5 rounded-2xl bg-white/[0.03] hover:bg-indigo-500/15 border border-white/10 cursor-pointer transition-all select-none"
             data-name="${this.escapeHtml((f.name || '').toLowerCase())}"
             data-username="${this.escapeHtml((f.username || '').toLowerCase())}"
             onclick="window.chat.toggleGroupMemberCard(this)">
          <div class="flex items-center gap-3 min-w-0">
            <div class="relative shrink-0">
              <img src="${avatarUrl}" class="w-10 h-10 rounded-xl object-cover border border-white/15" alt="${this.escapeHtml(f.name)}" />
              <span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-[#090d16] ${f.status === 'online' ? 'bg-emerald-400' : 'bg-slate-400'}"></span>
            </div>
            <div class="min-w-0">
              <p class="font-bold text-xs sm:text-sm text-white truncate">${this.escapeHtml(f.name)}</p>
              <p class="text-[10px] text-slate-400 truncate">@${this.escapeHtml(f.username || 'seelad_friend')} • Nhấp để chọn vào nhóm</p>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <input type="checkbox" value="${f.id}" data-friend-name="${this.escapeHtml(f.name)}" data-friend-avatar="${avatarUrl}" class="group-member-cb hidden" />
            <div class="group-check-indicator w-6 h-6 rounded-xl border-2 border-slate-500 bg-black/30 flex items-center justify-center text-transparent transition-all">
              <i data-lucide="check" class="w-3.5 h-3.5"></i>
            </div>
          </div>
        </div>
      `;
    }).join('');

    this.updateGroupSelectedSummary();
    if (window.lucide) window.lucide.createIcons();
  }

  toggleGroupMemberCard(cardEl) {
    if (!cardEl) return;
    const cb = cardEl.querySelector('.group-member-cb');
    const indicator = cardEl.querySelector('.group-check-indicator');
    if (!cb) return;

    cb.checked = !cb.checked;
    if (cb.checked) {
      cardEl.classList.add('border-indigo-500', 'bg-indigo-600/20', 'shadow-md');
      cardEl.classList.remove('border-white/10', 'bg-white/[0.03]');
      if (indicator) {
        indicator.classList.add('bg-indigo-600', 'border-indigo-400', 'text-white', 'scale-105');
        indicator.classList.remove('border-slate-500', 'bg-black/30', 'text-transparent');
      }
    } else {
      cardEl.classList.remove('border-indigo-500', 'bg-indigo-600/20', 'shadow-md');
      cardEl.classList.add('border-white/10', 'bg-white/[0.03]');
      if (indicator) {
        indicator.classList.remove('bg-indigo-600', 'border-indigo-400', 'text-white', 'scale-105');
        indicator.classList.add('border-slate-500', 'bg-black/30', 'text-transparent');
      }
    }
    this.updateGroupSelectedSummary();
  }

  toggleSelectAllGroupMembers() {
    const cards = Array.from(document.querySelectorAll('#group-members-select-list .group-member-card')).filter(c => !c.classList.contains('hidden'));
    const allChecked = cards.every(c => c.querySelector('.group-member-cb')?.checked);
    cards.forEach(c => {
      const cb = c.querySelector('.group-member-cb');
      if (cb && cb.checked === allChecked) {
        this.toggleGroupMemberCard(c);
      }
    });
  }

  filterGroupMemberCards(query) {
    const cards = document.querySelectorAll('#group-members-select-list .group-member-card');
    cards.forEach(card => {
      const name = card.getAttribute('data-name') || '';
      const uname = card.getAttribute('data-username') || '';
      if (!query || name.includes(query) || uname.includes(query)) {
        card.classList.remove('hidden');
      } else {
        card.classList.add('hidden');
      }
    });
  }

  updateGroupSelectedSummary() {
    const checkedBoxes = Array.from(document.querySelectorAll('.group-member-cb:checked'));
    const countBadge = document.getElementById('group-selected-count-badge');
    const chipsWrap = document.getElementById('group-selected-chips');

    if (countBadge) {
      countBadge.textContent = `Đã chọn: ${checkedBoxes.length} bạn bè`;
    }
    if (chipsWrap) {
      if (checkedBoxes.length === 0) {
        chipsWrap.innerHTML = `<span class="text-[11px] text-slate-400 italic">Nhấp vào tên bạn bè bên dưới để thêm vào nhóm...</span>`;
      } else {
        chipsWrap.innerHTML = checkedBoxes.map(cb => `
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/25 border border-indigo-400/40 text-white text-[11px] font-bold">
            <img src="${cb.getAttribute('data-friend-avatar')}" class="w-4 h-4 rounded-full object-cover" />
            <span>${this.escapeHtml(cb.getAttribute('data-friend-name'))}</span>
          </span>
        `).join('');
      }
    }
  }

  async createNewGroup(name, memberIds) {
    const currentUserId = window.auth?.currentUser?.id || 'user_hieu';
    try {
      const res = await fetch('/api/groups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creator_id: currentUserId,
          name: name,
          member_ids: memberIds
        })
      });
      const data = await res.json();
      if (!res.ok || !data.group) {
        if (window.app) window.app.showToast(data.error || "Không thể tạo nhóm", "warning");
        return;
      }

      if (window.sounds) window.sounds.playTypewriterBell();
      if (window.confetti) {
        window.confetti({ particleCount: 55, spread: 65, origin: { y: 0.6 } });
      }
      if (window.app) {
        window.app.showToast(`🎉 Đã tạo nhóm "${name}" cùng ${memberIds.length} bạn bè thành công!`);
      }

      await this.loadContacts();
      this.selectChat(data.group.id);
    } catch (e) {
      console.error("Create group error:", e);
      if (window.app) window.app.showToast("Lỗi kết nối khi tạo nhóm", "warning");
    }
  }

  syncResponsiveChatLayout() {
    const sidebar = document.getElementById('chat-sidebar');
    const chatWindow = document.getElementById('chat-active-window');
    if (!sidebar || !chatWindow) return;

    const mainNav = document.querySelector('nav');
    const mainHeader = document.querySelector('header');

    if (window.innerWidth >= 768) {
      // Tablet & PC: Always show split-view (Sidebar + Active Chat Window)
      sidebar.classList.remove('hidden');
      chatWindow.classList.remove('hidden');
      chatWindow.classList.add('flex');
      if (mainNav) mainNav.classList.remove('hidden');
      if (mainHeader) mainHeader.classList.remove('hidden');
      if (!this.activeChatId && this.contacts.length > 0) {
        this.selectChat(this.contacts[0].id);
      }
    } else {
      // Mobile (< 768px): Master/Detail view
      if (this.activeChatId) {
        // In active chat: Hide sidebar, global header, and bottom nav to give 100% full-screen height
        sidebar.classList.add('hidden');
        chatWindow.classList.remove('hidden');
        chatWindow.classList.add('flex');
        if (mainNav) mainNav.classList.add('hidden');
        if (mainHeader) mainHeader.classList.add('hidden');
      } else {
        // In inbox: Show sidebar, global header, and bottom nav
        sidebar.classList.remove('hidden');
        chatWindow.classList.add('hidden');
        chatWindow.classList.remove('flex');
        if (mainNav) mainNav.classList.remove('hidden');
        if (mainHeader) mainHeader.classList.remove('hidden');
      }
    }
  }

  async selectChat(chatId) {
    this.activeChatId = chatId;
    localStorage.setItem('seelad_active_chat_id', chatId);
    const target = this.contacts.find(c => c.id === chatId);
    if (!target) return;

    this.syncResponsiveChatLayout();

    target.unread = 0;
    this.renderConversationList();

    const nameEl = document.getElementById('active-chat-name');
    const avatarEl = document.getElementById('active-chat-avatar');
    const statusDotEl = document.getElementById('active-chat-status-dot');
    const statusSubEl = document.getElementById('active-chat-status-text');

    const nick = this.nicknames[target.id];
    const displayName = nick ? `${nick} (${target.name})` : target.name;
    if (nameEl) nameEl.textContent = displayName;
    if (avatarEl) avatarEl.src = target.avatar;

    if (statusDotEl && statusSubEl) {
      if (target.isGroup) {
        statusDotEl.setAttribute('class', 'status-dot hidden');
        statusSubEl.textContent = `${target.membersCount || 4} thành viên`;
      } else {
        statusDotEl.setAttribute('class', 'status-dot');
        if (target.status === 'online') {
          statusDotEl.classList.add('status-online', 'pulse');
          statusSubEl.textContent = 'Đang hoạt động (Online)';
        } else if (target.status === 'busy') {
          statusDotEl.classList.add('status-busy');
          statusSubEl.textContent = 'Đang bận (Busy)';
        } else {
          statusDotEl.classList.add('status-offline');
          statusSubEl.textContent = 'Ngoại tuyến (Offline)';
        }
      }
    }

    this.updateBlockUI();
    this.updatePinnedBannerUI();
    this.applyActiveChatTheme(target.chatTheme || 'theme-cyber-indigo');
    this.applyChatWallpaper(chatId);

    await this.fetchMessagesForChat(chatId, target.isGroup);
    if (window.lucide) window.lucide.createIcons();
  }

  closeMobileChat() {
    this.activeChatId = null;
    localStorage.removeItem('seelad_active_chat_id');
    this.syncResponsiveChatLayout();
    this.renderConversationList();
  }

  quickCallBack(targetId, type = 'voice') {
    const contact = this.contacts.find(c => c.id === targetId);
    if (contact && window.call) {
      window.call.startCall(contact, type);
    } else {
      if (window.app) window.app.showToast("Đang kết nối lại cuộc gọi...", "info");
      if (window.call) window.call.startCall({ id: targetId, name: 'Bạn bè', avatar: '' }, type);
    }
  }

  async fetchMessagesForChat(chatId, isGroup = false) {
    const currentUserId = window.auth?.currentUser?.id || 'user_hieu';
    try {
      const res = await fetch(`/api/messages?user_id=${currentUserId}&target_id=${chatId}&is_group=${isGroup ? 'true' : 'false'}`);
      const data = await res.json();
      this.messages[chatId] = data.messages || [];
      this.renderMessages();
    } catch (e) {
      console.warn("Could not fetch messages from DB:", e);
      this.renderMessages();
    }
  }

  renderMessages() {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;

    const msgs = this.messages[this.activeChatId] || [];
    const currentUserId = window.auth?.currentUser?.id || 'user_hieu';

    if (msgs.length === 0) {
      const activeContact = this.contacts.find(c => c.id === this.activeChatId);
      const contactName = activeContact ? (activeContact.nickname || activeContact.name) : 'Người dùng';
      const contactAvatar = activeContact ? activeContact.avatar : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80';

      container.innerHTML = `
        <div class="h-full flex flex-col items-center justify-center text-center p-4 sm:p-8 animate-fade-in">
          <div class="max-w-md w-full glass p-6 sm:p-8 rounded-3xl border border-white/10 shadow-2xl flex flex-col items-center">
            <div class="relative mb-3">
              <img src="${contactAvatar}" onerror="this.src='https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'" class="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-indigo-500/50 shadow-xl" alt="${contactName}" />
              <div class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-[#0f172a] flex items-center justify-center">
                <span class="w-2 h-2 rounded-full bg-white animate-pulse"></span>
              </div>
            </div>
            
            <h4 class="font-bold text-base sm:text-lg text-white mb-1">Bắt đầu trò chuyện với ${contactName}</h4>
            <p class="text-xs text-slate-400 mb-5 leading-relaxed">Kết nối nhanh chóng, tin nhắn được mã hóa và đồng bộ thời gian thực siêu tốc trên SEE LAD.</p>
            
            <div class="w-full text-left">
              <p class="text-[11px] font-bold uppercase tracking-wider text-cyan-400 mb-2.5 flex items-center gap-1.5">
                <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
                <span>Gợi ý lời chào nhanh:</span>
              </p>
              <div class="flex flex-wrap gap-2">
                <button type="button" onclick="window.chat.sendQuickGreeting('👋 Xin chào!')" class="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-indigo-600/30 border border-white/10 hover:border-indigo-400/50 text-xs text-slate-200 hover:text-white transition-all cursor-pointer">
                  👋 Xin chào!
                </button>
                <button type="button" onclick="window.chat.sendQuickGreeting('✨ Bạn khỏe không?')" class="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-indigo-600/30 border border-white/10 hover:border-indigo-400/50 text-xs text-slate-200 hover:text-white transition-all cursor-pointer">
                  ✨ Bạn khỏe không?
                </button>
                <button type="button" onclick="window.chat.sendQuickGreeting('🔥 Cày chuỗi cùng mình nhé!')" class="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-orange-600/30 border border-white/10 hover:border-orange-400/50 text-xs text-orange-200 hover:text-white transition-all cursor-pointer">
                  🔥 Cày chuỗi cùng mình nhé!
                </button>
                <button type="button" onclick="window.chat.sendQuickGreeting('☕ Khi nào rảnh đi cafe nha!')" class="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-cyan-600/30 border border-white/10 hover:border-cyan-400/50 text-xs text-cyan-200 hover:text-white transition-all cursor-pointer">
                  ☕ Hẹn cafe trò chuyện
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    container.innerHTML = msgs.map(m => {
      const isMe = (m.sender_id || m.senderId) === currentUserId;
      let contentHtml = '';

      if (m.type === 'image') {
        const imgUrl = m.file_url || m.fileUrl;
        const imgName = m.file_name || m.fileName || 'seelad_image.png';
        contentHtml = `
          <div class="rounded-2xl overflow-hidden max-w-[260px] sm:max-w-sm border border-white/10 shadow-sm bg-black/20 group/img relative cursor-pointer" onclick="window.chat.openImageModal('${imgUrl}', '${imgName}')">
            <img src="${imgUrl}" class="w-full h-auto object-cover max-h-72 rounded-2xl hover:scale-[1.01] transition-transform" alt="Hình ảnh" loading="lazy" />
            <div class="absolute bottom-2 right-2 opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/70 backdrop-blur-md rounded-xl p-1.5 flex items-center gap-1.5 shadow-lg">
              <a href="${imgUrl}" download="${imgName}" class="text-white hover:text-[#38e1e8] p-1 transition-colors" title="Tải ảnh về máy" onclick="event.stopPropagation()">
                <i data-lucide="download" class="w-4 h-4"></i>
              </a>
              <button type="button" class="text-white hover:text-[#38e1e8] p-1 transition-colors" title="Xem ảnh to">
                <i data-lucide="maximize-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
          ${(m.content || m.text) && (m.content || m.text).trim() ? `<p class="text-xs sm:text-sm leading-relaxed mt-1 px-1 text-slate-100 font-normal break-words">${this.escapeHtml(m.content || m.text)}</p>` : ''}
        `;
      } else if (m.type === 'video') {
        contentHtml = `
          <div class="rounded-2xl overflow-hidden max-w-[260px] sm:max-w-sm border border-white/10 shadow-sm">
            <video src="${m.file_url || m.fileUrl}" controls class="w-full max-h-72 bg-black rounded-2xl"></video>
          </div>
          ${(m.content || m.text) && (m.content || m.text).trim() ? `<p class="text-xs sm:text-sm leading-relaxed mt-1 px-1 text-slate-100 break-words">${this.escapeHtml(m.content || m.text)}</p>` : ''}
        `;
      } else if (m.type === 'audio' || m.type === 'voice') {
        const msgUid = String(m.id || Math.random()).replace(/[^a-zA-Z0-9_-]/g, '');
        const audioUrl = m.file_url || m.fileUrl || 'sample_audio';
        const durStr = m.duration || '00:04';
        const baseHeights = [26, 42, 65, 38, 78, 92, 54, 84, 60, 96, 70, 48, 88, 64, 94, 52, 76, 86, 44, 68, 56, 36, 48, 28];
        const eqBarsHtml = baseHeights.map((h) => `
          <span class="voice-eq-bar flex-1 rounded-full transition-all duration-75" data-base-height="${h}%" style="height: ${h}%;"></span>
        `).join('');

        contentHtml = `
          <div id="voice-card-${msgUid}" class="voice-msg-card flex items-center gap-3 px-3.5 py-3 rounded-2xl ${isMe ? 'bg-[#1e1b4b]/95 border border-indigo-400/35' : 'bg-slate-800/95 border border-white/10'} min-w-[245px] sm:min-w-[280px] shadow-md transition-all">
            <div class="relative shrink-0">
              <span id="voice-pulse-ring-${msgUid}" class="hidden absolute -inset-1.5 rounded-full bg-gradient-to-r from-cyan-400 via-indigo-500 to-pink-500 opacity-50 blur-[2px] transition-transform duration-75 pointer-events-none"></span>
              <button type="button" onclick="window.recorder.toggleVoicePlayback('${msgUid}', '${audioUrl}', '${durStr}')" class="relative z-10 w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 hover:brightness-110 text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all">
                <i id="voice-play-icon-${msgUid}" data-lucide="play" class="w-4 h-4 ml-0.5"></i>
              </button>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2 text-xs font-bold text-white mb-1.5">
                <span class="flex items-center gap-1.5 truncate">
                  <span>Tin nhắn thoại HD</span>
                  <span class="px-1.5 py-0.2 rounded-full bg-cyan-500/20 border border-cyan-400/30 text-[9px] font-extrabold text-cyan-300">Khử Tạp Âm</span>
                </span>
                <span id="voice-timer-${msgUid}" data-duration="${durStr}" class="text-[11px] text-cyan-300 font-mono shrink-0">${durStr}</span>
              </div>
              <div id="voice-wave-${msgUid}" onclick="window.recorder.toggleVoicePlayback('${msgUid}', '${audioUrl}', '${durStr}')" class="h-6 w-full flex items-center gap-[2.5px] cursor-pointer py-0.5">
                ${eqBarsHtml}
              </div>
            </div>
          </div>
        `;
      } else if (m.type === 'file') {
        contentHtml = `
          <div class="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl ${isMe ? 'bg-[#1e1b4b]/90 border border-indigo-400/30' : 'bg-slate-800/90 border border-white/10'} min-w-[230px] sm:min-w-[260px] shadow-sm">
            <div class="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/25 text-indigo-300 flex items-center justify-center font-bold text-[11px] uppercase shrink-0">
              ${(m.file_name || m.fileName || 'FILE').split('.').pop().slice(0, 4)}
            </div>
            <div class="flex-1 min-w-0 text-left">
              <p class="text-xs sm:text-[13px] font-semibold text-white truncate">${m.file_name || m.fileName || 'Tập tin đính kèm'}</p>
              <p class="text-[11px] text-slate-400 mt-0.5">${m.file_size || m.fileSize || 'Không giới hạn'}</p>
            </div>
            <a href="${m.file_url || m.fileUrl}" download="${m.file_name || m.fileName || 'file'}" class="p-2 hover:bg-white/10 rounded-xl text-slate-200 hover:text-white transition-colors shrink-0" title="Tải xuống">
              <i data-lucide="download" class="w-4 h-4"></i>
            </a>
          </div>
          ${(m.content || m.text) && (m.content || m.text).trim() ? `<p class="text-xs sm:text-sm leading-relaxed mt-1 px-1 text-slate-100">${this.escapeHtml(m.content || m.text)}</p>` : ''}
        `;
      } else if (m.type === 'location') {
        const coords = (m.file_name || m.fileName || '10.7769,106.7009').split(',');
        const lat = coords[0] || '10.7769';
        const lng = coords[1] || '106.7009';
        const mapsUrl = m.file_url || m.fileUrl || `https://www.google.com/maps?q=${lat},${lng}`;

        contentHtml = `
          <div class="rounded-2xl overflow-hidden max-w-xs sm:max-w-sm border border-emerald-500/30 bg-[#0d1624] shadow-md">
            <div class="p-3 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <i data-lucide="map-pin" class="w-4 h-4"></i>
                </span>
                <div>
                  <p class="text-xs font-bold text-white">Vị trí hiện tại</p>
                  <p class="text-[10px] text-emerald-300 font-mono">${lat}, ${lng}</p>
                </div>
              </div>
              <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">GPS Thực</span>
            </div>
            
            <div class="relative h-28 bg-[#1e293b] flex items-center justify-center overflow-hidden">
              <div class="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-10"></div>
              <div class="w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 animate-pulse z-20 shadow-lg shadow-emerald-500/30">
                <i data-lucide="navigation" class="w-6 h-6"></i>
              </div>
              <p class="absolute bottom-2 left-3 text-[11px] text-slate-300 z-20 font-medium">Bấm bên dưới để điều hướng trực tiếp</p>
            </div>

            <div class="p-2.5 flex items-center gap-2 bg-[#0a101d]">
              <a href="${mapsUrl}" target="_blank" class="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md">
                <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                <span>Google Maps</span>
              </a>
              <button type="button" onclick="if(window.app) window.app.switchTab('radar')" class="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1 transition-colors">
                <i data-lucide="radar" class="w-3.5 h-3.5 text-cyan-400"></i>
                <span>Xem Radar</span>
              </button>
            </div>
          </div>
          ${(m.content || m.text) && !(m.content || m.text).startsWith('Đã chia sẻ vị trí') ? `<p class="text-sm leading-relaxed mt-1.5 text-slate-100">${this.escapeHtml(m.content || m.text)}</p>` : ''}
        `;
      } else if ((m.content || m.text || '').includes('Cuộc gọi')) {
        const text = m.content || m.text || '';
        const isMissed = text.includes('nhỡ');
        const isVideo = text.includes('video');
        const callTargetId = isMe ? (m.receiver_id || m.receiverId) : (m.sender_id || m.senderId);

        contentHtml = `
          <div class="flex items-center gap-3 p-2.5 rounded-2xl ${isMissed ? 'call-record-missed' : 'call-record-success'} min-w-[200px] sm:min-w-[240px]">
            <div class="w-10 h-10 rounded-xl ${isMissed ? 'bg-red-500/25 text-red-400' : 'bg-emerald-500/25 text-emerald-400'} flex items-center justify-center shrink-0 shadow-sm">
              <i data-lucide="${isMissed ? 'phone-missed' : (isVideo ? 'video' : 'phone')}" class="w-5 h-5"></i>
            </div>
            <div class="flex-1 min-w-0 text-left">
              <p class="text-xs font-bold ${isMissed ? 'text-rose-400' : 'text-emerald-400'} leading-tight">${this.escapeHtml(text)}</p>
              <p class="text-[10px] text-slate-400 mt-0.5">${isMissed ? 'Bấm nút để gọi lại' : 'Cuộc gọi thành công'}</p>
            </div>
            <button type="button" onclick="window.chat.quickCallBack('${callTargetId}', '${isVideo ? 'video' : 'voice'}')" class="px-2.5 py-1.5 rounded-xl ${isMissed ? 'bg-rose-600 hover:bg-rose-500' : 'bg-indigo-600 hover:bg-indigo-500'} text-white text-[11px] font-bold flex items-center gap-1 shadow-md transition-all shrink-0">
              <i data-lucide="${isVideo ? 'video' : 'phone'}" class="w-3.5 h-3.5"></i>
              <span>Gọi lại</span>
            </button>
          </div>
        `;
      } else {
        contentHtml = `<p class="text-[13px] sm:text-sm leading-relaxed whitespace-pre-wrap break-words">${this.escapeHtml(m.content || m.text)}</p>`;
      }

      const isStandaloneCard =
        ['image', 'video', 'audio', 'voice', 'file', 'location'].includes(m.type) ||
        (m.content || m.text || '').includes('Cuộc gọi');

      let bubbleClass = '';
      let bubbleStyle = '';

      if (isStandaloneCard) {
        bubbleClass = 'rounded-2xl';
      } else {
        bubbleClass = `px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl ${
          isMe
            ? 'rounded-br-xs text-white shadow-sm chat-bubble-thin'
            : 'rounded-bl-xs bg-slate-800/90 text-slate-100 chat-bubble-thin shadow-sm'
        }`;
        if (isMe) {
          bubbleStyle = 'background: var(--chat-bubble-self);';
        }
      }

      return `
        <div class="flex gap-2 mb-3.5 ${isMe ? 'justify-end' : 'justify-start'} group items-end">
          ${!isMe ? `<img src="${this.getSenderAvatar(m.sender_id || m.senderId)}" class="w-7 h-7 sm:w-8 sm:h-8 rounded-xl object-cover shrink-0 mb-1 border border-white/10" alt="avatar" />` : ''}
          <div class="max-w-[85%] sm:max-w-[75%] min-w-0">
            ${(m.senderName || m.sender_name) && !isMe ? `<span class="text-[10px] text-slate-400 font-medium ml-1.5 mb-0.5 block truncate">${m.senderName || m.sender_name}</span>` : ''}
            <div class="${bubbleClass}" style="${bubbleStyle}">
              ${contentHtml}
            </div>
            <div class="flex items-center gap-1.5 mt-0.5 px-1.5 ${isMe ? 'justify-end' : 'justify-start'} text-[9px] sm:text-[10px] text-slate-400">
              <span>${m.time || 'Vừa xong'}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
    container.scrollTop = container.scrollHeight;
  }

  stageFile(file, forcedType = null) {
    if (!file) return;
    this.stagedFile = file;

    const previewBar = document.getElementById('chat-media-preview-bar');
    const previewImg = document.getElementById('chat-preview-img');
    const previewIcon = document.getElementById('chat-preview-icon');
    const previewName = document.getElementById('chat-preview-filename');
    const statusText = document.getElementById('chat-preview-status-text');

    if (!previewBar) return;

    const isImg = forcedType === 'image' || file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|jfif)$/i.test(file.name);
    const sizeStr = file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${(file.size / 1024).toFixed(0)} KB`;

    if (previewName) previewName.textContent = file.name || 'Hinh_anh.png';
    if (statusText) statusText.textContent = isImg ? `Đã chọn ảnh (${sizeStr}) • Bấm Gửi để chuyển đi` : `Đã chọn tệp (${sizeStr}) • Bấm Gửi để chuyển đi`;

    if (isImg && previewImg) {
      previewImg.src = URL.createObjectURL(file);
      previewImg.classList.remove('hidden');
      if (previewIcon) previewIcon.classList.add('hidden');
    } else {
      if (previewImg) previewImg.classList.add('hidden');
      if (previewIcon) previewIcon.classList.remove('hidden');
    }

    previewBar.classList.remove('hidden');
    const chatInput = document.getElementById('chat-text-input');
    if (chatInput) chatInput.focus();

    if (window.lucide) window.lucide.createIcons();
    if (window.app) window.app.showToast(isImg ? "Đã chọn ảnh! Bạn có thể thêm lời nhắn và bấm Gửi 🚀" : "Đã chọn tệp đính kèm!");
  }

  clearStagedFile() {
    this.stagedFile = null;
    const previewBar = document.getElementById('chat-media-preview-bar');
    const previewImg = document.getElementById('chat-preview-img');
    if (previewBar) previewBar.classList.add('hidden');
    if (previewImg) previewImg.src = '';
  }

  async uploadAndSendFile(file, caption = '', forcedType = null) {
    if (!this.activeChatId) {
      if (this.contacts.length > 0) {
        this.activeChatId = this.contacts[0].id;
      } else {
        alert("Vui lòng chọn một người bạn trong danh sách để gửi ảnh!");
        return;
      }
    }

    const isImg = forcedType === 'image' || file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|jfif)$/i.test(file.name);
    const isVid = forcedType === 'video' || file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi)$/i.test(file.name);
    const isAud = forcedType === 'audio' || file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac)$/i.test(file.name);

    let msgType = 'file';
    if (isImg) msgType = 'image';
    else if (isVid) msgType = 'video';
    else if (isAud) msgType = 'audio';

    if (window.app) {
      window.app.showToast(`Đang tải lên "${file.name || 'hình ảnh'}"... ⏳`);
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (!res.ok || !data.fileUrl) {
        alert("Lỗi khi tải file lên máy chủ: " + (data.error || "Không thể tải lên"));
        return;
      }

      await this.sendMessage({
        type: msgType,
        content: caption,
        file_url: data.fileUrl,
        file_name: data.fileName || file.name,
        file_size: data.fileSize
      });

      if (window.app) {
        window.app.showToast("Đã gửi ảnh thành công! 📸");
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert("Lỗi khi gửi file: " + err.message);
    }
  }

  async shareCurrentLocation() {
    if (!this.activeChatId) {
      if (this.contacts.length > 0) this.activeChatId = this.contacts[0].id;
      else {
        alert("Vui lòng chọn hoặc thêm một người bạn để chia sẻ vị trí!");
        return;
      }
    }

    if (!navigator.geolocation) {
      alert("Thiết bị hoặc trình duyệt của bạn không hỗ trợ định vị GPS!");
      return;
    }

    if (window.app) window.app.showToast("Đang xác định tọa độ GPS của bạn... 📍");

    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

      await this.sendMessage({
        type: 'location',
        content: `Đã chia sẻ vị trí hiện tại: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        file_url: mapsUrl,
        file_name: `${lat.toFixed(5)},${lng.toFixed(5)}`,
        file_size: `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`
      });

      if (window.app) window.app.showToast("Đã chia sẻ vị trí của bạn thành công! 📍");
    }, (err) => {
      console.warn("Geolocation error, fallback to Saigon coords:", err);
      // Fallback coordinate
      const fallbackLat = 10.7769;
      const fallbackLng = 106.7009;
      const mapsUrl = `https://www.google.com/maps?q=${fallbackLat},${fallbackLng}`;
      this.sendMessage({
        type: 'location',
        content: `Vị trí định vị: ${fallbackLat}, ${fallbackLng} (TP. Hồ Chí Minh)`,
        file_url: mapsUrl,
        file_name: `${fallbackLat},${fallbackLng}`,
        file_size: 'TP. Hồ Chí Minh'
      });
      if (window.app) window.app.showToast("Đã gửi vị trí gần đúng của bạn! 📍");
    }, {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 0
    });
  }

  openImageModal(url, name = 'photo.png') {
    const modal = document.getElementById('modal-image-viewer');
    const img = document.getElementById('modal-viewer-img');
    const dlBtn = document.getElementById('btn-download-viewer-img');
    if (modal && img) {
      img.src = url;
      if (dlBtn) {
        dlBtn.href = url;
        dlBtn.download = name;
      }
      modal.classList.remove('hidden');
      if (window.lucide) window.lucide.createIcons();
    } else {
      window.open(url, '_blank');
    }
  }

  async sendMessage(payload) {
    if (!this.activeChatId && this.contacts && this.contacts.length > 0) {
      this.activeChatId = this.contacts[0].id;
    }

    if (!this.activeChatId) {
      if (window.app) window.app.showToast("Vui lòng chọn một người bạn để bắt đầu trò chuyện!", "warning");
      return;
    }

    if (this.blockedUsers.has(this.activeChatId)) {
      if (window.app) window.app.showToast("Bạn đã chặn người này. Vui lòng mở chặn để tiếp tục!", "warning");
      return;
    }

    const currentUserId = window.auth?.currentUser?.id || 'user_hieu';
    const target = this.contacts.find(c => c.id === this.activeChatId);
    const isGroup = target ? target.isGroup : false;

    const requestBody = {
      sender_id: currentUserId,
      receiver_id: this.activeChatId,
      is_group: isGroup,
      type: payload.type || 'text',
      content: payload.content || payload.text || '',
      file_url: payload.file_url || payload.fileUrl,
      file_name: payload.file_name || payload.fileName,
      file_size: payload.file_size || payload.fileSize,
      duration: payload.duration
    };

    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      const data = await res.json();

      if (!res.ok) {
        if (window.app) window.app.showToast(data.error || "Gửi tin nhắn thất bại", "warning");
        return;
      }

      if (data.message) {
        if (!this.messages[this.activeChatId]) {
          this.messages[this.activeChatId] = [];
        }
        // Deduplicate in case SSE arrived before HTTP response
        if (!this.messages[this.activeChatId].some(existing => existing.id === data.message.id)) {
          this.messages[this.activeChatId].push(data.message);
        }
        const c = this.contacts.find(x => x.id === this.activeChatId);
        if (c) {
          c.last_message = data.message.content || data.message.text;
          c.last_message_type = data.message.type;
          c.last_message_time = data.message.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          if (data.streak_count || data.message.streak_count) {
            c.streak_count = data.streak_count || data.message.streak_count;
            c.streak_status = 'active';
          }
        }
        this.lastSyncedMsgId = data.message.id;
        const cIdx = this.contacts.findIndex(x => x.id === this.activeChatId);
        if (cIdx > 0) {
          const [movedContact] = this.contacts.splice(cIdx, 1);
          this.contacts.unshift(movedContact);
        }
        this.renderMessages();
        this.renderConversationList();
        if (window.streak) window.streak.loadStreaks();
      }
    } catch (e) {
      console.error("Message send error:", e);
      if (window.app) window.app.showToast("Lỗi kết nối khi gửi tin nhắn!", "warning");
    }

    if (window.sounds) window.sounds.playMessageSent();
  }

  sendQuickGreeting(text) {
    const input = document.getElementById('chat-text-input');
    if (input) {
      input.value = text;
      const form = document.getElementById('chat-input-form');
      if (form) {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    }
  }

  receiveRealtimeMessage(msg, playSound = true) {
    const currentUserId = window.auth?.currentUser?.id || 'user_hieu';
    const senderId = msg.senderId || msg.sender_id;
    const receiverId = msg.receiverId || msg.receiver_id || msg.conversation_id;
    const isGroup = Boolean(msg.isGroup || msg.is_group);
    const convId = isGroup
      ? (msg.conversation_id || receiverId)
      : (senderId === currentUserId ? receiverId : senderId);

    if (!convId) return false;

    if (!this.messages[convId]) {
      this.messages[convId] = [];
    }

    // Deduplicate by message id
    if (msg.id && this.messages[convId].some(existing => existing.id === msg.id)) {
      return false;
    }

    this.messages[convId].push(msg);
    this.lastSyncedMsgId = msg.id;

    // Reorder contact to top of conversation list
    const contactIndex = this.contacts.findIndex(x => x.id === convId);
    let c = null;
    if (contactIndex !== -1) {
      c = this.contacts[contactIndex];
      if (contactIndex > 0) {
        this.contacts.splice(contactIndex, 1);
        this.contacts.unshift(c);
      }
      c.last_message = msg.content || msg.text || (msg.type === 'image' ? '[Hình ảnh]' : msg.type === 'voice' || msg.type === 'audio' ? '[Tin nhắn thoại]' : '[Tập tin]');
      c.last_message_type = msg.type;
      c.last_message_time = msg.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (msg.streak_count) {
        c.streak_count = msg.streak_count;
        c.streak_status = 'active';
      }
    }

    if (window.streak) window.streak.loadStreaks();

    if (this.activeChatId === convId) {
      this.renderMessages();
      this.renderConversationList();
      if (playSound && senderId !== currentUserId && window.sounds) {
        window.sounds.playMessageReceived();
      }
    } else {
      if (c && senderId !== currentUserId) c.unread = (c.unread || 0) + 1;
      this.renderConversationList();
      if (window.app && senderId !== currentUserId) {
        window.app.showToast(`📩 ${msg.senderName || 'Tin nhắn mới'}: ${msg.text || msg.content || 'Tệp đính kèm'}`);
      }
      if (playSound && senderId !== currentUserId && window.sounds) {
        window.sounds.playMessageReceived();
      }
    }
    return true;
  }

  updateUserOnlineStatus(userId, status) {
    const c = this.contacts.find(x => x.id === userId);
    if (c) {
      c.status = status;
      this.renderConversationList();
      if (this.activeChatId === userId) {
        this.selectChat(userId);
      }
    }
  }

  setChatTheme(chatId, themeClass) {
    const contact = this.contacts.find(c => c.id === chatId);
    if (contact) {
      contact.chatTheme = themeClass;
      try {
        const savedThemes = JSON.parse(localStorage.getItem('seelad_chat_themes') || '{}');
        savedThemes[chatId] = themeClass;
        localStorage.setItem('seelad_chat_themes', JSON.stringify(savedThemes));
      } catch (e) {}
      this.applyActiveChatTheme(themeClass);
      if (window.app) window.app.showToast("Đã cập nhật chủ đề màu sắc đoạn chat! 🎨");
    }
  }

  applyActiveChatTheme(themeClass) {
    const chatWindow = document.getElementById('chat-active-window');
    if (!chatWindow) return;
    const themeClasses = [
      'theme-cyber-indigo',
      'theme-sunset-blaze',
      'theme-emerald-matrix',
      'theme-midnight-neon',
      'theme-cotton-candy',
      'theme-royal-gold',
      'theme-neon-purple',
      'theme-sunset-glow',
      'theme-nordic-frost',
      'theme-rose-petal',
      'theme-midnight-black',
      'theme-minimalist-light'
    ];
    themeClasses.forEach(tc => chatWindow.classList.remove(tc));
    chatWindow.classList.add(themeClass);
    chatWindow.classList.add('flex-1', 'flex-col', 'bg-[var(--bg-secondary)]', 'relative', 'overflow-hidden', 'h-full', 'w-full', 'min-h-0');

    // Highlight active theme button in dropdown
    document.querySelectorAll('.btn-set-chat-theme').forEach(btn => {
      if (btn.getAttribute('data-theme') === themeClass) {
        btn.classList.add('ring-2', 'ring-indigo-400', 'bg-indigo-500/20');
      } else {
        btn.classList.remove('ring-2', 'ring-indigo-400', 'bg-indigo-500/20');
      }
    });

    this.syncResponsiveChatLayout();
    this.renderMessages();
  }

  toggleBlockUser(userId) {
    if (this.blockedUsers.has(userId)) {
      this.blockedUsers.delete(userId);
      if (window.app) window.app.showToast("Đã bỏ chặn người dùng này!");
    } else {
      this.blockedUsers.add(userId);
      if (window.app) window.app.showToast("Đã chặn người dùng này! 🚫", "warning");
    }
    this.updateBlockUI();
  }

  updateBlockUI() {
    const isBlocked = this.blockedUsers.has(this.activeChatId);
    const blockedBanner = document.getElementById('chat-blocked-banner');
    const inputArea = document.getElementById('chat-input-area');
    const blockBtn = document.getElementById('btn-action-block');

    if (blockedBanner && inputArea) {
      if (isBlocked) {
        blockedBanner.classList.remove('hidden');
        inputArea.classList.add('opacity-40', 'pointer-events-none');
        if (blockBtn) blockBtn.innerHTML = `<i data-lucide="shield-check" class="w-4 h-4 mr-2 text-emerald-400"></i> Bỏ chặn`;
      } else {
        blockedBanner.classList.add('hidden');
        inputArea.classList.remove('opacity-40', 'pointer-events-none');
        if (blockBtn) blockBtn.innerHTML = `<i data-lucide="shield-alert" class="w-4 h-4 mr-2 text-red-400"></i> Chặn người dùng`;
      }
      if (window.lucide) window.lucide.createIcons();
    }
  }

  updatePinnedBannerUI() {
    const banner = document.getElementById('chat-pinned-banner');
    const textEl = document.getElementById('chat-pinned-text');
    const pinnedText = this.pinnedMessages[this.activeChatId];

    if (banner && textEl) {
      if (pinnedText) {
        textEl.textContent = pinnedText;
        banner.classList.remove('hidden');
      } else {
        banner.classList.add('hidden');
      }
    }
  }

  resetInviteCode(chatId) {
    const target = this.contacts.find(c => c.id === chatId);
    if (!target) return;
    target.inviteCode = 'SEELAD-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    this.updateInviteModalUI();
    if (window.app) window.app.showToast("Đã đổi mã liên kết mới! Tất cả link cũ bị vô hiệu hóa.");
  }

  updateInviteModalUI() {
    const target = this.contacts.find(c => c.id === this.activeChatId);
    if (!target) return;
    const input = document.getElementById('invite-link-input');
    const title = document.getElementById('invite-modal-title');
    if (input) input.value = `${window.location.origin}/?join=${target.inviteCode || 'SEELAD'}`;
    if (title) title.textContent = `Liên kết tham gia: ${target.name}`;
  }

  getSenderAvatar(senderId) {
    if (senderId === window.auth?.currentUser?.id) {
      return window.auth.currentUser.avatar;
    }
    const c = this.contacts.find(x => x.id === senderId);
    return c ? c.avatar : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  getCurrentUser() {
    if (window.auth?.currentUser?.id) return window.auth.currentUser;
    try {
      const saved = localStorage.getItem('see_lad_user');
      if (saved) {
        const u = JSON.parse(saved);
        if (u && u.id) return u;
      }
    } catch(e) {}
    return window.SEE_LAD_CONFIG?.currentUser || { id: '125001110', name: 'Lifetime Sin', username: '125001110' };
  }

  async loadWallpapers() {
    const currentUser = this.getCurrentUser();
    const currentUserId = currentUser.id;
    if (!currentUserId) return;
    try {
      const res = await fetch(`/api/wallpapers?user_id=${encodeURIComponent(currentUserId)}`);
      const data = await res.json();
      if (data.wallpapers) {
        this.wallpapers = data.wallpapers;
        if (this.activeChatId) this.applyChatWallpaper(this.activeChatId);
      }
    } catch (e) {}
  }

  async loadNicknames() {
    const currentUser = this.getCurrentUser();
    const currentUserId = currentUser.id;
    if (!currentUserId) return;
    try {
      const res = await fetch(`/api/nicknames?user_id=${encodeURIComponent(currentUserId)}`);
      const data = await res.json();
      if (data.nicknames) {
        this.nicknames = data.nicknames;
        this.renderConversationList();
      }
    } catch (e) {}
  }

  applyChatWallpaper(chatId) {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;
    const wp = (this.wallpapers && chatId) ? this.wallpapers[chatId] : null;
    if (wp) {
      // Sắc nét, rõ ràng, không mờ, không tối sầm
      container.style.backgroundImage = `linear-gradient(rgba(10, 15, 29, 0.40), rgba(10, 15, 29, 0.50)), url('${wp}')`;
      container.style.backgroundSize = 'cover';
      container.style.backgroundPosition = 'center';
      container.style.backgroundRepeat = 'no-repeat';
      container.style.backgroundAttachment = 'local';
      container.style.imageRendering = '-webkit-optimize-contrast';
      container.classList.remove('backdrop-blur-sm', 'backdrop-blur-md');
    } else {
      container.style.backgroundImage = '';
      container.style.backgroundSize = '';
      container.style.backgroundPosition = '';
      container.style.backgroundRepeat = '';
      container.style.backgroundAttachment = '';
      container.style.imageRendering = '';
    }
  }

  async setWallpaperForActiveChat(imageUrl) {
    if (!this.activeChatId && this.contacts && this.contacts.length > 0) {
      this.activeChatId = this.contacts[0].id;
    }
    if (!this.activeChatId) {
      if (window.app) window.app.showToast("Vui lòng chọn một cuộc trò chuyện để đổi ảnh nền.", "warning");
      return;
    }
    const currentUser = this.getCurrentUser();
    const currentUserId = currentUser.id;
    try {
      const res = await fetch('/api/wallpapers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUserId,
          conversation_id: this.activeChatId,
          wallpaper_url: imageUrl
        })
      });
      const data = await res.json();
      if (data.success) {
        if (!this.wallpapers) this.wallpapers = {};
        if (imageUrl) {
          this.wallpapers[this.activeChatId] = imageUrl;
          if (window.app) window.app.showToast("Đã đổi ảnh nền cuộc trò chuyện thành công!");
        } else {
          delete this.wallpapers[this.activeChatId];
          if (window.app) window.app.showToast("Đã gỡ ảnh nền, quay lại mặc định.");
        }
        this.applyChatWallpaper(this.activeChatId);
      }
    } catch (e) {
      console.error("Set wallpaper error:", e);
      if (window.app) window.app.showToast("Lỗi khi lưu ảnh nền. Vui lòng thử lại!", "error");
    }
  }

  handleCustomWallpaperUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // High-resolution resize to Full HD (max 1920x1080) for sharp crisp display & fast upload
        const maxDim = 1920;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        const fhdDataUrl = canvas.toDataURL('image/jpeg', 0.90);
        this.setWallpaperForActiveChat(fhdDataUrl);
        const modal = document.getElementById('modal-chat-wallpaper');
        if (modal) modal.classList.add('hidden');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  async setNicknameForActiveChat(nickname) {
    if (!this.activeChatId && this.contacts && this.contacts.length > 0) {
      this.activeChatId = this.contacts[0].id;
    }
    if (!this.activeChatId) {
      if (window.app) window.app.showToast("Vui lòng chọn một cuộc trò chuyện để đặt biệt danh.", "warning");
      return;
    }
    const currentUser = this.getCurrentUser();
    const currentUserId = currentUser.id;
    try {
      const res = await fetch('/api/nicknames', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUserId,
          target_id: this.activeChatId,
          nickname: nickname
        })
      });
      const data = await res.json();
      if (data.success) {
        if (!this.nicknames) this.nicknames = {};
        if (nickname) {
          this.nicknames[this.activeChatId] = nickname;
          if (window.app) window.app.showToast(`Đã đặt biệt danh: "${nickname}"`);
        } else {
          delete this.nicknames[this.activeChatId];
          if (window.app) window.app.showToast("Đã gỡ biệt danh.");
        }
        this.renderConversationList();
        const target = this.contacts ? this.contacts.find(c => c.id === this.activeChatId) : null;
        const nameEl = document.getElementById('active-chat-name');
        if (nameEl) {
          const originalName = target ? target.name : (nameEl.getAttribute('data-original-name') || nameEl.textContent);
          if (target) nameEl.setAttribute('data-original-name', target.name);
          nameEl.textContent = nickname ? `${nickname} (${originalName})` : originalName;
        }
      }
    } catch (e) {
      console.error("Set nickname error:", e);
      if (window.app) window.app.showToast("Lỗi khi lưu biệt danh. Vui lòng thử lại!", "error");
    }
  }

  openWallpaperModal() {
    const modal = document.getElementById('modal-chat-wallpaper');
    const dropdown = document.getElementById('chat-options-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
    if (!this.activeChatId && this.contacts && this.contacts.length > 0) {
      this.selectChat(this.contacts[0].id);
    }
    if (modal) modal.classList.remove('hidden');
  }

  openNicknameModal() {
    const modal = document.getElementById('modal-chat-nickname');
    const input = document.getElementById('chat-nickname-input');
    const targetLabel = document.getElementById('modal-chat-nickname-target');
    const dropdown = document.getElementById('chat-options-dropdown');
    if (dropdown) dropdown.classList.add('hidden');

    if (!this.activeChatId && this.contacts && this.contacts.length > 0) {
      this.selectChat(this.contacts[0].id);
    }

    const target = this.contacts ? this.contacts.find(c => c.id === this.activeChatId) : null;
    const targetName = target ? target.name : (document.getElementById('active-chat-name')?.textContent || 'Bạn bè');

    if (targetLabel) targetLabel.textContent = `Đang đặt biệt danh cho: ${targetName}`;
    if (input) {
      input.value = (this.activeChatId && this.nicknames && this.nicknames[this.activeChatId]) || '';
      input.placeholder = `Nhập biệt danh cho ${targetName}...`;
    }
    if (modal) modal.classList.remove('hidden');
    if (input) setTimeout(() => input.focus(), 100);
  }
}

window.chat = new ChatController();
