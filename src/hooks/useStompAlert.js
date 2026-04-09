import { useEffect, useRef, useState } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

const WS_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8080') + '/ws';

/**
 * STOMP over SockJS 로 /topic/alert/{sessionId} 를 구독한다.
 * onAlert(payload) 콜백으로 파싱된 JSON 을 전달.
 */
export function useStompAlert({ sessionId, onAlert, enabled = false }) {
  const clientRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled || !sessionId) return;

    const client = new Client({
      webSocketFactory: () => new SockJS(WS_URL),
      reconnectDelay: 5000,
      onConnect: () => {
        setConnected(true);
        client.subscribe(`/topic/alert/${sessionId}`, (msg) => {
          try {
            const data = JSON.parse(msg.body);
            onAlert?.(data);
          } catch {
            onAlert?.(msg.body);
          }
        });
      },
      onDisconnect: () => setConnected(false),
      onStompError: (frame) => console.error('STOMP error', frame),
    });

    client.activate();
    clientRef.current = client;

    return () => {
      client.deactivate();
      setConnected(false);
    };
  }, [enabled, sessionId, onAlert]);

  return { connected };
}
