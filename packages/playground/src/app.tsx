import { compile, DiagnosticTarget, getSourceLocation, NoTarget } from "@cadl-lang/compiler";
import debounce from "debounce";
import lzutf8 from "lzutf8";
import { editor, KeyCode, KeyMod, MarkerSeverity, Uri } from "monaco-editor";
import { FunctionComponent, useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserHost } from "./browserHost";
import { CadlEditor, OutputEditor } from "./components/cadl-editor";
import { useMonacoModel } from "./components/editor";
import { Footer } from "./components/footer";
import { OutputTabs } from "./components/output-tabs";
import { SamplesDropdown } from "./components/samples-dropdown";
import { PlaygroundManifest } from "./manifest";
import { attachServices } from "./services";
const host = await createBrowserHost();
attachServices(host);

export const App: FunctionComponent = () => {
  const cadlModel = useMonacoModel("inmemory://test/main.cadl", "cadl");
  const [outputValue, setOutputValue] = useState({ filename: "", content: "" });
  const [outputFiles, setOutputFiles] = useState<string[]>([]);

  useEffect(() => {
    if (window.location.search.length > 0) {
      const parsed = new URLSearchParams(window.location.search);
      const compressed = parsed.get("c");
      if (compressed) {
        const content = lzutf8.decompress(compressed, { inputEncoding: "Base64" });
        cadlModel.setValue(content);
        void doCompile(content);
      }
    }
  }, []);

  useEffect(() => {
    cadlModel.onDidChangeContent(debounce(() => doCompile(cadlModel.getValue()), 200));
  }, [cadlModel]);

  const updateCadl = useCallback(
    (value: string) => {
      cadlModel.setValue(value);
      return doCompile(value);
    },
    [cadlModel]
  );

  const saveCode = useCallback(async () => {
    const compressed = lzutf8.compress(cadlModel.getValue(), { outputEncoding: "Base64" });
    history.pushState(null, "", window.location.pathname + "?c=" + encodeURIComponent(compressed));
    await navigator.clipboard.writeText(window.location.toString());
  }, [cadlModel]);

  const newIssue = useCallback(async () => {
    await saveCode();
    const bodyPayload = encodeURIComponent(`\n\n\n[Playground Link](${document.location.href})`);
    const url = `https://github.com/microsoft/cadl/issues/new?body=${bodyPayload}`;
    window.open(url, "_blank");
  }, [saveCode, cadlModel]);

  async function emptyOutputDir() {
    // empty output directory
    const dirs = await host.readDir("./cadl-output");
    for (const file of dirs) {
      const path = "./cadl-output/" + file;
      const uri = Uri.parse(host.pathToFileURL(path));
      const model = editor.getModel(uri);
      if (model) {
        model.dispose();
      }
      await host.unlink(path);
    }
  }

  async function doCompile(content: string) {
    await host.writeFile("main.cadl", content);
    await emptyOutputDir();
    const program = await compile("main.cadl", host, {
      outputPath: "cadl-output",
      swaggerOutputFile: "cadl-output/openapi.json",
      emitters: [PlaygroundManifest.defaultEmitter],
    });

    const markers: editor.IMarkerData[] = program.diagnostics.map((diag) => ({
      ...getMarkerLocation(diag.target),
      message: diag.message,
      severity: MarkerSeverity.Error,
    }));

    editor.setModelMarkers(cadlModel, "owner", markers ?? []);

    const outputFiles = await host.readDir("./cadl-output");
    setOutputFiles(outputFiles);
    if (outputFiles.length > 0) {
      await loadOutputFile(outputFiles[0]);
    } else {
      setOutputValue({ filename: "", content: "" });
    }
  }

  async function loadOutputFile(path: string) {
    const contents = await host.readFile("./cadl-output/" + path);
    setOutputValue({ filename: path, content: contents.text });
  }

  function getMarkerLocation(
    target: DiagnosticTarget | typeof NoTarget
  ): Pick<editor.IMarkerData, "startLineNumber" | "startColumn" | "endLineNumber" | "endColumn"> {
    const loc = getSourceLocation(target);
    if (loc === undefined || loc.file.path != "/test/main.cadl") {
      return {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 1,
      };
    }
    const start = loc.file.getLineAndCharacterOfPosition(loc.pos);
    const end = loc.file.getLineAndCharacterOfPosition(loc.end);
    return {
      startLineNumber: start.line + 1,
      startColumn: start.character + 1,
      endLineNumber: end.line + 1,
      endColumn: end.character + 1,
    };
  }

  const cadlEditorCommands = useMemo(
    () => [
      // ctrl/cmd+S => save
      { binding: KeyMod.CtrlCmd | KeyCode.KeyS, handle: saveCode },
    ],
    [saveCode]
  );

  return (
    <div id="grid">
      <div id="commandBar">
        <label>
          <button onClick={saveCode as any}>Share</button>
        </label>
        <label>
          {"Load a sample: "}
          <SamplesDropdown onSelectSample={updateCadl as any} />
        </label>
        <label>
          <button onClick={newIssue as any}>Open Issue</button>
        </label>
      </div>
      <OutputTabs
        files={outputFiles}
        selected={outputValue.filename}
        onSelect={(x) => loadOutputFile(x) as any}
      />
      <div id="editorContainer">
        <div id="editor">
          <CadlEditor model={cadlModel} commands={cadlEditorCommands} />
        </div>
      </div>
      <div id="outputContainer">
        <div id="output">
          <OutputEditor value={outputValue.content} />
        </div>
      </div>
      <Footer />
    </div>
  );
};
