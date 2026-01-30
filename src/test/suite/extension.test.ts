import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('audichuang.markink'));
    });

    test('Extension should activate', async () => {
        const ext = vscode.extensions.getExtension('audichuang.markink');
        if (ext) {
            await ext.activate();
            assert.ok(ext.isActive);
        }
    });

    test('Commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('markink.pasteImage'), 'pasteImage command');
        assert.ok(commands.includes('markink.wordToMarkdown'), 'wordToMarkdown command');
        assert.ok(commands.includes('markink.checkImageLinks'), 'checkImageLinks command');
    });
});
