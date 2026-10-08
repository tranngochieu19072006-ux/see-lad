/**
 * SEE LAD - Scheduler & Offline Reminder Controller
 * Lên lịch tin nhắn và nhắc hẹn thông minh với bạn bè thật và chính mình
 */

class SchedulerController {
  constructor() {
    this.tasks = [];
    this.checkInterval = null;
  }

  init() {
    const saved = localStorage.getItem('see_lad_tasks');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Lọc bỏ các bot thử nghiệm trước kia
        this.tasks = (parsed || []).filter(t => !['Lê Thảo Nhi', 'Nguyễn Hoàng Nam', 'Phạm Minh Quân', 'Team Dự án SEE LAD 🚀'].includes(t.recipient));
      } catch (e) {
        this.tasks = [];
      }
    } else {
      this.tasks = [];
    }

    this.bindEvents();
    this.populateRecipients();
    this.renderTasks();
    this.startChecker();
  }

  populateRecipients() {
    const selectEl = document.getElementById('schedule-recipient-select');
    if (!selectEl) return;

    const friends = (window.chat?.contacts || []).filter(c => !c.isGroup);
    let optionsHtml = `<option value="Chính mình (Nhắc bản thân)">Chính mình (Nhắc bản thân)</option>`;

    friends.forEach(f => {
      optionsHtml += `<option value="${this.escapeHtml(f.name)}">${this.escapeHtml(f.name)}</option>`;
    });

    selectEl.innerHTML = optionsHtml;
  }

  bindEvents() {
    const formSchedule = document.getElementById('form-add-schedule');
    if (formSchedule) {
      formSchedule.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = document.getElementById('schedule-title-input').value.trim();
        const recipient = document.getElementById('schedule-recipient-select').value;
        const time = document.getElementById('schedule-time-input').value;

        if (!title) return alert("Vui lòng nhập nội dung nhắc hẹn!");

        const newTask = {
          id: 'task_' + Date.now(),
          title: title,
          recipient: recipient,
          timeStr: time ? new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sắp tới',
          isOfflineAlert: true,
          status: 'pending'
        };

        this.tasks.unshift(newTask);
        this.saveTasks();
        this.renderTasks();
        formSchedule.reset();

        if (window.app) window.app.showToast("Đã lên lịch nhắc hẹn thành công! ⏰ Hệ thống sẽ tự động nhắc bạn.");
      });
    }
  }

  renderTasks() {
    const listEl = document.getElementById('schedule-tasks-list');
    if (!listEl) return;

    if (this.tasks.length === 0) {
      listEl.innerHTML = `
        <div class="py-8 text-center text-slate-400">
          <p class="text-sm">Chưa có lịch hẹn nào. Tạo lịch hẹn đầu tiên để SEE LAD nhắc bạn cả khi không online!</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = this.tasks.map(t => `
      <div class="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-indigo-500/30 transition-all">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <i data-lucide="clock" class="w-5 h-5"></i>
          </div>
          <div>
            <h5 class="font-semibold text-sm text-white">${this.escapeHtml(t.title)}</h5>
            <p class="text-xs text-slate-400">${this.escapeHtml(t.recipient)} • Giờ hẹn: <span class="text-indigo-400 font-medium">${t.timeStr}</span></p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="px-2.5 py-1 rounded-full text-[11px] font-semibold ${t.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}">
            ${t.status === 'completed' ? 'Đã hoàn thành' : 'Đang chờ nhắc'}
          </span>
          <button onclick="window.scheduler.deleteTask('${t.id}')" class="p-1.5 text-slate-400 hover:text-red-400 transition-colors">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  deleteTask(taskId) {
    this.tasks = this.tasks.filter(t => t.id !== taskId);
    this.saveTasks();
    this.renderTasks();
    if (window.app) window.app.showToast("Đã xóa lịch nhắc hẹn");
  }

  saveTasks() {
    localStorage.setItem('see_lad_tasks', JSON.stringify(this.tasks));
  }

  startChecker() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.checkInterval = setInterval(() => {
      const pendingCount = this.tasks.filter(t => t.status === 'pending').length;
      const badge = document.getElementById('scheduler-badge-count');
      if (badge) {
        if (pendingCount > 0) {
          badge.textContent = pendingCount;
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }
    }, 5000);
  }

  checkOfflineNotifications() {
    const pending = this.tasks.filter(t => t.status === 'pending' && t.isOfflineAlert);
    if (pending.length > 0 && window.app) {
      window.app.showToast(`🔔 Bạn có ${pending.length} nhắc hẹn quan trọng được lên lịch sẵn!`);
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

window.scheduler = new SchedulerController();
