import * as vscode from 'vscode';
import * as path from 'path';
import { pathToFileURL } from 'url';
import MarkdownIt from 'markdown-it';

interface ExportResult {
    fileName: string;
    success: boolean;
    error?: string;
}

function isMarkdownFile(uri: vscode.Uri): boolean {
    const ext = path.extname(uri.fsPath).toLowerCase();
    return ext === '.md' || ext === '.markdown';
}

// Called from right-click context menu with file URI
export async function exportMarkdown(uri?: vscode.Uri, selectedUris?: vscode.Uri[]): Promise<void> {
    let fileUris: vscode.Uri[];

    // If called from context menu, use that file; otherwise show file picker
    if (uri) {
        const candidates = (selectedUris && selectedUris.length > 0 ? selectedUris : [uri])
            .filter(isMarkdownFile);
        fileUris = candidates;
    } else {
        // Fallback: Show file picker for batch export
        const selected = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: true,
            filters: { 'Markdown': ['md', 'markdown'] },
            title: 'Select Markdown Files to Export'
        });

        if (!selected || selected.length === 0) {
            return;
        }
        fileUris = selected.filter(isMarkdownFile);
    }

    if (fileUris.length === 0) {
        vscode.window.showInformationMessage('No Markdown files selected.');
        return;
    }

    // Select output directory
    const outputFolder = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: 'Select Output Folder'
    });

    if (!outputFolder || outputFolder.length === 0) {
        return;
    }

    const outputDir = outputFolder[0].fsPath;

    // Select export format
    const format = await vscode.window.showQuickPick(
        ['HTML', 'Word (.docx)'],
        { placeHolder: 'Select export format' }
    );

    if (!format) {
        return;
    }

    // Batch convert
    const results: ExportResult[] = [];
    const md = new MarkdownIt({ html: true, linkify: true, typographer: true });

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Exporting to ${format}...`,
        cancellable: true
    }, async (progress, token) => {
        const total = fileUris.length;

        for (let i = 0; i < total; i++) {
            if (token.isCancellationRequested) {
                break;
            }

            const fileUri = fileUris[i];
            const mdFilePath = fileUri.fsPath;
            const baseName = path.parse(mdFilePath).name;
            const mdDir = path.dirname(mdFilePath);

            progress.report({
                increment: 100 / total,
                message: `(${i + 1}/${total}) ${baseName}`
            });

            try {
                const markdownBytes = await vscode.workspace.fs.readFile(fileUri);
                const markdown = Buffer.from(markdownBytes).toString('utf-8');

                if (format === 'HTML') {
                    const htmlContent = md.render(markdown);
                    const htmlFull = wrapHtml(htmlContent, baseName, mdDir);
                    const outputUri = vscode.Uri.file(path.join(outputDir, `${baseName}.html`));
                    await vscode.workspace.fs.writeFile(outputUri, Buffer.from(htmlFull, 'utf-8'));
                    results.push({ fileName: baseName, success: true });
                } else if (format === 'Word (.docx)') {
                    const outputPath = path.join(outputDir, `${baseName}.docx`);
                    await exportToWord(markdown, outputPath);
                    results.push({ fileName: baseName, success: true });
                }
            } catch (err) {
                results.push({
                    fileName: baseName,
                    success: false,
                    error: (err as Error).message
                });
            }
        }
    });

    // Show summary
    showExportSummary(results, outputDir, format);
}

function wrapHtml(content: string, title: string, baseDir: string): string {
    // Convert relative image paths to absolute for exported HTML rendering
    const contentWithAbsolutePaths = content.replace(
        /src="(?!http|https|data:)([^"]+)"/g,
        (_match, relativePath) => {
            const absolutePath = path.resolve(baseDir, relativePath);
            return `src="${pathToFileURL(absolutePath).href}"`;
        }
    );

    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            line-height: 1.6;
            color: #333;
        }
        h1, h2, h3, h4, h5, h6 {
            color: #1a1a1a;
            margin-top: 1.5em;
            margin-bottom: 0.5em;
        }
        h1 { border-bottom: 2px solid #eee; padding-bottom: 0.3em; }
        h2 { border-bottom: 1px solid #eee; padding-bottom: 0.2em; }
        code {
            background: #f4f4f4;
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', Consolas, monospace;
            font-size: 0.9em;
        }
        pre {
            background: #f4f4f4;
            padding: 1rem;
            overflow-x: auto;
            border-radius: 6px;
        }
        pre code {
            background: none;
            padding: 0;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 1em 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 8px 12px;
            text-align: left;
        }
        th {
            background: #f8f8f8;
            font-weight: 600;
        }
        tr:nth-child(even) {
            background: #fafafa;
        }
        img {
            max-width: 100%;
            height: auto;
        }
        blockquote {
            margin: 1em 0;
            padding: 0.5em 1em;
            border-left: 4px solid #ddd;
            color: #666;
            background: #f9f9f9;
        }
        a {
            color: #0366d6;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        hr {
            border: none;
            border-top: 1px solid #eee;
            margin: 2em 0;
        }
        ul, ol {
            padding-left: 2em;
        }
        li {
            margin: 0.25em 0;
        }
    </style>
</head>
<body>
${contentWithAbsolutePaths}
</body>
</html>`;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function exportToWord(markdown: string, outputPath: string): Promise<void> {
    // Use md-to-docx for direct Markdown → DOCX conversion
    // This preserves code block formatting correctly
    const { unified } = await import('unified');
    const remarkParse = (await import('remark-parse')).default;
    const remarkGfm = (await import('remark-gfm')).default;
    const { toDocx } = await import('md-to-docx');

    // Parse Markdown to MDAST
    const processor = unified().use(remarkParse).use(remarkGfm);
    const ast = processor.parse(markdown);

    // Convert MDAST to DOCX buffer
    const docxBuffer = await toDocx(ast as Parameters<typeof toDocx>[0], {}, {}, 'nodebuffer');

    const outputUri = vscode.Uri.file(outputPath);
    await vscode.workspace.fs.writeFile(outputUri, docxBuffer as Uint8Array);
}


function showExportSummary(results: ExportResult[], outputDir: string, format: string): void {
    const succeeded = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    if (failed.length === 0) {
        vscode.window.showInformationMessage(
            `Exported ${succeeded.length} file${succeeded.length > 1 ? 's' : ''} to ${format}`,
            'Open Folder'
        ).then(selection => {
            if (selection === 'Open Folder') {
                vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputDir));
            }
        });
    } else if (succeeded.length === 0) {
        const failedNames = failed.slice(0, 3).map(f => f.fileName).join(', ');
        const more = failed.length > 3 ? ` and ${failed.length - 3} more` : '';
        const errorMsg = failed[0]?.error || 'Unknown error';
        vscode.window.showErrorMessage(
            `Export failed: ${failedNames}${more}. Error: ${errorMsg}`
        );
    } else {
        const failedNames = failed.slice(0, 3).map(f => f.fileName).join(', ');
        const more = failed.length > 3 ? ` and ${failed.length - 3} more` : '';
        vscode.window.showWarningMessage(
            `Exported ${succeeded.length}/${results.length} files. Failed: ${failedNames}${more}`,
            'Open Folder'
        ).then(selection => {
            if (selection === 'Open Folder') {
                vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputDir));
            }
        });
    }
}
