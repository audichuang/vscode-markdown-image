import * as vscode from 'vscode';
import * as path from 'path';
import dayjs from 'dayjs';
import { loadConfig, PasteImageConfig, FILE_PATH_CONFIRM_INPUTBOX_MODE } from './config';
import { replacePathVariables, renderFilePath } from './pathVariables';
import { saveClipboardImageToFile } from './clipboard';
import * as logger from './logger';
import { sanitizeFileName } from './sanitize';

class PluginError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PluginError';
    }
}

function getProjectRoot(fileUri: vscode.Uri): string | undefined {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
    if (workspaceFolder) {
        return workspaceFolder.uri.fsPath;
    }
    // Fallback for files outside any workspace folder
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function ensureDirectoryExists(dirPath: string): Promise<void> {
    const dirUri = vscode.Uri.file(dirPath);
    await vscode.workspace.fs.createDirectory(dirUri);
}

async function createImageDirWithImagePath(imagePath: string): Promise<string> {
    const imageDir = path.dirname(imagePath);
    const dirUri = vscode.Uri.file(imageDir);

    try {
        const stat = await vscode.workspace.fs.stat(dirUri);
        if (stat.type !== vscode.FileType.Directory) {
            throw new PluginError(
                `The image dest directory '${imageDir}' is a file. Please check your 'markink.imagePath' config.`
            );
        }
        return imagePath;
    } catch (err) {
        if (err instanceof vscode.FileSystemError && err.code === 'FileNotFound') {
            await ensureDirectoryExists(imageDir);
            return imagePath;
        }
        if (err instanceof PluginError) {
            throw err;
        }
        // For other FileSystemError (e.g. EntryNotFound), create directory
        try {
            await ensureDirectoryExists(imageDir);
            return imagePath;
        } catch {
            throw err;
        }
    }
}

function makeImagePath(fileName: string, filePath: string, folderPathFromConfig: string): string {
    const folderPath = path.dirname(filePath);

    if (path.isAbsolute(folderPathFromConfig)) {
        return path.join(folderPathFromConfig, fileName);
    }
    return path.join(folderPath, folderPathFromConfig, fileName);
}

async function getImagePath(
    filePath: string,
    selectText: string,
    config: PasteImageConfig
): Promise<string | undefined> {
    let imageFileName: string;
    if (!selectText) {
        imageFileName = config.namePrefix + dayjs().format(config.defaultName) + config.nameSuffix + '.png';
    } else {
        imageFileName = config.namePrefix + selectText + config.nameSuffix + '.png';
    }

    const isFullPathMode = config.filePathConfirmInputBoxMode === FILE_PATH_CONFIRM_INPUTBOX_MODE.FULL_PATH;
    const filePathOrName = isFullPathMode
        ? makeImagePath(imageFileName, filePath, config.folderPath)
        : imageFileName;

    if (config.showFilePathConfirmInputBox) {
        let result = await vscode.window.showInputBox({
            prompt: 'Please specify the filename of the image.',
            value: filePathOrName
        });

        if (!result) {
            return undefined;
        }

        if (!result.endsWith('.png')) {
            result += '.png';
        }

        if (config.filePathConfirmInputBoxMode === FILE_PATH_CONFIRM_INPUTBOX_MODE.ONLY_NAME) {
            result = makeImagePath(result, filePath, config.folderPath);
        }

        return result;
    }

    return makeImagePath(imageFileName, filePath, config.folderPath);
}

async function saveAndPaste(editor: vscode.TextEditor, imagePath: string, config: PasteImageConfig): Promise<void> {
    try {
        await createImageDirWithImagePath(imagePath);

        const result = await saveClipboardImageToFile(imagePath);

        if (!result.success) {
            if (result.error === 'no image') {
                logger.showInformationMessage('There is not an image in the clipboard.');
            }
            return;
        }

        const renderedPath = renderFilePath({
            languageId: editor.document.languageId,
            basePath: config.basePath,
            imageFilePath: imagePath,
            forceUnixStyleSeparator: config.forceUnixStyleSeparator,
            prefix: config.prefix,
            suffix: config.suffix,
            encodePath: config.encodePath,
            insertPattern: config.insertPattern,
        });

        await editor.edit((edit) => {
            const current = editor.selection;
            if (current.isEmpty) {
                edit.insert(current.start, renderedPath);
            } else {
                edit.replace(current, renderedPath);
            }
        });
    } catch (err) {
        if (err instanceof PluginError) {
            logger.showErrorMessage(err.message);
        } else {
            logger.showErrorMessage(`Failed to create folder. message=${(err as Error).message}`);
        }
    }
}

export async function paste(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const fileUri = editor.document.uri;
    if (!fileUri) {
        return;
    }

    if (fileUri.scheme === 'untitled') {
        logger.showInformationMessage('Before pasting the image, you need to save current file first.');
        return;
    }

    const filePath = fileUri.fsPath;
    const projectPath = getProjectRoot(fileUri);

    const selection = editor.selection;
    const rawSelectText = editor.document.getText(selection);
    const selectText = rawSelectText ? sanitizeFileName(rawSelectText) : '';

    let config = loadConfig();

    if (config.folderPath.length !== config.folderPath.trim().length) {
        logger.showErrorMessage(`The config markink.imagePath = '${config.folderPath}' is invalid. Please check your config.`);
        return;
    }

    if (config.basePath.length !== config.basePath.trim().length) {
        logger.showErrorMessage(`The config markink.imageBasePath = '${config.basePath}' is invalid. Please check your config.`);
        return;
    }

    // Replace path variables in config values
    config = {
        ...config,
        defaultName: replacePathVariables(config.defaultName, projectPath, filePath, (x) => `[${x}]`),
        folderPath: replacePathVariables(config.folderPath, projectPath, filePath),
        basePath: replacePathVariables(config.basePath, projectPath, filePath),
        namePrefix: replacePathVariables(config.namePrefix, projectPath, filePath),
        nameSuffix: replacePathVariables(config.nameSuffix, projectPath, filePath),
        insertPattern: replacePathVariables(config.insertPattern, projectPath, filePath),
    };

    const imagePath = await getImagePath(filePath, selectText, config);
    if (!imagePath) {
        return;
    }

    // Use async file check to avoid blocking UI
    let exists = false;
    try {
        await vscode.workspace.fs.stat(vscode.Uri.file(imagePath));
        exists = true;
    } catch {
        exists = false;
    }

    if (exists) {
        const choice = await logger.showInformationMessage(
            `File ${imagePath} existed. Would you want to replace?`,
            'Replace',
            'Cancel'
        );
        if (choice !== 'Replace') {
            return;
        }
    }

    await saveAndPaste(editor, imagePath, config);
}
