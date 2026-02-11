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
- Test files: `src/test/suite/*.test.ts`
- Test fixtures: `src/test/fixtures/` (gitignored)

## Architecture

MarkInk is a VS Code extension providing Markdown productivity tools: image pasting, Word-to-Markdown conversion, export, outline navigation, and table formatting.

### Entry Points
- **`src/extension.ts`** - Registers all commands and initializes views
- **`dist/extension.js`** - Production bundle (esbuild output)
- **`out/`** - TypeScript compilation output (for testing only)

### Core Features

| Feature | Main File | Description |
|---------|-----------|-------------|
| Paste Image | `src/paster.ts` | Clipboard image extraction and insertion |
| Word → Markdown | `src/word/converter.ts` | DOCX conversion with mammoth + turndown |
| Export | `src/exporter.ts` | Markdown to HTML/Word export |
| Image Checker | `src/imageChecker.ts` | Validates image links in documents |
| Rename Image | `src/renameImage.ts` | Rename images and update references |
| Outline | `src/outline.ts` | Document structure tree view |
| Image List | `src/imageList.ts` | Images panel in sidebar |
| Table Tools | `src/tableUtils.ts` | Table formatting and insertion |
| Tools Panel | `src/toolsPanel.ts` | Sidebar tools UI |
| Config UI | `src/configUI.ts` | Settings configuration interface |

### Word Converter Architecture

Two parallel implementations exist:
- **`src/word/converter.ts`** - VS Code integration (depends on `vscode` module)
- **`src/word/converterCore.ts`** - Standalone core logic (for testing without VS Code)

Key conversion flow:
1. `mammoth` converts DOCX → HTML with image extraction
2. `preprocessComplexTables()` wraps complex tables in `<complex-table>` tags
3. `turndown` + GFM plugin converts HTML → Markdown
4. Complex tables (nested/merged/with images) are preserved as HTML

### Platform Scripts (`res/`)
Clipboard image extraction is platform-specific:
- `pc.ps1` - Windows PowerShell
- `mac.applescript` - macOS AppleScript
- `linux.sh` - Linux (requires `wl-paste` for Wayland or `xclip` for X11)

### esbuild Configuration

`linkedom` must be external (ESM-only, cannot be bundled into CJS):
```javascript
external: ['vscode', 'linkedom', 'canvas', 'bufferutil', 'utf-8-validate']
```

### Key Dependencies
- `mammoth` - DOCX to HTML conversion
- `turndown` + `turndown-plugin-gfm` - HTML to Markdown conversion
- `linkedom` - Lightweight DOM parsing for table analysis
- `markdown-it` - Markdown to HTML rendering (for export)
- `md-to-docx` - Markdown to Word export
- `dayjs` - Timestamp formatting for image filenames
- `unified` + `remark-parse` + `remark-gfm` - Markdown AST processing

### Variable System

Configuration and insert patterns support variables:
- `${currentFileDir}`, `${projectRoot}`, `${currentFileName}`, `${currentFileNameWithoutExt}`
- `${imageFilePath}`, `${imageSyntaxPrefix}`, `${imageSyntaxSuffix}`

Variables are resolved in `src/pathVariables.ts`.

### Configuration Namespace

Settings use `markink.*` namespace (e.g., `markink.imagePath`, `markink.insertPattern`). Legacy `pasteImage.*` settings are also supported for backwards compatibility.
