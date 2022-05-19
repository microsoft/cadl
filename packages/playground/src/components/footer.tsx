import { MANIFEST } from "@cadl-lang/compiler";
import { FunctionComponent, PropsWithChildren } from "react";

export const Footer: FunctionComponent = () => {
  const prItem = MANIFEST.pr ? (
    <FooterItem link={`https://github.com/microsoft/cadl/pull/${MANIFEST.pr}`}>
      <span>PR </span>
      <span>{MANIFEST.pr}</span>
    </FooterItem>
  ) : (
    <></>
  );
  return (
    <div className={`footer ${MANIFEST.pr ? "in-pr" : ""}`}>
      {prItem}
      <FooterItem>
        <span>Cadl Version </span>
        <span>{MANIFEST.version}</span>
      </FooterItem>
      <FooterItem link={`https://github.com/microsoft/cadl/commit/${MANIFEST.commit}`}>
        <span>Commit </span>
        <span>{MANIFEST.commit.slice(0, 6)}</span>
      </FooterItem>
    </div>
  );
};

interface FooterItemProps {
  link?: string;
}
const FooterItem: FunctionComponent<PropsWithChildren<FooterItemProps>> = ({ children, link }) => {
  return link ? (
    <a className="item" href={link} target="_blank">
      {children}
    </a>
  ) : (
    <div className="item">{children}</div>
  );
};
