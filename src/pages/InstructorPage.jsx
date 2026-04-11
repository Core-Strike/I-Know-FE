import { useCallback, useEffect, useState } from 'react';
import { useStompAlert } from '../hooks/useStompAlert';
import { useMicrophone } from '../hooks/useMicrophone';
import { createSession, endSession, getSessionAlerts, sendLectureChunk } from '../api';

/**
 * 서버 Alert 응답 → 알림 카드 형태로 정규화
 * 명세 필드: { id, sessionId, studentId, capturedAt, confusedScore, reason, unclearTopic, createdAt }
 */
function normalizeAlert(raw, idx) {
  return {
    id:           raw.id            ?? Date.now() + idx,
    time:         raw.capturedAt?.slice(11, 19) ?? raw.createdAt?.slice(11, 19) ?? '-',
    studentId:    raw.studentId     ?? '-',
    confusedScore:raw.confusedScore ?? 0,
    unclearTopic: raw.unclearTopic  ?? '(분석 중)',
    reason:       raw.reason        ?? '',
  };
}

export default function InstructorPage() {
  const [session, setSession]           = useState(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [copied, setCopied]             = useState(false);
  const [alerts, setAlerts]             = useState([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [sessionError, setSessionError] = useState('');

  // ── 마이크 ──────────────────────────────────────────────────
  const handleAudioChunk = useCallback(async (blob) => {
    if (!session) return;
    try {
      await sendLectureChunk({ sessionId: session.id });
    } catch (e) {
      console.warn('lecture-chunk 전송 오류:', e.message);
    }
  }, [session]);

  const mic = useMicrophone({ onChunk: handleAudioChunk, chunkMs: 5000 });

  // ── STOMP WebSocket ────────────────────────────────────────
  const handleAlert = useCallback((data) => {
    setAlerts((prev) => [normalizeAlert(data, prev.length), ...prev]);
  }, []);

  const { connected } = useStompAlert({
    sessionId: session?.id,
    onAlert: handleAlert,
    enabled: sessionActive,
  });

  // ── 세션 알림 이력 로드 ─────────────────────────────────────
  const loadAlerts = useCallback(async (sessionId) => {
    setLoadingAlerts(true);
    try {
      const data = await getSessionAlerts(sessionId);
      const list = Array.isArray(data) ? data : (data?.content ?? data?.alerts ?? []);
      setAlerts(list.map((r, i) => normalizeAlert(r, i)));
    } catch (e) {
      console.warn('알림 이력 로드 실패:', e.message);
      setAlerts([]);
    } finally {
      setLoadingAlerts(false);
    }
  }, []);

  // ── 세션 제어 ──────────────────────────────────────────────
  const handleStartSession = async () => {
    setSessionError('');
    let newSession = null;
    try {
      // 명세: POST /api/sessions  Body: { classId: string }
      const data = await createSession({ classId: 'class-1' });
      // 명세 응답: { sessionId (UUID), classId, status, startedAt, endedAt }
      newSession = {
        id:        data.sessionId  ?? data.id,          // UUID 문자열
        classId:   data.classId    ?? 'class-1',
        startedAt: data.startedAt?.slice(11, 16) ?? new Date().toTimeString().slice(0, 5),
      };
    } catch (e) {
      // 서버 미응답 시 임시 세션 (UUID 형식 mock)
      console.warn('세션 생성 실패, 임시 세션 사용:', e.message);
      const now = new Date();
      const mockUuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
      newSession = {
        id: mockUuid,
        classId: 'class-1',
        startedAt: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,
      };
    }
    setSession(newSession);
    setSessionActive(true);
    setAlerts([]);
    mic.start();
    await loadAlerts(newSession.id);
  };

  const handleEndSession = async () => {
    try {
      if (session) await endSession(session.id);
    } catch (e) {
      console.warn('세션 종료 실패:', e.message);
    }
    setSessionActive(false);
    setSession(null);
    setAlerts([]);
    mic.stop();
  };

  const handleCopyId = () => {
    if (!session) return;
    navigator.clipboard.writeText(String(session.id));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── 세션 통계 계산 (명세 기준: confusedScore 0.0~1.0)
  const alertCount   = alerts.length;
  const avgConfusion = alertCount
    ? Math.round(alerts.reduce((s, a) => s + (a.confusedScore ?? 0), 0) / alertCount * 100)
    : 0;

  return (
    <div className="page-wrapper">
      {/* 헤더 */}
      <div className="top-bar">
        <div className="top-bar-left">
          <h2>강사 페이지 — 마이크 음성 캡처 + 알림 수신</h2>
          {session
            ? <p>세션 #{session.id} · {session.startedAt} 시작</p>
            : <p style={{ color: 'var(--text-secondary)' }}>세션을 시작하면 학생들이 입장할 수 있습니다</p>}
        </div>
        <div className="top-bar-right">
          {sessionActive && connected && (
            <span className="badge badge-green"><span className="dot dot-green" />WebSocket 연결</span>
          )}
          {sessionActive && !connected && (
            <span className="badge badge-orange"><span className="dot dot-gray" />연결 중...</span>
          )}
          <button className="btn btn-primary" onClick={handleStartSession} disabled={sessionActive}>
            세션 시작
          </button>
          <button className="btn btn-danger" onClick={handleEndSession} disabled={!sessionActive}>
            세션 종료
          </button>
        </div>
      </div>

      {/* 세션 ID 배너 */}
      {sessionActive && session && (
        <div style={{
          background: '#eff6ff', borderBottom: '1px solid #bfdbfe',
          padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 500 }}>
            📢 학생들에게 세션 ID를 알려주세요
          </span>
          <span style={{
            fontSize: 22, fontWeight: 800, letterSpacing: 4,
            color: '#1e40af', background: '#dbeafe', padding: '4px 18px', borderRadius: 8,
          }}>
            {session.id}
          </span>
          <button
            className="btn btn-outline"
            style={{ fontSize: 12, padding: '5px 12px' }}
            onClick={handleCopyId}
          >
            {copied ? '✓ 복사됨' : '복사'}
          </button>
          <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 'auto' }}>
            학생 접속 주소:{' '}
            <code style={{ background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>
              {window.location.origin}/student/{session.id}
            </code>
          </span>
        </div>
      )}

      {/* 본문 */}
      <div className="page-body two-col">
        {/* 좌: 마이크 + 세션 통계 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 마이크 상태 */}
          <div className="card">
            <p className="card-title">마이크 상태</p>
            <div className="mic-status">
              <span className={`dot ${mic.active ? 'dot-green' : 'dot-gray'}`} />
              <span>{mic.active ? '녹음 중' : '정지'}</span>
              {mic.error && (
                <span style={{ fontSize: 11, color: 'var(--red)', marginLeft: 8 }}>
                  오류: {mic.error}
                </span>
              )}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              세션 시작 시 자동으로 마이크 녹음이 시작됩니다
            </p>
            {!sessionActive && (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                세션을 시작하면 활성화됩니다
              </p>
            )}
          </div>

          {/* 현재 세션 통계 */}
          <div className="card">
            <p className="card-title">현재 세션 통계</p>
            <div className="stats-row">
              <div className="stat-box">
                <div className="stat-val red">{alertCount}</div>
                <div className="stat-label">알림 발생</div>
              </div>
              <div className="stat-box">
                <div className="stat-val">{alertCount ? `${avgConfusion}%` : '-'}</div>
                <div className="stat-label">평균 혼란도</div>
              </div>
              <div className="stat-box">
                <div className="stat-val">{session?.classId ?? '-'}</div>
                <div className="stat-label">반 ID</div>
              </div>
            </div>
          </div>

          {/* 서버 연결 정보 */}
          <div className="card">
            <p className="card-title">연결 정보</p>
            {[
              { label: 'Spring API', val: import.meta.env.VITE_API_URL || 'http://localhost:8080' },
              { label: 'WebSocket', val: sessionActive ? (connected ? '연결됨' : '연결 중...') : '대기 중' },
            ].map(({ label, val }) => (
              <div className="emotion-row" key={label}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 우: 실시간 알림 */}
        <div className="card" style={{ overflowY: 'auto', maxHeight: 560 }}>
          <div className="section-divider">
            <p className="card-title" style={{ marginBottom: 0 }}>
              실시간 알림
              {loadingAlerts && (
                <span style={{ fontWeight: 400, marginLeft: 8, color: 'var(--text-secondary)' }}>로딩 중...</span>
              )}
            </p>
            {alertCount > 0 && (
              <span className="badge badge-red">{alertCount}건</span>
            )}
          </div>

          {!sessionActive && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px 0', fontSize: 13 }}>
              세션을 시작하면 알림이 표시됩니다
            </div>
          )}

          {sessionActive && !loadingAlerts && alerts.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px 0', fontSize: 13 }}>
              아직 알림이 없습니다
            </div>
          )}

          {alerts.map((a) => (
            <div className="alert-card" key={a.id}>
              <div className="alert-card-title">혼란 감지 알림</div>
              <div className="alert-card-meta">
                {a.time} · 학생: <strong>{a.studentId}</strong>
                {' · '}confusedScore: <strong className="text-red">{(a.confusedScore ?? 0).toFixed(2)}</strong>
              </div>
              <div className="alert-card-meta mt-1">
                모르는 내용: <strong>{a.unclearTopic}</strong>
              </div>
              {a.reason && (
                <div className="alert-card-meta mt-1">{a.reason}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
