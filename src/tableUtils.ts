import * as vscode from 'vscode';

async function executeNativeTocCommand(commandId: string): Promise<boolean> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
        return false;
    }

    try {
        await vscode.commands.executeCommand(commandId);
        return true;
    } catch {
        return false;
    }
}

export async function insertToc(): Promise<void> {
    if (await executeNativeTocCommand('markdown.extension.toc.create')) {
        return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage('No active editor found.');
        return;
    }

    const document = editor.document;
    const text = document.getText();
    const headings = parseHeadings(text);

    if (headings.length === 0) {
        vscode.window.showInformationMessage('No headings found in document.');
        return;
    }

    // Generate TOC
    const toc = generateToc(headings);

    // Insert at cursor position
    await editor.edit((editBuilder) => {
        editBuilder.insert(editor.selection.active, toc);
    });

    vscode.window.showInformationMessage('Table of Contents inserted.');
}

interface Heading {
    level: number;
    text: string;
    anchor: string;
}

function parseHeadings(text: string, excludeStart?: number, excludeEnd?: number): Heading[] {
    const headings: Heading[] = [];
    const lines = text.split(/\r?\n/);
    const headingRegex = /^(#{1,6})\s+(.+)$/;

    let currentPos = 0;
    for (const line of lines) {
        const lineEnd = currentPos + line.length;

        // Skip headings within the excluded range (TOC block)
        if (excludeStart !== undefined && excludeEnd !== undefined) {
            if (currentPos >= excludeStart && lineEnd <= excludeEnd) {
                currentPos = lineEnd + 1; // +1 for newline
                continue;
            }
        }

        const match = line.match(headingRegex);
        if (match) {
            const level = match[1].length;
            const headingText = match[2].trim();
            const anchor = generateAnchor(headingText);
            headings.push({ level, text: headingText, anchor });
        }

        currentPos = lineEnd + 1; // +1 for newline
    }

    return headings;
}

function generateAnchor(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\s\u4e00-\u9fff-]/g, '') // Keep Chinese characters
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function generateToc(headings: Heading[]): string {
    const lines: string[] = ['<!-- TOC -->', '## Table of Contents', ''];

    // Find minimum level to use as base
    const minLevel = Math.min(...headings.map(h => h.level));

    for (const heading of headings) {
        const indent = '  '.repeat(heading.level - minLevel);
        const link = `${indent}- [${heading.text}](#${heading.anchor})`;
        lines.push(link);
    }

    lines.push('', '---', '<!-- /TOC -->', '');
    return lines.join('\n');
}

export async function updateToc(): Promise<void> {
    if (await executeNativeTocCommand('markdown.extension.toc.update')) {
        return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage('No active editor found.');
        return;
    }

    const document = editor.document;
    const text = document.getText();

    // Find TOC block markers
    const tocStartMarker = '<!-- TOC -->';
    const tocEndMarker = '<!-- /TOC -->';
    const tocStart = text.indexOf(tocStartMarker);
    const tocEnd = text.indexOf(tocEndMarker);

    if (tocStart === -1 || tocEnd === -1) {
        vscode.window.showInformationMessage(
            'No TOC block found. Use "Insert Table of Contents" first.'
        );
        return;
    }

    // Parse headings (excluding those inside TOC block)
    const headings = parseHeadings(text, tocStart, tocEnd + tocEndMarker.length);

    if (headings.length === 0) {
        vscode.window.showInformationMessage('No headings found in document.');
        return;
    }

    // Generate new TOC
    const newToc = generateToc(headings);

    // Calculate range and replace
    const startPos = document.positionAt(tocStart);
    const endPos = document.positionAt(tocEnd + tocEndMarker.length);
    const range = new vscode.Range(startPos, endPos);

    await editor.edit((editBuilder) => {
        editBuilder.replace(range, newToc.trim());
    });

    vscode.window.showInformationMessage('Table of Contents updated.');
}

export async function formatTable(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage('No active editor found.');
        return;
    }

    const document = editor.document;
    const selection = editor.selection;

    // Get the table around cursor or selection
    const tableRange = findTableRange(document, selection);
    if (!tableRange) {
        vscode.window.showInformationMessage('No table found at cursor position.');
        return;
    }

    const tableText = document.getText(tableRange);
    const formattedTable = formatMarkdownTable(tableText);

    await editor.edit((editBuilder) => {
        editBuilder.replace(tableRange, formattedTable);
    });

    vscode.window.showInformationMessage('Table formatted.');
}

