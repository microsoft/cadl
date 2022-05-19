import { FunctionComponent, useCallback, useState } from "react";
import { PlaygroundManifest } from "../manifest";
export interface SamplesDropdownProps {
  onSelectSample: (content: string) => void;
}
export const SamplesDropdown: FunctionComponent<SamplesDropdownProps> = ({ onSelectSample }) => {
  const [selected, setSelected] = useState<string>("");
  const options = Object.keys(PlaygroundManifest.samples).map((sample) => {
    return <option key={sample}>{sample}</option>;
  });

  const handleSelected = useCallback(
    (evt: any) => {
      setSelected(evt.target.value);
      onSelectSample(PlaygroundManifest.samples[evt.target.value]);
    },
    [onSelectSample]
  );
  return (
    <select className="sample-dropdown" onChange={handleSelected} value={selected}>
      <option value="" disabled>
        Select sample...
      </option>
      {options}
    </select>
  );
};
