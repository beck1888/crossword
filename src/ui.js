// src/ui.js

/**
 * Update the list of words displayed in the UI
 * @param {Object} context - The crossword generator instance
 */
export function updateWordsList(context) {
    const wordsList = document.getElementById('wordsList');
    const wordCount = document.getElementById('wordCount');
    
    wordCount.textContent = context.words.length;

    if (context.words.length === 0) {
        wordsList.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">No words added yet</p>';
        return;
    }

    wordsList.innerHTML = context.words.map((item, index) => `
        <div class="word-item">
            <div class="word-details">
                <div class="word-text">${item.word}</div>
                <div class="clue-text">${item.clue}</div>
            </div>
            <div>
                <button class="edit-btn" onclick="crosswordGenerator.editWord(${index})">Edit</button>
                <button class="remove-btn" onclick="crosswordGenerator.removeWord(${index})">Remove</button>
            </div>
        </div>
    `).join('');
}

/**
 * Update the state of buttons based on the application state
 * @param {Object} context - The crossword generator instance
 */
export function updateButtons(context) {
    const generateBtn = document.getElementById('generateBtn');
    const printBtn = document.getElementById('printBtn');
    const toggleAnswersBtn = document.getElementById('toggleAnswersBtn');
    
    generateBtn.disabled = context.words.length < 2;
    printBtn.disabled = context.placements.length === 0;
    toggleAnswersBtn.disabled = context.placements.length === 0;
}

/**
 * Enable or disable buttons during a process like generation
 * @param {Object} context - The crossword generator instance
 * @param {boolean} disabled - Whether the buttons should be disabled
 */
export function setButtonsDisabled(context, disabled) {
    const printBtn = document.getElementById('printBtn');
    const toggleAnswersBtn = document.getElementById('toggleAnswersBtn');
    const clearBtn = document.getElementById('clearBtn');
    const loadPresetBtn = document.getElementById('loadPresetBtn');
    const addWordBtn = document.getElementById('addWordBtn');
    
    printBtn.disabled = disabled || context.placements.length === 0;
    toggleAnswersBtn.disabled = disabled || context.placements.length === 0;
    clearBtn.disabled = disabled;
    loadPresetBtn.disabled = disabled;
    addWordBtn.disabled = disabled;
}

/**
 * Clear the crossword display
 */
export function clearCrosswordDisplay() {
    document.getElementById('crosswordGrid').innerHTML = '';
    document.getElementById('acrossClues').innerHTML = '';
    document.getElementById('downClues').innerHTML = '';
}

/**
 * Display the generated crossword grid
 * @param {Object} context - The crossword generator instance
 */
export function displayCrossword(context) {
    const gridElement = document.getElementById('crosswordGrid');
    gridElement.innerHTML = '';
    
    const { grid, showAnswers } = context;
    const { minRow, maxRow, minCol, maxCol } = getGridBounds(context);

    if (minRow === -1) return; // No words placed

    const numCols = maxCol - minCol + 1;
    gridElement.style.gridTemplateColumns = `repeat(${numCols}, 30px)`;

    for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
            const cell = document.createElement('div');
            cell.classList.add('grid-cell');
            if (grid[r] && grid[r][c]) {
                cell.classList.add('filled');
                const letterDiv = document.createElement('div');
                letterDiv.classList.add('letter');
                letterDiv.textContent = grid[r][c];
                cell.appendChild(letterDiv);

                if (context.wordNumbers[`${r}-${c}`]) {
                    const numberDiv = document.createElement('div');
                    numberDiv.classList.add('number');
                    numberDiv.textContent = context.wordNumbers[`${r}-${c}`];
                    cell.appendChild(numberDiv);
                }
                
                cell.classList.toggle('puzzle-mode', !showAnswers);
                cell.classList.toggle('with-answer', showAnswers);

            } else {
                cell.classList.add('empty');
            }
            gridElement.appendChild(cell);
        }
    }
}

/**
 * Display the clues for the crossword
 * @param {Object} context - The crossword generator instance
 */
export function displayClues(context) {
    const acrossClues = document.getElementById('acrossClues');
    const downClues = document.getElementById('downClues');
    acrossClues.innerHTML = '';
    downClues.innerHTML = '';

    const sortedPlacements = [...context.placements].sort((a, b) => a.number - b.number);

    sortedPlacements.forEach(p => {
        const clueItem = document.createElement('div');
        clueItem.classList.add('clue-item');
        clueItem.innerHTML = `<span class="clue-number">${p.number}.</span> <span class="clue-text">${p.clue}</span>`;
        if (p.direction === 'across') {
            acrossClues.appendChild(clueItem);
        } else {
            downClues.appendChild(clueItem);
        }
    });
}

/**
 * Create a printable version of the crossword
 * @param {Object} context - The crossword generator instance
 */
export function createPrintVersion(context) {
    const printGrid = document.getElementById('printGrid');
    const printAcrossClues = document.getElementById('printAcrossClues');
    const printDownClues = document.getElementById('printDownClues');

    // Clear previous content
    printGrid.innerHTML = '';
    printAcrossClues.innerHTML = '';
    printDownClues.innerHTML = '';

    const { grid, placements, wordNumbers } = context;
    const { minRow, maxRow, minCol, maxCol } = getGridBounds(context);

    if (minRow === -1) return; // No words placed

    const numCols = maxCol - minCol + 1;
    printGrid.style.gridTemplateColumns = `repeat(${numCols}, 30px)`;

    for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
            const cell = document.createElement('div');
            cell.classList.add('grid-cell');
            if (grid[r] && grid[r][c]) {
                cell.classList.add('filled');
                const letterDiv = document.createElement('div');
                letterDiv.classList.add('letter');
                letterDiv.textContent = grid[r][c];
                cell.appendChild(letterDiv);

                if (wordNumbers[`${r}-${c}`]) {
                    const numberDiv = document.createElement('div');
                    numberDiv.classList.add('number');
                    numberDiv.textContent = wordNumbers[`${r}-${c}`];
                    cell.appendChild(numberDiv);
                }
            } else {
                cell.classList.add('empty');
            }
            printGrid.appendChild(cell);
        }
    }

    // Clone the clues
    printAcrossClues.innerHTML = document.getElementById('acrossClues').innerHTML;
    printDownClues.innerHTML = document.getElementById('downClues').innerHTML;

    // Remove answers for printing by making them transparent
    printGrid.querySelectorAll('.letter').forEach(l => l.style.color = 'transparent');
}

/**
 * Get the bounding box of the placed words in the grid
 * @param {Object} context - The crossword generator instance
 * @returns {Object} - { minRow, maxRow, minCol, maxCol }
 */
function getGridBounds(context) {
    let minRow = -1, maxRow = -1, minCol = -1, maxCol = -1;

    if (context.placements.length === 0) {
        return { minRow, maxRow, minCol, maxCol };
    }

    context.placements.forEach(p => {
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

/**
 * Populate the preset select dropdown with options from the configuration
 * @param {Object} context - The crossword generator instance
 */
export function populatePresetSelect(context) {
    const presetSelect = document.getElementById('presetSelect');
    
    while (presetSelect.children.length > 1) {
        presetSelect.removeChild(presetSelect.lastChild);
    }
    
    if (context.config && context.config.presets) {
        for (const [presetKey, presetConfig] of Object.entries(context.config.presets)) {
            const option = document.createElement('option');
            option.value = presetKey;
            option.textContent = presetConfig.displayName;
            presetSelect.appendChild(option);
        }
    }
}
