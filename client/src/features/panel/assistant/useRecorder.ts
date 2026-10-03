import { useEffect, useRef, useState } from "react";

// Graba del micrófono con MediaRecorder (Chrome graba WebM/Opus; Safari, MP4). stop(true)
// devuelve el audio; stop(false) lo descarta.
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const finish = useRef<((blob: Blob | null) => void) | null>(null);

  useEffect(() => {
    if (!recording) return;
    const startedAt = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => clearInterval(timer);
  }, [recording]);

  // Si se sale de la página grabando, se suelta el micrófono.
  useEffect(
    () => () => {
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  // Pide el micrófono (el navegador pregunta la primera vez). Si no lo dan, tira el error.
  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const media = new MediaRecorder(stream);
    chunks.current = [];
    media.ondataavailable = (event) => {
      if (event.data.size) chunks.current.push(event.data);
    };
    media.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      finish.current?.(new Blob(chunks.current, { type: media.mimeType }));
      finish.current = null;
    };
    recorder.current = media;
    media.start();
    setSeconds(0);
    setRecording(true);
  }

  function stop(keep: boolean): Promise<Blob | null> {
    const media = recorder.current;
    recorder.current = null;
    setRecording(false);
    if (!media) return Promise.resolve(null);
    return new Promise((resolve) => {
      finish.current = keep ? resolve : () => resolve(null);
      media.stop();
    });
  }

  const supported = typeof window !== "undefined" && "MediaRecorder" in window && Boolean(navigator.mediaDevices?.getUserMedia);
  return { recording, seconds, start, stop, supported };
}
