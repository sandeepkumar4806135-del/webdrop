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

  // SELF-DESTRUCT: after a transfer completes, the session closes itself after
  // an inactivity countdown so leftover files/messages don't linger on screen.
  // - countdown: remaining seconds to live (0 = not running / cancelled)
  // - countdownRef: the live setInterval id so we can stop it any time
  // The countdown is (re)started after each file transfer finishes, and reset
  // back to 30s if anything new happens before it hits zero.
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const COUNTDOWN_SECONDS = 30;
  // Tracks whether at least one transfer has finished. We only ever start the
  // self-destruct timer AFTER the first transfer completes (not on plain chat
  // messages), so the session doesn't auto-close before anything happened.
  const transferCompletedRef = useRef(false);

  // Helper: start (or restart) the inactivity countdown.
  // Called after a transfer completes and again whenever the peers talk.
  // Declared as a plain function (not useCallback) on purpose: it references
  // handleReset, which is defined later in this component. As a callback body it
  // only reads handleReset at call time (after render), so there's no stale
  // closure or temporal-dead-zone problem, and no hook-dependency lint issue.
  const startSelfDestruct = () => {
    // Stop any existing timer first so we never stack multiple countdowns
    if (countdownRef.current !== null) {
      clearInterval(countdownRef.current);
    }
    setCountdown(COUNTDOWN_SECONDS);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Time's up: clean up the connection and go back to the start screen
          // (same effect as the user clicking "Start over" themselves).
          clearInterval(countdownRef.current as unknown as number);
          countdownRef.current = null;
          handleReset();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Helper: stop the countdown, e.g. if the user clicks "Cancel" or does
  // anything that would make closing the session pointless.
  const cancelSelfDestruct = () => {
    if (countdownRef.current !== null) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(0);
  };

  // If the timer is already running and a transfer has finished, "activity"
  // (a new message chunk, a chat message, a new file) resets the 30s window
  // so the session only closes after real inactivity.
  const resetSelfDestructIfRunning = () => {
    if (transferCompletedRef.current && countdownRef.current !== null) {
      startSelfDestruct();
    }
  };

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
      // Any incoming message counts as "activity": if the self-destruct timer
      // is already running, give the session another 30s before it closes.
      resetSelfDestructIfRunning();
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
              // A transfer just finished: arm the self-destruct countdown
              transferCompletedRef.current = true;
              startSelfDestruct();
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
      // SELF-DESTRUCT: make sure the countdown timer doesn't outlive the
      // component (e.g. user closes the tab mid-countdown).
      if (countdownRef.current !== null) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
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
        // A transfer just finished: arm the self-destruct countdown
        // (same as the receiver does when it gets the file-end).
        transferCompletedRef.current = true;
        startSelfDestruct();
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
    // SELF-DESTRUCT: clear the inactivity countdown too, so a manual
    // "Start over" never leaves a timer running in the background.
    if (countdownRef.current !== null) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(0);
    transferCompletedRef.current = false;
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0A0E1A] p-6">
      <div className="w-full max-w-md rounded-xl border border-[#232B45] bg-[#12172A] p-8 shadow-2xl">
        {/* Heading, always visible */}
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <svg
            width="28"
            height="28"
            viewBox="0 0 28 28"
            fill="none"
            className="shrink-0"
            aria-hidden="true"
          >
            <path
              d="M6 14a8 8 0 0 1 16 0"
              stroke="#5B8DEF"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M10 14a4 4 0 0 1 8 0"
              stroke="#5B8DEF"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <circle cx="14" cy="14" r="2" fill="#5B8DEF" />
          </svg>
          <h1 className="font-[family-name:var(--font-space-grotesk)] text-2xl font-bold tracking-tight text-[#E8ECF5]">
            WebDrop
          </h1>
        </div>

        {/* START screen: choose to send or receive */}
        {screen === "start" && (
          <div className="flex flex-col gap-4">
            <button
              onClick={handleSend}
              className="w-full rounded-lg bg-[#5B8DEF] py-3 text-lg font-semibold text-white transition-colors hover:bg-[#4A7DE0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B8DEF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12172A]"
            >
              Send
            </button>
            <button
              onClick={() => setScreen("receiving")}
              className="w-full rounded-lg border border-[#232B45] bg-transparent py-3 text-lg font-semibold text-[#E8ECF5] transition-colors hover:bg-[#1A2040] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B8DEF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12172A]"
            >
              Receive
            </button>
          </div>
        )}

        {/* SENDING screen: show the code, QR code, and status */}
        {screen === "sending" && (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-[#8B93A7]">
              Share this code with the other device:
            </p>
            {/* The 4-digit code shown large — Space Grotesk, boldest element */}
            <div
              className={`text-6xl font-bold tracking-widest text-[#E8ECF5] ${dataChannelOpen ? "" : "pulse-glow rounded-xl"}`}
              style={{ fontFamily: 'var(--font-space-grotesk)', padding: '0.25rem 0.5rem' }}
            >
              {code}
            </div>
            {/* The QR image of the code */}
            {qrDataUrl && (
              <div className={`rounded-xl border border-[#232B45] bg-[#0A0E1A] p-4 ${dataChannelOpen ? "" : "pulse-glow"}`}>
                <img
                  src={qrDataUrl}
                  alt="QR code"
                  className="h-48 w-48 rounded-lg"
                />
              </div>
            )}
            {/* Current status message — mint green once connected */}
            <p className={`mt-2 text-base font-medium ${dataChannelOpen ? "text-[#34D399]" : "text-[#8B93A7]"}`}>
              {statusMessage}
            </p>
          </div>
        )}

        {/* RECEIVING screen: type a code and connect */}
        {screen === "receiving" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[#8B93A7]">
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
                className="w-full flex-1 rounded-lg border border-[#232B45] bg-[#0A0E1A] px-4 py-3 text-center font-[family-name:var(--font-space-grotesk)] text-2xl font-semibold tracking-widest text-[#E8ECF5] outline-none placeholder:text-[#8B93A7]/50 focus:ring-2 focus:ring-[#5B8DEF]"
              />
              <button
                onClick={handleConnect}
                className="rounded-lg bg-[#5B8DEF] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#4A7DE0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B8DEF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12172A]"
              >
                Connect
              </button>
            </div>
            {/* Show an error if the code was not found */}
            {errorMessage && (
              <p className="text-center text-sm text-red-400">
                {errorMessage}
              </p>
            )}
          </div>
        )}

        {/* CONNECTED screen: success + messenger + file transfer + reset */}
        {screen === "connected" && (
          <div className="flex flex-col items-center gap-4 text-center">
            {/* Success indicator — mint green accent */}
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#34D399]/10 ring-2 ring-[#34D399]/30">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 12.5l5 5L20 7"
                  stroke="#34D399"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="text-lg font-semibold text-[#E8ECF5]">
              {statusMessage}
            </p>
            {/* Test messenger: appears once the P2P data channel is open */}
            {dataChannelOpen && (
              <div className="flex w-full flex-col gap-3 border-t border-[#232B45] pt-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSendMessage();
                    }}
                    placeholder="Type a message"
                    className="w-full flex-1 rounded-lg border border-[#232B45] bg-[#0A0E1A] px-3 py-2 text-[#E8ECF5] outline-none placeholder:text-[#8B93A7]/50 focus:ring-2 focus:ring-[#5B8DEF]"
                  />
                  <button
                    onClick={handleSendMessage}
                    className="rounded-lg bg-[#5B8DEF] px-4 py-2 font-semibold text-white transition-colors hover:bg-[#4A7DE0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B8DEF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12172A]"
                  >
                    Send Message
                  </button>
                </div>
                {/* Show messages received from the other peer */}
                {messages.length > 0 && (
                  <ul className="flex flex-col gap-2 text-left text-sm text-[#8B93A7]">
                    {messages.map((msg, i) => (
                      <li
                        key={i}
                        className="break-words rounded-lg bg-[#0A0E1A] px-3 py-2 text-[#E8ECF5]"
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
              <div className="flex w-full flex-col gap-3 border-t border-[#232B45] pt-4">
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
                      ? "border-[#5B8DEF] bg-[#5B8DEF]/10"
                      : "border-[#232B45] hover:border-[#5B8DEF]/50"
                  }`}
                >
                  <span className="text-[#8B93A7]">
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
                    <div className="flex items-baseline justify-between">
                      <p className="text-xs text-[#8B93A7]">
                        Sending {sendingFileName}
                      </p>
                      <p className="text-xs font-medium text-[#E8ECF5]">
                        {sendProgress}%
                      </p>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#232B45]">
                      <div
                        className="h-2 rounded-full bg-[#5B8DEF] transition-all"
                        style={{ width: `${sendProgress}%` }}
                      />
                    </div>
                    {sendSpeedText && (
                      <p className="text-xs text-[#8B93A7]">{sendSpeedText}</p>
                    )}
                  </div>
                )}

                {/* Progress bar while receiving a file */}
                {receiveProgress > 0 && receiveProgress < 100 && (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between">
                      <p className="text-xs text-[#8B93A7]">Receiving file</p>
                      <p className="text-xs font-medium text-[#E8ECF5]">
                        {receiveProgress}%
                      </p>
                    </div>
                    {largeFileWarning && (
                      <p className="text-xs text-amber-400">
                        Files over 2GB may not work reliably in this version
                      </p>
                    )}
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#232B45]">
                      <div
                        className="h-2 rounded-full bg-[#5B8DEF] transition-all"
                        style={{ width: `${receiveProgress}%` }}
                      />
                    </div>
                    {receiveSpeedText && (
                      <p className="text-xs text-[#8B93A7]">{receiveSpeedText}</p>
                    )}
                  </div>
                )}

                {/* Download link once a file is fully received */}
                {incomingFile && (
                  <a
                    href={incomingFile.url}
                    download={incomingFile.name}
                    className="rounded-lg bg-[#34D399] px-4 py-2 text-sm font-semibold text-[#0A0E1A] transition-colors hover:bg-[#2BC08A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34D399] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12172A]"
                  >
                    Download {incomingFile.name}
                  </a>
                )}
              </div>
            )}
            {/* SELF-DESTRUCT: after a transfer completes the session closes
                itself after 30s of inactivity. The Cancel link stops it, and
                any new message/file resets the 30s window. */}
            {countdown > 0 && (
              <p className="flex items-center justify-between rounded-lg border border-[#232B45] bg-[#0A0E1A] px-3 py-2 text-xs text-[#8B93A7]">
                <span>
                  This session will close automatically in {countdown}s for
                  privacy.
                </span>
                <button
                  onClick={cancelSelfDestruct}
                  className="font-semibold text-[#5B8DEF] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B8DEF]"
                >
                  Cancel
                </button>
              </p>
            )}
            <button
              onClick={handleReset}
              className="w-full rounded-lg border border-[#232B45] bg-transparent py-3 font-semibold text-[#8B93A7] transition-colors hover:bg-[#1A2040] hover:text-[#E8ECF5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B8DEF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12172A]"
            >
              Start over
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
