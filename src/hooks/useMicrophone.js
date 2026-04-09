import { useRef, useState, useCallback } from 'react';

/**
 * 마이크 오디오를 MediaRecorder 로 녹음하고
 * chunkMs 마다 onChunk(blob) 콜백을 호출한다.
 */
export function useMicrophone({ onChunk, chunkMs = 5000 }) {
  const recorderRef = useRef(null);
  const streamRef  = useRef(null);
  const [active, setActive] = useState(false);
  const [error, setError]   = useState(null);

  const start = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) onChunk?.(e.data);
      };

      recorder.start(chunkMs);
      setActive(true);
    } catch (e) {
      setError(e.message);
    }
  }, [onChunk, chunkMs]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    streamRef.current  = null;
    setActive(false);
  }, []);

  return { active, error, start, stop };
}
