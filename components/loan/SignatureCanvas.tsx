"use client";

import { PointerEvent, useRef, useState } from "react";

type Props = {
  onChange: (file: File | null) => void;
};

export default function SignatureCanvas({ onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasSignatureRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const current = point(event);
    context.beginPath();
    context.moveTo(current.x, current.y);
    context.strokeStyle = "#10233f";
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
  }

  function draw(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const current = point(event);
    context.lineTo(current.x, current.y);
    context.stroke();
    if (!hasSignatureRef.current) {
      hasSignatureRef.current = true;
      setHasSignature(true);
    }
  }

  function exportSignature() {
    drawingRef.current = false;
    const source = canvasRef.current;
    if (!source || !hasSignatureRef.current) return;

    const output = document.createElement("canvas");
    output.width = source.width;
    output.height = source.height;
    const context = output.getContext("2d");
    if (!context) return;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(source, 0, 0);
    output.toBlob((blob) => {
      if (!blob) return;
      onChange(new File([blob], "firma.png", { type: "image/png" }));
    }, "image/png");
  }

  function clear() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    hasSignatureRef.current = false;
    setHasSignature(false);
    onChange(null);
  }

  return (
    <div className="signature-box">
      <canvas
        ref={canvasRef}
        width={800}
        height={240}
        aria-label="Espacio para dibujar la firma"
        onPointerDown={start}
        onPointerMove={draw}
        onPointerUp={exportSignature}
        onPointerCancel={exportSignature}
      />
      <div className="signature-line" />
      <span>Firma dentro del recuadro usando el dedo, mouse o pantalla táctil.</span>
      <button
        type="button"
        className="signature-clear"
        onClick={clear}
        disabled={!hasSignature}
      >
        Limpiar firma
      </button>
    </div>
  );
}
