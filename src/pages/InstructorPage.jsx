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
  sendLectureChunk,
} from '../api';
import PinModal from '../components/PinModal';
import SessionSettingsModal from '../components/SessionSettingsModal';

function normalizeAlert(raw, fallback = {}) {
  return {
    id: raw.id,
    sessionId: raw.sessionId ?? fallback.sessionId ?? '-',
    classId: raw.classId ?? fallback.classId ?? '-',
    time: raw.capturedAt?.slice(11, 19) ?? raw.createdAt?.slice(11, 19) ?? '-',
    confusedScore: raw.confusedScore ?? 0,
    reason: raw.reason ?? '',
    unclearTopic: raw.unclearTopic ?? raw.lectureText ?? '(no transcript)',
    transcript: raw.lectureText ?? null,
    summary: raw.lectureSummary ?? null,
    summaryView: 'transcript',
  };
}

function SilenceToast({ onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 8000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div style={{
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
    }}>
      <div>
        <div style={{ fontWeight: 700 }}>30 minute silence warning</div>
        <div style={{ fontSize: 12 }}>Check whether the microphone is muted.</div>
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

  const processNextCandidateRef = useRef(() => {});

  const finalizeCandidate = useCallback(async (candidate, transcript) => {
    if (!session) {
      return;
    }

    const audioText = transcript.trim();

    try {
      const createdAlert = await sendLectureChunk({
        sessionId: candidate.sessionId ?? session.id,
        classId: candidate.classId ?? session.classId,
        capturedAt: candidate.capturedAt ?? new Date().toISOString().slice(0, 19),
        audioText,
        confusedScore: candidate.confusedScore ?? 0,
        reason: candidate.reason ?? '',
      });

      const normalized = upsertAlert(createdAlert, {
        sessionId: candidate.sessionId ?? session.id,
        classId: candidate.classId ?? session.classId,
      });

      if (audioText) {
        updateAlert(normalized.id, {
          transcript: audioText,
          unclearTopic: audioText,
        });

        const summaryResult = await postLectureSummary({
          alertId: normalized.id,
          audioText,
        });

        updateAlert(normalized.id, {
          summary: summaryResult.summary ?? '',
        });
      }
    } catch (error) {
      console.warn('candidate finalize error:', error.message);
      setSessionError('Failed to create or summarize the alert.');
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
      setSessionError('SpeechRecognition is not supported in this browser.');
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

  const handleToggleView = useCallback((alertId, summaryView) => {
    updateAlert(alertId, { summaryView });
  }, [updateAlert]);

  const alertCount = alerts.length;
  const avgConfusion = alertCount
    ? Math.round(alerts.reduce((sum, item) => sum + (item.confusedScore ?? 0), 0) / alertCount * 100)
    : 0;

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
          <h2>Instructor Console</h2>
          {session
            ? <p>Session #{session.id} · {session.startedAt} · class {session.classId}</p>
            : <p style={{ color: 'var(--text-secondary)' }}>Start a session to wait for candidate events.</p>}
        </div>
        <div className="top-bar-right">
          {sessionActive && connected && (
            <span className="badge badge-green"><span className="dot dot-green" />WebSocket connected</span>
          )}
          {sessionActive && !connected && (
            <span className="badge badge-orange"><span className="dot dot-gray" />WebSocket pending</span>
          )}
          <button className="btn btn-primary" onClick={() => setShowSettings(true)} disabled={sessionActive}>
            Start Session
          </button>
          <button className="btn btn-danger" onClick={handleEndSession} disabled={!sessionActive}>
            End Session
          </button>
        </div>
      </div>

      {sessionError && (
        <div style={{ padding: '10px 24px', background: '#fee2e2', color: '#b91c1c', fontSize: 13 }}>
          {sessionError}
        </div>
      )}

      {sessionActive && session && (
        <div style={{
          background: '#eff6ff',
          borderBottom: '1px solid #bfdbfe',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 600 }}>
            Share this session ID with students
          </span>
          <span style={{
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: 8,
            color: '#1e40af',
            background: '#dbeafe',
            padding: '4px 18px',
            borderRadius: 8,
            fontFamily: 'monospace',
          }}>
            {session.id}
          </span>
          <button
            className="btn btn-outline"
            style={{ fontSize: 12, padding: '5px 12px' }}
            onClick={handleCopyId}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 'auto' }}>
            Student URL:{' '}
            <code style={{ background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>
              {window.location.origin}/student/{session.id}
            </code>
          </span>
        </div>
      )}

      <div className="page-body two-col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <p className="card-title">Microphone</p>
            <div className="mic-status">
              <span className={`dot ${mic.active && !mic.muted ? 'dot-green' : mic.active && mic.muted ? 'dot-orange' : 'dot-gray'}`} />
              <span style={{ flex: 1 }}>
                {!mic.active ? 'Stopped' : mic.muted ? 'Muted' : 'Listening'}
              </span>
              {mic.active && (
                <button
                  className={`btn ${mic.muted ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: 12, padding: '4px 12px' }}
                  onClick={mic.toggleMute}
                >
                  {mic.muted ? 'Unmute' : 'Mute'}
                </button>
              )}
            </div>
            {mic.error && (
              <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>
                Error: {mic.error}
              </div>
            )}
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, marginBottom: 6 }}>
              Candidate events trigger a 2 minute transcript capture before an alert is created.
            </p>
            {stt.supported && stt.recording && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                background: '#f0fdf4',
                borderRadius: 6,
                fontSize: 12,
                color: '#166534',
              }}>
                <span className="dot dot-green" style={{ flexShrink: 0 }} />
                Recording transcript for current candidate event...
              </div>
            )}
            {!stt.supported && (
              <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>
                Web Speech API is not supported in this browser.
              </div>
            )}
          </div>

          <div className="card">
            <p className="card-title">Session Stats</p>
            <div className="stats-row">
              <div className="stat-box">
                <div className="stat-val red">{alertCount}</div>
                <div className="stat-label">Alerts</div>
              </div>
              <div className="stat-box">
                <div className="stat-val">{alertCount ? `${avgConfusion}%` : '-'}</div>
                <div className="stat-label">Avg confusion</div>
              </div>
              <div className="stat-box">
                <div className="stat-val">{session?.classId ?? '-'}</div>
                <div className="stat-label">Class</div>
              </div>
            </div>
            {session?.thresholdPct && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, textAlign: 'center' }}>
                Threshold {session.thresholdPct}%
              </div>
            )}
          </div>

          <div className="card">
            <p className="card-title">Connection</p>
            {[
              { label: 'Spring API', val: import.meta.env.VITE_API_URL || 'http://localhost:8080' },
              { label: 'WebSocket', val: sessionActive ? (connected ? 'Connected' : 'Connecting...') : 'Idle' },
              { label: 'Queued candidates', val: String(candidateQueueRef.current.length) },
            ].map(({ label, val }) => (
              <div className="emotion-row" key={label}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{val}</span>
              </div>
            ))}
          </div>

          {session?.curriculum && (
            <div className="card">
              <p className="card-title">Curriculum</p>
              <pre style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                whiteSpace: 'pre-wrap',
                margin: 0,
                fontFamily: 'inherit',
                lineHeight: 1.6,
              }}>
                {session.curriculum}
              </pre>
            </div>
          )}
        </div>

        <div className="card" style={{ overflowY: 'auto', maxHeight: 680 }}>
          <div className="section-divider">
            <p className="card-title" style={{ marginBottom: 0 }}>
              Alerts
              {loadingAlerts && (
                <span style={{ fontWeight: 400, marginLeft: 8, color: 'var(--text-secondary)' }}>Loading...</span>
              )}
            </p>
            {alertCount > 0 && (
              <span className="badge badge-red">{alertCount}</span>
            )}
          </div>

          {!sessionActive && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px 0', fontSize: 13 }}>
              Alerts appear after a candidate event is recorded and saved.
            </div>
          )}

          {sessionActive && !loadingAlerts && alerts.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px 0', fontSize: 13 }}>
              No saved alerts yet.
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
                PASS
              </button>

              <div className="alert-card-title">Saved Alert</div>
              <div className="alert-card-meta">
                {alert.time} · session <strong>{alert.sessionId}</strong>
                {' · '}score <strong className="text-red">{(alert.confusedScore ?? 0).toFixed(2)}</strong>
              </div>
              {alert.reason && (
                <div className="alert-card-meta mt-1">{alert.reason}</div>
              )}

              {(alert.transcript !== null || alert.summary !== null) && (
                <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <button
                      onClick={() => handleToggleView(alert.id, 'transcript')}
                      style={{
                        fontSize: 11,
                        padding: '3px 10px',
                        borderRadius: 5,
                        cursor: 'pointer',
                        border: '1px solid var(--border)',
                        background: alert.summaryView === 'transcript' ? 'var(--blue)' : '#f3f4f6',
                        color: alert.summaryView === 'transcript' ? '#fff' : '#374151',
                        fontWeight: 600,
                      }}
                    >
                      Full Transcript
                    </button>
                    <button
                      onClick={() => handleToggleView(alert.id, 'summary')}
                      disabled={!alert.summary}
                      style={{
                        fontSize: 11,
                        padding: '3px 10px',
                        borderRadius: 5,
                        cursor: alert.summary ? 'pointer' : 'default',
                        border: '1px solid var(--border)',
                        background: alert.summaryView === 'summary' ? 'var(--blue)' : '#f3f4f6',
                        color: alert.summaryView === 'summary' ? '#fff' : alert.summary ? '#374151' : '#9ca3af',
                        fontWeight: 600,
                      }}
                    >
                      Summary{!alert.summary ? ' (pending)' : ''}
                    </button>
                  </div>
                  <div style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    background: '#fafaf7',
                    borderRadius: 6,
                    padding: '8px 10px',
                    maxHeight: 160,
                    overflowY: 'auto',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    fontStyle: 'italic',
                  }}>
                    {alert.summaryView === 'transcript'
                      ? (alert.transcript || '(no transcript)')
                      : (alert.summary || '(summary pending)')}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
