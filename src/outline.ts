import * as vscode from 'vscode';

export class MarkdownOutlineProvider implements vscode.TreeDataProvider<OutlineItem>, vscode.Disposable {
    private _onDidChangeTreeData: vscode.EventEmitter<OutlineItem | undefined | null | void> = new vscode.EventEmitter<OutlineItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<OutlineItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private items: OutlineItem[] = [];
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

        // Initial refresh
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
    }

    private async parseDocument(): Promise<void> {
        this.items = [];
        this.documentUri = undefined;

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            this._onDidChangeTreeData.fire();
            return;
        }

        const document = editor.document;
        if (document.languageId !== 'markdown') {
            this._onDidChangeTreeData.fire();
            return;
        }

        this.documentUri = document.uri;

        try {
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                document.uri
            );

            if (symbols && symbols.length > 0) {
                this.items = this.convertSymbols(symbols, document.uri);
            }
        } catch {
            // Fallback: symbol provider not available yet, ignore
        }

        this._onDidChangeTreeData.fire();
    }

    private convertSymbols(symbols: vscode.DocumentSymbol[], uri: vscode.Uri, depth: number = 1): OutlineItem[] {
        const editor = vscode.window.activeTextEditor;

        return symbols.map(symbol => {
            const children = symbol.children.length > 0
                ? this.convertSymbols(symbol.children, uri, depth + 1)
                : [];

            // Read the actual line to get the real heading level from # count
            let level = depth;
            if (editor) {
                const lineText = editor.document.lineAt(symbol.selectionRange.start.line).text;
                const match = lineText.match(/^(#{1,6})\s/);
                if (match) {
                    level = match[1].length;
                }
            }

            return new OutlineItem(
                symbol.name,
                level,
                symbol.selectionRange.start.line,
                uri,
                children
            );
        });
    }

    getTreeItem(element: OutlineItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: OutlineItem): Thenable<OutlineItem[]> {
        if (!this.documentUri) {
            return Promise.resolve([]);
        }

        if (!element) {
            return Promise.resolve(this.items);
        }

        return Promise.resolve(element.children || []);
    }
}

export class OutlineItem extends vscode.TreeItem {
    children: OutlineItem[] = [];

    constructor(
        public readonly text: string,
        public readonly level: number,
        public readonly line: number,
        public readonly documentUri: vscode.Uri,
        children: OutlineItem[]
    ) {
        super(
            text,
            children.length > 0
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None
        );
        this.children = children;

        this.iconPath = new vscode.ThemeIcon(this.getIconForLevel(level));
        this.description = `H${level}`;

        this.command = {
            command: 'markink.gotoHeading',
            title: 'Go to Heading',
            arguments: [this.documentUri, this.line]
        };

        this.tooltip = `${text} (Line ${line + 1})`;
        this.contextValue = 'heading';
    }

    private getIconForLevel(level: number): string {
        switch (level) {
            case 1: return 'symbol-class';
            case 2: return 'symbol-method';
            case 3: return 'symbol-function';
            case 4: return 'symbol-field';
            case 5: return 'symbol-variable';
            case 6: return 'symbol-constant';
            default: return 'symbol-text';
        }
    }
}

export async function gotoHeading(uri: vscode.Uri, line: number): Promise<void> {
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
