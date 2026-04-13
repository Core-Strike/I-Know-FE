import { useCallback, useEffect, useRef, useState } from "react";
import { useStompAlert } from "../hooks/useStompAlert";
import { useMicrophone } from "../hooks/useMicrophone";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import {
  createSession,
  deleteAlert,
  endSession,
  endSessionOnUnload,
  getConfusedEvents,
  getCurriculums,
  getSession,
  getSessionAlerts,
  postLectureSummary,
  saveLectureSummary,
  saveUnderstandingDifficultyTrend,
  sendLectureChunk,
} from "../api";
import PinModal from "../components/PinModal";
import SessionSettingsModal from "../components/SessionSettingsModal";
import UnderstandingDifficultyGauge from "../components/UnderstandingDifficultyGauge";
import {
  formatSeoulClock,
  getSeoulDateTime,
  getSeoulTime,
} from "../utils/seoulTime";
import { BsFillMicFill, BsFillMicMuteFill } from "react-icons/bs";
import { IoPlay, IoStop } from "react-icons/io5";
import { FiTrash2 } from "react-icons/fi";

const MAX_KEYWORDS = 5;
const CONFUSION_WINDOW_MS = 2 * 60 * 1000;
const SESSION_METRICS_POLL_MS = 10000;
const UNDERSTANDING_TREND_UPLOAD_MS = 2 * 60 * 1000;

function getRecentConfusedStudentCount(events, now = Date.now()) {
  return new Set(
    (Array.isArray(events) ? events : [])
      .filter((event) => {
        const eventTime = event?.capturedAt
          ? new Date(event.capturedAt).getTime()
          : Number.NaN;
        return (
          Number.isFinite(eventTime) && now - eventTime <= CONFUSION_WINDOW_MS
        );
      })
      .map((event) => event.studentId)
      .filter(Boolean),
  ).size;
}

function getConfusionRatio(events, activeParticipantCount, now = Date.now()) {
  if (!activeParticipantCount) {
    return 0;
  }

  const recentConfusedStudentCount = getRecentConfusedStudentCount(events, now);
  return Math.round((recentConfusedStudentCount / activeParticipantCount) * 100);
}

function normalizeKeywordList(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  const keywords = [];
  for (const item of items) {
    if (typeof item !== "string") {
      continue;
    }

    const cleaned = item.trim().replace(/\s+/g, " ");
    if (!cleaned) {
      continue;
    }

    if (!keywords.includes(cleaned)) {
      keywords.push(cleaned);
    }

    if (keywords.length >= MAX_KEYWORDS) {
      break;
    }
  }

  return keywords;
}

function normalizeKeywordInput(value) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeAlert(raw, fallback = {}) {
  return {
    id: raw.id,
    sessionId: raw.sessionId ?? fallback.sessionId ?? "-",
    classId: raw.classId ?? fallback.classId ?? "-",
    studentCount: raw.studentCount ?? fallback.studentCount ?? 1,
    totalStudentCount: raw.totalStudentCount ?? fallback.totalStudentCount ?? 1,
    time: formatSeoulClock(raw.capturedAt ?? raw.createdAt),
    confusedScore: raw.confusedScore ?? 0,
    reason: raw.reason ?? "",
    unclearTopic:
      raw.unclearTopic ?? raw.lectureText ?? "(알림 구간 강의 내용 없음)",
    transcript: raw.lectureText ?? "",
    summary: raw.lectureSummary ?? "",
    summaryDraft: raw.lectureSummary ?? "",
    keywords: normalizeKeywordList(raw.keywords ?? []),
    keywordDraft: normalizeKeywordList(raw.keywords ?? []),
    keywordInput: "",
    editingKeywords: false,
    keywordError: "",
    generatingSummary: false,
    savingSummary: false,
  };
}

