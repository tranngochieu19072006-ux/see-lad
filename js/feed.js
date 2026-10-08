/**
 * SEE LAD - Social Diary & Profile Feed Controller
 * Nhật ký cá nhân, đăng trạng thái, tương tác cảm xúc ❤️ và bình luận 💬
 */

class FeedController {
  constructor() {
    this.posts = [];
    this.currentFilter = 'all'; // 'all' | 'my'

    // Cover reposition state
    this.isRepositioningCover = false;
    this.coverPosX = 50;
    this.coverPosY = 50;
    this.coverZoom = 1.0;
    this.originalCoverPos = '50% 50%';
    this.originalCoverZoom = 1.0;
    this.pendingCoverBase64 = null;

    // Avatar reposition & cropper state
    this.avatarZoom = 1.0;
    this.avatarOffsetX = 0;
    this.avatarOffsetY = 0;
    this.avatarBaseScale = 1.0;
    this.avatarNaturalWidth = 0;
    this.avatarNaturalHeight = 0;
    this.avatarImgElement = null;
  }

  async init() {
    this.bindEvents();
    await this.loadFeed();
    this.renderProfileCard();
    this.renderProfilePosts();
    this.detectRealLocation();
  }

  getCurrentUser() {
    let u = window.auth?.currentUser;
    if (!u) {
      try {
        const saved = localStorage.getItem('see_lad_user') || localStorage.getItem('seelad_current_user');
        if (saved) u = JSON.parse(saved);
      } catch (e) {}
    }
    return u || window.SEE_LAD_CONFIG?.currentUser || {
      id: 'user_1791461175642',
      name: 'Lifetime Sin',
      username: '125001110',
      avatar: 'https://platform-lookaside.fbsbx.com/platform/profilepic/?asid=122128466805379955&height=400&width=400&ext=1794016963&hash=Afta4ttski_csNqAIQEYN9za',
      bio: 'Thành viên kết nối chính thức qua Facebook 🌟',
      cover_image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80',
      location_name: 'TP. Hồ Chí Minh'
    };
  }

