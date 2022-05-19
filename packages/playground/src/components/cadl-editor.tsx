import { CadlPrettierPlugin } from "@cadl-lang/compiler";
import { editor, KeyCode, KeyMod } from "monaco-editor";
import prettier from "prettier";
import { FunctionComponent } from "react";
import { Editor, EditorCommand, useMonacoModel } from "./editor";

export interface CadlEditorProps {
  model: editor.IModel;
  commands?: EditorCommand[];
}

export const CadlEditor: FunctionComponent<CadlEditorProps> = (props) => {
  const options: editor.IStandaloneEditorConstructionOptions = {
    "semanticHighlighting.enabled": true,
    automaticLayout: true,
    tabSize: 2,
    minimap: {
      enabled: false,
    },
  };

  const format = () => {
    const output = prettier.format(props.model.getValue(), {
      parser: "cadl",
      plugins: [CadlPrettierPlugin],
    });
    props.model.setValue(output);
  };

  // Add shortcuts
  const commands = [
    // ctrl/cmd+shift+F => format
    { binding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF, handle: format },
    // alt+shift+F => format
    { binding: KeyMod.Alt | KeyMod.Shift | KeyCode.KeyF, handle: format },
    ...props.commands ?? [],
  ];
  return (
    <Editor
      model={props.model}
      commands={commands}
      options={options}
    ></Editor>
  );
};

export const OutputEditor: FunctionComponent<{ value: string }> = ({ value }) => {
  const options: editor.IStandaloneEditorConstructionOptions = {
    readOnly: true,
    language: "json",
    automaticLayout: true,
    minimap: {
      enabled: false,
    },
  };
  const model = useMonacoModel("inmemory://output.json", "json");
  model.setValue(value);
  return <Editor model={model} options={options}></Editor>;
};
