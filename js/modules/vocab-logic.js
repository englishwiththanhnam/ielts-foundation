// js/modules/vocab-logic.js
// Đây là "bộ não" của ứng dụng học từ vựng.
// Nó chứa toàn bộ logic để xử lý dữ liệu, render giao diện và quản lý trạng thái học.

import { db, firestore } from '../config/firebase-config.js';
import { showCustomAlert, showCustomConfirm, openModal, closeModal, updateHeader, setActiveNav } from './ui.js';

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

export const VocabEngine = {
    // Trạng thái (state) của ứng dụng
    data: {
        words: [],
        structures: [],
        testHistory: [],
        wordFamilies: {},
        sessionItems: [],
        skippedItems: [], 
        practiceCounter: 0, 
        currentSessionIndex: 0,
        mode: null,
        testTimer: null,
        incorrectTestAnswers: [],
        userId: null,
        assignmentId: null,
        moduleId: null,
        allPrepositions: ["on", "in", "at", "for", "with", "about", "of", "from", "to", "as", "against", "over", "into", "upon", "by", "towards", "of"],
        stopWords: ["a", "an", "the", "be", "sb", "sth", "oneself", "doing"],
        backupData: {
            adjective: { personality_positive: ['kind', 'friendly', 'honest', 'brave', 'calm', 'charming', 'witty'], personality_negative: ['rude', 'selfish', 'lazy', 'arrogant', 'bossy', 'cruel', 'moody'], emotion: ['happy', 'sad', 'angry', 'surprised', 'afraid', 'excited', 'worried'], general: ['big', 'small', 'hot', 'cold', 'new', 'old', 'good', 'bad'] },
            noun: { abstract: ['love', 'hate', 'idea', 'dream', 'luck', 'truth', 'faith', 'hope'], person: ['teacher', 'doctor', 'artist', 'writer', 'friend', 'enemy', 'leader'], general: ['house', 'car', 'book', 'tree', 'water', 'time', 'money', 'world'] },
            verb: { action: ['run', 'walk', 'eat', 'drink', 'sleep', 'talk', 'listen', 'watch'], cognition: ['think', 'believe', 'know', 'understand', 'remember', 'forget'], general: ['is', 'have', 'do', 'say', 'get', 'make', 'go', 'see'] }
        }
    },

    async init(userId, assignmentId, moduleId) {
        this.data.userId = userId;
        this.data.assignmentId = assignmentId;
        this.data.moduleId = moduleId;

        if (!assignmentId || !moduleId) {
            document.getElementById('main-content').innerHTML = `<div class="glass-panel text-center"><h1 class="text-2xl font-bold text-red-600">Lỗi: URL không hợp lệ.</h1><p class="mt-2 text-slate-600">Vui lòng quay lại trang bài tập và thử lại.</p></div>`;
            return;
        }

        this.initTheme();
        this.initModals();
        this.initSidebarNav();
        this.initResponsiveSidebar();
        this.setupAutoSave();

        const backButton = document.getElementById('back-to-assignment-btn');
        if (backButton) {
            backButton.href = `assignment.html?id=${assignmentId}`;
            backButton.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.saveData();
                window.location.href = backButton.href;
            });
        }

        await this.loadDataFromFirestore();
        this.renderDashboard();
    },

    initTheme() {
        const themeToggleBtn = document.getElementById('theme-toggle-btn');
        const themeToggleIcon = document.getElementById('theme-toggle-icon');
        const themeToggleText = document.getElementById('theme-toggle-text');
        const body = document.body;

        const applyTheme = (theme) => {
            if (theme === 'dark') {
                body.classList.add('dark');
                themeToggleIcon.classList.replace('fa-moon', 'fa-sun');
                themeToggleText.textContent = 'Light Mode';
            } else {
                body.classList.remove('dark');
                themeToggleIcon.classList.replace('fa-sun', 'fa-moon');
                themeToggleText.textContent = 'Dark Mode';
            }
        };

        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const currentTheme = savedTheme || (prefersDark ? 'dark' : 'light');
        applyTheme(currentTheme);

        themeToggleBtn.addEventListener('click', () => {
            const newTheme = body.classList.contains('dark') ? 'light' : 'dark';
            localStorage.setItem('theme', newTheme);
            applyTheme(newTheme);
        });
    },

    initResponsiveSidebar() {
        const menuToggleBtn = document.getElementById('menu-toggle-btn');
        const sidebarOverlay = document.getElementById('sidebar-overlay');
        const sidebarNavButtons = document.querySelectorAll('.sidebar-nav-btn');
        const appLayout = document.querySelector('.app-layout');

        const toggleSidebar = () => {
            if (window.innerWidth < 1024) {
                document.body.classList.toggle('sidebar-open');
            } else {
                appLayout.classList.toggle('sidebar-collapsed');
            }
        };

        if (menuToggleBtn) menuToggleBtn.addEventListener('click', toggleSidebar);
        if (sidebarOverlay) sidebarOverlay.addEventListener('click', toggleSidebar);
        
        sidebarNavButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                if (window.innerWidth < 1024) document.body.classList.remove('sidebar-open');
            });
        });
    },

    initSidebarNav() {
        document.getElementById('nav-dashboard').addEventListener('click', () => this.renderDashboard());
        document.getElementById('nav-study').addEventListener('click', () => this.renderStudyTypeSelection());
        document.getElementById('nav-practice').addEventListener('click', () => this.renderPracticeModeSelection());
        document.getElementById('nav-test').addEventListener('click', () => openModal('test-setup-modal'));
        document.getElementById('nav-reset').addEventListener('click', () => {
            showCustomConfirm("Bạn có chắc muốn reset tiến độ học phần này? Hành động này không thể hoàn tác.", async () => {
                this.data.words.forEach(w => w.isLearned = false);
                this.data.structures.forEach(s => s.isLearned = false);
                this.data.skippedItems = [];
                this.data.testHistory = [];
                await this.saveData(); 
                this.renderDashboard();
                showCustomAlert("Đã reset tiến độ học phần.");
            }, 'Reset', 'Hủy');
        });
    },

    initModals() {
        const wordModal = document.getElementById('word-list-modal');
        const testModal = document.getElementById('test-setup-modal');
        
        document.getElementById('close-word-modal-btn').onclick = () => closeModal('word-list-modal');
        document.getElementById('close-test-modal-btn').onclick = () => closeModal('test-setup-modal');
        
        window.onclick = (event) => {
            if (event.target == wordModal) closeModal('word-list-modal');
            if (event.target == testModal) closeModal('test-setup-modal');
        }
        
        document.getElementById('start-test-fixed-btn').addEventListener('click', () => {
            const count = document.getElementById('question-count').value;
            closeModal('test-setup-modal');
            this.startTest(parseInt(count));
        });
        document.getElementById('start-test-all-btn').addEventListener('click', () => {
            closeModal('test-setup-modal');
            this.startTest(-1);
        });
    },

    setupAutoSave() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.saveData();
            }
        });
        window.addEventListener('pagehide', () => this.saveData());
    },

    async loadDataFromFirestore() {
        const mainContent = document.getElementById('main-content');
        mainContent.innerHTML = `<div class="text-center text-lg text-slate-600">Đang tải bộ từ vựng...</div>`;
        
        const moduleDoc = await db.collection('modules').doc(this.data.moduleId).get();
        if (!moduleDoc.exists) {
            mainContent.innerHTML = `<div class="glass-panel text-center"><h1 class="text-2xl font-bold text-red-600">Lỗi: Không tìm thấy học phần.</h1></div>`;
            throw new Error("Module not found");
        }
        
        const moduleData = moduleDoc.data();
        document.getElementById('app-title').textContent = moduleData.title;
        const originalWords = moduleData.words;
        
        mainContent.innerHTML = `<div class="text-center text-lg text-slate-600">Đang tải tiến độ học tập...</div>`;
        const progressDoc = await db.collection('student_progress').doc(this.data.userId).collection('assignments').doc(this.data.assignmentId).get();
        const progressData = progressDoc.exists ? progressDoc.data().moduleProgress?.[this.data.moduleId] : null;

        this.data.words = originalWords.map(originalWord => {
            const savedWord = progressData?.words?.find(w => w.id === originalWord.id);
            return { ...originalWord, isLearned: savedWord ? savedWord.isLearned : false };
        });
        
        this.data.skippedItems = progressData?.skippedItems || [];
        this.data.testHistory = progressData?.testHistory || [];
        
        this.analyzeAndTagWords(); 
        this.groupWordFamilies();
        this.parseAndStoreStructures();

        if (progressData && progressData.structures) {
            this.data.structures.forEach(s => {
                const savedStruct = progressData.structures.find(ps => ps.id === s.id);
                if (savedStruct) s.isLearned = savedStruct.isLearned;
            });
        }
    },

    async saveData() {
        if (!this.data.userId || !this.data.assignmentId || !this.data.moduleId) return;
        
        const progressRef = db.collection('student_progress').doc(this.data.userId).collection('assignments').doc(this.data.assignmentId);
        const progressPayload = {
            [`moduleProgress.${this.data.moduleId}`]: {
                words: this.data.words.map(w => ({ id: w.id, isLearned: w.isLearned })),
                structures: this.data.structures.map(s => ({ id: s.id, isLearned: s.isLearned })),
                skippedItems: this.data.skippedItems,
                testHistory: this.data.testHistory,
                lastUpdated: firestore.FieldValue.serverTimestamp()
            }
        };
        try {
            await progressRef.set(progressPayload, { merge: true });
            console.log("Progress saved at:", new Date().toLocaleTimeString());
        } catch (error) {
            console.error("Error saving progress:", error);
        }
    },
    
    analyzeAndTagWords() {
        const tagMap = { 'ghen': ['emotion_negative'], 'tị': ['emotion_negative'], 'đối lập': ['concept'], 'hòa đồng': ['personality_positive'], 'thẳng thắn': ['personality_positive'], 'bộc trực': ['personality_positive'], 'bướng bỉnh': ['personality_negative'], 'cứng đầu': ['personality_negative'], 'thù địch': ['personality_negative'], 'dũng cảm': ['personality_positive'], 'táo bạo': ['personality_positive'], 'tự tin': ['personality_positive'], 'rụt rè': ['personality_negative'], 'nhút nhát': ['personality_negative'], 'chân thành': ['personality_positive'], 'thành thật': ['personality_positive'], 'giả dối': ['personality_negative'], 'hung hăng': ['personality_negative'], 'phục tùng': ['personality_negative'], 'dễ bảo': ['personality_negative'], 'lo lắng': ['emotion_negative'], 'hồi hộp': ['emotion_negative'], 'chu đáo': ['personality_positive'], 'ân cần': ['personality_positive'], 'vô ý': ['personality_negative'], 'thiếu chu đáo': ['personality_negative'], 'khiêu khích': ['action_negative'], 'bắt nạt': ['action_negative'], 'chịu đựng': ['action_neutral'], 'tha thứ': ['action_positive'] };
        this.data.words.forEach(word => {
            word.tags = [];
            for (const keyword in tagMap) {
                if (word.meaning.includes(keyword)) {
                    word.tags = [...new Set([...word.tags, ...tagMap[keyword]])];
                }
            }
            if (word.tags.length === 0) {
                word.tags.push('general');
            }
        });
    },

    groupWordFamilies() {
        const familyRoots = { 'jealous': 'jealous', 'jealousy': 'jealous', 'jealously': 'jealous', 'diametrical': 'diametrical', 'diametrically': 'diametrical', 'gregarious': 'gregarious', 'gregariousness': 'gregarious', 'wrinkle': 'wrinkle', 'wrinkled': 'wrinkle', 'wrinkly': 'wrinkle', 'presume': 'presume', 'presumably': 'presume', 'presumption': 'presume', 'provoke': 'provoke', 'provocation': 'provoke', 'provocative': 'provoke', 'provocatively': 'provoke', 'race': 'race', 'racial': 'race', 'racially': 'race', 'racism': 'race', 'racist': 'race', 'outspoken': 'outspoken', 'outspokenly': 'outspoken', 'outspokenness': 'outspoken', 'preconceive': 'preconceive', 'preconceived': 'preconceive', 'preconception': 'preconceive', 'prejudice': 'prejudice', 'prejudiced': 'prejudice', 'inherit': 'inherit', 'inheritance': 'inherit', 'relevant': 'relevant', 'relevance': 'relevant', 'irrelevant': 'relevant', 'irrelevance': 'relevant', 'gene': 'gene', 'genetic': 'gene', 'genetically': 'gene', 'geneticist': 'gene', 'image': 'image', 'imagery': 'image', 'descend': 'descend', 'descendant': 'descend', 'descent': 'descend', 'function': 'function', 'functional': 'function', 'dysfunction': 'function', 'dysfunctional': 'function', 'hostile': 'hostile', 'hostility': 'hostile', 'genuine': 'genuine', 'genuinely': 'genuine', 'genuineness': 'genuine', 'sincere': 'sincere', 'sincerely': 'sincere', 'sincerity': 'sincere', 'insincere': 'sincere', 'insincerity': 'sincere', 'timid': 'timid', 'timidly': 'timid', 'timidity': 'timid', 'affection': 'affection', 'affectionate': 'affection', 'affectionately': 'affection', 'tolerate': 'tolerate', 'tolerant': 'tolerate', 'tolerance': 'tolerate', 'intolerant': 'tolerate', 'intolerance': 'tolerate', 'opinion': 'opinion', 'opinionated': 'opinion', 'consider': 'consider', 'considerate': 'consider', 'consideration': 'consider', 'considerable': 'consider', 'considerably': 'consider', 'inconsiderate': 'consider', 'bold': 'bold', 'boldly': 'bold', 'boldness': 'bold', 'confident': 'confident', 'confidence': 'confident', 'confidently': 'confident', 'self-confident': 'confident', 'self-confidence': 'confident', 'aggressive': 'aggressive', 'aggression': 'aggressive', 'aggressor': 'aggressive', 'aggressively': 'aggressive', 'lively': 'lively', 'liveliness': 'lively', 'dominate': 'dominate', 'dominant': 'dominate', 'dominance': 'dominate', 'domination': 'dominate', 'submissive': 'submissive', 'submissively': 'submissive', 'submissiveness': 'submissive', 'submission': 'submissive', 'confide': 'confide', 'confidant': 'confide', 'confidante': 'confide', 'suspect': 'suspect', 'suspicion': 'suspect', 'suspicious': 'suspect', 'suspiciously': 'suspect', 'commit': 'commit', 'committed': 'commit', 'commitment': 'commit', 'nerve': 'nerve', 'nervous': 'nerve', 'nervously': 'nerve', 'nervousness': 'nerve', 'sure': 'sure', 'surely': 'sure', 'unsure': 'sure', 'ensure': 'sure', 'assure': 'sure', 'assurance': 'sure', 'critic': 'critic', 'critical': 'critic', 'critically': 'critic', 'criticism': 'critic', 'criticize': 'critic', 'critique': 'critic' };
        const families = {};
        this.data.words.forEach(word => {
            const root = familyRoots[word.word];
            if (root) {
                if (!families[root]) families[root] = [];
                families[root].push(word.id);
            }
            word.familyRoot = root || null;
        });
        this.data.wordFamilies = families;
    },

    parseAndStoreStructures() {
        this.data.structures = [];
        this.data.words.forEach(word => {
            if (word.structure) {
                const structures = word.structure.split(';').map(s => s.trim()).filter(Boolean);
                structures.forEach((struct, index) => {
                    const [phrase, translation] = struct.includes(':') ? struct.split(':') : [struct, ''];
                    const cleanPhrase = phrase.replace(/\s*\((v|n|adj|adv|be)\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
                    const wordsInStruct = cleanPhrase.split(' ');
                    let prepositionsInStruct = [];
                    wordsInStruct.forEach((word, idx) => {
                        const cleanWord = word.replace(/,$/, '');
                        if (this.data.allPrepositions.includes(cleanWord)) {
                            prepositionsInStruct.push({ word: cleanWord, index: idx });
                        }
                    });
                    if (prepositionsInStruct.length > 0) {
                        prepositionsInStruct.forEach((prep, prepIndex) => {
                            let questionParts = [...wordsInStruct];
                            questionParts[prep.index] = '____';
                            this.data.structures.push({ id: `s_${word.id}_${index}_p${prepIndex}`, rootWordId: word.id, question: questionParts.join(' '), answer: prep.word, fullStructure: phrase.trim(), translation: translation.trim(), isLearned: false, type: 'preposition' });
                        });
                    } else {
                        let keyword = null, keywordIndex = -1;
                        for(let i = 0; i < wordsInStruct.length; i++){
                            const currentWord = wordsInStruct[i].replace(/,$/, '');
                            if(!this.data.stopWords.includes(currentWord) && this.data.words.some(w => w.word === currentWord)){
                                keyword = currentWord;
                                keywordIndex = i;
                                break;
                            }
                        }
                        if(keywordIndex === -1 && wordsInStruct.length > 1) {
                            keywordIndex = 0;
                            keyword = wordsInStruct[0];
                        }
                        if (keyword) {
                            let questionParts = [...wordsInStruct];
                            questionParts[keywordIndex] = '____';
                            this.data.structures.push({ id: `s_${word.id}_${index}`, rootWordId: word.id, question: questionParts.join(' '), answer: keyword, fullStructure: phrase.trim(), translation: translation.trim(), isLearned: false, type: 'collocation' });
                        }
                    }
                });
            }
        });
    },

    updateProgress(itemId, isCorrect) {
        let item;
        if (typeof itemId === 'string' && itemId.startsWith('s_')) {
            item = this.data.structures.find(s => s.id === itemId);
        } else {
            item = this.data.words.find(w => w.id === itemId);
        }
        
        if (item) {
            if (isCorrect) {
                item.isLearned = true;
                this.data.skippedItems = this.data.skippedItems.filter(id => id !== item.id);
            } else {
                if (!this.data.skippedItems.includes(item.id)) {
                    this.data.skippedItems.push(item.id);
                }
            }
            this.saveData();
        }
    },

    renderDashboard() {
        setActiveNav('nav-dashboard');
        updateHeader('Dashboard', "Welcome back! Here's your learning progress.");
        const main = document.getElementById('main-content');
        const wordsLearned = this.data.words.filter(w => w.isLearned).length;
        const wordsNotLearned = this.data.words.length - wordsLearned;
        const structuresLearned = this.data.structures.filter(s => s.isLearned).length;
        const structuresNotLearned = this.data.structures.length - structuresLearned;
        main.innerHTML = `<div class="grid grid-cols-1 sm:grid-cols-2 gap-6 fade-in"><div id="words-learned-card" class="dashboard-stat-card glass-panel p-6 cursor-pointer"><p class="text-4xl font-bold text-green-800">${wordsLearned}</p><p class="text-green-800/80 mt-1">Words Learned</p></div><div id="words-not-learned-card" class="dashboard-stat-card glass-panel p-6 cursor-pointer"><p class="text-4xl font-bold text-red-800">${wordsNotLearned}</p><p class="text-red-800/80 mt-1">Words to Learn</p></div><div id="structures-learned-card" class="dashboard-stat-card glass-panel p-6 cursor-pointer"><p class="text-4xl font-bold text-blue-800">${structuresLearned}</p><p class="text-blue-800/80 mt-1">Structures Learned</p></div><div id="structures-not-learned-card" class="dashboard-stat-card glass-panel p-6 cursor-pointer"><p class="text-4xl font-bold text-yellow-800">${structuresNotLearned}</p><p class="text-yellow-800/80 mt-1">Structures to Learn</p></div></div>`;
        document.getElementById('words-learned-card').addEventListener('click', () => this.showFilteredList('learned-words'));
        document.getElementById('words-not-learned-card').addEventListener('click', () => this.showFilteredList('not-learned-words'));
        document.getElementById('structures-learned-card').addEventListener('click', () => this.showFilteredList('learned-structures'));
        document.getElementById('structures-not-learned-card').addEventListener('click', () => this.showFilteredList('not-learned-structures'));
        const allLearned = this.data.words.every(w => w.isLearned) && this.data.structures.every(s => s.isLearned);
        const lastTest = this.data.testHistory?.length > 0 ? this.data.testHistory[this.data.testHistory.length - 1] : null;
        if (allLearned && lastTest && lastTest.score >= 75) {
            main.innerHTML += `<div class="text-center mt-8"><button id="complete-module-btn" class="btn btn-main-action">🎉 Hoàn thành & Quay lại</button></div>`;
            document.getElementById('complete-module-btn').addEventListener('click', () => this.markModuleAsCompleted());
        }
    },

    renderStudyTypeSelection() {
        setActiveNav('nav-study');
        updateHeader('Study', "Choose what to study.");
        const main = document.getElementById('main-content');
        main.innerHTML = `<div class="fade-in"><div class="mb-4"><button id="back-to-dashboard-btn" class="btn btn-secondary"><i class="fas fa-arrow-left mr-2"></i> Back to Dashboard</button></div><div class="card glass-panel text-center"><h2 class="text-2xl font-bold text-slate-800 mb-6">What would you like to study?</h2><div class="flex flex-wrap justify-center gap-4"><button id="study-vocab-type-btn" class="btn btn-main-action"><i class="fas fa-book"></i> Vocabulary</button><button id="study-structure-type-btn" class="btn btn-main-action"><i class="fas fa-sitemap"></i> Structures</button></div></div></div>`;
        document.getElementById('back-to-dashboard-btn').addEventListener('click', () => this.renderDashboard());
        document.getElementById('study-vocab-type-btn').addEventListener('click', () => this.renderStudyModeSelection('vocab'));
        document.getElementById('study-structure-type-btn').addEventListener('click', () => this.renderStudyModeSelection('structure'));
    },

    renderStudyModeSelection(type) {
        const title = type === 'vocab' ? 'Vocabulary' : 'Structures';
        updateHeader('Study', `How would you like to study ${title}?`);
        const main = document.getElementById('main-content');
        main.innerHTML = `<div class="fade-in"><div class="mb-4"><button id="back-to-study-type-btn" class="btn btn-secondary"><i class="fas fa-arrow-left mr-2"></i> Back</button></div><div class="card glass-panel text-center"><h2 class="text-2xl font-bold text-slate-800 mb-6">Study Mode: ${title}</h2><div class="flex flex-wrap justify-center gap-4"><button id="study-flashcard-btn" class="btn btn-main-action"><i class="fas fa-clone"></i> Study with Flashcards</button><button id="study-list-btn" class="btn btn-secondary"><i class="fas fa-list"></i> View Full List</button></div></div></div>`;
        document.getElementById('back-to-study-type-btn').addEventListener('click', () => this.renderStudyTypeSelection());
        document.getElementById('study-flashcard-btn').addEventListener('click', () => this.startSession(type === 'vocab' ? 'flashcard-vocab' : 'flashcard-structure'));
        document.getElementById('study-list-btn').addEventListener('click', () => this.showFilteredList(type === 'vocab' ? 'all-words' : 'all-structures'));
    },
    
    renderPracticeModeSelection() {
        setActiveNav('nav-practice');
        updateHeader('Practice', 'Choose a category to practice.');
        const main = document.getElementById('main-content');
        main.innerHTML = `<div class="fade-in"><div class="mb-4"><button id="back-to-dashboard-btn" class="btn btn-secondary"><i class="fas fa-arrow-left mr-2"></i> Back to Dashboard</button></div><div class="card glass-panel text-center"><h2 class="text-2xl font-bold text-slate-800 mb-6">Practice Mode</h2><div class="flex flex-wrap justify-center gap-4"><button id="practice-vocab-btn" class="btn btn-main-action"><i class="fas fa-book"></i> Practice Vocabulary</button><button id="practice-structure-btn" class="btn btn-main-action"><i class="fas fa-sitemap"></i> Practice Structures</button></div></div></div>`;
        document.getElementById('back-to-dashboard-btn').addEventListener('click', () => this.renderDashboard());
        document.getElementById('practice-vocab-btn').addEventListener('click', () => this.startSession('vocab'));
        document.getElementById('practice-structure-btn').addEventListener('click', () => this.startSession('structure'));
    },

    startSession(mode) {
        this.data.mode = mode;
        let items;
        if (mode === 'vocab') items = this.data.words.filter(w => !w.isLearned);
        else if (mode === 'structure') items = this.data.structures.filter(s => !s.isLearned);
        else if (mode === 'flashcard-vocab') items = this.data.words;
        else if (mode === 'flashcard-structure') items = this.data.structures;
        if (!items || items.length === 0) {
            showCustomAlert("Congratulations! You have learned all items in this mode.");
            this.renderDashboard();
            return;
        }
        this.data.sessionItems = this.shuffleArray(items);
        this.data.currentSessionIndex = 0;
        this.data.practiceCounter = 0;
        this.renderNextInSession();
    },

    startTest(count) {
        setActiveNav('nav-test');
        updateHeader('Test', 'Good luck on your test!');
        this.data.mode = 'test';
        const allVocab = this.data.words.map(w => ({...w, itemType: 'vocab'}));
        const allStructures = this.data.structures.map(s => ({...s, itemType: 'structure'}));
        let allItems = [...allVocab, ...allStructures];
        this.data.sessionItems = (count > 0 && count < allItems.length) ? this.shuffleArray(allItems).slice(0, count) : this.shuffleArray(allItems);
        if (this.data.sessionItems.length === 0) {
            showCustomAlert("No items to test!");
            return;
        }
        this.data.incorrectTestAnswers = [];
        this.renderTestView();
    },

    renderNextInSession() {
        if (this.data.currentSessionIndex >= this.data.sessionItems.length && !this.data.mode.includes('flashcard')) {
            showCustomAlert("You have completed this practice round. Starting a new one!");
            this.startSession(this.data.mode);
            return;
        }
        this.data.practiceCounter++;
        let item;
        if (!this.data.mode.includes('flashcard') && this.data.practiceCounter % 6 === 0 && this.data.skippedItems.length > 0) {
            const skippedId = this.data.skippedItems.shift(); 
            item = this.data.words.find(w => w.id === skippedId) || this.data.structures.find(s => s.id === skippedId);
            this.data.skippedItems.push(skippedId); 
        } else {
            item = this.data.sessionItems[this.data.currentSessionIndex];
            this.data.currentSessionIndex++;
        }
        if (!item) { 
            this.renderNextInSession();
            return;
        }
        if(this.data.mode === 'vocab' && item.word){
            item.questionDirection = Math.random() > 0.5 ? 'eng_to_vie' : 'vie_to_eng';
        }
        if (this.data.mode === 'flashcard-vocab') { this.renderVocabFlashcard(item); return; }
        if (this.data.mode === 'flashcard-structure') { this.renderStructureFlashcard(item); return; }
        let questionType;
        if (this.data.mode === 'vocab') {
            const types = ['mcq', 'writing', 'family_match'];
            questionType = types[Math.floor(Math.random() * types.length)];
            if (questionType === 'mcq' && this.data.words.length < 4) questionType = 'writing';
            const unlearnedFamilies = Object.values(this.data.wordFamilies).filter(family => family.some(wordId => !this.data.words.find(w => w.id === wordId).isLearned));
            if (questionType === 'family_match' && unlearnedFamilies.length === 0) questionType = 'mcq';
        } else { 
            const types = ['structure_mcq', 'structure_writing', 'structure_tf'];
            questionType = types[Math.floor(Math.random() * types.length)];
        }
        switch(questionType) {
            case 'mcq': this.renderMCQ(item); break;
            case 'writing': this.renderWriting(item); break;
            case 'family_match': this.renderMultiColumnMatchingGame(); break;
            case 'structure_mcq': this.renderStructureMCQ(item); break;
            case 'structure_writing': this.renderStructureWriting(item); break;
            case 'structure_tf': this.renderStructureTF(item); break;
        }
    },
    
    renderVocabFlashcard(item) {
        const main = document.getElementById('main-content');
        updateHeader('Flashcards', `Word: ${item.word}`);
        main.innerHTML = `<div class="fade-in"><div class="flex justify-between items-center mb-4"><button id="back-btn" class="btn btn-secondary"><i class="fas fa-arrow-left mr-2"></i> Back</button><div class="text-lg font-semibold text-slate-800">${this.data.currentSessionIndex} / ${this.data.sessionItems.length}</div><button id="next-flashcard-btn" class="btn btn-main-action">Next <i class="fas fa-arrow-right"></i></button></div><div class="card glass-panel"><div class="flashcard-container"><div class="flashcard" id="flashcard"><div class="flashcard-face flashcard-front"><p class="text-4xl font-bold">${item.word}</p></div><div class="flashcard-face flashcard-back"><div><p class="text-2xl font-semibold">${item.meaning}</p><p class="text-lg text-slate-600 mt-2">${item.pronunciation} - (${item.type})</p></div></div></div></div></div></div>`;
        document.getElementById('back-btn').addEventListener('click', () => this.renderStudyModeSelection('vocab'));
        document.getElementById('flashcard').addEventListener('click', (e) => e.currentTarget.classList.toggle('is-flipped'));
        document.getElementById('next-flashcard-btn').addEventListener('click', () => {
            if (this.data.currentSessionIndex >= this.data.sessionItems.length) this.data.currentSessionIndex = 0;
            this.renderNextInSession();
        });
    },

    renderStructureFlashcard(item) {
        const main = document.getElementById('main-content');
        const rootWord = this.data.words.find(w => w.id === item.rootWordId);
        updateHeader('Flashcards', `Structure: ${rootWord.word}`);
        main.innerHTML = `<div class="fade-in"><div class="flex justify-between items-center mb-4"><button id="back-btn" class="btn btn-secondary"><i class="fas fa-arrow-left mr-2"></i> Back</button><div class="text-lg font-semibold text-slate-800">${this.data.currentSessionIndex} / ${this.data.sessionItems.length}</div><button id="next-flashcard-btn" class="btn btn-main-action">Next <i class="fas fa-arrow-right"></i></button></div><div class="card glass-panel"><div class="flashcard-container"><div class="flashcard" id="flashcard"><div class="flashcard-face flashcard-front"><p class="text-3xl font-bold text-center">${item.fullStructure}</p></div><div class="flashcard-face flashcard-back"><div><p class="text-2xl font-semibold text-center">${item.translation || rootWord.meaning}</p><p class="text-lg text-slate-600 mt-2 text-center">(from: ${rootWord.word} - ${rootWord.type})</p></div></div></div></div></div></div>`;
        document.getElementById('back-btn').addEventListener('click', () => this.renderStudyModeSelection('structure'));
        document.getElementById('flashcard').addEventListener('click', (e) => e.currentTarget.classList.toggle('is-flipped'));
        document.getElementById('next-flashcard-btn').addEventListener('click', () => {
            if (this.data.currentSessionIndex >= this.data.sessionItems.length) this.data.currentSessionIndex = 0;
            this.renderNextInSession();
        });
    },

    renderMCQ(item) {
        const isVieToEng = item.questionDirection === 'vie_to_eng';
        const correctAnswer = isVieToEng ? item.word : item.meaning;
        const wrongAnswers = this.findChallengingDistractors(item, 3, item.questionDirection);
        const options = this.shuffleArray([correctAnswer, ...wrongAnswers]);
        const questionHTML = `<div id="mcq-options" class="grid grid-cols-1 md:grid-cols-2 gap-4">${options.map(opt => `<button class="answer-option" data-answer="${opt}">${opt}</button>`).join('')}</div>`;
        document.getElementById('main-content').innerHTML = this.getSessionHTML(item, questionHTML);
        this.addSessionEventListeners(item, 'mcq');
    },

    renderWriting(item) {
        const isVieToEng = item.questionDirection === 'vie_to_eng';
        const placeholder = isVieToEng ? 'Enter the English word...' : 'Enter the Vietnamese meaning...';
        const questionHTML = `<form id="quiz-form"><input type="text" id="answer-input" class="w-full max-w-md mx-auto p-3 text-lg rounded-lg" placeholder="${placeholder}" autocomplete="off"><button type="submit" class="btn btn-main-action mt-6">Check</button></form><div id="feedback" class="mt-4 h-12"></div>`;
        document.getElementById('main-content').innerHTML = this.getSessionHTML(item, questionHTML);
        this.addSessionEventListeners(item, 'writing');
    },
    
    renderMultiColumnMatchingGame() {
        const unlearnedFamilies = Object.values(this.data.wordFamilies).filter(family => family.some(wordId => !this.data.words.find(w => w.id === wordId).isLearned));
        if(unlearnedFamilies.length === 0) {
            this.renderNextInSession(); 
            return;
        }
        const familyIds = unlearnedFamilies[Math.floor(Math.random() * unlearnedFamilies.length)];
        const familyWords = familyIds.map(id => this.data.words.find(w => w.id === id));
        const wordsCol = this.shuffleArray([...familyWords]);
        const typesCol = this.shuffleArray([...familyWords]);
        const pronunciationCol = this.shuffleArray([...familyWords]);
        const meaningsCol = this.shuffleArray([...familyWords]);
        const questionHTML = `<p class="text-lg font-semibold mb-4 text-slate-800">Nối từ với loại từ, phiên âm và nghĩa tương ứng.</p><div class="grid grid-cols-4 gap-2 md:gap-4 items-start text-xs md:text-sm"><div class="matching-column" id="col-word">${wordsCol.map(w => `<button class="answer-option w-full" data-id="${w.id}">${w.word}</button>`).join('')}</div><div class="matching-column" id="col-type">${typesCol.map(w => `<button class="answer-option w-full" data-id="${w.id}">${w.type}</button>`).join('')}</div><div class="matching-column" id="col-pronunciation">${pronunciationCol.map(w => `<button class="answer-option w-full" data-id="${w.id}">${w.pronunciation || 'N/A'}</button>`).join('')}</div><div class="matching-column" id="col-meaning">${meaningsCol.map(w => `<button class="answer-option w-full" data-id="${w.id}">${w.meaning}</button>`).join('')}</div></div>`;
        document.getElementById('main-content').innerHTML = this.getSessionHTML({word: `Word Family Practice`}, questionHTML);
        this.addSessionEventListeners(familyWords, 'family_match');
    },

    renderStructureMCQ(item) {
        const correctAnswer = item.answer;
        let wrongAnswers;
        if (item.type === 'preposition') {
            wrongAnswers = this.shuffleArray(this.data.allPrepositions.filter(p => p !== correctAnswer)).slice(0, 8);
        } else {
            const keywordItem = this.data.words.find(w => w.word === correctAnswer);
            if(keywordItem){
                wrongAnswers = this.findChallengingDistractors(keywordItem, 8, 'vie_to_eng');
            } else {
                wrongAnswers = this.shuffleArray(this.data.backupData.verb.action.filter(v => v !== correctAnswer)).slice(0, 8);
            }
        }
        const options = this.shuffleArray([correctAnswer, ...wrongAnswers]);
        const questionHTML = `<div id="mcq-options" class="grid grid-cols-2 md:grid-cols-3 gap-4">${options.map(opt => `<button class="answer-option" data-answer="${opt}">${opt}</button>`).join('')}</div>`;
        document.getElementById('main-content').innerHTML = this.getSessionHTML(item, questionHTML, true);
        this.addSessionEventListeners(item, 'structure_mcq');
    },

    renderStructureWriting(item) {
        const questionHTML = `<form id="quiz-form"><input type="text" id="answer-input" class="w-full max-w-md mx-auto p-3 text-lg rounded-lg" placeholder="Enter the correct word..." autocomplete="off"><button type="submit" class="btn btn-main-action mt-6">Check</button></form><div id="feedback" class="mt-4 h-12"></div>`;
        document.getElementById('main-content').innerHTML = this.getSessionHTML(item, questionHTML, true);
        this.addSessionEventListeners(item, 'structure_writing');
    },

    renderStructureTF(item) {
        const isCorrectPairing = Math.random() > 0.5;
        let displayedStructure;
        if (isCorrectPairing) {
            displayedStructure = item.fullStructure;
        } else {
            let wrongWord;
            if (item.type === 'preposition') {
                wrongWord = this.shuffleArray(this.data.allPrepositions.filter(p => p !== item.answer))[0] || 'word';
            } else {
                const keywordItem = this.data.words.find(w => w.word === item.answer);
                if(keywordItem){
                    const distractors = this.findChallengingDistractors(keywordItem, 1, 'vie_to_eng');
                    wrongWord = distractors.length > 0 ? distractors[0] : 'another';
                } else {
                    wrongWord = 'another';
                }
            }
            displayedStructure = item.question.replace('____', wrongWord);
        }
        const questionHTML = `<p class="text-2xl p-4 bg-slate-100/50 rounded-md mb-4">${displayedStructure}</p><div class="flex justify-center gap-4" data-correct-pairing="${isCorrectPairing}"><button class="answer-option w-32" data-answer="true">True</button><button class="answer-option w-32" data-answer="false">False</button></div>`;
        document.getElementById('main-content').innerHTML = this.getSessionHTML(item, questionHTML, true);
        this.addSessionEventListeners(item, 'structure_tf');
    },

    handleAnswer(item, isCorrect) {
        this.updateProgress(item.id, isCorrect);
        setTimeout(() => {
            this.renderNextInSession();
        }, isCorrect ? 1200 : 2500);
    },
    
    getSessionHTML(item, questionHTML, isStructure = false) {
        let title, subtitle;
        if (isStructure) {
            title = item.question;
            updateHeader('Practice', 'Fill in the blank');
            subtitle = `<p class="text-slate-600 mb-4">(Meaning: ${item.translation})</p>`;
        } else {
            const isVieToEng = item.questionDirection === 'vie_to_eng';
            title = isVieToEng ? item.meaning : item.word;
            updateHeader('Practice', isVieToEng ? 'What is the English word?' : 'What is the Vietnamese meaning?');
            subtitle = isVieToEng ? `<p class="inline-block mt-1 mb-8 px-3 py-1 bg-slate-200/70 text-slate-700 rounded-full text-sm">${item.type}</p>` : `<p class="text-slate-600 mb-1">${item.pronunciation}</p><p class="inline-block mt-1 mb-8 px-3 py-1 bg-slate-200/70 text-slate-700 rounded-full text-sm">${item.type}</p>`;
        }
        return `<div class="fade-in"><div class="flex justify-between items-center mb-4"><button id="back-btn" class="btn btn-secondary"><i class="fas fa-arrow-left mr-2"></i> Back</button><button id="idk-btn" class="btn btn-secondary">I don't know</button></div><div class="card glass-panel text-center">${subtitle}<h2 class="text-4xl font-bold text-violet-800 mb-6">${title}</h2>${questionHTML}</div></div>`;
    },
    
    addSessionEventListeners(item, type) {
        const backBtn = document.getElementById('back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                if (this.data.mode === 'vocab' || this.data.mode === 'structure') {
                    this.renderPracticeModeSelection();
                }
            });
        }
        const idkBtn = document.getElementById('idk-btn');
        if (idkBtn) {
            idkBtn.addEventListener('click', () => {
                document.querySelectorAll('.answer-option, #quiz-form button, #quiz-form input').forEach(el => el.disabled = true);
                if (type.includes('mcq') || type === 'structure_tf') {
                    document.querySelectorAll('.answer-option').forEach(btn => {
                        let isCorrectButton = false;
                        if (type === 'structure_tf') {
                            isCorrectButton = (btn.parentElement.dataset.correctPairing === btn.dataset.answer);
                        } else {
                            const correctAnswer = item.questionDirection === 'vie_to_eng' ? item.word : item.meaning;
                            isCorrectButton = (btn.dataset.answer === correctAnswer);
                        }
                        if (isCorrectButton) {
                            btn.classList.add('correct');
                        }
                    });
                } else if (type.includes('writing')) {
                    const feedback = document.querySelector('#feedback');
                    const correctAnswer = (type.includes('structure') || item.questionDirection === 'vie_to_eng') ? item.answer || item.word : item.meaning;
                    feedback.innerHTML = `<p class="text-blue-600 font-bold text-lg">Correct answer: <span class="underline">${correctAnswer}</span></p>`;
                }
                this.handleAnswer(item, false);
            });
        }
        if (type === 'mcq' || type === 'structure_mcq' || type === 'structure_tf') {
            document.querySelectorAll('.answer-option').forEach(button => button.addEventListener('click', e => {
                const selectedButton = e.currentTarget;
                if(selectedButton.disabled) return;
                document.querySelectorAll('.answer-option').forEach(btn => btn.disabled = true);
                selectedButton.classList.add('selected');
                let correctAnswer;
                if(type === 'structure_tf') { correctAnswer = (selectedButton.parentElement.dataset.correctPairing === 'true').toString(); }
                else if (type.includes('structure')) { correctAnswer = item.answer; }
                else { correctAnswer = item.questionDirection === 'vie_to_eng' ? item.word : item.meaning; }
                const isCorrect = selectedButton.dataset.answer.toLowerCase() === correctAnswer.toLowerCase();
                setTimeout(() => {
                    selectedButton.classList.remove('selected');
                    if (isCorrect) {
                        selectedButton.classList.add('correct');
                        this.handleAnswer(item, true);
                    } else {
                        selectedButton.classList.add('incorrect');
                        const correctButton = document.querySelector(`.answer-option[data-answer="${correctAnswer}"]`);
                        if (correctButton) correctButton.classList.add('correct');
                        this.handleAnswer(item, false);
                    }
                }, 400);
            }));
        } else if (type === 'writing' || type === 'structure_writing') {
            document.getElementById('quiz-form').addEventListener('submit', e => {
                e.preventDefault();
                const form = e.target;
                const feedback = form.nextElementSibling;
                const input = form.querySelector('#answer-input');
                const userAnswer = input.value.trim().toLowerCase();
                if (!userAnswer) return;
                const correctAnswer = (type.includes('structure') ? item.answer : (item.questionDirection === 'vie_to_eng' ? item.word : item.meaning)).toLowerCase();
                const correctWords = correctAnswer.replace(/,/g, ' ').split(' ').filter(Boolean);
                const isCorrect = correctWords.some(cw => userAnswer.includes(cw));
                form.querySelector('button').disabled = true;
                input.disabled = true;
                if (isCorrect) {
                    feedback.innerHTML = `<p class="text-green-600 font-bold text-lg">Correct!</p>`;
                    if (userAnswer !== correctAnswer) {
                        feedback.innerHTML += `<p class="text-sm text-slate-600">Full answer: ${correctAnswer}</p>`;
                    }
                    this.handleAnswer(item, true);
                } else {
                    feedback.innerHTML = `<p class="text-red-600 font-bold text-lg">Incorrect! The correct answer is: <span class="underline">${correctAnswer}</span></p>`;
                    this.handleAnswer(item, false);
                }
            });
        } else if (type === 'family_match') {
            let selected = { word: null, type: null, pronunciation: null, meaning: null };
            let correctCount = 0;
            const familyWords = item;
            document.querySelectorAll('.matching-column button').forEach(button => {
                button.addEventListener('click', e => {
                    const target = e.currentTarget;
                    if (target.disabled) return;
                    const column = target.parentElement.id.split('-')[1];
                    if (selected[column]) { selected[column].classList.remove('selected'); }
                    selected[column] = target;
                    target.classList.add('selected');
                    if (selected.word && selected.type && selected.pronunciation && selected.meaning) {
                        const correctWordObject = familyWords.find(w => w.id == selected.word.dataset.id);
                        const isCorrect = correctWordObject.type === selected.type.textContent && correctWordObject.pronunciation === selected.pronunciation.textContent && correctWordObject.meaning === selected.meaning.textContent;
                        const currentSelection = { ...selected };
                        selected = { word: null, type: null, pronunciation: null, meaning: null };
                        if (isCorrect) {
                            Object.values(currentSelection).forEach(btn => {
                                btn.classList.remove('selected');
                                btn.classList.add('correct');
                                btn.disabled = true;
                            });
                            correctCount++;
                            if (correctCount === familyWords.length) {
                                familyWords.forEach(wordInFamily => this.updateProgress(wordInFamily.id, true));
                                this.handleAnswer(familyWords[0], true); 
                            }
                        } else {
                            const incorrectButtons = Object.values(currentSelection);
                            incorrectButtons.forEach(btn => btn.classList.add('incorrect'));
                            setTimeout(() => {
                                incorrectButtons.forEach(btn => btn.classList.remove('incorrect', 'selected'));
                            }, 1000);
                        }
                    }
                });
            });
        }
    },
    
    renderTestView() {
        const main = document.getElementById('main-content');
        let testHTML = '';
        let totalTime = 0;
        const questionTypes = ['mcq', 'writing', 'tf']; 
        this.data.sessionItems.forEach((item) => {
            let questionRender, questionType, direction = 'eng_to_vie'; 
            if (item.itemType === 'vocab') {
                questionType = questionTypes[Math.floor(Math.random() * questionTypes.length)];
                direction = Math.random() > 0.5 ? 'eng_to_vie' : 'vie_to_eng';
                switch(questionType) {
                    case 'mcq': questionRender = this.getTestMCQ_HTML(item, direction); totalTime += 6; break;
                    case 'writing': questionRender = this.getTestWriting_HTML(item, direction); totalTime += 15; break;
                    case 'tf': questionRender = this.getTestTF_HTML(item, direction); totalTime += 5; break;
                    default: questionRender = this.getTestMCQ_HTML(item, direction); totalTime += 6;
                }
            } else { 
                questionType = 'structure_mcq';
                questionRender = this.getTestStructureMCQ_HTML(item); totalTime += 8;
            }
            testHTML += `<div class="card glass-panel mb-4" data-item-id="${item.id}" data-item-type="${item.itemType}" data-question-type="${questionType}" data-direction="${direction}">${questionRender}</div>`;
        });
        main.innerHTML = `<div id="test-header" class="card glass-panel mb-4 sticky top-0 z-20"><div class="flex justify-between items-center"><button id="exit-test-btn" class="btn btn-secondary bg-red-100/80 text-red-700 border-red-200/80 hover:bg-red-200/80"><i class="fas fa-times mr-2"></i> Thoát</button><div id="test-timer" class="text-center text-2xl font-bold text-red-600 p-2 rounded-lg"></div><div class="w-24 hidden sm:block"></div></div></div><div id="test-container">${testHTML}</div><div class="text-center mt-6"><button id="submit-test-btn" class="btn btn-main-action btn-lg">Nộp bài</button></div>`;
        this.startTestTimer(totalTime);
        document.getElementById('submit-test-btn').addEventListener('click', () => this.submitTest());
        document.getElementById('exit-test-btn').addEventListener('click', () => {
            this.showCustomConfirm("Bạn có chắc chắn muốn thoát? Tiến trình sẽ không được lưu.", () => { clearInterval(this.testTimer); this.renderDashboard(); }, 'Thoát', 'Ở lại');
        });
        document.querySelectorAll('#test-container .answer-option').forEach(option => {
            option.addEventListener('click', (e) => {
                const currentOption = e.currentTarget;
                const questionCard = currentOption.closest('.card');
                if (questionCard) {
                    questionCard.querySelectorAll('.answer-option').forEach(opt => opt.classList.remove('selected'));
                    currentOption.classList.add('selected');
                }
            });
        });
    },

    getTestMCQ_HTML(item, direction) {
        const isVieToEng = direction === 'vie_to_eng';
        const questionText = isVieToEng ? item.meaning : item.word;
        const correctAnswer = isVieToEng ? item.word : item.meaning;
        const wrongAnswers = this.findChallengingDistractors(item, 3, direction);
        const options = this.shuffleArray([correctAnswer, ...wrongAnswers]);
        return `<p class="font-bold text-lg mb-4 text-slate-800">${questionText} <span class="text-slate-600 font-normal">(${item.type})</span></p><div class="grid grid-cols-1 md:grid-cols-2 gap-3">${options.map(opt => `<div role="button" class="answer-option" data-value="${opt}">${opt}</div>`).join('')}</div>`;
    },

    getTestStructureMCQ_HTML(item) {
        const correctAnswer = item.answer;
        const wrongAnswers = this.shuffleArray(this.data.allPrepositions.filter(p => p !== correctAnswer)).slice(0, 3);
        const options = this.shuffleArray([correctAnswer, ...wrongAnswers]);
        return `<p class="text-slate-600 mb-2">(Meaning: ${item.translation})</p><p class="font-bold text-lg mb-4 text-slate-800">${item.question}</p><div class="grid grid-cols-1 md:grid-cols-2 gap-3">${options.map(opt => `<div role="button" class="answer-option" data-value="${opt}">${opt}</div>`).join('')}</div>`;
    },

    getTestWriting_HTML(item, direction) {
        const isVieToEng = direction === 'vie_to_eng';
        const questionText = isVieToEng ? item.meaning : item.word;
        const placeholder = isVieToEng ? "Enter the English word..." : "Enter the Vietnamese meaning...";
        return `<p class="font-bold text-lg mb-2 text-slate-800">${questionText} <span class="text-slate-600 font-normal">(${item.type})</span></p><input type="text" class="w-full p-2 rounded-lg" placeholder="${placeholder}">`;
    },

    getTestTF_HTML(item, direction) {
        const isVieToEng = direction === 'vie_to_eng';
        const questionText = isVieToEng ? item.meaning : item.word;
        const isCorrectPairing = Math.random() > 0.5;
        let displayedAnswer;
        if(isCorrectPairing){
            displayedAnswer = isVieToEng ? item.word : item.meaning;
        } else {
            const distractors = this.findChallengingDistractors(item, 1, direction);
            displayedAnswer = distractors.length > 0 ? distractors[0] : 'a different word';
        }
        return `<p class="font-bold text-lg mb-2 text-slate-800">${questionText} <span class="text-slate-600 font-normal">(${item.type})</span></p><p class="text-xl p-2 bg-slate-100/50 rounded-md mb-3">Is: "${displayedAnswer}"</p><div class="flex justify-center gap-4" data-correct-pairing="${isCorrectPairing}"><div role="button" class="answer-option w-32" data-value="true">True</div><div role="button" class="answer-option w-32" data-value="false">False</div></div>`;
    },

    startTestTimer(duration) {
        const timerEl = document.getElementById('test-timer');
        let timer = duration;
        if (this.testTimer) clearInterval(this.testTimer);
        this.testTimer = setInterval(() => {
            const minutes = String(Math.floor(timer / 60)).padStart(2, '0');
            const seconds = String(timer % 60).padStart(2, '0');
            timerEl.textContent = `${minutes}:${seconds}`;
            if (--timer < 0) {
                clearInterval(this.testTimer);
                showCustomAlert('Time is up!');
                this.submitTest();
            }
        }, 1000);
    },

    submitTest() {
        clearInterval(this.testTimer);
        this.testTimer = null;
        let correctCount = 0;
        this.data.incorrectTestAnswers = [];
        const questions = document.querySelectorAll('#test-container .card');
        
        questions.forEach(q => {
            q.style.pointerEvents = 'none';
            const id = q.dataset.itemId;
            const itemType = q.dataset.itemType;
            const questionType = q.dataset.questionType;
            const direction = q.dataset.direction;
            let item = itemType === 'vocab' ? this.data.words.find(w => String(w.id) === id) : this.data.structures.find(s => s.id === id);
            if (!item) return;
            let userAnswer, isCorrect = false;
            if (questionType === 'writing') {
                const input = q.querySelector('input');
                userAnswer = input.value.trim().toLowerCase();
                const correctAnswer = (direction === 'vie_to_eng' ? item.word : item.meaning).toLowerCase();
                const correctWords = correctAnswer.replace(/,/g, ' ').split(' ').filter(Boolean);
                isCorrect = correctWords.some(cw => userAnswer.includes(cw));
                if(isCorrect) input.classList.add('border-2', 'border-green-500', 'bg-green-50');
                else {
                    input.classList.add('border-2', 'border-red-500', 'bg-red-50');
                    const correctAnswerEl = document.createElement('p');
                    correctAnswerEl.className = 'text-sm text-green-700 mt-2 text-left';
                    correctAnswerEl.textContent = `Đáp án đúng: ${correctAnswer}`;
                    input.parentElement.appendChild(correctAnswerEl);
                }
            } else {
                const selectedOption = q.querySelector('.answer-option.selected');
                let correctAnswer;
                if (questionType === 'tf') { correctAnswer = q.querySelector('[data-correct-pairing]').dataset.correctPairing; }
                else if (itemType === 'structure') { correctAnswer = item.answer; }
                else { correctAnswer = direction === 'vie_to_eng' ? item.word : item.meaning; }
                if (selectedOption) {
                    userAnswer = selectedOption.dataset.value;
                    isCorrect = userAnswer.toLowerCase() === String(correctAnswer).toLowerCase();
                } else {
                    userAnswer = '(Không trả lời)';
                    isCorrect = false;
                }
                q.querySelectorAll('.answer-option').forEach(opt => {
                    if (String(opt.dataset.value).toLowerCase() === String(correctAnswer).toLowerCase()) {
                        opt.classList.add('correct');
                    }
                });
                if (selectedOption && !isCorrect) { selectedOption.classList.add('incorrect'); }
                if (selectedOption) { selectedOption.classList.remove('selected'); }
            }
            if (isCorrect) { correctCount++; }
            else { this.data.incorrectTestAnswers.push({item, userAnswer, itemType, direction}); }
        });

        const score = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;
        this.data.testHistory.push({
            correct: correctCount,
            total: questions.length,
            score: score,
            timestamp: firestore.Timestamp.now()
        });
        this.saveData();
        this.renderTestEnd(correctCount, questions.length);
    },

    renderTestEnd(correct, total) {
        const main = document.getElementById('main-content');
        const percentage = total > 0 ? ((correct / total) * 100).toFixed(1) : 0;
        updateHeader('Test Complete!', `Your score: ${percentage}%`);
        main.innerHTML = `<div class="card glass-panel text-center fade-in"><i class="fas fa-trophy text-6xl text-yellow-400 mb-4"></i><h2 class="text-3xl font-bold text-slate-800">Test Complete!</h2><p class="text-slate-600 mt-2 mb-6">Your result:</p><p class="text-5xl font-bold text-violet-700">${correct} / ${total}</p><p class="text-2xl font-semibold text-slate-700 mt-2">(${percentage}%)</p><div class="flex flex-wrap justify-center gap-4 mt-8"><button id="review-incorrect-btn" class="btn btn-secondary">Review Incorrect</button><button id="back-to-dash-btn" class="btn btn-main-action">Back to Dashboard</button></div></div>`;
        document.getElementById('back-to-dash-btn').addEventListener('click', () => this.renderDashboard());
        const reviewBtn = document.getElementById('review-incorrect-btn');
        if (this.data.incorrectTestAnswers.length > 0) {
            reviewBtn.addEventListener('click', () => this.renderReviewView());
        } else {
            reviewBtn.style.display = 'none';
        }
    },
    
    renderReviewView() {
        const main = document.getElementById('main-content');
        updateHeader('Review', 'Check your incorrect answers.');
        let reviewHTML = `<div class="flex justify-between items-center mb-4"><h2 class="text-2xl font-bold text-slate-800">Incorrect Answers</h2><button id="back-to-dash-btn" class="btn btn-secondary">Back to Dashboard</button></div>`;
        this.data.incorrectTestAnswers.forEach(({item, userAnswer, itemType, direction}) => {
            let questionText, correctAnswerText;
            if(itemType === 'structure'){
                questionText = item.fullStructure;
                correctAnswerText = item.answer;
            } else {
                questionText = direction === 'vie_to_eng' ? item.meaning : item.word;
                correctAnswerText = direction === 'vie_to_eng' ? item.word : item.meaning;
            }
            reviewHTML += `<div class="card glass-panel mb-4 bg-red-400/10 border-l-4 border-red-500 fade-in"><p class="font-bold text-slate-800">${questionText || 'Error: Question not found'}</p><p class="text-sm text-slate-600">Your answer: <span class="font-semibold text-red-800">${userAnswer || '<i>(empty)</i>'}</span></p><p class="text-sm text-slate-600">Correct answer: <span class="font-semibold text-green-800">${correctAnswerText}</span></p></div>`;
        });
        main.innerHTML = reviewHTML;
        document.getElementById('back-to-dash-btn').addEventListener('click', () => this.renderDashboard());
    },

    findChallengingDistractors(correctItem, count = 3, questionDirection = 'eng_to_vie') {
        let distractors = new Set();
        const isVieToEng = questionDirection === 'vie_to_eng';
        const correctItemType = correctItem.type.split('/')[0]; 

        if (correctItem.familyRoot) {
            const familyIds = this.data.wordFamilies[correctItem.familyRoot];
            const familyWords = familyIds.map(id => this.data.words.find(w => w.id === id));
            familyWords.forEach(word => {
                if (word.id !== correctItem.id && word.type.includes(correctItemType)) {
                    distractors.add(isVieToEng ? word.word : word.meaning);
                }
            });
        }

        if (distractors.size >= count) {
            return this.shuffleArray([...distractors]).slice(0, count);
        }

        this.data.words.forEach(word => {
            if (distractors.size < count && word.id !== correctItem.id && word.type.includes(correctItemType)) {
                const hasCommonTag = word.tags.some(tag => correctItem.tags.includes(tag) && tag !== 'general');
                if (hasCommonTag) {
                    distractors.add(isVieToEng ? word.word : word.meaning);
                }
            }
        });

        if (distractors.size >= count) {
            return this.shuffleArray([...distractors]).slice(0, count);
        }

        if (isVieToEng) {
            const backupType = this.data.backupData[correctItemType];
            if(backupType){
                const tagToTry = correctItem.tags.find(t => t !== 'general') || 'general';
                const category = backupType[tagToTry] || backupType['general'];
                if(category){
                    this.shuffleArray([...category]).forEach(word => {
                        if (distractors.size < count && word.toLowerCase() !== correctItem.word.toLowerCase()) {
                            distractors.add(word); 
                        }
                    });
                }
            }
        }
        
         this.data.words.forEach(word => {
            if (distractors.size < count && word.id !== correctItem.id && word.type.includes(correctItemType)) {
                distractors.add(isVieToEng ? word.word : word.meaning);
            }
        });


        return this.shuffleArray([...distractors]).slice(0, count);
    },
    
    async markModuleAsCompleted() {
        const learnedWords = this.data.words.filter(w => w.isLearned).length;
        const totalWords = this.data.words.length;
        const learnedStructures = this.data.structures.filter(s => s.isLearned).length;
        const totalStructures = this.data.structures.length;
        const lastTest = this.data.testHistory?.length > 0 ? this.data.testHistory[this.data.testHistory.length - 1] : null;

        if (learnedWords === totalWords && learnedStructures === totalStructures && lastTest && lastTest.score >= 75) {
            await this.saveData();
            window.location.href = `assignment.html?id=${this.data.assignmentId}`;
        } else {
            showCustomAlert("Bạn cần học 100% từ vựng, cấu trúc và đạt trên 75% ở bài test gần nhất để hoàn thành.");
        }
    },

    showFilteredList(listType) {
        const tableContainer = document.getElementById('word-table');
        const modalTitle = document.getElementById('modal-title');
        let itemsToShow;
        let headers;

        if (listType === 'all-words') {
            itemsToShow = this.data.words;
            modalTitle.textContent = 'Full Word List';
            headers = `<thead><tr class="text-xs text-slate-800 uppercase"><th scope="col" class="px-6 py-3">Word</th><th scope="col" class="px-6 py-3">Type</th><th scope="col" class="px-6 py-3">Meaning</th></tr></thead>`;
            tableContainer.innerHTML = headers + `<tbody>${itemsToShow.map(item => `<tr class="border-b border-slate-200/50"><td class="px-6 py-4 font-medium text-slate-900">${item.word}</td><td class="px-6 py-4">${item.type}</td><td class="px-6 py-4">${item.meaning}</td></tr>`).join('')}</tbody>`;
        } else if (listType === 'all-structures') {
             itemsToShow = this.data.structures;
                 modalTitle.textContent = 'Full Structure List';
                 headers = `<thead><tr class="text-xs text-slate-800 uppercase"><th scope="col" class="px-6 py-3">Structure</th><th scope="col" class="px-6 py-3">Meaning</th></tr></thead>`;
            tableContainer.innerHTML = headers + `<tbody>${itemsToShow.map(item => `<tr class="border-b border-slate-200/50"><td class="px-6 py-4 font-medium text-slate-900">${item.fullStructure}</td><td class="px-6 py-4">${item.translation}</td></tr>`).join('')}</tbody>`;
        }
        else if (listType.includes('structures')) {
            const learned = listType === 'learned-structures';
            itemsToShow = this.data.structures.filter(s => learned ? s.isLearned : !s.isLearned);
            modalTitle.textContent = learned ? 'Learned Structures' : 'Unlearned Structures';
            headers = `<thead><tr class="text-xs text-slate-800 uppercase"><th scope="col" class="px-6 py-3">Structure</th><th scope="col" class="px-6 py-3">Meaning</th></tr></thead>`;
            tableContainer.innerHTML = headers + `<tbody>${itemsToShow.map(item => `<tr class="border-b border-slate-200/50"><td class="px-6 py-4 font-medium text-slate-900">${item.fullStructure}</td><td class="px-6 py-4">${item.translation}</td></tr>`).join('')}</tbody>`;
        } else { 
            const learned = listType === 'learned-words';
            itemsToShow = this.data.words.filter(w => learned ? w.isLearned : !w.isLearned);
            modalTitle.textContent = learned ? 'Learned Words' : 'Unlearned Words';
            headers = `<thead><tr class="text-xs text-slate-800 uppercase"><th scope="col" class="px-6 py-3">Word</th><th scope="col" class="px-6 py-3">Type</th><th scope="col" class="px-6 py-3">Meaning</th></tr></thead>`;
            tableContainer.innerHTML = headers + `<tbody>${itemsToShow.map(item => `<tr class="border-b border-slate-200/50"><td class="px-6 py-4 font-medium text-slate-900">${item.word}</td><td class="px-6 py-4">${item.type}</td><td class="px-6 py-4">${item.meaning}</td></tr>`).join('')}</tbody>`;
        }
        
        openModal('word-list-modal');
    },

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
};
