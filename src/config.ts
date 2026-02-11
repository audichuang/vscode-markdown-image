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

interface ConfigKeyMapping {
    legacyKey: string;
    modernKey: string;
}

const CONFIG_KEY_MAPPINGS: ConfigKeyMapping[] = [
    { legacyKey: 'defaultName', modernKey: 'defaultImageName' },
    { legacyKey: 'path', modernKey: 'imagePath' },
    { legacyKey: 'basePath', modernKey: 'imageBasePath' },
    { legacyKey: 'prefix', modernKey: 'imagePrefix' },
    { legacyKey: 'suffix', modernKey: 'imageSuffix' },
    { legacyKey: 'forceUnixStyleSeparator', modernKey: 'forceUnixStyleSeparator' },
    { legacyKey: 'encodePath', modernKey: 'encodePath' },
    { legacyKey: 'namePrefix', modernKey: 'imageNamePrefix' },
    { legacyKey: 'nameSuffix', modernKey: 'imageNameSuffix' },
    { legacyKey: 'insertPattern', modernKey: 'insertPattern' },
    { legacyKey: 'showFilePathConfirmInputBox', modernKey: 'showFilePathConfirmInputBox' },
    { legacyKey: 'filePathConfirmInputBoxMode', modernKey: 'filePathConfirmInputBoxMode' },
];

function isExplicitlyConfigured<T>(inspect: { workspaceValue?: T; workspaceFolderValue?: T; globalValue?: T } | undefined): boolean {
    return inspect?.workspaceValue !== undefined ||
        inspect?.workspaceFolderValue !== undefined ||
        inspect?.globalValue !== undefined;
}

export function loadConfig(): PasteImageConfig {
    const config = vscode.workspace.getConfiguration('markink');
    // Legacy fallback: also check pasteImage.* namespace
    const legacy = vscode.workspace.getConfiguration('pasteImage');

    function get<T>(key: string, markinkKey: string, defaultValue: T): T {
        const markinkValue = config.inspect<T>(markinkKey);
        // If user explicitly set markink.*, use it
        if (isExplicitlyConfigured(markinkValue)) {
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

async function migrateConfigTarget(
    target: vscode.ConfigurationTarget,
    resourceUri?: vscode.Uri
): Promise<number> {
    const modernConfig = vscode.workspace.getConfiguration('markink', resourceUri);
    const legacyConfig = vscode.workspace.getConfiguration('pasteImage', resourceUri);
    let migratedCount = 0;

    for (const mapping of CONFIG_KEY_MAPPINGS) {
        const modernInspect = modernConfig.inspect(mapping.modernKey);
        const legacyInspect = legacyConfig.inspect(mapping.legacyKey);

        const modernHasValue = target === vscode.ConfigurationTarget.Global
            ? modernInspect?.globalValue !== undefined
            : target === vscode.ConfigurationTarget.Workspace
                ? modernInspect?.workspaceValue !== undefined
                : modernInspect?.workspaceFolderValue !== undefined;

        const legacyValue = target === vscode.ConfigurationTarget.Global
            ? legacyInspect?.globalValue
            : target === vscode.ConfigurationTarget.Workspace
                ? legacyInspect?.workspaceValue
                : legacyInspect?.workspaceFolderValue;

        if (!modernHasValue && legacyValue !== undefined) {
            await modernConfig.update(mapping.modernKey, legacyValue, target);
            migratedCount++;
        }
    }

    return migratedCount;
}

let migrationInProgress = false;

export async function migrateLegacySettings(): Promise<number> {
    if (migrationInProgress) {
        return 0;
    }
    migrationInProgress = true;
    try {
        let migratedCount = 0;

        migratedCount += await migrateConfigTarget(vscode.ConfigurationTarget.Global);
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            migratedCount += await migrateConfigTarget(vscode.ConfigurationTarget.Workspace);
            for (const folder of vscode.workspace.workspaceFolders) {
                migratedCount += await migrateConfigTarget(vscode.ConfigurationTarget.WorkspaceFolder, folder.uri);
            }
        }

        return migratedCount;
    } finally {
        migrationInProgress = false;
    }
}
