document.addEventListener('DOMContentLoaded', () => {
    // --- Constants & Config --- //
    const MAX_ROWS = 5;
    const WORD_LENGTH = 5;
    const FLIP_DELAY_MS = 250;

    // valid words array comes from wordlist.js => `WORDS` variable
    const validWords = new Set(typeof WORDS !== 'undefined' ? WORDS : ["apple", "beatl", "music"]);

    // --- State --- //
    let targetPhrase = "";
    let targetLetters = new Set(); // Letters in the phrase (a-z)

    let currentRow = 0;
    let currentCol = 0;
    let guesses = Array.from({ length: MAX_ROWS }, () => Array(WORD_LENGTH).fill(''));
    let revealedLetters = new Set();

    let gameStatus = 'IN_PROGRESS'; // 'WIN', 'LOSE', 'IN_PROGRESS'
    let emojiGrid = [];

    // --- DOM Elements --- //
    const wordleGridEl = document.getElementById('wordle-grid');
    const phraseGridEl = document.getElementById('phrase-grid');
    const keyboardEl = document.getElementById('keyboard');
    const messageEl = document.getElementById('game-message');
    const toastEl = document.getElementById('toast-message');

    const helpBtn = document.getElementById('help-btn');
    const statsBtn = document.getElementById('stats-btn');
    const helpModal = document.getElementById('help-modal');
    const statsModal = document.getElementById('stats-modal');
    const closeBtns = document.querySelectorAll('.close-btn');
    const shareBtn = document.getElementById('share-btn');

    // --- Initialization --- //
    initGame();

    function getDailyPhrase() {
        if (typeof PHRASES !== 'undefined' && PHRASES.length > 0) {
            const epoch = new Date('2024-01-01T00:00:00');
            const todayLocal = new Date();
            todayLocal.setHours(0, 0, 0, 0);
            // Calculate days since epoch
            const diffTime = todayLocal - epoch;
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            // Index safely into PHRASES
            const index = Math.max(0, diffDays) % PHRASES.length;
            return PHRASES[index];
        }
        return "All you need is love";
    }

    async function initGame() {
        // FTUE Check
        if (!localStorage.getItem('hasSeenHelp')) {
            helpModal.classList.remove('hidden');
            localStorage.setItem('hasSeenHelp', 'true');
        }

        // Load daily target phrase
        targetPhrase = getDailyPhrase();

        let rawPhrase = targetPhrase.toLowerCase();
        for (let char of rawPhrase) {
            if (/[a-z]/.test(char)) {
                targetLetters.add(char);
            }
        }

        createWordleGrid();
        createPhraseGrid();
        setupEventListeners();

        // Check if already played today
        const todayStr = new Date().toDateString();
        const lastPlayed = localStorage.getItem('fabFourdleLastPlayed');
        if (lastPlayed === todayStr) {
            gameStatus = 'DONE';
            setTimeout(() => {
                showMessage("You've already played today!");
                setTimeout(showStats, 2000);
            }, 500);
        }
    }


    // --- UI Generation --- //
    function createWordleGrid() {
        wordleGridEl.innerHTML = '';
        for (let r = 0; r < MAX_ROWS; r++) {
            for (let c = 0; c < WORD_LENGTH; c++) {
                const tile = document.createElement('div');
                tile.classList.add('tile');
                tile.id = `tile-${r}-${c}`;
                wordleGridEl.appendChild(tile);
            }
        }
    }

    function createPhraseGrid() {
        phraseGridEl.innerHTML = '';
        const words = targetPhrase.split(' ');

        words.forEach(word => {
            const wordContainer = document.createElement('div');
            wordContainer.classList.add('phrase-word');

            for (let char of word) {
                const charLower = char.toLowerCase();
                const tile = document.createElement('div');

                if (/[a-z]/.test(charLower)) {
                    tile.classList.add('phrase-tile', `letter-${charLower}`);
                    tile.textContent = char;
                } else {
                    // Punctuation
                    tile.classList.add('phrase-tile', 'punctuation');
                    tile.textContent = char;
                }

                wordContainer.appendChild(tile);
            }
            phraseGridEl.appendChild(wordContainer);
        });
    }

    // --- Interactions --- //
    function setupEventListeners() {
        // Physical Keyboard
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            const key = e.key.toLowerCase();
            if (key === 'enter') handleEnter();
            else if (key === 'backspace') handleBackspace();
            else if (/^[a-zñ]$/.test(key)) handleLetter(key);
        });

        // Virtual Keyboard
        keyboardEl.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;

            const key = btn.dataset.key;
            if (key === 'enter') handleEnter();
            else if (key === 'backspace') handleBackspace();
            else handleLetter(key);

            // remove focus from button to prevent spacebar triggering it
            btn.blur();
        });

        // Modals
        helpBtn.addEventListener('click', () => helpModal.classList.remove('hidden'));
        statsBtn.addEventListener('click', showStats);

        closeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal').classList.add('hidden');
            });
        });

        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.classList.add('hidden');
            }
        });

        shareBtn.addEventListener('click', shareResult);
    }

    function handleLetter(letter) {
        if (gameStatus !== 'IN_PROGRESS' || currentCol >= WORD_LENGTH) return;

        guesses[currentRow][currentCol] = letter;
        const tile = document.getElementById(`tile-${currentRow}-${currentCol}`);
        tile.textContent = letter;
        tile.classList.add('filled', 'active');

        setTimeout(() => tile.classList.remove('active'), 150);
        currentCol++;
    }

    function handleBackspace() {
        if (gameStatus !== 'IN_PROGRESS' || currentCol === 0) return;

        currentCol--;
        guesses[currentRow][currentCol] = '';
        const tile = document.getElementById(`tile-${currentRow}-${currentCol}`);
        tile.textContent = '';
        tile.classList.remove('filled', 'active');
    }

    function handleEnter() {
        if (gameStatus !== 'IN_PROGRESS') return;

        if (currentCol < WORD_LENGTH) {
            shakeRow(currentRow);
            showMessage("Not enough letters");
            return;
        }

        const word = guesses[currentRow].join('');
        if (!validWords.has(word)) {
            shakeRow(currentRow);
            showMessage("Not in word list");
            return;
        }

        evaluateGuess(word);
    }

    // --- Logic --- //
    function evaluateGuess(word) {
        let isWin = false;
        let emojiLine = "";

        // We will flip letters sequentially
        for (let i = 0; i < WORD_LENGTH; i++) {
            const letter = word[i];
            const tile = document.getElementById(`tile-${currentRow}-${i}`);

            setTimeout(() => {
                tile.classList.add('flip');

                // Change color halfway through flip
                setTimeout(() => {
                    const isTargetLetter = targetLetters.has(letter);
                    const statusClass = isTargetLetter ? 'correct' : 'absent';
                    tile.classList.add(statusClass);
                    updateKeyboard(letter, statusClass);

                    if (isTargetLetter && !revealedLetters.has(letter)) {
                        revealedLetters.add(letter);
                        revealLetterInPhrase(letter);
                    }
                }, FLIP_DELAY_MS / 2);

            }, i * FLIP_DELAY_MS);

            // Emoji line construction
            const isTargetLetter = targetLetters.has(letter);
            emojiLine += isTargetLetter ? '🟩' : '⬜';
        }

        emojiGrid.push(emojiLine);

        // Wait for row animation to finish
        setTimeout(() => {
            // Check win condition: all target letters are revealed
            const allRevealed = Array.from(targetLetters).every(char => revealedLetters.has(char));

            if (allRevealed) {
                gameStatus = 'WIN';
                saveStats(true, currentRow);
                showMessage("Brilliant!", 0);
                setTimeout(showStats, 2000);
            } else if (currentRow === MAX_ROWS - 1) {
                gameStatus = 'LOSE';
                saveStats(false, currentRow);
                setTimeout(showStats, 2000);
            } else {
                currentRow++;
                currentCol = 0;
            }
        }, WORD_LENGTH * FLIP_DELAY_MS + 300);
    }

    function revealLetterInPhrase(letter) {
        const tiles = document.querySelectorAll(`.phrase-tile.letter-${letter}`);
        tiles.forEach(tile => {
            tile.classList.add('revealed');
        });
    }

    function updateKeyboard(letter, statusClass) {
        const btn = document.querySelector(`button[data-key="${letter}"]`);
        if (!btn) return;

        // In this game, if a letter is correct, it stays correct. It never becomes absent.
        if (btn.classList.contains('correct')) return;

        btn.classList.remove('absent');
        btn.classList.add(statusClass);
    }

    // --- Utils --- //
    function saveStats(isWin, row) {
        let stats = JSON.parse(localStorage.getItem('fabFourdleStats') || '{"played":0,"wins":0,"currentStreak":0,"maxStreak":0,"guesses":[0,0,0,0,0]}');

        // Backwards compatibility for v1.1 stats
        if (!stats.guesses) {
            stats.guesses = [0, 0, 0, 0, 0];
        }

        stats.played++;
        if (isWin) {
            stats.wins++;
            stats.currentStreak++;
            if (stats.currentStreak > stats.maxStreak) {
                stats.maxStreak = stats.currentStreak;
            }
            if (row >= 0 && row < MAX_ROWS) {
                stats.guesses[row]++;
            }
        } else {
            stats.currentStreak = 0;
        }
        localStorage.setItem('fabFourdleStats', JSON.stringify(stats));

        const todayStr = new Date().toDateString();
        localStorage.setItem('fabFourdleLastPlayed', todayStr);
    }

    function shakeRow(row) {
        for (let i = 0; i < WORD_LENGTH; i++) {
            const tile = document.getElementById(`tile-${row}-${i}`);
            tile.classList.remove('shake');
            void tile.offsetWidth; // reflow
            tile.classList.add('shake');
        }
    }

    function showMessage(msg, duration = 2000) {
        messageEl.textContent = msg;
        messageEl.classList.remove('hidden');
        if (duration > 0) {
            setTimeout(() => {
                messageEl.classList.add('hidden');
            }, duration);
        }
    }

    function showToast(msg, duration = 2000) {
        toastEl.textContent = msg;
        toastEl.classList.remove('hidden');
        if (duration > 0) {
            setTimeout(() => {
                toastEl.classList.add('hidden');
            }, duration);
        }
    }

    function showStats() {
        statsModal.classList.remove('hidden');
        const titleEl = document.getElementById('end-title');
        const solutionContainer = document.getElementById('solution-container');
        const solutionText = document.getElementById('solution-text');

        if (gameStatus === 'WIN') {
            titleEl.textContent = "You Win!";
            titleEl.style.color = "var(--color-correct)";
            solutionContainer.classList.remove('hidden');
            solutionText.textContent = targetPhrase;
        } else if (gameStatus === 'LOSE') {
            titleEl.textContent = "Game Over";
            titleEl.style.color = "var(--color-absent)";
            solutionContainer.classList.remove('hidden');
            solutionText.textContent = targetPhrase;

            // Automatically reveal all letters in red or dim for loser
            document.querySelectorAll('.phrase-tile').forEach(tile => {
                if (!tile.classList.contains('punctuation') && !tile.classList.contains('revealed')) {
                    tile.classList.add('revealed');
                    tile.style.backgroundColor = '#b91c1c'; // Red for missed
                    tile.style.borderColor = '#b91c1c';
                }
            });

        } else {
            titleEl.textContent = 'Statistics';
            titleEl.style.color = 'var(--text-color)';
            solutionContainer.classList.add('hidden');
        }

        // Retrieve and populate stats
        let stats = JSON.parse(localStorage.getItem('fabFourdleStats') || '{"played":0,"wins":0,"currentStreak":0,"maxStreak":0,"guesses":[0,0,0,0,0]}');
        document.getElementById('stat-played').textContent = stats.played;
        const winPct = stats.played === 0 ? 0 : Math.round((stats.wins / stats.played) * 100);
        document.getElementById('stat-winpct').textContent = winPct;
        document.getElementById('stat-current-streak').textContent = stats.currentStreak;
        document.getElementById('stat-max-streak').textContent = stats.maxStreak;

        // Populate Guess Distribution
        const guesses = stats.guesses || [0, 0, 0, 0, 0];
        const maxGuess = Math.max(...guesses, 1); // Avoid division by zero

        for (let i = 0; i < MAX_ROWS; i++) {
            const barEl = document.getElementById(`dist-bar-${i}`);
            if (!barEl) continue;

            const count = guesses[i];
            barEl.textContent = count;

            // Calculate width, min 7% so number is visible
            let widthPct = Math.max(7, Math.round((count / maxGuess) * 100));
            barEl.style.width = `${widthPct}%`;

            // Highlight current guess if won
            if ((gameStatus === 'WIN' || gameStatus === 'DONE') && i === currentRow) {
                barEl.classList.add('current-run');
            } else {
                barEl.classList.remove('current-run');
            }
        }
    }

    async function shareResult() {
        let attemptsText = gameStatus === 'WIN' ? `${currentRow + 1}/${MAX_ROWS}` : `X/${MAX_ROWS}`;
        let textToShare = `Fab-Fourdle ${attemptsText}\n\n`;
        textToShare += emojiGrid.join('\n');

        try {
            await navigator.clipboard.writeText(textToShare);
            showToast("Copied results to clipboard!");
        } catch (err) {
            console.error('Failed to copy', err);
            prompt('Copy your results:', textToShare);
        }
    }
});
