import { useEffect, useRef } from "react";
import { FunctionComponent } from "react";
import CreateSwaggerUI from "swagger-ui";
export interface SwaggerUIProps{
  spec: string; 
}
export const SwaggerUI: FunctionComponent<SwaggerUIProps> =(props)=> {
  const uiRef = useRef(null);
  const uiInstance = useRef<any>(null);
  useEffect(() => {
    if(uiInstance.current === null) {
      uiInstance.current = CreateSwaggerUI({  
        domNode: uiRef.current,
        spec: JSON.parse(props.spec),
      })
    } else {
     uiInstance.current.specActions.updateSpec(props.spec);
    }
  }, [props.spec])

  return <div ref={uiRef}></div>
}
