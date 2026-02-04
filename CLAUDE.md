# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm install              # Install dependencies
npm run compile          # Compile TypeScript to out/ directory (for testing)
npm run build            # Bundle with esbuild to dist/extension.js (for production)
npm run test             # Run tests (uses out/ directory)
npm run lint             # Run ESLint
npm run lint:fix         # Auto-fix ESLint issues
npm run package          # Build and create .vsix package
```

**Important:** VS Code loads from `dist/extension.js` (esbuild bundle), not `out/`. After code changes:
- Run `npm run build` before testing in VS Code (F5)
- Run `npm run compile` before running `npm run test`

## Testing

Tests use VS Code's extension testing framework (Mocha-based) with `@vscode/test-electron`.
- `npm run test` - Run all tests
- Test files: `src/test/suite/*.test.ts`
- Test fixtures: `src/test/fixtures/` (gitignored)

## Architecture

MarkInk is a VS Code extension providing Markdown productivity tools: image pasting, Word-to-Markdown conversion, outline navigation, and table formatting.

### Entry Points
- **`src/extension.ts`** - Registers all commands and initializes views
- **`dist/extension.js`** - Production bundle (esbuild output)
- **`out/`** - TypeScript compilation output (for testing only)

### Core Features

| Feature | Main File | Description |
|---------|-----------|-------------|
| Paste Image | `src/paster.ts` | Clipboard image extraction and insertion |
| Word → Markdown | `src/wordConverter.ts` | DOCX conversion with mammoth + turndown |
| Image Checker | `src/imageChecker.ts` | Validates image links in documents |
| Outline | `src/outline.ts` | Document structure tree view |
| Table Tools | `src/tableUtils.ts` | Table formatting and insertion |

### Word Converter Architecture

Two parallel implementations exist:
- **`src/wordConverter.ts`** - VS Code integration (depends on `vscode` module)
- **`src/wordConverterCore.ts`** - Standalone core logic (for testing without VS Code)

Key conversion flow:
1. `mammoth` converts DOCX → HTML with image extraction
2. `preprocessComplexTables()` wraps complex tables in `<complex-table>` tags
3. `turndown` + GFM plugin converts HTML → Markdown
4. Complex tables (nested/merged/with images) are preserved as HTML

### Platform Scripts (`res/`)
Clipboard image extraction is platform-specific:
- `pc.ps1` - Windows PowerShell
- `mac.applescript` - macOS AppleScript
- `linux.sh` - Linux (requires `xclip`)

### esbuild Configuration

`jsdom` must be external (not bundled) because it has runtime resource files:
```javascript
external: ['vscode', 'jsdom', 'canvas', 'bufferutil', 'utf-8-validate']
```

### Dependencies
- `mammoth` - DOCX to HTML conversion
- `turndown` + `turndown-plugin-gfm` - HTML to Markdown conversion
- `jsdom` - DOM parsing for table analysis
- `dayjs` - Timestamp formatting for image filenames
- `upath` - Cross-platform path normalization

### Variable System

Configuration and insert patterns support variables:
- `${currentFileDir}`, `${projectRoot}`, `${currentFileName}`, `${currentFileNameWithoutExt}`
- `${imageFilePath}`, `${imageSyntaxPrefix}`, `${imageSyntaxSuffix}`

Variables are resolved in `src/pathVariables.ts`.
