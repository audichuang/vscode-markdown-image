import * as vscode from 'vscode';
import { paste } from './paster';
import { renameImage } from './renameImage';
import { configureSettings, showCurrentSettings } from './configUI';
import { MarkdownOutlineProvider, gotoHeading } from './outline';
import { initLogger, log, showErrorMessage } from './logger';

export function activate(context: vscode.ExtensionContext): void {
    initLogger(context);
    log('Extension "MarkInk" is now active!');

    // Paste Image command
    const pasteDisposable = vscode.commands.registerCommand('markink.pasteImage', async () => {
        try {
            await paste();
        } catch (e) {
            showErrorMessage((e as Error).message);
        }
    });

    // Rename Image command
    const renameDisposable = vscode.commands.registerCommand('markink.renameImage', async () => {
        try {
            await renameImage();
        } catch (e) {
            showErrorMessage((e as Error).message);
        }
    });

    // Configure Settings command
    const configureDisposable = vscode.commands.registerCommand('markink.configure', async () => {
        try {
            await configureSettings();
        } catch (e) {
            showErrorMessage((e as Error).message);
        }
    });

    // Show Settings command
    const showSettingsDisposable = vscode.commands.registerCommand('markink.showSettings', async () => {
        try {
            await showCurrentSettings();
        } catch (e) {
            showErrorMessage((e as Error).message);
        }
    });

    // Outline Tree View
    const outlineProvider = new MarkdownOutlineProvider();
    const treeView = vscode.window.createTreeView('markinkOutline', {
        treeDataProvider: outlineProvider,
        showCollapseAll: true
    });

    // Refresh Outline command
    const refreshOutlineDisposable = vscode.commands.registerCommand('markink.refreshOutline', () => {
        outlineProvider.refresh();
    });

    // Go to Heading command
    const gotoHeadingDisposable = vscode.commands.registerCommand('markink.gotoHeading', (uri: vscode.Uri, line: number) => {
        gotoHeading(uri, line);
    });

    context.subscriptions.push(
        pasteDisposable,
        renameDisposable,
        configureDisposable,
        showSettingsDisposable,
        treeView,
        refreshOutlineDisposable,
        gotoHeadingDisposable
    );
}

export function deactivate(): void {
    // Clean up resources if needed
}
