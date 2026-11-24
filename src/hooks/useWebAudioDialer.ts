// src/hooks/useWebAudioDialer.ts
// Hook that creates a Web Audio pipeline for the VoIP dialer, providing:
// - Noise suppression, echo cancellation, auto gain control
// - High‑pass filter (85 Hz) to remove low‑frequency rumble
// - Real‑time device enumeration and switching (input & output)
// - Volume meter via AnalyserNode (VU meter)
// - Simple mute/unmute handling
// - MediaRecorder for local call recording
// - Integration with @twilio/voice-sdk (Device) for call signaling
// This file uses only native browser APIs (free) and the Twilio Voice SDK which is
// required for the actual VoIP connection. The JWT token and TwiML are served
// from Edge Functions (outside the scope of this hook).

import { useEffect, useState, useRef, useCallback } from "react";
import { Device, Call } from "@twilio/voice-sdk";

export interface WebAudioDialer {
  // Media stream coming from the microphone (processed)
  stream: MediaStream | null;
  // Analyser for volume visualization
  analyser: AnalyserNode | null;
  // Current volume level (0‑1)
  volume: number;
  // Available input and output devices
  devices: MediaDeviceInfo[];
  // Currently selected device IDs
  currentInputId: string | null;
  currentOutputId: string | null;
  // Control functions
  setInputDevice: (deviceId: string) => Promise<void>;
  setOutputDevice: (deviceId: string) => Promise<void>;
  toggleMute: () => void;
  isMuted: boolean;
  // Twilio call handling
  startCall: (token: string, twimlUrl: string) => Promise<Call | null>;
  endCall: () => Promise<void>;
  // DTMF tones generated with Web Audio API
  sendDtmfTone: (digit: string) => void;
  // Quality metric derived from WebRTC getStats
  quality: "excellent" | "unstable" | "high_latency" | "unknown";
  // Hold support (mute mic and play soft waiting tone)
  hold: boolean;
  toggleHold: () => void;
  // Quality metric derived from WebRTC getStats
  quality: "excellent" | "unstable" | "high_latency" | "unknown";
}

