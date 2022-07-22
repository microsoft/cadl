import { FunctionComponent, useCallback, useState } from "react";
import { OutputEditor } from "./cadl-editor";
import { PlaygroundManifest } from "../manifest";
import { SwaggerUI } from "./swagger-ui";
export interface OpenAPIOutputProps {
  content: string;
}

export const OpenAPIOutput: FunctionComponent<OpenAPIOutputProps> = (props)=> {
  const[selected, setSelected] = useState<"raw"|"swagger-ui">("raw");
  const handleSelected = useCallback(
    () => { setSelected(selected === "raw"?("swagger-ui"):("raw"));
    },
    [selected],
  );
  return(
    <>
    {PlaygroundManifest.enableSwaggerUI? (
    <select className="output-dropdown" onChange={handleSelected} value={selected}>
      <option>OpenApi</option>
      <option >Swagger-UI</option>
    </select>
    ):(<></>)}
    
    {selected === "raw"? (<OutputEditor value={props.content}/>):(<SwaggerUI spec={props.content} />)}
    </>);
}

