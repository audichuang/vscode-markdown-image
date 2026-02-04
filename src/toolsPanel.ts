import * as vscode from 'vscode';

interface ToolItem {
    id: string;
    label: string;
    icon: string;
    command: string;
    description: string;
}

const TOOLS: ToolItem[] = [
    {
        id: 'wordToMarkdown',
        label: 'Word → Markdown',
        icon: 'file-symlink-file',
        command: 'markink.wordToMarkdown',
        description: 'Convert Word document to Markdown with images'
    },
    {
        id: 'exportMarkdown',
        label: 'Export Markdown',
        icon: 'export',
        command: 'markink.exportMarkdown',
        description: 'Export Markdown to HTML, PDF, or Word'
    },
    {
        id: 'checkImages',
        label: 'Check Image Links',
        icon: 'search',
        command: 'markink.checkImageLinks',
        description: 'Verify all image links exist'
    },
    {
        id: 'insertToc',
        label: 'Insert TOC',
        icon: 'list-tree',
        command: 'markink.insertToc',
        description: 'Insert table of contents'
    },
    {
        id: 'updateToc',
        label: 'Update TOC',
        icon: 'sync',
        command: 'markink.updateToc',
        description: 'Update existing table of contents'
    },
    {
        id: 'formatTable',
        label: 'Format Table',
        icon: 'table',
        command: 'markink.formatTable',
        description: 'Format and align table'
    },
    {
        id: 'insertTable',
        label: 'Insert Table',
        icon: 'add',
        command: 'markink.insertTable',
        description: 'Insert new table'
    },
    {
        id: 'configure',
        label: 'Settings',
        icon: 'gear',
        command: 'markink.configure',
        description: 'Configure MarkInk settings'
    }
];

export class ToolsPanelProvider implements vscode.TreeDataProvider<ToolTreeItem>, vscode.Disposable {
    private _onDidChangeTreeData: vscode.EventEmitter<ToolTreeItem | undefined | null | void> = new vscode.EventEmitter<ToolTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ToolTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    getTreeItem(element: ToolTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(): Thenable<ToolTreeItem[]> {
        return Promise.resolve(
            TOOLS.map(tool => new ToolTreeItem(tool))
        );
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    dispose(): void {
        this._onDidChangeTreeData.dispose();
    }
}

export class ToolTreeItem extends vscode.TreeItem {
    constructor(public readonly tool: ToolItem) {
        super(tool.label, vscode.TreeItemCollapsibleState.None);

        this.tooltip = tool.description;
        this.description = '';
        this.iconPath = new vscode.ThemeIcon(tool.icon);

        this.command = {
            command: tool.command,
            title: tool.label,
            arguments: []
        };

        this.contextValue = 'tool';
    }
}
