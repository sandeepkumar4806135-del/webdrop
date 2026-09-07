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

// The different screens this page can show
type Screen = "start" | "sending" | "receiving" | "connected";

// The shapes of messages that travel through the /api/signal route
type SignalMessage =
  | { type: "offer" | "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice-candidate"; candidate: RTCIceCandidateInit };

// Metadata describing a file being transferred over the data channel
type IncomingFileMeta = { name: string; size: number; mime: string };

// Human-readable transfer speed + estimated time remaining.
// Given a throughput in bytes/sec and how many bytes are left to go,
// return a string like "3.2 MB/s • ~12s remaining".
const formatSpeedEta = (
  bytesPerSec: number,
  bytesRemaining: number,
): string => {
  if (bytesPerSec <= 0) return "";

  // Pick a friendly unit for the speed
  let speed: string;
  if (bytesPerSec >= 1024 * 1024) {
    speed = (bytesPerSec / (1024 * 1024)).toFixed(1) + " MB/s";
  } else if (bytesPerSec >= 1024) {
    speed = (bytesPerSec / 1024).toFixed(1) + " KB/s";
  } else {
    speed = Math.round(bytesPerSec) + " B/s";
  }

  // ETA in seconds, shown as ~Xs or ~Xm Ys for longer transfers
  const etaSec = Math.max(0, Math.ceil(bytesRemaining / bytesPerSec));
  const eta =
    etaSec >= 60
      ? Math.floor(etaSec / 60) + "m " + (etaSec % 60) + "s"
      : etaSec + "s";

  return speed + " • ~" + eta + " remaining";
};

// How often (in milliseconds) each side asks the server "any new messages?".
// This replaces Socket.io, which used to push messages to us instantly.
const POLL_INTERVAL_MS = 1200;

