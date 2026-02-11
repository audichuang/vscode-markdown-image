import * as vscode from 'vscode';
import { MarkdownDocumentTracker } from './markdownDocumentTracker';
import { gotoSourceLocation } from './gotoSourceLocation';

export class MarkdownOutlineProvider extends MarkdownDocumentTracker<OutlineItem> {
    private items: OutlineItem[] = [];
    private parseGeneration = 0;

    constructor() {
        super();
        this.refresh();
    }

    protected onDocumentClosed(): void {
        this.items = [];
        this.documentUri = undefined;
        this._onDidChangeTreeData.fire();
    }

    refresh(): void {
        void this.parseDocument();
    }

    private async parseDocument(): Promise<void> {
        const generation = ++this.parseGeneration;

        const document = this.getTargetMarkdownDocument();
        if (!document) {
            if (!this.documentUri) {
                this.items = [];
                this._onDidChangeTreeData.fire();
            }
            return;
        }

        this.documentUri = document.uri;

        try {
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                document.uri
            );

            // A newer parseDocument call has started; discard this result
            if (generation !== this.parseGeneration) {
                return;
            }

            this.items = (symbols && symbols.length > 0)
                ? this.convertSymbols(symbols, document.uri, document)
                : [];
        } catch {
            if (generation !== this.parseGeneration) {
                return;
            }
            this.items = [];
        }

        this._onDidChangeTreeData.fire();
    }

    private convertSymbols(
        symbols: vscode.DocumentSymbol[],
        uri: vscode.Uri,
        document: vscode.TextDocument,
        depth: number = 1
    ): OutlineItem[] {
        return symbols.map(symbol => {
            const children = symbol.children.length > 0
                ? this.convertSymbols(symbol.children, uri, document, depth + 1)
                : [];

            // Read the actual line to get the real heading level from # count
            let level = depth;
            const lineText = document.lineAt(symbol.selectionRange.start.line).text;
            const match = lineText.match(/^(#{1,6})\s/);
            if (match) {
                level = match[1].length;
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
    return gotoSourceLocation(uri, line);
}
