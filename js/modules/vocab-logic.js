// js/modules/vocab-logic.js
// Đây là "bộ não" của ứng dụng học từ vựng.
// Nó chứa toàn bộ logic để xử lý dữ liệu, render giao diện và quản lý trạng thái học.

import { db, firestore } from '../config/firebase-config.js';
import { showCustomAlert, showCustomConfirm, openModal, closeModal, updateHeader, setActiveNav } from './ui.js';

// --- HÀM TÍNH TOÁN TIẾN ĐỘ (DÙNG CHUNG) ---

/**
 * Tính toán chính xác tổng số cấu trúc có thể học từ một danh sách từ.
 * Logic này được tách ra để cả assignment.html và vocab_app.html có thể dùng chung,
 * đảm bảo sự đồng nhất trong việc hiển thị tiến độ.
 * @param {Array<object>} moduleWords - Mảng các đối tượng từ vựng của một học phần.
 * @returns {number} - Tổng số câu hỏi cấu trúc.
 */
export function countTotalStructures(moduleWords) {
    if (!moduleWords) return 0;
    
    const allPrepositions = ["on", "in", "at", "for", "with", "about", "of", "from", "to", "as", "against", "over", "into", "upon", "by", "towards"];
    const stopWords = ["a", "an", "the", "be", "sb", "sth", "oneself", "doing"];
    let totalStructures = 0;

    moduleWords.forEach(word => {
        if (word.structure) {
            const structures = word.structure.split(';').map(s => s.trim()).filter(Boolean);
            structures.forEach(struct => {
                const [phrase] = struct.includes(':') ? struct.split(':') : [struct, ''];
                const cleanPhrase = phrase.replace(/\s*\((v|n|adj|adv|be)\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
                const wordsInStruct = cleanPhrase.split(' ');
                
                let prepositionsFound = 0;
                wordsInStruct.forEach(w => {
                    if (allPrepositions.includes(w.replace(/,$/, ''))) {
                        prepositionsFound++;
                    }
                });

                if (prepositionsFound > 0) {
                    totalStructures += prepositionsFound;
                } else {
                    let hasKeyword = false;
                    for(let i = 0; i < wordsInStruct.length; i++){
                        const currentWord = wordsInStruct[i].replace(/,$/, '');
                        if(!stopWords.includes(currentWord) && moduleWords.some(w => w.word === currentWord)){
                            hasKeyword = true;
                            break;
                        }
                    }
                    if (hasKeyword || wordsInStruct.length > 1) {
                        totalStructures++;
                    }
                }
            });
        }
    });
    return totalStructures;
}


// --- ĐỐI TƯỢNG VOCAB ENGINE ---

export const VocabEngine = {
    // Trạng thái (state) của ứng dụng
    data: {
        // Dữ liệu được nạp từ Firestore
        words: [],
        structures: [],
        testHistory: [],
        
        // Dữ liệu được xử lý
        wordFamilies: {},
        sessionItems: [],
        skippedItems: [],
        
        // Trạng thái phiên học
        practiceCounter: 0,
        currentSessionIndex: 0,
        mode: null, // 'vocab', 'structure', 'test', 'flashcard-vocab', etc.
        testTimer: null,
        incorrectTestAnswers: [],

        // ID cần thiết để lưu dữ liệu
        userId: null,
        assignmentId: null,
        moduleId: null,

        // Dữ liệu tĩnh
        allPrepositions: ["on", "in", "at", "for", "with", "about", "of", "from", "to", "as", "against", "over", "into", "upon", "by", "towards", "of"],
        stopWords: ["a", "an", "the", "be", "sb", "sth", "oneself", "doing"],
        backupData: {
            adjective: { personality_positive: ['kind', 'friendly', 'honest', 'brave', 'calm', 'charming', 'witty'], personality_negative: ['rude', 'selfish', 'lazy', 'arrogant', 'bossy', 'cruel', 'moody'], emotion: ['happy', 'sad', 'angry', 'surprised', 'afraid', 'excited', 'worried'], general: ['big', 'small', 'hot', 'cold', 'new', 'old', 'good', 'bad'] },
            noun: { abstract: ['love', 'hate', 'idea', 'dream', 'luck', 'truth', 'faith', 'hope'], person: ['teacher', 'doctor', 'artist', 'writer', 'friend', 'enemy', 'leader'], general: ['house', 'car', 'book', 'tree', 'water', 'time', 'money', 'world'] },
            verb: { action: ['run', 'walk', 'eat', 'drink', 'sleep', 'talk', 'listen', 'watch'], cognition: ['think', 'believe', 'know', 'understand', 'remember', 'forget'], general: ['is', 'have', 'do', 'say', 'get', 'make', 'go', 'see'] }
        }
    },

    /**
     * Khởi tạo engine học từ vựng.
     * @param {string} userId 
     * @param {string} assignmentId 
     * @param {string} moduleId 
     */
    async init(userId, assignmentId, moduleId) {
        // 1. Lưu các ID cần thiết
        this.data.userId = userId;
        this.data.assignmentId = assignmentId;
        this.data.moduleId = moduleId;

        // 2. Kiểm tra ID hợp lệ
        if (!assignmentId || !moduleId) {
            document.getElementById('main-content').innerHTML = `<div class="glass-panel text-center"><h1 class="text-2xl font-bold text-red-600">Lỗi: URL không hợp lệ.</h1><p class="mt-2 text-slate-600">Vui lòng quay lại trang bài tập và thử lại.</p></div>`;
            return;
        }

        // 3. Cài đặt các thành phần giao diện tĩnh
        this.initTheme();
        this.initModals();
        this.initSidebarNav();
        this.initResponsiveSidebar();
        this.setupAutoSave();

        // 4. Cài đặt nút Quay lại
        const backButton = document.getElementById('back-to-assignment-btn');
        if (backButton) {
            backButton.href = `assignment.html?id=${assignmentId}`;
            backButton.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.saveData(); // Đảm bảo lưu lần cuối trước khi chuyển trang
                window.location.href = backButton.href;
            });
        }

        // 5. Bắt đầu tải dữ liệu từ Firestore
        await this.loadDataFromFirestore();
        
        // 6. Hiển thị màn hình đầu tiên
        this.renderDashboard();
    },

    // --- CÁC HÀM KHỞI TẠO GIAO DIỆN ---

    initTheme() {
        // ... (Logic đổi theme sáng/tối)
    },

    initResponsiveSidebar() {
        // ... (Logic cho sidebar trên di động)
    },

    initSidebarNav() {
        // ... (Gắn sự kiện cho các nút trên sidebar)
    },

    initModals() {
        // ... (Gắn sự kiện cho các modal)
    },

    /**
     * Cài đặt cơ chế tự động lưu tiến trình khi người dùng rời trang.
     */
    setupAutoSave() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.saveData();
            }
        });
        window.addEventListener('pagehide', () => this.saveData());
    },


    // --- CÁC HÀM XỬ LÝ DỮ LIỆU (DATA) ---

    async loadDataFromFirestore() {
        // ... (Logic tải dữ liệu từ Firestore)
    },

    async saveData() {
        // ... (Logic lưu dữ liệu lên Firestore)
    },

    analyzeAndTagWords() {
        // ... (Logic phân loại từ vựng)
    },

    groupWordFamilies() {
        // ... (Logic nhóm các từ cùng họ)
    },

    parseAndStoreStructures() {
        // ... (Logic phân tích và tạo câu hỏi cấu trúc)
    },

    updateProgress(itemId, isCorrect) {
        // ... (Logic cập nhật tiến độ khi trả lời đúng/sai)
    },

    // --- CÁC HÀM RENDER GIAO DIỆN (UI) ---

    renderDashboard() {
        // ... (Logic hiển thị màn hình dashboard)
    },

    renderStudyTypeSelection() {
        // ... (Logic hiển thị màn hình chọn học Vocab/Structure)
    },
    
    // ... và rất nhiều hàm render khác ...
    // (renderMCQ, renderWriting, renderTestView, etc.)


    // --- CÁC HÀM TIỆN ÍCH ---

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
};

// **Lưu ý quan trọng**: Do giới hạn về độ dài, tôi đã rút gọn phần thân của các hàm.
// Trong tệp thực tế của bạn, bạn sẽ sao chép TOÀN BỘ nội dung của đối tượng `App` cũ vào đây,
// sau đó chỉnh sửa lại hàm `init`, `loadData`, `saveData` như hướng dẫn.
