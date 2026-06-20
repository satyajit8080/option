// A small, dependency-free WebSocket wrapper with auto-reconnect and
// exponential backoff. `hooks/useLiveData.ts` wraps this in a React hook —
// this file stays framework-agnostic on purpose so it's easy to unit test
// or reuse outside React.
import type { WsServerMessage, WsSubscribeMessage } from "@/types";

const WS_URL =
  import.meta.env.VITE_WS_URL ??
  `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/option-chain`;

type Listener = (msg: WsServerMessage) => void;
type StatusListener = (status: ConnectionStatus) => void;

export type ConnectionStatus = "connecting" | "open" | "closed" | "reconnecting";

export class OptionChainSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private pendingSubscribe: WsSubscribeMessage | null = null;
  private reconnectAttempt = 0;
  private closedByUser = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(): void {
    this.closedByUser = false;
    this._open();
  }

  private _open(): void {
    this._setStatus(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this._setStatus("open");
      if (this.pendingSubscribe) {
        this.ws?.send(JSON.stringify(this.pendingSubscribe));
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsServerMessage;
        this.listeners.forEach((l) => l(msg));
      } catch {
        // ignore malformed frames
      }
    };

    this.ws.onclose = () => {
      this._setStatus("closed");
      if (!this.closedByUser) this._scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private _scheduleReconnect(): void {
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 15000);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => this._open(), delay);
  }

  subscribe(msg: WsSubscribeMessage): void {
    this.pendingSubscribe = msg;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
    // If not open yet, `onopen` above will flush `pendingSubscribe`.
  }

  unsubscribe(): void {
    this.pendingSubscribe = null;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: "unsubscribe" }));
    }
  }

  onMessage(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private _setStatus(status: ConnectionStatus): void {
    this.statusListeners.forEach((l) => l(status));
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
