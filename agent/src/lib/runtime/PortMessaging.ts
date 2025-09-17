import { MessageType } from '@/lib/types/messaging';
import { z } from 'zod';

/**
 * Port connection names
 */
export enum PortName {
  OPTIONS_TO_BACKGROUND = 'options-to-background',
  SIDEPANEL_TO_BACKGROUND = 'sidepanel-to-background',
  NEWTAB_TO_BACKGROUND = 'newtab-to-background'
}

// Create a zod enum for PortName
export const PortNameSchema = z.nativeEnum(PortName);

/**
 * Port message structure
 */
export const PortMessageSchema = z.object({
  type: z.nativeEnum(MessageType),
  payload: z.unknown(),
  id: z.string().optional() // Optional message ID for correlation
});

export type PortMessage<T = unknown> = z.infer<typeof PortMessageSchema> & { payload: T };

/**
 * Port messaging service for communication between extension components
 */
export class PortMessaging {
  private static globalInstance: PortMessaging | null = null;
  private port: chrome.runtime.Port | null = null;
  private listeners: Map<MessageType, Array<(payload: unknown, messageId?: string) => void>> = new Map();
  private connectionListeners: Array<(connected: boolean) => void> = [];
  private connected = false;
  private currentPortName: PortName | null = null;
  private heartbeatInterval: number | null = null;
  private heartbeatIntervalMs = 5000;  // Send heartbeat every 5 seconds
  private autoReconnect = false;
  private reconnectTimeoutMs = 1000;  // Wait 1 second before reconnecting
  private pendingMessages: Array<{ type: MessageType; payload: unknown; id?: string }> = []

  constructor() {}

  /**
   * Get the global singleton instance
   */
  static getInstance(): PortMessaging {
    if (!PortMessaging.globalInstance) {
      PortMessaging.globalInstance = new PortMessaging();
    }
    return PortMessaging.globalInstance;
  }

  /**
   * Connects to a port with the specified name
   * @param portName - Name of the port to connect to
   * @param enableAutoReconnect - Whether to automatically reconnect on disconnect
   * @returns true if connection successful
   */
  public connect(portName: PortName, enableAutoReconnect: boolean = false): boolean {
    try {
      this.currentPortName = portName;
      this.autoReconnect = enableAutoReconnect;
      this.port = chrome.runtime.connect({ name: portName });
      
      this.port.onMessage.addListener(this.handleIncomingMessage);
      this.port.onDisconnect.addListener(this.handleDisconnect);
      
      this.connected = true;
      this.notifyConnectionListeners(true);
      
      // Start heartbeat to keep connection alive
      this.startHeartbeat();
      
      // Flush any messages queued before connection was established
      this.flushPendingMessages()
      
      return true;
    } catch (error) {
      console.error(`[PortMessaging] Connection error: ${error instanceof Error ? error.message : String(error)}`);
      this.connected = false;
      return false;
    }
  }

  /**
   * Disconnects from the current port
   */
  public disconnect(): void {
    this.autoReconnect = false;  // Disable auto-reconnect for manual disconnect
    this.stopHeartbeat();
    
    if (this.port) {
      this.port.disconnect();
      this.port = null;
      this.connected = false;
      this.notifyConnectionListeners(false);
    }
  }

  /**
   * Starts sending heartbeat messages to keep the port alive
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();  // Clear any existing heartbeat
    
    this.heartbeatInterval = window.setInterval(() => {
      if (this.connected && this.port) {
        try {
          this.sendMessage(MessageType.HEARTBEAT, { timestamp: Date.now() });
        } catch (error) {
          console.warn('[PortMessaging] Heartbeat failed:', error);
          // Don't attempt to reconnect here, let the disconnect handler do it
        }
      }
    }, this.heartbeatIntervalMs);
  }

  /**
   * Stops the heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Attempts to reconnect to the port
   */
  private attemptReconnect(): void {
    if (!this.autoReconnect || !this.currentPortName) {
      return;
    }
    
    setTimeout(() => {
      if (!this.connected && this.currentPortName) {
        const success = this.connect(this.currentPortName, this.autoReconnect);
        if (!success) {
          this.attemptReconnect();  // Keep trying
        }
      }
    }, this.reconnectTimeoutMs);
  }

