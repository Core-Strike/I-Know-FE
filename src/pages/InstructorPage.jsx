import { useCallback, useState } from 'react';
import { useStompAlert } from '../hooks/useStompAlert';
import { useMicrophone } from '../hooks/useMicrophone';
import { createSession, endSession, sendLectureChunk } from '../api';

const DEFAULT_SESSION = { id: 12, className: '강의명 · 반 이름', startedAt: '14:10' };

export default function InstructorPage() {
  const [session, setSession] = useState(DEFAULT_SESSION);
  const [sessionActive, setSessionActive] = useState(false);
  const [alerts, setAlerts] = useState([
    {
      id: 1,
      title: '과반수 이해도 저하 감지',
      time: '14:15:23',
      activeCount: 28,
      confusedCount: 16,
      pct: 57,
      unclearTopic: '트랜잭션 격리 수준',
      reason: '표정과 시선이 불안정하여 이해에 어려움이 있어 보임',
    },
    {
      id: 2,
      title: '과반수 이해도 저하 감지',
      time: '14:02:10',
      activeCount: 25,
      confusedCount: 14,
      pct: 56,
      unclearTopic: 'dirty read 개념',
      reason: '집중도 저하 감지',
    },
  ]);
  const [transcript, setTranscript] = useState('트랜잭션 격리 수준과 dirty read를...');
  const [chunkMeta, setChunkMeta] = useState('청크 #15 · 14:15:20 ~ 14:15:25');

  // ── 마이크 ──────────────────────────────────────────────────
  const handleAudioChunk = useCallback(async (blob) => {
    // 실제 환경에서는 blob을 STT API로 전송한 후 텍스트 수신
    try {
      await sendLectureChunk({ sessionId: session.id, audio: 'base64...' });
    } catch (e) {
      console.warn('chunk send error', e.message);
    }
  }, [session.id]);

  const mic = useMicrophone({ onChunk: handleAudioChunk, chunkMs: 5000 });

  // ── STOMP WebSocket ────────────────────────────────────────
  const handleAlert = useCallback((data) => {
    const newAlert = {
      id: Date.now(),
      title: '과반수 이해도 저하 감지',
      time: new Date().toTimeString().slice(0, 8),
      activeCount: data.activeCount ?? 0,
      confusedCount: data.confusedCount ?? 0,
      pct: data.pct ?? 0,
      unclearTopic: data.unclearTopic ?? '(분석 중)',
      reason: data.reason ?? '',
    };
    setAlerts((prev) => [newAlert, ...prev]);
  }, []);

  const { connected } = useStompAlert({
    sessionId: session?.id,
    onAlert: handleAlert,
    enabled: sessionActive,
  });

  // ── 세션 제어 ──────────────────────────────────────────────
  const handleStartSession = async () => {
    try {
      const data = await createSession({ className: '강의명', classId: 1 });
      setSession(data);
    } catch {
      // mock: 서버 미연결 시 기본 세션 유지
    }
    setSessionActive(true);
    mic.start();
  };

  const handleEndSession = async () => {
    try {
      await endSession(session.id);
    } catch {}
    setSessionActive(false);
    mic.stop();
  };

  // ── 세션 통계 ──────────────────────────────────────────────
  const totalStudents = 28;
  const alertCount = alerts.length;
  const avgConfusion = alerts.length
    ? Math.round(alerts.reduce((s, a) => s + a.pct, 0) / alerts.length)
    : 0;

  return (
    <div className="page-wrapper">
      {/* 헤더 */}
      <div className="top-bar">
        <div className="top-bar-left">
          <h2>{session.className}</h2>
          <p>세션 #{session.id} · {session.startedAt} 시작</p>
        </div>
        <div className="top-bar-right">
          {sessionActive && connected && (
            <span className="badge badge-green"><span className="dot dot-green" />WebSocket 연결</span>
          )}
          {sessionActive && !connected && (
            <span className="badge badge-orange">연결 중...</span>
          )}
          <button
            className="btn btn-primary"
            onClick={sessionActive ? undefined : handleStartSession}
            disabled={sessionActive}
          >
            세션 시작
          </button>
          <button
            className="btn btn-danger"
            onClick={handleEndSession}
            disabled={!sessionActive}
          >
            세션 종료
          </button>
        </div>
      </div>

      {/* 본문 */}
      <div className="page-body two-col">
        {/* 좌: 마이크 + 세션 통계 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 마이크 상태 */}
          <div className="card">
            <p className="card-title">마이크 상태</p>
            <div className="mic-status">
              <span className={`dot ${mic.active ? 'dot-green' : 'dot-gray'}`} />
              {mic.active ? '녹음 중' : '정지'}
              <span style={{ marginLeft: 4, fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>
                ON
              </span>
            </div>

            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              실시간 음성 → 텍스트
            </p>
            <div className="transcript-box">"{transcript}"</div>
            <div className="transcript-meta">{chunkMeta}</div>
          </div>

          {/* 현재 세션 통계 */}
          <div className="card">
            <p className="card-title">현재 세션 통계</p>
            <div className="stats-row">
              <div className="stat-box">
                <div className="stat-val">{totalStudents}</div>
                <div className="stat-label">접속 교육생</div>
              </div>
              <div className="stat-box">
                <div className="stat-val red">{alertCount}</div>
                <div className="stat-label">알림 발생</div>
              </div>
              <div className="stat-box">
                <div className="stat-val">{avgConfusion}%</div>
                <div className="stat-label">평균 혼란도</div>
              </div>
            </div>
          </div>
        </div>

        {/* 우: 실시간 알림 */}
        <div className="card" style={{ overflowY: 'auto', maxHeight: 520 }}>
          <div className="section-divider">
            <p className="card-title" style={{ marginBottom: 0 }}>실시간 알림</p>
          </div>

          {alerts.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px 0', fontSize: 13 }}>
              아직 알림이 없습니다
            </div>
          )}

          {alerts.map((a) => (
            <div className="alert-card" key={a.id}>
              <div className="alert-card-title">{a.title}</div>
              <div className="alert-card-meta">
                {a.time} · 활성 {a.activeCount}명 중 {a.confusedCount}명 ({a.pct}%)
              </div>
              <div className="alert-card-meta mt-1">
                모르는 내용: <strong>{a.unclearTopic}</strong>
              </div>
              {a.reason && (
                <div className="alert-card-meta mt-1">{a.reason}</div>
              )}
            </div>
          ))}

          <div
            style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, cursor: 'pointer' }}
          >
            ↑ 이전 알림 이력
          </div>
        </div>
      </div>
    </div>
  );
}
