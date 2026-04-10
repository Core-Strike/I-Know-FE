import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebcam } from '../hooks/useWebcam';
import { analyzeFrame } from '../api';
import axios from 'axios';

const SPRING_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const CONFUSED_STREAK_NEEDED = 3;
const STUDENT_ID = 103; // 실제 환경에서는 로그인 세션 등으로 주입

export default function StudentPage() {
  const { sessionId } = useParams();   // URL: /student/:sessionId
  const navigate = useNavigate();
  // ── 분석 상태 ──────────────────────────────────────────────
  const [scores, setScores] = useState({
    confusedScore: 0,
    sad: 0,
    fearful: 0,
    surprised: 0,
    neutral: 0,
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
        // result: { confusedScore, sad, fearful, surprised, neutral, confused }
        setScores({
          confusedScore: result.confusedScore ?? 0,
          sad: result.sad ?? 0,
          fearful: result.fearful ?? 0,
          surprised: result.surprised ?? 0,
          neutral: result.neutral ?? 0,
        });

        if (result.confused) {
          streakRef.current += 1;
          setConfusedStreak(streakRef.current);
          // 연속 3회 달성 + cooldown 아님
          if (streakRef.current >= CONFUSED_STREAK_NEEDED && !cooldown) {
            const now = new Date().toISOString();
            await axios.post(`${SPRING_URL}/api/confused-events`, {
              studentId: STUDENT_ID,
              sessionId: Number(sessionId),
              capturedAt: now,
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
  const isConfused = scores.confusedScore >= threshold;
  const barPct = Math.min(scores.confusedScore * 100, 100).toFixed(0);

  return (
    <div className="page-wrapper">
      {/* 상단 헤더 */}
      <div className="top-bar">
        <div className="top-bar-left">
          <h2>교육생 페이지</h2>
          <p>세션 ID: #{sessionId} · studentId: {STUDENT_ID}</p>
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

            {/* confusedScore 바 */}
            <div className="score-bar-wrap">
              <div className="score-bar-header">
                <span>confusedScore</span>
                <span className={`score-val ${isConfused ? 'text-red' : ''}`}>
                  {scores.confusedScore.toFixed(2)}
                </span>
              </div>
              <div className="score-bar-track">
                <div
                  className={`score-bar-fill ${isConfused ? 'danger' : 'normal'}`}
                  style={{ width: `${barPct}%` }}
                />
              </div>
              <div className="score-bar-sub">
                <span>threshold {threshold}</span>
                <span>streak: {confusedStreak}/{CONFUSED_STREAK_NEEDED}</span>
              </div>
            </div>

            {/* 세부 감정 */}
            {[
              { label: 'sad',       val: scores.sad },
              { label: 'fearful',   val: scores.fearful },
              { label: 'surprised', val: scores.surprised },
              { label: 'neutral',   val: scores.neutral },
            ].map(({ label, val }) => (
              <div className="emotion-row" key={label}>
                <span>{label}</span>
                <span className="emotion-val">{val.toFixed(2)}</span>
              </div>
            ))}
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
