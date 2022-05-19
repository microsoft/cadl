import { FunctionComponent } from "react";

export interface OutputTabsProps {
  files: string[];
  selected: string;
  onSelect: (file: string) => void;
}

export const OutputTabs: FunctionComponent<OutputTabsProps> = ({ files, selected, onSelect }) => {
  return (
    <div id="outputTabs">
      {files.map((file) => {
        return (
          <a
            key={file}
            className={selected === file ? "active" : ""}
            onClick={() => onSelect(file)}
          >
            {file}
          </a>
        );
      })}
    </div>
  );
};
