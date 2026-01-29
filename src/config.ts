import * as vscode from 'vscode';

export interface PasteImageConfig {
    defaultName: string;
    folderPath: string;
    basePath: string;
    prefix: string;
    suffix: string;
    forceUnixStyleSeparator: boolean;
    encodePath: 'none' | 'urlEncode' | 'urlEncodeSpace';
    namePrefix: string;
    nameSuffix: string;
    insertPattern: string;
    showFilePathConfirmInputBox: boolean;
    filePathConfirmInputBoxMode: 'fullPath' | 'onlyName';
}

export const FILE_PATH_CONFIRM_INPUTBOX_MODE = {
    ONLY_NAME: 'onlyName',
    FULL_PATH: 'fullPath',
} as const;

export function loadConfig(): PasteImageConfig {
    const config = vscode.workspace.getConfiguration('pasteImage');

    return {
        defaultName: config.get<string>('defaultName') || 'YYYY-MM-DD-HH-mm-ss',
        folderPath: config.get<string>('path') || '${currentFileDir}',
        basePath: config.get<string>('basePath') || '',
        prefix: config.get<string>('prefix') || '',
        suffix: config.get<string>('suffix') || '',
        forceUnixStyleSeparator: config.get<boolean>('forceUnixStyleSeparator') ?? true,
        encodePath: config.get<'none' | 'urlEncode' | 'urlEncodeSpace'>('encodePath') || 'urlEncodeSpace',
        namePrefix: config.get<string>('namePrefix') || '',
        nameSuffix: config.get<string>('nameSuffix') || '',
        insertPattern: config.get<string>('insertPattern') || '${imageSyntaxPrefix}${imageFilePath}${imageSyntaxSuffix}',
        showFilePathConfirmInputBox: config.get<boolean>('showFilePathConfirmInputBox') || false,
        filePathConfirmInputBoxMode: config.get<'fullPath' | 'onlyName'>('filePathConfirmInputBoxMode') || 'fullPath',
    };
}
