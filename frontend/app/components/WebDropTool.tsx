"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ChangeEvent,
  type DragEvent,
} from "react";
import QRCode from "qrcode";

type Screen = "start" | "sending" | "receiving" | "connected";

type SignalMessage =
  | { type: "offer" | "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice-candidate"; candidate: RTCIceCandidateInit };

type IncomingFileMeta = { name: string; size: number; mime: string };

const formatSpeedEta = (
  bytesPerSec: number,
  bytesRemaining: number,
): string => {
  if (bytesPerSec <= 0) return "";
  let speed: string;
  if (bytesPerSec >= 1024 * 1024) {
    speed = (bytesPerSec / (1024 * 1024)).toFixed(1) + " MB/s";
  } else if (bytesPerSec >= 1024) {
    speed = (bytesPerSec / 1024).toFixed(1) + " KB/s";
  } else {
    speed = Math.round(bytesPerSec) + " B/s";
  }
  const etaSec = Math.max(0, Math.ceil(bytesRemaining / bytesPerSec));
  const eta =
    etaSec >= 60
      ? Math.floor(etaSec / 60) + "m " + (etaSec % 60) + "s"
      : etaSec + "s";
  return speed + " ~" + eta + " remaining";
};

const POLL_INTERVAL_MS = 1200;

