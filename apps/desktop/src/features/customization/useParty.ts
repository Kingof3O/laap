import { relayUrl as endpoint } from "./communityEndpoint";
import { useEffect, useRef, useState } from "react";
import { invokeTauri } from "../../lib/api";
import { mods, type PackageManifest } from "./api";

type Request =
  | { type: "create" }
  | { type: "join"; invite: string }
  | { type: "resume"; room: string; token: string }
  | { type: "leave" }
  | { type: "rotate" }
  | { type: "chatConsent"; enabled: boolean }
  | { type: "chat"; text: string }
  | { type: "kick"; memberId: string }
  | { type: "select"; skinId: number | null }
  | { type: "announceMods"; modHashes: string[] }
  | { type: "transferRequest"; targetMemberId: string; modHash: string }
  | {
      type: "transferAccept";
      transferId: string;
      manifest: PackageManifest;
      bytes: number;
    }
  | {
      type: "transferChunk";
      transferId: string;
      chunkIndex: number;
      dataBase64: string;
    }
  | { type: "transferComplete"; transferId: string }
  | { type: "transferCancel"; transferId: string };

export type Member = {
  id: string;
  connected: boolean;
  selection: number | null;
  modHashes?: string[];
};
type Snapshot = {
  type: "snapshot";
  room: string;
  self: string;
  owner: string;
  invite: string;
  seq: number;
  expiresAt: number;
  members: Member[];
};
export type PartyMessage = {
  type: "chat";
  id: string;
  room: string;
  memberId: string;
  text: string;
  sentAt: number;
  seq: number;
};
type Event =
  | PartyMessage
  | Snapshot
  | { type: "membership"; room: string; token: string }
  | { type: "error"; message: string }
  | { type: "expired" }
  | { type: "left" }
  | {
      type: "transferRequest";
      transferId: string;
      fromMemberId: string;
      modHash: string;
    }
  | {
      type: "transferPending";
      transferId: string;
      fromMemberId: string;
      modHash: string;
    }
  | {
      type: "transferAccept";
      transferId: string;
      fromMemberId: string;
      modHash: string;
      manifest: PackageManifest;
      bytes: number;
      totalChunks: number;
    }
  | {
      type: "transferChunk";
      transferId: string;
      fromMemberId: string;
      modHash: string;
      chunkIndex: number;
      dataBase64: string;
    }
  | {
      type: "transferComplete";
      transferId: string;
      fromMemberId: string;
      modHash: string;
    }
  | {
      type: "transferCancel";
      transferId: string;
      fromMemberId: string;
      modHash: string;
      reason: string;
    };
export interface TransferProgress {
  modHash: string;
  progress: number;
  status: string;
}
interface IncomingTransfer {
  modHash: string;
  fromMemberId: string;
  manifest: PackageManifest;
  bytes: number;
  totalChunks: number;
  chunks: Map<number, string>;
}