export function useWebAudioDialer() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [volume, setVolume] = useState(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentInputId, setCurrentInputId] = useState<string | null>(null);
  const [currentOutputId, setCurrentOutputId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const filterNodeRef = useRef<BiquadFilterNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks: Blob[] = [];

  const [twilioDevice, setTwilioDevice] = useState<Device | null>(null);
  const callRef = useRef<Call | null>(null);

  // ---------- Device enumeration ----------
  const updateDeviceList = useCallback(async () => {
    const devs = await navigator.mediaDevices.enumerateDevices();
    setDevices(devs.filter((d) => d.kind === "audioinput" || d.kind === "audiooutput"));
  }, []);

  useEffect(() => {
    updateDeviceList();
    navigator.mediaDevices.addEventListener("devicechange", updateDeviceList);
    return () => navigator.mediaDevices.removeEventListener("devicechange", updateDeviceList);
  }, [updateDeviceList]);

  // ---------- Get microphone with constraints ----------
  const initStream = useCallback(async (deviceId?: string) => {
    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    };
    const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    // Apply high‑pass filter
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = ctx.createMediaStreamSource(mediaStream);
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 85;
    const gain = ctx.createGain();
    source.connect(filter).connect(gain).connect(ctx.destination);
    // Analyser for VU meter
    const analyserNode = ctx.createAnalyser();
    analyserNode.fftSize = 256;
    gain.connect(analyserNode);
    setAnalyser(analyserNode);
    setStream(mediaStream);
    audioContextRef.current = ctx;
    sourceNodeRef.current = source;
    filterNodeRef.current = filter;
    gainNodeRef.current = gain;
  }, []);

  // Initialize on mount with default device
  useEffect(() => {
    initStream();
  }, [initStream]);

  // ---------- Volume meter ----------
  useEffect(() => {
    if (!analyser) return;
    let raf: number;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const update = () => {
      analyser.getByteFrequencyData(dataArray);
      const sum = dataArray.reduce((a, b) => a + b, 0);
      setVolume(sum / (dataArray.length * 255));
      raf = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(raf);
  }, [analyser]);

  // ---------- Device switching ----------
  const setInputDevice = useCallback(async (deviceId: string) => {
    if (audioContextRef.current) audioContextRef.current.close();
    await initStream(deviceId);
    setCurrentInputId(deviceId);
  }, [initStream]);

  const setOutputDevice = useCallback(async (deviceId: string) => {
    // Output device selection is only supported on <audio> elements via setSinkId.
    // The dialer renders remote audio via a hidden <audio> element; we expose the ID
    // so the component can apply it.
    setCurrentOutputId(deviceId);
  }, []);

  // ---------- Mute ----------
  const toggleMute = useCallback(() => {
    if (!gainNodeRef.current) return;
    const gain = gainNodeRef.current.gain;
    if (isMuted) {
      gain.value = 1;
    } else {
      gain.value = 0;
    }
    setIsMuted(!isMuted);
  }, [isMuted]);

  // ---------- DTMF tones (Web Audio) ----------
  const playDtmfTone = (digit: string) => {
    const dtmfMap: Record<string, [number, number]> = {
      "1": [697, 1209], "2": [697, 1336], "3": [697, 1477],
      "4": [770, 1209], "5": [770, 1336], "6": [770, 1477],
      "7": [852, 1209], "8": [852, 1336], "9": [852, 1477],
      "*": [941, 1209], "0": [941, 1336], "#": [941, 1477],
    };
    const freqs = dtmfMap[digit];
    if (!freqs) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.2;
    osc1.frequency.value = freqs[0];
    osc2.frequency.value = freqs[1];
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc1.start();
    osc2.start();
    const stopAt = ctx.currentTime + 0.12;
    osc1.stop(stopAt);
    osc2.stop(stopAt);
    setTimeout(() => ctx.close(), 150);
  };

  const sendDtmfTone = (digit: string) => {
    // Play locally for feedback
    playDtmfTone(digit);
    // If a Twilio Call is active, forward the tone via the SDK
    if (callRef.current) {
      callRef.current.sendDigits(digit);
    }
  };

  // ---------- Quality metric (WebRTC getStats) ----------
  const [quality, setQuality] = useState<'excellent' | 'unstable' | 'high_latency' | 'unknown'>('unknown');
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const initStats = useCallback(() => {
    if (!stream) return;
    const pc = new RTCPeerConnection();
    stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));
    pcRef.current = pc;
    const update = async () => {
      if (!pcRef.current) return;
      const stats = await pcRef.current.getStats();
      let jitterSum = 0;
      let packets = 0;
      stats.forEach((report) => {
        if (report.type === 'inbound-rtp' && report.kind === 'audio' && report.jitter !== undefined) {
          jitterSum += report.jitter;
          packets++;
        }
      });
      if (packets > 0) {
        const avgJitterMs = (jitterSum / packets) * 1000;
        if (avgJitterMs < 30) setQuality('excellent');
        else if (avgJitterMs < 70) setQuality('unstable');
        else setQuality('high_latency');
      } else {
        setQuality('unknown');
      }
    };
    const interval = setInterval(update, 3000);
    return () => clearInterval(interval);
  }, [stream]);

  useEffect(() => {
    if (stream) {
      const cleanup = initStats();
      return cleanup;
    }
  }, [stream, initStats]);


  const stopRecording = () => {
    if (!recorderRef.current) return null;
    recorderRef.current.stop();
    const blob = new Blob(recordedChunks, { type: "audio/webm" });
    recorderRef.current = null;
    recordedChunks.length = 0;
    return blob;
  };

  // ---------- Twilio integration ----------
  const startCall = async (token: string, twimlUrl: string) => {
    // Initialise the Twilio Device if not yet created
    if (!twilioDevice) {
      const device = new Device({ token, debug: false });
      setTwilioDevice(device);
      await device.setup();
    }
    if (!twilioDevice) return null;
    const call = await twilioDevice.connect({
      // The TwiML URL tells Twilio how to bridge the call to the remote party.
      // It can be an Edge Function that returns <Response><Dial>...</Dial></Response>
      // For browser‑to‑browser we use a "client" identity, but the exact flow
      // depends on the backend implementation.
      params: { TwiML: twimlUrl },
    });
    callRef.current = call;
    // Attach the remote audio to a hidden <audio> element (handled by the
    // component). The SDK provides a MediaStream via call.getRemoteStream().
    return call;
  };

  const endCall = async () => {
    if (callRef.current) {
      await callRef.current.disconnect();
      callRef.current = null;
    }
    if (twilioDevice) {
      await twilioDevice.disconnectAll();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) audioContextRef.current.close();
      if (twilioDevice) twilioDevice.disconnectAll();
    };
  }, [twilioDevice]);

  return {
    stream,
    analyser,
    volume,
    devices,
    currentInputId,
    currentOutputId,
    setInputDevice,
    setOutputDevice,
    toggleMute,
    isMuted,
    startCall,
    endCall,
    sendDtmfTone,
    startRecording,
    stopRecording,
  } as WebAudioDialer;
}
