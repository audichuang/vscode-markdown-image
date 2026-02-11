import * as vscode from 'vscode';

interface HeadingItem {
    level: number;
    text: string;
    line: number;
}

export class MarkdownOutlineProvider implements vscode.TreeDataProvider<OutlineItem>, vscode.Disposable {
    private _onDidChangeTreeData: vscode.EventEmitter<OutlineItem | undefined | null | void> = new vscode.EventEmitter<OutlineItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<OutlineItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private headings: HeadingItem[] = [];
    private documentUri: vscode.Uri | undefined;
    private disposables: vscode.Disposable[] = [];
    private refreshTimeout: NodeJS.Timeout | undefined;

    constructor() {
        // Listen for active editor changes
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => {
                this.refresh();
            })
        );

        // Listen for document changes with debounce
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
        this._onDidChangeTreeData.fire();
    }

    private parseDocument(): void {
        this.headings = [];
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

        // Parse headings
        const headingRegex = /^(#{1,6})\s+(.+)$/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = line.match(headingRegex);

            if (match) {
                const level = match[1].length;
                const headingText = match[2].trim();

                this.headings.push({
                    level,
                    text: headingText,
                    line: i
                });
            }
        }
    }

    getTreeItem(element: OutlineItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: OutlineItem): Thenable<OutlineItem[]> {
        if (!this.documentUri) {
            return Promise.resolve([]);
        }

        if (!element) {
            // Root level - return top-level headings with their children nested
            return Promise.resolve(this.buildTree());
        }

        // Return children of this element
        return Promise.resolve(element.children || []);
    }

    private buildTree(): OutlineItem[] {
        if (this.headings.length === 0) {
            return [];
        }

        const items: OutlineItem[] = [];
        const stack: { item: OutlineItem; level: number }[] = [];

        for (const heading of this.headings) {
            const item = new OutlineItem(
                heading.text,
                heading.level,
                heading.line,
                this.documentUri!,
                []
            );

            // Find parent
            while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
                stack.pop();
            }

            if (stack.length === 0) {
                // Top-level item
                items.push(item);
            } else {
                // Child item
                stack[stack.length - 1].item.children.push(item);
            }

            stack.push({ item, level: heading.level });
        }

        // Update collapsible state
        this.updateCollapsibleState(items);

        return items;
    }

    private updateCollapsibleState(items: OutlineItem[]): void {
        for (const item of items) {
            if (item.children.length > 0) {
                item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
                this.updateCollapsibleState(item.children);
            } else {
                item.collapsibleState = vscode.TreeItemCollapsibleState.None;
            }
        }
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
        super(text, vscode.TreeItemCollapsibleState.None);
        this.children = children;

        // Set icon based on heading level
        this.iconPath = new vscode.ThemeIcon(this.getIconForLevel(level));

        // Set description to show heading level
        this.description = `H${level}`;

        // Set command to jump to this heading
        this.command = {
            command: 'markink.gotoHeading',
            title: 'Go to Heading',
            arguments: [this.documentUri, this.line]
        };

        // Set tooltip
        this.tooltip = `${text} (Line ${line + 1})`;

        // Set context value for potential context menu actions
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
