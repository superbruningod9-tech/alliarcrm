// src/hooks/useTranscription.ts
// Hook that uses the native Web Speech API (SpeechRecognition) to provide live captions.
import { useEffect, useRef, useState } from "react";

export interface TranscriptionResult {
  transcript: string; // accumulated text
  listening: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useTranscription(): TranscriptionResult {
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const recognizerRef = useRef<SpeechRecognition | null>(null);

  const createRecognizer = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Web Speech API not supported in this browser");
      return null;
    }
    const rec = new SpeechRecognition();
    rec.lang = "pt-BR";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const res = event.results[i];
        if (res.isFinal) final += res[0].transcript;
        else interim += res[0].transcript;
      }
      setTranscript((prev) => prev + final);
    };
    rec.onerror = (e) => console.error("SpeechRecognition error", e);
    return rec;
  };

  const start = () => {
    if (listening) return;
    const rec = createRecognizer();
    if (!rec) return;
    recognizerRef.current = rec;
    rec.start();
    setListening(true);
  };

  const stop = () => {
    recognizerRef.current?.stop();
    setListening(false);
  };

  const reset = () => {
    setTranscript("");
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognizerRef.current?.stop();
    };
  }, []);

  return { transcript, listening, start, stop, reset };
}
