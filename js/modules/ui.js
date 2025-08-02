// js/modules/ui.js
// Module này chứa các hàm để tạo và quản lý các thành phần giao diện chung
// như modal, alert, và các hiệu ứng.

/**
 * Hiển thị một thông báo alert tùy chỉnh và tự động ẩn đi.
 * @param {string} message - Nội dung thông báo.
 */
export function showCustomAlert(message) {
    const existingAlert = document.getElementById('custom-alert-box');
    if (existingAlert) existingAlert.remove();

    const alertBox = document.createElement('div');
    alertBox.id = 'custom-alert-box';
    alertBox.style.cssText = `position: fixed; top: 20px; left: 50%; transform: translateX(-50%); padding: 16px 24px; border-radius: 16px; z-index: 200; font-weight: 600; color: var(--text-primary); animation: fadeInDown 0.5s ease forwards;`;
    alertBox.className = 'glass-panel';
    alertBox.innerHTML = message;
    document.body.appendChild(alertBox);

    setTimeout(() => {
        alertBox.style.animation = 'fadeOutUp 0.5s ease forwards';
        setTimeout(() => alertBox.remove(), 500);
    }, 3000);
}

/**
 * Hiển thị một hộp thoại xác nhận (confirm).
 * @param {string} message - Câu hỏi xác nhận.
 * @param {() => void} onConfirm - Hàm sẽ được gọi khi người dùng bấm "Yes".
 * @param {string} [confirmText='Yes'] - Chữ trên nút xác nhận.
 * @param {string} [cancelText='Cancel'] - Chữ trên nút hủy.
 */
export function showCustomConfirm(message, onConfirm, confirmText = 'Yes', cancelText = 'Cancel') {
    const confirmId = 'custom-confirm-box';
    const existingConfirm = document.getElementById(confirmId);
    if (existingConfirm) existingConfirm.remove();

    const confirmBox = document.createElement('div');
    confirmBox.id = confirmId;
    confirmBox.className = 'modal';
    confirmBox.innerHTML = `
        <div class="modal-content glass-panel text-center">
            <p class="text-lg font-medium text-slate-800 mb-6">${message}</p>
            <div class="flex justify-center gap-4">
                <button id="confirm-no" class="btn btn-secondary">${cancelText}</button>
                <button id="confirm-yes" class="btn btn-main-action bg-red-500 hover:bg-red-600">${confirmText}</button>
            </div>
        </div>
    `;
    document.body.appendChild(confirmBox);

    const closeConfirm = () => {
        confirmBox.classList.add('is-closing');
        setTimeout(() => { confirmBox.remove(); }, 300);
    };

    document.getElementById('confirm-yes').onclick = () => {
        onConfirm();
        closeConfirm();
    };
    document.getElementById('confirm-no').onclick = closeConfirm;

    setTimeout(() => { confirmBox.classList.add('is-open'); }, 10);
}

/**
 * Mở một modal.
 * @param {string} modalId - ID của modal cần mở.
 */
export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('is-open');
    }
}

/**
 * Đóng một modal.
 * @param {string} modalId - ID của modal cần đóng.
 */
export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('is-closing');
        setTimeout(() => {
            modal.classList.remove('is-open', 'is-closing');
        }, 300);
    }
}

/**
 * Cập nhật tiêu đề chính của ứng dụng.
 * @param {string} title - Tiêu đề chính.
 * @param {string} subtitle - Tiêu đề phụ.
 */
export function updateHeader(title, subtitle) {
    const appTitleEl = document.getElementById('app-title');
    const appSubtitleEl = document.getElementById('app-subtitle');
    if (appTitleEl) appTitleEl.textContent = title;
    if (appSubtitleEl) appSubtitleEl.textContent = subtitle;
}

/**
 * Đánh dấu nút điều hướng đang hoạt động.
 * @param {string} navId - ID của nút điều hướng (ví dụ: 'nav-dashboard').
 */
export function setActiveNav(navId) {
    document.querySelectorAll('.sidebar-nav-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(navId);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
}
