import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebcam } from '../hooks/useWebcam';
import { analyzeFrame, postConfusedEvent } from '../api';

const CONFUSED_STREAK_NEEDED = 3;
// studentId: 명세상 "student_42" 형식의 문자열
const STUDENT_ID = 'student_103';

export default function StudentPage() {
  const { sessionId } = useParams();   // URL: /student/:sessionId (UUID 문자열)
  const navigate = useNavigate();
  // ── 분석 상태 (명세 응답 구조 반영) ───────────────────────
  const [analysisResult, setAnalysisResult] = useState({
    confused:    false,
    confidence:  0,       // 혼란도 점수 (0~1)
    emotion:     '-',     // 주요 감정 문자열
    gpt_reason:  '',
    face_features: {
      face_detected:  false,
      emotions:       { happy: 0, neutral: 0, fear: 0, sad: 0, angry: 0, disgust: 0, surprise: 0 },
      top_emotion:    '-',
      confidence:     0,
      brow_eye_ratio: 0,
      ear:            0,
      head_tilt_deg:  0,
    },
  });
  const [confusedStreak, setConfusedStreak] = useState(0);
  const [lastSent, setLastSent] = useState(null);
  const [cooldown, setCooldown] = useState(false);
  const cooldownTimer = useRef(null);
  const streakRef = useRef(0);

  // ── 이미지 분석 & 전송 ─────────────────────────────────────
  const handleFrame = useCallback(
    async (blob) => {
      try {
        const result = await analyzeFrame(blob, STUDENT_ID);
        /**
         * 명세 응답:
         * { studentId, confused, confidence, emotion, gpt_reason,
         *   face_features: { face_detected, emotions:{happy,neutral,fear,sad,angry,disgust,surprise},
         *                    top_emotion, confidence, brow_eye_ratio, ear, head_tilt_deg } }
         */
        setAnalysisResult({
          confused:   result.confused   ?? false,
          confidence: result.confidence ?? 0,
          emotion:    result.emotion    ?? '-',
          gpt_reason: result.gpt_reason ?? '',
          face_features: {
            face_detected:  result.face_features?.face_detected  ?? false,
            emotions:       result.face_features?.emotions        ?? { happy:0, neutral:0, fear:0, sad:0, angry:0, disgust:0, surprise:0 },
            top_emotion:    result.face_features?.top_emotion     ?? '-',
            confidence:     result.face_features?.confidence      ?? 0,
            brow_eye_ratio: result.face_features?.brow_eye_ratio  ?? 0,
            ear:            result.face_features?.ear             ?? 0,
            head_tilt_deg:  result.face_features?.head_tilt_deg   ?? 0,
          },
        });

        if (result.confused) {
          streakRef.current += 1;
          setConfusedStreak(streakRef.current);
          // 연속 3회 달성 + cooldown 아님
          if (streakRef.current >= CONFUSED_STREAK_NEEDED && !cooldown) {
            const now = new Date().toISOString().slice(0, 19);
            await postConfusedEvent({
              studentId:    STUDENT_ID,
              sessionId:    sessionId,
              capturedAt:   now,
              confusedScore: result.confidence ?? 0,   // 명세: confidence 필드
              reason:        result.gpt_reason ?? '',  // 명세: gpt_reason 필드
            });
            setLastSent(now);
            // 30초 쿨다운
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
    [cooldown],
  );

  const { videoRef, active, error, start, stop } = useWebcam({
    onFrame: handleFrame,
    intervalMs: 10000,
    enabled: true,
  });

  useEffect(() => () => clearTimeout(cooldownTimer.current), []);

  // ── 헬퍼 ───────────────────────────────────────────────────
  const fmtTime = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  };

  const threshold = 0.45;
  const { confidence, emotion, gpt_reason, face_features } = analysisResult;
  const isConfused = confidence >= threshold;
  const barPct = Math.min(confidence * 100, 100).toFixed(0);
  const emotions = face_features.emotions;

  return (
    <div className="page-wrapper">
      {/* 상단 헤더 */}
      <div className="top-bar">
        <div className="top-bar-left">
          <h2>교육생 페이지</h2>
          <p>세션 ID: {sessionId} · studentId: {STUDENT_ID}</p>
        </div>
        <div className="top-bar-right">
          {active
            ? <span className="badge badge-green"><span className="dot dot-green" />감지 중</span>
            : <span className="badge badge-gray"><span className="dot dot-gray" />대기 중</span>}
          <button
            className={`btn ${active ? 'btn-danger' : 'btn-primary'}`}
            onClick={active ? stop : start}
          >
            {active ? '세션 나가기' : '세션 참가'}
          </button>
          <button
            className="btn btn-outline"
            onClick={() => { stop(); navigate('/'); }}
          >
            ← 홈
          </button>
        </div>
      </div>

      {/* 에러 */}
      {error && (
        <div style={{ padding: '10px 24px', background: '#fee2e2', color: '#b91c1c', fontSize: 13 }}>
          카메라 오류: {error}
        </div>
      )}

      {/* 본문 */}
      <div className="page-body two-col">
        {/* 좌: 웹캠 피드 */}
        <div className="card">
          <p className="card-title">웹캠 피드</p>
          <div className="webcam-box">
            {active
              ? <video ref={videoRef} autoPlay muted playsInline />
              : (
                <div className="webcam-placeholder">
                  <div className="webcam-icon">👤</div>
                  <span>webcam feed</span>
                </div>
              )}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center' }}>
            {active
              ? '10초마다 자동 캡처 · FastAPI 분석 중'
              : '세션 참가 후 자동으로 시작됩니다'}
          </div>
        </div>

        {/* 우: 실시간 감지 상태 + 전송 상태 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 실시간 감지 상태 */}
          <div className="card">
            <p className="card-title">실시간 감지 상태</p>

            {/* confidence 바 (= confused 판정 점수) */}
            <div className="score-bar-wrap">
              <div className="score-bar-header">
                <span>confidence</span>
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
                <span>threshold {threshold} · top: <strong>{emotion}</strong></span>
                <span>streak: {confusedStreak}/{CONFUSED_STREAK_NEEDED}</span>
              </div>
            </div>

            {/* face_features.emotions — 7개 감정 점수 */}
            {['happy','neutral','fear','sad','angry','disgust','surprise'].map((key) => (
              <div className="emotion-row" key={key}>
                <span>{key}</span>
                <span className="emotion-val">{(emotions[key] ?? 0).toFixed(3)}</span>
              </div>
            ))}

            {/* face_features 부가 정보 */}
            {face_features.face_detected && (
              <div style={{ marginTop: 10, padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span>brow_eye_ratio</span><span>{face_features.brow_eye_ratio.toFixed(3)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span>EAR (눈 개폐)</span><span>{face_features.ear.toFixed(3)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>head_tilt</span><span>{face_features.head_tilt_deg.toFixed(1)}°</span>
                </div>
              </div>
            )}

            {/* GPT reason */}
            {gpt_reason && (
              <div style={{ marginTop: 10, padding: '8px 10px', background: '#fafaf7', borderRadius: 6, fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                {gpt_reason}
              </div>
            )}
          </div>

          {/* 전송 상태 */}
          <div className="card">
            <p className="card-title">전송 상태</p>
            <div className="emotion-row">
              <span>마지막 전송</span>
              <span className="emotion-val">{fmtTime(lastSent)}</span>
            </div>
            <div className="emotion-row" style={{ borderBottom: 'none', marginTop: 4 }}>
              <span>cooldown</span>
              <span className={`badge ${cooldown ? 'badge-orange' : 'badge-green'}`}>
                {cooldown ? '대기 중' : '준비'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
