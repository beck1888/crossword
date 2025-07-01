class CrosswordGenerator {
    constructor() {
        // Configuration will be loaded from server-config.json
        this.config = null;
        this.gridSize = 25; // Default value, will be updated from config
        this.grid = [];
        this.placements = [];
        this.wordNumbers = {};
        this.currentNumber = 1;
        this.words = [];
        this.showAnswers = false; // Track whether answers are visible
        
        // Load configuration first, then initialize everything else
        this.loadConfiguration();
    }

    /**
     * Load configuration from server-config.json
     * This must be called before initializing other components
     */
    async loadConfiguration() {
        try {
            const response = await fetch('server-config.json');
            if (!response.ok) {
                throw new Error('Failed to load server configuration');
            }
            
            this.config = await response.json();
            
            // Update grid size from config with validation
            const gridConfig = this.config.gridSize;
            this.gridSize = Math.max(gridConfig.min, Math.min(gridConfig.max, gridConfig.default));
            
            // Now initialize everything else
            this.initializeGrid();
            this.setupEventListeners();
            this.populatePresetSelect();
            
        } catch (error) {
            console.error('Error loading configuration:', error);
            this.showMessage('Failed to load configuration. Using default settings.', 'error');
            
            // Fall back to default configuration
            this.config = {
                gridSize: { default: 25, min: 10, max: 50 },
                presets: {}
            };
            this.gridSize = 25;
            
            // Initialize with defaults
            this.initializeGrid();
            this.setupEventListeners();
            this.populatePresetSelect();
        }
    }

    initializeGrid() {
        this.grid = Array(this.gridSize).fill().map(() => Array(this.gridSize).fill(''));
    }

    setupEventListeners() {
        const wordInput = document.getElementById('wordInput');
        const clueInput = document.getElementById('clueInput');
        const addWordBtn = document.getElementById('addWordBtn');
        const generateBtn = document.getElementById('generateBtn');
        const clearBtn = document.getElementById('clearBtn');
        const printBtn = document.getElementById('printBtn');
        const loadPresetBtn = document.getElementById('loadPresetBtn');
        const toggleAnswersBtn = document.getElementById('toggleAnswersBtn');

        addWordBtn.addEventListener('click', () => this.addWord());
        generateBtn.addEventListener('click', () => this.generateCrossword());
        clearBtn.addEventListener('click', () => this.clearAll());
        printBtn.addEventListener('click', () => this.printCrossword());
        loadPresetBtn.addEventListener('click', () => this.loadPreset());
        toggleAnswersBtn.addEventListener('click', () => this.toggleAnswers());

        // Allow Enter key to add words
        [wordInput, clueInput].forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.addWord();
            });
        });
    }

    /**
     * Load preset word list from text file
     * Parses semicolon-delimited format: WORD;Clue description
     */
    async loadPresetFromFile(presetKey) {
        try {
            // Get file path from configuration
            const presetConfig = this.config.presets[presetKey];
            if (!presetConfig) {
                throw new Error(`Preset ${presetKey} not found in configuration`);
            }
            
            const response = await fetch(presetConfig.filePath);
            if (!response.ok) {
                throw new Error(`Failed to load ${presetConfig.filePath}`);
            }
            
            const text = await response.text();
            const words = [];
            
            // Parse each line: WORD;Clue description
            const lines = text.trim().split('\n');
            for (const line of lines) {
                if (line.trim()) {
                    const [word, clue] = line.split(';');
                    if (word && clue) {
                        words.push({ 
                            word: word.trim().toUpperCase(), 
                            clue: clue.trim() 
                        });
                    }
                }
            }
            
            return words;
        } catch (error) {
            console.error(`Error loading preset ${presetKey}:`, error);
            this.showMessage(`Failed to load ${presetKey} preset`, 'error');
            return [];
        }
    }

    addWord() {
        const wordInput = document.getElementById('wordInput');
        const clueInput = document.getElementById('clueInput');
        
        const word = wordInput.value.trim().toUpperCase();
        const clue = clueInput.value.trim();

        if (!word || !clue) {
            this.showMessage('Please enter both word and clue', 'error');
            return;
        }

        if (word.length > this.config.gridSize.max) {
            this.showMessage(`Word must be ${this.config.gridSize.max} characters or less`, 'error');
            return;
        }

        if (!/^[A-Z]+$/.test(word)) {
            this.showMessage('Word must contain only letters', 'error');
            return;
        }

        if (this.words.some(w => w.word === word)) {
            this.showMessage('Word already added', 'warning');
            return;
        }

        this.words.push({ word, clue });
        this.updateWordsList();
        this.updateButtons();
        
        // Clear inputs
        wordInput.value = '';
        clueInput.value = '';
        wordInput.focus();

        this.showMessage(`Added "${word}"`, 'success');
    }

    async loadPreset() {
        const presetSelect = document.getElementById('presetSelect');
        const selectedPreset = presetSelect.value;

        if (!selectedPreset) {
            this.showMessage('Please select a preset theme', 'warning');
            return;
        }

        // Show loading state
        const loadPresetBtn = document.getElementById('loadPresetBtn');
        const originalText = loadPresetBtn.textContent;
        loadPresetBtn.innerHTML = 'Loading... <span class="loading"></span>';
        loadPresetBtn.disabled = true;

        try {
            // Load preset from file if not already cached
            if (!this.presets) {
                this.presets = {};
            }
            if (!this.presets[selectedPreset]) {
                this.presets[selectedPreset] = await this.loadPresetFromFile(selectedPreset);
            }

            // Use the loaded preset
            this.words = [...this.presets[selectedPreset]];
            this.updateWordsList();
            this.updateButtons();
            
            presetSelect.value = '';
            
            const displayName = this.presetFiles[selectedPreset] || selectedPreset;
            this.showMessage(`Loaded ${displayName} theme with ${this.words.length} words`, 'success');
        } catch (error) {
            console.error('Error loading preset:', error);
            this.showMessage('Failed to load preset theme', 'error');
        } finally {
            // Restore button state
            loadPresetBtn.textContent = originalText;
            loadPresetBtn.disabled = false;
        }
   }

    /**
     * Populate the preset select dropdown with options from the configuration
     */
    populatePresetSelect() {
        const presetSelect = document.getElementById('presetSelect');
        
        // Clear existing options except the default one
        while (presetSelect.children.length > 1) {
            presetSelect.removeChild(presetSelect.lastChild);
        }
        
        // Add options from the configuration
        if (this.config && this.config.presets) {
            for (const [presetKey, presetConfig] of Object.entries(this.config.presets)) {
                const option = document.createElement('option');
                option.value = presetKey;
                option.textContent = presetConfig.displayName;
                presetSelect.appendChild(option);
            }
        }
    }

    updateWordsList() {
        const wordsList = document.getElementById('wordsList');
        const wordCount = document.getElementById('wordCount');
        
        wordCount.textContent = this.words.length;

        if (this.words.length === 0) {
            wordsList.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">No words added yet</p>';
            return;
        }

        wordsList.innerHTML = this.words.map((item, index) => `
            <div class="word-item">
                <div class="word-details">
                    <div class="word-text">${item.word}</div>
                    <div class="clue-text">${item.clue}</div>
                </div>
                <button class="remove-btn" onclick="crosswordGenerator.removeWord(${index})">Remove</button>
            </div>
        `).join('');
    }

    removeWord(index) {
        this.words.splice(index, 1);
        this.updateWordsList();
        this.updateButtons();
        this.showMessage('Word removed', 'success');
    }

    updateButtons() {
        const generateBtn = document.getElementById('generateBtn');
        const printBtn = document.getElementById('printBtn');
        const toggleAnswersBtn = document.getElementById('toggleAnswersBtn');
        
        generateBtn.disabled = this.words.length < 2;
        printBtn.disabled = this.placements.length === 0;
        toggleAnswersBtn.disabled = this.placements.length === 0;
    }

    clearAll() {
        this.words = [];
        this.showAnswers = false;
        this.reset();
        this.updateWordsList();
        this.updateButtons();
        document.getElementById('crosswordGrid').innerHTML = '';
        document.getElementById('acrossClues').innerHTML = '';
        document.getElementById('downClues').innerHTML = '';
        this.showMessage('All data cleared', 'success');
    }

    reset() {
        this.initializeGrid();
        this.placements = [];
        this.wordNumbers = {};
        this.currentNumber = 1;
    }

    findIntersections(word1, word2) {
        const intersections = [];
        for (let i = 0; i < word1.length; i++) {
            for (let j = 0; j < word2.length; j++) {
                if (word1[i] === word2[j]) {
                    intersections.push([i, j]);
                }
            }
        }
        return intersections;
    }

    canPlaceWord(word, startRow, startCol, direction) {
        if (direction === 'across') {
            if (startCol + word.length > this.gridSize) return false;
            
            // Check conflicts and adjacency
            for (let i = 0; i < word.length; i++) {
                const row = startRow;
                const col = startCol + i;
                
                if (this.grid[row][col] !== '' && this.grid[row][col] !== word[i]) {
                    return false;
                }
                
                // Check above and below for illegal adjacency
                if (this.grid[row][col] === '') {
                    if (row > 0 && this.grid[row - 1][col] !== '') return false;
                    if (row < this.gridSize - 1 && this.grid[row + 1][col] !== '') return false;
                }
            }
            
            // Check before and after word
            if (startCol > 0 && this.grid[startRow][startCol - 1] !== '') return false;
            if (startCol + word.length < this.gridSize && this.grid[startRow][startCol + word.length] !== '') return false;
            
        } else { // down
            if (startRow + word.length > this.gridSize) return false;
            
            for (let i = 0; i < word.length; i++) {
                const row = startRow + i;
                const col = startCol;
                
                if (this.grid[row][col] !== '' && this.grid[row][col] !== word[i]) {
                    return false;
                }
                
                // Check left and right for illegal adjacency
                if (this.grid[row][col] === '') {
                    if (col > 0 && this.grid[row][col - 1] !== '') return false;
                    if (col < this.gridSize - 1 && this.grid[row][col + 1] !== '') return false;
                }
            }
            
            // Check before and after word
            if (startRow > 0 && this.grid[startRow - 1][startCol] !== '') return false;
            if (startRow + word.length < this.gridSize && this.grid[startRow + word.length][startCol] !== '') return false;
        }
        
        return true;
    }

    placeWord(word, clue, startRow, startCol, direction) {
        const placement = {
            word: word,
            clue: clue,
            startRow: startRow,
            startCol: startCol,
            direction: direction,
            number: this.currentNumber
        };
        
        this.placements.push(placement);
        this.wordNumbers[`${startRow}-${startCol}`] = this.currentNumber;
        this.currentNumber++;
        
        // Place letters on grid
        for (let i = 0; i < word.length; i++) {
            if (direction === 'across') {
                this.grid[startRow][startCol + i] = word[i];
            } else {
                this.grid[startRow + i][startCol] = word[i];
            }
        }
    }

    getIntersectionPlacements(newWord, existingPlacement) {
        const placements = [];
        const intersections = this.findIntersections(newWord, existingPlacement.word);
        
        for (const [newIdx, existingIdx] of intersections) {
            if (existingPlacement.direction === 'across') {
                // New word goes down
                const newStartRow = existingPlacement.startRow - newIdx;
                const newStartCol = existingPlacement.startCol + existingIdx;
                const newDirection = 'down';
                
                if (newStartRow >= 0 && 
                    newStartRow + newWord.length <= this.gridSize &&
                    this.canPlaceWord(newWord, newStartRow, newStartCol, newDirection)) {
                    placements.push([newStartRow, newStartCol, newDirection]);
                }
            } else {
                // New word goes across
                const newStartRow = existingPlacement.startRow + existingIdx;
                const newStartCol = existingPlacement.startCol - newIdx;
                const newDirection = 'across';
                
                if (newStartCol >= 0 && 
                    newStartCol + newWord.length <= this.gridSize &&
                    this.canPlaceWord(newWord, newStartRow, newStartCol, newDirection)) {
                    placements.push([newStartRow, newStartCol, newDirection]);
                }
            }
        }
        
        return placements;
    }

    generateCrossword() {
        if (this.words.length < 2) {
            this.showMessage('Need at least 2 words to generate crossword', 'error');
            return;
        }

        // Show loading
        const generateBtn = document.getElementById('generateBtn');
        const originalText = generateBtn.textContent;
        generateBtn.innerHTML = 'Generating... <span class="loading"></span>';
        generateBtn.disabled = true;

        // Use setTimeout to allow UI update
        setTimeout(() => {
            this.reset();
            this.showAnswers = false; // Reset answer visibility when generating new crossword
            
            // Sort words by length (longer first)
            const sortedWords = [...this.words].sort((a, b) => b.word.length - a.word.length);
            
            // Place first word in center
            const firstWord = sortedWords[0];
            const centerRow = Math.floor(this.gridSize / 2);
            const centerCol = Math.max(0, Math.floor((this.gridSize - firstWord.word.length) / 2));
            
            this.placeWord(firstWord.word, firstWord.clue, centerRow, centerCol, 'across');
            const placedWords = new Set([firstWord.word]);
            
            // Try to place remaining words
            for (let i = 1; i < sortedWords.length; i++) {
                const wordData = sortedWords[i];
                const word = wordData.word;
                
                if (placedWords.has(word)) continue;
                
                let bestPlacement = null;
                let maxIntersections = 0;
                
                // Try to intersect with existing words
                for (const existingPlacement of this.placements) {
                    const possiblePlacements = this.getIntersectionPlacements(word, existingPlacement);
                    
                    for (const [startRow, startCol, direction] of possiblePlacements) {
                        const intersections = this.findIntersections(word, existingPlacement.word).length;
                        
                        if (intersections > maxIntersections) {
                            maxIntersections = intersections;
                            bestPlacement = [startRow, startCol, direction];
                        }
                    }
                }
                
                if (bestPlacement) {
                    const [startRow, startCol, direction] = bestPlacement;
                    this.placeWord(word, wordData.clue, startRow, startCol, direction);
                    placedWords.add(word);
                }
            }
            
            this.displayCrossword();
            this.displayClues();
            this.updateButtons();
            
            // Reset toggle button text
            const toggleAnswersBtn = document.getElementById('toggleAnswersBtn');
            toggleAnswersBtn.textContent = '👁️ Show Answers';
            
            // Restore button
            generateBtn.textContent = originalText;
            generateBtn.disabled = false;
            
            const placedCount = this.placements.length;
            const totalCount = this.words.length;
            
            if (placedCount === totalCount) {
                this.showMessage(`Successfully generated crossword with all ${placedCount} words!`, 'success');
            } else {
                this.showMessage(`Generated crossword with ${placedCount} out of ${totalCount} words`, 'warning');
            }
        }, 100);
    }

    getGridBounds() {
        if (this.placements.length === 0) {
            return [0, 0, this.gridSize - 1, this.gridSize - 1];
        }
        
        let minRow = this.gridSize, minCol = this.gridSize;
        let maxRow = -1, maxCol = -1;
        
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                if (this.grid[row][col] !== '') {
                    minRow = Math.min(minRow, row);
                    maxRow = Math.max(maxRow, row);
                    minCol = Math.min(minCol, col);
                    maxCol = Math.max(maxCol, col);
                }
            }
        }
        
        return [minRow, minCol, maxRow, maxCol];
    }

    displayCrossword() {
        const crosswordGrid = document.getElementById('crosswordGrid');
        const [minRow, minCol, maxRow, maxCol] = this.getGridBounds();
        
        let gridHTML = '';
        for (let row = minRow; row <= maxRow; row++) {
            gridHTML += '<div class="grid-row">';
            for (let col = minCol; col <= maxCol; col++) {
                const cell = this.grid[row][col];
                const key = `${row}-${col}`;
                const number = this.wordNumbers[key];
                
                if (cell !== '') {
                    const displayLetter = this.showAnswers ? cell : '';
                    gridHTML += `<div class="grid-cell filled ${this.showAnswers ? 'with-answer' : 'puzzle-mode'}">
                        ${number ? `<span class="number">${number}</span>` : ''}
                        <span class="letter">${displayLetter}</span>
                    </div>`;
                } else {
                    gridHTML += '<div class="grid-cell empty"></div>';
                }
            }
            gridHTML += '</div>';
        }
        
        crosswordGrid.innerHTML = gridHTML;
    }

    displayClues() {
        const acrossClues = [];
        const downClues = [];
        
        for (const placement of this.placements) {
            if (placement.direction === 'across') {
                acrossClues.push([placement.number, placement.clue]);
            } else {
                downClues.push([placement.number, placement.clue]);
            }
        }
        
        acrossClues.sort((a, b) => a[0] - b[0]);
        downClues.sort((a, b) => a[0] - b[0]);
        
        document.getElementById('acrossClues').innerHTML = acrossClues.map(([num, clue]) => 
            `<div class="clue-item">
                <span class="clue-number">${num}.</span>
                <span class="clue-text">${clue}</span>
            </div>`
        ).join('');
        
        document.getElementById('downClues').innerHTML = downClues.map(([num, clue]) => 
            `<div class="clue-item">
                <span class="clue-number">${num}.</span>
                <span class="clue-text">${clue}</span>
            </div>`
        ).join('');
    }

    printCrossword() {
        if (this.placements.length === 0) {
            this.showMessage('Generate a crossword first', 'error');
            return;
        }
        
        // Create print version
        this.createPrintVersion();
        
        // Print
        window.print();
    }

    createPrintVersion() {
        const printGrid = document.getElementById('printGrid');
        const printAcrossClues = document.getElementById('printAcrossClues');
        const printDownClues = document.getElementById('printDownClues');
        
        // Create empty grid for printing (no letters, just numbers)
        const [minRow, minCol, maxRow, maxCol] = this.getGridBounds();
        
        let gridHTML = '';
        for (let row = minRow; row <= maxRow; row++) {
            gridHTML += '<div class="grid-row">';
            for (let col = minCol; col <= maxCol; col++) {
                const cell = this.grid[row][col];
                const key = `${row}-${col}`;
                const number = this.wordNumbers[key];
                
                if (cell !== '') {
                    gridHTML += `<div class="grid-cell filled">
                        ${number ? `<span class="number">${number}</span>` : ''}
                    </div>`;
                } else {
                    gridHTML += '<div class="grid-cell empty"></div>';
                }
            }
            gridHTML += '</div>';
        }
        
        printGrid.innerHTML = gridHTML;
        
        // Copy clues
        printAcrossClues.innerHTML = document.getElementById('acrossClues').innerHTML;
        printDownClues.innerHTML = document.getElementById('downClues').innerHTML;
    }

    showMessage(text, type = 'info') {
        // Remove existing messages
        const existingMessages = document.querySelectorAll('.message');
        existingMessages.forEach(msg => msg.remove());
        
        const message = document.createElement('div');
        message.className = `message ${type}`;
        message.textContent = text;
        
        const inputSection = document.querySelector('.input-section');
        inputSection.appendChild(message);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (message.parentNode) {
                message.remove();
            }
        }, 3000);
    }

    toggleAnswers() {
        if (this.placements.length === 0) {
            this.showMessage('Generate a crossword first', 'error');
            return;
        }

        this.showAnswers = !this.showAnswers;
        this.displayCrossword();
        
        const toggleBtn = document.getElementById('toggleAnswersBtn');
        toggleBtn.textContent = this.showAnswers ? '🙈 Hide Answers' : '👁️ Show Answers';
        
        this.showMessage(
            this.showAnswers ? 'Answer key visible' : 'Answer key hidden', 
            'success'
        );
    }
}

// Initialize the crossword generator when page loads
let crosswordGenerator;

document.addEventListener('DOMContentLoaded', () => {
    crosswordGenerator = new CrosswordGenerator();
});
