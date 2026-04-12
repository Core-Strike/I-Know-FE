import { useCallback, useEffect, useRef, useState } from 'react';
import { useStompAlert } from '../hooks/useStompAlert';
import { useMicrophone } from '../hooks/useMicrophone';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import {
  createSession,
  deleteAlert,
  endSession,
  endSessionOnUnload,
  getCurriculums,
  getSessionAlerts,
  postLectureSummary,
  saveLectureSummary,
  sendLectureChunk,
} from '../api';
import PinModal from '../components/PinModal';
import SessionSettingsModal from '../components/SessionSettingsModal';
import { formatSeoulClock, getSeoulDateTime, getSeoulTime } from '../utils/seoulTime';

function normalizeAlert(raw, fallback = {}) {
  return {
    id: raw.id,
    sessionId: raw.sessionId ?? fallback.sessionId ?? '-',
    classId: raw.classId ?? fallback.classId ?? '-',
    studentCount: raw.studentCount ?? fallback.studentCount ?? 1,
    totalStudentCount: raw.totalStudentCount ?? fallback.totalStudentCount ?? 1,
    time: formatSeoulClock(raw.capturedAt ?? raw.createdAt),
    confusedScore: raw.confusedScore ?? 0,
    reason: raw.reason ?? '',
    unclearTopic: raw.unclearTopic ?? raw.lectureText ?? '(전사 내용 없음)',
    transcript: raw.lectureText ?? '',
    summary: raw.lectureSummary ?? '',
    summaryDraft: raw.lectureSummary ?? '',
    keywords: raw.keywords ?? [],
    generatingSummary: false,
    savingSummary: false,
  };
}

function buildAlertBatch(payload) {
  return {
    sessionId: payload.sessionId ?? '',
    classId: payload.classId ?? '',
    studentCount: payload.studentCount ?? 1,
    totalStudentCount: payload.totalStudentCount ?? 1,
    confusedScore: payload.confusedScore ?? 0,
    reasons: payload.reason ? [payload.reason] : [],
    capturedAt: payload.capturedAt ?? getSeoulDateTime(),
    alertHits: 1,
  };
}

function mergeAlertBatch(batch, payload) {
  const nextTotalStudentCount = Math.max(
    batch.totalStudentCount ?? 1,
    payload.totalStudentCount ?? 1,
  );
  const nextStudentCount = Math.min(
    nextTotalStudentCount,
    (batch.studentCount ?? 0) + (payload.studentCount ?? 1),
  );
  const nextReasons = [...new Set([
    ...batch.reasons,
    ...(payload.reason ? [payload.reason] : []),
  ])];

  return {
    ...batch,
    sessionId: payload.sessionId ?? batch.sessionId,
    classId: payload.classId ?? batch.classId,
    studentCount: nextStudentCount,
    totalStudentCount: nextTotalStudentCount,
    confusedScore: Math.max(batch.confusedScore ?? 0, payload.confusedScore ?? 0),
    reasons: nextReasons,
    capturedAt: payload.capturedAt ?? batch.capturedAt,
    alertHits: (batch.alertHits ?? 1) + 1,
  };
}

