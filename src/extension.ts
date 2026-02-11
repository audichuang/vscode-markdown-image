import * as vscode from 'vscode';
import { paste } from './paster';
import { renameImage } from './renameImage';
import { configureSettings, showCurrentSettings } from './configUI';
import { MarkdownOutlineProvider, gotoHeading } from './outline';
import { ImageListProvider, gotoImage } from './imageList';
import { ToolsPanelProvider } from './toolsPanel';
import { insertToc, updateToc, formatTable, insertTable } from './tableUtils';
import { exportMarkdown } from './exporter';
import { convertWordToMarkdown } from './word';
import { checkImageLinks, initDiagnostics, initReportProvider } from './imageChecker';
import { initLogger, log, showErrorMessage } from './logger';
import { migrateLegacySettings } from './config';

export function activate(context: vscode.ExtensionContext): void {
    initLogger(context);
    initDiagnostics(context);
    initReportProvider(context);
    log('Extension "MarkInk" is now active!');
    void migrateLegacySettings().then((migratedCount) => {
        if (migratedCount > 0) {
            log(`Migrated ${migratedCount} legacy pasteImage.* settings to markink.*`);
        }
    }).catch((e) => {
        log(`Failed to migrate legacy settings: ${(e as Error).message}`);
    });

    // === Image Commands ===
    const pasteDisposable = vscode.commands.registerCommand('markink.pasteImage', async () => {
        try {
            await paste();
        } catch (e) {
            showErrorMessage((e as Error).message);
        }
    });

    const renameDisposable = vscode.commands.registerCommand('markink.renameImage', async () => {
        try {
            await renameImage();
        } catch (e) {
            showErrorMessage((e as Error).message);
        }
    });

    // === Settings Commands ===
    const configureDisposable = vscode.commands.registerCommand('markink.configure', async () => {
        try {
            await configureSettings();
        } catch (e) {
            showErrorMessage((e as Error).message);
        }
    });

    const showSettingsDisposable = vscode.commands.registerCommand('markink.showSettings', async () => {
        try {
            await showCurrentSettings();
        } catch (e) {
            showErrorMessage((e as Error).message);
        }
    });

    // === Outline Tree View ===
    const outlineProvider = new MarkdownOutlineProvider();
    const outlineTreeView = vscode.window.createTreeView('markinkOutline', {
        treeDataProvider: outlineProvider,
        showCollapseAll: true
    });

    const refreshOutlineDisposable = vscode.commands.registerCommand('markink.refreshOutline', () => {
        try {
            outlineProvider.refresh();
        } catch (e) {
            showErrorMessage((e as Error).message);
        }
    });

    const gotoHeadingDisposable = vscode.commands.registerCommand('markink.gotoHeading', async (uri: vscode.Uri, line: number) => {
        try {
            await gotoHeading(uri, line);
        } catch (e) {
            showErrorMessage((e as Error).message);
        }
    });

    // === Image List Tree View ===
    const imageListProvider = new ImageListProvider();
    const imageTreeView = vscode.window.createTreeView('markinkImages', {
        treeDataProvider: imageListProvider,
        showCollapseAll: false
    });

    const gotoImageDisposable = vscode.commands.registerCommand('markink.gotoImage', async (uri: vscode.Uri, line: number) => {
        try {
            await gotoImage(uri, line);
        } catch (e) {
            showErrorMessage((e as Error).message);
        }
    });

    // === Tools Panel ===
    const toolsProvider = new ToolsPanelProvider();
    const toolsTreeView = vscode.window.createTreeView('markinkTools', {
        treeDataProvider: toolsProvider,
        showCollapseAll: false
    });

    // === Table Commands ===
    const insertTocDisposable = vscode.commands.registerCommand('markink.insertToc', async () => {
        try {
            await insertToc();
        } catch (e) {
            showErrorMessage((e as Error).message);
        }
    });

    const updateTocDisposable = vscode.commands.registerCommand('markink.updateToc', async () => {
        try {
            await updateToc();
        } catch (e) {
            showErrorMessage((e as Error).message);
        }
    });

    const formatTableDisposable = vscode.commands.registerCommand('markink.formatTable', async () => {
        try {
            await formatTable();
        } catch (e) {
            showErrorMessage((e as Error).message);
        }
    });

    const insertTableDisposable = vscode.commands.registerCommand('markink.insertTable', async () => {
        try {
            await insertTable();
        } catch (e) {
            showErrorMessage((e as Error).message);
        }
    });

    // === Word Converter ===
    const wordToMarkdownDisposable = vscode.commands.registerCommand('markink.wordToMarkdown', async (uri?: vscode.Uri, selectedUris?: vscode.Uri[]) => {
        try {
            await convertWordToMarkdown(uri, selectedUris);
        } catch (e) {
            showErrorMessage((e as Error).message);
        }
    });

    // === Image Checker ===
    const checkImageLinksDisposable = vscode.commands.registerCommand('markink.checkImageLinks', async () => {
        try {
            await checkImageLinks();
        } catch (e) {
            showErrorMessage((e as Error).message);
        }
    });

    // === Export Commands ===
    const exportMarkdownDisposable = vscode.commands.registerCommand('markink.exportMarkdown', async (uri?: vscode.Uri, selectedUris?: vscode.Uri[]) => {
        try {
            await exportMarkdown(uri, selectedUris);
        } catch (e) {
            showErrorMessage((e as Error).message);
        }
    });

    // Register all disposables
    context.subscriptions.push(
        // Image commands
        pasteDisposable,
        renameDisposable,
        // Settings commands
        configureDisposable,
        showSettingsDisposable,
        // Outline (provider implements Disposable for cleanup)
        outlineProvider,
        outlineTreeView,
        refreshOutlineDisposable,
        gotoHeadingDisposable,
        // Image list (provider implements Disposable for cleanup)
        imageListProvider,
        imageTreeView,
        gotoImageDisposable,
        // Tools panel
        toolsProvider,
        toolsTreeView,
        // Table commands
        insertTocDisposable,
        updateTocDisposable,
        formatTableDisposable,
        insertTableDisposable,
        // Word converter
        wordToMarkdownDisposable,
        // Image checker
        checkImageLinksDisposable,
        // Export
        exportMarkdownDisposable
    );
}

export function deactivate(): void {
    // Clean up resources if needed
}
