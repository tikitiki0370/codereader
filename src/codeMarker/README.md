# codeMarker

codeMarker はコードに対して目印をつける目的で利用されます

## 機能

1. Diagnostics 機能によるインラインコメント
   - 任意に hint,info,warn,error を切り替えられるようにする
   - 右クリックのメニューからつけれるようにする
2. エディタのハイライトによる marker 機能
   - 行全体を任意の色でハイライトできるようにする(任意の色むずかったら教えて)
   - 右クリックのメニューから選択範囲を上のようにできるようにする
3. シンタックス highlight を上書きしてコードをグレーアウトする機能
   - これも右クリックから呼び出せるようにする
   - 将来的には特定のキーを押した状態で行を移動したときに自動的にグレーアウトするようにする

## tree

追加されたものは side バーに tree 表示しましょう。ほかの拡張と同じです
tree の表示は 1.2.3 どれも同じように表示しますが。icon はそれぞれの機能に合わせて設定します。とりあえずは任意のアイコンを割り当てておいてください。
また。ほかの拡張と同様にfolder を任意に作成できるようにしてください
この辺りはpostItが参考になると思います。
3については例外で、ファイルに対して1つしか設定できません。

## データについて

これらは postIt と同じように json を利用した独自管理とする

```ts
export interface CodeMarker {
    CodeMarker: {
        [folder: string]: {
            [filePath: string]: {
                Diagnostics: CodeMarkerDiagnostics[], // Diagnostics 機能によるインラインコメント
                LineHighlight: CodeMarkerLineHighlight[], // 行全体をハイライトする
                SyntaxHighlight: CodeMarkerSyntaxHighlight; // シンタックスhighlightを上書きしてコードをグレーアウトする

        },  // filePath = 対象のファイル
}
    };
    Config: {
        debug: boolean;
        lastedFolder?: string; // 最後に利用(追加、作成)したフォルダ
    }
    Version: string;
}

export interface CodeMarkerDiagnostics {
    id: string;
    type: DiagnosticsTypes;
    text: string;
    Lines: DiagnosticsLine;
    createdAt: Date;
    updatedAt: Date;
}
export enum DiagnosticsTypes {
    Hint = "hint",
    Info = "info",
    Warning = "warning",
    Error = "error"
}
export interface DiagnosticsLine {
    startLine: number; // 開始行
    endLine: number; // 終了行
    startColumn: number; // 開始列
    endColumn: number; // 終了列
    text: string; // 対象のテキスト
}

export interface CodeMarkerLineHighlight {
    id: string;
    color: string; // 色
    Lines: CodeMarkerLine[]; // 対象の行
    createdAt: Date;
    updatedAt: Date;
}

export interface CodeMarkerLine {
    startLine: number; // 開始行
    endLine: number; // 終了行
}

export interface CodeMarkerSyntaxHighlight {
    id: string;
    color: string; // 色
    Lines: number[]; // 対象の行番号
    createdAt: Date;
    updatedAt: Date;
}

```

## 開発

ほかの拡張をよく見て、命名やファイル構造などは似たような形にすること
