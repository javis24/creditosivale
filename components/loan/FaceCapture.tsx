"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";

type Props = {
  onChange: (file: File | null) => void;
};

export default function FaceCapture({ onChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function startCamera() {
    setError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setError("No se pudo abrir la cámara. Puedes seleccionar una fotografía.");
    }
  }

  function setFaceFile(file: File) {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    onChange(file);
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const maxWidth = 900;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setFaceFile(new File([blob], "fotografia-rostro.jpg", { type: "image/jpeg" }));
        stopCamera();
      },
      "image/jpeg",
      0.88,
    );
  }

  function selectFallback(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setFaceFile(file);
  }

  function retake() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    onChange(null);
    void startCamera();
  }

  return (
    <div className="face-capture">
      {preview ? (
        <div className="face-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Fotografía del rostro capturada" />
          <button type="button" className="button button-secondary" onClick={retake}>
            Tomar otra foto
          </button>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            className={cameraActive ? "camera-video active" : "camera-video"}
            playsInline
            muted
          />

          <div className="camera-actions">
            {!cameraActive ? (
              <button type="button" className="button button-secondary" onClick={startCamera}>
                Abrir cámara frontal
              </button>
            ) : (
              <>
                <button type="button" className="button button-primary" onClick={capture}>
                  Capturar fotografía
                </button>
                <button type="button" className="button button-secondary" onClick={stopCamera}>
                  Cancelar
                </button>
              </>
            )}

            <label className="button button-secondary file-button">
              Seleccionar fotografía
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="user"
                onChange={selectFallback}
              />
            </label>
          </div>
        </>
      )}

      {error ? <p className="field-error">{error}</p> : null}
      <small>
        Mira de frente, retira lentes oscuros y procura tener buena iluminación.
      </small>
    </div>
  );
}
