import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { log } from './logger';
import { parseMarkdownImages } from './markdownImageParser';

interface ImageCheckResult {
    path: string;
    line: number;
    column: number;
    exists: boolean;
    fullPath: string;
}

const REPORT_URI = vscode.Uri.parse('markink-report:image-check.md');

// Virtual document provider for image check reports
class ImageReportProvider implements vscode.TextDocumentContentProvider {
    private _content: string = '';
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();

    readonly onDidChange = this._onDidChange.event;

    setContent(content: string): void {
        this._content = content;
        this._onDidChange.fire(REPORT_URI);
    }

    provideTextDocumentContent(): string {
        return this._content;
    }

    dispose(): void {
        this._onDidChange.dispose();
    }
}

// Singleton instance for report provider
let reportProvider: ImageReportProvider | undefined;

export function initReportProvider(context: vscode.ExtensionContext): void {
    reportProvider = new ImageReportProvider();
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider('markink-report', reportProvider),
        reportProvider
    );
}

export async function checkImageLinks(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage('No active editor found.');
        return;
    }

    const document = editor.document;
    if (document.languageId !== 'markdown' && document.languageId !== 'asciidoc') {
        vscode.window.showInformationMessage('This command works with Markdown and AsciiDoc files.');
        return;
    }

    // Use async file checking
    const results = await scanImageLinksAsync(document);
    const missing = results.filter(r => !r.exists);
    const valid = results.filter(r => r.exists);

    if (results.length === 0) {
        clearDiagnostics(document);
        vscode.window.showInformationMessage('No images found in this document.');
        return;
    }

    if (missing.length === 0) {
        clearDiagnostics(document);
        vscode.window.showInformationMessage(`✅ All ${valid.length} images are valid!`);
        return;
    }

    // 顯示報告 - use virtual document provider to avoid memory accumulation
    const report = generateReport(results, document.uri.fsPath);

    if (reportProvider) {
        reportProvider.setContent(report);
        const reportDoc = await vscode.workspace.openTextDocument(REPORT_URI);
        // Set language mode to markdown for syntax highlighting
        await vscode.languages.setTextDocumentLanguage(reportDoc, 'markdown');
        await vscode.window.showTextDocument(reportDoc, {
            viewColumn: vscode.ViewColumn.Beside,
            preview: true
        });
    } else {
        // Fallback if provider not initialized
        const doc = await vscode.workspace.openTextDocument({
            content: report,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc, {
            viewColumn: vscode.ViewColumn.Beside,
            preview: true
        });
    }

    // 加入診斷
    updateDiagnostics(document, missing);

    log(`Image check: ${valid.length} valid, ${missing.length} missing`);
}

/**
 * Async version of scanImageLinks - doesn't block UI for large files
 */
async function scanImageLinksAsync(document: vscode.TextDocument): Promise<ImageCheckResult[]> {
    const text = document.getText();
    const isAsciidoc = document.languageId === 'asciidoc';

    // For AsciiDoc, use the original regex-based approach
    if (isAsciidoc) {
        return scanAsciidocImages(text, document);
    }

    // For Markdown, use the shared parser
    const imageRefs = parseMarkdownImages(text, document.uri.fsPath);

    // Check all files asynchronously in parallel
    const results = await Promise.all(
        imageRefs.map(async (ref) => {
            let exists = false;
            try {
                await fs.promises.access(ref.fullPath, fs.constants.F_OK);
                exists = true;
            } catch {
                exists = false;
            }

            return {
                path: ref.imagePath,
                line: ref.line,
                column: ref.column,
                exists,
                fullPath: ref.fullPath
            };
        })
    );

    return results;
}

