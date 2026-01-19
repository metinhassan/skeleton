/**
 * Mock live events service implementation
 * In-memory SSE broadcasting for real-time match updates
 */

import type { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type {
  LiveEventsService,
  SSEClient,
  LiveEvent,
} from './live-events-service.js';

// Heartbeat interval in milliseconds (30 seconds)
const HEARTBEAT_INTERVAL = 30000;

export class MockLiveEventsService implements LiveEventsService {
  private clients: Map<string, SSEClient> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // ==================== Client Management ====================

  addClient(clientId: string, response: Response, matchId?: string, competitionId?: string): void {
    const client: SSEClient = {
      id: clientId || uuidv4(),
      response,
      matchId,
      competitionId,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
    };

    this.clients.set(client.id, client);

    // Handle client disconnect
    response.on('close', () => {
      this.removeClient(client.id);
    });

    // Send initial heartbeat
    this.sendHeartbeat(response);
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  getClientCount(matchId?: string, competitionId?: string): number {
    if (!matchId && !competitionId) {
      return this.clients.size;
    }

    let count = 0;
    for (const client of this.clients.values()) {
      if (matchId && client.matchId === matchId) count++;
      else if (competitionId && client.competitionId === competitionId) count++;
    }
    return count;
  }

  // ==================== Broadcasting ====================

  broadcastToMatch(matchId: string, event: LiveEvent): void {
    for (const client of this.clients.values()) {
      // Send to clients subscribed to this specific match
      // or to the competition that contains this match
      if (client.matchId === matchId) {
        this.sendEvent(client.response, event);
      }
    }
  }

  broadcastToCompetition(competitionId: string, event: LiveEvent): void {
    for (const client of this.clients.values()) {
      // Send to clients subscribed to this competition
      if (client.competitionId === competitionId) {
        this.sendEvent(client.response, event);
      }
    }
  }

  // ==================== SSE Helpers ====================

  setupSSEResponse(response: Response): void {
    // Set SSE headers
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Flush headers immediately
    response.flushHeaders();
  }

  sendEvent(response: Response, event: LiveEvent): void {
    try {
      // SSE format: "event: type\ndata: json\n\n"
      const eventString = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
      response.write(eventString);

      // Attempt to flush if the response supports it
      if (typeof (response as any).flush === 'function') {
        (response as any).flush();
      }
    } catch (error) {
      // Client likely disconnected
      console.error('Error sending SSE event:', error);
    }
  }

  sendHeartbeat(response: Response): void {
    const heartbeatEvent: LiveEvent = {
      type: 'heartbeat',
      matchId: '',
      timestamp: new Date().toISOString(),
      data: {
        time: new Date().toISOString(),
      },
    };

    try {
      // Use colon prefix for comments (heartbeat) to keep connection alive
      const eventString = `: heartbeat ${new Date().toISOString()}\n\n`;
      response.write(eventString);

      if (typeof (response as any).flush === 'function') {
        (response as any).flush();
      }
    } catch (error) {
      // Client likely disconnected
    }
  }

  // ==================== Lifecycle ====================

  startHeartbeat(): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      const now = new Date();

      for (const client of this.clients.values()) {
        try {
          this.sendHeartbeat(client.response);
          client.lastHeartbeat = now;
        } catch (error) {
          // Client disconnected, remove it
          this.removeClient(client.id);
        }
      }
    }, HEARTBEAT_INTERVAL);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

// Singleton instance for sharing across the app
let liveEventsInstance: MockLiveEventsService | null = null;

export function getMockLiveEventsService(): MockLiveEventsService {
  if (!liveEventsInstance) {
    liveEventsInstance = new MockLiveEventsService();
    liveEventsInstance.startHeartbeat();
  }
  return liveEventsInstance;
}

export function resetMockLiveEventsService(): void {
  if (liveEventsInstance) {
    liveEventsInstance.stopHeartbeat();
    liveEventsInstance = null;
  }
}
