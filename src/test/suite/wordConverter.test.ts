import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as mammoth from 'mammoth';
import TurndownService from 'turndown';
import { sanitizeFileName } from '../../sanitize';

suite('Word Converter Test Suite', () => {
    const fixturesDir = path.join(__dirname, '..', '..', '..', 'src', 'test', 'fixtures');
    const testDocx = path.join(fixturesDir, 'Technical_Specification_Test.docx');

    suite('sanitizeFileName', () => {
        test('should remove dangerous characters', () => {
            assert.strictEqual(sanitizeFileName('file<>:"/\\|?*name'), 'file_________name');
        });

        test('should handle path traversal attempts', () => {
            assert.strictEqual(sanitizeFileName('..\\..\\etc\\passwd'), '____etc_passwd');
        });

        test('should remove leading dots', () => {
            assert.strictEqual(sanitizeFileName('...hidden'), '_hidden');
        });

        test('should remove trailing spaces and dots', () => {
            assert.strictEqual(sanitizeFileName('filename...'), 'filename_');
            assert.strictEqual(sanitizeFileName('filename   '), 'filename');
        });

        test('should prefix Windows reserved names', () => {
            assert.strictEqual(sanitizeFileName('CON'), '_CON');
            assert.strictEqual(sanitizeFileName('PRN'), '_PRN');
            assert.strictEqual(sanitizeFileName('AUX'), '_AUX');
            assert.strictEqual(sanitizeFileName('NUL'), '_NUL');
            assert.strictEqual(sanitizeFileName('COM1'), '_COM1');
            assert.strictEqual(sanitizeFileName('LPT9'), '_LPT9');
        });

        test('should prefix Windows reserved names with extensions', () => {
            assert.strictEqual(sanitizeFileName('CON.txt'), '_CON.txt');
            assert.strictEqual(sanitizeFileName('NUL.png'), '_NUL.png');
        });

        test('should truncate long names to 200 chars', () => {
            const longName = 'a'.repeat(300);
            assert.strictEqual(sanitizeFileName(longName).length, 200);
        });

        test('should return underscore for empty input', () => {
            assert.strictEqual(sanitizeFileName(''), '_');
        });

        test('should handle normal filenames unchanged', () => {
            assert.strictEqual(sanitizeFileName('my-document'), 'my-document');
            assert.strictEqual(sanitizeFileName('報告_2026'), '報告_2026');
        });

        test('should handle control characters', () => {
            assert.strictEqual(sanitizeFileName('file\x00\x1fname'), 'file__name');
        });
    });

    suite('DOCX Parsing with mammoth', () => {
        test('test fixture file should exist', () => {
            assert.ok(fs.existsSync(testDocx), `Test file not found: ${testDocx}`);
        });

        test('should extract correct number of images', async () => {
            let imageCount = 0;
            await mammoth.convertToHtml(
                { path: testDocx },
                {
                    convertImage: mammoth.images.imgElement(async () => {
                        imageCount++;
                        return { src: `image-${imageCount}.png` };
                    })
                }
            );
            assert.strictEqual(imageCount, 3, 'Should extract 3 images');
        });

        test('should detect correct image types', async () => {
            const imageTypes: string[] = [];
            await mammoth.convertToHtml(
                { path: testDocx },
                {
                    convertImage: mammoth.images.imgElement(async (image) => {
                        imageTypes.push(image.contentType || 'unknown');
                        return { src: 'img.png' };
                    })
                }
            );
            assert.deepStrictEqual(imageTypes, ['image/png', 'image/png', 'image/jpeg']);
        });

        test('should convert to valid HTML', async () => {
            const result = await mammoth.convertToHtml({ path: testDocx });
            assert.ok(result.value.length > 0, 'HTML should not be empty');
            assert.ok(result.value.includes('<h1>'), 'Should contain h1 headings');
            assert.ok(result.value.includes('<table>'), 'Should contain tables');
        });

        test('should extract Chinese content correctly', async () => {
            const result = await mammoth.convertToHtml({ path: testDocx });
            assert.ok(result.value.includes('技術規格書'), 'Should contain Chinese title');
            assert.ok(result.value.includes('簡介'), 'Should contain section headers');
        });
    });

    suite('HTML to Markdown conversion', () => {
        const turndownService = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced',
            bulletListMarker: '-',
            emDelimiter: '*',
            strongDelimiter: '**'
        });

        test('should convert headings to ATX style', () => {
            const html = '<h1>Title</h1><h2>Subtitle</h2>';
            const md = turndownService.turndown(html);
            assert.ok(md.includes('# Title'), 'H1 should use # prefix');
            assert.ok(md.includes('## Subtitle'), 'H2 should use ## prefix');
        });

        test('should convert bold and italic', () => {
            const html = '<strong>bold</strong> and <em>italic</em>';
            const md = turndownService.turndown(html);
            assert.ok(md.includes('**bold**'), 'Should use ** for bold');
            assert.ok(md.includes('*italic*'), 'Should use * for italic');
        });

        test('should convert unordered lists', () => {
            const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
            const md = turndownService.turndown(html);
            // turndown uses * or - depending on version
            assert.ok(md.includes('Item 1') && md.includes('Item 2'), 'Should contain list items');
        });

        test('should convert ordered lists', () => {
            const html = '<ol><li>First</li><li>Second</li></ol>';
            const md = turndownService.turndown(html);
            assert.ok(md.includes('1.'), 'Should have numbered list');
        });

        test('should convert images', () => {
            const html = '<img src="images/test.png" />';
            const md = turndownService.turndown(html);
            assert.ok(md.includes('![](images/test.png)'), 'Should convert to MD image syntax');
        });
    });

    suite('Full conversion pipeline', () => {
        test('should convert DOCX to Markdown with images', async () => {
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markink-test-'));
            const imagesDir = path.join(tempDir, 'images');
            fs.mkdirSync(imagesDir);

            try {
                let imageIndex = 0;
                const result = await mammoth.convertToHtml(
                    { path: testDocx },
                    {
                        convertImage: mammoth.images.imgElement(async (image) => {
                            const imageBuffer = await image.read();
                            const contentType = image.contentType || 'image/png';
                            const ext = contentType === 'image/jpeg' ? '.jpg' : '.png';

                            imageIndex++;
                            const imageName = `test-image-${String(imageIndex).padStart(3, '0')}${ext}`;
                            const imagePath = path.join(imagesDir, imageName);

                            fs.writeFileSync(imagePath, imageBuffer);
                            return { src: `images/${imageName}` };
                        })
                    }
                );

                const turndownService = new TurndownService({
                    headingStyle: 'atx',
                    bulletListMarker: '-'
                });
                const markdown = turndownService.turndown(result.value);

                // 驗證轉換結果
                assert.ok(markdown.length > 0, 'Markdown should not be empty');
                assert.ok(markdown.includes('# '), 'Should have headings');
                assert.ok(markdown.includes('images/test-image-001.png'), 'Should have image references');

                // 驗證圖片檔案
                const images = fs.readdirSync(imagesDir);
                assert.strictEqual(images.length, 3, 'Should extract 3 images');
                assert.ok(images.includes('test-image-001.png'));
                assert.ok(images.includes('test-image-002.png'));
                assert.ok(images.includes('test-image-003.jpg'));

                // 驗證圖片不是空檔案
                for (const img of images) {
                    const stats = fs.statSync(path.join(imagesDir, img));
                    assert.ok(stats.size > 0, `Image ${img} should not be empty`);
                }

            } finally {
                // 清理暫存目錄
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        });
    });
});
