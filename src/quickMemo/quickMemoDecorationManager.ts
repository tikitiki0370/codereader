import * as vscode from 'vscode';
import { QuickMemoStorage, QuickMemoFile } from './quickMemoStorage';

export class QuickMemoDecorationManager {
    private decorationType: vscode.TextEditorDecorationType;

    constructor(private storage: QuickMemoStorage) {
        // デコレーションタイプを作成
        this.decorationType = vscode.window.createTextEditorDecorationType({
            after: {
                margin: '0 0 0 1em',
                color: '#888888',
                fontStyle: 'italic'
            },
            isWholeLine: false,
            // 範囲の挙動設定
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });
    }

    /**
     * エディタのデコレーションを更新
     */
    async updateDecorations(editor: vscode.TextEditor): Promise<void> {
        if (!editor || !editor.document) {
            return;
        }

        const filePath = editor.document.uri.fsPath;
        const memos = await this.storage.getMemosByLinkedFile(filePath);

        const decorations: vscode.DecorationOptions[] = [];

        for (const memo of memos) {
            if (!memo.linkedLine) continue;
            
            // 行番号の整合性チェック
            const line = memo.linkedLine.line;
            if (line >= editor.document.lineCount) continue;

            // メモの内容を取得（非同期だが、ループ内でawaitすると重くなる可能性があるため注意）
            // コンテンツは軽量と仮定して取得
            // 必要ならキャッシュや軽量化を検討
            let content = await this.storage.getMemoContent(memo);
            
            // 本文の1行目を取得（タイトルを除く）
            // コンテンツ形式: `# Title\n\nCreated: ...\n\nBody...`
            // タイトル行やメタデータをスキップして本文を探す簡易ロジック
            
            const lines = content.split('\n');
            let bodyPreview = '';
            let foundBody = false;
            
            for (let i = 0; i < lines.length; i++) {
                const l = lines[i].trim();
                // タイトル、メタデータ、空行、Linked行をスキップ
                if (l.startsWith('# ')) continue;
                if (l.startsWith('Created: ')) continue;
                if (l.startsWith('Linked: ')) continue;
                if (l === '') continue;
                
                bodyPreview = l;
                foundBody = true;
                break;
            }
            
            if (!foundBody) {
                bodyPreview = memo.title; // 本文がない場合はタイトルを表示
            }

            // 50文字制限
            if (bodyPreview.length > 50) {
                bodyPreview = bodyPreview.substring(0, 50) + '...';
            }

            // ホバーメッセージの作成
            const hoverMessage = new vscode.MarkdownString();
            hoverMessage.isTrusted = true;
            hoverMessage.appendMarkdown(`**📝 ${memo.title}**\n\n`);
            
            // 本文の一部を表示（もう少し長く）
            // 全文表示は長すぎる場合があるので、適度に切り詰めるか、そのまま表示するか
            // ここでは簡易的に全文に近い形を表示しつつ、リンクを表示
            
            // リンク作成
            // [Open Memo] command:codereader.openQuickMemo?arguments...
            // [Reveal in Side Bar] command:codereader.revealQuickMemo?arguments...
             
            // Command URI args must be JSON encoded
            const openArgs = encodeURIComponent(JSON.stringify([memo]));
            const revealArgs = encodeURIComponent(JSON.stringify([memo.id]));
            
            hoverMessage.appendMarkdown(`[Open Memo](command:codereader.openQuickMemo?${openArgs}) | `);
            hoverMessage.appendMarkdown(`[Reveal in Side Bar](command:codereader.revealQuickMemo?${revealArgs})\n\n`);
            
            // コンテンツ表示 (メタデータ除去したものを表示したいが、簡易的に生テキストを表示するか、整形するか)
            // 簡易的に先頭200文字くらいを表示
            const cleanContent = content.replace(/^# .+\n/, '').replace(/Created: .+\n/, '').replace(/Linked: .+\n/, '').trim();
            const previewContent = cleanContent.length > 200 ? cleanContent.substring(0, 200) + '...' : cleanContent;
            hoverMessage.appendMarkdown(previewContent);

            decorations.push({
                range: new vscode.Range(line, Number.MAX_SAFE_INTEGER, line, Number.MAX_SAFE_INTEGER),
                renderOptions: {
                    after: {
                        contentText: `📝 ${bodyPreview}`
                    }
                },
                hoverMessage: hoverMessage
            });
        }

        editor.setDecorations(this.decorationType, decorations);
    }
    
    dispose() {
        this.decorationType.dispose();
    }
}