  /**
   * Adds a message listener for a specific message type
   * @param type - Message type to listen for
   * @param callback - Function to call when message is received
   */
  public addMessageListener<T>(
    type: MessageType, 
    callback: (payload: T, messageId?: string) => void
  ): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.push(callback as (payload: unknown, messageId?: string) => void);
    }
  }

  /**
   * Removes a message listener
   * @param type - Message type
   * @param callback - Callback to remove
   */
  public removeMessageListener<T>(
    type: MessageType,
    callback: (payload: T, messageId?: string) => void
  ): void {
    const typeListeners = this.listeners.get(type);
    
    if (typeListeners) {
      const index = typeListeners.indexOf(callback as (payload: unknown, messageId?: string) => void);
      if (index !== -1) {
        typeListeners.splice(index, 1);
      }
    }
  }

  /**
   * Adds a connection state listener
   * @param callback - Function to call on connection state changes
   */
  public addConnectionListener(callback: (connected: boolean) => void): void {
    this.connectionListeners.push(callback);
    
    // Immediately notify with current state
    callback(this.connected);
  }

  /**
   * Removes a connection state listener
   * @param callback - Callback to remove
   */
  public removeConnectionListener(callback: (connected: boolean) => void): void {
    const index = this.connectionListeners.indexOf(callback);
    if (index !== -1) {
      this.connectionListeners.splice(index, 1);
    }
  }

  /**
   * Sends a message through the port
   * @param type - Message type
   * @param payload - Message payload
   * @param messageId - Optional message ID for correlation
   * @returns true if message sent successfully
   */
  public sendMessage<T>(type: MessageType, payload: T, messageId?: string): boolean {
    const trySend = (): boolean => {
      if (!this.port || !this.connected) return false;
      try {
        const message: PortMessage<T> = { type, payload, id: messageId };
        this.port.postMessage(message);
        return true;
      } catch (_e) {
        return false;
      }
    };

    // First attempt
    if (trySend()) return true;

    // If not connected and autoReconnect is on, attempt a short delayed retry
    if (!this.connected) {
      // Queue the message to be sent after connection establishes
      this.pendingMessages.push({ type, payload, id: messageId })
      if (this.autoReconnect) {
        setTimeout(() => {
          trySend();
        }, 150);
      }
      return true; // Treat as accepted; it will be sent on connect
    }
    console.error('[PortMessaging] Cannot send message: Not connected');
    return false;
  }

  /**
   * Checks if connected to a port
   * @returns true if connected
   */
  public isConnected(): boolean {
    return this.connected && this.port !== null;
  }

  /**
   * Handles incoming messages from the port
   */
  private handleIncomingMessage = (message: PortMessage): void => {
    const { type, payload, id } = message;
    
    // Handle heartbeat acknowledgment
    if (type === MessageType.HEARTBEAT_ACK) {
      // Heartbeat acknowledged, connection is alive
      return;
    }
    
    const listeners = this.listeners.get(type);
    
    if (listeners && listeners.length > 0) {
      listeners.forEach(listener => listener(payload, id));
    }
  };

  /**
   * Handles port disconnection
   */
  private handleDisconnect = (): void => {
    this.stopHeartbeat();
    this.port = null;
    this.connected = false;
    this.notifyConnectionListeners(false);
    
    // Attempt to reconnect if auto-reconnect is enabled
    if (this.autoReconnect) {
      this.attemptReconnect();
    }
  };

  /**
   * Notifies connection listeners of state changes
   */
  private notifyConnectionListeners(connected: boolean): void {
    this.connectionListeners.forEach(listener => listener(connected));
  }

  // Flush queued messages after a connection is established
  private flushPendingMessages(): void {
    if (!this.connected || !this.port) return
    const queued = [...this.pendingMessages]
    this.pendingMessages = []
    queued.forEach(msg => {
      try {
        const m: PortMessage = { type: msg.type, payload: msg.payload, id: msg.id }
        this.port!.postMessage(m)
      } catch (_e) {
        // If sending fails, drop silently to avoid loops
      }
    })
  }
}
