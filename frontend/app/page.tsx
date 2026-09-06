"use client";

import { useState, useEffect, useRef, type ChangeEvent, type DragEvent } from "react";
import { io, type Socket } from "socket.io-client";
import QRCode from "qrcode";

// The different screens this page can show
type Screen = "start" | "sending" | "receiving" | "connected";

// The shapes of messages relayed through the "signal" socket event
type SignalMessage =
  | { type: "offer" | "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice-candidate"; candidate: RTCIceCandidateInit };

// Metadata describing a file being transferred over the data channel
type IncomingFileMeta = { name: string; size: number; mime: string };

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
  // Name of the file currently being sent (shown in the progress bar)
  const [sendingFileName, setSendingFileName] = useState("");
  // Completed incoming file (name + object URL) once fully received
  const [incomingFile, setIncomingFile] = useState<{
    name: string;
    url: string;
  } | null>(null);
  // Whether the user is currently dragging a file over the drop zone
  const [isDragging, setIsDragging] = useState(false);

  // Keep a reference to the socket so the button handlers can use it,
  // and a reference to which flow (send or receive) is active. Refs let us
  // read the latest value even inside socket event handlers that are set up once.
  const socketRef = useRef<Socket | null>(null);
  const flowRef = useRef<"sending" | "receiving">("sending");

  // Refs for the WebRTC peer connection and data channel.
  // Storing them in refs lets them survive across re-renders.
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  // The 4-digit code for our current room (needed to send signals)
  const codeRef = useRef("");

  // Refs for an incoming file. They must survive across multiple onmessage
  // calls without causing a re-render on every single chunk.
  const incomingMetaRef = useRef<IncomingFileMeta | null>(null);
  const incomingChunksRef = useRef<ArrayBuffer[]>([]);
  const incomingBytesRef = useRef(0);
  const receivedChunksRef = useRef(0);

  // 2. Connect to the signaling server when the component loads.
  //    setScreen/set* are stable, so this effect only runs once.
  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000");
    socketRef.current = socket;

    // --- Sender flow ---
    // The server created a room with a 4-digit code.
    socket.on("room-created", async (newCode: string) => {
      codeRef.current = newCode; // remember the code so we can send signals
      setCode(newCode);
      setScreen("sending");

      // Generate the QR image that encodes the 4-digit code as text
      const dataUrl = await QRCode.toDataURL(newCode);
      setQrDataUrl(dataUrl);

      setStatusMessage("Waiting for the other device to connect...");
    });

    // ============================================================
    // WebRTC helpers: set up the direct peer-to-peer data connection
    // ============================================================

    // Send a small signaling message through the socket to the other peer
    const sendSignal = (data: unknown) => {
      socketRef.current?.emit("signal", {
        code: codeRef.current,
        data,
      });
    };

    // Create a fresh RTCPeerConnection using a free STUN server.
    // STUN helps the two browsers discover each other over the internet.
    const setupPeerConnection = () => {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
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
                incomingChunksRef.current = [];
                incomingBytesRef.current = 0;
                receivedChunksRef.current = 0;
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

            // Update the progress bar only every 10 chunks (not every chunk)
            // to avoid re-rendering too often while receiving a large file.
            if (receivedChunksRef.current % 10 === 0) {
              const total = incomingMetaRef.current.size;
              setReceiveProgress(
                Math.min(
                  100,
                  Math.floor((incomingBytesRef.current / total) * 100)
                )
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

    // Handle every "signal" event relayed through the socket
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

    // --- Both flows ---
    // A peer joined our room, so we are now connected.
    socket.on("peer-joined", () => {
      setScreen("connected");
      // Show a different message depending on which side we are
      setStatusMessage(
        flowRef.current === "receiving"
          ? "Connected! (paired with sender)"
          : "Connected! (peer joined)"
      );

      // Start the WebRTC handshake now that both peers are present
      if (flowRef.current === "sending") {
        // The "Send" side creates and sends the offer
        startOffer();
      } else {
        // The "Receive" side waits for the incoming data channel
        startAnswer();
      }
    });

    // Relay WebRTC signaling (offer / answer / ice-candidate)
    socket.on("signal", handleSignal);

    // --- Receiver flow ---
    // The code we typed does not match any active room.
    socket.on("room-not-found", () => {
      setErrorMessage("Code not found, please check and try again.");
    });

    // Clean up the connection when the component unmounts
    return () => {
      socket.disconnect();
      socketRef.current = null;
      // Close the WebRTC resources too
      dataChannelRef.current?.close();
      peerConnectionRef.current?.close();
    };
  }, []);

// 4. Sender: ask the server to create a new room
  const handleSend = () => {
    flowRef.current = "sending";
    socketRef.current?.emit("create-room");
  };

  // 5. Receiver: join the room with the typed code
  const handleConnect = () => {
    if (inputCode.trim().length === 0) {
      setErrorMessage("Please enter the 4-digit code.");
      return;
    }
    flowRef.current = "receiving";
    codeRef.current = inputCode.trim(); // remember the code so we can send signals
    setErrorMessage("");
    socketRef.current?.emit("join-room", inputCode.trim());
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
  // so we break them into 16KB chunks and send them one at a time.
  // This is the trickiest part, so read the comments carefully:
  // 1. Send metadata describing the file.
  // 2. Read + send 16KB slices until the whole file is sent.
  // 3. Send a "file-end" marker so the receiver knows it's complete.
  const handleFileSend = (file: File | undefined) => {
    if (!file) return;
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== "open") return;

    // Remember what we're sending so the progress bar can show it
    setSendingFileName(file.name);
    setSendProgress(0);

    // 1. Tell the other side about the file before sending any data
    channel.send(
      JSON.stringify({
        type: "file-meta",
        name: file.name,
        size: file.size,
        mime: file.type,
      })
    );

    // 2. Read and send the file in 16KB slices
    const CHUNK_SIZE = 16 * 1024; // 16 kilobytes
    let offset = 0; // how many bytes we have read so far
    let chunksSent = 0; // used to update the progress bar less often

    const sendNextChunk = () => {
      // Once we've passed the end of the file, we're done
      if (offset >= file.size) {
        // 3. Let the receiver know there is no more data coming
        channel.send(JSON.stringify({ type: "file-end" }));
        setSendProgress(100);
        return;
      }

      // Take the next 16KB slice of the file
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      const reader = new FileReader();

      reader.onload = () => {
        // Send this chunk as an ArrayBuffer, then read the next one
        channel.send(reader.result as ArrayBuffer);
        offset += slice.size;
        chunksSent++;

        // Refresh the progress bar only every 10 chunks (not every chunk)
        // to avoid re-rendering too often for a large file.
        if (chunksSent % 10 === 0) {
          setSendProgress(
            Math.min(100, Math.floor((offset / file.size) * 100))
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
{/* CONNECTED screen: show success + a reset button */}
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