// js/app/login.js
import { auth } from '../config/firebase-config.js';
import { checkAuthState } from '../modules/auth.js';

// --- DOM ELEMENTS ---
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginErrorEl = document.getElementById('login-error');
const registerErrorEl = document.getElementById('register-error');
const showRegisterBtn = document.getElementById('show-register-btn');
const showLoginBtn = document.getElementById('show-login-btn');

// --- MAIN LOGIC ---
function main() {
    // Nếu người dùng đã đăng nhập, chuyển thẳng đến dashboard
    checkAuthState(
        (user) => {
            console.log('User already logged in. Redirecting...');
            window.location.href = '/dashboard.html';
        },
        () => {
            console.log('User not logged in. Showing auth forms.');
            // Nếu chưa đăng nhập, gắn các sự kiện cho form
            setupFormListeners();
        }
    );
}

// --- FUNCTIONS ---
function setupFormListeners() {
    // Chuyển đổi giữa form đăng nhập và đăng ký
    showRegisterBtn.addEventListener('click', () => {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
    });

    showLoginBtn.addEventListener('click', () => {
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
    });

    // Xử lý sự kiện submit form đăng nhập
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        loginErrorEl.textContent = 'Đang xử lý...';

        try {
            await auth.signInWithEmailAndPassword(email, password);
            // Đăng nhập thành công, Firebase listener trong main() sẽ tự động chuyển trang
        } catch (error) {
            loginErrorEl.textContent = getAuthErrorMessage(error.code);
        }
    });

    // Xử lý sự kiện submit form đăng ký
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('register-name').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        registerErrorEl.textContent = 'Đang xử lý...';

        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            // Cập nhật tên hiển thị cho người dùng mới
            await userCredential.user.updateProfile({
                displayName: name
            });
            // Đăng ký thành công, Firebase listener sẽ tự động chuyển trang
        } catch (error) {
            registerErrorEl.textContent = getAuthErrorMessage(error.code);
        }
    });
}

/**
 * Chuyển mã lỗi của Firebase thành thông báo tiếng Việt dễ hiểu.
 * @param {string} errorCode - Mã lỗi từ Firebase Auth.
 * @returns {string} - Thông báo lỗi bằng tiếng Việt.
 */
function getAuthErrorMessage(errorCode) {
    switch (errorCode) {
        case 'auth/wrong-password':
            return 'Sai mật khẩu. Vui lòng thử lại.';
        case 'auth/user-not-found':
            return 'Không tìm thấy tài khoản với email này.';
        case 'auth/invalid-email':
            return 'Địa chỉ email không hợp lệ.';
        case 'auth/email-already-in-use':
            return 'Địa chỉ email này đã được sử dụng.';
        case 'auth/weak-password':
            return 'Mật khẩu quá yếu. Vui lòng chọn mật khẩu khác.';
        default:
            return 'Đã có lỗi xảy ra. Vui lòng thử lại.';
    }
}

// --- RUN ---
document.addEventListener('DOMContentLoaded', main);
