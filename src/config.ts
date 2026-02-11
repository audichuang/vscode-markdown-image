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
    const config = vscode.workspace.getConfiguration('markink');
    // Legacy fallback: also check pasteImage.* namespace
    const legacy = vscode.workspace.getConfiguration('pasteImage');

    function get<T>(key: string, markinkKey: string, defaultValue: T): T {
        const markinkValue = config.inspect<T>(markinkKey);
        // If user explicitly set markink.*, use it
        if (markinkValue?.workspaceValue !== undefined ||
            markinkValue?.workspaceFolderValue !== undefined ||
            markinkValue?.globalValue !== undefined) {
            return config.get<T>(markinkKey, defaultValue);
        }
        // Otherwise fall back to legacy pasteImage.*
        return legacy.get<T>(key, defaultValue);
    }

    return {
        defaultName: get('defaultName', 'defaultImageName', 'YYYY-MM-DD-HH-mm-ss'),
        folderPath: get('path', 'imagePath', '${currentFileDir}'),
        basePath: get('basePath', 'imageBasePath', '${currentFileDir}'),
        prefix: get('prefix', 'imagePrefix', ''),
        suffix: get('suffix', 'imageSuffix', ''),
        forceUnixStyleSeparator: get('forceUnixStyleSeparator', 'forceUnixStyleSeparator', true),
        encodePath: get('encodePath', 'encodePath', 'urlEncodeSpace' as const),
        namePrefix: get('namePrefix', 'imageNamePrefix', ''),
        nameSuffix: get('nameSuffix', 'imageNameSuffix', ''),
        insertPattern: get('insertPattern', 'insertPattern', '${imageSyntaxPrefix}${imageFilePath}${imageSyntaxSuffix}'),
        showFilePathConfirmInputBox: get('showFilePathConfirmInputBox', 'showFilePathConfirmInputBox', false),
        filePathConfirmInputBoxMode: get('filePathConfirmInputBoxMode', 'filePathConfirmInputBoxMode', 'fullPath' as const),
    };
}