  bindEvents() {
    // Post composer submit
    const formPost = document.getElementById('feed-composer-form');
    if (formPost) {
      formPost.addEventListener('submit', (e) => this.handleCreatePost(e));
    }

    // Photo upload preview
    const photoInput = document.getElementById('feed-image-input');
    if (photoInput) {
      photoInput.addEventListener('change', (e) => this.handleImageSelect(e));
    }

    const removePhotoBtn = document.getElementById('btn-remove-feed-image');
    if (removePhotoBtn) {
      removePhotoBtn.addEventListener('click', () => this.clearImagePreview());
    }

    // Tab filter buttons
    const btnFilterAll = document.getElementById('feed-tab-all');
    const btnFilterMy = document.getElementById('feed-tab-my');
    if (btnFilterAll) {
      btnFilterAll.addEventListener('click', () => {
        this.currentFilter = 'all';
        this.updateFilterUI();
        this.renderPosts();
      });
    }
    if (btnFilterMy) {
      btnFilterMy.addEventListener('click', () => {
        this.currentFilter = 'my';
        this.updateFilterUI();
        this.renderPosts();
      });
    }

    // Edit profile triggers
    const btnEditProfile = document.getElementById('btn-edit-profile-modal');
    if (btnEditProfile) {
      btnEditProfile.addEventListener('click', () => this.openEditProfileModal());
    }

    const btnChangeCover = document.getElementById('btn-change-cover-photo');
    if (btnChangeCover) {
      btnChangeCover.addEventListener('click', () => {
        const coverInput = document.getElementById('input-cover-upload');
        if (coverInput) coverInput.click();
      });
    }

    const inputCover = document.getElementById('input-cover-upload');
    if (inputCover) {
      inputCover.addEventListener('change', (e) => this.handleCoverUpload(e));
    }

    const formEditProfile = document.getElementById('form-edit-profile');
    if (formEditProfile) {
      formEditProfile.addEventListener('submit', (e) => this.handleSaveProfile(e));
    }

    // Cover zoom slider
    const coverZoomSlider = document.getElementById('cover-zoom-slider');
    if (coverZoomSlider) {
      coverZoomSlider.addEventListener('input', (e) => {
        this.coverZoom = parseFloat(e.target.value) || 1.0;
        const img = document.getElementById('profile-card-cover-img');
        if (img) img.style.transform = `scale(${this.coverZoom})`;
      });
    }

    // Avatar zoom slider
    const avatarZoomSlider = document.getElementById('avatar-zoom-slider');
    if (avatarZoomSlider) {
      avatarZoomSlider.addEventListener('input', (e) => {
        this.avatarZoom = parseFloat(e.target.value) || 1.0;
        const lbl = document.getElementById('avatar-zoom-label');
        if (lbl) lbl.textContent = `${this.avatarZoom.toFixed(1)}x`;
        this.updateAvatarPreviewTransform();
      });
    }

    // Avatar cropper file input
    const avatarCropperFile = document.getElementById('avatar-cropper-file-input');
    if (avatarCropperFile) {
      avatarCropperFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          this.openAvatarAdjustModal(evt.target.result);
        };
        reader.readAsDataURL(file);
      });
    }

    // Initialize dragging handlers
    this.initCoverDragEvents();
    this.initAvatarCropDragEvents();
  }

  updateFilterUI() {
    const btnFilterAll = document.getElementById('feed-tab-all');
    const btnFilterMy = document.getElementById('feed-tab-my');
    if (!btnFilterAll || !btnFilterMy) return;

    if (this.currentFilter === 'all') {
      btnFilterAll.className = "px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-lg shadow-indigo-500/25";
      btnFilterMy.className = "px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5";
    } else {
      btnFilterMy.className = "px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-lg shadow-indigo-500/25";
      btnFilterAll.className = "px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5";
    }
  }

  handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      alert("Kích thước ảnh tối đa là 8MB!");
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const previewContainer = document.getElementById('feed-image-preview-box');
      const previewImg = document.getElementById('feed-image-preview-img');
      if (previewContainer && previewImg) {
        previewImg.src = evt.target.result;
        previewContainer.classList.remove('hidden');
      }
    };
    reader.readAsDataURL(file);
  }

  clearImagePreview() {
    const previewContainer = document.getElementById('feed-image-preview-box');
    const previewImg = document.getElementById('feed-image-preview-img');
    const photoInput = document.getElementById('feed-image-input');
    if (previewContainer) previewContainer.classList.add('hidden');
    if (previewImg) previewImg.src = '';
    if (photoInput) photoInput.value = '';
  }

  async handleCreatePost(e) {
    e.preventDefault();
    const currentUser = this.getCurrentUser();
    const contentInput = document.getElementById('feed-post-content');
    const moodSelect = document.getElementById('feed-post-mood');
    const previewImg = document.getElementById('feed-image-preview-img');
    const btnSubmit = document.getElementById('btn-submit-post');

    const content = contentInput ? contentInput.value.trim() : '';
    const mood = moodSelect ? moodSelect.value : '🌟 Vui vẻ';
    const imageUrl = (previewImg && previewImg.src && previewImg.src.startsWith('data:')) ? previewImg.src : '';

    if (!content) {
      if (window.app) window.app.showToast("Vui lòng nhập nội dung bài viết!", "warning");
      return;
    }

    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Đang đăng...`;
    }

    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          author_name: currentUser.name,
          author_username: currentUser.username,
          author_avatar: currentUser.avatar,
          content: content,
          image_url: imageUrl,
          mood: mood
        })
      });
      const data = await res.json();
      if (res.ok && data.success && data.post) {
        this.posts.unshift(data.post);
        if (typeof this.serverMyPostCount === 'number') this.serverMyPostCount++;
        if (contentInput) contentInput.value = '';
        this.clearImagePreview();
        this.renderPosts();
        this.renderProfileCard();
        this.renderProfilePosts();
        if (window.app) window.app.showToast("Đã chia sẻ nhật ký mới thành công! 🌟");
      } else {
        const errMsg = data.error || `Không thể đăng bài (${res.status})`;
        if (window.app) window.app.showToast(errMsg, "error");
        else alert(errMsg);
      }
    } catch (err) {
      console.error("Create post error:", err);
      const msg = "Lỗi kết nối khi gửi bài viết. Vui lòng thử lại!";
      if (window.app) window.app.showToast(msg, "error");
      else alert(msg);
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<i data-lucide="send" class="w-3.5 h-3.5"></i> <span>Đăng</span>`;
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  async loadFeed() {
    const currentUser = this.getCurrentUser();
    try {
      const q = new URLSearchParams({
        user_id: currentUser.id || '',
        user_name: currentUser.name || '',
        user_username: currentUser.username || '',
        user_avatar: currentUser.avatar || ''
      });
      const res = await fetch(`/api/posts?${q.toString()}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.posts)) {
        this.posts = data.posts;
        if (typeof data.my_post_count === 'number') {
          this.serverMyPostCount = data.my_post_count;
        }
        this.renderPosts();
        this.renderProfileCard();
        this.renderProfilePosts();
      }
    } catch (e) {
      console.warn("Could not load posts:", e);
    }
  }

  renderPosts() {
    const container = document.getElementById('feed-posts-container');
    if (!container) return;

    const currentUser = this.getCurrentUser();
    let displayList = this.posts;
    if (this.currentFilter === 'my') {
      displayList = this.posts.filter(p => p.user_id === currentUser.id);
    }

    if (displayList.length === 0) {
      container.innerHTML = `
        <div class="glass p-7 rounded-2xl text-center border border-white/10 my-3">
          <div class="w-14 h-14 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-2.5 text-2xl">✨</div>
          <h4 class="font-bold text-sm text-white mb-1">Chưa có bài viết nhật ký nào</h4>
          <p class="text-xs text-slate-400">Hãy là người đầu tiên chia sẻ cảm xúc và hình ảnh của bạn với bạn bè!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = displayList.map(post => {
      const isMine = post.user_id === currentUser.id;
      const formattedTime = this.formatTimeAgo(post.created_at);

      return `
        <article class="glass rounded-2xl p-3 sm:p-3.5 border border-white/10 hover:border-white/20 transition-all shadow-md mb-2.5 space-y-2" id="post-card-${post.id}">
          <!-- Post Author Header (Compact & Crisp) -->
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2.5 min-w-0 cursor-pointer" onclick="window.feed.viewAuthorProfile('${post.user_id}')">
              <img src="${post.author_avatar || 'https://platform-lookaside.fbsbx.com/platform/profilepic/?asid=122128466805379955&height=400&width=400&ext=1794016963&hash=Afta4ttski_csNqAIQEYN9za'}" 
                   onerror="this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'" 
                   class="w-9 h-9 rounded-xl object-cover border border-white/15 shrink-0 shadow-sm" />
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap leading-tight">
                  <h4 class="font-bold text-[13px] text-white truncate hover:text-indigo-400 transition-colors">${this.escapeHtml(post.author_name || 'Thành viên')}</h4>
                  <span class="px-2 py-0.5 rounded-full text-[9.5px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 shrink-0">${this.escapeHtml(post.mood || '🌟 Vui vẻ')}</span>
                </div>
                <p class="text-[10.5px] text-slate-400 mt-0.5">@${this.escapeHtml(post.author_username || 'user')} • ${formattedTime}</p>
              </div>
            </div>

            ${isMine ? `
              <button onclick="window.feed.deletePost('${post.id}')" class="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors" title="Xóa bài viết">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            ` : ''}
          </div>

          <!-- Post Content -->
          <div class="text-[13px] sm:text-[13.5px] text-slate-100 whitespace-pre-wrap leading-relaxed select-text">
            ${this.escapeHtml(post.content)}
          </div>

          <!-- Post Image (Khớp 100% với ảnh, không viền đen thừa, chế độ FHD sắc nét, bấm để phóng to) -->
          ${post.image_url ? `
            <div class="pt-0.5 flex justify-center w-full">
              <div class="relative group cursor-pointer overflow-hidden rounded-xl border border-white/10 shadow-md inline-flex max-w-full bg-slate-900/40" 
                   onclick="window.feed.openLightbox('${this.escapeHtml(post.image_url)}', '${this.escapeHtml(post.author_name || 'Người dùng')}')" 
                   title="Bấm để xem ảnh Full HD sắc nét">
                <img src="${post.image_url}" 
                     alt="Ảnh nhật ký Full HD" 
                     class="block max-w-full max-h-[480px] w-auto h-auto rounded-xl object-contain mx-auto transition-transform duration-300 group-hover:scale-[1.01]" 
                     loading="lazy" />
                
                <!-- FHD 1080p Badge & Nút Xem Ảnh -->
                <div class="absolute bottom-2.5 right-2.5 px-2 py-1 rounded-xl bg-black/70 backdrop-blur-md border border-white/20 text-white text-[10.5px] font-semibold flex items-center gap-1 shadow-md group-hover:bg-indigo-600 transition-all">
                  <span class="text-[9px] font-black uppercase bg-amber-400/20 text-amber-300 px-1 py-0.5 rounded border border-amber-400/30">FHD 1080p</span>
                  <i data-lucide="maximize-2" class="w-3 h-3"></i>
                  <span>Xem ảnh</span>
                </div>
              </div>
            </div>
          ` : ''}

          <!-- Post Reaction Stats & Actions Bar -->
          <div class="flex items-center justify-between pt-1.5 border-t border-white/10 text-xs">
            <div class="flex items-center gap-2">
              <!-- Like Button -->
              <button onclick="window.feed.toggleLike('${post.id}')" id="like-btn-${post.id}" class="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-white/5 font-bold transition-all ${post.has_liked ? 'text-rose-500' : 'text-slate-400 hover:text-rose-400'}">
                <i data-lucide="heart" class="w-3.5 h-3.5 ${post.has_liked ? 'fill-rose-500' : ''}"></i>
                <span id="like-count-${post.id}">${post.likes_count || 0}</span>
                <span class="hidden sm:inline">Thích</span>
              </button>

              <!-- Comment Toggle Button -->
              <button onclick="window.feed.toggleCommentBox('${post.id}')" class="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-white/5 font-semibold text-slate-400 hover:text-cyan-400 transition-colors">
                <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
                <span id="comment-count-${post.id}">${(post.comments || []).length}</span>
                <span class="hidden sm:inline">Bình luận</span>
              </button>
            </div>

            <button onclick="window.feed.sharePost('${post.id}')" class="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors" title="Chia sẻ liên kết">
              <i data-lucide="share-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>

          <!-- Comments Section (Gọn gàng & Tinh tế) -->
          <div id="comments-box-${post.id}" class="hidden space-y-1.5 pt-1.5 border-t border-white/5">
            <!-- List of existing comments -->
            <div class="space-y-1 max-h-56 overflow-y-auto custom-scrollbar" id="comments-list-${post.id}">
              ${(post.comments || []).map(c => `
                <div class="flex items-start gap-2 bg-white/[0.03] px-2.5 py-1.5 rounded-xl border border-white/5 text-xs">
                  <img src="${c.author_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'}" 
                       onerror="this.src='https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'" 
                       class="w-5 h-5 rounded-lg object-cover shrink-0 mt-0.5" />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-1">
                      <span class="font-bold text-white text-[11px] truncate">${this.escapeHtml(c.author_name || 'Bạn bè')}</span>
                      <span class="text-[9px] text-slate-500">${this.formatTimeAgo(c.created_at)}</span>
                    </div>
                    <p class="text-slate-300 text-[11px] leading-snug break-words">${this.escapeHtml(c.content)}</p>
                  </div>
                </div>
              `).join('')}
            </div>

            <!-- Comment Input Box -->
            <form onsubmit="window.feed.handleAddComment(event, '${post.id}')" class="flex items-center gap-1.5 pt-0.5">
              <input type="text" id="comment-input-${post.id}" placeholder="Viết bình luận..." class="glass-input flex-1 px-3 py-1.5 rounded-xl text-xs bg-slate-900/90 text-white placeholder-slate-500 border border-white/10 focus:border-indigo-500" />
              <button type="submit" class="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1 transition-all shrink-0">
                <i data-lucide="send" class="w-3.5 h-3.5"></i>
              </button>
            </form>
          </div>
        </article>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  openLightbox(imageUrl, authorName = 'Bài viết') {
    let modal = document.getElementById('feed-image-lightbox-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'feed-image-lightbox-modal';
      modal.className = 'fixed inset-0 z-[99999] bg-black/95 backdrop-blur-md flex flex-col justify-between items-center p-3 sm:p-5 animate-fade-in select-none';
      modal.innerHTML = `
        <!-- Top Toolbar -->
        <div class="w-full max-w-5xl flex items-center justify-between gap-3 text-white z-10 py-1">
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-1 rounded-lg bg-indigo-600 text-[11px] font-black tracking-wider uppercase shadow-md">FHD 1080p</span>
            <span id="lightbox-author-title" class="text-xs sm:text-sm font-semibold text-slate-300 truncate">Ảnh Full HD</span>
          </div>
          <div class="flex items-center gap-2">
            <a id="lightbox-download-btn" href="#" download="seelad_photo.png" target="_blank" class="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-all">
              <i data-lucide="download" class="w-4 h-4 text-emerald-400"></i>
              <span class="hidden sm:inline">Tải ảnh gốc</span>
            </a>
            <button type="button" onclick="window.feed.closeLightbox()" class="p-2 rounded-xl bg-white/10 hover:bg-rose-600 text-white transition-all" title="Đóng (Esc)">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
        </div>

        <!-- Center Image Box -->
        <div class="flex-1 w-full flex items-center justify-center overflow-auto p-2" onclick="if(event.target === this) window.feed.closeLightbox()">
          <img id="lightbox-main-img" src="" class="max-w-full max-h-[86vh] object-contain rounded-2xl shadow-2xl transition-all cursor-zoom-in" alt="Full HD" />
        </div>

        <!-- Bottom Caption / Hint -->
        <div class="w-full text-center py-1 text-slate-400 text-[11px]">
          <span>Nhấn <kbd class="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono">Esc</kbd> hoặc bấm ra ngoài để đóng • Ảnh hiển thị ở chất lượng gốc Full HD</span>
        </div>
      `;
      document.body.appendChild(modal);

      window.addEventListener('keydown', (evt) => {
        if (evt.key === 'Escape') this.closeLightbox();
      });
    }

    const imgEl = document.getElementById('lightbox-main-img');
    const authorEl = document.getElementById('lightbox-author-title');
    const downloadBtn = document.getElementById('lightbox-download-btn');

    if (imgEl) imgEl.src = imageUrl;
    if (authorEl) authorEl.textContent = `Ảnh của ${authorName} • Chất lượng Full HD`;
    if (downloadBtn) downloadBtn.href = imageUrl;

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (window.lucide) window.lucide.createIcons();
  }

  closeLightbox() {
    const modal = document.getElementById('feed-image-lightbox-modal');
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  async toggleLike(postId) {
    const currentUser = this.getCurrentUser();
    const btn = document.getElementById(`like-btn-${postId}`);
    const countEl = document.getElementById(`like-count-${postId}`);

    try {
      const res = await fetch(`/api/posts/${postId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id })
      });
      const data = await res.json();
      if (data.success) {
        const post = this.posts.find(p => p.id === postId);
        if (post) {
          post.has_liked = data.has_liked;
          post.likes_count = data.likes_count;
        }

        if (countEl) countEl.textContent = data.likes_count;
        if (btn) {
          if (data.has_liked) {
            btn.className = "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-white/5 font-bold transition-all text-rose-500 scale-105";
            btn.querySelector('i')?.classList.add('fill-rose-500');
          } else {
            btn.className = "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-white/5 font-bold transition-all text-slate-400 hover:text-rose-400";
            btn.querySelector('i')?.classList.remove('fill-rose-500');
          }
        }
      }
    } catch (e) {
      console.error("Like toggle error:", e);
    }
  }

  async handleAddComment(e, postId) {
    e.preventDefault();
    const currentUser = this.getCurrentUser();
    const input = document.getElementById(`comment-input-${postId}`);
    if (!input) return;

    const content = input.value.trim();
    if (!content) return;

    try {
      const res = await fetch(`/api/posts/${postId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          author_name: currentUser.name,
          author_username: currentUser.username,
          author_avatar: currentUser.avatar,
          content: content
        })
      });
      const data = await res.json();
      if (data.success && data.comment) {
        input.value = '';
        const post = this.posts.find(p => p.id === postId);
        if (post) {
          if (!post.comments) post.comments = [];
          post.comments.push(data.comment);
        }

        const countEl = document.getElementById(`comment-count-${postId}`);
        if (countEl && post) countEl.textContent = post.comments.length;

        const listEl = document.getElementById(`comments-list-${postId}`);
        if (listEl) {
          const div = document.createElement('div');
          div.className = "flex items-start gap-2 bg-white/[0.03] px-3 py-1.5 rounded-xl border border-white/5 text-xs animate-fade-in";
          div.innerHTML = `
            <img src="${data.comment.author_avatar || currentUser.avatar}" onerror="this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'" class="w-6 h-6 rounded-lg object-cover shrink-0 mt-0.5" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-1">
                <span class="font-bold text-white text-[11px] truncate">${this.escapeHtml(data.comment.author_name || currentUser.name)}</span>
                <span class="text-[9.5px] text-slate-500">Vừa xong</span>
              </div>
              <p class="text-slate-300 text-[11.5px] leading-snug break-words">${this.escapeHtml(data.comment.content)}</p>
            </div>
          `;
          listEl.appendChild(div);
          listEl.scrollTop = listEl.scrollHeight;
        }
      }
    } catch (e) {
      console.error("Comment add error:", e);
    }
  }

  async deletePost(postId) {
    if (!confirm("Bạn có chắc chắn muốn xóa bài viết nhật ký này không?")) return;
    const currentUser = this.getCurrentUser();
    try {
      const res = await fetch(`/api/posts/${postId}?user_id=${encodeURIComponent(currentUser.id)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        this.posts = this.posts.filter(p => p.id !== postId);
        if (typeof this.serverMyPostCount === 'number' && this.serverMyPostCount > 0) this.serverMyPostCount--;
        this.renderPosts();
        this.renderProfileCard();
        this.renderProfilePosts();
        if (window.app) window.app.showToast("Đã xóa bài viết thành công.");
      }
    } catch (e) {
      console.error("Delete post error:", e);
    }
  }

  toggleCommentBox(postId) {
    const box = document.getElementById(`comments-box-${postId}`);
    if (box) {
      box.classList.toggle('hidden');
      const input = document.getElementById(`comment-input-${postId}`);
      if (!box.classList.contains('hidden') && input) input.focus();
    }
  }

  sharePost(postId) {
    const url = `${window.location.origin}/?post=${postId}`;
    navigator.clipboard.writeText(url).then(() => {
      if (window.app) window.app.showToast("Đã sao chép liên kết bài viết! 🔗");
    }).catch(() => {
      prompt("Sao chép liên kết:", url);
    });
  }

  renderProfileCard() {
    const user = this.getCurrentUser();
    const coverEl = document.getElementById('profile-card-cover');
    const avatarEl = document.getElementById('profile-card-avatar');
    const nameEl = document.getElementById('profile-card-name');
    const handleEl = document.getElementById('profile-card-handle');
    const bioEl = document.getElementById('profile-card-bio');
    const locationEl = document.getElementById('profile-card-location');
    const statPostsEl = document.getElementById('profile-stat-posts');

    const coverImg = document.getElementById('profile-card-cover-img');
    const coverUrl = user.cover_image || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80';
    const coverPos = user.cover_position || '50% 50%';
    const coverZoom = parseFloat(user.cover_zoom) || 1.0;

    if (coverImg) {
      coverImg.src = coverUrl;
      coverImg.style.objectPosition = coverPos;
      coverImg.style.transform = `scale(${coverZoom})`;
      coverImg.style.imageRendering = '-webkit-optimize-contrast';
    }
    if (coverEl) {
      coverEl.style.imageRendering = '-webkit-optimize-contrast';
      coverEl.style.backgroundPosition = coverPos;
    }

    const posParts = coverPos.split(' ');
    if (posParts.length >= 2) {
      this.coverPosX = parseFloat(posParts[0]) || 50;
      this.coverPosY = parseFloat(posParts[1]) || 50;
    }
    this.coverZoom = coverZoom;
    this.originalCoverPos = coverPos;
    this.originalCoverZoom = coverZoom;
    if (avatarEl) {
      avatarEl.src = user.avatar;
      avatarEl.style.imageRendering = '-webkit-optimize-contrast';
      avatarEl.onerror = () => { avatarEl.src = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'; };
    }
    if (nameEl) nameEl.textContent = user.name;
    if (handleEl) handleEl.textContent = `@${user.username || 'user'}`;
    if (bioEl) bioEl.textContent = user.bio || 'Thành viên kết nối chính thức qua Facebook 🌟';
    
    const cachedLoc = sessionStorage.getItem('seelad_detected_location');
    if (locationEl) {
      locationEl.textContent = cachedLoc || user.location_name || 'Việt Nam';
    }

    const myPostCount = (this.serverMyPostCount !== undefined)
      ? this.serverMyPostCount
      : this.posts.filter(p => p.user_id === user.id || p.author_username === user.username).length;
    if (statPostsEl) statPostsEl.textContent = myPostCount;
  }

  renderProfilePosts() {
    const container = document.getElementById('profile-posts-container');
    if (!container) return;
    const user = this.getCurrentUser();
    const myPosts = this.posts.filter(p => p.user_id === user.id || p.author_username === user.username);
    
    if (myPosts.length === 0) {
      container.innerHTML = `
        <div class="glass p-6 rounded-2xl text-center border border-white/10 my-2">
          <div class="w-12 h-12 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center mx-auto mb-2 text-xl">📖</div>
          <h4 class="font-bold text-sm text-white mb-1">Bạn chưa có bài viết nào</h4>
          <p class="text-xs text-slate-400 mb-3">Hãy chia sẻ trạng thái đầu tiên trên trang cá nhân của bạn!</p>
          <button onclick="window.app.switchTab('feed')" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md">
            Đến viết bài ngay
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = myPosts.map(post => {
      const formattedTime = this.formatTimeAgo(post.created_at);
      return `
        <article class="glass rounded-2xl p-3 sm:p-3.5 border border-white/10 hover:border-white/20 transition-all shadow-md space-y-2" id="profile-post-card-${post.id}">
          <div class="flex items-center justify-between gap-2.5">
            <div class="flex items-center gap-2.5 min-w-0">
              <img src="${post.author_avatar || user.avatar}" 
                   onerror="this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'" 
                   class="w-9 h-9 rounded-xl object-cover border border-white/15 shrink-0 shadow-sm" />
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap leading-tight">
                  <h4 class="font-bold text-xs sm:text-sm text-white truncate">${this.escapeHtml(post.author_name || user.name)}</h4>
                  <span class="px-2 py-0.5 rounded-full text-[9.5px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 shrink-0">${this.escapeHtml(post.mood || '🌟 Vui vẻ')}</span>
                </div>
                <p class="text-[10.5px] text-slate-400 mt-0.5">${formattedTime}</p>
              </div>
            </div>
            <button onclick="window.feed.deletePost('${post.id}')" class="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors" title="Xóa bài viết">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>

          <div class="text-xs sm:text-sm text-slate-100 whitespace-pre-wrap leading-relaxed select-text">
            ${this.escapeHtml(post.content)}
          </div>

          ${post.image_url ? `
            <div class="pt-0.5 flex justify-center w-full">
              <div class="relative group cursor-pointer overflow-hidden rounded-xl border border-white/10 shadow-md inline-flex max-w-full bg-slate-900/40" 
                   onclick="window.feed.openLightbox('${this.escapeHtml(post.image_url)}', '${this.escapeHtml(post.author_name || user.name)}')" 
                   title="Bấm để xem ảnh Full HD sắc nét">
                <img src="${post.image_url}" 
                     alt="Ảnh bài viết" 
                     class="block max-w-full max-h-[460px] w-auto h-auto rounded-xl object-contain mx-auto transition-transform duration-300 group-hover:scale-[1.01]" 
                     loading="lazy" />
                <div class="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-xl bg-black/70 backdrop-blur-md border border-white/20 text-white text-[10.5px] font-semibold flex items-center gap-1 shadow-md group-hover:bg-indigo-600 transition-all">
                  <span class="text-[9px] font-black uppercase bg-amber-400/20 text-amber-300 px-1 py-0.5 rounded border border-amber-400/30">FHD 1080p</span>
                  <i data-lucide="maximize-2" class="w-3 h-3"></i>
                  <span>Xem ảnh</span>
                </div>
              </div>
            </div>
          ` : ''}

          <div class="flex items-center justify-between pt-1.5 border-t border-white/10 text-xs">
            <div class="flex items-center gap-2">
              <button onclick="window.feed.toggleLike('${post.id}')" class="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/5 font-bold transition-all ${post.has_liked ? 'text-rose-500' : 'text-slate-400 hover:text-rose-400'}">
                <i data-lucide="heart" class="w-3.5 h-3.5 ${post.has_liked ? 'fill-rose-500' : ''}"></i>
                <span>${post.likes_count || 0}</span>
              </button>
              <button onclick="window.feed.toggleCommentBox('${post.id}')" class="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/5 font-semibold text-slate-400 hover:text-cyan-400 transition-colors">
                <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
                <span>${(post.comments || []).length}</span>
              </button>
            </div>
            <button onclick="window.feed.sharePost('${post.id}')" class="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5" title="Chia sẻ liên kết">
              <i data-lucide="share-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </article>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  openProfileAvatarLightbox() {
    const user = this.getCurrentUser();
    if (user.avatar) {
      this.openLightbox(user.avatar, `${user.name} - Ảnh đại diện Full HD`);
    }
  }

  openProfileCoverLightbox() {
    const user = this.getCurrentUser();
    const coverUrl = user.cover_image || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80';
    this.openLightbox(coverUrl, `${user.name} - Ảnh bìa Full HD`);
  }

  async detectRealLocation(force = false) {
    const locationEl = document.getElementById('profile-card-location');

    if (!force) {
      const cached = sessionStorage.getItem('seelad_detected_location');
      if (cached) {
        if (locationEl) locationEl.textContent = cached;
        return;
      }
    }

    if (locationEl) locationEl.textContent = 'Đang định vị GPS...';

    if (!navigator.geolocation) {
      this.fallbackIpLocation(force);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`, {
            headers: { 'Accept-Language': 'vi,en' }
          });
          const data = await res.json();
          const addr = data.address || {};
          const city = addr.city || addr.town || addr.province || addr.state || addr.county || 'Việt Nam';
          const district = addr.suburb || addr.quarter || addr.district || '';
          const displayLoc = district ? `${district}, ${city}` : city;

          sessionStorage.setItem('seelad_detected_location', displayLoc);
          if (locationEl) locationEl.textContent = displayLoc;

          const user = this.getCurrentUser();
          if (user && user.id) {
            user.location_name = displayLoc;
            if (window.auth?.currentUser) window.auth.currentUser.location_name = displayLoc;
            fetch('/api/users/update_profile', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ user_id: user.id, location_name: displayLoc })
            }).catch(() => {});
          }
          if (force && window.app) window.app.showToast(`Đã định vị: ${displayLoc}`);
        } catch (e) {
          console.warn("Reverse geocode error:", e);
          this.fallbackIpLocation(force);
        }
      },
      (err) => {
        console.warn("GPS error:", err);
        this.fallbackIpLocation(force);
      },
      { timeout: 7000, enableHighAccuracy: true, maximumAge: 120000 }
    );
  }

  async fallbackIpLocation(force = false) {
    const locationEl = document.getElementById('profile-card-location');
    try {
      const res = await fetch('https://ipapi.co/json/');
      const data = await res.json();
      if (data && (data.city || data.region)) {
        const city = data.city || data.region;
        const displayLoc = `${city}, Việt Nam`;
        sessionStorage.setItem('seelad_detected_location', displayLoc);
        if (locationEl) locationEl.textContent = displayLoc;
        const user = this.getCurrentUser();
        if (user && user.id) {
          user.location_name = displayLoc;
          if (window.auth?.currentUser) window.auth.currentUser.location_name = displayLoc;
          fetch('/api/users/update_profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: user.id, location_name: displayLoc })
          }).catch(() => {});
        }
        if (force && window.app) window.app.showToast(`Đã xác định vị trí: ${displayLoc}`);
        return;
      }
    } catch (e) {}
    const user = this.getCurrentUser();
    if (locationEl) locationEl.textContent = user.location_name || 'Việt Nam';
  }

  openEditProfileModal() {
    const user = this.getCurrentUser();
    const nameInput = document.getElementById('edit-profile-name');
    const bioInput = document.getElementById('edit-profile-bio');
    const locInput = document.getElementById('edit-profile-location');
    const modal = document.getElementById('modal-edit-profile');

    if (nameInput) nameInput.value = user.name || '';
    if (bioInput) bioInput.value = user.bio || '';
    if (locInput) locInput.value = user.location_name || '';
    if (modal) modal.classList.remove('hidden');
  }

  closeEditProfileModal() {
    const modal = document.getElementById('modal-edit-profile');
    if (modal) modal.classList.add('hidden');
  }

  async handleSaveProfile(e) {
    e.preventDefault();
    const user = this.getCurrentUser();
    const name = document.getElementById('edit-profile-name')?.value.trim();
    const bio = document.getElementById('edit-profile-bio')?.value.trim();
    const location = document.getElementById('edit-profile-location')?.value.trim();

    try {
      const res = await fetch('/api/users/update_profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          name: name,
          bio: bio,
          location_name: location
        })
      });
      const data = await res.json();
      if (data.success && data.user) {
        if (window.auth && window.auth.currentUser) {
          Object.assign(window.auth.currentUser, data.user);
          localStorage.setItem('see_lad_user', JSON.stringify(window.auth.currentUser));
        }
        this.renderProfileCard();
        this.closeEditProfileModal();
        if (window.app) window.app.showToast("Đã cập nhật trang cá nhân thành công! ✨");
      }
    } catch (e) {
      console.error("Save profile error:", e);
    }
  }

  startCoverReposition() {
    this.isRepositioningCover = true;
    this.originalCoverPos = `${this.coverPosX}% ${this.coverPosY}%`;
    this.originalCoverZoom = this.coverZoom || 1.0;

    const bar = document.getElementById('cover-reposition-bar');
    const overlay = document.getElementById('cover-drag-overlay');
    const btnRepo = document.getElementById('btn-reposition-cover');
    const btnChange = document.getElementById('btn-change-cover-photo');
    const slider = document.getElementById('cover-zoom-slider');

    if (bar) bar.classList.remove('hidden');
    if (overlay) overlay.classList.remove('hidden');
    if (btnRepo) btnRepo.classList.add('hidden');
    if (btnChange) btnChange.classList.add('hidden');
    if (slider) slider.value = this.coverZoom || 1.0;

    const img = document.getElementById('profile-card-cover-img');
    if (img) {
      img.style.objectPosition = `${this.coverPosX}% ${this.coverPosY}%`;
      img.style.transform = `scale(${this.coverZoom || 1.0})`;
    }

    if (window.lucide) window.lucide.createIcons();
  }

  cancelCoverReposition() {
    this.isRepositioningCover = false;
    const parts = (this.originalCoverPos || '50% 50%').split(' ');
    this.coverPosX = parseFloat(parts[0]) || 50;
    this.coverPosY = parseFloat(parts[1]) || 50;
    this.coverZoom = this.originalCoverZoom || 1.0;

    const img = document.getElementById('profile-card-cover-img');
    if (img) {
      if (this.pendingCoverBase64) {
        const user = this.getCurrentUser();
        img.src = user.cover_image || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80';
      }
      img.style.objectPosition = `${this.coverPosX}% ${this.coverPosY}%`;
      img.style.transform = `scale(${this.coverZoom})`;
    }

    this.pendingCoverBase64 = null;

    const bar = document.getElementById('cover-reposition-bar');
    const overlay = document.getElementById('cover-drag-overlay');
    const btnRepo = document.getElementById('btn-reposition-cover');
    const btnChange = document.getElementById('btn-change-cover-photo');

    if (bar) bar.classList.add('hidden');
    if (overlay) overlay.classList.add('hidden');
    if (btnRepo) btnRepo.classList.remove('hidden');
    if (btnChange) btnChange.classList.remove('hidden');
  }

  async saveCoverReposition() {
    const user = this.getCurrentUser();
    const payload = {
      user_id: user.id,
      cover_position: `${this.coverPosX}% ${this.coverPosY}%`,
      cover_zoom: this.coverZoom
    };

    if (this.pendingCoverBase64) {
      payload.cover_image = this.pendingCoverBase64;
    }

    try {
      const res = await fetch('/api/users/update_profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success && data.user) {
        if (window.auth && window.auth.currentUser) {
          Object.assign(window.auth.currentUser, data.user);
          localStorage.setItem('see_lad_user', JSON.stringify(window.auth.currentUser));
        }
        user.cover_position = payload.cover_position;
        user.cover_zoom = payload.cover_zoom;
        if (payload.cover_image) user.cover_image = payload.cover_image;

        this.originalCoverPos = payload.cover_position;
        this.originalCoverZoom = payload.cover_zoom;
        this.pendingCoverBase64 = null;

        const bar = document.getElementById('cover-reposition-bar');
        const overlay = document.getElementById('cover-drag-overlay');
        const btnRepo = document.getElementById('btn-reposition-cover');
        const btnChange = document.getElementById('btn-change-cover-photo');

        if (bar) bar.classList.add('hidden');
        if (overlay) overlay.classList.add('hidden');
        if (btnRepo) btnRepo.classList.remove('hidden');
        if (btnChange) btnChange.classList.remove('hidden');
        this.isRepositioningCover = false;

        if (window.app) window.app.showToast("Đã lưu vị trí ảnh bìa thành công! ✨");
      } else {
        if (window.app) window.app.showToast("Lỗi khi lưu vị trí ảnh bìa!", "error");
      }
    } catch (err) {
      console.error("Save cover reposition error:", err);
      if (window.app) window.app.showToast("Lỗi kết nối khi lưu vị trí ảnh bìa!", "error");
    }
  }

  initCoverDragEvents() {
    const overlay = document.getElementById('cover-drag-overlay');
    if (!overlay) return;

    let isDragging = false;
    let startX = 0, startY = 0;
    let startPosX = 50, startPosY = 50;

    overlay.addEventListener('pointerdown', (e) => {
      if (!this.isRepositioningCover) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startPosX = this.coverPosX;
      startPosY = this.coverPosY;
      try { overlay.setPointerCapture(e.pointerId); } catch (_) {}
    });

    overlay.addEventListener('pointermove', (e) => {
      if (!isDragging || !this.isRepositioningCover) return;
      const rect = overlay.getBoundingClientRect();
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      // Dragging down shifts view up (reveals top)
      const changeY = (deltaY / rect.height) * 100;
      const changeX = (deltaX / rect.width) * 100;

      this.coverPosY = Math.max(0, Math.min(100, Math.round(startPosY - changeY)));
      this.coverPosX = Math.max(0, Math.min(100, Math.round(startPosX - changeX)));

      const img = document.getElementById('profile-card-cover-img');
      if (img) {
        img.style.objectPosition = `${this.coverPosX}% ${this.coverPosY}%`;
      }
    });

    const endDrag = (e) => {
      if (isDragging) {
        isDragging = false;
        try { overlay.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    };

    overlay.addEventListener('pointerup', endDrag);
    overlay.addEventListener('pointercancel', endDrag);

    // Mouse wheel zoom
    overlay.addEventListener('wheel', (e) => {
      if (!this.isRepositioningCover) return;
      e.preventDefault();
      const slider = document.getElementById('cover-zoom-slider');
      const step = e.deltaY < 0 ? 0.05 : -0.05;
      this.coverZoom = Math.max(1.0, Math.min(2.5, Math.round((this.coverZoom + step) * 100) / 100));
      if (slider) slider.value = this.coverZoom;
      const img = document.getElementById('profile-card-cover-img');
      if (img) img.style.transform = `scale(${this.coverZoom})`;
    }, { passive: false });
  }

  handleCoverUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const img = new Image();
      img.onload = () => {
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
        const base64Cover = canvas.toDataURL('image/jpeg', 0.90);

        this.pendingCoverBase64 = base64Cover;
        const coverImg = document.getElementById('profile-card-cover-img');
        if (coverImg) {
          coverImg.src = base64Cover;
        }

        // Immediately enter reposition mode so user can align their new cover
        this.startCoverReposition();
        if (window.app) window.app.showToast("Kéo để căn chỉnh vị trí ảnh bìa mới rồi bấm Lưu vị trí! 🌟");
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  initAvatarCropDragEvents() {
    const viewport = document.getElementById('avatar-crop-viewport');
    if (!viewport) return;

    let isDragging = false;
    let startX = 0, startY = 0;
    let startOffsetX = 0, startOffsetY = 0;

    viewport.addEventListener('pointerdown', (e) => {
      if (!this.avatarImgElement) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startOffsetX = this.avatarOffsetX;
      startOffsetY = this.avatarOffsetY;
      try { viewport.setPointerCapture(e.pointerId); } catch (_) {}
    });

    viewport.addEventListener('pointermove', (e) => {
      if (!isDragging || !this.avatarImgElement) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      this.avatarOffsetX = startOffsetX + dx;
      this.avatarOffsetY = startOffsetY + dy;
      this.updateAvatarPreviewTransform();
    });

    const endDrag = (e) => {
      if (isDragging) {
        isDragging = false;
        try { viewport.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    };

    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);

    // Mouse wheel zoom
    viewport.addEventListener('wheel', (e) => {
      if (!this.avatarImgElement) return;
      e.preventDefault();
      const slider = document.getElementById('avatar-zoom-slider');
      const step = e.deltaY < 0 ? 0.05 : -0.05;
      this.avatarZoom = Math.max(1.0, Math.min(3.0, Math.round((this.avatarZoom + step) * 100) / 100));
      if (slider) slider.value = this.avatarZoom;
      const lbl = document.getElementById('avatar-zoom-label');
      if (lbl) lbl.textContent = `${this.avatarZoom.toFixed(1)}x`;
      this.updateAvatarPreviewTransform();
    }, { passive: false });
  }

  openAvatarAdjustModal(imageSrc = null) {
    const user = this.getCurrentUser();
    const src = imageSrc || user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80';
    const modal = document.getElementById('modal-avatar-adjuster');
    const previewImg = document.getElementById('avatar-crop-preview-img');
    const slider = document.getElementById('avatar-zoom-slider');
    const zoomLabel = document.getElementById('avatar-zoom-label');
    const viewport = document.getElementById('avatar-crop-viewport');

    if (!modal) return;
    modal.classList.remove('hidden');

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const vw = (viewport && viewport.clientWidth) ? viewport.clientWidth : 280;
      const vh = (viewport && viewport.clientHeight) ? viewport.clientHeight : 280;

      this.avatarNaturalWidth = img.naturalWidth || 400;
      this.avatarNaturalHeight = img.naturalHeight || 400;
      this.avatarBaseScale = Math.max(vw / this.avatarNaturalWidth, vh / this.avatarNaturalHeight);
      this.avatarZoom = 1.0;
      this.avatarOffsetX = 0;
      this.avatarOffsetY = 0;
      this.avatarImgElement = img;

      if (slider) slider.value = 1.0;
      if (zoomLabel) zoomLabel.textContent = '1.0x';

      if (previewImg) {
        previewImg.src = img.src;
        this.updateAvatarPreviewTransform();
      }
    };
    img.src = src;

    if (window.lucide) window.lucide.createIcons();
  }

  updateAvatarPreviewTransform() {
    const previewImg = document.getElementById('avatar-crop-preview-img');
    if (!previewImg || !this.avatarImgElement) return;

    const w = this.avatarNaturalWidth * this.avatarBaseScale;
    const h = this.avatarNaturalHeight * this.avatarBaseScale;
    previewImg.style.width = `${Math.round(w)}px`;
    previewImg.style.height = `${Math.round(h)}px`;
    previewImg.style.transform = `translate(${this.avatarOffsetX}px, ${this.avatarOffsetY}px) scale(${this.avatarZoom})`;
  }

  resetAvatarCropPosition() {
    this.avatarOffsetX = 0;
    this.avatarOffsetY = 0;
    this.avatarZoom = 1.0;
    const slider = document.getElementById('avatar-zoom-slider');
    const zoomLabel = document.getElementById('avatar-zoom-label');
    if (slider) slider.value = 1.0;
    if (zoomLabel) zoomLabel.textContent = '1.0x';
    this.updateAvatarPreviewTransform();
  }

  closeAvatarAdjustModal() {
    const modal = document.getElementById('modal-avatar-adjuster');
    if (modal) modal.classList.add('hidden');
  }

  async saveAvatarCrop() {
    if (!this.avatarImgElement) return;
    const btnSave = document.getElementById('btn-save-avatar-crop');
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> <span>Đang lưu...</span>`;
    }

    try {
      const viewport = document.getElementById('avatar-crop-viewport');
      const vw = (viewport && viewport.clientWidth) ? viewport.clientWidth : 280;

      // High-resolution square canvas (FHD 600x600)
      const canvasSize = 600;
      const canvas = document.createElement('canvas');
      canvas.width = canvasSize;
      canvas.height = canvasSize;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const scaleRatio = canvasSize / vw;
      ctx.translate(canvasSize / 2, canvasSize / 2);
      ctx.translate(this.avatarOffsetX * scaleRatio, this.avatarOffsetY * scaleRatio);
      ctx.scale(this.avatarZoom, this.avatarZoom);

      const drawW = this.avatarNaturalWidth * this.avatarBaseScale * scaleRatio;
      const drawH = this.avatarNaturalHeight * this.avatarBaseScale * scaleRatio;
      ctx.drawImage(this.avatarImgElement, -drawW / 2, -drawH / 2, drawW, drawH);

      const croppedBase64 = canvas.toDataURL('image/jpeg', 0.92);
      const user = this.getCurrentUser();

      const res = await fetch('/api/users/update_profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          avatar: croppedBase64
        })
      });

      const data = await res.json();
      if (data.success && data.user) {
        if (window.auth && window.auth.currentUser) {
          Object.assign(window.auth.currentUser, data.user);
          localStorage.setItem('see_lad_user', JSON.stringify(window.auth.currentUser));
        }
        user.avatar = croppedBase64;

        // Update all avatar images across the app
        const avatarEl = document.getElementById('profile-card-avatar');
        if (avatarEl) avatarEl.src = croppedBase64;

        document.querySelectorAll('.user-display-avatar').forEach(img => {
          img.src = croppedBase64;
        });
        const headerAvatar = document.getElementById('header-user-avatar');
        if (headerAvatar) headerAvatar.src = croppedBase64;
        const composerAvatar = document.getElementById('feed-composer-avatar');
        if (composerAvatar) composerAvatar.src = croppedBase64;

        this.closeAvatarAdjustModal();
        if (window.app) window.app.showToast("Đã căn chỉnh và cập nhật ảnh đại diện thành công! ✨");
      } else {
        if (window.app) window.app.showToast("Lỗi khi lưu ảnh đại diện!", "error");
      }
    } catch (err) {
      console.error("Save avatar crop error:", err);
      if (window.app) window.app.showToast("Lỗi kết nối khi lưu ảnh đại diện!", "error");
    } finally {
      if (btnSave) {
        btnSave.disabled = false;
        btnSave.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i> <span>Lưu ảnh đại diện</span>`;
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  viewAuthorProfile(userId) {
    if (window.chat) {
      window.chat.openPublicProfileModal(userId);
    }
  }

  formatTimeAgo(dateStr) {
    if (!dateStr) return 'Vừa xong';
    try {
      const d = new Date(dateStr.replace(' ', 'T'));
      const now = new Date();
      const diffSec = Math.floor((now - d) / 1000);
      if (diffSec < 60) return 'Vừa xong';
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
      return `${Math.floor(diffSec / 86400)} ngày trước`;
    } catch (e) {
      return dateStr;
    }
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

window.feed = new FeedController();
