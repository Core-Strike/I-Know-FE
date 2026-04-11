import { useRef, useState, useCallback, useEffect } from 'react';

const RECORD_DURATION_MS = 2 * 60 * 1000; // 2분

/**
 * Web Speech API (SpeechRecognition) 기반 STT 훅.
 * Chrome/Edge 전용. startRecording() 호출 시 2분 동안 음성을 인식하고
 * onComplete(transcript) 콜백으로 전체 텍스트를 반환.
 *
 * 여러 알림이 동시에 기록을 요청할 수 있으므로 alertId로 구분.
 */
export function useSpeechRecognition() {
  const recognitionRef = useRef(null);
  const transcriptRef  = useRef('');
  const timerRef       = useRef(null);
  const callbackRef    = useRef(null);
  const [recording, setRecording] = useState(false);
  const [supported]  = useState(() =>
    typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  );

  const stopRecording = useCallback(() => {
    clearTimeout(timerRef.current);
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
    setRecording(false);
  }, []);

  const startRecording = useCallback((onComplete) => {
    if (!supported) {
      console.warn('SpeechRecognition이 지원되지 않는 브라우저입니다.');
      return;
    }

    // 이미 녹음 중이면 이전 것 종료
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    clearTimeout(timerRef.current);

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'ko-KR';
    recognition.continuous = true;
    recognition.interimResults = false;

    transcriptRef.current = '';
    callbackRef.current = onComplete;
    recognitionRef.current = recognition;

    recognition.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          transcriptRef.current += e.results[i][0].transcript + ' ';
        }
      }
    };

    recognition.onerror = (e) => {
      console.warn('SpeechRecognition 오류:', e.error);
      // network 오류 등은 재시작 시도
      if (e.error === 'network' || e.error === 'no-speech') {
        try { recognition.stop(); recognition.start(); } catch {}
      }
    };

    recognition.onend = () => {
      // continuous mode에서 중단됐을 때 재시작 (2분 타이머가 살아있는 동안만)
      if (recognitionRef.current === recognition && recording) {
        try { recognition.start(); } catch {}
      }
    };

    recognition.start();
    setRecording(true);

    // 2분 후 자동 종료 및 콜백
    timerRef.current = setTimeout(() => {
      const finalTranscript = transcriptRef.current.trim();
      stopRecording();
      callbackRef.current?.(finalTranscript);
    }, RECORD_DURATION_MS);
  }, [supported, stopRecording, recording]);

  useEffect(() => () => {
    clearTimeout(timerRef.current);
    try { recognitionRef.current?.stop(); } catch {}
  }, []);

  return { supported, recording, startRecording, stopRecording };
}
