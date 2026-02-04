import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import mammoth from 'mammoth';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { JSDOM } from 'jsdom';
import { log, showInformationMessage, showErrorMessage } from '../logger';
import { ConversionResult } from './types';

interface BatchResult {
    fileName: string;
    success: boolean;
    imageCount?: number;
    error?: string;
}

export async function convertWordToMarkdown(): Promise<void> {
    // Step 1: 選擇多個 Word 檔案
    const fileUris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: true,
        filters: {
            'Word Documents': ['docx']
        },
        title: 'Select Word Documents to Convert'
    });

    if (!fileUris || fileUris.length === 0) {
        return;
    }

    // Step 2: 選擇統一輸出目錄
    const outputFolder = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: 'Select Output Folder for Markdown and Images'
    });

    if (!outputFolder || outputFolder.length === 0) {
        return;
    }

    const outputDir = outputFolder[0].fsPath;
    const imagesDir = path.join(outputDir, 'images');

    // 確保圖片資料夾存在
    if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
    }

    // Step 3: 批次轉換
    const results: BatchResult[] = [];

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Converting Word to Markdown...',
        cancellable: true
    }, async (progress, token) => {
        const total = fileUris.length;

        for (let i = 0; i < total; i++) {
            if (token.isCancellationRequested) {
                break;
            }

            const uri = fileUris[i];
            const wordFilePath = uri.fsPath;
            const ext = path.extname(wordFilePath);
            const wordFileName = path.basename(wordFilePath, ext);
            const mdFilePath = path.join(outputDir, `${wordFileName}.md`);

            progress.report({
                increment: 100 / total,
                message: `(${i + 1}/${total}) ${wordFileName}`
            });

            try {
                const result = await convertDocxWithImages(
                    wordFilePath, imagesDir, wordFileName
                );
                const markdown = cleanupMarkdown(result.markdown, wordFileName);
                fs.writeFileSync(mdFilePath, markdown, 'utf-8');

                // 處理 mammoth 警告
                if (result.warnings.length > 0) {
                    for (const warning of result.warnings) {
                        log(`Mammoth warning (${wordFileName}): ${warning}`);
                    }
                }

                results.push({
                    fileName: wordFileName,
                    success: true,
                    imageCount: result.imageCount
                });

                log(`Converted ${wordFilePath} to ${mdFilePath}, extracted ${result.imageCount} images`);
            } catch (err) {
                results.push({
                    fileName: wordFileName,
                    success: false,
                    error: (err as Error).message
                });
                log(`Conversion error (${wordFileName}): ${(err as Error).message}`);
            }
        }
    });

    // Step 4: 顯示摘要
    showBatchSummary(results, outputDir);
}

export async function convertDocxWithImages(
    docxPath: string,
    imagesDir: string,
    baseName: string
): Promise<ConversionResult> {
    let imageIndex = 0;
    const warnings: string[] = [];

    // 使用 mammoth 轉換，在轉換過程中直接處理圖片
    // 這樣可以確保圖片順序與文件中出現順序一致
    // 任務 3：增加 styleMap 支援上下標和高亮
    const result = await mammoth.convertToHtml(
        { path: docxPath },
        {
            styleMap: [
                // 命名樣式
                "r[style-name='Superscript'] => sup",
                "r[style-name='Subscript'] => sub",
                // 直接屬性（Word 底層格式）
                "r[vertAlign='superscript'] => sup",
                "r[vertAlign='subscript'] => sub",
                // 高亮
                "highlight => mark"
            ],
            convertImage: mammoth.images.imgElement(async function(image) {
                try {
                    const imageBuffer = await image.read();
                    const contentType = image.contentType || 'image/png';
                    const extMap: Record<string, string> = {
                        'image/png': '.png',
                        'image/jpeg': '.jpg',
                        'image/gif': '.gif',
                        'image/bmp': '.bmp',
                        'image/webp': '.webp'
                    };
                    const imgExt = extMap[contentType] || '.png';

                    imageIndex++;
                    // 清理檔名，移除危險字元
                    const safeName = sanitizeFileName(baseName);
                    const newName = `${safeName}-image-${String(imageIndex).padStart(3, '0')}${imgExt}`;
                    const imgPath = path.join(imagesDir, newName);

                    // 儲存圖片
                    fs.writeFileSync(imgPath, imageBuffer);

                    return { src: `images/${newName}` };
                } catch (err) {
                    warnings.push(`Failed to extract image ${imageIndex}: ${(err as Error).message}`);
                    return { src: '' };
                }
            })
        }
    );

    // 收集 mammoth 的警告訊息
    for (const msg of result.messages) {
        warnings.push(`${msg.type}: ${msg.message}`);
    }

    // 預處理：標記複雜表格，避免被 Turndown 內部處理破壞結構
    const preprocessedHtml = preprocessComplexTables(result.value);

    // 將 HTML 轉換為 Markdown
    const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        bulletListMarker: '-',
        emDelimiter: '*',
        strongDelimiter: '**'
    });

    // 使用 GFM 外掛（表格、刪除線等）
    turndownService.use(gfm);

    // 任務 4：保留上下標和高亮標籤（Markdown 不支援這些）
    turndownService.keep(['sub', 'sup', 'mark']);

    // 處理已標記的複雜表格（用 complex-table 標籤包裹）
    turndownService.addRule('complexTable', {
        filter: function(node) {
            return node.nodeName.toLowerCase() === 'complex-table';
        },
        replacement: function(_content, node) {
            // 直接返回內部的 HTML（已保存在 data 屬性中）
            const originalHtml = (node as Element).getAttribute('data-html') || '';
            return '\n\n' + originalHtml + '\n\n';
        }
    });

    // 簡單表格轉成 Markdown
    turndownService.addRule('simpleTable', {
        filter: 'table',
        replacement: function(_content, node) {
            const tableHtml = (node as unknown as { outerHTML?: string }).outerHTML || '';
            return convertSimpleTableToMarkdown(tableHtml, turndownService);
        }
    });

    const markdown = turndownService.turndown(preprocessedHtml);

    return {
        markdown,
        imageCount: imageIndex,
        warnings
    };
}

