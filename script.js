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

    const helpBtn = document.getElementById('help-btn');
    const statsBtn = document.getElementById('stats-btn');
    const helpModal = document.getElementById('help-modal');
    const statsModal = document.getElementById('stats-modal');
    const closeBtns = document.querySelectorAll('.close-btn');
    const shareBtn = document.getElementById('share-btn');

    // --- Initialization --- //
    initGame();

    async function initGame() {
        // Load target phrase
        targetPhrase = await fetchDailyPhrase();
        if (!targetPhrase) targetPhrase = "All you need is love";

        let rawPhrase = targetPhrase.toLowerCase();
        for (let char of rawPhrase) {
            if (/[a-z]/.test(char)) {
                targetLetters.add(char);
            }
        }

        createWordleGrid();
        createPhraseGrid();
        setupEventListeners();
    }

    async function fetchDailyPhrase() {
        try {
            // Add a cache-buster query parameter so the browser doesn't aggressively cache the text file
            const response = await fetch('phrases.txt?t=' + new Date().getTime());
            if (!response.ok) throw new Error('Network response was not ok');
            const text = await response.text();

            const lines = text.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .map(line => line.replace(/\s*\(\d+\s*words?\)\s*$/i, ''));

            if (lines.length === 0) return "Let it be";

            const index = Math.floor(Math.random() * lines.length);
            return lines[index];
        } catch (error) {
            console.error('Error fetching phrases:', error);
            return "Here comes the sun";
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
            emojiLine += targetLetters.has(letter) ? '🟩' : '⬜';
        }

        emojiGrid.push(emojiLine);

        // Wait for row animation to finish
        setTimeout(() => {
            // Check win condition: all target letters are revealed
            const allRevealed = Array.from(targetLetters).every(char => revealedLetters.has(char));

            if (allRevealed) {
                gameStatus = 'WIN';
                showMessage("Brilliant!", 0);
                setTimeout(showStats, 2000);
            } else if (currentRow === MAX_ROWS - 1) {
                gameStatus = 'LOSE';
                showMessage(targetPhrase, 0); // show solution as toast
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
            titleEl.textContent = "Statistics";
            titleEl.style.color = "var(--yellow)";
            solutionContainer.classList.add('hidden');
        }
    }

    async function shareResult() {
        let attemptsText = gameStatus === 'WIN' ? `${currentRow + 1}/${MAX_ROWS}` : `X/${MAX_ROWS}`;
        let textToShare = `Fab-Fourdle ${attemptsText}\n\n`;
        textToShare += emojiGrid.join('\n');

        try {
            await navigator.clipboard.writeText(textToShare);
            showMessage("Copied results to clipboard!");
            statsModal.classList.add('hidden');
        } catch (err) {
            console.error('Failed to copy', err);
            prompt('Copy your results:', textToShare);
        }
    }
});
