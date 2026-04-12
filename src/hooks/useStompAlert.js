import { useEffect, useRef, useState } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

const WS_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8080') + '/ws';

/**
 * STOMP over SockJS 로 /topic/alert/{sessionId} 를 구독한다.
 * onAlert(payload) 콜백으로 파싱된 JSON 을 전달.
 *
 * onAlert 는 ref 로 보관하므로 콜백 참조가 바뀌어도
 * WebSocket 연결을 재생성하지 않는다.
 */
export function useStompAlert({ sessionId, onAlert, enabled = false }) {
  const clientRef  = useRef(null);
  const onAlertRef = useRef(onAlert);   // ← 항상 최신 콜백을 ref에 유지
  const [connected, setConnected] = useState(false);

  // 콜백이 바뀔 때마다 ref만 갱신 (effect 재실행 없음)
  useEffect(() => {
    onAlertRef.current = onAlert;
  }, [onAlert]);

  // enabled / sessionId 가 바뀔 때만 소켓을 재생성
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
            onAlertRef.current?.(data);
          } catch {
            onAlertRef.current?.(msg.body);
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
  }, [enabled, sessionId]); // onAlert 제거 — ref로 처리하므로 의존성 불필요

  return { connected };
}
