class CrosswordGenerator {
    constructor() {
        // Configuration will be loaded from server-config.json
        this.config = null;
        this.configLoaded = false; // Track configuration loading state
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
            
            // Mark configuration as loaded
            this.configLoaded = true;
            
            // Now initialize everything else
            this.initializeGrid();
            this.setupEventListeners();
            this.populatePresetSelect();
            this.initializeGenerationOptions();
            
            console.log('Configuration loaded successfully');
            
        } catch (error) {
            console.error('Error loading configuration:', error);
            this.showMessage('Failed to load configuration. Using default settings.', 'error', false);
            
            // Fall back to default configuration
            this.config = {
                gridSize: { default: 25, min: 10, max: 50 },
                generation: { 
                    mode: 'maxOverlap', 
                    enforceAllWords: true, 
                    maxAttempts: 1000,
                    timeoutSeconds: 10
                },
                presets: {}
            };
            this.gridSize = 25;
            this.configLoaded = true; // Mark as loaded even with defaults
            
            // Initialize with defaults
            this.initializeGrid();
            this.setupEventListeners();
            this.populatePresetSelect();
            this.initializeGenerationOptions();
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
     * @param {string} presetKey - Key identifying the preset in configuration
     * @returns {Array} Array of word objects with word and clue properties
     */
    async loadPresetFromFile(presetKey) {
        // Get file path from configuration
        const presetConfig = this.config.presets[presetKey];
        if (!presetConfig) {
            throw new Error(`Preset ${presetKey} not found in configuration`);
        }

        // Fetch the preset file
        const response = await fetch(presetConfig.filePath);
        if (!response.ok) {
            throw new Error(`Failed to load ${presetConfig.filePath} (Status: ${response.status})`);
        }

        // Parse the file content
        const text = await response.text();
        if (!text || text.trim().length === 0) {
            throw new Error(`Preset file ${presetConfig.filePath} is empty`);
        }

        const words = [];
        const lines = text.trim().split('\n');
        let validLineCount = 0;

        // Parse each line: WORD;Clue description
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine && !trimmedLine.startsWith('#')) { // Skip empty lines and comments
                const parts = trimmedLine.split(';');
                if (parts.length >= 2) {
                    const word = parts[0].trim().toUpperCase();
                    const clue = parts.slice(1).join(';').trim(); // Handle semicolons in clues
                    
                    // Validate word format
                    if (word && clue && /^[A-Z]+$/.test(word)) {
                        words.push({ word, clue });
                        validLineCount++;
                    } else {
                        console.warn(`Skipping invalid line in ${presetKey}: "${trimmedLine}"`);
                    }
                } else {
                    console.warn(`Skipping malformed line in ${presetKey}: "${trimmedLine}"`);
                }
            }
        }

        // Validate that we got some words
        if (words.length === 0) {
            throw new Error(`No valid word entries found in ${presetConfig.filePath}`);
        }

