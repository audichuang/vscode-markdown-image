import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Base class for tree data providers that track the active Markdown document.
 * Handles common event subscriptions, debounced refresh, and document lifecycle.
 */
export abstract class MarkdownDocumentTracker<T> implements vscode.TreeDataProvider<T>, vscode.Disposable {
    protected _onDidChangeTreeData: vscode.EventEmitter<T | undefined | null | void> = new vscode.EventEmitter<T | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<T | undefined | null | void> = this._onDidChangeTreeData.event;

    protected documentUri: vscode.Uri | undefined;
    private disposables: vscode.Disposable[] = [];
    private refreshTimeout: NodeJS.Timeout | undefined;

    constructor() {
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => {
                this.refresh();
            })
        );

        this.disposables.push(
            vscode.window.tabGroups.onDidChangeTabs(() => {
                void this.refreshForTabChange();
            })
        );

        this.disposables.push(
            vscode.window.tabGroups.onDidChangeTabGroups(() => {
                void this.refreshForTabChange();
            })
        );

        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument((e) => {
                const activeDocument = vscode.window.activeTextEditor?.document;
                if (e.document === activeDocument || this.isCurrentDocument(e.document.uri)) {
                    this.debouncedRefresh();
                }
            })
        );

        this.disposables.push(
            vscode.workspace.onDidCloseTextDocument((doc) => {
                if (this.isCurrentDocument(doc.uri)) {
                    // Delay check: when switching to Markdown Preview, VS Code fires
                    // onDidCloseTextDocument before the preview is fully opened.
                    // A short delay allows the editor state to settle.
                    setTimeout(() => {
                        const stillOpen = vscode.workspace.textDocuments.some(
                            d => d.uri.toString() === doc.uri.toString()
                        );
                        const stillVisibleInPreview = this.hasMarkdownPreviewTabForUri(doc.uri);
                        if (!stillOpen && !stillVisibleInPreview) {
                            this.onDocumentClosed();
                        }
                    }, 100);
                }
            })
        );

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

    private async refreshForTabChange(): Promise<void> {
        const previewUri = this.getActiveMarkdownPreviewUri();
        if (previewUri && !this.findOpenMarkdownDocument(previewUri)) {
            try {
                await vscode.workspace.openTextDocument(previewUri);
            } catch {
                // Ignore failures; refresh will fall back to existing tracked state.
            }
        }
        this.refresh();
    }

    private findOpenMarkdownDocument(uri: vscode.Uri): vscode.TextDocument | undefined {
        return vscode.workspace.textDocuments.find(
            (doc) => doc.languageId === 'markdown' && doc.uri.toString() === uri.toString()
        );
    }

    private getActiveMarkdownPreviewUri(): vscode.Uri | undefined {
        const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
        if (!activeTab) {
            return undefined;
        }

        if (
            activeTab.input instanceof vscode.TabInputCustom &&
            activeTab.input.viewType === 'vscode.markdown.preview.editor'
        ) {
            return activeTab.input.uri;
        }

        if (
            activeTab.input instanceof vscode.TabInputWebview &&
            activeTab.input.viewType === 'markdown.preview'
        ) {
            return this.inferUriFromPreviewLabel(activeTab.label);
        }

        return undefined;
    }

    private isMarkdownPreviewActive(): boolean {
        const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
        if (!activeTab) {
            return false;
        }
        return (
            (activeTab.input instanceof vscode.TabInputCustom &&
                activeTab.input.viewType === 'vscode.markdown.preview.editor') ||
            (activeTab.input instanceof vscode.TabInputWebview &&
                activeTab.input.viewType === 'markdown.preview')
        );
    }

    private inferUriFromPreviewLabel(label: string): vscode.Uri | undefined {
        const markdownDocs = vscode.workspace.textDocuments.filter((doc) => doc.languageId === 'markdown');
        const candidates = markdownDocs.filter((doc) => label.includes(path.basename(doc.fileName)));

        if (candidates.length === 1) {
            return candidates[0].uri;
        }
        if (candidates.length > 1 && this.documentUri) {
            return candidates.find((doc) => this.isCurrentDocument(doc.uri))?.uri;
        }
        return undefined;
    }

    private hasMarkdownPreviewTabForUri(uri: vscode.Uri): boolean {
        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                if (
                    tab.input instanceof vscode.TabInputCustom &&
                    tab.input.viewType === 'vscode.markdown.preview.editor' &&
                    tab.input.uri.toString() === uri.toString()
                ) {
                    return true;
                }
            }
        }
        return false;
    }

    protected getTargetMarkdownDocument(): vscode.TextDocument | undefined {
        const previewUri = this.getActiveMarkdownPreviewUri();
        if (previewUri) {
            const previewDoc = this.findOpenMarkdownDocument(previewUri);
            if (previewDoc) {
                return previewDoc;
            }
        }

        const previewActive = this.isMarkdownPreviewActive();
        if (previewActive && this.documentUri) {
            return this.findOpenMarkdownDocument(this.documentUri);
        }

        const activeDocument = vscode.window.activeTextEditor?.document;
        if (activeDocument?.languageId === 'markdown') {
            return activeDocument;
        }

        if (this.documentUri) {
            return this.findOpenMarkdownDocument(this.documentUri);
        }

        return undefined;
    }

    protected isCurrentDocument(uri: vscode.Uri): boolean {
        return this.documentUri?.toString() === uri.toString();
    }

    /** Called when the tracked document is truly closed (not open in any tab). */
    protected abstract onDocumentClosed(): void;

    /** Trigger a full re-parse of the current document. */
    abstract refresh(): void;

    abstract getTreeItem(element: T): vscode.TreeItem;
    abstract getChildren(element?: T): Thenable<T[]>;
}
