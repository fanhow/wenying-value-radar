"use client";

import Image from "next/image";
import { useState } from "react";
import type { AnnotationBundle, RealMarketCase } from "./real-market-cases";

export function RealCaseImage({
  marketCase,
  annotations,
  language,
}: {
  marketCase: RealMarketCase;
  annotations?: AnnotationBundle;
  language: "zh" | "en";
}) {
  const [mode, setMode] = useState<"original" | "annotated">("annotated");
  const original = marketCase.images.original;
  const renderedAnnotated = marketCase.images.annotated;
  const hasOverlay = Boolean(original && annotations?.annotations.length);
  const hasAnyImage = Boolean(original || renderedAnnotated);
  const imagePath = mode === "annotated" ? renderedAnnotated ?? original : original ?? renderedAnnotated;

  if (!hasAnyImage || !imagePath) {
    return (
      <div className="real-case-image-empty" role="status">
        <strong>{language === "zh" ? "原始交易截圖尚未附上" : "Original trade screenshot not yet attached"}</strong>
        <span>{language === "zh" ? "保留空白，不以合成圖替代真實紀錄。" : "Left blank rather than replaced with a synthetic chart."}</span>
      </div>
    );
  }

  return (
    <div className="real-case-image-block">
      <div className="real-case-image-switch" role="tablist" aria-label={language === "zh" ? "截圖顯示模式" : "Screenshot display mode"}>
        <button type="button" role="tab" aria-selected={mode === "original"} className={mode === "original" ? "active" : ""} onClick={() => setMode("original")}>
          {language === "zh" ? "原始截圖" : "Original"}
        </button>
        <button type="button" role="tab" aria-selected={mode === "annotated"} className={mode === "annotated" ? "active" : ""} onClick={() => setMode("annotated")}>
          {language === "zh" ? "標註版本" : "Annotated"}
        </button>
      </div>
      <div className="real-case-image-frame">
        <Image src={imagePath} alt={`${marketCase.symbol} ${marketCase.execution_timeframe}`} width={1600} height={1000} unoptimized sizes="(max-width: 760px) 100vw, 900px" />
        {mode === "annotated" && !renderedAnnotated && hasOverlay ? (
          <div className="real-case-annotation-layer" aria-label={language === "zh" ? "交易標註" : "Trade annotations"}>
            {annotations?.annotations.map((annotation) => (
              <span
                className="real-case-annotation"
                data-kind={annotation.kind}
                key={annotation.id}
                style={{ left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%` }}
              >
                {language === "zh" ? annotation.label.zh : annotation.label.en}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