function buildAlertBatch(payload) {
  return {
    sessionId: payload.sessionId ?? "",
    classId: payload.classId ?? "",
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
  const nextReasons = [
    ...new Set([...batch.reasons, ...(payload.reason ? [payload.reason] : [])]),
  ];

  return {
    ...batch,
    sessionId: payload.sessionId ?? batch.sessionId,
    classId: payload.classId ?? batch.classId,
    studentCount: nextStudentCount,
    totalStudentCount: nextTotalStudentCount,
    confusedScore: Math.max(
      batch.confusedScore ?? 0,
      payload.confusedScore ?? 0,
    ),
    reasons: nextReasons,
    capturedAt: payload.capturedAt ?? batch.capturedAt,
    alertHits: (batch.alertHits ?? 1) + 1,
  };
}

function buildBatchReason(batch) {
  if (!batch.reasons?.length) {
    return "";
  }
  return batch.reasons.join(" / ");
}

function SilenceToast({ onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 8000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 999,
        display: "flex",
        gap: 12,
        alignItems: "center",
        padding: "14px 18px",
        borderRadius: 10,
        border: "1px solid #fcd34d",
        background: "#fef3c7",
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        color: "#92400e",
        fontSize: 13,
      }}
    >
      <div>
        <div style={{ fontWeight: 700 }}>30분 무음 경고</div>
        <div style={{ fontSize: 12 }}>
          마이크가 꺼져 있거나 음소거 상태인지 확인해 주세요.
        </div>
      </div>
      <button
        onClick={onClose}
        style={{
          border: "none",
          background: "transparent",
          cursor: "pointer",
          color: "#92400e",
          fontSize: 18,
        }}
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
  const [confusedEvents, setConfusedEvents] = useState([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [showSilenceToast, setShowSilenceToast] = useState(false);
  const [curriculums, setCurriculums] = useState([]);
  const [curriculumLoading, setCurriculumLoading] = useState(false);
  const [curriculumError, setCurriculumError] = useState("");

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

  // 음소거로 전환할 때는 진행 중인 STT 기록도 함께 중단한다.
  // mic, stt 선언 이후에 배치해야 TDZ 오류를 피할 수 있다.
  const handleToggleMute = useCallback(() => {
    if (!mic.muted) {
      // 음소거 전환 시 진행 중인 STT를 멈추고 배치 상태를 초기화한다.
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
    setAlerts((prev) =>
      prev.map((item) => (item.id === alertId ? { ...item, ...patch } : item)),
    );
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

  const finalizeBatch = useCallback(
    async (batch, transcript) => {
      if (!session) {
        return;
      }

      const audioText = transcript.trim();
      console.info("[InstructorPage] STT transcript result", {
        sessionId: batch.sessionId ?? session.id,
        capturedAt: batch.capturedAt ?? null,
        alertHits: batch.alertHits ?? 1,
        transcriptLength: audioText.length,
        transcript: audioText,
      });

      if (!audioText) {
        console.warn(
          "[InstructorPage] alert save skipped because transcript is empty",
          {
            sessionId: batch.sessionId ?? session.id,
            capturedAt: batch.capturedAt ?? null,
          },
        );
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
          summaryDraft: normalized.summaryDraft || "",
          generatingSummary: true,
        });

        try {
          const result = await postLectureSummary({
            alertId: normalized.id,
            audioText,
          });

          updateAlert(normalized.id, {
            summary: result.summary ?? "",
            summaryDraft: result.summary ?? "",
            reason: result.recommendedConcept ?? normalized.reason ?? "",
            keywords: result.keywords ?? [],
            generatingSummary: false,
          });
        } catch (summaryError) {
          console.warn("summary generation failed:", summaryError.message);
          updateAlert(normalized.id, { generatingSummary: false });
          setSessionError("AI 요약 생성에 실패했습니다.");
        }
      } catch (error) {
        console.warn("batch finalize error:", error.message);
      }
    },
    [session, upsertAlert, updateAlert],
  );

  const loadSessionMetrics = useCallback(async (sessionId) => {
    try {
      const [sessionData, eventData] = await Promise.all([
        getSession(sessionId),
        getConfusedEvents(sessionId),
      ]);

      setSession((prev) =>
        prev
          ? {
              ...prev,
              classId: sessionData.classId ?? prev.classId,
              thresholdPct: sessionData.thresholdPct ?? prev.thresholdPct,
              curriculum: sessionData.curriculum ?? prev.curriculum,
              activeParticipantCount:
                sessionData.activeParticipantCount ??
                prev.activeParticipantCount ??
                0,
            }
          : prev,
      );
      const normalizedEvents = Array.isArray(eventData) ? eventData : [];
      setConfusedEvents(normalizedEvents);

      return {
        sessionData,
        events: normalizedEvents,
        confusionRatio: getConfusionRatio(
          normalizedEvents,
          sessionData.activeParticipantCount ?? 0,
        ),
      };
    } catch (error) {
      console.warn("load session metrics failed:", error.message);
      return null;
    }
  }, []);

  const handleAlert = useCallback(
    async (payload) => {
      if (mic.muted) {
        return;
      }

      const metrics = await loadSessionMetrics(payload.sessionId);

      if (!stt.supported) {
        setSessionError("현재 브라우저에서는 음성 인식 기능을 지원하지 않습니다.");
        return;
      }

      const thresholdPct = metrics?.sessionData?.thresholdPct ?? session?.thresholdPct ?? 0;
      const confusionRatio = metrics?.confusionRatio ?? 0;
      if (confusionRatio < thresholdPct) {
        return;
      }

      if (recordingBatchRef.current) {
        recordingBatchRef.current = mergeAlertBatch(
          recordingBatchRef.current,
          payload,
        );
        return;
      }

      const nextBatch = buildAlertBatch(payload);
      recordingBatchRef.current = nextBatch;
      stt.startRecording((transcript) => {
        const completedBatch = recordingBatchRef.current ?? nextBatch;
        recordingBatchRef.current = null;
        void finalizeBatch(completedBatch, transcript);
      });
    },
    [finalizeBatch, loadSessionMetrics, mic.muted, session?.thresholdPct, stt],
  );

  const { connected } = useStompAlert({
    sessionId: session?.id,
    onAlert: handleAlert,
    enabled: sessionActive,
  });

  const loadAlerts = useCallback(async (sessionId, fallbackClassId) => {
    setLoadingAlerts(true);
    try {
      const data = await getSessionAlerts(sessionId);
      const list = Array.isArray(data)
        ? data
        : (data?.content ?? data?.alerts ?? []);
      setAlerts(
        list.map((item) =>
          normalizeAlert(item, { sessionId, classId: fallbackClassId }),
        ),
      );
    } catch (error) {
      console.warn("load alerts failed:", error.message);
      setAlerts([]);
    } finally {
      setLoadingAlerts(false);
    }
  }, []);

  const loadCurriculums = useCallback(async () => {
    setCurriculumLoading(true);
    setCurriculumError("");
    try {
      const data = await getCurriculums();
      setCurriculums(Array.isArray(data) ? data : []);
    } catch (error) {
      console.warn("load curriculums failed:", error.message);
      setCurriculumError("커리큘럼 목록을 불러오지 못했습니다.");
      setCurriculums([]);
    } finally {
      setCurriculumLoading(false);
    }
  }, []);

  const openSettings = useCallback(async () => {
    setShowSettings(true);
    await loadCurriculums();
  }, [loadCurriculums]);

  const handleSettingsConfirm = useCallback(
    async ({ thresholdPct, curriculum, classId }) => {
      setShowSettings(false);
      setSessionError("");

      let nextSession;
      try {
        const data = await createSession({ classId, thresholdPct, curriculum });
        nextSession = {
          id: data.sessionId ?? data.id,
          classId: data.classId ?? classId,
          startedAt: data.startedAt
            ? formatSeoulClock(data.startedAt, false)
            : getSeoulTime(),
          thresholdPct: data.thresholdPct ?? thresholdPct,
          curriculum: data.curriculum ?? curriculum,
          activeParticipantCount: data.activeParticipantCount ?? 0,
        };
      } catch (error) {
        console.warn(
          "session create failed, using local fallback:",
          error.message,
        );
        nextSession = {
          id: Array.from(
            { length: 8 },
            () =>
              "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[
                Math.floor(Math.random() * 36)
              ],
          ).join(""),
          classId,
          startedAt: getSeoulTime(),
          thresholdPct,
          curriculum,
          activeParticipantCount: 0,
        };
      }

      recordingBatchRef.current = null;
      sessionTerminatedRef.current = false;
      setSession(nextSession);
      setSessionActive(true);
      setAlerts([]);
      setConfusedEvents([]);
      await mic.start();
      await Promise.all([
        loadAlerts(nextSession.id, nextSession.classId),
        loadSessionMetrics(nextSession.id),
      ]);
    },
    [loadAlerts, loadSessionMetrics, mic],
  );

  const handleEndSession = useCallback(async () => {
    try {
      if (session) {
        await endSession(session.id);
      }
    } catch (error) {
      console.warn("session end failed:", error.message);
    }

    recordingBatchRef.current = null;
    sessionTerminatedRef.current = true;
    setSessionActive(false);
    setSession(null);
    setAlerts([]);
    setConfusedEvents([]);
    mic.stop();
    stt.stopRecording();
  }, [mic, session, stt]);

  useEffect(() => {
    if (!sessionActive || !session?.id) {
      return undefined;
    }

    void loadSessionMetrics(session.id);
    const timer = window.setInterval(() => {
      void loadSessionMetrics(session.id);
    }, SESSION_METRICS_POLL_MS);

    return () => window.clearInterval(timer);
  }, [loadSessionMetrics, session?.id, sessionActive]);

  useEffect(() => {
    if (
      !sessionActive ||
      !session?.id ||
      (session.activeParticipantCount ?? 0) <= 0
    ) {
      return undefined;
    }

    const uploadTrend = async () => {
      const metrics = await loadSessionMetrics(session.id);
      if (!metrics || (metrics.sessionData?.activeParticipantCount ?? 0) <= 0) {
        return;
      }

      try {
        await saveUnderstandingDifficultyTrend({
          sessionId: session.id,
          difficultyScore: metrics.confusionRatio,
          capturedAt: getSeoulDateTime(),
        });
      } catch (error) {
        console.warn("difficulty trend save failed:", error.message);
      }
    };

    const timer = window.setInterval(() => {
      void uploadTrend();
    }, UNDERSTANDING_TREND_UPLOAD_MS);

    return () => window.clearInterval(timer);
  }, [
    loadSessionMetrics,
    session?.activeParticipantCount,
    session?.id,
    sessionActive,
  ]);

  useEffect(() => {
    const terminateOnPageExit = () => {
      const currentSession = sessionRef.current;
      if (
        !sessionActiveRef.current ||
        !currentSession ||
        sessionTerminatedRef.current
      ) {
        return;
      }

      sessionTerminatedRef.current = true;
      endSessionOnUnload(currentSession.id);
    };

    window.addEventListener("pagehide", terminateOnPageExit);
    window.addEventListener("beforeunload", terminateOnPageExit);

    return () => {
      window.removeEventListener("pagehide", terminateOnPageExit);
      window.removeEventListener("beforeunload", terminateOnPageExit);
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
      console.warn("delete alert failed:", error.message);
    }

    setAlerts((prev) => prev.filter((item) => item.id !== alertId));
  }, []);

  const handleKeywordEditStart = useCallback(
    (alertId) => {
      const currentAlert = alertsRef.current.find((item) => item.id === alertId);
      if (!currentAlert) {
        return;
      }

      updateAlert(alertId, {
        editingKeywords: true,
        keywordDraft: normalizeKeywordList(currentAlert.keywords ?? []),
        keywordInput: "",
        keywordError: "",
      });
    },
    [updateAlert],
  );

  const handleKeywordEditCancel = useCallback(
    (alertId) => {
      const currentAlert = alertsRef.current.find((item) => item.id === alertId);
      if (!currentAlert) {
        return;
      }

      updateAlert(alertId, {
        editingKeywords: false,
        keywordDraft: normalizeKeywordList(currentAlert.keywords ?? []),
        keywordInput: "",
        keywordError: "",
      });
    },
    [updateAlert],
  );

  const handleKeywordInputChange = useCallback(
    (alertId, keywordInput) => {
      updateAlert(alertId, { keywordInput, keywordError: "" });
    },
    [updateAlert],
  );

  const handleKeywordRemove = useCallback(
    (alertId, keywordToRemove) => {
      const currentAlert = alertsRef.current.find((item) => item.id === alertId);
      if (!currentAlert) {
        return;
      }

      updateAlert(alertId, {
        keywordDraft: (currentAlert.keywordDraft ?? []).filter(
          (keyword) => keyword !== keywordToRemove,
        ),
        keywordError: "",
      });
    },
    [updateAlert],
  );

  const handleKeywordAdd = useCallback(
    (alertId) => {
      const currentAlert = alertsRef.current.find((item) => item.id === alertId);
      if (!currentAlert) {
        return;
      }

      const nextKeyword = normalizeKeywordInput(currentAlert.keywordInput ?? "");
      const currentDraft = normalizeKeywordList(currentAlert.keywordDraft ?? []);

      if (!nextKeyword) {
        updateAlert(alertId, { keywordError: "추가할 키워드를 입력해 주세요." });
        return;
      }

      if (currentDraft.includes(nextKeyword)) {
        updateAlert(alertId, { keywordError: "이미 추가된 키워드입니다." });
        return;
      }

      if (currentDraft.length >= MAX_KEYWORDS) {
        updateAlert(alertId, {
          keywordError: `키워드는 최대 ${MAX_KEYWORDS}개까지 저장할 수 있습니다.`,
        });
        return;
      }

      updateAlert(alertId, {
        keywordDraft: [...currentDraft, nextKeyword],
        keywordInput: "",
        keywordError: "",
      });
    },
    [updateAlert],
  );

  const handleSaveSummary = useCallback(
    async (alertId) => {
      const currentAlert = alertsRef.current.find(
        (item) => item.id === alertId,
      );
      if (!currentAlert) {
        return;
      }

      const nextKeywords = normalizeKeywordList(
        currentAlert.editingKeywords
          ? currentAlert.keywordDraft ?? []
          : currentAlert.keywords ?? [],
      );

      updateAlert(alertId, { savingSummary: true });

      try {
        const saved = await saveLectureSummary({
          alertId,
          summary: currentAlert.summaryDraft ?? "",
          recommendedConcept: currentAlert.reason ?? "",
          keywords: nextKeywords,
        });

        updateAlert(alertId, {
          summary: saved?.lectureSummary ?? currentAlert.summaryDraft ?? "",
          summaryDraft:
            saved?.lectureSummary ?? currentAlert.summaryDraft ?? "",
          reason: saved?.reason ?? currentAlert.reason ?? "",
          keywords: saved?.keywords ?? nextKeywords,
          keywordDraft: saved?.keywords ?? nextKeywords,
          keywordInput: "",
          editingKeywords: false,
          keywordError: "",
          savingSummary: false,
        });
      } catch (error) {
        console.warn("summary save failed:", error.message);
        updateAlert(alertId, { savingSummary: false });
        setSessionError("요약 저장에 실패했습니다.");
      }
    },
    [updateAlert],
  );

  const alertCount = alerts.length;
  const activeParticipantCount = session?.activeParticipantCount ?? 0;
  const recentConfusedStudentCount = getRecentConfusedStudentCount(confusedEvents);
  const confusionRatio = getConfusionRatio(
    confusedEvents,
    activeParticipantCount,
  );
  const avgUnderstanding = activeParticipantCount
    ? Math.max(0, 100 - confusionRatio)
    : 0;
  const understandingGaugeTitle = "실시간 이해도";
  const understandingGaugeHelperText =
    "현재 알림 기준으로 계산한 평균 이해도입니다.";
  const activeAlertHits = recordingBatchRef.current?.alertHits ?? 0;
  const liveTranscriptPreview = stt.liveTranscript
    ? stt.liveTranscript.slice(-30)
    : "";

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
          <h2 style={{ fontSize: 18 }}>수업 진행 대시보드</h2>
          {session ? (
            <p style={{ fontSize: 14 }}>
              수업 #{session.id} · 시작 {session.startedAt} · 반 {session.classId}
            </p>
          ) : (
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
              수업을 시작하면 학생들의 반응 알림이 이곳에 표시됩니다.
            </p>
          )}
        </div>
        <div className="top-bar-right">
          {sessionActive && connected && (
            <span className="badge badge-green">
              <span className="dot dot-green" />
              연결됨
            </span>
          )}
          {sessionActive && !connected && (
            <span className="badge badge-orange">
              <span className="dot dot-gray" />
              연결 중...
            </span>
          )}
          <button
            className="btn btn-primary"
            onClick={() => {
              void openSettings();
            }}
            disabled={sessionActive}
          >
            <IoPlay />
            수업 시작
          </button>
          <button
            className="btn btn-danger"
            onClick={handleEndSession}
            disabled={!sessionActive}
          >
            <IoStop />
            수업 종료
          </button>
        </div>
      </div>

      {sessionError && (
        <div
          style={{
            padding: "10px 24px",
            background: "#fee2e2",
            color: "#b91c1c",
            fontSize: 13,
          }}
        >
          {sessionError}
        </div>
      )}

      {sessionActive && session && (
        <div
          style={{
            background: "#eff6ff",
            borderBottom: "1px solid #bfdbfe",
            padding: "12px 24px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 14, color: "#1d4ed8", fontWeight: 600 }}>
            학생들에게 아래 수업 코드를 공유해 주세요.
            <span style={{ fontWeight: 400, marginLeft: 6, color: "#3b82f6" }}>
              (영문+숫자 8자리)
            </span>
          </span>
          <span
            style={{
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: 4,
              color: "#1e40af",
              background: "#dbeafe",
              padding: "6px 20px",
              borderRadius: 8,
              userSelect: "all",
            }}
          >
            {session.id}
          </span>
          <button
            className="btn btn-outline"
            style={{ fontSize: 14, padding: "6px 12px" }}
            onClick={handleCopyId}
          >
            {copied ? "복사됨" : "복사"}
          </button>
        </div>
      )}

      <div className="page-body two-col">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <p className="card-title">마이크 상태</p>
            <div className="mic-status">
              <span
                className={`dot ${mic.active && !mic.muted ? "dot-green" : mic.active && mic.muted ? "dot-orange" : "dot-gray"}`}
              />
              <span style={{ flex: 1, margin: "6px 0", fontSize: 16 }}>
                {!mic.active ? "중지됨" : mic.muted ? "음소거됨" : "사용 중"}
              </span>
              {mic.active && (
                <button
                  className={`btn ${mic.muted ? "btn-outline" : "btn-primary"}`}
                  style={{ fontSize: 16, padding: "12px" }}
                  onClick={handleToggleMute}
                >
                  {mic.muted ? <BsFillMicMuteFill /> : <BsFillMicFill />}
                </button>
              )}
            </div>
            {mic.error && (
              <div style={{ fontSize: 11, color: "var(--red)", marginTop: 6 }}>
                오류: {mic.error}
              </div>
            )}
            <p
              style={{
                fontSize: 14,
                color: "var(--text-secondary)",
                marginTop: 8,
                marginBottom: 6,
              }}
            >
              알림 발생 후 약 2분간 음성 기록이 진행되며, 동일 구간에서는
              알림이 한 번만 표시됩니다.
            </p>
            {stt.supported && stt.recording && !mic.muted && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 6,
                  marginTop: "20px",
                  padding: "6px 10px",
                  background: "#f0fdf4",
                  borderRadius: 6,
                  fontSize: 14,
                  color: "#166534",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="dot dot-green" style={{ flexShrink: 0 }} />
                  현재 알림 구간의 강의 내용을 기록하고 있습니다...
                </div>
                <div
                  style={{
                    width: "100%",
                    fontSize: 14,
                    color: "#15803d",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={stt.liveTranscript || ""}
                >
                  {liveTranscriptPreview ||
                    "실시간 알림 구간 강의 내용이 아직 없습니다."}
                </div>
              </div>
            )}
            {!stt.supported && (
              <div
                style={{ fontSize: 14, color: "#9ca3af", fontStyle: "italic" }}
              >
                현재 브라우저에서는 음성 인식 기능을 지원하지 않습니다.
              </div>
            )}
          </div>

          <div className="card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <p className="card-title">수업 통계</p>
              {session?.thresholdPct && (
                <div
                  style={{
                    fontSize: 14,
                    color: "var(--text-secondary)",
                    marginBottom: "14px",
                  }}
                >
                  감지 기준 {session.thresholdPct}%
                </div>
              )}
            </div>
            <div className="stats-row">
              <div className="stat-box">
                <div className="stat-val">{session?.classId ?? "-"}</div>
                <div className="stat-label">반 이름</div>
              </div>
              <div className="stat-box">
                <div className="stat-val blue">{alertCount}</div>
                <div className="stat-label">알림 수</div>
              </div>
              <div className="stat-box">
                <div className="stat-val">
                  {activeParticipantCount ? `${confusionRatio}%` : "-"}
                </div>
                <div className="stat-label">실시간 이해 어려움 정도</div>
              </div>
            </div>
          </div>

          <UnderstandingDifficultyGauge
            value={avgUnderstanding}
            title={understandingGaugeTitle}
            helperText={understandingGaugeHelperText}
          />
          {/* <div className="card">
            <p className="card-title">?곌껐 ?곹깭</p>
            {[
              {
                label: "諛깆뿏??二쇱냼",
                val: import.meta.env.VITE_API_URL || "http://localhost:8080",
              },
              {
                label: "?ㅼ떆媛??곌껐",
                val: sessionActive
                  ? connected
                    ? "?곌껐??
                    : "?곌껐 以?.."
                  : "?湲?以?,
              },
              {
                label: "?꾩옱 臾띠쓬 ?뚮┝",
                val: activeAlertHits ? `${activeAlertHits}嫄? : "?놁쓬",
              },
            ].map(({ label, val }) => (
              <div className="emotion-row" key={label}>
                <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                  {label}
                </span>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{val}</span>
              </div>
            ))}
          </div> */}

          {session?.curriculum && (
            <div className="card">
              <p className="card-title">현재 커리큘럼</p>
              <pre
                style={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  whiteSpace: "pre-wrap",
                  margin: 0,
                  fontFamily: "inherit",
                  lineHeight: 1.6,
                }}
              >
                {session.curriculum}
              </pre>
            </div>
          )}
        </div>

        <div
          className="card"
          style={{
            overflowY: "auto",
            maxHeight: "calc(100vh - 180px)",
            minHeight: 520,
          }}
        >
          <div className="section-divider">
            <p className="card-title" style={{ marginBottom: 0 }}>
              알림 이력
              {loadingAlerts && (
                <span
                  style={{
                    fontWeight: 400,
                    marginLeft: 8,
                    color: "var(--text-secondary)",
                  }}
                >
                  불러오는 중...
                </span>
              )}
            </p>
            {alertCount > 0 && (
              <span className="badge badge-red">{alertCount}</span>
            )}
          </div>

          {!sessionActive && (
            <div
              style={{
                textAlign: "center",
                color: "var(--text-secondary)",
                padding: "32px 0",
                fontSize: 16,
              }}
            >
              학생 이벤트가 기록되면 알림이 여기에 표시됩니다.
            </div>
          )}

          {sessionActive && !loadingAlerts && alerts.length === 0 && (
            <div
              style={{
                textAlign: "center",
                color: "var(--text-secondary)",
                padding: "32px 0",
                fontSize: 16,
              }}
            >
              아직 들어온 알림이 없습니다.
            </div>
          )}
          {/* ?뚮┝ */}
          {alerts.map((alert) => (
            <div
              className="alert-card"
              key={alert.id}
              style={{ position: "relative" }}
            >
              <button
                onClick={() => handlePass(alert.id)}
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  background: "#FEF2F2",
                  border: "1px solid #FFA2A2",
                  borderRadius: 6,
                  padding: "6px 8px",
                  fontSize: 18,
                  cursor: "pointer",
                  color: "#FF6467",
                  fontWeight: 600,
                }}
              >
                <FiTrash2 />
              </button>

              <div className="alert-card-title">알림 상세 정보</div>
              <div className="alert-card-meta">{alert.time}</div>

              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{ fontSize: 14, fontWeight: 700, color: "#374151" }}
                  >
                    주요 키워드
                  </div>
                  {alert.editingKeywords ? (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ fontSize: 13, padding: "6px 10px" }}
                        disabled={alert.savingSummary}
                        onClick={() => handleKeywordEditCancel(alert.id)}
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ fontSize: 13, padding: "6px 10px" }}
                        disabled={alert.savingSummary || alert.generatingSummary}
                        onClick={() => {
                          void handleSaveSummary(alert.id);
                        }}
                      >
                        {alert.savingSummary ? "저장 중..." : "수정 확인"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ fontSize: 13, padding: "6px 10px" }}
                      disabled={alert.savingSummary || alert.generatingSummary}
                      onClick={() => handleKeywordEditStart(alert.id)}
                    >
                      키워드 수정
                    </button>
                  )}
                </div>

                {alert.editingKeywords ? (
                  <>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      {(alert.keywordDraft ?? []).map((keyword) => (
                        <span
                          key={`${alert.id}-${keyword}`}
                          className="badge badge-green"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          {keyword}
                          <button
                            type="button"
                            onClick={() => handleKeywordRemove(alert.id, keyword)}
                            style={{
                              border: "none",
                              background: "transparent",
                              padding: 0,
                              cursor: "pointer",
                              color: "inherit",
                              fontSize: 14,
                              lineHeight: 1,
                            }}
                            aria-label={`${keyword} 제거`}
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="text"
                        value={alert.keywordInput ?? ""}
                        onChange={(e) =>
                          handleKeywordInputChange(alert.id, e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleKeywordAdd(alert.id);
                          }
                        }}
                        placeholder="키워드를 입력하세요"
                        style={{
                          flex: "1 1 220px",
                          minWidth: 0,
                          padding: "9px 12px",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 14,
                          outline: "none",
                          color: "var(--text-primary)",
                          background: "#fff",
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ fontSize: 13, padding: "6px 10px" }}
                        disabled={(alert.keywordDraft ?? []).length >= MAX_KEYWORDS}
                        onClick={() => handleKeywordAdd(alert.id)}
                      >
                        키워드 추가
                      </button>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      최대 {MAX_KEYWORDS}개까지 저장할 수 있습니다.
                    </div>
                    {alert.keywordError && (
                      <div style={{ fontSize: 12, color: "var(--red)" }}>
                        {alert.keywordError}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {alert.keywords?.length > 0 ? (
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        {alert.keywords.map((keyword) => (
                          <span
                            key={`${alert.id}-${keyword}`}
                            className="badge badge-green"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: 13,
                          color: "var(--text-secondary)",
                        }}
                      >
                        등록된 키워드가 없습니다.
                      </div>
                    )}
                  </>
                )}
              </div>

              <div
                style={{
                  marginTop: 10,
                  borderTop: "1px solid var(--border)",
                  paddingTop: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#374151",
                    marginBottom: 6,
                  }}
                >
                  알림 구간 강의 내용
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 400,
                    color: "var(--text-secondary)",
                    background: "#fafaf7",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "8px 10px",
                    minHeight: 72,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {alert.transcript || "(알림 구간 강의 내용 없음)"}
                </div>
              </div>

              <div
                style={{
                  marginTop: 10,
                  borderTop: "1px solid var(--border)",
                  paddingTop: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    marginBottom: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{ fontSize: 14, fontWeight: 700, color: "#374151" }}
                  >
                    요약
                  </div>
                </div>
                {alert.generatingSummary && (
                  <div
                    style={{
                      fontSize: 14,
                      color: "var(--text-secondary)",
                      marginBottom: 8,
                    }}
                  >
                    AI 요약을 자동으로 생성하고 있습니다...
                  </div>
                )}
                <div
                  style={{
                    padding: "12px 14px",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: "var(--text-primary)",
                    background: "#fafaf7",
                    minHeight: 96,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {alert.summaryDraft?.trim() || "아직 생성된 요약이 없습니다."}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
