import * as vscode from 'vscode';
import { log, showInformationMessage } from './logger';

interface PathOption {
    label: string;
    description: string;
    path: string;
    basePath: string;
}

const PATH_OPTIONS: PathOption[] = [
    {
        label: '$(file-directory) 與文件同目錄',
        description: '圖片儲存在當前 Markdown 檔案旁邊',
        path: '${currentFileDir}',
        basePath: '${currentFileDir}'
    },
    {
        label: '$(folder) ${projectRoot}/images',
        description: '圖片集中存放在專案根目錄的 images 資料夾',
        path: '${projectRoot}/images',
        basePath: '${projectRoot}'
    },
    {
        label: '$(folder) ${projectRoot}/assets',
        description: '圖片集中存放在專案根目錄的 assets 資料夾',
        path: '${projectRoot}/assets',
        basePath: '${projectRoot}'
    },
    {
        label: '$(folder) ${projectRoot}/docs/images',
        description: '圖片存放在 docs/images 資料夾（適合文件專案）',
        path: '${projectRoot}/docs/images',
        basePath: '${projectRoot}'
    },
    {
        label: '$(file-submodule) ${currentFileDir}/images',
        description: '圖片存放在當前檔案目錄下的 images 子資料夾',
        path: '${currentFileDir}/images',
        basePath: '${currentFileDir}'
    },
    {
        label: '$(pencil) 自訂路徑...',
        description: '輸入自訂的圖片存放路徑',
        path: 'custom',
        basePath: 'custom'
    }
];

export async function configureSettings(): Promise<void> {
    // Step 1: 選擇設定範圍
    const scopeOptions: vscode.QuickPickItem[] = [
        {
            label: '$(root-folder) 此專案 (Workspace)',
            description: '僅套用到當前專案，儲存在 .vscode/settings.json'
        },
        {
            label: '$(globe) 全域 (User)',
            description: '套用到所有專案，作為預設值'
        }
    ];

    const scopeChoice = await vscode.window.showQuickPick(scopeOptions, {
        placeHolder: '選擇設定範圍',
        title: 'MarkInk: 配置設定'
    });

    if (!scopeChoice) {
        return; // User cancelled
    }

    const isWorkspace = scopeChoice.label.includes('Workspace');
    const configTarget = isWorkspace
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;

    // Check if workspace is available for workspace settings
    if (isWorkspace && !vscode.workspace.workspaceFolders) {
        vscode.window.showErrorMessage('請先開啟一個專案資料夾才能設定專案層級的配置。');
        return;
    }

    // Step 2: 選擇圖片存放位置
    const pathChoice = await vscode.window.showQuickPick(
        PATH_OPTIONS.map(opt => ({
            label: opt.label,
            description: opt.description,
            path: opt.path,
            basePath: opt.basePath
        })),
        {
            placeHolder: '選擇圖片存放位置',
            title: 'MarkInk: 選擇圖片路徑'
        }
    );

    if (!pathChoice) {
        return; // User cancelled
    }

    let selectedPath = (pathChoice as PathOption).path;
    let selectedBasePath = (pathChoice as PathOption).basePath;

    // Step 3: 如果選擇自訂路徑
    if (selectedPath === 'custom') {
        const customPath = await vscode.window.showInputBox({
            prompt: '輸入圖片存放路徑（可使用 ${projectRoot}、${currentFileDir} 等變數）',
            value: '${projectRoot}/images',
            placeHolder: '例如: ${projectRoot}/assets/images'
        });

        if (!customPath) {
            return; // User cancelled
        }

        selectedPath = customPath;

        // Ask for base path
        const basePathOptions: vscode.QuickPickItem[] = [
            {
                label: '${projectRoot}',
                description: '使用專案根目錄作為基準路徑'
            },
            {
                label: '${currentFileDir}',
                description: '使用當前檔案目錄作為基準路徑'
            },
            {
                label: '$(pencil) 自訂...',
                description: '輸入自訂的基準路徑'
            }
        ];

        const basePathChoice = await vscode.window.showQuickPick(basePathOptions, {
            placeHolder: '選擇基準路徑（用於計算相對路徑）',
            title: 'MarkInk: 選擇基準路徑'
        });

        if (!basePathChoice) {
            return;
        }

        if (basePathChoice.label.includes('自訂')) {
            const customBasePath = await vscode.window.showInputBox({
                prompt: '輸入基準路徑',
                value: '${projectRoot}',
                placeHolder: '例如: ${projectRoot}'
            });
            selectedBasePath = customBasePath || '${projectRoot}';
        } else {
            selectedBasePath = basePathChoice.label;
        }
    }

    // Step 4: 儲存設定
    const config = vscode.workspace.getConfiguration('markink');

    try {
        await config.update('imagePath', selectedPath, configTarget);
        await config.update('imageBasePath', selectedBasePath, configTarget);

        const scopeText = isWorkspace ? '專案' : '全域';
        log(`Settings saved: path=${selectedPath}, basePath=${selectedBasePath}, scope=${scopeText}`);

        showInformationMessage(
            `✅ 設定已儲存！\n圖片路徑: ${selectedPath}\n範圍: ${scopeText}`
        );

        // Show the settings that were applied
        const showSettings = await vscode.window.showInformationMessage(
            `MarkInk 設定已更新`,
            '查看設定',
            '完成'
        );

        if (showSettings === '查看設定') {
            if (isWorkspace) {
                // Open workspace settings
                await vscode.commands.executeCommand(
                    'workbench.action.openWorkspaceSettingsFile'
                );
            } else {
                // Open user settings and search for markink
                await vscode.commands.executeCommand(
                    'workbench.action.openSettings',
                    'markink'
                );
            }
        }
    } catch (err) {
        vscode.window.showErrorMessage(`儲存設定失敗: ${(err as Error).message}`);
    }
}

export async function showCurrentSettings(): Promise<void> {
    const config = vscode.workspace.getConfiguration('markink');

    const imagePath = config.get<string>('imagePath') || '${currentFileDir}';
    const imageBasePath = config.get<string>('imageBasePath') || '${currentFileDir}';
    const defaultName = config.get<string>('defaultImageName') || 'YYYY-MM-DD-HH-mm-ss';
    const insertPattern = config.get<string>('insertPattern') || '${imageSyntaxPrefix}${imageFilePath}${imageSyntaxSuffix}';

    const info = `
**MarkInk 當前設定**

| 設定項 | 值 |
|--------|-----|
| 圖片路徑 | \`${imagePath}\` |
| 基準路徑 | \`${imageBasePath}\` |
| 預設檔名 | \`${defaultName}\` |
| 插入格式 | \`${insertPattern}\` |
    `.trim();

    const doc = await vscode.workspace.openTextDocument({
        content: info,
        language: 'markdown'
    });

    await vscode.window.showTextDocument(doc, { preview: true });
}
