import { useCallback, useEffect, useRef, useState } from 'react';
import { useStompAlert } from '../hooks/useStompAlert';
import { useMicrophone } from '../hooks/useMicrophone';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import {
  createSession,
  deleteAlert,
  endSession,
  getSessionAlerts,
  postLectureSummary,
  saveLectureSummary,
  sendLectureChunk,
} from '../api';
import PinModal from '../components/PinModal';
import SessionSettingsModal from '../components/SessionSettingsModal';

function normalizeAlert(raw, fallback = {}) {
  return {
    id: raw.id,
    sessionId: raw.sessionId ?? fallback.sessionId ?? '-',
    classId: raw.classId ?? fallback.classId ?? '-',
    studentCount: raw.studentCount ?? fallback.studentCount ?? 1,
    totalStudentCount: raw.totalStudentCount ?? fallback.totalStudentCount ?? 1,
    time: raw.capturedAt?.slice(11, 19) ?? raw.createdAt?.slice(11, 19) ?? '-',
    confusedScore: raw.confusedScore ?? 0,
    reason: raw.reason ?? '',
    unclearTopic: raw.unclearTopic ?? raw.lectureText ?? '(전사 내용 없음)',
    transcript: raw.lectureText ?? '',
    summary: raw.lectureSummary ?? '',
    summaryDraft: raw.lectureSummary ?? '',
    generatingSummary: false,
    savingSummary: false,
  };
}

function SilenceToast({ onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 8000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        zIndex: 999,
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        padding: '14px 18px',
        borderRadius: 10,
        border: '1px solid #fcd34d',
        background: '#fef3c7',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        color: '#92400e',
        fontSize: 13,
      }}
    >
      <div>
        <div style={{ fontWeight: 700 }}>30분 무음 경고</div>
        <div style={{ fontSize: 12 }}>마이크가 음소거 상태인지 확인해 주세요.</div>
      </div>
      <button
        onClick={onClose}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#92400e', fontSize: 18 }}
      >
        x
      </button>
    </div>
  );
}