function buildBatchReason(batch) {
  if (!batch.reasons?.length) {
    return '';
  }
  return batch.reasons.join(' / ');
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
        <div style={{ fontSize: 12 }}>마이크가 꺼져 있거나 음소거 상태인지 확인해 주세요.</div>
      </div>
      <button
        onClick={onClose}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#92400e', fontSize: 18 }}
      >
        닫기
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
  const [curriculums, setCurriculums] = useState([]);
  const [curriculumLoading, setCurriculumLoading] = useState(false);
  const [curriculumError, setCurriculumError] = useState('');

  const recordingBatchRef = useRef(null);
  const alertsRef = useRef([]);
  const sessionRef = useRef(null);
  const sessionActiveRef = useRef(false);
  const sessionTerminatedRef = useRef(false);

  const handleSilenceWarning = useCallback(() => setShowSilenceToast(true), []);

  const mic = useMicrophone({
    onChunk: () => {},
    chunkMs: 5000,
    onSilenceWarning: handleSilenceWarning,
  });

  const stt = useSpeechRecognition();

  // 음소거 전환 — 음소거 시 STT도 함께 중단 (SpeechRecognition은 별도 마이크 스트림 사용)
  // mic, stt 선언 이후에 위치해야 의존성 배열 평가 시 TDZ 오류가 발생하지 않음
  const handleToggleMute = useCallback(() => {
    if (!mic.muted) {
      // 음소거로 전환: 진행 중인 STT 기록 중단 + 배치 초기화
      stt.stopRecording();
      recordingBatchRef.current = null;
    }
    mic.toggleMute();
  }, [mic, stt]);

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

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    sessionActiveRef.current = sessionActive;
  }, [sessionActive]);

  const finalizeBatch = useCallback(async (batch, transcript) => {
    if (!session) {
      return;
    }

    const audioText = transcript.trim();
    console.info('[InstructorPage] STT transcript result', {
      sessionId: batch.sessionId ?? session.id,
      capturedAt: batch.capturedAt ?? null,
      alertHits: batch.alertHits ?? 1,
      transcriptLength: audioText.length,
      transcript: audioText,
    });

    if (!audioText) {
      console.warn('[InstructorPage] alert save skipped because transcript is empty', {
        sessionId: batch.sessionId ?? session.id,
        capturedAt: batch.capturedAt ?? null,
      });
      return;
    }

    try {
      const createdAlert = await sendLectureChunk({
        sessionId: batch.sessionId ?? session.id,
        classId: batch.classId ?? session.classId,
        studentCount: batch.studentCount ?? 1,
        totalStudentCount: batch.totalStudentCount ?? 1,
        capturedAt: batch.capturedAt ?? getSeoulDateTime(),
        audioText,
        confusedScore: batch.confusedScore ?? 0,
        reason: buildBatchReason(batch),
      });

      const normalized = upsertAlert(createdAlert, {
        sessionId: batch.sessionId ?? session.id,
        classId: batch.classId ?? session.classId,
        studentCount: batch.studentCount ?? 1,
        totalStudentCount: batch.totalStudentCount ?? 1,
      });

      updateAlert(normalized.id, {
        transcript: audioText,
        unclearTopic: audioText,
        summaryDraft: normalized.summaryDraft || '',
        generatingSummary: true,
      });

      try {
        const result = await postLectureSummary({
          alertId: normalized.id,
          audioText,
        });

        updateAlert(normalized.id, {
          summary: result.summary ?? '',
          summaryDraft: result.summary ?? '',
          reason: result.recommendedConcept ?? normalized.reason ?? '',
          keywords: result.keywords ?? [],
          generatingSummary: false,
        });
      } catch (summaryError) {
        console.warn('summary generation failed:', summaryError.message);
        updateAlert(normalized.id, { generatingSummary: false });
        setSessionError('AI 요약 생성에 실패했습니다.');
      }
    } catch (error) {
      console.warn('batch finalize error:', error.message);
    }
  }, [session, upsertAlert, updateAlert]);

  const handleAlert = useCallback((payload) => {
    if (!stt.supported) {
      setSessionError('현재 브라우저는 음성 인식을 지원하지 않습니다.');
      return;
    }

    if (recordingBatchRef.current) {
      recordingBatchRef.current = mergeAlertBatch(recordingBatchRef.current, payload);
      return;
    }

    const nextBatch = buildAlertBatch(payload);
    recordingBatchRef.current = nextBatch;
    stt.startRecording((transcript) => {
      const completedBatch = recordingBatchRef.current ?? nextBatch;
      recordingBatchRef.current = null;
      void finalizeBatch(completedBatch, transcript);
    });
  }, [finalizeBatch, stt]);

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

  const loadCurriculums = useCallback(async () => {
    setCurriculumLoading(true);
    setCurriculumError('');
    try {
      const data = await getCurriculums();
      setCurriculums(Array.isArray(data) ? data : []);
    } catch (error) {
      console.warn('load curriculums failed:', error.message);
      setCurriculumError('커리큘럼 목록을 불러오지 못했습니다.');
      setCurriculums([]);
    } finally {
      setCurriculumLoading(false);
    }
  }, []);

  const openSettings = useCallback(async () => {
    setShowSettings(true);
    await loadCurriculums();
  }, [loadCurriculums]);

  const handleSettingsConfirm = useCallback(async ({ thresholdPct, curriculum, classId }) => {
    setShowSettings(false);
    setSessionError('');

    let nextSession;
    try {
      const data = await createSession({ classId, thresholdPct, curriculum });
      nextSession = {
        id: data.sessionId ?? data.id,
        classId: data.classId ?? classId,
        startedAt: data.startedAt ? formatSeoulClock(data.startedAt, false) : getSeoulTime(),
        thresholdPct: data.thresholdPct ?? thresholdPct,
        curriculum: data.curriculum ?? curriculum,
      };
    } catch (error) {
      console.warn('session create failed, using local fallback:', error.message);
      nextSession = {
        id: Array.from({ length: 8 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join(''),
        classId,
        startedAt: getSeoulTime(),
        thresholdPct,
        curriculum,
      };
    }

    recordingBatchRef.current = null;
    sessionTerminatedRef.current = false;
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

    recordingBatchRef.current = null;
    sessionTerminatedRef.current = true;
    setSessionActive(false);
    setSession(null);
    setAlerts([]);
    mic.stop();
    stt.stopRecording();
  }, [mic, session, stt]);

  useEffect(() => {
    const terminateOnPageExit = () => {
      const currentSession = sessionRef.current;
      if (!sessionActiveRef.current || !currentSession || sessionTerminatedRef.current) {
        return;
      }

      sessionTerminatedRef.current = true;
      endSessionOnUnload(currentSession.id);
    };

    window.addEventListener('pagehide', terminateOnPageExit);
    window.addEventListener('beforeunload', terminateOnPageExit);

    return () => {
      window.removeEventListener('pagehide', terminateOnPageExit);
      window.removeEventListener('beforeunload', terminateOnPageExit);
    };
  }, []);

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
        keywords: currentAlert.keywords ?? [],
      });

      updateAlert(alertId, {
        summary: saved?.lectureSummary ?? currentAlert.summaryDraft ?? '',
        summaryDraft: saved?.lectureSummary ?? currentAlert.summaryDraft ?? '',
        reason: saved?.reason ?? currentAlert.reason ?? '',
        keywords: saved?.keywords ?? currentAlert.keywords ?? [],
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
    ? Math.round(alerts.reduce((sum, item) => {
      const ratio = item.totalStudentCount > 0
        ? (item.studentCount ?? 0) / item.totalStudentCount
        : (item.confusedScore ?? 0);
      return sum + ratio;
    }, 0) / alertCount * 100)
    : 0;
  const activeAlertHits = recordingBatchRef.current?.alertHits ?? 0;
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
          curriculums={curriculums}
          loading={curriculumLoading}
          error={curriculumError}
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
            ? <p>수업 #{session.id} · 시작 {session.startedAt} · 반 {session.classId}</p>
            : <p style={{ color: 'var(--text-secondary)' }}>수업을 시작하면 학생 알림이 이곳에 표시됩니다.</p>}
        </div>
        <div className="top-bar-right">
          {sessionActive && connected && (
            <span className="badge badge-green"><span className="dot dot-green" />연결됨</span>
          )}
          {sessionActive && !connected && (
            <span className="badge badge-orange"><span className="dot dot-gray" />연결 중...</span>
          )}
          <button className="btn btn-primary" onClick={() => { void openSettings(); }} disabled={sessionActive}>
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
            학생들에게 아래 수업 코드를 공유해 주세요.
            <span style={{ fontWeight: 400, marginLeft: 6, color: '#3b82f6' }}>(영문+숫자 8자리)</span>
          </span>
          <span
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: 4,
              color: '#1e40af',
              background: '#dbeafe',
              padding: '6px 20px',
              borderRadius: 8,
              fontFamily: 'monospace',
              userSelect: 'all',
            }}
          >
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

      <div className="page-body two-col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <p className="card-title">마이크 상태</p>
            <div className="mic-status">
              <span className={`dot ${mic.active && !mic.muted ? 'dot-green' : mic.active && mic.muted ? 'dot-orange' : 'dot-gray'}`} />
              <span style={{ flex: 1 }}>
                {!mic.active ? '중지됨' : mic.muted ? '음소거됨' : '사용 중'}
              </span>
              {mic.active && (
                <button
                  className={`btn ${mic.muted ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: 12, padding: '4px 12px' }}
                  onClick={handleToggleMute}
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
              학생 알림이 들어오면 30초 동안 강의 음성을 기록하고, 그 사이의 알림은 하나로 묶어 처리합니다.
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
                  현재 알림에 대한 강의 내용을 기록하고 있습니다...
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
                현재 브라우저는 음성 인식 기능을 지원하지 않습니다.
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
                <div className="stat-label">반 이름</div>
              </div>
            </div>
            {session?.thresholdPct && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, textAlign: 'center' }}>
                감지 기준 {session.thresholdPct}%
              </div>
            )}
          </div>

          <div className="card">
            <p className="card-title">연결 상태</p>
            {[
              { label: '백엔드 주소', val: import.meta.env.VITE_API_URL || 'http://localhost:8080' },
              { label: '실시간 연결', val: sessionActive ? (connected ? '연결됨' : '연결 중...') : '대기 중' },
              { label: '현재 묶음 알림', val: activeAlertHits ? `${activeAlertHits}건` : '없음' },
            ].map(({ label, val }) => (
              <div className="emotion-row" key={label}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{val}</span>
              </div>
            ))}
          </div>

          {session?.curriculum && (
            <div className="card">
              <p className="card-title">현재 커리큘럼</p>
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
              학생 이벤트가 기록되면 알림이 여기에 표시됩니다.
            </div>
          )}

          {sessionActive && !loadingAlerts && alerts.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px 0', fontSize: 13 }}>
              아직 들어온 알림이 없습니다.
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
                  기록 삭제
              </button>

              <div className="alert-card-title">접수된 알림</div>
              <div className="alert-card-meta">{alert.time}</div>

              {alert.keywords?.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {alert.keywords.map((keyword) => (
                    <span key={`${alert.id}-${keyword}`} className="badge badge-green">
                      {keyword}
                    </span>
                  ))}
                </div>
              )}

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
                      className="btn btn-primary"
                      style={{ fontSize: 11, padding: '4px 10px' }}
                      disabled={alert.savingSummary || alert.generatingSummary}
                      onClick={() => { void handleSaveSummary(alert.id); }}
                    >
                      {alert.savingSummary
                        ? '저장 중...'
                        : alert.summary?.trim()
                          ? '수정 내용 저장'
                          : '직접 입력 저장'}
                    </button>
                  </div>
                </div>
                {alert.generatingSummary && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    AI 요약을 자동으로 생성하고 있습니다...
                  </div>
                )}
                <textarea
                  value={alert.summaryDraft}
                  onChange={(e) => handleSummaryDraftChange(alert.id, e.target.value)}
                  placeholder="요약을 직접 수정할 수 있습니다."
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