        console.log(`Loaded ${words.length} words from ${presetKey} preset (${validLineCount}/${lines.length} lines processed)`);
        return words;
    }

    addWord() {
        const wordInput = document.getElementById('wordInput');
        const clueInput = document.getElementById('clueInput');
        
        const word = wordInput.value.trim().toUpperCase();
        const clue = clueInput.value.trim();

        if (!word || !clue) {
            this.showMessage('Please enter both word and clue', 'error', false);
            return;
        }

        if (word.length > this.config.gridSize.max) {
            this.showMessage(`Word must be ${this.config.gridSize.max} characters or less`, 'error', false);
            return;
        }

        if (!/^[A-Z]+$/.test(word)) {
            this.showMessage('Word must contain only letters', 'error', false);
            return;
        }

        if (this.words.some(w => w.word === word)) {
            this.showMessage('Word already added', 'warning', false);
            return;
        }

        this.words.push({ word, clue });
        this.updateWordsList();
        this.updateButtons();
        
        // Clear any existing crossword display since word list changed
        this.clearCrosswordDisplay();
        
        // Clear inputs
        wordInput.value = '';
        clueInput.value = '';
        wordInput.focus();

        this.showToast(`Added "${word}"`, 'success');
    }

    /**
     * Load preset word list from user interface selection
     * Handles caching, loading state, and error recovery
     * Does not generate crossword - only loads words for later generation
     */
    async loadPreset() {
        const presetSelect = document.getElementById('presetSelect');
        const selectedPreset = presetSelect.value;

        if (!selectedPreset) {
            this.showMessage('Please select a preset theme', 'warning', false);
            return;
        }

        // Ensure configuration is loaded
        if (!this.configLoaded) {
            this.showMessage('Configuration is still loading, please try again in a moment', 'warning', false);
            return;
        }

        // Validate configuration exists
        if (!this.config.presets || !this.config.presets[selectedPreset]) {
            console.error('Available presets:', Object.keys(this.config.presets || {}));
            this.showMessage(`Theme "${selectedPreset}" not found in configuration`, 'error', false);
            return;
        }

        // Show loading state
        const loadPresetBtn = document.getElementById('loadPresetBtn');
        const originalText = loadPresetBtn.textContent;
        loadPresetBtn.innerHTML = 'Loading... <span class="loading"></span>';
        loadPresetBtn.disabled = true;

        try {
            // Initialize presets cache if needed
            if (!this.presets) {
                this.presets = {};
            }

            // Load preset from file if not already cached
            let presetWords;
            if (!this.presets[selectedPreset]) {
                console.log(`Loading preset ${selectedPreset} from file...`);
                presetWords = await this.loadPresetFromFile(selectedPreset);
                
                // Validate loaded data
                if (!presetWords || presetWords.length === 0) {
                    throw new Error(`No valid words found in preset file`);
                }
                
                // Cache the loaded preset
                this.presets[selectedPreset] = presetWords;
                console.log(`Cached ${presetWords.length} words for preset ${selectedPreset}`);
            } else {
                console.log(`Using cached preset ${selectedPreset}`);
                presetWords = this.presets[selectedPreset];
            }

            // Apply the loaded preset words (but don't generate crossword yet)
            this.words = [...presetWords];
            this.updateWordsList();
            this.updateButtons();
            
            // Clear any existing crossword display
            this.clearCrosswordDisplay();
            
            // Reset select dropdown
            presetSelect.value = '';
            
            // Get display name from configuration
            const displayName = this.config.presets[selectedPreset].displayName || selectedPreset;
            this.showToast(`Loaded ${displayName} theme with ${this.words.length} words. Press "Generate Crossword" to create puzzle.`, 'success');

        } catch (error) {
            console.error('Error loading preset:', error);
            
            // Provide specific error messages based on error type
            let errorMessage = 'Failed to load preset theme';
            if (error.message.includes('Failed to load')) {
                errorMessage = `Unable to load theme file. Please check if the file exists.`;
            } else if (error.message.includes('not found in configuration')) {
                errorMessage = `Theme configuration is missing or corrupted.`;
            } else if (error.message.includes('No valid words')) {
                errorMessage = `Theme file appears to be empty or incorrectly formatted.`;
            } else if (error.message.includes('Status: 404')) {
                errorMessage = `Theme file not found on server.`;
            } else if (error.message.includes('NetworkError') || error.message.includes('fetch')) {
                errorMessage = `Network error loading theme. Please check your connection.`;
            }
            
            this.showToast(errorMessage, 'error');
            
        } finally {
            // Always restore button state
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

    /**
     * Initialize generation options UI elements with values from configuration
     */
    initializeGenerationOptions() {
        const generationModeSelect = document.getElementById('generationMode');
        const enforceAllWordsCheckbox = document.getElementById('enforceAllWords');
        
        if (this.config && this.config.generation) {
            // Set generation mode
            generationModeSelect.value = this.config.generation.mode || 'maxOverlap';
            
            // Set enforce all words option
            enforceAllWordsCheckbox.checked = this.config.generation.enforceAllWords !== false;
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
        
        // Clear crossword display since word list changed
        this.clearCrosswordDisplay();
        
        this.showToast('Word removed', 'success');
    }

    updateButtons() {
        const generateBtn = document.getElementById('generateBtn');
        const printBtn = document.getElementById('printBtn');
        const toggleAnswersBtn = document.getElementById('toggleAnswersBtn');
        
        generateBtn.disabled = this.words.length < 2;
        printBtn.disabled = this.placements.length === 0;
        toggleAnswersBtn.disabled = this.placements.length === 0;
    }

    /**
     * Enable or disable buttons during generation process
     * @param {boolean} disabled - Whether buttons should be disabled
     */
    setButtonsDisabled(disabled) {
        const printBtn = document.getElementById('printBtn');
        const toggleAnswersBtn = document.getElementById('toggleAnswersBtn');
        const clearBtn = document.getElementById('clearBtn');
        const loadPresetBtn = document.getElementById('loadPresetBtn');
        const addWordBtn = document.getElementById('addWordBtn');
        
        printBtn.disabled = disabled || this.placements.length === 0;
        toggleAnswersBtn.disabled = disabled || this.placements.length === 0;
        clearBtn.disabled = disabled;
        loadPresetBtn.disabled = disabled;
        addWordBtn.disabled = disabled;
    }

    clearAll() {
        this.words = [];
        this.showAnswers = false;
        this.reset();
        this.updateWordsList();
        this.updateButtons();
        this.clearCrosswordDisplay();
        this.showToast('All data cleared', 'success');
    }

    /**
     * Clear the crossword display without affecting word list
     */
    clearCrosswordDisplay() {
        document.getElementById('crosswordGrid').innerHTML = '';
        document.getElementById('acrossClues').innerHTML = '';
        document.getElementById('downClues').innerHTML = '';
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

    /**
     * Generate crossword using the selected generation mode and options
     * Systematically tries all possibilities with timeout when enforcing all words
     * Only displays crossword after successful generation or failure
     */
    generateCrossword() {
        if (this.words.length < 2) {
            this.showMessage('Need at least 2 words to generate crossword', 'error', false);
            return;
        }

        // Clear any existing crossword display immediately
        this.clearCrosswordDisplay();

        // Get generation options from UI and config
        const generationMode = document.getElementById('generationMode').value;
        const enforceAllWords = document.getElementById('enforceAllWords').checked;
        const maxAttempts = this.config?.generation?.maxAttempts || 1000;
        const timeoutSeconds = this.config?.generation?.timeoutSeconds || 10;

        // Show loading with enhanced spinner for systematic attempts
        const generateBtn = document.getElementById('generateBtn');
        const originalText = generateBtn.textContent;
        
        if (enforceAllWords) {
            generateBtn.innerHTML = 'Trying all possibilities... <span class="loading"></span>';
            // Don't show the exploring message immediately, let the generation process handle it
        } else {
            generateBtn.innerHTML = 'Generating... <span class="loading"></span>';
        }
        generateBtn.disabled = true;

        // Disable other buttons during generation
        this.setButtonsDisabled(true);

        // Use setTimeout to allow UI update
        setTimeout(() => {
            this.generateCrosswordWithSystematicAttempts(
                generationMode, 
                enforceAllWords, 
                maxAttempts, 
                timeoutSeconds,
                generateBtn,
                originalText
            );
        }, 100);
    }

    /**
     * Generate crossword with systematic attempts and timeout handling
     * @param {string} generationMode - Generation mode to use
     * @param {boolean} enforceAllWords - Whether to enforce using all words
     * @param {number} maxAttempts - Maximum number of attempts
     * @param {number} timeoutSeconds - Timeout in seconds
     * @param {HTMLElement} generateBtn - Generate button element
     * @param {string} originalText - Original button text
     */
    async generateCrosswordWithSystematicAttempts(generationMode, enforceAllWords, maxAttempts, timeoutSeconds, generateBtn, originalText) {
        const startTime = Date.now();
        const timeoutMs = timeoutSeconds * 1000;
        
        let bestResult = null;
        let bestScore = 0;
        let attempts = 0;
        let foundPerfectSolution = false;
        
        // If not enforcing all words, just do a single attempt
        const totalAttempts = enforceAllWords ? maxAttempts : 1;
        
        // Show appropriate message based on mode
        if (enforceAllWords) {
            this.showToast('Systematically exploring all possible arrangements...', 'info');
        }
        
        // Generate different seed combinations for systematic exploration
        const seedCombinations = this.generateSeedCombinations(generationMode);
        
        for (let seedIndex = 0; seedIndex < seedCombinations.length && attempts < totalAttempts; seedIndex++) {
            // Check timeout
            if (Date.now() - startTime > timeoutMs) {
                console.log(`Generation timeout after ${attempts} attempts`);
                break;
            }
            
            attempts++;
            
            // Update progress periodically
            if (attempts % 10 === 0 && enforceAllWords) {
                generateBtn.innerHTML = `Attempt ${attempts}/${totalAttempts}... <span class="loading"></span>`;
                // Allow UI update
                await new Promise(resolve => setTimeout(resolve, 1));
            }
            
            this.reset();
            const result = this.generateSingleCrosswordWithSeed(generationMode, seedCombinations[seedIndex]);
            
            // Score the result
            const score = this.scoreCrosswordResult(result);
            
            // If we got all words, use this result immediately
            if (result.placedWords.size === this.words.length) {
                bestResult = result;
                foundPerfectSolution = true;
                console.log(`Found perfect solution after ${attempts} attempts`);
                break;
            }
            
            // Keep track of the best result so far
            if (score > bestScore) {
                bestScore = score;
                bestResult = result;
            }
        }
        
        // Apply the best result
        if (bestResult) {
            this.applyGenerationResult(bestResult);
        }
        
        this.showAnswers = false; // Reset answer visibility when generating new crossword
        
        // Only display crossword if we have a result
        if (bestResult && bestResult.placements.length > 0) {
            this.displayCrossword();
            this.displayClues();
        } else {
            // Clear display if no result
            this.clearCrosswordDisplay();
        }
        
        this.updateButtons();
        
        // Re-enable all buttons
        this.setButtonsDisabled(false);
        
        // Reset toggle button text
        const toggleAnswersBtn = document.getElementById('toggleAnswersBtn');
        toggleAnswersBtn.textContent = '👁️ Show Answers';
        
        // Restore button
        generateBtn.textContent = originalText;
        generateBtn.disabled = false;
        
        const placedCount = this.placements.length;
        const totalCount = this.words.length;
        const timeElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        
        // Clear any existing progress messages and show final result
        if (foundPerfectSolution) {
            this.showToast(`Perfect solution found! All ${placedCount} words placed after ${attempts} attempts (${timeElapsed}s)`, 'success');
        } else if (placedCount === totalCount) {
            this.showToast(`Successfully generated crossword with all ${placedCount} words after ${attempts} attempts (${timeElapsed}s)`, 'success');
        } else if (placedCount > 0 && enforceAllWords && attempts > 1) {
            this.showToast(`Best result: ${placedCount} out of ${totalCount} words after ${attempts} attempts (${timeElapsed}s)`, 'warning');
        } else if (placedCount > 0) {
            this.showToast(`Generated crossword with ${placedCount} out of ${totalCount} words`, 'warning');
        } else {
            this.showToast(`Unable to generate crossword with current words after ${attempts} attempts (${timeElapsed}s). Try different generation settings or fewer words.`, 'error');
        }
    }

    /**
     * Generate seed combinations for systematic exploration
     * @param {string} generationMode - Generation mode to use
     * @returns {Array} Array of seed objects for systematic attempts
     */
    generateSeedCombinations(generationMode) {
        const seeds = [];
        
        if (generationMode === 'random') {
            // For random mode, generate different random seeds
            for (let i = 0; i < 1000; i++) {
                seeds.push({ randomSeed: Math.random(), wordOrderSeed: Math.random() });
            }
        } else {
            // For maxOverlap mode, try different word orderings and starting positions
            const wordPermutations = this.generateWordOrderVariations();
            const startingPositions = this.generateStartingPositionVariations();
            
            for (const wordOrder of wordPermutations) {
                for (const startPos of startingPositions) {
                    seeds.push({ wordOrder, startingPosition: startPos });
                }
            }
        }
        
        return seeds;
    }

    /**
     * Generate different word order variations for systematic exploration
     * @returns {Array} Array of word order arrays
     */
    generateWordOrderVariations() {
        const variations = [];
        const words = [...this.words];
        
        // Original length-based sorting (longest first)
        variations.push([...words].sort((a, b) => b.word.length - a.word.length));
        
        // Reverse length-based sorting (shortest first)
        variations.push([...words].sort((a, b) => a.word.length - b.word.length));
        
        // Alphabetical sorting
        variations.push([...words].sort((a, b) => a.word.localeCompare(b.word)));
        
        // Reverse alphabetical sorting
        variations.push([...words].sort((a, b) => b.word.localeCompare(a.word)));
        
        // Try up to 20 different random permutations
        for (let i = 0; i < 20 && variations.length < 50; i++) {
            const shuffled = [...words];
            // Fisher-Yates shuffle with deterministic seed
            for (let j = shuffled.length - 1; j > 0; j--) {
                const k = Math.floor(((i * 31 + j * 17) % 1000) / 1000 * (j + 1));
                [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
            }
            variations.push(shuffled);
        }
        
        return variations;
    }

    /**
     * Generate different starting position variations
     * @returns {Array} Array of starting position objects
     */
    generateStartingPositionVariations() {
        const positions = [];
        const center = Math.floor(this.gridSize / 2);
        
        // Center positions (original)
        positions.push({ row: center, col: center, direction: 'across' });
        positions.push({ row: center, col: center, direction: 'down' });
        
        // Off-center positions
        const offsets = [-3, -2, -1, 1, 2, 3];
        for (const rowOffset of offsets) {
            for (const colOffset of offsets) {
                const row = Math.max(0, Math.min(this.gridSize - 1, center + rowOffset));
                const col = Math.max(0, Math.min(this.gridSize - 1, center + colOffset));
                positions.push({ row, col, direction: 'across' });
                positions.push({ row, col, direction: 'down' });
            }
        }
        
        return positions.slice(0, 20); // Limit to 20 positions
    }

    /**
     * Generate a single crossword attempt using a specific seed for systematic exploration
     * @param {string} mode - Generation mode: 'maxOverlap' or 'random'
     * @param {Object} seed - Seed object containing generation parameters
     * @returns {Object} Result object with placements and placed words
     */
    generateSingleCrosswordWithSeed(mode, seed) {
        const result = {
            placements: [],
            placedWords: new Set(),
            wordNumbers: {},
            currentNumber: 1
        };
        
        // Determine word order based on mode and seed
        let sortedWords;
        if (mode === 'random' && seed.randomSeed !== undefined) {
            // Use deterministic random based on seed
            sortedWords = [...this.words];
            this.deterministicShuffle(sortedWords, seed.randomSeed);
        } else if (seed.wordOrder) {
            // Use provided word order
            sortedWords = seed.wordOrder;
        } else {
            // Default: sort by length (longer first)
            sortedWords = [...this.words].sort((a, b) => b.word.length - a.word.length);
        }
        
        // Determine starting position
        const firstWord = sortedWords[0];
        let startRow, startCol, startDirection;
        
        if (seed.startingPosition) {
            startRow = seed.startingPosition.row;
            startCol = seed.startingPosition.col;
            startDirection = seed.startingPosition.direction;
            
            // Adjust if word doesn't fit
            if (startDirection === 'across' && startCol + firstWord.word.length > this.gridSize) {
                startCol = Math.max(0, this.gridSize - firstWord.word.length);
            }
            if (startDirection === 'down' && startRow + firstWord.word.length > this.gridSize) {
                startRow = Math.max(0, this.gridSize - firstWord.word.length);
            }
        } else {
            // Default center placement
            const centerRow = Math.floor(this.gridSize / 2);
            startRow = centerRow;
            startCol = Math.max(0, Math.floor((this.gridSize - firstWord.word.length) / 2));
            startDirection = 'across';
        }
        
        this.placeWordForResult(result, firstWord.word, firstWord.clue, startRow, startCol, startDirection);
        
        // Try to place remaining words
        for (let i = 1; i < sortedWords.length; i++) {
            const wordData = sortedWords[i];
            const word = wordData.word;
            
            if (result.placedWords.has(word)) continue;
            
            let bestPlacement = null;
            let bestScore = 0;
            
            // Try to intersect with existing words
            for (const existingPlacement of result.placements) {
                const possiblePlacements = this.getIntersectionPlacements(word, existingPlacement);
                
                for (const [startRow, startCol, direction] of possiblePlacements) {
                    let score;
                    
                    if (mode === 'random') {
                        // Random mode: use deterministic random scoring
                        const randomValue = this.deterministicRandom(seed.randomSeed + i * 37);
                        const intersections = this.findIntersections(word, existingPlacement.word).length;
                        score = randomValue * 100 + intersections * 10;
                    } else {
                        // Max overlap mode: prioritize maximum intersections
                        score = this.findIntersections(word, existingPlacement.word).length;
                    }
                    
                    if (score > bestScore) {
                        bestScore = score;
                        bestPlacement = [startRow, startCol, direction];
                    }
                }
            }
            
            if (bestPlacement) {
                const [startRow, startCol, direction] = bestPlacement;
                this.placeWordForResult(result, word, wordData.clue, startRow, startCol, direction);
            }
        }
        
        return result;
    }

    /**
     * Deterministic shuffle using a seed value
     * @param {Array} array - Array to shuffle in place
     * @param {number} seed - Seed value for deterministic randomness
     */
    deterministicShuffle(array, seed) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(this.deterministicRandom(seed + i) * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    /**
     * Generate deterministic random number from seed
     * @param {number} seed - Seed value
     * @returns {number} Pseudo-random number between 0 and 1
     */
    deterministicRandom(seed) {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }

    /**
     * Generate a single crossword attempt using the specified mode
     * @param {string} mode - Generation mode: 'maxOverlap' or 'random'
     * @returns {Object} Result object with placements and placed words
     */
    /**
     * Place a word in the result object (used during generation attempts)
     * @param {Object} result - Result object to modify
     * @param {string} word - Word to place
     * @param {string} clue - Clue for the word
     * @param {number} startRow - Starting row position
     * @param {number} startCol - Starting column position
     * @param {string} direction - Direction: 'across' or 'down'
     */
    placeWordForResult(result, word, clue, startRow, startCol, direction) {
        const placement = {
            word: word,
            clue: clue,
            startRow: startRow,
            startCol: startCol,
            direction: direction,
            number: result.currentNumber
        };
        
        result.placements.push(placement);
        result.wordNumbers[`${startRow}-${startCol}`] = result.currentNumber;
        result.currentNumber++;
        result.placedWords.add(word);
        
        // Place letters on grid
        for (let i = 0; i < word.length; i++) {
            if (direction === 'across') {
                this.grid[startRow][startCol + i] = word[i];
            } else {
                this.grid[startRow + i][startCol] = word[i];
            }
        }
    }

    /**
     * Score a crossword generation result
     * @param {Object} result - Result object to score
     * @returns {number} Score value (higher is better)
     */
    scoreCrosswordResult(result) {
        // Base score: number of words placed
        let score = result.placedWords.size * 100;
        
        // Bonus for intersections
        let intersectionCount = 0;
        for (let i = 0; i < result.placements.length; i++) {
            for (let j = i + 1; j < result.placements.length; j++) {
                intersectionCount += this.findIntersections(
                    result.placements[i].word, 
                    result.placements[j].word
                ).length;
            }
        }
        score += intersectionCount * 10;
        
        return score;
    }

    /**
     * Apply a generation result to the current crossword state
     * @param {Object} result - Result object to apply
     */
    applyGenerationResult(result) {
        this.placements = result.placements;
        this.wordNumbers = result.wordNumbers;
        this.currentNumber = result.currentNumber;
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
            this.showMessage('Generate a crossword first', 'error', false);
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

    /**
     * Display a message to the user with automatic cleanup
     * @param {string} text - Message text to display
     * @param {string} type - Message type: 'info', 'success', 'warning', 'error'
     * @param {boolean} useToast - Whether to use toast notification instead of inline message
     */
    showMessage(text, type = 'info', useToast = true) {
        if (useToast) {
            this.showToast(text, type);
        } else {
            this.showInlineMessage(text, type);
        }
        
        // Also log to console for debugging
        console.log(`Message (${type}): ${text}`);
    }

    /**
     * Show toast notification
     * @param {string} text - Message text
     * @param {string} type - Message type
     */
    showToast(text, type) {
        const toastContainer = document.getElementById('toastContainer');
        
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        // Add close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'toast-close';
        closeBtn.innerHTML = '×';
        closeBtn.onclick = () => this.removeToast(toast);
        
        // Add text content
        const textNode = document.createTextNode(text);
        toast.appendChild(textNode);
        toast.appendChild(closeBtn);
        
        // Add to container
        toastContainer.appendChild(toast);
        
        // Trigger animation
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        // Set timeout based on message type and length
        let timeout = 4000; // Default 4 seconds
        if (type === 'error') {
            timeout = 6000; // Errors stay longer (6 seconds)
        } else if (type === 'success') {
            timeout = 3000; // Success messages shorter (3 seconds)
        } else if (text.length > 80) {
            timeout = 6000; // Longer messages stay longer
        }
        
        // Auto-remove after timeout
        setTimeout(() => {
            this.removeToast(toast);
        }, timeout);
    }

    /**
     * Remove toast notification with animation
     * @param {HTMLElement} toast - Toast element to remove
     */
    removeToast(toast) {
        if (toast && toast.parentNode) {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300); // Wait for animation to complete
        }
    }

    /**
     * Show inline message (fallback for when toast is not desired)
     * @param {string} text - Message text
     * @param {string} type - Message type
     */
    showInlineMessage(text, type) {
        // Remove existing messages of the same type to prevent duplicates
        const existingMessages = document.querySelectorAll(`.message.${type}`);
        existingMessages.forEach(msg => msg.remove());
        
        const message = document.createElement('div');
        message.className = `message ${type}`;
        message.textContent = text;
        
        const inputSection = document.querySelector('.input-section');
        inputSection.appendChild(message);
        
        // Set timeout based on message type and length
        let timeout = 3000; // Default 3 seconds
        if (type === 'error') {
            timeout = 5000; // Errors stay longer (5 seconds)
        } else if (type === 'success') {
            timeout = 2000; // Success messages shorter (2 seconds)
        } else if (text.length > 50) {
            timeout = 4000; // Longer messages stay longer
        }
        
        // Auto-remove after timeout
        setTimeout(() => {
            if (message.parentNode) {
                message.remove();
            }
        }, timeout);
    }

    toggleAnswers() {
        if (this.placements.length === 0) {
            this.showMessage('Generate a crossword first', 'error', false);
            return;
        }

        this.showAnswers = !this.showAnswers;
        this.displayCrossword();
        
        const toggleBtn = document.getElementById('toggleAnswersBtn');
        toggleBtn.textContent = this.showAnswers ? '🙈 Hide Answers' : '👁️ Show Answers';
        
        this.showToast(
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
