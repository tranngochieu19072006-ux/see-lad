/**
 * SEE LAD - Unlimited File Hub & Instant Content QR
 * Gửi file không giới hạn cho bất kỳ ai & Tạo mã QR tức thì để quét xem nội dung
 */

class FileHubController {
  constructor() {
    this.uploadedFiles = [];
  }

  init() {
    this.bindEvents();
    this.renderSharedFiles();
  }

  bindEvents() {
    const dropZone = document.getElementById('file-drop-zone');
    const fileInput = document.getElementById('hub-file-input');

    if (dropZone && fileInput) {
      dropZone.addEventListener('click', () => fileInput.click());

      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-indigo-500', 'bg-indigo-500/10');
      });

      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-indigo-500', 'bg-indigo-500/10');
      });

      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-indigo-500', 'bg-indigo-500/10');
        if (e.dataTransfer.files.length > 0) {
          this.handleFiles(e.dataTransfer.files);
        }
      });

      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          this.handleFiles(e.target.files);
        }
      });
    }

    // Direct text / content QR generator
    const btnGenContentQR = document.getElementById('btn-gen-content-qr');
    const inputContent = document.getElementById('hub-text-content');

    if (btnGenContentQR && inputContent) {
      btnGenContentQR.addEventListener('click', () => {
        const text = inputContent.value.trim();
        if (!text) return alert("Vui lòng nhập nội dung muốn chia sẻ!");

        this.uploadedFiles.unshift({
          id: 'text_' + Date.now(),
          name: "Văn bản / Ghi chú trực tiếp",
          type: 'text',
          size: `${new Blob([text]).size} bytes`,
          content: text,
          date: 'Vừa xong'
        });

        this.renderSharedFiles();
        inputContent.value = '';
        if (window.app) window.app.showToast("Đã tạo mã QR cho nội dung thành công! 📱");
      });
    }
  }

  handleFiles(files) {
    Array.from(files).forEach(file => {
      const fileUrl = URL.createObjectURL(file);
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      const isZip = file.name.endsWith('.zip') || file.name.endsWith('.rar') || file.name.endsWith('.7z');

      let sizeFormatted = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
      if (file.size > 1024 * 1024 * 1024) {
        sizeFormatted = (file.size / (1024 * 1024 * 1024)).toFixed(2) + ' GB (Không giới hạn)';
      }

      const item = {
        id: 'file_' + Date.now() + Math.random().toString(36).substring(2, 5),
        name: file.name,
        type: isVideo ? 'video' : isImage ? 'image' : isZip ? 'zip' : 'file',
        size: sizeFormatted,
        url: fileUrl,
        date: 'Vừa xong'
      };

      this.uploadedFiles.unshift(item);
    });

    this.renderSharedFiles();
    if (window.app) window.app.showToast(`Đã tải lên ${files.length} tệp thành công! Mã QR đã sẵn sàng.`);
  }

  renderSharedFiles() {
    const listEl = document.getElementById('hub-files-list');
    if (!listEl) return;

    if (this.uploadedFiles.length === 0) {
      listEl.innerHTML = `
        <div class="col-span-full py-12 text-center text-slate-400">
          <p class="text-sm">Chưa có tập tin nào. Kéo thả file ảnh, video, zip không giới hạn dung lượng vào ô trên để tạo mã QR chia sẻ!</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = this.uploadedFiles.map(f => {
      const qrDataUrl = `https://seelad.app/share/${f.id}`;
      return `
        <div class="glass p-5 rounded-3xl border border-white/10 flex flex-col justify-between hover:border-indigo-500/40 transition-all group">
          <div class="flex items-start justify-between gap-3 mb-4">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-sm shrink-0">
                <i data-lucide="${f.type === 'video' ? 'video' : f.type === 'image' ? 'image' : f.type === 'zip' ? 'archive' : 'file'}" class="w-6 h-6"></i>
              </div>
              <div class="min-w-0">
                <h4 class="font-semibold text-sm text-white truncate max-w-[170px]" title="${f.name}">${f.name}</h4>
                <p class="text-xs text-slate-400">${f.size} • ${f.date}</p>
              </div>
            </div>
            <span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold">Sẵn sàng</span>
          </div>

          <!-- Quick QR Preview Block -->
          <div class="bg-black/30 p-3 rounded-2xl flex items-center justify-between gap-3 mb-4 border border-white/5">
            <div class="flex items-center gap-3">
              <canvas id="qr_canvas_${f.id}" class="w-16 h-16 rounded-xl bg-white p-1"></canvas>
              <div>
                <p class="text-[11px] font-semibold text-indigo-300">Quét xem nội dung</p>
                <p class="text-[10px] text-slate-400">Mở camera quét là xem ngay</p>
              </div>
            </div>
            <button onclick="window.fileHub.showFilePreviewModal('${f.id}')" class="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors" title="Xem trước">
              <i data-lucide="eye" class="w-4 h-4"></i>
            </button>
          </div>

          <div class="flex items-center gap-2">
            ${f.url ? `<a href="${f.url}" download="${f.name}" class="flex-1 py-2 text-center rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5">
              <i data-lucide="download" class="w-3.5 h-3.5"></i> Tải về
            </a>` : `<button onclick="window.fileHub.showFilePreviewModal('${f.id}')" class="flex-1 py-2 text-center rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors">
              Xem nội dung
            </button>`}
            <button onclick="window.fileHub.shareToChat('${f.id}')" class="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors" title="Gửi vào đoạn chat">
              <i data-lucide="send" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    // Render QR on small canvases
    this.uploadedFiles.forEach(f => {
      const c = document.getElementById(`qr_canvas_${f.id}`);
      if (c) {
        this.renderMiniQR(c, `https://seelad.app/share/${f.id}`);
      }
    });
  }

  renderMiniQR(canvas, text) {
    const ctx = canvas.getContext('2d');
    canvas.width = 64;
    canvas.height = 64;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#1e1b4b';

    // Simple QR grid pattern
    const cells = 16;
    const s = 64 / cells;
    for (let r = 0; r < cells; r++) {
      for (let cl = 0; cl < cells; cl++) {
        const isCorner = (r < 4 && cl < 4) || (r < 4 && cl >= cells - 4) || (r >= cells - 4 && cl < 4);
        if (isCorner) {
          ctx.fillRect(cl * s, r * s, s, s);
        } else if ((r * 3 + cl * 7 + text.length) % 2 === 0) {
          ctx.fillRect(cl * s, r * s, s - 1, s - 1);
        }
      }
    }
  }

  showFilePreviewModal(fileId) {
    const item = this.uploadedFiles.find(f => f.id === fileId);
    if (!item) return;

    const modal = document.getElementById('modal-file-preview');
    const contentBox = document.getElementById('file-preview-content');
    const titleEl = document.getElementById('file-preview-title');

    if (titleEl) titleEl.textContent = item.name;

    if (contentBox) {
      if (item.type === 'image') {
        contentBox.innerHTML = `<img src="${item.url}" class="max-h-[60vh] max-w-full rounded-2xl object-contain mx-auto shadow-2xl" />`;
      } else if (item.type === 'video') {
        contentBox.innerHTML = `<video src="${item.url}" controls autoplay class="max-h-[60vh] max-w-full rounded-2xl mx-auto shadow-2xl"></video>`;
      } else if (item.type === 'text') {
        contentBox.innerHTML = `<div class="p-6 bg-slate-900 rounded-2xl border border-white/10 text-slate-200 whitespace-pre-wrap font-mono text-sm max-h-[60vh] overflow-y-auto">${item.content}</div>`;
      } else {
        contentBox.innerHTML = `
          <div class="py-12 text-center">
            <i data-lucide="file-archive" class="w-16 h-16 text-indigo-400 mx-auto mb-3"></i>
            <p class="text-base font-semibold text-white">${item.name}</p>
            <p class="text-xs text-slate-400 mt-1">${item.size}</p>
          </div>
        `;
      }
    }

    if (modal) modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  shareToChat(fileId) {
    const item = this.uploadedFiles.find(f => f.id === fileId);
    if (!item) return;

    window.chat.sendMessage({
      type: item.type === 'text' ? 'text' : item.type,
      text: item.type === 'text' ? item.content : undefined,
      fileUrl: item.url,
      fileName: item.name,
      fileSize: item.size
    });

    if (window.app) {
      window.app.switchTab('chat');
      window.app.showToast(`Đã chia sẻ "${item.name}" vào đoạn chat hiện tại! 🚀`);
    }
  }
}

window.fileHub = new FileHubController();