export function WebDropTool() {
  const [screen, setScreen] = useState<Screen>("start");
  // Whether THIS device is the one that originally clicked "Send" (the
  // offer-creator / sending role). Mirrors flowRef as STATE because React's
  // render path can't safely read a ref's .current during render. Controls
  // whether the one-way send controls (text box + Files/Photo/Camera) show.
  const [isSender, setIsSender] = useState(false);
  const [code, setCode] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [dataChannelOpen, setDataChannelOpen] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [sendProgress, setSendProgress] = useState(0);
  const [receiveProgress, setReceiveProgress] = useState(0);
  const [sendSpeedText, setSendSpeedText] = useState("");
  const [receiveSpeedText, setReceiveSpeedText] = useState("");
  const [largeFileWarning, setLargeFileWarning] = useState(false);
  const [sendingFileName, setSendingFileName] = useState("");
  const [incomingFile, setIncomingFile] = useState<{
    name: string;
    url: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const flowRef = useRef<"sending" | "receiving">("sending");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const codeRef = useRef("");
  const incomingMetaRef = useRef<IncomingFileMeta | null>(null);
  const incomingChunksRef = useRef<ArrayBuffer[]>([]);
  const incomingBytesRef = useRef(0);
  const receivedChunksRef = useRef(0);
  const sendSpeedRef = useRef({ lastUpdate: 0, lastBytes: 0 });
  const receiveSpeedRef = useRef({ lastUpdate: 0, lastBytes: 0 });

  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const COUNTDOWN_SECONDS = 30;
  const transferCompletedRef = useRef(false);
  const startSelfDestruct = () => {
    if (countdownRef.current !== null) {
      clearInterval(countdownRef.current);
    }
    setCountdown(COUNTDOWN_SECONDS);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current as unknown as number);
          countdownRef.current = null;
          handleReset();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelSelfDestruct = () => {
    if (countdownRef.current !== null) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(0);
  };

  const resetSelfDestructIfRunning = () => {
    if (transferCompletedRef.current && countdownRef.current !== null) {
      startSelfDestruct();
    }
  };

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const myRole = (): "creator" | "joiner" =>
    flowRef.current === "sending" ? "creator" : "joiner";

  const sendSignal = async (data: SignalMessage | { type: string }) => {
    const code = codeRef.current;
    if (!code) return;
    try {
      await fetch("/api/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, role: myRole(), data }),
      });
    } catch (err) {
      console.error("Error sending signal", err);
    }
  };

  const setupPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun.relay.metered.ca:80" },
        {
          urls: "turn:global.relay.metered.ca:80",
          username: process.env.NEXT_PUBLIC_TURN_USERNAME,
          credential: process.env.NEXT_PUBLIC_TURN_PASSWORD,
        },
        {
          urls: "turn:global.relay.metered.ca:80?transport=tcp",
          username: process.env.NEXT_PUBLIC_TURN_USERNAME,
          credential: process.env.NEXT_PUBLIC_TURN_PASSWORD,
        },
        {
          urls: "turn:global.relay.metered.ca:443",
          username: process.env.NEXT_PUBLIC_TURN_USERNAME,
          credential: process.env.NEXT_PUBLIC_TURN_PASSWORD,
        },
        {
          urls: "turns:global.relay.metered.ca:443?transport=tcp",
          username: process.env.NEXT_PUBLIC_TURN_USERNAME,
          credential: process.env.NEXT_PUBLIC_TURN_PASSWORD,
        },
      ],
    });
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({ type: "ice-candidate", candidate: event.candidate });
      }
    };
    peerConnectionRef.current = pc;
    return pc;
  };
  const setupDataChannel = (channel: RTCDataChannel) => {
    dataChannelRef.current = channel;
    channel.binaryType = "arraybuffer";
    channel.onopen = () => {
      setDataChannelOpen(true);
      setStatusMessage("P2P connection established!");
      // The direct peer-to-peer channel is now live, so there is no reason to
      // keep asking the server for signaling messages anymore. Shut the poller
      // down to cut the load on /api/signal for the whole lifetime of a session.
      stopPolling();
    };
    channel.onmessage = (event) => {
      resetSelfDestructIfRunning();
      if (typeof event.data === "string") {
        const text = event.data as string;
        if (text.startsWith("{")) {
          try {
            const parsed = JSON.parse(text);
            if (parsed.type === "file-meta") {
              // Defensive cap: a peer could declare an extremely long filename
              // to break the layout. Truncate to 255 chars for display/save
              // purposes, but still accept the transfer itself.
              const rawName =
                typeof parsed.name === "string" && parsed.name.length > 0
                  ? parsed.name
                  : "download";
              incomingMetaRef.current = {
                name:
                  rawName.length > 255 ? rawName.slice(0, 255) : rawName,
                size: parsed.size as number,
                mime: parsed.mime as string,
              };
              setLargeFileWarning(
                (parsed.size as number) > 2 * 1024 * 1024 * 1024,
              );
              incomingChunksRef.current = [];
              incomingBytesRef.current = 0;
              receivedChunksRef.current = 0;
              receiveSpeedRef.current = { lastUpdate: 0, lastBytes: 0 };
              setReceiveSpeedText("");
              setIncomingFile(null);
              setReceiveProgress(0);
              return;
            }
            if (parsed.type === "file-end") {
              const meta = incomingMetaRef.current;
              if (meta && incomingChunksRef.current.length > 0) {
                const blob = new Blob(incomingChunksRef.current, {
                  type: meta.mime,
                });
                setIncomingFile({
                  name: meta.name,
                  url: URL.createObjectURL(blob),
                });
                setReceiveProgress(100);
              }
              setReceiveSpeedText("");
              setLargeFileWarning(false);
              transferCompletedRef.current = true;
              startSelfDestruct();
              return;
            }
          } catch {
            // Not valid JSON, fall through
          }
        }
        setMessages((prev) => [...prev, "Peer: " + text]);
      } else {
        const chunk = event.data as ArrayBuffer;
        if (incomingMetaRef.current) {
          incomingChunksRef.current.push(chunk);
          incomingBytesRef.current += chunk.byteLength;
          receivedChunksRef.current++;
          const now = Date.now();
          if (now - receiveSpeedRef.current.lastUpdate >= 1000) {
            const dtSec = (now - receiveSpeedRef.current.lastUpdate) / 1000;
            const speed =
              (incomingBytesRef.current - receiveSpeedRef.current.lastBytes) /
              dtSec;
            receiveSpeedRef.current.lastBytes = incomingBytesRef.current;
            receiveSpeedRef.current.lastUpdate = now;
            const remaining =
              incomingMetaRef.current.size - incomingBytesRef.current;
            setReceiveSpeedText(formatSpeedEta(speed, remaining));
          }
          if (receivedChunksRef.current % 10 === 0) {
            const total = incomingMetaRef.current.size;
            setReceiveProgress(
              Math.min(
                100,
                Math.floor((incomingBytesRef.current / total) * 100),
              ),
            );
          }
        }
      }
    };
  };

  const startOffer = async () => {
    const pc = setupPeerConnection();
    const channel = pc.createDataChannel("file-transfer");
    setupDataChannel(channel);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal({ type: "offer", sdp: pc.localDescription! });
  };

  const startAnswer = () => {
    const pc = setupPeerConnection();
    pc.ondatachannel = (event) => {
      setupDataChannel(event.channel);
    };
  };

  const handleSignal = async (data: SignalMessage) => {
    const pc = peerConnectionRef.current;
    if (!pc) return;
    try {
      if (data.type === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({ type: "answer", sdp: pc.localDescription! });
      } else if (data.type === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      } else if (data.type === "ice-candidate") {
        try {
          await pc.addIceCandidate(data.candidate);
        } catch {
          // Candidates can arrive out of order; ignore harmless errors
        }
      }
    } catch (err) {
      console.error("Error handling signaling message", err);
    }
  };

  const onPeerJoined = () => {
    if (peerConnectionRef.current) return;
    setScreen("connected");
    setStatusMessage(
      flowRef.current === "receiving"
        ? "Connected! (paired with sender)"
        : "Connected! (peer joined)",
    );
    if (flowRef.current === "sending") {
      startOffer();
    } else {
      startAnswer();
    }
  };

  const pollOnce = async () => {
    const code = codeRef.current;
    if (!code) return;
    try {
      const res = await fetch(
        `/api/signal?code=${encodeURIComponent(code)}&role=${myRole()}`,
      );
      if (!res.ok) return;
      const json = (await res.json()) as { messages?: unknown[] };
      for (const raw of json.messages ?? []) {
        if (!raw || typeof raw !== "object" || !("type" in raw)) continue;
        const data = raw as { type: string };
        if (data.type === "peer-joined") {
          onPeerJoined();
        } else {
          await handleSignal(raw as SignalMessage);
        }
      }
    } catch (err) {
      console.error("Error while polling for signaling messages", err);
    }
  };

  const startPolling = () => {
    stopPolling();
    pollRef.current = setInterval(() => {
      void pollOnce();
    }, POLL_INTERVAL_MS);
  };

  useEffect(() => {
    return () => {
      stopPolling();
      if (countdownRef.current !== null) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      dataChannelRef.current?.close();
      peerConnectionRef.current?.close();
    };
  }, [stopPolling]);
  const handleSend = async () => {
    flowRef.current = "sending";
    setIsSender(true);
    try {
      const res = await fetch("/api/create-room", { method: "POST" });
      if (!res.ok)
        throw new Error(`create-room failed with status ${res.status}`);
      const json = (await res.json()) as { code: string };
      codeRef.current = json.code;
      setCode(json.code);
      setScreen("sending");
      const dataUrl = await QRCode.toDataURL(json.code);
      setQrDataUrl(dataUrl);
      setStatusMessage("Waiting for the other device to connect...");
      startPolling();
    } catch (err) {
      console.error("Error creating a room", err);
    }
  };

  const handleConnect = async () => {
    if (inputCode.trim().length === 0) {
      setErrorMessage("Please enter the 4-digit code.");
      return;
    }
    flowRef.current = "receiving";
    setIsSender(false);
    codeRef.current = inputCode.trim();
    try {
      const res = await fetch("/api/join-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: inputCode.trim() }),
      });
      if (!res.ok) {
        setErrorMessage("Code not found, please check and try again.");
        return;
      }
      setErrorMessage("");
      startPolling();
      onPeerJoined();
    } catch (err) {
      console.error("Error joining the room", err);
      setErrorMessage("Something went wrong, please try again.");
    }
  };

  const handleSendMessage = () => {
    if (dataChannelRef.current?.readyState === "open" && messageInput.trim()) {
      const text = messageInput.trim();
      dataChannelRef.current.send(text);
      // Show our own sent message locally, labeled "You:" so both sides of
      // the two-way chat can see what they typed (not just what they received).
      setMessages((prev) => [...prev, "You: " + text]);
      setMessageInput("");
    }
  };

  const CHUNK_SIZE = 64 * 1024;
  const BUFFER_THRESHOLD = 1 * 1024 * 1024;
  const BUFFER_LOW = 512 * 1024;

  const waitForDrain = (): Promise<void> =>
    new Promise((resolve) => {
      const channel = dataChannelRef.current;
      if (!channel || channel.bufferedAmount < BUFFER_THRESHOLD) {
        resolve();
        return;
      }
      channel.bufferedAmountLowThreshold = BUFFER_LOW;
      channel.addEventListener(
        "bufferedamountlow",
        () => resolve(),
        { once: true },
      );
    });

  const handleFileSend = async (file: File | undefined) => {
    if (!file) return;
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== "open") return;
    channel.send(
      JSON.stringify({
        type: "file-meta",
        name: file.name,
        size: file.size,
        mime: file.type || "application/octet-stream",
      }),
    );
    setSendingFileName(file.name);
    setSendProgress(0);
    sendSpeedRef.current = { lastUpdate: 0, lastBytes: 0 };
    setSendSpeedText("");
    let offset = 0;
    let chunksSent = 0;

    const sendNextChunk = async () => {
      if (offset >= file.size) {
        channel.send(JSON.stringify({ type: "file-end" }));
        setSendProgress(100);
        setSendSpeedText("");
        transferCompletedRef.current = true;
        startSelfDestruct();
        return;
      }
      await waitForDrain();
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      const reader = new FileReader();
      reader.onload = () => {
        channel.send(reader.result as ArrayBuffer);
        offset += slice.size;
        chunksSent++;
        const now = Date.now();
        if (now - sendSpeedRef.current.lastUpdate >= 1000) {
          const dtSec = (now - sendSpeedRef.current.lastUpdate) / 1000;
          const speed = (offset - sendSpeedRef.current.lastBytes) / dtSec;
          sendSpeedRef.current.lastBytes = offset;
          sendSpeedRef.current.lastUpdate = now;
          setSendSpeedText(formatSpeedEta(speed, file.size - offset));
        }
        if (chunksSent % 10 === 0) {
          setSendProgress(
            Math.min(100, Math.floor((offset / file.size) * 100)),
          );
        }
        sendNextChunk();
      };
      reader.readAsArrayBuffer(slice);
    };
    sendNextChunk();
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFileSend(e.target.files?.[0]);
    e.target.value = "";
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSend(e.dataTransfer.files[0]);
  };

  const handleReset = () => {
    stopPolling();
    if (countdownRef.current !== null) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(0);
    transferCompletedRef.current = false;
    codeRef.current = "";
    setIsSender(false);
    setScreen("start");
    setCode("");
    setQrDataUrl("");
    setStatusMessage("");
    setInputCode("");
    setErrorMessage("");
    setMessages([]);
    setMessageInput("");
    setDataChannelOpen(false);
    setSendProgress(0);
    setReceiveProgress(0);
    setSendSpeedText("");
    setReceiveSpeedText("");
    setLargeFileWarning(false);
    setSendingFileName("");
    setIncomingFile(null);
    setIsDragging(false);
    incomingMetaRef.current = null;
    incomingChunksRef.current = [];
    incomingBytesRef.current = 0;
    receivedChunksRef.current = 0;
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
  };
  return (
    <div className="w-full max-w-md rounded-xl border border-[#232B45] bg-[#12172A] p-6 shadow-2xl sm:p-8">
      <div className="mb-8 flex items-center justify-center gap-2.5">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="shrink-0" aria-hidden="true">
          <path d="M6 14a8 8 0 0 1 16 0" stroke="#5B8DEF" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M10 14a4 4 0 0 1 8 0" stroke="#5B8DEF" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="14" cy="14" r="2" fill="#5B8DEF" />
        </svg>
        <h1 className="font-[family-name:var(--font-space-grotesk)] text-2xl font-bold tracking-tight text-[#E8ECF5]">
          WebDrop
        </h1>
      </div>
      {screen === "start" && (
        <div className="flex flex-col gap-4">
          <button onClick={handleSend} className="w-full rounded-lg bg-[#5B8DEF] py-3 text-lg font-semibold text-white transition-colors hover:bg-[#4A7DE0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B8DEF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12172A]">Send</button>
          <button onClick={() => setScreen("receiving")} className="w-full rounded-lg border border-[#232B45] bg-transparent py-3 text-lg font-semibold text-[#E8ECF5] transition-colors hover:bg-[#1A2040] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B8DEF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12172A]">Receive</button>
        </div>
      )}
      {screen === "sending" && (
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-[#8B93A7]">Share this code with the other device:</p>
          <div className={`text-6xl font-bold tracking-widest text-[#E8ECF5] ${dataChannelOpen ? "" : "pulse-glow rounded-xl"}`} style={{ fontFamily: "var(--font-space-grotesk)", padding: "0.25rem 0.5rem" }}>{code}</div>
          {qrDataUrl && (
            <div className={`rounded-xl border border-[#232B45] bg-[#0A0E1A] p-4 ${dataChannelOpen ? "" : "pulse-glow"}`}>
              <img src={qrDataUrl} alt="QR code" className="h-48 w-48 rounded-lg" />
            </div>
          )}
          <p className={`mt-2 text-base font-medium ${dataChannelOpen ? "text-[#34D399]" : "text-[#8B93A7]"}`}>{statusMessage}</p>
        </div>
      )}
      {screen === "receiving" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[#8B93A7]">Enter the 4-digit code shown on the sender&apos;s device:</p>
          <div className="flex gap-2">
            <input type="text" inputMode="numeric" maxLength={4} value={inputCode} onChange={(e) => setInputCode(e.target.value)} placeholder="3841" className="w-full flex-1 rounded-lg border border-[#232B45] bg-[#0A0E1A] px-4 py-3 text-center font-[family-name:var(--font-space-grotesk)] text-2xl font-semibold tracking-widest text-[#E8ECF5] outline-none placeholder:text-[#8B93A7]/50 focus:ring-2 focus:ring-[#5B8DEF]" />
            <button onClick={handleConnect} className="rounded-lg bg-[#5B8DEF] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#4A7DE0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B8DEF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12172A]">Connect</button>
          </div>
          {errorMessage && (<p className="text-center text-sm text-red-400">{errorMessage}</p>)}
        </div>
      )}
      {screen === "connected" && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#34D399]/10 ring-2 ring-[#34D399]/30">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12.5l5 5L20 7" stroke="#34D399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <p className="text-lg font-semibold text-[#E8ECF5]">{statusMessage}</p>
          {dataChannelOpen && (
            <div className="flex w-full flex-col gap-3 border-t border-[#232B45] pt-4">
              {/* Text messenger is TWO-way: both the sending and receiving
                  devices can type & send once dataChannelOpen is true. The
                  messages list below shows messages from both sides ("You:"
                  for your own, "Peer:" for the remote device's). */}
              <div className="flex gap-2">
                <input type="text" value={messageInput} onChange={(e) => setMessageInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSendMessage(); }} placeholder="Type a message" className="w-full flex-1 rounded-lg border border-[#232B45] bg-[#0A0E1A] px-3 py-2 text-[#E8ECF5] outline-none placeholder:text-[#8B93A7]/50 focus:ring-2 focus:ring-[#5B8DEF]" />
                <button onClick={handleSendMessage} className="rounded-lg bg-[#5B8DEF] px-4 py-2 font-semibold text-white transition-colors hover:bg-[#4A7DE0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B8DEF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12172A]">Send Message</button>
              </div>
              {messages.length > 0 && (
                <ul className="flex flex-col gap-2 text-left text-sm text-[#8B93A7]">
                  {messages.map((msg, i) => (<li key={i} className="break-words rounded-lg bg-[#0A0E1A] px-3 py-2 text-[#E8ECF5]">{msg}</li>))}
                </ul>
              )}
            </div>
          )}
          {dataChannelOpen && (
            <div className="flex w-full flex-col gap-3 border-t border-[#232B45] pt-4">
              {/* SEND OPTIONS — one-way: only the original SENDING device sees
                  these controls (isSender); the receiving device has no way to
                  send files back. All three inputs reuse the same handleFileSend
                  pipeline (via handleFileInputChange) — no duplication of the
                  chunking/backpressure/progress logic. */}
              {isSender && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {/* Files — also stays the drag-and-drop target (as before) */}
                <label
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border px-2 py-3 text-center transition-colors ${isDragging ? "border-[#5B8DEF] bg-[#5B8DEF]/10" : "border-[#232B45] hover:border-[#5B8DEF]/50 hover:bg-[#1A2040]"}`}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 3h9l5 5v13H6z" stroke="#5B8DEF" strokeWidth="2" strokeLinejoin="round" />
                    <path d="M14 3v6h6" stroke="#5B8DEF" strokeWidth="2" strokeLinejoin="round" />
                    <path d="M9 12h6M9 16h6" stroke="#5B8DEF" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <span className="text-xs font-medium text-[#E8ECF5]">Files</span>
                  <span className="text-[10px] text-[#8B93A7]/70">or drag &amp; drop here</span>
                  {/* Files opens the general file browser with NO type
                      restriction — any file can be picked. The restrictive
                      Photo/Video and Camera options handle media separately. */}
                  <input type="file" className="hidden" onChange={handleFileInputChange} />
                </label>

                {/* Photo & Video — opens the gallery/photo picker filtered to media */}
                <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-[#232B45] px-2 py-3 text-center transition-colors hover:border-[#5B8DEF]/50 hover:bg-[#1A2040]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="16" rx="2" stroke="#5B8DEF" strokeWidth="2" />
                    <circle cx="9" cy="9" r="2" stroke="#5B8DEF" strokeWidth="2" />
                    <path d="M5 17l4-4 3 3 2-2 4 3" stroke="#5B8DEF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-xs font-medium text-[#E8ECF5]">Photo/Video</span>
                  <input type="file" accept="image/*,video/*" className="hidden" onChange={handleFileInputChange} />
                </label>

                {/* Camera — on supported mobile browsers (Android Chrome, iPhone
                    Safari) this opens the live camera for a PHOTO: capture="environment"
                    prompts for camera permission and launches the native camera UI
                    (reliable, standards-based). On desktop it falls back to the file
                    picker (acceptable there). Note: true in-browser VIDEO recording
                    from the camera isn't reliably supported this way across all phones
                    — that would need a separate MediaRecorder-based custom UI, which is
                    a bigger feature. For now, Camera is scoped to live PHOTO capture only. */}
                <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-[#232B45] px-2 py-3 text-center transition-colors hover:border-[#5B8DEF]/50 hover:bg-[#1A2040]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 7h3l2-2h6l2 2h3v12H4z" stroke="#5B8DEF" strokeWidth="2" strokeLinejoin="round" />
                    <circle cx="12" cy="13" r="3.5" stroke="#5B8DEF" strokeWidth="2" />
                  </svg>
                  <span className="text-xs font-medium text-[#E8ECF5]">Camera</span>
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileInputChange} />
                </label>
              </div>
              )}
              {sendingFileName && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between">
                    <p className="text-xs text-[#8B93A7]">Sending {sendingFileName}</p>
                    <p className="text-xs font-medium text-[#E8ECF5]">{sendProgress}%</p>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#232B45]"><div className="h-2 rounded-full bg-[#5B8DEF] transition-all" style={{ width: `${sendProgress}%` }} /></div>
                  {sendSpeedText && (<p className="text-xs text-[#8B93A7]">{sendSpeedText}</p>)}
                </div>
              )}
              {receiveProgress > 0 && receiveProgress < 100 && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between">
                    <p className="text-xs text-[#8B93A7]">Receiving file</p>
                    <p className="text-xs font-medium text-[#E8ECF5]">{receiveProgress}%</p>
                  </div>
                  {largeFileWarning && (<p className="text-xs text-amber-400">Files over 2GB may not work reliably in this version</p>)}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#232B45]"><div className="h-2 rounded-full bg-[#5B8DEF] transition-all" style={{ width: `${receiveProgress}%` }} /></div>
                  {receiveSpeedText && (<p className="text-xs text-[#8B93A7]">{receiveSpeedText}</p>)}
                </div>
              )}
              {incomingFile && (
                <a href={incomingFile.url} download={incomingFile.name} className="rounded-lg bg-[#34D399] px-4 py-2 text-sm font-semibold text-[#0A0E1A] transition-colors hover:bg-[#2BC08A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34D399] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12172A]">Download {incomingFile.name}</a>
              )}
            </div>
          )}
          {countdown > 0 && (
            <p className="flex items-center justify-between rounded-lg border border-[#232B45] bg-[#0A0E1A] px-3 py-2 text-xs text-[#8B93A7]">
              <span>This session will close automatically in {countdown}s for privacy.</span>
              <button onClick={cancelSelfDestruct} className="font-semibold text-[#5B8DEF] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B8DEF]">Cancel</button>
            </p>
          )}
          <button onClick={handleReset} className="w-full rounded-lg border border-[#232B45] bg-transparent py-3 font-semibold text-[#8B93A7] transition-colors hover:bg-[#1A2040] hover:text-[#E8ECF5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B8DEF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12172A]">Start over</button>
        </div>
      )}
    </div>
  );
}