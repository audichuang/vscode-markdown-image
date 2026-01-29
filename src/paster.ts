import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import dayjs from 'dayjs';
import { loadConfig, PasteImageConfig, FILE_PATH_CONFIRM_INPUTBOX_MODE } from './config';
import { replacePathVariables, renderFilePath } from './pathVariables';
import { saveClipboardImageToFile } from './clipboard';
import * as logger from './logger';

class PluginError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PluginError';
    }
}

function getProjectRoot(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    return workspaceFolders?.[0]?.uri.fsPath;
}

async function ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
        await fs.promises.mkdir(dirPath, { recursive: true });
    } catch (err) {
        const error = err as NodeJS.ErrnoException;
        if (error.code !== 'EEXIST') {
            throw err;
        }
    }
}

async function createImageDirWithImagePath(imagePath: string): Promise<string> {
    const imageDir = path.dirname(imagePath);

    try {
        const stats = await fs.promises.stat(imageDir);
        if (!stats.isDirectory()) {
            throw new PluginError(
                `The image dest directory '${imageDir}' is a file. Please check your 'pasteImage.path' config.`
            );
        }
        return imagePath;
    } catch (err) {
        const error = err as NodeJS.ErrnoException;
        if (error.code === 'ENOENT') {
            await ensureDirectoryExists(imageDir);
            return imagePath;
        }
        throw err;
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
    const projectPath = getProjectRoot();

    const selection = editor.selection;
    const selectText = editor.document.getText(selection);
    if (selectText && /[\\:*?<>|]/.test(selectText)) {
        logger.showInformationMessage('Your selection is not a valid filename!');
        return;
    }

    let config = loadConfig();

    if (config.folderPath.length !== config.folderPath.trim().length) {
        logger.showErrorMessage(`The config pasteImage.path = '${config.folderPath}' is invalid. Please check your config.`);
        return;
    }

    if (config.basePath.length !== config.basePath.trim().length) {
        logger.showErrorMessage(`The config pasteImage.basePath = '${config.basePath}' is invalid. Please check your config.`);
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

    const exists = fs.existsSync(imagePath);
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
