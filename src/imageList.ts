import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface ImageItem {
    path: string;
    relativePath: string;
    line: number;
    column: number;
    altText: string;
}

export class ImageListProvider implements vscode.TreeDataProvider<ImageTreeItem>, vscode.Disposable {
    private _onDidChangeTreeData: vscode.EventEmitter<ImageTreeItem | undefined | null | void> = new vscode.EventEmitter<ImageTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ImageTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private images: ImageItem[] = [];
    private documentUri: vscode.Uri | undefined;
    private disposables: vscode.Disposable[] = [];
    private refreshTimeout: NodeJS.Timeout | undefined;

    constructor() {
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => {
                this.refresh();
            })
        );

        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument((e) => {
                if (e.document === vscode.window.activeTextEditor?.document) {
                    this.debouncedRefresh();
                }
            })
        );

        this.refresh();
    }

    dispose(): void {
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
        }
        this.disposables.forEach(d => d.dispose());
        this._onDidChangeTreeData.dispose();
    }

    private debouncedRefresh(): void {
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
        }
        this.refreshTimeout = setTimeout(() => {
            this.refresh();
        }, 300);
    }

    refresh(): void {
        this.parseDocument();
        this._onDidChangeTreeData.fire();
    }

    private parseDocument(): void {
        this.images = [];
        this.documentUri = undefined;

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const document = editor.document;
        if (document.languageId !== 'markdown') {
            return;
        }

        this.documentUri = document.uri;
        const text = document.getText();
        const lines = text.split(/\r?\n/);

        // 改進的正則表達式：處理帶有 title 的圖片語法
        const markdownImageRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
        const documentDir = path.dirname(document.uri.fsPath);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let match: RegExpExecArray | null;

            // 重置 lastIndex
            markdownImageRegex.lastIndex = 0;

            while ((match = markdownImageRegex.exec(line)) !== null) {
                const altText = match[1];
                let imagePath = match[2];

                // 移除 query string 和 fragment
                imagePath = imagePath.split('?')[0].split('#')[0];

                // Skip URLs
                if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('data:')) {
                    continue;
                }

                // Decode URL-encoded path with error handling
                let decodedPath: string;
                try {
                    decodedPath = decodeURIComponent(imagePath);
                } catch {
                    decodedPath = imagePath;
                }

                const fullPath = path.isAbsolute(decodedPath)
                    ? decodedPath
                    : path.resolve(documentDir, decodedPath);

                this.images.push({
                    path: fullPath,
                    relativePath: imagePath,
                    line: i,
                    column: match.index,
                    altText: altText
                });
            }
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

export class ImageTreeItem extends vscode.TreeItem {
    constructor(
        public readonly imageInfo: ImageItem,
        public readonly documentUri: vscode.Uri
    ) {
        const fileName = path.basename(imageInfo.path);
        super(fileName, vscode.TreeItemCollapsibleState.None);

        // Check if file exists
        let exists = false;
        try {
            exists = fs.existsSync(imageInfo.path);
        } catch {
            exists = false;
        }

        this.description = imageInfo.altText || 'No alt text';
        this.tooltip = `${imageInfo.relativePath}\nLine ${imageInfo.line + 1}${exists ? '' : ' (File not found)'}`;

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
        const editor = await vscode.window.showTextDocument(doc);
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