/**
 * 預處理 HTML：將複雜表格用自定義標籤包裹，避免被 Turndown 內部處理破壞結構
 * 這樣可以確保複雜表格的原始 HTML 被完整保留
 */
function preprocessComplexTables(html: string): string {
    const dom = new JSDOM(html);
    try {
        const doc = dom.window.document;

        // 找出所有頂層表格（不是巢狀在其他表格內的）
        const allTables = doc.querySelectorAll('table');

        for (const table of allTables) {
            // 跳過已經在另一個表格內的表格（巢狀表格）
            if (table.parentElement?.closest('table')) {
                continue;
            }

            // 判斷是否為複雜表格
            if (isComplexTable(table)) {
                // 使用自定義標籤，Turndown 才能正確識別
                const wrapper = doc.createElement('complex-table');
                wrapper.setAttribute('data-html', table.outerHTML);
                wrapper.textContent = 'COMPLEX_TABLE_PLACEHOLDER';
                table.parentNode?.replaceChild(wrapper, table);
            }
        }

        return doc.body.innerHTML;
    } finally {
        dom.window.close();
    }
}

/**
 * 判斷表格是否為複雜表格（直接操作 DOM 節點）
 */
function isComplexTable(table: Element): boolean {
    // 檢查是否有圖片
    if (table.querySelectorAll('img').length > 0) {
        return true;
    }

    // 檢查是否有巢狀列表
    if (table.querySelectorAll('ul, ol').length > 0) {
        return true;
    }

    // 檢查是否有巢狀表格
    if (table.querySelectorAll('table').length > 0) {
        return true;
    }

    // 檢查是否有合併儲存格
    const cells = table.querySelectorAll('td, th');
    for (const cell of cells) {
        const colspan = cell.getAttribute('colspan');
        const rowspan = cell.getAttribute('rowspan');
        if ((colspan && parseInt(colspan, 10) > 1) ||
            (rowspan && parseInt(rowspan, 10) > 1)) {
            return true;
        }
    }

    return false;
}

/**
 * 將簡單的 HTML 表格轉換為 Markdown 格式
 * 使用 TurndownService 處理單元格內容，保留粗體、連結等格式
 */
