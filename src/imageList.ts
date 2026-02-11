import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MarkdownDocumentTracker } from './markdownDocumentTracker';
import { parseMarkdownImages } from './markdownImageParser';

export class ImageListProvider extends MarkdownDocumentTracker<ImageTreeItem> {
    private images: ReturnType<typeof parseMarkdownImages> = [];

    constructor() {
        super();
        this.refresh();
    }

    protected onDocumentClosed(): void {
        this.images = [];
        this.documentUri = undefined;
        this._onDidChangeTreeData.fire();
    }

    refresh(): void {
        this.parseDocument();
    }

    private parseDocument(): void {
        const document = this.getTargetMarkdownDocument();
        if (!document) {
            if (!this.documentUri) {
                this.images = [];
                this._onDidChangeTreeData.fire();
            }
            return;
        }

        this.documentUri = document.uri;

        try {
            this.images = parseMarkdownImages(document.getText(), document.uri.fsPath);
        } catch {
            this.images = [];
        } finally {
            this._onDidChangeTreeData.fire();
        }
    }

    getTreeItem(element: ImageTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(): Thenable<ImageTreeItem[]> {
        if (!this.documentUri || this.images.length === 0) {
            return Promise.resolve([]);
        }

        return Promise.resolve(
            this.images.map(img => new ImageTreeItem(img, this.documentUri!))
        );
    }
}

interface ImageItemInfo {
    fullPath: string;
    imagePath: string;
    altText: string;
    line: number;
}

export class ImageTreeItem extends vscode.TreeItem {
    constructor(
        public readonly imageInfo: ImageItemInfo,
        public readonly documentUri: vscode.Uri
    ) {
        const fileName = path.basename(imageInfo.fullPath);
        super(fileName, vscode.TreeItemCollapsibleState.None);

        // Check if file exists
        let exists = false;
        try {
            exists = fs.existsSync(imageInfo.fullPath);
        } catch {
            exists = false;
        }

        this.description = imageInfo.altText || 'No alt text';
        this.tooltip = `${imageInfo.imagePath}\nLine ${imageInfo.line + 1}${exists ? '' : ' (File not found)'}`;

        this.iconPath = exists
            ? new vscode.ThemeIcon('file-media')
            : new vscode.ThemeIcon('warning', new vscode.ThemeColor('errorForeground'));

        this.command = {
            command: 'markink.gotoImage',
            title: 'Go to Image',
            arguments: [documentUri, imageInfo.line]
        };

        this.contextValue = exists ? 'image' : 'missingImage';
    }
}

export async function gotoImage(uri: vscode.Uri, line: number): Promise<void> {
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
