import * as vscode from 'vscode';

/**
 * Navigate to a specific line in a Markdown source document,
 * handling the case where a Markdown preview is the active tab.
 */
export async function gotoSourceLocation(uri: vscode.Uri, line: number): Promise<void> {
    try {
        const doc = await vscode.workspace.openTextDocument(uri);
        const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
        const previewActive = !!activeTab && (
            (activeTab.input instanceof vscode.TabInputCustom &&
                activeTab.input.viewType === 'vscode.markdown.preview.editor') ||
            (activeTab.input instanceof vscode.TabInputWebview &&
                activeTab.input.viewType === 'markdown.preview')
        );

        let sourceColumn: vscode.ViewColumn | undefined;
        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                if (
                    tab.input instanceof vscode.TabInputText &&
                    tab.input.uri.toString() === uri.toString()
                ) {
                    sourceColumn = group.viewColumn;
                    break;
                }
            }
            if (sourceColumn !== undefined) {
                break;
            }
        }

        const editor = await vscode.window.showTextDocument(doc, {
            viewColumn: sourceColumn ?? (previewActive ? vscode.ViewColumn.Beside : undefined),
            preserveFocus: previewActive
        });
        const position = new vscode.Position(line, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenter
        );
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to navigate: ${(error as Error).message}`);
    }
}
