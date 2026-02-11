/**
 * Word to Markdown 轉換模組
 * 統一導出 Word 相關功能
 */
export { convertWordToMarkdown, convertDocxWithImages } from './converter';
export type { ConversionResult } from './types';

// Core functions for testing (no vscode dependency)
export { convertDocxToMarkdown } from './converterCore';