async function scanAsciidocImages(text: string, document: vscode.TextDocument): Promise<ImageCheckResult[]> {
    const results: ImageCheckResult[] = [];
    const documentDir = path.dirname(document.uri.fsPath);
    const asciidocImageRegex = /image::?([^[\s]+)\[/g;

    const pendingChecks: { match: RegExpExecArray; imagePath: string; fullPath: string }[] = [];

    let match: RegExpExecArray | null;
    while ((match = asciidocImageRegex.exec(text)) !== null) {
        let imagePath = match[1];
        imagePath = imagePath.replace(/[\r\n]+/g, '');
        imagePath = imagePath.split('?')[0].split('#')[0];

        if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('data:')) {
            continue;
        }

        let decodedPath: string;
        try {
            decodedPath = decodeURIComponent(imagePath);
        } catch {
            decodedPath = imagePath;
        }

        const fullPath = path.isAbsolute(decodedPath)
            ? decodedPath
            : path.resolve(documentDir, decodedPath);

        pendingChecks.push({ match, imagePath, fullPath });
    }

    const checkResults = await Promise.all(
        pendingChecks.map(async ({ match: m, imagePath, fullPath }) => {
            let exists = false;
            try {
                await fs.promises.access(fullPath, fs.constants.F_OK);
                exists = true;
            } catch {
                exists = false;
            }

            const linesBefore = text.substring(0, m.index).split(/\r?\n/);
            const lineNumber = linesBefore.length - 1;
            const column = linesBefore[linesBefore.length - 1].length;

            return {
                path: imagePath,
                line: lineNumber,
                column: column,
                exists,
                fullPath
            };
        })
    );

    results.push(...checkResults);
    return results;
}

function generateReport(results: ImageCheckResult[], documentPath: string): string {
    const missing = results.filter(r => !r.exists);
    const valid = results.filter(r => r.exists);

    // 轉義 pipe 字元
    const escapePipe = (s: string): string => s.replace(/\|/g, '\\|');

    const lines: string[] = [
        '# Image Link Check Report',
        '',
        `**Document:** ${path.basename(documentPath)}`,
        `**Total Images:** ${results.length}`,
        `**Valid:** ${valid.length}`,
        `**Missing:** ${missing.length}`,
        '',
    ];

    if (missing.length > 0) {
        lines.push('## ❌ Missing Images', '');
        lines.push('| Line | Path | Expected Location |');
        lines.push('|------|------|-------------------|');

        for (const img of missing) {
            lines.push(`| ${img.line + 1} | \`${escapePipe(img.path)}\` | ${escapePipe(img.fullPath)} |`);
        }
        lines.push('');
    }

    if (valid.length > 0) {
        lines.push('## ✅ Valid Images', '');
        lines.push('| Line | Path |');
        lines.push('|------|------|');

        for (const img of valid) {
            lines.push(`| ${img.line + 1} | \`${escapePipe(img.path)}\` |`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

// Diagnostics collection for showing problems in the editor
let diagnosticCollection: vscode.DiagnosticCollection | undefined;

export function initDiagnostics(context: vscode.ExtensionContext): void {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('markink');
    context.subscriptions.push(diagnosticCollection);

    // 清理診斷當文件關閉時
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument((doc) => {
            if (diagnosticCollection) {
                diagnosticCollection.delete(doc.uri);
            }
        })
    );

    // Watch image files for creation/deletion/rename and auto-refresh diagnostics
    const imageWatcher = vscode.workspace.createFileSystemWatcher('**/*.{png,jpg,jpeg,gif,bmp,webp,svg}');
    let debounceTimer: NodeJS.Timeout | undefined;
    const refreshDiagnostics = () => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
            const editor = vscode.window.activeTextEditor;
            if (editor && (editor.document.languageId === 'markdown' || editor.document.languageId === 'asciidoc')) {
                void refreshDiagnosticsForDocument(editor.document);
            }
        }, 500);
    };
    imageWatcher.onDidCreate(refreshDiagnostics);
    imageWatcher.onDidDelete(refreshDiagnostics);
    context.subscriptions.push(imageWatcher);
    context.subscriptions.push({ dispose: () => { if (debounceTimer) { clearTimeout(debounceTimer); } } });
}

async function refreshDiagnosticsForDocument(document: vscode.TextDocument): Promise<void> {
    if (!diagnosticCollection) {
        return;
    }
    const results = await scanImageLinksAsync(document);
    const missing = results.filter(r => !r.exists);
    if (missing.length === 0) {
        diagnosticCollection.delete(document.uri);
    } else {
        updateDiagnostics(document, missing);
    }
}

function updateDiagnostics(document: vscode.TextDocument, missing: ImageCheckResult[]): void {
    if (!diagnosticCollection) {
        log('Warning: Diagnostics not initialized');
        return;
    }

    const diagnostics: vscode.Diagnostic[] = [];

    for (const img of missing) {
        const line = document.lineAt(img.line);
        const startIndex = img.column;
        const endIndex = startIndex + img.path.length + 4; // 估計長度

        const range = new vscode.Range(
            new vscode.Position(img.line, Math.max(0, startIndex)),
            new vscode.Position(img.line, Math.min(line.text.length, endIndex))
        );

        const diagnostic = new vscode.Diagnostic(
            range,
            `Image not found: ${img.path}`,
            vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = 'MarkInk';
        diagnostic.code = 'missing-image';

        diagnostics.push(diagnostic);
    }

    diagnosticCollection.set(document.uri, diagnostics);
}

export function clearDiagnostics(document: vscode.TextDocument): void {
    if (diagnosticCollection) {
        diagnosticCollection.delete(document.uri);
    }
}
