import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as logger from './logger';

interface ImageReference {
    match: string;
    imagePath: string;
    range: vscode.Range;
    fullPath: string;
}

const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g;
const ASCIIDOC_IMAGE_PATTERN = /image::([^[]+)\[/g;

function findImageAtCursor(document: vscode.TextDocument, position: vscode.Position): ImageReference | undefined {
    const line = document.lineAt(position.line);
    const lineText = line.text;
    const languageId = document.languageId;

    const pattern = languageId === 'asciidoc' ? ASCIIDOC_IMAGE_PATTERN : MARKDOWN_IMAGE_PATTERN;
    pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(lineText)) !== null) {
        const startChar = match.index;
        const endChar = match.index + match[0].length;

        if (position.character >= startChar && position.character <= endChar) {
            const imagePath = languageId === 'asciidoc' ? match[1] : match[2];
            const documentDir = path.dirname(document.uri.fsPath);

            // Decode URL-encoded path
            const decodedPath = decodeURIComponent(imagePath);
            const fullPath = path.isAbsolute(decodedPath)
                ? decodedPath
                : path.resolve(documentDir, decodedPath);

            return {
                match: match[0],
                imagePath: imagePath,
                range: new vscode.Range(
                    new vscode.Position(position.line, startChar),
                    new vscode.Position(position.line, endChar)
                ),
                fullPath: fullPath
            };
        }
    }

    return undefined;
}

function buildNewImageSyntax(
    languageId: string,
    oldMatch: string,
    newRelativePath: string
): string {
    if (languageId === 'asciidoc') {
        // Extract attributes from old match: image::path[attrs]
        const attrsMatch = oldMatch.match(/\[([^\]]*)\]$/);
        const attrs = attrsMatch ? attrsMatch[1] : '';
        return `image::${newRelativePath}[${attrs}]`;
    } else {
        // Extract alt text from old match: ![alt](path)
        const altMatch = oldMatch.match(/!\[([^\]]*)\]/);
        const altText = altMatch ? altMatch[1] : '';
        return `![${altText}](${newRelativePath})`;
    }
}

export async function renameImage(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        logger.showInformationMessage('No active editor found.');
        return;
    }

    const document = editor.document;
    const position = editor.selection.active;

    // Find image reference at cursor
    const imageRef = findImageAtCursor(document, position);
    if (!imageRef) {
        logger.showInformationMessage('No image reference found at cursor position. Place cursor on an image path like ![](path) or image::path[]');
        return;
    }

    // Check if file exists
    if (!fs.existsSync(imageRef.fullPath)) {
        logger.showErrorMessage(`Image file not found: ${imageRef.fullPath}`);
        return;
    }

    const oldFileName = path.basename(imageRef.fullPath);
    const oldDir = path.dirname(imageRef.fullPath);
    const ext = path.extname(oldFileName);

    // Show input box for new filename
    const newFileName = await vscode.window.showInputBox({
        prompt: 'Enter new image filename',
        value: oldFileName,
        valueSelection: [0, oldFileName.length - ext.length],
        validateInput: (value) => {
            if (!value || value.trim() === '') {
                return 'Filename cannot be empty';
            }
            if (/[\\/:*?"<>|]/.test(value)) {
                return 'Filename contains invalid characters';
            }
            return undefined;
        }
    });

    if (!newFileName || newFileName === oldFileName) {
        return; // User cancelled or no change
    }

    // Ensure extension is preserved
    let finalNewFileName = newFileName;
    if (!finalNewFileName.toLowerCase().endsWith(ext.toLowerCase())) {
        finalNewFileName += ext;
    }

    const newFullPath = path.join(oldDir, finalNewFileName);

    // Check if new file already exists
    if (fs.existsSync(newFullPath)) {
        const choice = await logger.showInformationMessage(
            `File "${finalNewFileName}" already exists. Overwrite?`,
            'Overwrite',
            'Cancel'
        );
        if (choice !== 'Overwrite') {
            return;
        }
    }

    try {
        // Rename the actual file
        await fs.promises.rename(imageRef.fullPath, newFullPath);

        // Calculate new relative path
        const documentDir = path.dirname(document.uri.fsPath);
        let newRelativePath = path.relative(documentDir, newFullPath);

        // Use forward slashes for consistency
        newRelativePath = newRelativePath.replace(/\\/g, '/');

        // URL encode spaces
        newRelativePath = newRelativePath.replace(/ /g, '%20');

        // Build new image syntax
        const newImageSyntax = buildNewImageSyntax(
            document.languageId,
            imageRef.match,
            newRelativePath
        );

        // Update the document
        await editor.edit((editBuilder) => {
            editBuilder.replace(imageRef.range, newImageSyntax);
        });

        logger.showInformationMessage(`Renamed image to: ${finalNewFileName}`);
    } catch (err) {
        logger.showErrorMessage(`Failed to rename image: ${(err as Error).message}`);
    }
}
