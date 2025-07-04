// src/generator.js
import { deterministicShuffle } from './utils.js';

/**
 * Generate crossword with systematic attempts and timeout handling
 * @param {Object} context - The crossword generator instance
 * @param {string} generationMode - Generation mode to use
 * @param {boolean} enforceAllWords - Whether to enforce using all words
 * @param {number} maxAttempts - Maximum number of attempts
 * @param {number} timeoutSeconds - Timeout in seconds
 * @param {HTMLElement} generateBtn - Generate button element
 * @param {string} originalText - Original button text
 */
export async function generateCrosswordWithSystematicAttempts(context, generationMode, enforceAllWords, maxAttempts, timeoutSeconds, generateBtn, originalText) {
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;
    
    let bestResult = null;
    let bestScore = 0;
    let attempts = 0;
    let foundPerfectSolution = false;
    
    const totalAttempts = enforceAllWords ? maxAttempts : 1;
    
    if (enforceAllWords) {
        console.log('Systematically exploring all possible arrangements...', 'info');
    }
    
    const seedCombinations = generateSeedCombinations(context, generationMode);
    
    for (let seedIndex = 0; seedIndex < seedCombinations.length && attempts < totalAttempts; seedIndex++) {
        if (Date.now() - startTime > timeoutMs) {
            console.log(`Generation timeout after ${attempts} attempts`);
            break;
        }
        
        attempts++;
        
        if (attempts % 10 === 0 && enforceAllWords) {
            generateBtn.innerHTML = `Attempt ${attempts}/${totalAttempts}... <span class="loading"></span>`;
            await new Promise(resolve => setTimeout(resolve, 1));
        }
        
        context.reset();
        const result = generateSingleCrosswordWithSeed(context, generationMode, seedCombinations[seedIndex]);
        
        const score = scoreCrosswordResult(result);
        
        if (result.placedWords.size === context.words.length) {
            bestResult = result;
            foundPerfectSolution = true;
            console.log(`Found perfect solution after ${attempts} attempts`);
            break;
        }
        
        if (score > bestScore) {
            bestScore = score;
            bestResult = result;
        }
    }
    
    if (bestResult) {
        context.applyGenerationResult(bestResult);
    }
    
    if (!foundPerfectSolution && bestResult && bestResult.placedWords.size < context.words.length) {
        const unplacedWordsCount = context.words.length - bestResult.placedWords.size;
        console.warn(`Warning: Could not place ${unplacedWordsCount} word(s) in the crossword.`);
    }

    return { bestResult, attempts, foundPerfectSolution, timeElapsed: ((Date.now() - startTime) / 1000).toFixed(1) };
}

/**
 * Generate seed combinations for systematic exploration
 * @param {Object} context - The crossword generator instance
 * @param {string} generationMode - Generation mode to use
 * @returns {Array} Array of seed objects for systematic attempts
 */
