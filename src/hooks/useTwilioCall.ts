// src/hooks/useTwilioCall.ts
// Hook that encapsulates Twilio Voice SDK Call handling with mute, hold, DTMF, quality metrics, and remote stream.
import { useEffect, useRef, useState } from "react";
import { Call, CallOptions, Twilio } from "@twilio/voice-sdk"; // assume installed package
import type { MediaStream } from "twilio-client"; // remote stream typings may differ

export type CallMode = "whatsapp" | "tel" | "browser";

export interface TwilioCallState {
  call: Call | null;
  callStatus: "idle" | "dialing" | "ringing" | "connected" | "hold" | "ended" | "error";
  quality: "excellent" | "unstable" | "high_latency" | "unknown";
  mute: boolean;
  hold: boolean;
  remoteStream: MediaStream | null;
  startCall: (to: string, mode: CallMode, token: string) => Promise<void>;
  endCall: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
  sendDtmf: (digits: string) => void;
}

export function useTwilioCall(): TwilioCallState {
  const [call, setCall] = useState<Call | null>(null);
  const [callStatus, setCallStatus] = useState<TwilioCallState["callStatus"]>("idle");
  const [quality, setQuality] = useState<TwilioCallState["quality"]>("unknown");
  const [mute, setMute] = useState(false);
  const [hold, setHold] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const twilioRef = useRef<Twilio | null>(null);

  // Helper to obtain a Twilio device (creates on demand)
  const getDevice = (token: string) => {
    if (!twilioRef.current) {
      twilioRef.current = new Twilio(token);
    }
    return twilioRef.current;
  };

  const startCall = async (to: string, mode: CallMode, token: string) => {
    try {
      setCallStatus("dialing");
      const device = getDevice(token);
      const options: CallOptions = {
        // For browser mode we request audio only
        audio: true,
        // Additional parameters can be set per mode
      };
      const newCall = await device.connect(to, options);
      setCall(newCall);
      setCallStatus("ringing");

      // Event listeners
      newCall.on("connected", () => {
        setCallStatus("connected");
        // Obtain remote stream (Twilio provides getRemoteStream)
        const remote = (newCall as any).getRemoteStream?.() as MediaStream | undefined;
        if (remote) setRemoteStream(remote);
      });
      newCall.on("disconnected", () => {
        setCallStatus("ended");
        setRemoteStream(null);
        setCall(null);
      });
      newCall.on("error", (err: any) => {
        console.error("Twilio call error", err);
        setCallStatus("error");
      });
      // Quality sampling – Twilio emits "sample" events with metrics
      newCall.on("sample", (sample: any) => {
        const { mos, jitter } = sample; // typical fields
        if (mos >= 4.2 && jitter < 30) setQuality("excellent");
        else if (mos >= 3.5) setQuality("unstable");
        else setQuality("high_latency");
      });
      // Warnings – downgrade quality when needed
      newCall.on("warning", (msg: any) => {
        console.warn("Twilio warning", msg);
        setQuality("unstable");
      });
    } catch (e) {
      console.error(e);
      setCallStatus("error");
    }
  };

  const endCall = () => {
    if (call) {
      call.disconnect();
    }
    setCallStatus("ended");
    setRemoteStream(null);
    setCall(null);
    setMute(false);
    setHold(false);
  };

  const toggleMute = () => {
    if (call) {
      if (mute) call.unmute(); else call.mute();
      setMute(!mute);
    }
  };

  const toggleHold = () => {
    if (call) {
      if (hold) {
        // Release hold – simply unmute and stop hold music
        call.unmute();
        setHold(false);
      } else {
        // Put on hold – mute mic and play synthetic tone locally
        call.mute();
        setHold(true);
      }
    }
  };

  const sendDtmf = (digits: string) => {
    if (call) {
      call.sendDigits(digits);
    }
  };

  // Keyboard shortcut for mute (Ctrl+M)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        toggleMute();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [call, mute]);

  return { call, callStatus, quality, mute, hold, remoteStream, startCall, endCall, toggleMute, toggleHold, sendDtmf };
}
