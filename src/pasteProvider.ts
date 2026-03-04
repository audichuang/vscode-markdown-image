import * as vscode from 'vscode';
import * as path from 'path';
import dayjs from 'dayjs';
import { loadConfig } from './config';
import { replacePathVariables, renderFilePath } from './pathVariables';
import { sanitizeFileName } from './sanitize';
import * as logger from './logger';

function getProjectRoot(fileUri: vscode.Uri): string | undefined {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
    if (workspaceFolder) {
        return workspaceFolder.uri.fsPath;
    }
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function makeImagePath(fileName: string, filePath: string, folderPathFromConfig: string): string {
    const folderPath = path.dirname(filePath);
    if (path.isAbsolute(folderPathFromConfig)) {
        return path.join(folderPathFromConfig, fileName);
    }
    return path.join(folderPath, folderPathFromConfig, fileName);
}

export class MarkInkPasteEditProvider implements vscode.DocumentPasteEditProvider {

    async provideDocumentPasteEdits(
        document: vscode.TextDocument,
        ranges: readonly vscode.Range[],
        dataTransfer: vscode.DataTransfer,
        _context: vscode.DocumentPasteEditContext,
        token: vscode.CancellationToken
    ): Promise<vscode.DocumentPasteEdit[] | undefined> {
        // Find image data in the clipboard
        const imageItem = this.findImageItem(dataTransfer);
        if (!imageItem) {
            return undefined;
        }

        const fileUri = document.uri;
        if (fileUri.scheme === 'untitled') {
            return undefined;
        }

        if (token.isCancellationRequested) {
            return undefined;
        }

        const filePath = fileUri.fsPath;
        const projectPath = getProjectRoot(fileUri);

        // Load and resolve config
        let config = loadConfig();
        config = {
            ...config,
            defaultName: replacePathVariables(config.defaultName, projectPath, filePath, (x) => `[${x}]`),
            folderPath: replacePathVariables(config.folderPath, projectPath, filePath),
            basePath: replacePathVariables(config.basePath, projectPath, filePath),
            namePrefix: replacePathVariables(config.namePrefix, projectPath, filePath),
            nameSuffix: replacePathVariables(config.nameSuffix, projectPath, filePath),
            insertPattern: replacePathVariables(config.insertPattern, projectPath, filePath),
        };

        logger.log(`[pasteProvider] imagePath: "${config.folderPath}", basePath: "${config.basePath}"`);

        // Build image filename
        const selectedText = ranges.length > 0
            ? document.getText(ranges[0]).trim()
            : '';
        const sanitized = selectedText ? sanitizeFileName(selectedText) : '';

        const imageFileName = sanitized
            ? config.namePrefix + sanitized + config.nameSuffix + '.png'
            : config.namePrefix + dayjs().format(config.defaultName) + config.nameSuffix + '.png';

        const imagePath = makeImagePath(imageFileName, filePath, config.folderPath);
        logger.log(`[pasteProvider] final imagePath: "${imagePath}"`);

        // Read image data
        const file = imageItem.asFile();
        if (!file) {
            return undefined;
        }

        const imageData = await file.data();
        if (token.isCancellationRequested) {
            return undefined;
        }

        // Create directory and save image
        const imageDir = path.dirname(imagePath);
        try {
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(imageDir));
        } catch {
            // directory may already exist
        }

        await vscode.workspace.fs.writeFile(
            vscode.Uri.file(imagePath),
            imageData
        );

        // Render the markdown path
        const renderedPath = renderFilePath({
            languageId: document.languageId,
            basePath: config.basePath,
            imageFilePath: imagePath,
            forceUnixStyleSeparator: config.forceUnixStyleSeparator,
            prefix: config.prefix,
            suffix: config.suffix,
            encodePath: config.encodePath,
            insertPattern: config.insertPattern,
        });

        logger.log(`[pasteProvider] inserted: "${renderedPath}"`);

        const editKind = vscode.DocumentDropOrPasteEditKind.Empty.append('markink', 'image');
        const pasteEdit = new vscode.DocumentPasteEdit(renderedPath, 'MarkInk', editKind);
        pasteEdit.yieldTo = []; // Don't yield to built-in paste
        return [pasteEdit];
    }

    private findImageItem(dataTransfer: vscode.DataTransfer): vscode.DataTransferItem | undefined {
        for (const [mimeType, item] of dataTransfer) {
            if (mimeType.startsWith('image/')) {
                return item;
            }
        }
        return undefined;
    }
}

export function registerPasteProvider(context: vscode.ExtensionContext): void {
    const selector: vscode.DocumentSelector = [
        { language: 'markdown' },
        { language: 'asciidoc' },
    ];

    const provider = new MarkInkPasteEditProvider();
    const editKind = vscode.DocumentDropOrPasteEditKind.Empty.append('markink', 'image');

    const disposable = vscode.languages.registerDocumentPasteEditProvider(
        selector,
        provider,
        {
            pasteMimeTypes: ['image/*'],
            providedPasteEditKinds: [editKind],
        }
    );

    context.subscriptions.push(disposable);
    logger.log('MarkInk paste provider registered for Cmd+V / Ctrl+V image paste');
}
