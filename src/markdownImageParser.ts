import * as path from 'path';

export interface ImageReference {
    altText: string;
    imagePath: string;
    titleSuffix?: string;
    fullPath: string;
    line: number;
    column: number;
    match: string;
}

/**
 * Complete regex supporting double-quoted, single-quoted, and parenthesized title.
 * Matches: ![alt](path), ![alt](path "title"), ![alt](path 'title'), ![alt](path (title))
 */
export const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)\n]*?)(?:\s+(".*?"|'.*?'|\(.*?\)))?\)/g;

/**
 * Parse all local image references from a Markdown document's text.
 * Skips URLs (http://, https://, data:).
 */
export function parseMarkdownImages(text: string, documentFsPath: string): ImageReference[] {
    const results: ImageReference[] = [];
    const documentDir = path.dirname(documentFsPath);
    const regex = new RegExp(MARKDOWN_IMAGE_REGEX.source, MARKDOWN_IMAGE_REGEX.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        const altText = match[1];
        let imagePath = match[2].trim();
        const titleSuffix = match[3];

        // Remove query string and fragment
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

        // Derive line and column from match.index
        const beforeMatch = text.substring(0, match.index);
        const linesBefore = beforeMatch.split(/\r?\n/);
        const line = linesBefore.length - 1;
        const column = linesBefore[linesBefore.length - 1].length;

        results.push({
            altText,
            imagePath,
            titleSuffix,
            fullPath,
            line,
            column,
            match: match[0],
        });
    }

    return results;
}
