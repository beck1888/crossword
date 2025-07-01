import { loadConfiguration } from './src/config.js';
import { generateCrosswordWithSystematicAttempts } from './src/generator.js';
import { 
    updateWordsList, 
    updateButtons, 
    setButtonsDisabled, 
    clearCrosswordDisplay, 
    displayCrossword, 
    displayClues, 
    createPrintVersion,
    populatePresetSelect
} from './src/ui.js';

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
        this.editingIndex = -1; // Track which word is being edited (-1 means not editing)
        
        // Load configuration first, then initialize everything else
        this.loadConfiguration();
    }

    /**
     * Load configuration from server-config.json
     * This must be called before initializing other components
     */
    async loadConfiguration() {
        this.config = await loadConfiguration();
        
        // Update grid size from config with validation
        const gridConfig = this.config.gridSize;
        this.gridSize = Math.max(gridConfig.min, Math.min(gridConfig.max, gridConfig.default));
        
        // Mark configuration as loaded
        this.configLoaded = true;
        
        // Now initialize everything else
        this.initializeGrid();
        this.setupEventListeners();
        this.populatePresetSelect();
        
        console.log('Configuration loaded successfully');
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

        // Allow Enter key to add words and Escape to cancel edit
        [wordInput, clueInput].forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.addWord();
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.editingIndex >= 0) {
                    this.cancelEdit();
                }
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
            console.log('Please enter both word and clue');
            return;
        }

        if (word.length > this.config.gridSize.max) {
            console.log(`Word must be ${this.config.gridSize.max} characters or less`);
            return;
        }

        if (!/^[A-Z]+$/.test(word)) {
            console.log('Word must contain only letters');
            return;
        }

        // Check for duplicates, but allow editing the same word
        if (this.words.some((w, index) => w.word === word && index !== this.editingIndex)) {
            console.log('Word already added');
            return;
        }

        if (this.editingIndex >= 0) {
            // Update existing word
            this.words[this.editingIndex] = { word, clue };
            this.editingIndex = -1; // Reset editing state
            
            // Update button text back to "Add Word"
            document.getElementById('addWordBtn').textContent = 'Add Word';
        } else {
            // Add new word
            this.words.push({ word, clue });
        }

        this.updateWordsList();
        this.updateButtons();
        
        // Clear any existing crossword display since word list changed
        this.clearCrosswordDisplay();
        
        // Clear inputs
        wordInput.value = '';
        clueInput.value = '';
        wordInput.focus();
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
            console.log('Please select a preset theme');
            return;
        }

        // Ensure configuration is loaded
        if (!this.configLoaded) {
            console.log('Configuration is still loading, please try again in a moment');
            return;
        }

        // Validate configuration exists
        if (!this.config.presets || !this.config.presets[selectedPreset]) {
            console.error('Available presets:', Object.keys(this.config.presets || {}));
            console.log(`Theme "${selectedPreset}" not found in configuration`);
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
            console.log(`Loaded ${displayName} theme with ${this.words.length} words. Press "Generate Crossword" to create puzzle.`);

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
            
            console.log(errorMessage);
            
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
        populatePresetSelect(this);
    }

    updateWordsList() {
        updateWordsList(this);
    }

    editWord(index) {
        const wordInput = document.getElementById('wordInput');
        const clueInput = document.getElementById('clueInput');
        const addWordBtn = document.getElementById('addWordBtn');
        
        // Populate inputs with existing word data
        wordInput.value = this.words[index].word;
        clueInput.value = this.words[index].clue;
        
        // Set editing state
        this.editingIndex = index;
        
        // Change button text to indicate editing
        addWordBtn.textContent = 'Update Word';
        
        // Focus on word input
        wordInput.focus();
        wordInput.select();
    }

    removeWord(index) {
        // If we're currently editing this word, cancel the edit
        if (this.editingIndex === index) {
            this.cancelEdit();
        } else if (this.editingIndex > index) {
            // Adjust editing index if removing a word before the one being edited
            this.editingIndex--;
        }
        
        this.words.splice(index, 1);
        this.updateWordsList();
        this.updateButtons();
        
        // Clear crossword display since word list changed
        this.clearCrosswordDisplay();
    }

    cancelEdit() {
        const wordInput = document.getElementById('wordInput');
        const clueInput = document.getElementById('clueInput');
        const addWordBtn = document.getElementById('addWordBtn');
        
        // Clear inputs
        wordInput.value = '';
        clueInput.value = '';
        
        // Reset editing state
        this.editingIndex = -1;
        
        // Reset button text
        addWordBtn.textContent = 'Add Word';
    }

    updateButtons() {
        updateButtons(this);
    }

    /**
     * Enable or disable buttons during generation process
     * @param {boolean} disabled - Whether buttons should be disabled
     */
    setButtonsDisabled(disabled) {
        setButtonsDisabled(this, disabled);
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
        clearCrosswordDisplay();
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
            console.log('Need at least 2 words to generate crossword');
            return;
        }

        // Clear any existing crossword display immediately
        this.clearCrosswordDisplay();

        // Get generation options from config
        const generationMode = this.config?.generation?.mode || 'maxOverlap';
        const enforceAllWords = this.config?.generation?.enforceAllWords !== false;
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
        setTimeout(async () => {
            const { bestResult, attempts, foundPerfectSolution, timeElapsed } = await generateCrosswordWithSystematicAttempts(
                this, 
                generationMode, 
                enforceAllWords, 
                maxAttempts, 
                timeoutSeconds,
                generateBtn,
                originalText
            );

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
            
            // Clear any existing progress messages and show final result
            if (foundPerfectSolution) {
                // Perfect solution found
                console.log(`Perfect solution found! All ${placedCount} words placed after ${attempts} attempts (${timeElapsed}s)`);
            } else if (placedCount === totalCount) {
                // All words placed
                console.log(`Successfully generated crossword with all ${placedCount} words after ${attempts} attempts (${timeElapsed}s)`);
            } else if (placedCount > 0 && enforceAllWords && attempts > 1) {
                // Partial solution with multiple attempts
                console.log(`Best result: ${placedCount} out of ${totalCount} words after ${attempts} attempts (${timeElapsed}s)`);
            } else if (placedCount > 0) {
                // Partial solution
                console.log(`Generated crossword with ${placedCount} out of ${totalCount} words`);
            } else {
                // No solution found
                console.log(`Unable to generate crossword with current words after ${attempts} attempts (${timeElapsed}s). Try different words or fewer words.`);
            }
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
            console.log('Systematically exploring all possible arrangements...', 'info');
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
            // Perfect solution found
            console.log(`Perfect solution found! All ${placedCount} words placed after ${attempts} attempts (${timeElapsed}s)`);
        } else if (placedCount === totalCount) {
            // All words placed
            console.log(`Successfully generated crossword with all ${placedCount} words after ${attempts} attempts (${timeElapsed}s)`);
        } else if (placedCount > 0 && enforceAllWords && attempts > 1) {
            // Partial solution with multiple attempts
            console.log(`Best result: ${placedCount} out of ${totalCount} words after ${attempts} attempts (${timeElapsed}s)`);
        } else if (placedCount > 0) {
            // Partial solution
            console.log(`Generated crossword with ${placedCount} out of ${totalCount} words`);
        } else {
            // No solution found
            console.log(`Unable to generate crossword with current words after ${attempts} attempts (${timeElapsed}s). Try different words or fewer words.`);
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
        
        // Add a few random shuffles for variety
        for (let i = 0; i < 3; i++) {
            variations.push(this.deterministicShuffle([...words], i));
        }
        
        return variations;
    }

    /**
     * Generate different starting position variations
     * @returns {Array} Array of starting position objects
     */
    generateStartingPositionVariations() {
        const variations = [];
        const center = Math.floor(this.gridSize / 2);
        
        // Center of the grid
        variations.push({ startRow: center, startCol: center });
        
        // Top-left corner
        variations.push({ startRow: 0, startCol: 0 });
        
        // Other strategic positions can be added here
        
        return variations;
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
            grid: Array(this.gridSize).fill().map(() => Array(this.gridSize).fill('')),
            wordNumbers: {},
            currentNumber: 1,
        };

        // Get words to place based on seed or default sorting
        let wordsToPlace = seed.wordOrder ? [...seed.wordOrder] : [...this.words].sort((a, b) => b.word.length - a.word.length);

        // If random mode, shuffle the words
        if (mode === 'random') {
            this.deterministicShuffle(wordsToPlace, seed.wordOrderSeed);
        }

        if (wordsToPlace.length === 0) return result;

        // Place the first word at a specific or default starting position
        const firstWord = wordsToPlace.shift();
        const startPos = seed.startingPosition || { startRow: Math.floor(this.gridSize / 2), startCol: Math.floor(this.gridSize / 2) };
        
        this.placeWordForResult(result, firstWord.word, firstWord.clue, startPos.startRow, startPos.startCol, 'across');

        // Iteratively place remaining words
        let placedSomething = true;
        while (placedSomething && wordsToPlace.length > 0) {
            placedSomething = false;
            wordsToPlace = wordsToPlace.filter(wordObj => {
                if (result.placedWords.has(wordObj.word)) return false; // Already placed

                let bestPlacement = null;
                let maxIntersections = -1;

                // Find the best intersection point
                for (const existingPlacement of result.placements) {
                    const placements = this.getIntersectionPlacements(result.grid, wordObj.word, existingPlacement);
                    for (const [startRow, startCol, direction] of placements) {
                        if (mode === 'maxOverlap') {
                            const intersections = this.findIntersections(wordObj.word, existingPlacement.word).length;
                            if (intersections > maxIntersections) {
                                maxIntersections = intersections;
                                bestPlacement = { startRow, startCol, direction };
                            }
                        } else {
                            // For random mode, take the first valid placement
                            bestPlacement = { startRow, startCol, direction };
                            break;
                        }
                    }
                    if (mode === 'random' && bestPlacement) break;
                }

                // Place the word if a valid position was found
                if (bestPlacement) {
                    this.placeWordForResult(result, wordObj.word, wordObj.clue, bestPlacement.startRow, bestPlacement.startCol, bestPlacement.direction);
                    placedSomething = true;
                    return false; // Word is placed, remove from wordsToPlace
                }
                return true; // Word not placed, keep in wordsToPlace
            });
        }

        return result;
    }

    /**
     * Deterministic shuffle using a seed value
     * @param {Array} array - Array to shuffle in place
     * @param {number} seed - Seed value for deterministic randomness
     */
    deterministicShuffle(array, seed) {
        let currentIndex = array.length;
        let temporaryValue, randomIndex;

        // Simple pseudo-random number generator from seed
        const random = () => {
            var x = Math.sin(seed++) * 10000;
            return x - Math.floor(x);
        };

        // While there remain elements to shuffle...
        while (currentIndex !== 0) {
            // Pick a remaining element...
            randomIndex = Math.floor(random() * currentIndex);
            currentIndex -= 1;

            // And swap it with the current element.
            temporaryValue = array[currentIndex];
            array[currentIndex] = array[randomIndex];
            array[randomIndex] = temporaryValue;
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
        result.placedWords.add(word);
        result.wordNumbers[`${startRow}-${startCol}`] = result.currentNumber++;
        
        // Place letters on grid
        for (let i = 0; i < word.length; i++) {
            if (direction === 'across') {
                result.grid[startRow][startCol + i] = word[i];
            } else {
                result.grid[startRow + i][startCol] = word[i];
            }
        }
    }

    /**
     * Score a crossword generation result
     * @param {Object} result - Result object to score
     * @returns {number} Score value (higher is better)
     */
    scoreCrosswordResult(result) {
        // Simple score: number of words placed squared to prioritize more complete crosswords
        let score = result.placements.length * 100;
        
        // Bonus for density (less empty space)
        const { minRow, maxRow, minCol, maxCol } = this.getGridBounds(result.placements);
        if (minRow !== -1) {
            const area = (maxRow - minRow + 1) * (maxCol - minCol + 1);
            const filledCount = result.grid.flat().filter(c => c !== '').length;
            if (area > 0) {
                score += (filledCount / area) * 50;
            }
        }
        
        return score;
    }

    /**
     * Apply a generation result to the current crossword state
     * @param {Object} result - Result object to apply
     */
    applyGenerationResult(result) {
        this.grid = result.grid;
        this.placements = result.placements;
        this.wordNumbers = result.wordNumbers;
        this.currentNumber = result.currentNumber;
    }

    getGridBounds() {
        let minRow = -1, maxRow = -1, minCol = -1, maxCol = -1;

        if (this.placements.length === 0) {
            return { minRow, maxRow, minCol, maxCol };
        }

        this.placements.forEach(p => {
            if (minRow === -1) {
                minRow = maxRow = p.startRow;
                minCol = maxCol = p.startCol;
            }
            minRow = Math.min(minRow, p.startRow);
            maxRow = Math.max(maxRow, p.startRow + (p.direction === 'down' ? p.word.length - 1 : 0));
            minCol = Math.min(minCol, p.startCol);
            maxCol = Math.max(maxCol, p.startCol + (p.direction === 'across' ? p.word.length - 1 : 0));
        });

        return { minRow, maxRow, minCol, maxCol };
    }

    displayCrossword() {
        displayCrossword(this);
    }

    displayClues() {
        displayClues(this);
    }

    printCrossword() {
        this.createPrintVersion();
        window.print();
    }

    createPrintVersion() {
        createPrintVersion(this);
    }

    toggleAnswers() {
        this.showAnswers = !this.showAnswers;
        this.displayCrossword();
        
        const toggleBtn = document.getElementById('toggleAnswersBtn');
        toggleBtn.textContent = this.showAnswers ? '🙈 Hide Answers' : '👁️ Show Answers';
    }
}

// Initialize the crossword generator when page loads
let crosswordGenerator;

document.addEventListener('DOMContentLoaded', () => {
    crosswordGenerator = new CrosswordGenerator();
    window.crosswordGenerator = crosswordGenerator; // Make it accessible for inline event handlers
});