function generateSeedCombinations(context, generationMode) {
    const seeds = [];
    
    if (generationMode === 'random') {
        for (let i = 0; i < 1000; i++) {
            seeds.push({ randomSeed: Math.random(), wordOrderSeed: Math.random() });
        }
    } else {
        const wordPermutations = generateWordOrderVariations(context);
        const startingPositions = generateStartingPositionVariations(context);
        
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
 * @param {Object} context - The crossword generator instance
 * @returns {Array} Array of word order arrays
 */
function generateWordOrderVariations(context) {
    const variations = [];
    const words = [...context.words];
    
    variations.push([...words].sort((a, b) => b.word.length - a.word.length));
    variations.push([...words].sort((a, b) => a.word.length - b.word.length));
    variations.push([...words].sort((a, b) => a.word.localeCompare(b.word)));
    variations.push([...words].sort((a, b) => b.word.localeCompare(a.word)));
    
    return variations;
}

/**
 * Generate different starting position variations
 * @param {Object} context - The crossword generator instance
 * @returns {Array} Array of starting position objects
 */
function generateStartingPositionVariations(context) {
    const variations = [];
    const center = Math.floor(context.gridSize / 2);
    
    variations.push({ startRow: center, startCol: center });
    variations.push({ startRow: 0, startCol: 0 });
    
    return variations;
}

/**
 * Generate a single crossword attempt using a specific seed for systematic exploration
 * @param {Object} context - The crossword generator instance
 * @param {string} mode - Generation mode: 'maxOverlap' or 'random'
 * @param {Object} seed - Seed object containing generation parameters
 * @returns {Object} Result object with placements and placed words
 */
function generateSingleCrosswordWithSeed(context, mode, seed) {
    const result = {
        placements: [],
        placedWords: new Set(),
        grid: Array(context.gridSize).fill().map(() => Array(context.gridSize).fill('')),
        wordNumbers: {},
        currentNumber: 1,
    };

    let wordsToPlace = seed.wordOrder ? [...seed.wordOrder] : [...context.words];

    if (mode === 'random') {
        deterministicShuffle(wordsToPlace, seed.wordOrderSeed);
    }

    if (wordsToPlace.length === 0) return result;

    const firstWord = wordsToPlace.shift();
    const startPos = seed.startingPosition || { startRow: Math.floor(context.gridSize / 2), startCol: Math.floor(context.gridSize / 2) };
    
    placeWordForResult(result, firstWord.word, firstWord.clue, startPos.startRow, startPos.startCol, 'across');

    let placedSomething = true;
    while (placedSomething && wordsToPlace.length > 0) {
        placedSomething = false;
        wordsToPlace = wordsToPlace.filter(wordObj => {
            if (result.placedWords.has(wordObj.word)) return false;

            let bestPlacement = null;
            let maxIntersections = -1;

            for (const existingPlacement of result.placements) {
                const placements = getIntersectionPlacements(context, result.grid, wordObj.word, existingPlacement);
                for (const [startRow, startCol, direction] of placements) {
                    if (mode === 'maxOverlap') {
                        const intersections = findIntersections(wordObj.word, existingPlacement.word).length;
                        if (intersections > maxIntersections) {
                            maxIntersections = intersections;
                            bestPlacement = { startRow, startCol, direction };
                        }
                    } else {
                        bestPlacement = { startRow, startCol, direction };
                        break;
                    }
                }
                if (mode === 'random' && bestPlacement) break;
            }

            if (bestPlacement) {
                placeWordForResult(result, wordObj.word, wordObj.clue, bestPlacement.startRow, bestPlacement.startCol, bestPlacement.direction);
                placedSomething = true;
                return false; // Word is placed, remove from wordsToPlace
            }
            return true; // Word not placed, keep in wordsToPlace
        });
    }

    return result;
}

/**
 * Place a word in the result object (used during generation attempts)
 * @param {Object} result - Result object to modify
 * @param {string} word - Word to place
 * @param {string} clue - Clue for the word
 * @param {number} startRow - Starting row position
 * @param {number} startCol - Starting column position
 * @param {string} direction - Direction: 'across' or 'down'
 */
function placeWordForResult(result, word, clue, startRow, startCol, direction) {
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
function scoreCrosswordResult(result) {
    let score = result.placements.length * 100; // Base score for number of words
    // Add more scoring logic if needed (e.g., density, number of intersections)
    return score;
}


function findIntersections(word1, word2) {
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

function canPlaceWord(context, grid, word, startRow, startCol, direction) {
    if (direction === 'across') {
        if (startCol + word.length > context.gridSize) return false;
        
        for (let i = 0; i < word.length; i++) {
            const row = startRow;
            const col = startCol + i;
            
            if (grid[row][col] !== '' && grid[row][col] !== word[i]) {
                return false;
            }
            
            if (grid[row][col] === '') {
                if (row > 0 && grid[row - 1][col] !== '') return false;
                if (row < context.gridSize - 1 && grid[row + 1][col] !== '') return false;
            }
        }
        
        if (startCol > 0 && grid[startRow][startCol - 1] !== '') return false;
        if (startCol + word.length < context.gridSize && grid[startRow][startCol + word.length] !== '') return false;
        
    } else { // down
        if (startRow + word.length > context.gridSize) return false;
        
        for (let i = 0; i < word.length; i++) {
            const row = startRow + i;
            const col = startCol;
            
            if (grid[row][col] !== '' && grid[row][col] !== word[i]) {
                return false;
            }
            
            if (grid[row][col] === '') {
                if (col > 0 && grid[row][col - 1] !== '') return false;
                if (col < context.gridSize - 1 && grid[row][col + 1] !== '') return false;
            }
        }
        
        if (startRow > 0 && grid[startRow - 1][startCol] !== '') return false;
        if (startRow + word.length < context.gridSize && grid[startRow + word.length][startCol] !== '') return false;
    }
    
    return true;
}

function getIntersectionPlacements(context, grid, newWord, existingPlacement) {
    const placements = [];
    const intersections = findIntersections(newWord, existingPlacement.word);
    
    for (const [newIdx, existingIdx] of intersections) {
        if (existingPlacement.direction === 'across') {
            const newStartRow = existingPlacement.startRow - newIdx;
            const newStartCol = existingPlacement.startCol + existingIdx;
            const newDirection = 'down';
            
            if (newStartRow >= 0 && 
                newStartRow + newWord.length <= context.gridSize &&
                canPlaceWord(context, grid, newWord, newStartRow, newStartCol, newDirection)) {
                placements.push([newStartRow, newStartCol, newDirection]);
            }
        } else {
            const newStartRow = existingPlacement.startRow + existingIdx;
            const newStartCol = existingPlacement.startCol - newIdx;
            const newDirection = 'across';
            
            if (newStartCol >= 0 && 
                newStartCol + newWord.length <= context.gridSize &&
                canPlaceWord(context, grid, newWord, newStartRow, newStartCol, newDirection)) {
                placements.push([newStartRow, newStartCol, newDirection]);
            }
        }
    }
    
    return placements;
}