export default function InstructorPage() {
  const [pinPassed, setPinPassed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [session, setSession] = useState(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [copied, setCopied] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [showSilenceToast, setShowSilenceToast] = useState(false);

  const candidateQueueRef = useRef([]);
  const activeCandidateRef = useRef(null);
  const alertsRef = useRef([]);

  const handleSilenceWarning = useCallback(() => setShowSilenceToast(true), []);

  const mic = useMicrophone({
    onChunk: () => {},
    chunkMs: 5000,
    onSilenceWarning: handleSilenceWarning,
  });

  const stt = useSpeechRecognition();

  const upsertAlert = useCallback((raw, fallback = {}) => {
    const normalized = normalizeAlert(raw, fallback);
    setAlerts((prev) => {
      const rest = prev.filter((item) => item.id !== normalized.id);
      return [normalized, ...rest];
    });
    return normalized;
  }, []);

  const updateAlert = useCallback((alertId, patch) => {
    setAlerts((prev) => prev.map((item) => (
      item.id === alertId ? { ...item, ...patch } : item
    )));
  }, []);

  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  const processNextCandidateRef = useRef(() => {});

  const finalizeCandidate = useCallback(async (candidate, transcript) => {
    if (!session) {
      return;
    }

    const audioText = transcript.trim();
    console.info('[InstructorPage] STT transcript result', {
      sessionId: candidate.sessionId ?? session.id,
      candidateCapturedAt: candidate.capturedAt ?? null,
      transcriptLength: audioText.length,
      transcript: audioText,
    });

    if (!audioText) {
      console.warn('[InstructorPage] alert save skipped because transcript is empty', {
        sessionId: candidate.sessionId ?? session.id,
        candidateCapturedAt: candidate.capturedAt ?? null,
      });
      activeCandidateRef.current = null;
      processNextCandidateRef.current();
      return;
    }

    try {
      const createdAlert = await sendLectureChunk({
        sessionId: candidate.sessionId ?? session.id,
        classId: candidate.classId ?? session.classId,
        studentCount: candidate.studentCount ?? 1,
        totalStudentCount: candidate.totalStudentCount ?? 1,
        capturedAt: candidate.capturedAt ?? new Date().toISOString().slice(0, 19),
        audioText,
        confusedScore: candidate.confusedScore ?? 0,
        reason: candidate.reason ?? '',
      });

      const normalized = upsertAlert(createdAlert, {
        sessionId: candidate.sessionId ?? session.id,
        classId: candidate.classId ?? session.classId,
        studentCount: candidate.studentCount ?? 1,
        totalStudentCount: candidate.totalStudentCount ?? 1,
      });

      updateAlert(normalized.id, {
        transcript: audioText,
        unclearTopic: audioText,
        summaryDraft: normalized.summaryDraft || '',
      });
    } catch (error) {
      console.warn('candidate finalize error:', error.message);
    } finally {
      activeCandidateRef.current = null;
      processNextCandidateRef.current();
    }
  }, [session, upsertAlert, updateAlert]);

  const processNextCandidate = useCallback(() => {
    if (!sessionActive || stt.recording) {
      return;
    }

    const nextCandidate = candidateQueueRef.current.shift();
    if (!nextCandidate) {
      return;
    }

    if (!stt.supported) {
      setSessionError('이 브라우저는 음성 인식을 지원하지 않습니다.');
      return;
    }

    activeCandidateRef.current = nextCandidate;
    stt.startRecording((transcript) => {
      void finalizeCandidate(nextCandidate, transcript);
    });
  }, [finalizeCandidate, sessionActive, stt]);

  processNextCandidateRef.current = processNextCandidate;

  const handleAlert = useCallback((payload) => {
    candidateQueueRef.current.push(payload);
    processNextCandidateRef.current();
  }, []);

  const { connected } = useStompAlert({
    sessionId: session?.id,
    onAlert: handleAlert,
    enabled: sessionActive,
  });

  const loadAlerts = useCallback(async (sessionId, fallbackClassId) => {
    setLoadingAlerts(true);
    try {
      const data = await getSessionAlerts(sessionId);
      const list = Array.isArray(data) ? data : (data?.content ?? data?.alerts ?? []);
      setAlerts(list.map((item) => normalizeAlert(item, { sessionId, classId: fallbackClassId })));
    } catch (error) {
      console.warn('load alerts failed:', error.message);
      setAlerts([]);
    } finally {
      setLoadingAlerts(false);
    }
  }, []);

  const handleSettingsConfirm = useCallback(async ({ thresholdPct, curriculum, classId }) => {
    setShowSettings(false);
    setSessionError('');

    let nextSession;
    try {
      const data = await createSession({ classId, thresholdPct, curriculum });
      nextSession = {
        id: data.sessionId ?? data.id,
        classId: data.classId ?? classId,
        startedAt: data.startedAt?.slice(11, 16) ?? new Date().toTimeString().slice(0, 5),
        thresholdPct: data.thresholdPct ?? thresholdPct,
        curriculum: data.curriculum ?? curriculum,
      };
    } catch (error) {
      console.warn('session create failed, using local fallback:', error.message);
      const now = new Date();
      nextSession = {
        id: String(Math.floor(100000 + Math.random() * 900000)),
        classId,
        startedAt: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        thresholdPct,
        curriculum,
      };
    }

    candidateQueueRef.current = [];
    activeCandidateRef.current = null;
    setSession(nextSession);
    setSessionActive(true);
    setAlerts([]);
    await mic.start();
    await loadAlerts(nextSession.id, nextSession.classId);
  }, [loadAlerts, mic]);

  const handleEndSession = useCallback(async () => {
    try {
      if (session) {
        await endSession(session.id);
      }
    } catch (error) {
      console.warn('session end failed:', error.message);
    }

    candidateQueueRef.current = [];
    activeCandidateRef.current = null;
    setSessionActive(false);
    setSession(null);
    setAlerts([]);
    mic.stop();
    stt.stopRecording();
  }, [mic, session, stt]);

  const handleCopyId = useCallback(() => {
    if (!session) {
      return;
    }

    navigator.clipboard.writeText(String(session.id));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [session]);

  const handlePass = useCallback(async (alertId) => {
    try {
      await deleteAlert(alertId);
    } catch (error) {
      console.warn('delete alert failed:', error.message);
    }

    setAlerts((prev) => prev.filter((item) => item.id !== alertId));
  }, []);

  const handleSummaryDraftChange = useCallback((alertId, summaryDraft) => {
    updateAlert(alertId, { summaryDraft });
  }, [updateAlert]);

  const handleGenerateSummary = useCallback(async (alert) => {
    const transcript = alert.transcript.trim();
    if (!transcript) {
      setSessionError('전사 내용이 없으면 AI 요약을 생성할 수 없습니다.');
      return;
    }

    updateAlert(alert.id, { generatingSummary: true });

    try {
      const result = await postLectureSummary({
        alertId: alert.id,
        audioText: transcript,
      });

      updateAlert(alert.id, {
        summary: result.summary ?? '',
        summaryDraft: result.summary ?? '',
        reason: result.recommendedConcept ?? alert.reason,
        generatingSummary: false,
      });
    } catch (error) {
      console.warn('summary generation failed:', error.message);
      updateAlert(alert.id, { generatingSummary: false });
      setSessionError('AI 요약 생성에 실패했습니다.');
    }
  }, [updateAlert]);

  const handleSaveSummary = useCallback(async (alertId) => {
    const currentAlert = alertsRef.current.find((item) => item.id === alertId);
    if (!currentAlert) {
      return;
    }

    updateAlert(alertId, { savingSummary: true });

    try {
      const saved = await saveLectureSummary({
        alertId,
        summary: currentAlert.summaryDraft ?? '',
        recommendedConcept: currentAlert.reason ?? '',
      });

      updateAlert(alertId, {
        summary: saved?.lectureSummary ?? currentAlert.summaryDraft ?? '',
        summaryDraft: saved?.lectureSummary ?? currentAlert.summaryDraft ?? '',
        reason: saved?.reason ?? currentAlert.reason ?? '',
        savingSummary: false,
      });
    } catch (error) {
      console.warn('summary save failed:', error.message);
      updateAlert(alertId, { savingSummary: false });
      setSessionError('요약 저장에 실패했습니다.');
    }
  }, [updateAlert]);

  const alertCount = alerts.length;
  const avgConfusion = alertCount
    ? Math.round(alerts.reduce((sum, item) => sum + (item.confusedScore ?? 0), 0) / alertCount * 100)
    : 0;
  const liveTranscriptPreview = stt.liveTranscript
    ? stt.liveTranscript.slice(-30)
    : '';

  if (!pinPassed) {
    return <PinModal onSuccess={() => setPinPassed(true)} />;
  }

  return (
    <div className="page-wrapper">
      {showSettings && (
        <SessionSettingsModal
          onConfirm={handleSettingsConfirm}
          onCancel={() => setShowSettings(false)}
        />
      )}

      {showSilenceToast && (
        <SilenceToast onClose={() => setShowSilenceToast(false)} />
      )}

      <div className="top-bar">
        <div className="top-bar-left">
          <h2>강사 콘솔</h2>
          {session
            ? <p>수업 #{session.id} · {session.startedAt} · 반 ID {session.classId}</p>
            : <p style={{ color: 'var(--text-secondary)' }}>수업을 시작하면 학생 알림을 기다립니다.</p>}
        </div>
        <div className="top-bar-right">
          {sessionActive && connected && (
            <span className="badge badge-green"><span className="dot dot-green" />웹소켓 연결됨</span>
          )}
          {sessionActive && !connected && (
            <span className="badge badge-orange"><span className="dot dot-gray" />웹소켓 연결 대기</span>
          )}
          <button className="btn btn-primary" onClick={() => setShowSettings(true)} disabled={sessionActive}>
            수업 시작
          </button>
          <button className="btn btn-danger" onClick={handleEndSession} disabled={!sessionActive}>
            수업 종료
          </button>
        </div>
      </div>

      {sessionError && (
        <div style={{ padding: '10px 24px', background: '#fee2e2', color: '#b91c1c', fontSize: 13 }}>
          {sessionError}
        </div>
      )}

      {sessionActive && session && (
        <div
          style={{
            background: '#eff6ff',
            borderBottom: '1px solid #bfdbfe',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 600 }}>
            학생들에게 이 수업 ID를 공유하세요
          </span>
          <span
            style={{
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: 8,
              color: '#1e40af',
              background: '#dbeafe',
              padding: '4px 18px',
              borderRadius: 8,
              fontFamily: 'monospace',
            }}
          >
            {session.id}
          </span>
          <button
            className="btn btn-outline"
            style={{ fontSize: 12, padding: '5px 12px' }}
            onClick={handleCopyId}
          >
            {copied ? '복사됨' : '복사'}
          </button>
          <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 'auto' }}>
            학생 접속 주소:{' '}
            <code style={{ background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>
              {window.location.origin}/student/{session.id}
            </code>
          </span>
        </div>
      )}

      <div className="page-body two-col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <p className="card-title">마이크</p>
            <div className="mic-status">
              <span className={`dot ${mic.active && !mic.muted ? 'dot-green' : mic.active && mic.muted ? 'dot-orange' : 'dot-gray'}`} />
              <span style={{ flex: 1 }}>
                {!mic.active ? '중지됨' : mic.muted ? '음소거됨' : '듣는 중'}
              </span>
              {mic.active && (
                <button
                  className={`btn ${mic.muted ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: 12, padding: '4px 12px' }}
                  onClick={mic.toggleMute}
                >
                  {mic.muted ? '음소거 해제' : '음소거'}
                </button>
              )}
            </div>
            {mic.error && (
              <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>
                오류: {mic.error}
              </div>
            )}
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, marginBottom: 6 }}>
              학생 알림 후보가 오면 2분 동안 음성을 전사한 뒤 알림을 저장합니다.
            </p>
            {stt.supported && stt.recording && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 6,
                  padding: '6px 10px',
                  background: '#f0fdf4',
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#166534',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="dot dot-green" style={{ flexShrink: 0 }} />
                  현재 학생 이벤트에 대한 전사를 녹음 중입니다...
                </div>
                <div
                  style={{
                    width: '100%',
                    fontSize: 11,
                    color: '#15803d',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={stt.liveTranscript || ''}
                >
                  {liveTranscriptPreview || '실시간 전사 내용이 아직 없습니다.'}
                </div>
              </div>
            )}
            {!stt.supported && (
              <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>
                이 브라우저는 Web Speech API를 지원하지 않습니다.
              </div>
            )}
          </div>

          <div className="card">
            <p className="card-title">수업 통계</p>
            <div className="stats-row">
              <div className="stat-box">
                <div className="stat-val red">{alertCount}</div>
                <div className="stat-label">알림 수</div>
              </div>
              <div className="stat-box">
                <div className="stat-val">{alertCount ? `${avgConfusion}%` : '-'}</div>
                <div className="stat-label">평균 이해 어려움 정도</div>
              </div>
              <div className="stat-box">
                <div className="stat-val">{session?.classId ?? '-'}</div>
                <div className="stat-label">반 ID</div>
              </div>
            </div>
            {session?.thresholdPct && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, textAlign: 'center' }}>
                임계값 {session.thresholdPct}%
              </div>
            )}
          </div>

          <div className="card">
            <p className="card-title">연결 상태</p>
            {[
              { label: 'Spring API', val: import.meta.env.VITE_API_URL || 'http://localhost:8080' },
              { label: '웹소켓', val: sessionActive ? (connected ? '연결됨' : '연결 중...') : '대기 중' },
              { label: '대기 중인 후보', val: String(candidateQueueRef.current.length) },
            ].map(({ label, val }) => (
              <div className="emotion-row" key={label}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{val}</span>
              </div>
            ))}
          </div>

          {session?.curriculum && (
            <div className="card">
              <p className="card-title">오늘의 커리큘럼</p>
              <pre
                style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap',
                  margin: 0,
                  fontFamily: 'inherit',
                  lineHeight: 1.6,
                }}
              >
                {session.curriculum}
              </pre>
            </div>
          )}
        </div>

        <div className="card" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 180px)', minHeight: 520 }}>
          <div className="section-divider">
            <p className="card-title" style={{ marginBottom: 0 }}>
              알림 목록
              {loadingAlerts && (
                <span style={{ fontWeight: 400, marginLeft: 8, color: 'var(--text-secondary)' }}>불러오는 중...</span>
              )}
            </p>
            {alertCount > 0 && (
              <span className="badge badge-red">{alertCount}</span>
            )}
          </div>

          {!sessionActive && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px 0', fontSize: 13 }}>
              학생 이벤트가 기록되고 저장되면 알림이 표시됩니다.
            </div>
          )}

          {sessionActive && !loadingAlerts && alerts.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px 0', fontSize: 13 }}>
              아직 저장된 알림이 없습니다.
            </div>
          )}

          {alerts.map((alert) => (
            <div className="alert-card" key={alert.id} style={{ position: 'relative' }}>
              <button
                onClick={() => handlePass(alert.id)}
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  background: '#f3f4f6',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '3px 10px',
                  fontSize: 11,
                  cursor: 'pointer',
                  color: '#6b7280',
                  fontWeight: 600,
                }}
              >
                넘기기
              </button>

              <div className="alert-card-title">저장된 알림</div>
              <div className="alert-card-meta">{alert.time}</div>

              <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                  전체 전사
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    background: '#fafaf7',
                    borderRadius: 6,
                    padding: '8px 10px',
                    minHeight: 72,
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    fontStyle: 'italic',
                  }}
                >
                  {alert.transcript || '(전사 내용 없음)'}
                </div>
              </div>

              <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginBottom: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>요약</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ fontSize: 11, padding: '4px 10px' }}
                      disabled={alert.generatingSummary || alert.savingSummary || !alert.transcript.trim()}
                      onClick={() => { void handleGenerateSummary(alert); }}
                    >
                      {alert.generatingSummary
                        ? 'AI 요약 생성 중...'
                        : alert.summary?.trim()
                          ? 'AI로 다시 요약'
                          : 'AI로 요약'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ fontSize: 11, padding: '4px 10px' }}
                      disabled={alert.savingSummary || alert.generatingSummary}
                      onClick={() => { void handleSaveSummary(alert.id); }}
                    >
                      {alert.savingSummary
                        ? '저장 중...'
                        : alert.summary?.trim()
                          ? '수정 저장'
                          : '직접 입력 저장'}
                    </button>
                  </div>
                </div>
                <textarea
                  value={alert.summaryDraft}
                  onChange={(e) => handleSummaryDraftChange(alert.id, e.target.value)}
                  placeholder="요약을 직접 입력하거나 AI 요약을 생성해 보세요."
                  rows={5}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 12,
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    lineHeight: 1.6,
                    color: 'var(--text-primary)',
                    background: '#fff',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
