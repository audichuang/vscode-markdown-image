import * as vscode from 'vscode';
import { paste } from './paster';
import { renameImage } from './renameImage';
import { initLogger, log, showErrorMessage } from './logger';

export function activate(context: vscode.ExtensionContext): void {
    initLogger(context);
    log('Extension "vscode-paste-image" is now active!');

    const pasteDisposable = vscode.commands.registerCommand('extension.pasteImage', async () => {
        try {
            await paste();
        } catch (e) {
            showErrorMessage((e as Error).message);
        }
    });

    const renameDisposable = vscode.commands.registerCommand('extension.renameImage', async () => {
        try {
            await renameImage();
        } catch (e) {
            showErrorMessage((e as Error).message);
        }
    });

    context.subscriptions.push(pasteDisposable, renameDisposable);
}

export function deactivate(): void {
    // Clean up resources if needed
}
