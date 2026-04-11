import { useRef, useState, useCallback, useEffect } from 'react';

const SILENCE_WARN_MS = 30 * 60 * 1000; // 30분

/**
 * 마이크 오디오를 MediaRecorder 로 녹음하고
 * chunkMs 마다 onChunk(blob) 콜백을 호출한다.
 * muted 상태에서는 마이크 트랙만 음소거하여 청크 데이터가 비어있게 됨.
 * 30분 무음 시 onSilenceWarning 콜백 호출.
 */
export function useMicrophone({ onChunk, chunkMs = 5000, onSilenceWarning }) {
  const recorderRef    = useRef(null);
  const streamRef      = useRef(null);
  const silenceTimer   = useRef(null);
  const [active, setActive]   = useState(false);
  const [muted, setMuted]     = useState(false);
  const [error, setError]     = useState(null);

  // 30분 침묵 타이머 리셋
  const resetSilenceTimer = useCallback(() => {
    clearTimeout(silenceTimer.current);
    silenceTimer.current = setTimeout(() => {
      onSilenceWarning?.();
    }, SILENCE_WARN_MS);
  }, [onSilenceWarning]);

  const start = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          onChunk?.(e.data);
          resetSilenceTimer();
        }
      };

      recorder.start(chunkMs);
      setActive(true);
      setMuted(false);
      resetSilenceTimer();
    } catch (e) {
      setError(e.message);
    }
  }, [onChunk, chunkMs, resetSilenceTimer]);

  const stop = useCallback(() => {
    clearTimeout(silenceTimer.current);
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    streamRef.current   = null;
    setActive(false);
    setMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    if (!streamRef.current) return;
    const audioTracks = streamRef.current.getAudioTracks();
    const newMuted = !muted;
    audioTracks.forEach((t) => { t.enabled = !newMuted; });
    setMuted(newMuted);
    if (!newMuted) {
      // 음소거 해제 시 침묵 타이머 리셋
      resetSilenceTimer();
    }
  }, [muted, resetSilenceTimer]);

  // 언마운트 시 정리
  useEffect(() => () => {
    clearTimeout(silenceTimer.current);
  }, []);

  return { active, muted, error, start, stop, toggleMute };
}
