import * as vscode from 'vscode';
import dayjs from 'dayjs';

let outputChannel: vscode.OutputChannel | undefined;

export function initLogger(context: vscode.ExtensionContext): void {
    outputChannel = vscode.window.createOutputChannel('MarkInk');
    context.subscriptions.push(outputChannel);
}

export function log(message: string): void {
    if (outputChannel) {
        const time = dayjs().format('MM-DD HH:mm:ss');
        outputChannel.appendLine(`[${time}] ${message}`);
    }
}

export function showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined> {
    log(message);
    return vscode.window.showInformationMessage(message, ...items);
}

export function showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined> {
    log(message);
    return vscode.window.showErrorMessage(message, ...items);
}
