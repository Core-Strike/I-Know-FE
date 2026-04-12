import { useRef, useState, useCallback, useEffect } from 'react';

const SILENCE_WARN_MS = 30 * 60 * 1000; // 30분

/**
 * 마이크 오디오를 MediaRecorder 로 녹음하고
 * chunkMs 마다 onChunk(blob) 콜백을 호출한다.
 *
 * 음소거(muted) 상태에서는:
 *  - 오디오 트랙 enabled = false (하드웨어 무음)
 *  - ondataavailable 콜백에서 onChunk/침묵타이머 호출 차단
 *    (MediaRecorder는 무음 데이터도 size > 0 으로 생성하기 때문)
 *
 * 30분 동안 onChunk 호출이 없으면 onSilenceWarning 콜백을 실행한다.
 */
export function useMicrophone({ onChunk, chunkMs = 5000, onSilenceWarning }) {
  const recorderRef  = useRef(null);
  const streamRef    = useRef(null);
  const silenceTimer = useRef(null);
  // state → ref 동기화: ondataavailable 클로저에서 최신 muted 값을 읽기 위해 사용
  const mutedRef     = useRef(false);

  const [active, setActive] = useState(false);
  const [muted, setMuted]   = useState(false);
  const [error, setError]   = useState(null);

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
        // 음소거 중일 때는 무음 데이터를 그냥 버린다
        if (e.data.size > 0 && !mutedRef.current) {
          onChunk?.(e.data);
          resetSilenceTimer();
        }
      };

      recorder.start(chunkMs);
      mutedRef.current = false;
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
    mutedRef.current    = false;
    setActive(false);
    setMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    if (!streamRef.current) return;
    const newMuted = !mutedRef.current;
    streamRef.current.getAudioTracks().forEach((t) => { t.enabled = !newMuted; });
    mutedRef.current = newMuted;
    setMuted(newMuted);
    // 음소거 해제 시 침묵 타이머 재시작
    if (!newMuted) resetSilenceTimer();
  }, [resetSilenceTimer]);

  useEffect(() => () => { clearTimeout(silenceTimer.current); }, []);

  return { active, muted, error, start, stop, toggleMute };
}
