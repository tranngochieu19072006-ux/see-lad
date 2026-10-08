/**
 * SEE LAD - Floating Chat Bubble (Chat Head)
 * Bong bóng chat nổi đa năng kiểu Messenger, kéo thả tự do trên màn hình
 */

class ChatBubbleController {
  constructor() {
    this.bubbleEl = null;
    this.popupEl = null;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.currentX = 0;
    this.currentY = 0;
    this.isOpen = false;
  }

  init() {
    this.bubbleEl = document.getElementById('floating-chat-bubble');
    this.popupEl = document.getElementById('chat-bubble-popup');

    if (!this.bubbleEl) return;

    this.bindEvents();
    this.updateBubbleUI();
  }

  bindEvents() {
    // Action in chat header: "Bật bong bóng chat"
    const btnEnableBubble = document.getElementById('btn-action-bubble');
    if (btnEnableBubble) {
      btnEnableBubble.addEventListener('click', () => {
        this.showBubble();
      });
    }

    // Dragging logic
    const onMouseDown = (e) => {
      this.isDragging = false;
      this.startX = e.clientX || (e.touches && e.touches[0].clientX);
      this.startY = e.clientY || (e.touches && e.touches[0].clientY);

      const rect = this.bubbleEl.getBoundingClientRect();
      this.offsetX = this.startX - rect.left;
      this.offsetY = this.startY - rect.top;

      const onMouseMove = (moveEvent) => {
        const clientX = moveEvent.clientX || (moveEvent.touches && moveEvent.touches[0].clientX);
        const clientY = moveEvent.clientY || (moveEvent.touches && moveEvent.touches[0].clientY);

        if (Math.hypot(clientX - this.startX, clientY - this.startY) > 5) {
          this.isDragging = true;
          this.bubbleEl.style.transition = 'none';

          let x = clientX - this.offsetX;
          let y = clientY - this.offsetY;

          // Keep in bounds
          x = Math.max(10, Math.min(window.innerWidth - 75, x));
          y = Math.max(10, Math.min(window.innerHeight - 75, y));

          this.bubbleEl.style.left = `${x}px`;
          this.bubbleEl.style.top = `${y}px`;
          this.bubbleEl.style.right = 'auto';
          this.bubbleEl.style.bottom = 'auto';
        }
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('touchmove', onMouseMove);
        document.removeEventListener('touchend', onMouseUp);

        if (!this.isDragging) {
          this.togglePopup();
        } else {
          // Snap to closest edge
          this.bubbleEl.style.transition = 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
          const rect = this.bubbleEl.getBoundingClientRect();
          if (rect.left < window.innerWidth / 2) {
            this.bubbleEl.style.left = '20px';
          } else {
            this.bubbleEl.style.left = `${window.innerWidth - 82}px`;
          }
        }
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.addEventListener('touchmove', onMouseMove);
      document.addEventListener('touchend', onMouseUp);
    };

    this.bubbleEl.addEventListener('mousedown', onMouseDown);
    this.bubbleEl.addEventListener('touchstart', onMouseDown, { passive: true });

    // Mini chat quick send
    const miniForm = document.getElementById('mini-chat-form');
    const miniInput = document.getElementById('mini-chat-input');
    if (miniForm && miniInput) {
      miniForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const val = miniInput.value.trim();
        if (val) {
          window.chat.sendMessage({ type: 'text', text: val });
          miniInput.value = '';
          this.renderMiniMessages();
        }
      });
    }

    // Close bubble button
    const btnCloseBubble = document.getElementById('btn-close-bubble-popup');
    if (btnCloseBubble) {
      btnCloseBubble.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePopup(false);
      });
    }
  }

  showBubble() {
    if (this.bubbleEl) {
      this.bubbleEl.classList.remove('hidden');
      this.updateBubbleUI();
      if (window.app) window.app.showToast("Đã kích hoạt Bong bóng chat nổi! Bạn có thể kéo thả bất cứ đâu.");
    }
  }

  updateBubbleUI() {
    const contact = window.chat.contacts.find(c => c.id === window.chat.activeChatId) || window.SEE_LAD_CONFIG.contacts[0];
    const img = document.getElementById('chat-bubble-avatar');
    if (img) img.src = contact.avatar;
  }

  togglePopup(force) {
    this.isOpen = typeof force === 'boolean' ? force : !this.isOpen;
    if (!this.popupEl) return;

    if (this.isOpen) {
      this.renderMiniMessages();
      this.popupEl.classList.remove('hidden');
      this.popupEl.style.opacity = '1';
      this.popupEl.style.transform = 'scale(1)';
    } else {
      this.popupEl.classList.add('hidden');
    }
  }

  renderMiniMessages() {
    const box = document.getElementById('mini-chat-messages');
    if (!box) return;

    const msgs = window.chat.messages[window.chat.activeChatId] || [];
    const currentUserId = window.auth?.currentUser?.id || 'user_hieu';

    box.innerHTML = msgs.slice(-8).map(m => {
      const isMe = m.senderId === currentUserId;
      return `
        <div class="flex ${isMe ? 'justify-end' : 'justify-start'} mb-2">
          <div class="p-2 rounded-2xl max-w-[80%] text-xs ${isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-700 text-slate-100 rounded-bl-none'}">
            ${m.text || (m.type === 'audio' ? '🎙️ Tin nhắn thoại' : '📁 Tệp đính kèm')}
          </div>
        </div>
      `;
    }).join('');

    box.scrollTop = box.scrollHeight;
  }
}

window.chatBubble = new ChatBubbleController();
