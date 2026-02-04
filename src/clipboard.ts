import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as logger from './logger';

export interface ClipboardResult {
    success: boolean;
    imagePath?: string;
    error?: string;
}

function getScriptPath(scriptName: string): string {
    return path.join(__dirname, '..', 'res', scriptName);
}

export async function saveClipboardImageToFile(imagePath: string): Promise<ClipboardResult> {
    const platform = process.platform;

    return new Promise((resolve) => {
        if (platform === 'win32') {
            saveClipboardImageWindows(imagePath, resolve);
        } else if (platform === 'darwin') {
            saveClipboardImageMac(imagePath, resolve);
        } else {
            saveClipboardImageLinux(imagePath, resolve);
        }
    });
}

function saveClipboardImageWindows(imagePath: string, resolve: (result: ClipboardResult) => void): void {
    const scriptPath = getScriptPath('pc.ps1');

    let command = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    if (!fs.existsSync(command)) {
        command = 'powershell';
    }

    const powershell = spawn(command, [
        '-noprofile',
        '-noninteractive',
        '-nologo',
        '-sta',
        '-executionpolicy', 'unrestricted',
        '-windowstyle', 'hidden',
        '-file', scriptPath,
        imagePath
    ]);

    powershell.on('error', (e: NodeJS.ErrnoException) => {
        if (e.code === 'ENOENT') {
            logger.showErrorMessage('The powershell command is not in your PATH environment variables. Please add it and retry.');
        } else {
            logger.showErrorMessage(e.message);
        }
        resolve({ success: false, error: e.message });
    });

    powershell.stdout.on('data', (data: Buffer) => {
        const result = data.toString().trim();
        if (result === 'no image') {
            resolve({ success: false, error: 'no image' });
        } else {
            resolve({ success: true, imagePath: result });
        }
    });
}

function saveClipboardImageMac(imagePath: string, resolve: (result: ClipboardResult) => void): void {
    const scriptPath = getScriptPath('mac.applescript');

    const ascript = spawn('osascript', [scriptPath, imagePath]);

    ascript.on('error', (e: Error) => {
        logger.showErrorMessage(e.message);
        resolve({ success: false, error: e.message });
    });

    ascript.stdout.on('data', (data: Buffer) => {
        const result = data.toString().trim();
        if (result === 'no image') {
            resolve({ success: false, error: 'no image' });
        } else {
            resolve({ success: true, imagePath: result });
        }
    });
}

function saveClipboardImageLinux(imagePath: string, resolve: (result: ClipboardResult) => void): void {
    const scriptPath = getScriptPath('linux.sh');

    const ascript = spawn('sh', [scriptPath, imagePath]);

    ascript.on('error', (e: Error) => {
        logger.showErrorMessage(e.message);
        resolve({ success: false, error: e.message });
    });

    ascript.stdout.on('data', (data: Buffer) => {
        const result = data.toString().trim();
        if (result === 'no xclip') {
            logger.showInformationMessage('You need to install xclip command first.');
            resolve({ success: false, error: 'no xclip' });
        } else if (result === 'no image') {
            resolve({ success: false, error: 'no image' });
        } else {
            resolve({ success: true, imagePath: result });
        }
    });
}
