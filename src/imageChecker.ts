import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { log } from './logger';

interface ImageCheckResult {
    path: string;
    line: number;
    column: number;
    exists: boolean;
    fullPath: string;
}

// Virtual document provider for image check reports
class ImageReportProvider implements vscode.TextDocumentContentProvider {
    private _content: string = '';
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();

    readonly onDidChange = this._onDidChange.event;

    setContent(content: string): void {
        this._content = content;
        this._onDidChange.fire(vscode.Uri.parse('markink-report:image-check'));
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
        vscode.window.showInformationMessage('No images found in this document.');
        return;
    }

    if (missing.length === 0) {
        vscode.window.showInformationMessage(`✅ All ${valid.length} images are valid!`);
        return;
    }

    // 顯示報告 - use virtual document provider to avoid memory accumulation
    const report = generateReport(results, document.uri.fsPath);

    if (reportProvider) {
        reportProvider.setContent(report);
        const reportDoc = await vscode.workspace.openTextDocument(vscode.Uri.parse('markink-report:image-check.md'));
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
    const results: ImageCheckResult[] = [];
    const text = document.getText();
    const documentDir = path.dirname(document.uri.fsPath);

    // 改進的正則表達式：處理帶有 title 的圖片語法，支援跨行路徑
    const markdownImageRegex = /!\[([^\]]*)\]\(([^)\s]+(?:\s+[^)\s]+)*)(?:\s+"[^"]*")?\)/g;
    // AsciiDoc 圖片語法
    const asciidocImageRegex = /image::?([^[\s]+)\[/g;

    const isAsciidoc = document.languageId === 'asciidoc';
    const regex = isAsciidoc ? asciidocImageRegex : markdownImageRegex;

    const pendingChecks: { match: RegExpExecArray; imagePath: string; fullPath: string }[] = [];

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
        let imagePath = isAsciidoc ? match[1] : match[2];

        // 移除路徑中的換行和多餘空白
        imagePath = imagePath.replace(/\s+/g, '');

        // 移除 query string 和 fragment
        imagePath = imagePath.split('?')[0].split('#')[0];

        // Skip URLs
        if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('data:')) {
            continue;
        }

        // Decode URL-encoded path with error handling
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

    // Check all files asynchronously in parallel
    const checkResults = await Promise.all(
        pendingChecks.map(async ({ match, imagePath, fullPath }) => {
            let exists = false;
            try {
                await fs.promises.access(fullPath, fs.constants.F_OK);
                exists = true;
            } catch {
                exists = false;
            }

            // 計算行號和列號
            const linesBefore = text.substring(0, match.index).split('\n');
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
