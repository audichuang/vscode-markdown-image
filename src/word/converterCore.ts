/**
 * Word to Markdown 核心轉換邏輯（不依賴 vscode）
 * 用於測試和 CLI 場景
 */
import * as path from 'path';
import * as fs from 'fs';
import * as mammoth from 'mammoth';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { JSDOM } from 'jsdom';
import { ConversionResult } from './types';

export async function convertDocxToMarkdown(
    docxPath: string,
    imagesDir: string,
    baseName: string
): Promise<ConversionResult> {
    let imageIndex = 0;
    const warnings: string[] = [];

    const result = await mammoth.convertToHtml(
        { path: docxPath },
        {
            styleMap: [
                "r[style-name='Superscript'] => sup",
                "r[style-name='Subscript'] => sub",
                "r[vertAlign='superscript'] => sup",
                "r[vertAlign='subscript'] => sub",
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
                    };
                    const imgExt = extMap[contentType] || '.png';

                    imageIndex++;
                    const newName = `${baseName}-image-${String(imageIndex).padStart(3, '0')}${imgExt}`;
                    const imgPath = path.join(imagesDir, newName);

                    fs.writeFileSync(imgPath, imageBuffer);
                    return { src: `images/${newName}` };
                } catch (err) {
                    warnings.push(`Failed to extract image ${imageIndex}: ${(err as Error).message}`);
                    return { src: '' };
                }
            })
        }
    );

    for (const msg of result.messages) {
        warnings.push(`${msg.type}: ${msg.message}`);
    }

    // 預處理：標記複雜表格
    const preprocessedHtml = preprocessComplexTables(result.value);

    const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        bulletListMarker: '-',
        emDelimiter: '*',
        strongDelimiter: '**'
    });

    turndownService.use(gfm);
    turndownService.keep(['sub', 'sup', 'mark']);

    // 處理已標記的複雜表格（用 complex-table 標籤包裹）
    turndownService.addRule('complexTable', {
        filter: function(node) {
            return node.nodeName.toLowerCase() === 'complex-table';
        },
        replacement: function(_content, node) {
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

function preprocessComplexTables(html: string): string {
    const dom = new JSDOM(html);
    try {
        const doc = dom.window.document;
        const allTables = doc.querySelectorAll('table');

        for (const table of allTables) {
            if (table.parentElement?.closest('table')) continue;

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

function isComplexTable(table: Element): boolean {
    if (table.querySelectorAll('img').length > 0) return true;
    if (table.querySelectorAll('ul, ol').length > 0) return true;
    if (table.querySelectorAll('table').length > 0) return true;

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

function convertSimpleTableToMarkdown(tableHtml: string, turndownService: TurndownService): string {
    const dom = new JSDOM(tableHtml);
    try {
        const doc = dom.window.document;
        const table = doc.querySelector('table');

        if (!table) return '';

        const rows: string[][] = [];
        const tableRows = table.querySelectorAll('tr');

        for (const tr of tableRows) {
            const cells: string[] = [];
            const tableCells = tr.querySelectorAll('td, th');

            for (const cell of tableCells) {
                let md = turndownService.turndown(cell.innerHTML);
                md = md.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
                cells.push(md);
            }

            if (cells.length > 0) {
                rows.push(cells);
            }
        }

        if (rows.length === 0) return '';

        const colCount = Math.max(...rows.map(r => r.length));
        const colWidths: number[] = Array(colCount).fill(3);

        for (const row of rows) {
            for (let i = 0; i < row.length; i++) {
                colWidths[i] = Math.max(colWidths[i], row[i].length);
            }
        }

        const lines: string[] = [];
        const header = rows[0] || [];
        const headerCells = [];
        for (let i = 0; i < colCount; i++) {
            headerCells.push((header[i] || '').padEnd(colWidths[i]));
        }
        lines.push('| ' + headerCells.join(' | ') + ' |');
        lines.push('| ' + colWidths.map(w => '-'.repeat(w)).join(' | ') + ' |');

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