function findTableRange(document: vscode.TextDocument, selection: vscode.Selection): vscode.Range | undefined {
    const startLine = selection.start.line;

    // Check if current line is part of a table
    const currentLineText = document.lineAt(startLine).text;
    if (!currentLineText.includes('|')) {
        return undefined;
    }

    // Find table start
    let tableStart = startLine;
    while (tableStart > 0) {
        const prevLine = document.lineAt(tableStart - 1).text;
        if (!prevLine.includes('|')) {
            break;
        }
        tableStart--;
    }

    // Find table end
    let tableEnd = startLine;
    while (tableEnd < document.lineCount - 1) {
        const nextLine = document.lineAt(tableEnd + 1).text;
        if (!nextLine.includes('|')) {
            break;
        }
        tableEnd++;
    }

    return new vscode.Range(
        new vscode.Position(tableStart, 0),
        new vscode.Position(tableEnd, document.lineAt(tableEnd).text.length)
    );
}

function formatMarkdownTable(tableText: string): string {
    const lines = tableText.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) {
        return tableText;
    }

    // Handle edge case where | is at start/end
    const parsedRows: string[][] = lines.map(line => {
        const trimmed = line.trim();
        const cells = trimmed.split('|');
        // Remove empty first/last if line starts/ends with |
        if (cells[0] === '') {
            cells.shift();
        }
        if (cells[cells.length - 1] === '') {
            cells.pop();
        }
        return cells.map(c => c.trim());
    });

    if (parsedRows.length === 0 || parsedRows[0].length === 0) {
        return tableText;
    }

    // Calculate column widths
    const colCount = Math.max(...parsedRows.map(row => row.length));
    const colWidths: number[] = [];

    for (let col = 0; col < colCount; col++) {
        let maxWidth = 3; // Minimum width
        for (const row of parsedRows) {
            if (row[col]) {
                // Check if it's separator row
                if (row[col].match(/^[-:]+$/)) {
                    continue;
                }
                maxWidth = Math.max(maxWidth, row[col].length);
            }
        }
        colWidths.push(maxWidth);
    }

    // Format rows
    const formattedLines: string[] = [];

    for (let i = 0; i < parsedRows.length; i++) {
        const row = parsedRows[i];
        const cells: string[] = [];

        for (let col = 0; col < colCount; col++) {
            const cell = row[col] || '';
            const width = colWidths[col];

            // Check if separator row
            if (cell.match(/^[-:]+$/)) {
                // Preserve alignment
                if (cell.startsWith(':') && cell.endsWith(':')) {
                    cells.push(':' + '-'.repeat(width - 2) + ':');
                } else if (cell.endsWith(':')) {
                    cells.push('-'.repeat(width - 1) + ':');
                } else if (cell.startsWith(':')) {
                    cells.push(':' + '-'.repeat(width - 1));
                } else {
                    cells.push('-'.repeat(width));
                }
            } else {
                cells.push(cell.padEnd(width));
            }
        }

        formattedLines.push('| ' + cells.join(' | ') + ' |');
    }

    return formattedLines.join('\n');
}

export async function insertTable(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage('No active editor found.');
        return;
    }

    // Ask for table dimensions
    const dimensions = await vscode.window.showInputBox({
        prompt: 'Enter table dimensions (columns x rows), e.g., 3x4',
        value: '3x3',
        validateInput: (value) => {
            if (!/^\d+x\d+$/.test(value)) {
                return 'Please enter in format: columns x rows (e.g., 3x4)';
            }
            return undefined;
        }
    });

    if (!dimensions) {
        return;
    }

    const [cols, rows] = dimensions.split('x').map(Number);

    if (cols < 1 || rows < 1 || cols > 20 || rows > 100) {
        vscode.window.showErrorMessage('Invalid dimensions. Columns: 1-20, Rows: 1-100');
        return;
    }

    const table = generateEmptyTable(cols, rows);

    await editor.edit((editBuilder) => {
        editBuilder.insert(editor.selection.active, table);
    });
}

function generateEmptyTable(cols: number, rows: number): string {
    const lines: string[] = [];

    // Header row
    const headerCells = Array(cols).fill('Header').map((h, i) => `${h} ${i + 1}`);
    lines.push('| ' + headerCells.join(' | ') + ' |');

    // Separator row
    const separators = Array(cols).fill('---');
    lines.push('| ' + separators.join(' | ') + ' |');

    // Data rows
    for (let r = 0; r < rows; r++) {
        const cells = Array(cols).fill('     ');
        lines.push('| ' + cells.join(' | ') + ' |');
    }

    lines.push('');
    return lines.join('\n');
}
