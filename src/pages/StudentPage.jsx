import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useWebcam } from '../hooks/useWebcam';
import {
  analyzeFrame,
  getSession,
  joinSessionParticipant,
  leaveSessionParticipant,
  leaveSessionParticipantOnUnload,
  postConfusedEvent,
} from '../api';
import { formatSeoulClock, getSeoulDateTime } from '../utils/seoulTime';

const CONFUSED_STREAK_NEEDED = 3;
const EMOTION_LABELS = {
  happy: '기쁨',
  neutral: '무표정',
  fear: '불안',
  sad: '슬픔',
  angry: '분노',
  disgust: '거부감',
  surprise: '놀람',
};

const createRandomStudentName = () =>
  String(Math.floor(100000000 + Math.random() * 900000000));

export default function StudentPage() {
  const SESSION_CHECK_INTERVAL_MS = 5000;
  const { sessionId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [studentId] = useState(() => {
    const name = searchParams.get('name')?.trim();
    return name || createRandomStudentName();
  });

  const [analysisResult, setAnalysisResult] = useState({
    confused: false,
    confidence: 0,
    emotion: '-',
    gpt_reason: '',
    face_features: {
      face_detected: false,
      emotions: { happy: 0, neutral: 0, fear: 0, sad: 0, angry: 0, disgust: 0, surprise: 0 },
      top_emotion: '-',
      confidence: 0,
      brow_eye_ratio: 0,
      ear: 0,
      head_tilt_deg: 0,
    },
  });
  const [confusedStreak, setConfusedStreak] = useState(0);
  const [lastSent, setLastSent] = useState(null);
  const [cooldown, setCooldown] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeRedirectHome, setNoticeRedirectHome] = useState(false);
  const cooldownTimer = useRef(null);
  const streakRef = useRef(0);
  const joinedRef = useRef(false);

  const handleFrame = useCallback(
    async (blob) => {
      try {
        const result = await analyzeFrame(blob, studentId);
        setAnalysisResult({
          confused: result.confused ?? false,
          confidence: result.confidence ?? 0,
          emotion: result.emotion ?? '-',
          gpt_reason: result.gpt_reason ?? '',
          face_features: {
            face_detected: result.face_features?.face_detected ?? false,
            emotions: result.face_features?.emotions ?? { happy: 0, neutral: 0, fear: 0, sad: 0, angry: 0, disgust: 0, surprise: 0 },
            top_emotion: result.face_features?.top_emotion ?? '-',
            confidence: result.face_features?.confidence ?? 0,
            brow_eye_ratio: result.face_features?.brow_eye_ratio ?? 0,
            ear: result.face_features?.ear ?? 0,
            head_tilt_deg: result.face_features?.head_tilt_deg ?? 0,
          },
        });

        if (result.confused) {
          streakRef.current += 1;
          setConfusedStreak(streakRef.current);
          if (streakRef.current >= CONFUSED_STREAK_NEEDED && !cooldown) {
            const now = getSeoulDateTime();
            await postConfusedEvent({
              studentId,
              sessionId,
              studentCount: 1,
              totalStudentCount: 1,
              capturedAt: now,
              confusedScore: result.confidence ?? 0,
              reason: result.gpt_reason ?? '',
            });
            setLastSent(now);
            setCooldown(true);
            streakRef.current = 0;
            setConfusedStreak(0);
            clearTimeout(cooldownTimer.current);
            cooldownTimer.current = setTimeout(() => setCooldown(false), 30000);
          }
        } else {
          streakRef.current = 0;
          setConfusedStreak(0);
        }
      } catch (e) {
        console.warn('analyze error', e.message);
      }
    },
    [cooldown, studentId, sessionId],
  );

  const { videoRef, active, error, start, stop } = useWebcam({
    onFrame: handleFrame,
    intervalMs: 10000,
    enabled: true,
  });

  useEffect(() => () => clearTimeout(cooldownTimer.current), []);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    let cancelled = false;

    const verifySession = async () => {
      try {
        const session = await getSession(sessionId);
        if (cancelled) {
          return;
        }

        if (session?.status !== 'ACTIVE') {
          stop();
          if (joinedRef.current) {
            joinedRef.current = false;
            await leaveSessionParticipant({ sessionId, studentId, studentName: studentId });
          }
          setNotice('강사가 수업을 종료해서 학생 화면도 함께 종료되었습니다.');
          setNoticeRedirectHome(true);
        }
      } catch (e) {
        if (cancelled) {
          return;
        }

        stop();
        if (joinedRef.current) {
          joinedRef.current = false;
          await leaveSessionParticipant({ sessionId, studentId, studentName: studentId });
        }
        setNotice('수업이 종료되어 학생 화면을 닫습니다.');
        setNoticeRedirectHome(true);
      }
    };

    void verifySession();
    const timer = window.setInterval(() => {
      void verifySession();
    }, SESSION_CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active, sessionId, stop]);

  useEffect(() => {
    const currentName = searchParams.get('name')?.trim();
    if (currentName) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('name', studentId);
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams, studentId]);

  const fmtTime = (iso) => formatSeoulClock(iso);

  const threshold = 0.45;
  const { confidence, emotion, gpt_reason, face_features } = analysisResult;
  const isConfused = confidence >= threshold;
  const barPct = Math.min(confidence * 100, 100).toFixed(0);
  const emotions = face_features.emotions;

  const handleToggleClass = useCallback(async () => {
    if (active) {
      if (joinedRef.current) {
        joinedRef.current = false;
        try {
          await leaveSessionParticipant({ sessionId, studentId, studentName: studentId });
        } catch (e) {
          console.warn('leave session failed', e.message);
        }
      }
      stop();
      return;
    }

    try {
      const session = await getSession(sessionId);
      if (session?.status !== 'ACTIVE') {
        setNotice('이 수업은 아직 시작되지 않았거나 이미 종료되었습니다. 강사에게 수업 시작 여부를 확인해 주세요.');
        setNoticeRedirectHome(false);
        return;
      }

      await joinSessionParticipant({ sessionId, studentId, studentName: studentId });
      joinedRef.current = true;
      await start();
    } catch (e) {
      if (joinedRef.current) {
        joinedRef.current = false;
        try {
          await leaveSessionParticipant({ sessionId, studentId, studentName: studentId });
        } catch (leaveError) {
          console.warn('leave session failed', leaveError.message);
        }
      }
      setNotice('아직 시작되지 않은 수업입니다. 강사가 먼저 해당 수업 ID로 수업을 시작해야 합니다.');
      setNoticeRedirectHome(false);
    }
  }, [active, sessionId, start, stop, studentId]);

  useEffect(() => {
    const handlePageExit = () => {
      if (!joinedRef.current) {
        return;
      }
      joinedRef.current = false;
      leaveSessionParticipantOnUnload({ sessionId, studentId, studentName: studentId });
    };

    window.addEventListener('pagehide', handlePageExit);
    window.addEventListener('beforeunload', handlePageExit);

    return () => {
      window.removeEventListener('pagehide', handlePageExit);
      window.removeEventListener('beforeunload', handlePageExit);
    };
  }, [sessionId, studentId]);

  return (
    <div className="page-wrapper">
      {notice && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div className="card" style={{ width: 360, maxWidth: '100%', padding: '28px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>안내</div>
            <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 18 }}>
              {notice}
            </p>
            <button
              className="btn btn-primary"
              onClick={() => {
                setNotice('');
                if (noticeRedirectHome) {
                  setNoticeRedirectHome(false);
                  navigate('/');
                }
              }}
              style={{ justifyContent: 'center', width: '100%' }}
            >
              확인
            </button>
          </div>
        </div>
      )}

      <div className="top-bar">
        <div className="top-bar-left">
          <h2>교육생 페이지</h2>
          <p>수업 ID: {sessionId} · 이름: <strong>{studentId}</strong></p>
        </div>
        <div className="top-bar-right">
          {active
            ? <span className="badge badge-green"><span className="dot dot-green" />감지 중</span>
            : <span className="badge badge-gray"><span className="dot dot-gray" />대기 중</span>}
          <button
            className={`btn ${active ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => { void handleToggleClass(); }}
          >
            {active ? '수업 나가기' : '수업 시작'}
          </button>
          <button
            className="btn btn-outline"
            onClick={() => {
              if (joinedRef.current) {
                joinedRef.current = false;
                void leaveSessionParticipant({ sessionId, studentId, studentName: studentId });
              }
              stop();
              navigate('/');
            }}
          >
            홈으로
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 24px', background: '#fee2e2', color: '#b91c1c', fontSize: 13 }}>
          카메라 오류: {error}
        </div>
      )}

      <div className="page-body two-col">
        <div className="card">
          <p className="card-title">학생 화면</p>
          <div className="webcam-box">
            {active
              ? <video ref={videoRef} autoPlay muted playsInline />
              : (
                <div className="webcam-placeholder">
                  <div className="webcam-icon">📷</div>
                  <span>카메라 화면</span>
                </div>
              )}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center' }}>
            {active
              ? '10초마다 자동으로 캡처해 분석하고 있습니다.'
              : '수업 시작을 누르면 자동 분석이 시작됩니다.'}
          </div>
          {active && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center' }}>
              캡처 이미지는 별도로 저장되지 않습니다.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <p className="card-title">실시간 감지 상태</p>

            <div className="score-bar-wrap">
              <div className="score-bar-header">
                <span>혼란도 점수</span>
                <span className={`score-val ${isConfused ? 'text-red' : ''}`}>
                  {confidence.toFixed(3)}
                </span>
              </div>
              <div className="score-bar-track">
                <div
                  className={`score-bar-fill ${isConfused ? 'danger' : 'normal'}`}
                  style={{ width: `${barPct}%` }}
                />
              </div>
              <div className="score-bar-sub">
                <span>기준값 {threshold} · 주요 감정: <strong>{EMOTION_LABELS[emotion] ?? emotion}</strong></span>
                <span>연속 감지: {confusedStreak}/{CONFUSED_STREAK_NEEDED}</span>
              </div>
            </div>

            {Object.keys(EMOTION_LABELS).map((key) => (
              <div className="emotion-row" key={key}>
                <span>{EMOTION_LABELS[key]}</span>
                <span className="emotion-val">{(emotions[key] ?? 0).toFixed(3)}</span>
              </div>
            ))}

            {face_features.face_detected && (
              <div style={{ marginTop: 10, padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span>눈썹 대비 눈 비율</span><span>{face_features.brow_eye_ratio.toFixed(3)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span>눈 개방도</span><span>{face_features.ear.toFixed(3)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>고개 기울기</span><span>{face_features.head_tilt_deg.toFixed(1)}도</span>
                </div>
              </div>
            )}

            {gpt_reason && (
              <div style={{ marginTop: 10, padding: '8px 10px', background: '#fafaf7', borderRadius: 6, fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                {gpt_reason}
              </div>
            )}
          </div>

          <div className="card">
            <p className="card-title">전송 상태</p>
            <div className="emotion-row">
              <span>마지막 전송</span>
              <span className="emotion-val">{fmtTime(lastSent)}</span>
            </div>
            <div className="emotion-row" style={{ borderBottom: 'none', marginTop: 4 }}>
              <span>재전송 대기</span>
              <span className={`badge ${cooldown ? 'badge-orange' : 'badge-green'}`}>
                {cooldown ? '대기 중' : '전송 가능'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
