// Hello World
"use client";

import { Fragment, useSyncExternalStore } from "react";
import { TAGLINES, sessionTaglineIndex } from "@/lib/taglines";

const subscribe = () => () => {};

/** Frase do manifesto, uma por sessão. No servidor e na hidratação mostra a primeira. */
export function Tagline() {
  const index = useSyncExternalStore(subscribe, sessionTaglineIndex, () => 0);
  const lines = (TAGLINES[index] ?? TAGLINES[0]).split(" / ");
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={line}>
          {i > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </>
  );
}
