// src/hooks/useRecorder.ts
// Hook that records local microphone + remote audio (if provided) into a .webm blob using MediaRecorder.
import { useEffect, useRef, useState } from "react";

export interface RecorderResult {
  recording: boolean;
  blobUrl: string | null; // URL.createObjectURL for playback/download
  start: (remoteStream?: MediaStream) => void;
  stop: () => void;
  reset: () => void;
}

export function useRecorder(): RecorderResult {
  const [recording, setRecording] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = (remoteStream?: MediaStream) => {
    if (recording) return;
    // Combine local mic (from getUserMedia) and remote stream (if any)
    const tracks: MediaStreamTrack[] = [];
    navigator.mediaDevices.getUserMedia({ audio: true }).then((local) => {
      tracks.push(...local.getAudioTracks());
      if (remoteStream) tracks.push(...remoteStream.getAudioTracks());
      const combined = new MediaStream(tracks);
      const recorder = new MediaRecorder(combined);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        chunksRef.current = [];
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    }).catch((err) => console.error("Recorder start error", err));
  };

  const stop = () => {
    if (!recording) return;
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const reset = () => {
    setBlobUrl(null);
    chunksRef.current = [];
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recording) mediaRecorderRef.current?.stop();
    };
  }, []);

  return { recording, blobUrl, start, stop, reset };
}
