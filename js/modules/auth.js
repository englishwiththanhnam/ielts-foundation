// js/modules/auth.js
// Module này quản lý tất cả các vấn đề về xác thực người dùng.

// Import 'auth' từ module cấu hình firebase chúng ta đã tạo ở bước trước.
import { auth } from '../config/firebase-config.js';

/**
 * Kiểm tra trạng thái đăng nhập của người dùng và thực hiện các hành động tương ứng.
 * Hàm này sẽ là điểm khởi đầu cho logic ở mỗi trang.
 * @param {(user: firebase.User) => void} onLogin - Callback được gọi khi người dùng đã đăng nhập. `user` là đối tượng người dùng từ Firebase.
 * @param {() => void} onLogout - Callback được gọi khi người dùng chưa đăng nhập.
 */
export function checkAuthState(onLogin, onLogout) {
    auth.onAuthStateChanged(user => {
        if (user) {
            // Nếu có user, gọi hàm onLogin và truyền đối tượng user vào.
            onLogin(user);
        } else {
            // Nếu không có user, gọi hàm onLogout.
            onLogout();
        }
    });
}

/**
 * Thiết lập các thành phần giao diện liên quan đến người dùng (hiển thị tên, nút đăng xuất).
 * @param {firebase.User} user - Đối tượng user từ Firebase Auth.
 * @param {string} displayElementId - ID của element để hiển thị tên người dùng.
 * @param {string} logoutButtonId - ID của nút đăng xuất.
 */
export function setupUserSession(user, displayElementId, logoutButtonId) {
    const userDisplayElement = document.getElementById(displayElementId);
    if (userDisplayElement) {
        // Hiển thị tên hoặc email của người dùng.
        userDisplayElement.textContent = user.displayName || user.email;
    }

    const logoutButton = document.getElementById(logoutButtonId);
    if (logoutButton) {
        // Gắn sự kiện 'click' cho nút đăng xuất.
        logoutButton.addEventListener('click', () => {
            auth.signOut().then(() => {
                console.log('User signed out.');
                // Sau khi đăng xuất, chuyển hướng về trang đăng nhập.
                window.location.href = '/login.html'; 
            }).catch(error => {
                console.error("Lỗi khi đăng xuất:", error);
            });
        });
    }
}
