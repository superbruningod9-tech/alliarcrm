// src/hooks/useAudioPipeline.ts
// Hook that sets up microphone capture, high‑pass filter, device selection, VU meter, and test loopback.
import { useEffect, useRef, useState } from "react";

export interface AudioPipeline {
  stream: MediaStream | null;
  analyser: AnalyserNode | null;
  volume: number; // 0‑1 value for VU meter
  devices: MediaDeviceInfo[];
  currentInputId: string | null;
  currentOutputId: string | null;
  setInputDevice: (deviceId: string) => Promise<void>;
  setOutputDevice: (deviceId: string) => Promise<void>;
  testAudio: () => void; // loopback test
}

export function useAudioPipeline(): AudioPipeline {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentInputId, setCurrentInputId] = useState<string | null>(null);
  const [currentOutputId, setCurrentOutputId] = useState<string | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const volumeRef = useRef<number>(0);
  const [volume, setVolume] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const testAudioRef = useRef<AudioBufferSourceNode | null>(null);

  // Helper to create AudioContext once
  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current?.state === "suspended") void audioCtxRef.current.resume();
    return audioCtxRef.current;
  };

  // Capture microphone + pipeline
  const startCapture = async (deviceId?: string) => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          deviceId: deviceId ? { exact: deviceId } : undefined,
        },
        video: false,
      };
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      // Insert high‑pass filter
      const ctx = getAudioContext();
      if (!ctx) return;
      const source = ctx.createMediaStreamSource(mediaStream);
      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 85;
      source.connect(highpass);
      const destination = ctx.createMediaStreamDestination();
      highpass.connect(destination);
      setStream(destination.stream);
      setCurrentInputId(deviceId ?? null);
    } catch (e) {
      console.error("Audio capture error", e);
      setStream(null);
    }
  };

  // Device enumeration
  const enumerate = async () => {
    const devs = await navigator.mediaDevices.enumerateDevices();
    setDevices(devs.filter((d) => d.kind === "audioinput" || d.kind === "audiooutput"));
  };

  // Switch input device live
  const setInputDevice = async (deviceId: string) => {
    await startCapture(deviceId);
  };

  // Switch output device live (requires <audio> element with setSinkId)
  const setOutputDevice = async (deviceId: string) => {
    setCurrentOutputId(deviceId);
  };

  // Loopback test – connect stream directly to speakers
  const testAudio = () => {
    if (!stream) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const source = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain();
    gain.gain.value = 0.7;
    source.connect(gain).connect(ctx.destination);
    // stop after 5 s
    setTimeout(() => {
      source.disconnect();
      gain.disconnect();
    }, 5000);
  };

  // Setup analyser for VU meter
  useEffect(() => {
    if (!stream) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const update = () => {
      analyser.getByteFrequencyData(dataArray);
      const sum = dataArray.reduce((a, b) => a + b, 0);
      const avg = sum / dataArray.length / 255; // normalize 0‑1
      volumeRef.current = avg;
      setVolume(avg);
      requestAnimationFrame(update);
    };
    update();
    return () => {
      analyser.disconnect();
    };
  }, [stream]);

  // Initial enumeration & capture on mount
  useEffect(() => {
    enumerate();
    startCapture();
    // Re‑enumerate when devices change
    navigator.mediaDevices.addEventListener("devicechange", enumerate);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", enumerate);
    };
  }, []);

  return {
    stream,
    analyser: analyserRef.current,
    volume,
    devices,
    currentInputId,
    currentOutputId,
    setInputDevice,
    setOutputDevice,
    testAudio,
  };
}
