# Crossword Generator

A web-based crossword puzzle generator that creates printable crossword puzzles with configurable generation modes and word overlap optimization.

## Features

- **Interactive Word Management**: Add words and clues manually or load from preset themes
- **Multiple Generation Modes**: Choose between maximum overlap and random placement strategies
- **Configurable Options**: Enforce using all words with multiple generation attempts
- **Preset Themes**: Pre-loaded word lists for common topics (Animals, Colors, Countries, Sports)
- **Print-Ready Output**: Generate clean, printable crossword puzzles with separate answer keys
- **Answer Toggle**: Show/hide answers for puzzle solving or answer key generation
- **Responsive Design**: Clean, simple interface that works on desktop and mobile devices

## Getting Started

1. **Setup**: An HTTP server is already running on port 8000
2. **Open**: Navigate to the crossword generator in your web browser
3. **Add Words**: Enter words and clues manually or select a preset theme
4. **Configure**: Choose generation options (mode and word enforcement)
5. **Generate**: Create your crossword puzzle
6. **Print**: Use the print function to create physical copies

## Configuration Options

The application is configured through the `server-config.json` file, which contains the following options:

### Grid Size Configuration

```json
"gridSize": {
    "default": 25,
    "min": 10,
    "max": 50
}
```

- **default**: Default grid size used when the application loads (25x25)
- **min**: Minimum allowed grid size (10x10)
- **max**: Maximum allowed grid size (50x50)

### Generation Configuration

```json
"generation": {
    "mode": "maxOverlap",
    "enforceAllWords": true,
    "maxAttempts": 1000,
    "timeoutSeconds": 10
}
```

- **mode**: Default generation mode for new crosswords
  - `"maxOverlap"`: Prioritizes maximum word intersections for compact puzzles
  - `"random"`: Uses random placement with some intersection bias for varied layouts
- **enforceAllWords**: Whether to attempt using all provided words (boolean)
  - `true`: Systematically try multiple generation approaches to include all words
  - `false`: Accept partial word placement on first attempt
- **maxAttempts**: Maximum number of generation attempts when enforcing all words (1-1000 recommended)
- **timeoutSeconds**: Maximum time in seconds to spend on systematic generation (1-30 recommended)

### Preset Themes Configuration

```json
"presets": {
    "animals": {
        "displayName": "Animals",
        "filePath": "public/animals.txt"
    },
    "colors": {
        "displayName": "Colors", 
        "filePath": "public/colors.txt"
    }
}
```

- **Key**: Internal identifier for the preset (used in code)
- **displayName**: User-friendly name shown in the interface
- **filePath**: Path to the text file containing words and clues

## Preset File Format

Preset files should be stored in the `public/` directory and use the following format:

```
WORD;Clue description
ELEPHANT;Large mammal with trunk
TIGER;Striped big cat
PENGUIN;Flightless Antarctic bird
```

- Each line contains one word-clue pair
- Word and clue are separated by a semicolon (`;`)
- Words are automatically converted to uppercase
- Empty lines are ignored
- Lines without semicolons are skipped

## Generation Modes

### Maximum Overlap Mode (`maxOverlap`)
- **Strategy**: Prioritizes creating the most word intersections possible
- **Benefits**: Creates compact, well-connected puzzles
- **Use Case**: Traditional crossword puzzles with maximum word density
- **Algorithm**: Sorts words by length, then seeks placements with maximum intersections

### Random Mode (`random`)
- **Strategy**: Uses randomized placement with intersection bias
- **Benefits**: Creates varied layouts, more unpredictable puzzle shapes
- **Use Case**: Creative puzzles, educational activities, varied difficulty
- **Algorithm**: Randomizes word order and placement scoring for different results each time

## Word Enforcement Options

### Enforce All Words (`enforceAllWords: true`)
- **Behavior**: Systematically explores different generation approaches to include all provided words
- **Process**: Tries multiple word orderings, starting positions, and placement strategies within time limit
- **Algorithm**: Uses deterministic variations to ensure comprehensive exploration of possibilities
- **Timeout**: Stops after specified time limit (default 10 seconds) or when perfect solution is found
- **Progress**: Shows real-time progress with attempt counter and loading spinner
- **Trade-off**: Takes longer but maximizes word usage through systematic exploration

### Best Effort (`enforceAllWords: false`)
- **Behavior**: Accepts the first generation attempt result
- **Process**: Single generation pass using selected mode, may not place all words
- **Speed**: Immediate results with minimal processing time
- **Trade-off**: Faster generation but may leave some words unused in difficult layouts

## Systematic Generation Process

When **Enforce All Words** is enabled, the generator uses a sophisticated systematic approach:

### Word Order Variations
- **Length-based**: Longest words first (traditional approach)
- **Reverse length**: Shortest words first 
- **Alphabetical**: A-Z ordering for consistent results
- **Reverse alphabetical**: Z-A ordering
- **Deterministic permutations**: Multiple shuffled arrangements using seeds

### Starting Position Variations  
- **Center positions**: Traditional center-based placement (across/down)
- **Off-center positions**: Various grid positions to find optimal starting points
- **Direction variations**: Both horizontal and vertical starting orientations