export default function Home() {
  // Which screen we are currently on
  const [screen, setScreen] = useState<Screen>("start");
  // The 4-digit code (used by the sender)
  const [code, setCode] = useState("");
  // The generated QR code image data (data URL)
  const [qrDataUrl, setQrDataUrl] = useState("");
  // Status message shown to the user
  const [statusMessage, setStatusMessage] = useState("");
  // The code typed by the receiver
  const [inputCode, setInputCode] = useState("");
  // Error message for the receiver flow
  const [errorMessage, setErrorMessage] = useState("");
  // Whether the WebRTC data channel is open (direct P2P link active)
  const [dataChannelOpen, setDataChannelOpen] = useState(false);
  // List of messages received through the data channel
  const [messages, setMessages] = useState<string[]>([]);
  // Text currently typed in the test messenger input box
  const [messageInput, setMessageInput] = useState("");
  // Progress (0-100) of sending a file
  const [sendProgress, setSendProgress] = useState(0);
  // Progress (0-100) of receiving a file
  const [receiveProgress, setReceiveProgress] = useState(0);
  // Live "speed / ETA" text shown under the send/receive progress bars
  const [sendSpeedText, setSendSpeedText] = useState("");
  const [receiveSpeedText, setReceiveSpeedText] = useState("");
  // Whether the incoming file is larger than the ~2GB safety threshold
  const [largeFileWarning, setLargeFileWarning] = useState(false);
  // Name of the file currently being sent (shown in the progress bar)
  const [sendingFileName, setSendingFileName] = useState("");
  // Completed incoming file (name + object URL) once fully received
  const [incomingFile, setIncomingFile] = useState<{
    name: string;
    url: string;
  } | null>(null);
  // Whether the user is currently dragging a file over the drop zone
  const [isDragging, setIsDragging] = useState(false);

  // Which flow is active: "sending" (we clicked Send) or "receiving"
  const flowRef = useRef<"sending" | "receiving">("sending");
  // Holds the id of our polling timer so we can stop it later.
  // (Replaces the old socketRef that used to hold the Socket.io connection.)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs for the WebRTC peer connection and data channel.
  // Storing them in refs lets them survive across re-renders.
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  // The 4-digit code for our current room (needed for every signal we send)
  const codeRef = useRef("");

  // Refs for an incoming file. They must survive across multiple onmessage
  // calls without causing a re-render on every single chunk.
  const incomingMetaRef = useRef<IncomingFileMeta | null>(null);
  const incomingChunksRef = useRef<ArrayBuffer[]>([]);
  const incomingBytesRef = useRef(0);
  const receivedChunksRef = useRef(0);

  // Sampling points used to compute the live transfer speed (bytes/sec).
  // We only update the speed text about once per second to avoid re-rendering
  // the whole UI on every single file chunk.
  const sendSpeedRef = useRef({ lastUpdate: 0, lastBytes: 0 });
  const receiveSpeedRef = useRef({ lastUpdate: 0, lastBytes: 0 });

  // ============================================================
  // SIGNALING VIA HTTP POLLING (replaces the old Socket.io events)
  // Instead of a server pushing messages to us instantly, we ask the
  // /api/signal route "give me everything new" every 1.2 seconds.
  // ============================================================

  // Our role in this pairing: "creator" (clicked Send) or "joiner" (Receive).
  // The API routes use this to decide which Redis queue is ours.
  const myRole = (): "creator" | "joiner" =>
    flowRef.current === "receiving" ? "joiner" : "creator";

  // Stop the polling loop. Used on "Start over" and when the page unmounts.
  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Send a signaling message to the other peer by POSTing it to /api/signal.
  // The API route stores it in the OTHER peer's queue in Redis, and the other
  // peer picks it up on their next poll.
  const sendSignal = (data: unknown) => {
    fetch("/api/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: codeRef.current, role: myRole(), data }),
    }).catch((err) => console.error("Error sending signal", err));
  };

  // Create a fresh RTCPeerConnection using a free STUN server plus
  // Metered.ca TURN servers.
  // STUN lets the two browsers find each other directly (peer-to-peer).
  // TURN is the fallback used when that direct connection is impossible
  // (e.g. strict corporate or mobile networks block P2P) - the traffic is
  // then relayed through Metered's servers instead.
  // NOTE: NEXT_PUBLIC_TURN_USERNAME and NEXT_PUBLIC_TURN_PASSWORD must also
  // be set in your Vercel project settings for this to work in production,
  // not just in your local .env.local file.
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

    // Whenever we generate an ICE candidate, relay it to the other peer
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({ type: "ice-candidate", candidate: event.candidate });
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  // Wire up a data channel's event listeners (used by both sides)
  const setupDataChannel = (channel: RTCDataChannel) => {
    dataChannelRef.current = channel;

    // Receive file chunks as ArrayBuffers (not binary strings) so we can
    // easily combine them into a Blob at the end.
    channel.binaryType = "arraybuffer";

    // When the channel opens, the direct P2P link is ready
    channel.onopen = () => {
      setDataChannelOpen(true);
      setStatusMessage("P2P connection established!");
    };

    // Handle everything that arrives through the channel:
    // - strings: file control messages (file-meta / file-end) or chat text
    // - ArrayBuffer: one chunk of an incoming file
    channel.onmessage = (event) => {
      if (typeof event.data === "string") {
        const text = event.data as string;

        // File control messages are JSON, so they start with "{"
        if (text.startsWith("{")) {
          try {
            const parsed = JSON.parse(text);

            // "file-meta": a new file is starting. Remember its details and
            // reset the buffer we use to collect its chunks.
            if (parsed.type === "file-meta") {
              incomingMetaRef.current = {
                name: parsed.name as string,
                size: parsed.size as number,
                mime: parsed.mime as string,
              };
              // Warn (but still attempt) for very large incoming files.
              // ~2GB is roughly where in-memory Blob assembly becomes
              // unreliable in a browser tab.
              setLargeFileWarning(
                (parsed.size as number) > 2 * 1024 * 1024 * 1024,
              );
              incomingChunksRef.current = [];
              incomingBytesRef.current = 0;
              receivedChunksRef.current = 0;
              // Reset the live speed tracker for the new transfer
              receiveSpeedRef.current = { lastUpdate: 0, lastBytes: 0 };
              setReceiveSpeedText("");
              setIncomingFile(null);
              setReceiveProgress(0);
              return;
            }

            // "file-end": every chunk arrived. Combine them into a Blob and
            // give the user a download link.
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
              // Transfer finished: clear the live speed/warning text
              setReceiveSpeedText("");
              setLargeFileWarning(false);
              return;
            }
          } catch {
            // Not valid JSON, so fall through and show it as a chat message
          }
        }

        // Plain text that isn't a file control message = a chat message
        setMessages((prev) => [...prev, text]);
      } else {
        // ArrayBuffer: save this chunk of the file currently being received
        const chunk = event.data as ArrayBuffer;
        if (incomingMetaRef.current) {
          incomingChunksRef.current.push(chunk);
          incomingBytesRef.current += chunk.byteLength;
          receivedChunksRef.current++;

          // Refresh the live speed text about once per second, not every
          // chunk, so we don't re-render the whole UI for a big file.
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

          // Update the progress bar only every 10 chunks (not every chunk)
          // to avoid re-rendering too often while receiving a large file.
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

  // Offer side (the "Send" side): create the channel and send the SDP offer
  const startOffer = async () => {
    const pc = setupPeerConnection();

    // The offer creator always initiates the data channel
    const channel = pc.createDataChannel("webdrop");
    setupDataChannel(channel);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal({ type: "offer", sdp: pc.localDescription });
    } catch (err) {
      console.error("Error creating the offer", err);
    }
  };

  // Answer side (the "Receive" side): wait for the incoming data channel
  const startAnswer = () => {
    const pc = setupPeerConnection();
    pc.ondatachannel = (event) => {
      setupDataChannel(event.channel);
    };
  };

  // Handle one signaling message from the other peer
  // (offer / answer / ice-candidate - the WebRTC handshake steps)
  const handleSignal = async (data: SignalMessage) => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    try {
      if (data.type === "offer") {
        // Answer side: save the offer, then send back an answer
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({ type: "answer", sdp: pc.localDescription });
      } else if (data.type === "answer") {
        // Offer side: save the answer to finish the handshake
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      } else if (data.type === "ice-candidate") {
        // Both sides: add the remote ICE candidate
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

  // Runs when we know the other peer is in the room.
  // (This used to be the "peer-joined" socket event handler. Now the creator
  // gets a { type: "peer-joined" } message from polling, and the joiner calls
  // this directly after a successful join-room request.)
  const onPeerJoined = () => {
    // Start the WebRTC handshake only once (clicking Connect twice should
    // not create a second peer connection)
    if (peerConnectionRef.current) return;

    setScreen("connected");
    // Show a different message depending on which side we are
    setStatusMessage(
      flowRef.current === "receiving"
        ? "Connected! (paired with sender)"
        : "Connected! (peer joined)",
    );

    if (flowRef.current === "sending") {
      // The "Send" side creates and sends the offer
      startOffer();
    } else {
      // The "Receive" side waits for the incoming data channel
      startAnswer();
    }
  };

  // Ask the server once for every message waiting in our queue and process
  // them one by one. (This replaces the old "signal" socket event handler.)
  const pollOnce = async () => {
    const code = codeRef.current;
    if (!code) return;

    try {
      const res = await fetch(
        `/api/signal?code=${encodeURIComponent(code)}&role=${myRole()}`,
      );
      if (!res.ok) return; // e.g. bad request - just try again on the next tick

      const json = (await res.json()) as { messages?: unknown[] };

      for (const raw of json.messages ?? []) {
        // Every queued message is an object with a "type" field
        if (!raw || typeof raw !== "object" || !("type" in raw)) continue;
        const data = raw as { type: string };

        if (data.type === "peer-joined") {
          // The creator learns this way that the joiner arrived
          onPeerJoined();
        } else {
          // offer / answer / ice-candidate - same handling as before
          await handleSignal(raw as SignalMessage);
        }
      }
    } catch (err) {
      console.error("Error while polling for signaling messages", err);
    }
  };

  // Start asking the server for new signaling messages every 1.2 seconds
  const startPolling = () => {
    stopPolling(); // never run two polling loops at the same time
    pollRef.current = setInterval(() => {
      void pollOnce();
    }, POLL_INTERVAL_MS);
  };

  // Stop polling and close the WebRTC resources when the page unmounts,
  // so we never leave a timer or a connection running behind us.
  useEffect(() => {
    return () => {
      stopPolling();
      dataChannelRef.current?.close();
      peerConnectionRef.current?.close();
    };
  }, [stopPolling]);

  // Sender: ask the server to create a room, show the code, and start polling
  const handleSend = async () => {
    flowRef.current = "sending";

    try {
      const res = await fetch("/api/create-room", { method: "POST" });
      if (!res.ok)
        throw new Error(`create-room failed with status ${res.status}`);
      const json = (await res.json()) as { code: string };

      // Remember the code (needed for every signal we send) and show it
      codeRef.current = json.code;
      setCode(json.code);
      setScreen("sending");

      // Generate the QR image that encodes the 4-digit code as text
      const dataUrl = await QRCode.toDataURL(json.code);
      setQrDataUrl(dataUrl);

      setStatusMessage("Waiting for the other device to connect...");

      // Start listening for the joiner and for WebRTC messages
      startPolling();
    } catch (err) {
      console.error("Error creating a room", err);
    }
  };

  // Receiver: join the room with the typed code, then start polling
  const handleConnect = async () => {
    if (inputCode.trim().length === 0) {
      setErrorMessage("Please enter the 4-digit code.");
      return;
    }
    flowRef.current = "receiving";
    codeRef.current = inputCode.trim(); // remember the code so we can send signals

    try {
      const res = await fetch("/api/join-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: inputCode.trim() }),
      });

      if (!res.ok) {
        // The API returns 404 when the code matches no active room
        setErrorMessage("Code not found, please check and try again.");
        return;
      }

      setErrorMessage("");
      // A successful join already tells US that we are in, so treat it as our
      // own "peer-joined" to kick off the WebRTC answer flow right away.
      // (The creator finds out separately by polling their own queue.)
      startPolling();
      onPeerJoined();
    } catch (err) {
      console.error("Error joining the room", err);
      setErrorMessage("Something went wrong, please try again.");
    }
  };

  // Send a text message through the data channel for testing
  const handleSendMessage = () => {
    // Only send if the direct channel is actually open
    if (dataChannelRef.current?.readyState === "open" && messageInput.trim()) {
      dataChannelRef.current.send(messageInput);
      setMessageInput("");
    }
  };

  // Send a file over the data channel. Files are too big to send in one go,
  // so we break them into 64KB chunks and send them one at a time.
  // This is the trickiest part, so read the comments carefully:
  // 1. Send metadata describing the file.
  // 2. Read + send 64KB slices until the whole file is sent.
  // 3. Send a "file-end" marker so the receiver knows it's complete.
  //
  // BACKPRESSURE: the browser queues each channel.send() into an internal
  // buffer. If we send faster than the data channel can flush it, that buffer
  // grows unbounded and can crash the tab on a large file. To prevent that,
  // we check channel.bufferedAmount (bytes currently queued) before every
  // send and *pause* until it drops below 1MB. We get woken up when it falls
  // below the 512KB "low threshold" using the bufferedamountlow event - this
  // is called "backpressure" (the channel pushes back when it's full).
  const handleFileSend = async (file: File | undefined) => {
    if (!file) return;
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== "open") return;

    // Remember what we're sending so the progress bar can show it
    setSendingFileName(file.name);
    setSendProgress(0);
    setSendSpeedText("");

    // Tell the channel: fire "bufferedamountlow" once the queued bytes drop
    // below this. We wait on that event whenever the buffer gets too full.
    channel.bufferedAmountLowThreshold = 512 * 1024; // 512KB

    // 1. Tell the other side about the file before sending any data
    channel.send(
      JSON.stringify({
        type: "file-meta",
        name: file.name,
        size: file.size,
        mime: file.type,
      }),
    );

    // 2. Read and send the file in 64KB slices
    const CHUNK_SIZE = 64 * 1024; // 64KB chunks balance throughput and size
    let offset = 0; // how many bytes we have read so far
    let chunksSent = 0; // used to update the progress bar less often

    // Resolve once the channel's queue drains below 1MB (backpressure).
    const waitForDrain = (): Promise<void> => {
      // If the buffer is already small enough, send the next chunk right away
      if (channel.bufferedAmount < 1024 * 1024) return Promise.resolve();
      // Otherwise pause and wait until the browser reports the buffer is low
      return new Promise((resolve) => {
        channel.onbufferedamountlow = () => resolve();
      });
    };

    const sendNextChunk = async () => {
      // Once we've read the whole file we're done
      if (offset >= file.size) {
        // 3. Let the receiver know there is no more data coming
        channel.send(JSON.stringify({ type: "file-end" }));
        setSendProgress(100);
        setSendSpeedText("");
        return;
      }

      await waitForDrain(); // pause if the channel's queue is too full

      // Take the next 64KB slice of the file
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      const reader = new FileReader();

      reader.onload = () => {
        // Send this chunk as an ArrayBuffer, then read the next one
        channel.send(reader.result as ArrayBuffer);
        offset += slice.size;
        chunksSent++;

        // Refresh the live speed text about once per second, not every chunk
        const now = Date.now();
        if (now - sendSpeedRef.current.lastUpdate >= 1000) {
          const dtSec = (now - sendSpeedRef.current.lastUpdate) / 1000;
          const speed = (offset - sendSpeedRef.current.lastBytes) / dtSec;
          sendSpeedRef.current.lastBytes = offset;
          sendSpeedRef.current.lastUpdate = now;
          setSendSpeedText(formatSpeedEta(speed, file.size - offset));
        }

        // Refresh the progress bar only every 10 chunks (not every chunk)
        // to avoid re-rendering too often for a large file.
        if (chunksSent % 10 === 0) {
          setSendProgress(
            Math.min(100, Math.floor((offset / file.size) * 100)),
          );
        }

        sendNextChunk();
      };

      // Start reading this slice as an ArrayBuffer
      reader.readAsArrayBuffer(slice);
    };

    // Kick off the loop that sends every chunk
    sendNextChunk();
  };

  // The hidden file input changed -> send the file that was picked
  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFileSend(e.target.files?.[0]);
    e.target.value = ""; // allow picking the same file again later
  };

  // A file was dragged and dropped onto the drop zone
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSend(e.dataTransfer.files[0]);
  };

  // Reset everything and go back to the start screen
  const handleReset = () => {
    stopPolling(); // stop asking the server for new messages
    codeRef.current = "";
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
    // Clear any partially-received file data
    incomingMetaRef.current = null;
    incomingChunksRef.current = [];
    incomingBytesRef.current = 0;
    receivedChunksRef.current = 0;
    // Tear down the WebRTC connection and channel
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-6 font-sans dark:bg-black">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg dark:bg-zinc-900">
        {/* Heading, always visible */}
        <h1 className="mb-6 text-center text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          WebDrop
        </h1>

        {/* START screen: choose to send or receive */}
        {screen === "start" && (
          <div className="flex flex-col gap-4">
            <button
              onClick={handleSend}
              className="w-full rounded-lg bg-indigo-600 py-3 text-lg font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              Send
            </button>
            <button
              onClick={() => setScreen("receiving")}
              className="w-full rounded-lg border border-zinc-300 bg-white py-3 text-lg font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              Receive
            </button>
          </div>
        )}

        {/* SENDING screen: show the code, QR code, and status */}
        {screen === "sending" && (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Share this code with the other device:
            </p>
            {/* The 4-digit code shown large */}
            <div className="text-6xl font-bold tracking-widest text-zinc-900 dark:text-zinc-50">
              {code}
            </div>
            {/* The QR image of the code */}
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt="QR code"
                className="h-48 w-48 rounded-lg border border-zinc-200 dark:border-zinc-700"
              />
            )}
            {/* Current status message */}
            <p className="mt-2 text-base text-zinc-600 dark:text-zinc-400">
              {statusMessage}
            </p>
          </div>
        )}

        {/* RECEIVING screen: type a code and connect */}
        {screen === "receiving" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Enter the 4-digit code shown on the sender&apos;s device:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="3841"
                className="w-full flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-center text-2xl font-semibold tracking-widest text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
              />
              <button
                onClick={handleConnect}
                className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-indigo-700"
              >
                Connect
              </button>
            </div>
            {/* Show an error if the code was not found */}
            {errorMessage && (
              <p className="text-center text-sm text-red-600 dark:text-red-400">
                {errorMessage}
              </p>
            )}
          </div>
        )}

        {/* CONNECTED screen: success + messenger + file transfer + reset */}
        {screen === "connected" && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-3xl dark:bg-green-900">
              ✓
            </div>
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {statusMessage}
            </p>
            {/* Test messenger: appears once the P2P data channel is open */}
            {dataChannelOpen && (
              <div className="flex w-full flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-700">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSendMessage();
                    }}
                    placeholder="Type a message"
                    className="w-full flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                  />
                  <button
                    onClick={handleSendMessage}
                    className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-indigo-700"
                  >
                    Send Message
                  </button>
                </div>
                {/* Show messages received from the other peer */}
                {messages.length > 0 && (
                  <ul className="flex flex-col gap-2 text-left text-sm text-zinc-700 dark:text-zinc-300">
                    {messages.map((msg, i) => (
                      <li
                        key={i}
                        className="break-words rounded-lg bg-zinc-100 px-3 py-2 dark:bg-zinc-800"
                      >
                        {msg}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* File transfer section: appears once the P2P data channel is open */}
            {dataChannelOpen && (
              <div className="flex w-full flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-700">
                {/* Drag-and-drop zone. Clicking it opens the hidden file picker.
                    We use a <label> so that clicking the box triggers the input. */}
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`flex min-h-[90px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 text-center text-sm transition-colors ${
                    isDragging
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30"
                      : "border-zinc-300 hover:border-indigo-400 dark:border-zinc-600"
                  }`}
                >
                  <span className="text-zinc-500 dark:text-zinc-400">
                    Drag &amp; drop a file here, or click to select
                  </span>
                  {/* Hidden file input, opened when the drop zone is clicked */}
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleFileInputChange}
                  />
                </label>

                {/* Progress bar while sending a file */}
                {sendingFileName && (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Sending {sendingFileName}: {sendProgress}%
                    </p>
                    {sendSpeedText && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {sendSpeedText}
                      </p>
                    )}
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                      <div
                        className="h-2 rounded-full bg-indigo-600 transition-all"
                        style={{ width: `${sendProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Progress bar while receiving a file */}
                {receiveProgress > 0 && receiveProgress < 100 && (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Receiving file: {receiveProgress}%
                    </p>
                    {largeFileWarning && (
                      <p className="text-xs text-amber-600">
                        Files over 2GB may not work reliably in this version
                      </p>
                    )}
                    {receiveSpeedText && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {receiveSpeedText}
                      </p>
                    )}
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                      <div
                        className="h-2 rounded-full bg-green-600 transition-all"
                        style={{ width: `${receiveProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Download link once a file is fully received */}
                {incomingFile && (
                  <a
                    href={incomingFile.url}
                    download={incomingFile.name}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700"
                  >
                    Download {incomingFile.name}
                  </a>
                )}
              </div>
            )}
            <button
              onClick={handleReset}
              className="w-full rounded-lg border border-zinc-300 bg-white py-3 font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              Start over
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
