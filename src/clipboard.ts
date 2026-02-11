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
    if (process.platform === 'win32') {
        return saveClipboardImageWindows(imagePath);
    }
    if (process.platform === 'darwin') {
        return saveClipboardImageMac(imagePath);
    }
    return saveClipboardImageLinux(imagePath);
}

interface SpawnResult {
    stdout: string;
    stderr: string;
    error?: string;
    timedOut: boolean;
}

function runScript(command: string, args: string[]): Promise<SpawnResult> {
    return new Promise((resolve) => {
        const child = spawn(command, args);
        let stdout = '';
        let stderr = '';
        let settled = false;
        const timeout = setTimeout(() => {
            if (!settled) {
                settled = true;
                child.kill();
                resolve({ stdout, stderr, error: 'timeout', timedOut: true });
            }
        }, 15000);

        const finalize = (result: SpawnResult): void => {
            if (!settled) {
                settled = true;
                clearTimeout(timeout);
                resolve(result);
            }
        };

        child.stdout.on('data', (data: Buffer) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
        });

        child.on('error', (err: NodeJS.ErrnoException) => {
            finalize({ stdout, stderr, error: err.message, timedOut: false });
        });

        child.on('close', (code) => {
            if (code !== 0 && code !== null) {
                const errorMsg = stderr.trim() || `Process exited with code ${code}`;
                finalize({ stdout, stderr, error: errorMsg, timedOut: false });
            } else {
                finalize({ stdout, stderr, timedOut: false });
            }
        });
    });
}

function parseClipboardResult(stdout: string): ClipboardResult {
    const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    const result = lines[lines.length - 1] || '';

    if (result === 'no image' || result === '') {
        return { success: false, error: 'no image' };
    }

    return { success: true, imagePath: result };
}

function isNoImageResult(output: string): boolean {
    return output
        .split(/\r?\n/)
        .map((line) => line.trim().toLowerCase())
        .some((line) => line === 'no image');
}

async function saveClipboardImageWindows(imagePath: string): Promise<ClipboardResult> {
    const scriptPath = getScriptPath('pc.ps1');
    let command = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    if (!fs.existsSync(command)) {
        command = 'powershell';
    }

    const result = await runScript(command, [
        '-noprofile',
        '-noninteractive',
        '-nologo',
        '-sta',
        '-executionpolicy', 'bypass',
        '-windowstyle', 'hidden',
        '-file', scriptPath,
        imagePath
    ]);

    if (isNoImageResult(result.stdout) || isNoImageResult(result.stderr)) {
        return { success: false, error: 'no image' };
    }

    if (result.error) {
        if (result.error.includes('ENOENT')) {
            logger.showErrorMessage('The powershell command is not in your PATH environment variables. Please add it and retry.');
        } else if (result.timedOut) {
            logger.showErrorMessage('Paste image timed out while running PowerShell.');
        } else {
            logger.showErrorMessage(result.error);
        }
        return { success: false, error: result.error };
    }

    return parseClipboardResult(result.stdout);
}

async function saveClipboardImageMac(imagePath: string): Promise<ClipboardResult> {
    const scriptPath = getScriptPath('mac.applescript');
    const result = await runScript('osascript', [scriptPath, imagePath]);

    if (isNoImageResult(result.stdout) || isNoImageResult(result.stderr)) {
        return { success: false, error: 'no image' };
    }

    if (result.error) {
        if (result.timedOut) {
            logger.showErrorMessage('Paste image timed out while running osascript.');
        } else {
            logger.showErrorMessage(result.error);
        }
        return { success: false, error: result.error };
    }

    return parseClipboardResult(result.stdout);
}

async function saveClipboardImageLinux(imagePath: string): Promise<ClipboardResult> {
    const scriptPath = getScriptPath('linux.sh');
    const result = await runScript('sh', [scriptPath, imagePath]);

    if (isNoImageResult(result.stdout) || isNoImageResult(result.stderr)) {
        return { success: false, error: 'no image' };
    }

    if (result.error) {
        if (result.timedOut) {
            logger.showErrorMessage('Paste image timed out while running shell script.');
        } else if (result.error.includes('no clipboard tool')) {
            logger.showInformationMessage('You need to install xclip (X11) or wl-paste (Wayland) first.');
        } else {
            logger.showErrorMessage(result.error);
        }
        return { success: false, error: result.error };
    }

    return parseClipboardResult(result.stdout);
}
