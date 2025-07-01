// src/utils.js

/**
 * Deterministic shuffle using a seed value
 * @param {Array} array - Array to shuffle in place
 * @param {number} seed - Seed value for deterministic randomness
 */
export function deterministicShuffle(array, seed) {
    let currentIndex = array.length;
    let temporaryValue, randomIndex;

    // Simple pseudo-random number generator from seed
    const random = () => {
        var x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    };

    while (currentIndex !== 0) {
        randomIndex = Math.floor(random() * currentIndex);
        currentIndex -= 1;

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
export function deterministicRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}
