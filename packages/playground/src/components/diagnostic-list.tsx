import { Diagnostic } from "@cadl-lang/compiler";
import { FunctionComponent } from "react";

export interface DiagnosticListProps {
  readonly diagnostics: readonly Diagnostic[];
}

export const DiagnosticList: FunctionComponent<DiagnosticListProps> = ({ diagnostics }) => {
  if (diagnostics.length === 0) {
    return <div className="center">No errors</div>;
  }
  return (
    <div className="diagnostic-list">
      {diagnostics.map((x, i) => {
        return <DiagnosticItem key={i} diagnostic={x} />;
      })}
    </div>
  );
};

export interface DiagnosticItemProps {
  readonly diagnostic: Diagnostic;
}

export const DiagnosticItem: FunctionComponent<DiagnosticItemProps> = ({ diagnostic }) => {
  return (
    <div className="diagnostic-item">
      <div className={`diagnostic-item-severity ${diagnostic.severity}`}>{diagnostic.severity}</div>
      <div className="diagnostic-item-code">{diagnostic.code}</div>
      <div className="diagnostic-item-message">{diagnostic.message}</div>
    </div>
  );
};
