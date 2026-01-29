# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm install              # Install dependencies
npm run compile          # Compile TypeScript to out/ directory
npm run watch            # Compile TypeScript in watch mode
npm run build            # Bundle with esbuild to dist/extension.js
npm run lint             # Run ESLint
npm run test             # Run tests
npm run package          # Build and create .vsix package
```

## Testing

Tests use VS Code's extension testing framework (Mocha-based) with `@vscode/test-electron`. Run via:
- `npm run test` - Command line
- "Extension Tests" launch configuration in `.vscode/launch.json`

## Architecture

This is a VS Code extension that pastes clipboard images directly into editors (optimized for Markdown/AsciiDoc).

### Core Flow
1. User triggers `extension.pasteImage` command (Ctrl+Alt+V / Cmd+Alt+V)
2. `paste()` in `src/paster.ts` handles the main logic:
   - Validates editor state and selection
   - Loads and processes configuration with variable substitution
   - Determines image file path (optionally via user input box)
   - Calls platform-specific script to extract clipboard image
   - Inserts formatted image reference into editor

### Module Structure (`src/`)
- **`extension.ts`**: Entry point, registers commands
- **`paster.ts`**: Core paste logic and file operations
- **`clipboard.ts`**: Platform-specific clipboard image extraction
- **`config.ts`**: Configuration loading and types
- **`pathVariables.ts`**: Variable substitution and path rendering
- **`logger.ts`**: Output channel wrapper for logging

### Platform Scripts (`res/`)
- `pc.ps1` - Windows PowerShell script
- `mac.applescript` - macOS AppleScript
- `linux.sh` - Linux shell script (requires `xclip`)

### Variable System
Configuration supports variables like `${currentFileDir}`, `${projectRoot}`, `${currentFileName}`, `${currentFileNameWithoutExt}`. These are replaced via `replacePathVariables()` in `pathVariables.ts`.

Insert patterns support additional variables: `${imageFilePath}`, `${imageSyntaxPrefix}`, `${imageSyntaxSuffix}`, etc.

### Dependencies
- `dayjs` - Lightweight timestamp formatting for default filenames
- `upath` - Unix-style path normalization

### Dev Dependencies
- `typescript` ^5.3 - TypeScript compiler
- `esbuild` - Fast bundler for production builds
- `eslint` + `@typescript-eslint/*` - Linting
- `@vscode/test-electron` - VS Code extension testing
- `@vscode/vsce` - Extension packaging
