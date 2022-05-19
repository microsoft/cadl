import { editor, Uri } from "monaco-editor";
import { FunctionComponent, useEffect, useMemo, useRef } from "react";

export interface EditorProps {
  model: editor.IModel;
  commands?: EditorCommand[];
  options: editor.IStandaloneEditorConstructionOptions;
}

export interface EditorCommand {
  binding: number;
  handle: () => void;
}

export const Editor: FunctionComponent<EditorProps> = ({ model, options, commands }) => {
  const editorContainerRef = useRef(null);
  const editorRef = useRef<editor.IEditor | null>(null);

  useEffect(() => {
    const instance = (editorRef.current = editor.create(editorContainerRef.current!, {
      model,
      automaticLayout: true,
      ...options,
    }));

    for (const command of commands ?? []) {
      instance.addCommand(command.binding, command.handle);
    }
  }, []);

  return <div className="monaco-editor-container" ref={editorContainerRef}></div>;
};

export function useMonacoModel(uri: string, language: string): editor.IModel {
  return useMemo(() => {
    const monacoUri = Uri.parse(uri);
    return editor.getModel(monacoUri) ?? editor.createModel("", language, monacoUri);
  }, [uri, language]);
}
