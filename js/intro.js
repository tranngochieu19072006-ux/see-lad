/**
 * SEE LAD - Intro Typewriter & Creator Showcase
 * Tác giả: Trần Ngọc Hiếu
 */

class IntroController {
  constructor() {
    this.nameElement = null;
    this.descElement = null;
    this.thankElement = null;
    this.actionElement = null;
    this.introContainer = null;
    this.authContainer = null;
    this.isSkipped = false;
  }

  init() {
    this.nameElement = document.getElementById('intro-name');
    this.descElement = document.getElementById('intro-desc');
    this.thankElement = document.getElementById('intro-thanks');
    this.actionElement = document.getElementById('intro-action');
    this.introContainer = document.getElementById('intro-screen');
    this.authContainer = document.getElementById('auth-screen');

    // Bỏ qua ngay nếu người dùng đã đăng nhập hoặc màn hình intro bị ẩn
    if (localStorage.getItem('see_lad_user') || (this.introContainer && this.introContainer.classList.contains('hidden'))) {
      this.isSkipped = true;
      if (this.introContainer) this.introContainer.classList.add('hidden');
      return;
    }

    // Skip button
    const skipBtn = document.getElementById('btn-skip-intro');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => this.finishIntro());
    }

    const enterBtn = document.getElementById('btn-enter-app');
    if (enterBtn) {
      enterBtn.addEventListener('click', () => this.finishIntro());
    }

    // Start typewriter sequence
    setTimeout(() => {
      this.runSequence();
    }, 400);
  }

  // Typewriter helper
  typeText(element, text, speed = 40) {
    return new Promise((resolve) => {
      if (!element || this.isSkipped) return resolve();
      let index = 0;
      const interval = setInterval(() => {
        if (!element || this.isSkipped || index >= text.length) {
          clearInterval(interval);
          if (this.isSkipped && element) element.textContent = text;
          resolve();
          return;
        }
        element.textContent += text[index];
        index++;
        if (window.sounds) window.sounds.playKeystroke();
      }, speed);
    });
  }

  // Backspace helper
  deleteText(element, targetLength = 0, speed = 25) {
    return new Promise((resolve) => {
      if (!element || this.isSkipped) return resolve();
      const interval = setInterval(() => {
        if (!element || this.isSkipped || (element.textContent && element.textContent.length <= targetLength)) {
          clearInterval(interval);
          resolve();
          return;
        }
        if (element.textContent) {
          element.textContent = element.textContent.slice(0, -1);
        }
        if (window.sounds) window.sounds.playKeystroke();
      }, speed);
    });
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async runSequence() {
    if (this.isSkipped) return;

    // 1. Gõ tên: "Tôi tên là TRẦN NGỌC HIẾU"
    const fullName = "Tôi tên là TRẦN NGỌC HIẾU";
    await this.typeText(this.nameElement, fullName, 55);
    await this.sleep(450);

    // 2. Gõ câu đầu: "Tôi là 1 lập trình viên"
    await this.typeText(this.descElement, "Tôi là 1 lập trình viên", 45);
    await this.sleep(1200);

    // 3. Xóa chữ "là 1 lập trình viên", chỉ giữ lại chữ "Tôi " (chiều dài = 4 ký tự)
    await this.deleteText(this.descElement, 4, 30);
    await this.sleep(300);

    // 4. Gõ tiếp: "thích các giao diện website và mobile app."
    await this.typeText(this.descElement, "thích các giao diện website và mobile app.", 45);
    await this.sleep(1300);

    // 5. Xóa hết chỉ giữ chữ "Tôi "
    await this.deleteText(this.descElement, 4, 25);
    await this.sleep(300);

    // 6. Gõ tiếp: "hy vọng mình có thể tiến xa hơn trong lĩnh vực thiết kế Web/app cho mọi người xem."
    await this.typeText(this.descElement, "hy vọng mình có thể tiến xa hơn trong lĩnh vực thiết kế Web/app cho mọi người xem.", 40);
    await this.sleep(1200);

    // 7. Lời cảm ơn chân thành
    if (this.thankElement) {
      this.thankElement.classList.remove('hidden');
      this.thankElement.classList.add('animate-fade-in');
      await this.typeText(this.thankElement, "❤️ Cảm ơn bạn rất nhiều vì đã ghé thăm! Chúc bạn có trải nghiệm tuyệt vời cùng SEE LAD.", 35);
      if (window.sounds) window.sounds.playTypewriterBell();
    }

    // 8. Hiện nút khám phá
    if (this.actionElement) {
      this.actionElement.classList.remove('opacity-0', 'pointer-events-none');
      this.actionElement.classList.add('opacity-100', 'translate-y-0');
    }

    // Tự động chuyển trang sau 4 giây nếu người dùng không bấm
    setTimeout(() => {
      if (!this.isSkipped && this.introContainer && !this.introContainer.classList.contains('hidden')) {
        this.finishIntro();
      }
    }, 4500);
  }

  finishIntro() {
    if (this.isSkipped) return;
    this.isSkipped = true;

    if (this.introContainer) {
      this.introContainer.style.transition = 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
      this.introContainer.style.opacity = '0';
      this.introContainer.style.transform = 'scale(1.05) translateY(-20px)';
      
      setTimeout(() => {
        this.introContainer.classList.add('hidden');
        if (this.authContainer) {
          this.authContainer.classList.remove('hidden');
          this.authContainer.style.opacity = '0';
          this.authContainer.style.transform = 'scale(0.96)';
          
          requestAnimationFrame(() => {
            this.authContainer.style.transition = 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
            this.authContainer.style.opacity = '1';
            this.authContainer.style.transform = 'scale(1)';
          });
        }
      }, 700);
    }
  }
}

window.intro = new IntroController();
