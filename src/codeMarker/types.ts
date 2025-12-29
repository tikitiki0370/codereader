export interface CodeMarker {
    CodeMarker: {
        [folder: string]: {
            [filePath: string]: {
                Diagnostics: CodeMarkerDiagnostics[];
                LineHighlight: CodeMarkerLineHighlight[];
                SyntaxHighlight: CodeMarkerSyntaxHighlight | null;
            };
        };
    };
    Config: {
        debug: boolean;
        lastedFolder?: string;
    };
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
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
    text: string;
}

export interface CodeMarkerLineHighlight {
    id: string;
    color: string;
    Lines: CodeMarkerLine[];
    type?: string;  // "manual" | "readTracker" - source of highlight
    createdAt: Date;
    updatedAt: Date;
}

export interface CodeMarkerLine {
    startLine: number;
    endLine: number;
}

export interface CodeMarkerSyntaxHighlight {
    id: string;
    color: string;
    Lines: number[];
    createdAt: Date;
    updatedAt: Date;
}