### Generation Modes with Systematic Approach

#### Maximum Overlap + Systematic
- **Strategy**: Tests different word orders and positions to maximize intersections
- **Exploration**: Tries various starting positions and word arrangements
- **Optimization**: Seeks the arrangement with highest intersection density

#### Random + Systematic  
- **Strategy**: Uses deterministic random seeds for reproducible variation
- **Exploration**: Generates multiple random arrangements with controlled randomness
- **Diversity**: Creates varied layouts while maintaining systematic coverage

### Performance and Timeout Handling
- **Real-time Progress**: Shows attempt counter during generation
- **Time Limit**: Configurable timeout (default 10 seconds) prevents infinite loops
- **Early Termination**: Stops immediately when perfect solution (all words placed) is found
- **Best Result Selection**: Always returns the best solution found within time constraints

## User Interface Elements

### Word Input Section
- **Word Input**: Text field for entering words (letters only, auto-uppercase)
- **Clue Input**: Text field for entering corresponding clues
- **Add Word Button**: Adds the word-clue pair to the current list
- **Word List**: Displays all added words with removal options

### Preset Section
- **Theme Selector**: Dropdown with configured preset themes
- **Load Preset Button**: Loads selected theme words into the current list

### Generation Options
- **Generation Mode**: Dropdown selector for generation strategy
  - Maximum Overlap: Traditional crossword optimization
  - Random: Randomized placement for variety
- **Enforce All Words**: Checkbox to enable/disable multiple generation attempts
  - Checked: Try multiple times to use all words
  - Unchecked: Accept first generation result

### Control Buttons
- **Generate Crossword**: Creates the puzzle using current words and settings
- **Show/Hide Answers**: Toggles answer visibility in the generated puzzle
- **Clear All**: Removes all words and resets the interface
- **Print Crossword**: Opens print dialog for clean puzzle output

## Technical Details

### File Structure
```
crossword/
├── index.html          # Main application interface
├── crossword.js        # Core crossword generation logic
├── styles.css          # Application styling
├── server-config.json  # Configuration file
└── public/             # Preset word files
    ├── animals.txt
    ├── colors.txt
    ├── countries.txt
    └── sports.txt
```

### Key Classes and Methods

#### CrosswordGenerator Class
- **loadConfiguration()**: Loads and applies server configuration
- **generateCrossword()**: Main generation method with mode support
- **generateSingleCrossword()**: Single attempt generation logic
- **scoreCrosswordResult()**: Evaluates generation attempt quality
- **placeWord()**: Places word on grid with intersection validation
- **findIntersections()**: Calculates possible word intersections

### Browser Compatibility
- **Modern Browsers**: Chrome, Firefox, Safari, Edge (recent versions)
- **Requirements**: ES6+ support, Fetch API, CSS Grid
- **Print Support**: Standard browser print functionality

## Customization

### Adding New Presets
1. Create a new text file in the `public/` directory
2. Format content as `WORD;Clue description` pairs
3. Add configuration entry to `server-config.json`:
   ```json
   "newtheme": {
       "displayName": "New Theme",
       "filePath": "public/newtheme.txt"
   }
   ```

### Modifying Generation Behavior
- **Adjust scoring**: Modify `scoreCrosswordResult()` method
- **Change placement logic**: Update `generateSingleCrossword()` method
- **Add new modes**: Extend mode handling in generation methods

### Styling Customization
- **Colors**: Update color values in `styles.css`
- **Layout**: Modify CSS Grid and Flexbox properties
- **Print styles**: Adjust `.print-only` and `@media print` rules

## Troubleshooting

### Common Issues

**Configuration Not Loading**
- Check `server-config.json` syntax with a JSON validator
- Verify file permissions and server access
- Check browser console for error messages

**Preset Files Not Loading**
- Confirm file paths in configuration match actual file locations
- Verify files are in the `public/` directory
- Check file encoding (UTF-8 recommended)
- Wait for configuration to fully load before selecting presets

**Preset Loading Errors**
- **"Configuration is still loading"**: Wait a moment and try again
- **"Theme not found"**: Check that preset is defined in server-config.json
- **"Unable to load theme file"**: Verify file exists and is accessible
- **"Theme file appears to be empty"**: Check file format and content
- **"Network error loading theme"**: Check internet connection and server status

**Generation Performance**
- Reduce `maxAttempts` for faster generation
- Use fewer words for complex layouts
- Try different generation modes

**Print Issues**
- Use browser's built-in print preview
- Check print styles in CSS
- Ensure adequate page margins

### Error Messages

- **"Need at least 2 words"**: Add more words before generating
- **"Failed to load configuration"**: Check server-config.json file
- **"Failed to load preset"**: Verify preset file exists and is accessible
- **"Word must contain only letters"**: Remove numbers and special characters
- **"Word already added"**: Each word can only be added once

### Message System

The application uses a smart message system:
- **Error messages**: Display for 5 seconds (red)
- **Warning messages**: Display for 3 seconds (orange)
- **Success messages**: Display for 2 seconds (green)
- **Info messages**: Display for 3-4 seconds (blue)
- **Duplicate prevention**: Same message types replace previous ones
- **Console logging**: All messages are logged for debugging
