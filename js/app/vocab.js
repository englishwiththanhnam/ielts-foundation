// js/app/vocab.js
// Đây là điểm khởi đầu (entry point) cho trang vocab_app.html.
// Nhiệm vụ của nó rất đơn giản: kiểm tra đăng nhập và khởi chạy VocabEngine.

import { checkAuthState } from '../modules/auth.js';
import { VocabEngine } from '../modules/vocab-logic.js';

function main() {
    checkAuthState(
        (user) => { // User đã đăng nhập
            console.log("User is logged in. Initializing Vocab Engine...");
            
            // Lấy các ID cần thiết từ URL của trang
            const urlParams = new URLSearchParams(window.location.search);
            const assignmentId = urlParams.get('assignmentId');
            const vocabId = urlParams.get('vocabId');
            
            // Khởi chạy "bộ não" của ứng dụng với các thông tin này
            VocabEngine.init(user.uid, assignmentId, vocabId);
        },
        () => { // User chưa đăng nhập
            console.log("User is not logged in. Redirecting to login page.");
            window.location.href = '/login.html';
        }
    );
}

// Chạy hàm main khi DOM đã sẵn sàng
document.addEventListener('DOMContentLoaded', main);
