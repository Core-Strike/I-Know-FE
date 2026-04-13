import { useRef, useState, useCallback, useEffect } from 'react';

/**
 * 웹캠 스트림을 열고 20초마다 프레임을 캡처하는 훅.
 * onFrame(blob) 콜백으로 JPEG Blob 을 전달한다.
 */
export function useWebcam({ onFrame, intervalMs = 10000, enabled = false }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(document.createElement('canvas'));
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState(null);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || video.readyState < 2) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => blob && onFrame?.(blob), 'image/jpeg', 0.8);
  }, [onFrame]);

  const start = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      setActive(true);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    clearInterval(timerRef.current);
    setActive(false);
  }, []);

  // 주기적 캡처
  useEffect(() => {
    if (active && enabled) {
      timerRef.current = setInterval(capture, intervalMs);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [active, enabled, capture, intervalMs]);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;

    if (!video || !stream) return;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }

    video.play().catch(() => {});
  }, [active]);

  return { videoRef, active, error, start, stop };
}
