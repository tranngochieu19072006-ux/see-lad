/**
 * SEE LAD - Social Diary & Profile Feed Controller
 * Nhật ký cá nhân, đăng trạng thái, tương tác cảm xúc ❤️ và bình luận 💬
 */

class FeedController {
  constructor() {
    this.posts = [];
    this.currentFilter = 'all'; // 'all' | 'my'
  }

  async init() {
    this.bindEvents();
    await this.loadFeed();
    this.renderProfileCard();
  }

  getCurrentUser() {
    return window.auth?.currentUser || window.SEE_LAD_CONFIG?.currentUser || {
      id: 'user_hieu',
      name: 'Trần Ngọc Hiếu',
      username: 'ngochieu.dev',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
      bio: 'Nhà sáng lập & Lập trình viên SEE LAD 🌟',
      cover_image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80',
      location_name: 'Quận 1, TP.HCM'
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
          content: content,
          image_url: imageUrl,
          mood: mood
        })
      });
      const data = await res.json();
      if (data.success && data.post) {
        this.posts.unshift(data.post);
        if (contentInput) contentInput.value = '';
        this.clearImagePreview();
        this.renderPosts();
        if (window.app) window.app.showToast("Đã chia sẻ nhật ký mới thành công! 🌟");
      } else {
        alert(data.error || "Không thể đăng bài!");
      }
    } catch (err) {
      console.error("Create post error:", err);
      alert("Lỗi kết nối máy chủ khi đăng bài.");
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<i data-lucide="send" class="w-4 h-4"></i> Đăng nhật ký`;
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  async loadFeed() {
    const currentUser = this.getCurrentUser();
    try {
      const res = await fetch(`/api/posts?user_id=${encodeURIComponent(currentUser.id)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.posts)) {
        this.posts = data.posts;
        this.renderPosts();
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
        <div class="glass p-8 rounded-3xl text-center border border-white/10 my-4">
          <div class="w-16 h-16 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-3 text-3xl">✨</div>
          <h4 class="font-bold text-base text-white mb-1">Chưa có bài viết nhật ký nào</h4>
          <p class="text-xs text-slate-400 mb-4">Hãy là người đầu tiên chia sẻ cảm xúc, trạng thái và hình ảnh của bạn với bạn bè!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = displayList.map(post => {
      const isMine = post.user_id === currentUser.id;
      const formattedTime = this.formatTimeAgo(post.created_at);

      return `
        <article class="glass rounded-3xl p-5 border border-white/10 hover:border-indigo-500/30 transition-all shadow-xl space-y-3.5" id="post-card-${post.id}">
          <!-- Post Author Header -->
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0 cursor-pointer" onclick="window.feed.viewAuthorProfile('${post.user_id}')">
              <img src="${post.author_avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + post.user_id}" class="w-11 h-11 rounded-2xl object-cover border border-white/15 shrink-0" />
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <h4 class="font-bold text-sm text-white truncate hover:text-indigo-400 transition-colors">${this.escapeHtml(post.author_name || 'Người dùng')}</h4>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">${this.escapeHtml(post.mood || '🌟 Vui vẻ')}</span>
                </div>
                <p class="text-[11px] text-slate-400">@${this.escapeHtml(post.author_username || 'user')} • ${formattedTime}</p>
              </div>
            </div>

            ${isMine ? `
              <button onclick="window.feed.deletePost('${post.id}')" class="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors" title="Xóa bài viết">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            ` : ''}
          </div>

          <!-- Post Content -->
          <div class="text-sm text-slate-100 whitespace-pre-wrap leading-relaxed">
            ${this.escapeHtml(post.content)}
          </div>

          <!-- Post Image (if present) -->
          ${post.image_url ? `
            <div class="rounded-2xl overflow-hidden border border-white/10 max-h-96 bg-black/40 flex items-center justify-center">
              <img src="${post.image_url}" class="w-full h-auto max-h-96 object-contain rounded-2xl" loading="lazy" />
            </div>
          ` : ''}

          <!-- Post Reaction Stats & Actions Bar -->
          <div class="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
            <div class="flex items-center gap-4">
              <!-- Like Button -->
              <button onclick="window.feed.toggleLike('${post.id}')" id="like-btn-${post.id}" class="flex items-center gap-1.5 font-bold transition-all ${post.has_liked ? 'text-rose-500 scale-105' : 'text-slate-400 hover:text-rose-400'}">
                <i data-lucide="heart" class="w-4 h-4 ${post.has_liked ? 'fill-rose-500' : ''}"></i>
                <span id="like-count-${post.id}">${post.likes_count || 0}</span>
                <span class="hidden sm:inline">Thích</span>
              </button>

              <!-- Comment Toggle Button -->
              <button onclick="window.feed.toggleCommentBox('${post.id}')" class="flex items-center gap-1.5 font-semibold text-slate-400 hover:text-cyan-400 transition-colors">
                <i data-lucide="message-circle" class="w-4 h-4"></i>
                <span id="comment-count-${post.id}">${(post.comments || []).length}</span>
                <span class="hidden sm:inline">Bình luận</span>
              </button>
            </div>

            <button onclick="window.feed.sharePost('${post.id}')" class="p-1.5 text-slate-400 hover:text-white transition-colors" title="Chia sẻ liên kết">
              <i data-lucide="share-2" class="w-4 h-4"></i>
            </button>
          </div>

          <!-- Comments Section (collapsible / expanded) -->
          <div id="comments-box-${post.id}" class="space-y-3 pt-3 border-t border-white/5">
            <!-- List of existing comments -->
            <div class="space-y-2 max-h-60 overflow-y-auto custom-scrollbar" id="comments-list-${post.id}">
              ${(post.comments || []).map(c => `
                <div class="flex items-start gap-2.5 bg-white/[0.03] p-2.5 rounded-xl border border-white/5 text-xs">
                  <img src="${c.author_avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + c.user_id}" class="w-7 h-7 rounded-xl object-cover shrink-0" />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-1">
                      <span class="font-bold text-white truncate">${this.escapeHtml(c.author_name || 'Bạn bè')}</span>
                      <span class="text-[10px] text-slate-500">${this.formatTimeAgo(c.created_at)}</span>
                    </div>
                    <p class="text-slate-300 mt-0.5 leading-relaxed break-words">${this.escapeHtml(c.content)}</p>
                  </div>
                </div>
              `).join('')}
            </div>

            <!-- Comment Input Box -->
            <form onsubmit="window.feed.handleAddComment(event, '${post.id}')" class="flex items-center gap-2 pt-1">
              <input type="text" id="comment-input-${post.id}" placeholder="Viết bình luận cho ${this.escapeHtml(post.author_name || 'bạn bè')}..." class="glass-input flex-1 px-3.5 py-2 rounded-xl text-xs bg-slate-900 text-white placeholder-slate-500 focus:border-indigo-500" />
              <button type="submit" class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1 transition-all">
                <i data-lucide="send" class="w-3.5 h-3.5"></i>
              </button>
            </form>
          </div>
        </article>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
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
            btn.className = "flex items-center gap-1.5 font-bold transition-all text-rose-500 scale-105";
            btn.querySelector('i')?.classList.add('fill-rose-500');
          } else {
            btn.className = "flex items-center gap-1.5 font-bold transition-all text-slate-400 hover:text-rose-400";
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
          div.className = "flex items-start gap-2.5 bg-white/[0.03] p-2.5 rounded-xl border border-white/5 text-xs animate-fade-in";
          div.innerHTML = `
            <img src="${data.comment.author_avatar || currentUser.avatar}" class="w-7 h-7 rounded-xl object-cover shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-1">
                <span class="font-bold text-white truncate">${this.escapeHtml(data.comment.author_name || currentUser.name)}</span>
                <span class="text-[10px] text-slate-500">Vừa xong</span>
              </div>
              <p class="text-slate-300 mt-0.5 leading-relaxed break-words">${this.escapeHtml(data.comment.content)}</p>
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
        this.renderPosts();
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

    if (coverEl && user.cover_image) {
      coverEl.style.backgroundImage = `url('${user.cover_image}')`;
    }
    if (avatarEl) avatarEl.src = user.avatar;
    if (nameEl) nameEl.textContent = user.name;
    if (handleEl) handleEl.textContent = `@${user.username || 'user'}`;
    if (bioEl) bioEl.textContent = user.bio || 'Chưa cập nhật tiểu sử.';
    if (locationEl) locationEl.textContent = user.location_name || 'Việt Nam';

    const myPostCount = this.posts.filter(p => p.user_id === user.id).length;
    if (statPostsEl) statPostsEl.textContent = myPostCount;
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

  handleCoverUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const base64Cover = evt.target.result;
      const user = this.getCurrentUser();
      try {
        const res = await fetch('/api/users/update_profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.id,
            cover_image: base64Cover
          })
        });
        const data = await res.json();
        if (data.success) {
          if (window.auth && window.auth.currentUser) {
            window.auth.currentUser.cover_image = base64Cover;
          }
          const coverEl = document.getElementById('profile-card-cover');
          if (coverEl) coverEl.style.backgroundImage = `url('${base64Cover}')`;
          if (window.app) window.app.showToast("Đã cập nhật ảnh bìa mới! 🖼️");
        }
      } catch (err) {
        console.error("Cover upload error:", err);
      }
    };
    reader.readAsDataURL(file);
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