function convertSimpleTableToMarkdown(tableHtml: string, turndownService: TurndownService): string {
    const dom = new JSDOM(tableHtml);
    try {
        const doc = dom.window.document;
        const table = doc.querySelector('table');

        if (!table) {
            return '';
        }

        const rows: string[][] = [];
        const tableRows = table.querySelectorAll('tr');

        for (const tr of tableRows) {
            const cells: string[] = [];
            const tableCells = tr.querySelectorAll('td, th');

            for (const cell of tableCells) {
                // 任務 2：使用 Turndown 處理單元格內容，保留格式
                const cellContent = getCellContent(cell.innerHTML, turndownService);
                cells.push(cellContent);
            }

            if (cells.length > 0) {
                rows.push(cells);
            }
        }

        if (rows.length === 0) {
            return '';
        }

        // 計算欄寬
        const colCount = Math.max(...rows.map(r => r.length));
        const colWidths: number[] = Array(colCount).fill(3);

        for (const row of rows) {
            for (let i = 0; i < row.length; i++) {
                colWidths[i] = Math.max(colWidths[i], row[i].length);
            }
        }

        // 產生表格
        const lines: string[] = [];

        // Header
        const header = rows[0] || [];
        const headerCells = [];
        for (let i = 0; i < colCount; i++) {
            headerCells.push((header[i] || '').padEnd(colWidths[i]));
        }
        lines.push('| ' + headerCells.join(' | ') + ' |');

        // Separator
        const separators = colWidths.map(w => '-'.repeat(w));
        lines.push('| ' + separators.join(' | ') + ' |');

        // Data rows
        for (let r = 1; r < rows.length; r++) {
            const row = rows[r];
            const cells = [];
            for (let i = 0; i < colCount; i++) {
                cells.push((row[i] || '').padEnd(colWidths[i]));
            }
            lines.push('| ' + cells.join(' | ') + ' |');
        }

        return '\n' + lines.join('\n') + '\n';
    } finally {
        dom.window.close();
    }
}

/**
 * 處理單元格內容，使用 Turndown 轉換並處理表格專用轉義
 */
function getCellContent(cellHtml: string, turndownService: TurndownService): string {
    // 用 Turndown 轉換，保留粗體、連結等格式
    let markdown = turndownService.turndown(cellHtml);

    // 處理表格專用轉義
    markdown = markdown
        .replace(/\|/g, '\\|')      // 轉義 pipe
        .replace(/\n/g, ' ')         // 移除換行（表格單元格不支援多行）
        .trim();

    return markdown;
}

function cleanupMarkdown(markdown: string, title: string): string {
    let result = markdown;

    // 加入標題
    result = `# ${title}\n\n${result}`;

    // 移除空的圖片連結
    result = result.replace(/!\[[^\]]*\]\(\s*\)/g, '');

    // 移除不必要的反斜線轉義（列表項目開頭的數字）
    result = result.replace(/(\d+)\\\./g, '$1.');

    // 清理多餘空行
    result = result.replace(/\n{3,}/g, '\n\n');

    // 清理行尾空白
    result = result.split('\n').map(line => line.trimEnd()).join('\n');

    // 確保檔案結尾有換行
    if (!result.endsWith('\n')) {
        result += '\n';
    }

    return result;
}

// 安全性：清理檔名（export for testing）
export function sanitizeFileName(name: string): string {
    const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

    let result = name
        .replace(/[<>:"/\\|?*]/g, '_')                // 危險字元
        .split('').map(char => {                      // 控制字元 + DEL
            const code = char.charCodeAt(0);
            return (code <= 0x1f || code === 0x7f) ? '_' : char;
        }).join('')
        .replace(/\.{2,}/g, '_')                      // 路徑穿越
        .replace(/^\.+/, '_')                         // 開頭的點
        .replace(/[\s.]+$/, '_')                      // 結尾空格和點
        .slice(0, 200);

    if (WINDOWS_RESERVED.test(result)) {
        result = '_' + result;
    }

    return result || '_';  // 防止空字串
}

function showBatchSummary(results: BatchResult[], outputDir: string): void {
    const succeeded = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const totalImages = succeeded.reduce((sum, r) => sum + (r.imageCount || 0), 0);

    if (results.length === 0) {
        // 使用者取消了所有轉換
        return;
    }

    if (failed.length === 0) {
        showInformationMessage(
            `✅ Converted ${succeeded.length} file${succeeded.length > 1 ? 's' : ''}, extracted ${totalImages} image${totalImages !== 1 ? 's' : ''}`
        );
    } else {
        const failedNames = failed.map(f => f.fileName).join(', ');
        vscode.window.showWarningMessage(
            `Converted ${succeeded.length}/${results.length} files. Failed: ${failedNames}`,
            'Show Details'
        ).then(selection => {
            if (selection === 'Show Details') {
                for (const f of failed) {
                    log(`Failed: ${f.fileName} - ${f.error}`);
                }
            }
        });
    }

    // 開啟輸出目錄
    vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputDir));
}