export function useParty(onModImported?: (modHash: string) => void) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [state, setState] = useState<
    "idle" | "connecting" | "online" | "reconnecting" | "offline"
  >("idle");
  const [error, setError] = useState("");
  const [chatEnabled, setChatEnabled] = useState(false);
  const [messages, setMessages] = useState<PartyMessage[]>([]);
  const [transferProgress, setTransferProgress] =
    useState<TransferProgress | null>(null);

  const chatConsent = useRef(false);
  const socket = useRef<WebSocket | null>(null);
  const membership = useRef<{ room: string; token: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempt = useRef(0);
  const incomingTransfers = useRef<Map<string, IncomingTransfer>>(new Map());
  const requested = useRef(new Map<string, { member: string; hash: string }>());
  const requestedHashes = useRef(new Set<string>());
  const outgoing = useRef(new Map<string, AbortController>());
  const [pendingApproval, setPendingApproval] = useState<{
    transferId: string;
    fromMemberId: string;
    modHash: string;
  } | null>(null);
  const onModImportedRef = useRef(onModImported);
  onModImportedRef.current = onModImported;

  function stop() {
    if (timer.current) clearTimeout(timer.current);
    if (timeout.current) clearTimeout(timeout.current);
    const current = socket.current;
    socket.current = null;
    membership.current = null;
    attempt.current = 0;
    chatConsent.current = false;
    incomingTransfers.current.clear();
    requested.current.clear();
    requestedHashes.current.clear();
    for (const controller of outgoing.current.values()) controller.abort();
    outgoing.current.clear();
    setPendingApproval(null);
    if (current?.readyState === WebSocket.OPEN)
      current.send(JSON.stringify({ type: "leave" }));
    current?.close();
  }

  useEffect(() => () => stop(), []);

  function leave() {
    stop();
    setSnapshot(null);
    setMessages([]);
    setChatEnabled(false);
    setTransferProgress(null);
    setState("idle");
    setError("");
  }

  async function approveTransfer() {
    const request = pendingApproval;
    if (!request) return;
    setPendingApproval(null);
    const controller = new AbortController();
    outgoing.current.set(request.transferId, controller);
    try {
      const pkg = await mods.getPackageData(request.modHash);
      if (
        !pkg.manifest.rightToDistribute ||
        pkg.manifest.containsPaidRiotContent
      )
        throw Error("Redistribution is not permitted by this package license.");
      const bytes =
        Math.floor((pkg.archiveBase64.length * 3) / 4) -
        (pkg.archiveBase64.endsWith("==")
          ? 2
          : pkg.archiveBase64.endsWith("=")
            ? 1
            : 0);
      if (bytes > 12 * 1024 * 1024)
        throw Error("Relay package limit is 12 MiB.");
      send({
        type: "transferAccept",
        transferId: request.transferId,
        manifest: pkg.manifest,
        bytes,
      });
      for (let i = 0; i < Math.ceil(pkg.archiveBase64.length / 32768); i++) {
        if (
          controller.signal.aborted ||
          socket.current?.readyState !== WebSocket.OPEN
        )
          throw Error("Transfer interrupted");
        send({
          type: "transferChunk",
          transferId: request.transferId,
          chunkIndex: i,
          dataBase64: pkg.archiveBase64.slice(i * 32768, (i + 1) * 32768),
        });
        await new Promise((r) => setTimeout(r, 120));
      }
      send({ type: "transferComplete", transferId: request.transferId });
    } catch (e) {
      send({ type: "transferCancel", transferId: request.transferId });
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      outgoing.current.delete(request.transferId);
    }
  }
  async function handleCompleteReceivedTransfer(event: {
    transferId: string;
    fromMemberId: string;
    modHash: string;
  }) {
    const record = incomingTransfers.current.get(event.transferId);
    if (
      !record ||
      record.fromMemberId !== event.fromMemberId ||
      record.modHash !== event.modHash ||
      record.chunks.size !== record.totalChunks
    )
      return;
    incomingTransfers.current.delete(event.transferId);
    requested.current.delete(event.transferId);
    setTransferProgress({
      modHash: record.modHash,
      progress: 95,
      status: "Validating archive and importing into local library…",
    });
    try {
      const archive = Array.from(
        { length: record.totalChunks },
        (_, i) => record.chunks.get(i) ?? "",
      ).join("");
      const binary = atob(archive);
      if (binary.length !== record.bytes) throw Error("Transfer size mismatch");
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      if (hash !== record.modHash) throw Error("Transfer checksum mismatch");
      await invokeTauri("mod_import", {
        archive,
        manifest: record.manifest,
        rightsConfirmed: true,
      });
      setTransferProgress({
        modHash: record.modHash,
        progress: 100,
        status: "Verified and imported into the local library.",
      });
      onModImportedRef.current?.(record.modHash);
    } catch (e) {
      setTransferProgress({
        modHash: record.modHash,
        progress: 0,
        status:
          "Import failed: " + (e instanceof Error ? e.message : String(e)),
      });
    }
  }
  function cancelTransfers() {
    for (const id of new Set([
      ...requested.current.keys(),
      ...outgoing.current.keys(),
    ]))
      send({ type: "transferCancel", transferId: id });
    for (const c of outgoing.current.values()) c.abort();
    outgoing.current.clear();
    incomingTransfers.current.clear();
    requested.current.clear();
    requestedHashes.current.clear();
    setPendingApproval(null);
    setTransferProgress(null);
  }
  function open(request: Request) {
    if (!endpoint) return;
    setState(request.type === "resume" ? "reconnecting" : "connecting");
    setError("");
    let connection: WebSocket;
    try {
      connection = new WebSocket(endpoint);
    } catch {
      setState("offline");
      setError("Party relay connection was blocked.");
      return;
    }
    socket.current = connection;
    timeout.current = setTimeout(() => connection.close(), 8_000);
    connection.addEventListener("open", () => {
      if (socket.current === connection)
        connection.send(JSON.stringify(request));
    });
    connection.addEventListener("message", (message) => {
      if (
        socket.current !== connection ||
        typeof message.data !== "string" ||
        message.data.length > 256 * 1024
      )
        return;
      let event: Event;
      try {
        event = JSON.parse(message.data) as Event;
      } catch {
        return;
      }
      if (!event || typeof event !== "object") return;

      if (event.type === "membership") {
        membership.current = { room: event.room, token: event.token };
        attempt.current = 0;
        if (timeout.current) clearTimeout(timeout.current);
        setState("online");
        if (chatConsent.current)
          connection.send(
            JSON.stringify({ type: "chatConsent", enabled: true }),
          );
      } else if (
        event.type === "snapshot" &&
        event.room === membership.current?.room &&
        Array.isArray(event.members) &&
        event.members.length <= 8
      ) {
        setSnapshot((prior) =>
          prior?.room === event.room && prior.seq >= event.seq ? prior : event,
        );
      } else if (
        event.type === "chat" &&
        chatConsent.current &&
        event.room === membership.current?.room &&
        typeof event.id === "string" &&
        typeof event.memberId === "string" &&
        typeof event.text === "string" &&
        event.text.length <= 480 &&
        typeof event.sentAt === "number"
      ) {
        setMessages((prior) =>
          prior.some((item) => item.id === event.id)
            ? prior
            : [
                ...prior.filter(
                  (item) => Date.now() - item.sentAt < 5 * 60_000,
                ),
                event,
              ].slice(-20),
        );
      } else if (event.type === "transferRequest") {
        setPendingApproval((previous) => previous ?? event);
      } else if (event.type === "transferPending") {
        if (
          requestedHashes.current.delete(event.fromMemberId + event.modHash) &&
          /^[a-f0-9]{32}$/.test(event.transferId)
        )
          requested.current.set(event.transferId, {
            member: event.fromMemberId,
            hash: event.modHash,
          });
      } else if (event.type === "transferAccept") {
        const consent = requested.current.get(event.transferId);
        if (
          !consent ||
          consent.member !== event.fromMemberId ||
          consent.hash !== event.modHash ||
          incomingTransfers.current.size >= 2
        )
          return;
        if (
          !Number.isSafeInteger(event.bytes) ||
          event.bytes <= 0 ||
          event.bytes > 12 * 1024 * 1024 ||
          event.totalChunks !==
            Math.ceil((Math.ceil(event.bytes / 3) * 4) / 32768) ||
          !event.manifest ||
          event.manifest.sha256 !== event.modHash ||
          event.manifest.rightToDistribute !== true ||
          event.manifest.containsPaidRiotContent !== false
        ) {
          send({ type: "transferCancel", transferId: event.transferId });
          return;
        }
        incomingTransfers.current.set(event.transferId, {
          modHash: event.modHash,
          fromMemberId: event.fromMemberId,
          manifest: event.manifest,
          bytes: event.bytes,
          totalChunks: event.totalChunks,
          chunks: new Map(),
        });
        setTransferProgress({
          modHash: event.modHash,
          progress: 0,
          status: `Receiving ${event.manifest.displayName} · ${event.manifest.license}`,
        });
      } else if (event.type === "transferChunk") {
        const record = incomingTransfers.current.get(event.transferId);
        if (
          !record ||
          record.fromMemberId !== event.fromMemberId ||
          record.modHash !== event.modHash ||
          !Number.isSafeInteger(event.chunkIndex) ||
          event.chunkIndex < 0 ||
          event.chunkIndex >= record.totalChunks ||
          typeof event.dataBase64 !== "string" ||
          event.dataBase64.length > 32768
        )
          return;
        const expected =
          event.chunkIndex === record.totalChunks - 1
            ? Math.ceil(record.bytes / 3) * 4 - 32768 * (record.totalChunks - 1)
            : 32768;
        if (event.dataBase64.length !== expected) return;
        const old = record.chunks.get(event.chunkIndex);
        if (old && old !== event.dataBase64) {
          cancelTransfers();
          setError("Conflicting duplicate transfer chunk");
          return;
        }
        record.chunks.set(event.chunkIndex, event.dataBase64);
        setTransferProgress({
          modHash: event.modHash,
          progress: Math.floor((record.chunks.size / record.totalChunks) * 90),
          status: "Receiving package via community relay…",
        });
      } else if (event.type === "transferComplete") {
        void handleCompleteReceivedTransfer(event);
      } else if (event.type === "transferCancel") {
        incomingTransfers.current.delete(event.transferId);
        requested.current.delete(event.transferId);
        outgoing.current.get(event.transferId)?.abort();
        setTransferProgress({
          modHash: event.modHash,
          progress: 0,
          status: "Transfer cancelled: " + event.reason,
        });
      } else if (event.type === "expired") {
        leave();
        setError("The room expired. Create or join another room.");
      } else if (event.type === "error" && typeof event.message === "string") {
        setError(event.message);
        if (!membership.current) {
          stop();
          setState("idle");
        }
      }
    });
    connection.addEventListener("close", (event) => {
      if (socket.current !== connection) return;
      cancelTransfers();
      socket.current = null;
      if (timeout.current) clearTimeout(timeout.current);
      const current = membership.current;
      if (event.code === 4000 || event.code === 4001) {
        leave();
        setError("The room ended or this connection was replaced.");
      } else if (current && attempt.current < 5) {
        setState("reconnecting");
        const delay = Math.min(8_000, 500 * 2 ** attempt.current++);
        timer.current = setTimeout(
          () => open({ type: "resume", ...current }),
          delay,
        );
      } else {
        setState("offline");
        setError("Could not connect to the party relay.");
      }
    });
  }

  function send(request: Request) {
    if (socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(JSON.stringify(request));
  }

  return {
    configured: endpoint !== null,
    snapshot,
    state,
    error,
    leave,
    messages,
    chatEnabled,
    transferProgress,
    pendingApproval,
    approveTransfer,
    declineTransfer: () => {
      if (pendingApproval)
        send({
          type: "transferCancel",
          transferId: pendingApproval.transferId,
        });
      setPendingApproval(null);
    },
    cancelTransfers,
    setChatConsent: (enabled: boolean) => {
      chatConsent.current = enabled;
      setChatEnabled(enabled);
      if (!enabled) setMessages([]);
      send({ type: "chatConsent", enabled });
    },
    chat: (text: string) => send({ type: "chat", text }),
    kick: (memberId: string) => send({ type: "kick", memberId }),
    create: () => {
      leave();
      open({ type: "create" });
    },
    join: (invite: string) => {
      leave();
      open({ type: "join", invite });
    },
    retry: () => {
      if (!membership.current) return;
      attempt.current = 0;
      open({ type: "resume", ...membership.current });
    },
    select: (skinId: number | null) => send({ type: "select", skinId }),
    rotate: () => send({ type: "rotate" }),
    announceMods: (modHashes: string[]) =>
      send({ type: "announceMods", modHashes }),
    requestTransfer: (targetMemberId: string, modHash: string) => {
      requestedHashes.current.add(targetMemberId + modHash);
      send({ type: "transferRequest", targetMemberId, modHash });
    },
  };
}
