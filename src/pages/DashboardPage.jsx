import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import {
  createCurriculum,
  deleteCurriculum,
  getDashboardAiCoachingData,
  getCurriculums,
  getDashboardClasses,
  getKeywordReport,
  requestDashboardAiCoaching,
} from "../api";
import CurriculumManagerModal from "../components/CurriculumManagerModal";
import KeywordCloudPanel from "../components/KeywordCloudPanel";
import PinModal from "../components/PinModal";
import { formatSeoulClock, getSeoulDate } from "../utils/seoulTime";
import { BsLayoutSidebar } from "react-icons/bs";
import { GoChevronLeft, GoChevronRight } from "react-icons/go";
import { IoClose } from "react-icons/io5";

const ALL_CLASSES = "전체 반";
const PAGE_SIZE = 5;
const TREND_START_HOUR = 9;
const TREND_END_HOUR = 22;

function parseHourFromCapturedAt(value) {
  if (!value) {
    return null;
  }

  const match = String(value).match(/T(\d{2}):/);
  if (match) {
    return Number(match[1]);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    hour12: false,
  });

  return Number(formatter.format(date));
}

function normalizeResponse(dataArray) {
  if (!Array.isArray(dataArray)) {
    throw new Error("응답 형식이 올바르지 않습니다.");
  }

  return dataArray.map((item) => ({
    curriculum: item.curriculum ?? item.curriculumName ?? "",
    classId: item.classId ?? "-",
    alertCount: item.alertCount ?? 0,
    participantCount: item.participantCount ?? 0,
    avgConfusedScore: item.avgConfusedScore ?? 0,
    signalBreakdown: (item.signalBreakdown ?? []).map((signal) => ({
      signalType: signal.signalType ?? "",
      label: signal.label ?? signal.signalType ?? "-",
      count: signal.count ?? 0,
      ratio: signal.ratio ?? 0,
    })),
    recentAlerts: (item.recentAlerts ?? []).map((alert, index) => ({
      id: alert.id ?? `${item.classId}-${index}`,
      capturedAt: alert.capturedAt ?? alert.createdAt ?? "",
      time: formatSeoulClock(alert.capturedAt ?? alert.createdAt, false),
      topic: alert.lectureSummary ?? alert.unclearTopic ?? "-",
      reason: alert.reason ?? "",
      keywords: Array.isArray(alert.keywords) ? alert.keywords : [],
      confusion:
        alert.totalStudentCount > 0
          ? Math.round(
              ((alert.studentCount ?? 0) / alert.totalStudentCount) * 100,
            )
          : Math.round((alert.confusedScore ?? 0) * 100),
    })),
  }));
}

function buildDashboardView(items) {
  const totalAlerts = items.reduce((sum, item) => sum + item.alertCount, 0);
  const avgConfusedPct = items.length
    ? Math.round(
        (items.reduce((sum, item) => sum + item.avgConfusedScore, 0) /
          items.length) *
          100,
      )
    : 0;

  const kpi = {
    sessions: items.length,
    alerts: totalAlerts,
    avgConfusion: avgConfusedPct,
    students: items.reduce(
      (sum, item) => sum + (item.participantCount ?? 0),
      0,
    ),
  };

  const barData = items.map((item) => ({
    name: item.classId,
    count: item.alertCount,
  }));

  const alertHistory = items.flatMap((item) =>
    item.recentAlerts.map((alert) => ({
      ...alert,
      classTag: item.classId,
      curriculum: item.curriculum,
    })),
  );

  const hourlyBuckets = new Map();
  for (let hour = TREND_START_HOUR; hour <= TREND_END_HOUR; hour += 1) {
    hourlyBuckets.set(hour, []);
  }

  alertHistory.forEach((item) => {
    const hour = parseHourFromCapturedAt(item.capturedAt);
    if (hour == null || !hourlyBuckets.has(hour)) {
      return;
    }
    hourlyBuckets.get(hour).push(item.confusion);
  });

  const lineData = Array.from(hourlyBuckets.entries()).map(([hour, values]) => ({
    time: `${String(hour).padStart(2, "0")}:00`,
    confusion: values.length
      ? Math.round(
          values.reduce((sum, value) => sum + value, 0) / values.length,
        )
      : 0,
  }));

  const latestAlertHistory = alertHistory
    .slice()
    .sort((a, b) => (b.capturedAt ?? "").localeCompare(a.capturedAt ?? ""));

  const keywordCounts = alertHistory
    .flatMap((alert) => alert.keywords ?? [])
    .filter(Boolean)
    .reduce((acc, keyword) => {
      acc.set(keyword, (acc.get(keyword) ?? 0) + 1);
      return acc;
    }, new Map());

  const keywordCloud = Array.from(keywordCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 24)
    .map(([keyword, count]) => ({ keyword, count }));

  const signalCounts = items
    .flatMap((item) => item.signalBreakdown ?? [])
    .reduce((acc, signal) => {
      const current = acc.get(signal.signalType) ?? {
        label: signal.label,
        count: 0,
      };
      current.count += signal.count ?? 0;
      acc.set(signal.signalType, current);
      return acc;
    }, new Map());

  const totalSignals = Array.from(signalCounts.values()).reduce(
    (sum, item) => sum + item.count,
    0,
  );
  const signalData = Array.from(signalCounts.entries())
    .map(([signalType, signal]) => ({
      signalType,
      label: signal.label,
      count: signal.count,
      ratioPct:
        totalSignals > 0 ? Math.round((signal.count / totalSignals) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    kpi,
    barData,
    lineData,
    alertHistory: latestAlertHistory,
    keywordCloud,
    signalData,
  };
}

function EllipsisCell({ value, accent = false }) {
  return (
    <td
      style={{
        color: accent ? "var(--text-primary)" : "var(--text-secondary)",
        fontWeight: accent ? 500 : 400,
        maxWidth: 0,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {value || "-"}
    </td>
  );
}

function AlertDetailModal({ alert, onClose }) {
  if (!alert) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        zIndex: 1100,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: "min(720px, 100%)",
          height: "min(640px, calc(100vh - 48px))",
          padding: 0,
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "20px 22px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
          }}
        >
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
              알림 상세
            </h3>
            <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              {alert.time} · {alert.classTag} · 이해 어려움 {alert.confusion}%
            </div>
          </div>
          <button
            type="button"
            className="btn"
            style={{ padding: 4, background: "transparent", fontSize: 20 }}
            onClick={onClose}
          >
            <IoClose />
          </button>
        </div>

        <div style={{ padding: 22, overflowY: "auto", minHeight: 0 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              gap: 10,
              fontSize: 14,
              marginBottom: 20,
            }}
          >
            <div style={{ color: "var(--text-secondary)" }}>커리큘럼</div>
            <div>{alert.curriculum || "-"}</div>
            <div style={{ color: "var(--text-secondary)" }}>반</div>
            <div>{alert.classTag}</div>
            <div style={{ color: "var(--text-secondary)" }}>발생 시각</div>
            <div>{alert.time}</div>
            <div style={{ color: "var(--text-secondary)" }}>
              이해 어려움 정도
            </div>
            <div style={{ fontWeight: 600 }}>{alert.confusion}%</div>
          </div>

          {alert.keywords?.length > 0 && (
            <div style={{ margin: "20px 0 40px" }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  marginBottom: 8,
                  color: "var(--text-secondary)",
                }}
              >
                주요 키워드
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {alert.keywords.map((keyword) => (
                  <span key={keyword} className="badge badge-red">
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 18 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                marginBottom: 12,
                color: "var(--text-secondary)",
              }}
            >
              헷갈린 내용
            </div>
            <div
              style={{
                background: "#F8FAFC",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "14px 16px",
                whiteSpace: "pre-wrap",
                lineHeight: 1.7,
                fontSize: 14,
              }}
            >
              {alert.topic || "-"}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                marginBottom: 12,
                color: "var(--text-secondary)",
              }}
            >
              보충할 내용
            </div>
            <div
              style={{
                background: "#F8FAFC",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "14px 16px",
                whiteSpace: "pre-wrap",
                lineHeight: 1.7,
                fontSize: 14,
              }}
            >
              {alert.reason || "-"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KeywordReportModal({ keyword, report, loading, error, onClose }) {
  if (!keyword) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        zIndex: 1200,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: "min(640px, 100%)",
          maxHeight: "min(680px, calc(100vh - 48px))",
          padding: 0,
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "20px 22px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
          }}
        >
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
              {keyword} 리포트
            </h3>
            <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              주요 키워드 기반 학습 리포트
            </div>
          </div>
          <button
            type="button"
            className="btn"
            style={{ padding: 4, background: "transparent", fontSize: 20 }}
            onClick={onClose}
          >
            <IoClose />
          </button>
        </div>

        <div style={{ padding: 22, overflowY: "auto", minHeight: 0 }}>
          {loading && (
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              리포트를 불러오는 중입니다...
            </div>
          )}

          {!loading && error && (
            <div style={{ fontSize: 13, color: "#b91c1c", lineHeight: 1.6 }}>
              {error}
            </div>
          )}

          {!loading && !error && report && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 12,
                  marginBottom: 30,
                }}
              >
                {[
                  { label: "알림 횟수", value: `${report.alertCount}건` },
                  {
                    label: "평균 이해도",
                    value: `${report.avgUnderstanding}%`,
                  },
                  {
                    label: "보충 필요도",
                    value: `${report.reinforcementNeed}%`,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      border: "1px solid #dbe4f0",
                      borderRadius: 14,
                      padding: "14px 16px",
                      background: "#f8fbff",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        color: "#64748b",
                        marginBottom: 6,
                      }}
                    >
                      {item.label}
                    </div>
                    <div
                      style={{
                        fontSize: 24,
                        fontWeight: 800,
                        color:
                          (item.label === "평균 이해도") |
                          (item.label === "보충 필요도")
                            ? "#357DD2"
                            : "#0f172a",
                      }}
                    >
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 30 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                    marginBottom: 12,
                  }}
                >
                  리포트 요약
                </div>
                <div
                  style={{
                    background: "#F8FAFC",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "14px 16px",
                    lineHeight: 1.7,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {report.report}
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr",
                  gap: 10,
                  fontSize: 14,
                }}
              >
                <div style={{ color: "var(--text-secondary)" }}>
                  분석 기준일
                </div>
                <div>{report.date || "-"}</div>
                <div style={{ color: "var(--text-secondary)" }}>커리큘럼</div>
                <div>{report.curriculum || "-"}</div>
                <div style={{ color: "var(--text-secondary)" }}>반</div>
                <div>{report.classId || ALL_CLASSES}</div>
                <div style={{ color: "var(--text-secondary)" }}>
                  보충 필요 수준
                </div>
                <div>{report.reinforcementLevel || "-"}</div>
                <div style={{ color: "var(--text-secondary)" }}>
                  관련 알림 시각
                </div>
                <div>
                  {report.occurrenceTimes?.length > 0
                    ? report.occurrenceTimes.join(", ")
                    : "기록 없음"}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AiCoachingModal({ open, loading, error, coaching, onClose }) {
  if (!open) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        zIndex: 1300,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: "min(760px, 100%)",
          maxHeight: "min(760px, calc(100vh - 48px))",
          padding: 0,
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "20px 22px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
          }}
        >
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
              AI 수업 분석 리포트
            </h3>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              수업 데이터를 기반으로 강의 운영에 도움이 될 수 있는 인사이트를
              제공합니다.
            </div>
          </div>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            닫기
          </button>
        </div>

        <div style={{ padding: 22, overflowY: "auto", minHeight: 0 }}>
          {loading && (
            <div style={{ display: "grid", gap: 12 }}>
              {[
                "최근 알림 분석 중",
                "주요 키워드 정리 중",
                "코칭 제안 생성 중",
              ].map((label) => (
                <div
                  key={label}
                  style={{
                    padding: "14px 16px",
                    borderRadius: 12,
                    background: "#f8fbff",
                    border: "1px solid #dbe4f0",
                    fontSize: 14,
                    color: "#0f172a",
                  }}
                >
                  {label}...
                </div>
              ))}
            </div>
          )}

          {!loading && error && (
            <div style={{ fontSize: 13, color: "#b91c1c", lineHeight: 1.6 }}>
              {error}
            </div>
          )}

          {!loading && !error && coaching && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                <span
                  className={`badge ${coaching.priorityLevel === "높음" ? "badge-red" : coaching.priorityLevel === "보통" ? "badge-orange" : "badge-green"}`}
                >
                  우선순위 {coaching.priorityLevel || "보통"}
                </span>
              </div>

              <div style={{ marginBottom: 18 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                    marginBottom: 8,
                  }}
                >
                  한 줄 진단
                </div>
                <div
                  style={{
                    background: "#fafaf7",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "14px 16px",
                    lineHeight: 1.7,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {coaching.summary || "-"}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 14,
                  marginBottom: 18,
                }}
              >
                <div
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--text-secondary)",
                      marginBottom: 10,
                    }}
                  >
                    보충 설명 추천 개념
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {(coaching.reExplainTopics ?? []).map((item) => (
                      <span key={item} className="badge badge-green">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
                <div
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--text-secondary)",
                      marginBottom: 10,
                    }}
                  >
                    학생 반응 분석
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {(coaching.studentSignals ?? []).map((item) => (
                      <div key={item} style={{ fontSize: 13, lineHeight: 1.6 }}>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                    marginBottom: 8,
                  }}
                >
                  다음 수업 적용 제안
                </div>
                <div
                  style={{
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    borderRadius: 10,
                    padding: "14px 16px",
                    fontSize: 14,
                    color: "#1e3a8a",
                    lineHeight: 1.7,
                  }}
                >
                  {coaching.recommendedActionNow || "-"}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--text-secondary)",
                      marginBottom: 10,
                    }}
                  >
                    강의 개선 가이드
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {(coaching.coachingTips ?? []).map((item) => (
                      <div key={item} style={{ fontSize: 13, lineHeight: 1.6 }}>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
                <div
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--text-secondary)",
                      marginBottom: 10,
                    }}
                  >
                    이렇게 말해 보세요
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {(coaching.sampleMentions ?? []).map((item) => (
                      <div key={item} style={{ fontSize: 13, lineHeight: 1.6 }}>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [pinPassed, setPinPassed] = useState(false);
  const [date, setDate] = useState(getSeoulDate());
  const [items, setItems] = useState([]);
  const [curriculums, setCurriculums] = useState([]);
  const [selectedCurriculum, setSelectedCurriculum] = useState("");
  const [selectedClass, setSelectedClass] = useState(ALL_CLASSES);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [selectedKeyword, setSelectedKeyword] = useState("");
  const [keywordReport, setKeywordReport] = useState(null);
  const [keywordReportLoading, setKeywordReportLoading] = useState(false);
  const [keywordReportError, setKeywordReportError] = useState("");
  const [showCurriculumModal, setShowCurriculumModal] = useState(false);
  const [curriculumLoading, setCurriculumLoading] = useState(false);
  const [curriculumError, setCurriculumError] = useState("");
  const [showAiCoachingModal, setShowAiCoachingModal] = useState(false);
  const [aiCoachingLoading, setAiCoachingLoading] = useState(false);
  const [aiCoachingError, setAiCoachingError] = useState("");
  const [aiCoaching, setAiCoaching] = useState(null);

  const loadCurriculums = useCallback(async () => {
    setCurriculumLoading(true);
    setCurriculumError("");
    try {
      const data = await getCurriculums();
      const list = Array.isArray(data) ? data : [];
      setCurriculums(list);
      setSelectedCurriculum((prev) =>
        prev && list.some((item) => item.name === prev)
          ? prev
          : (list[0]?.name ?? ""),
      );
    } catch (fetchError) {
      setCurriculumError(
        `커리큘럼 목록을 불러오지 못했습니다. (${fetchError.message})`,
      );
      setCurriculums([]);
      setSelectedCurriculum("");
    } finally {
      setCurriculumLoading(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const raw = await getDashboardClasses(date);
      setItems(normalizeResponse(raw));
    } catch (fetchError) {
      setError(`서버 연결에 실패했습니다. (${fetchError.message})`);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void loadCurriculums();
  }, [loadCurriculums]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const classes = useMemo(() => {
    const curriculumItems = items.filter(
      (item) => item.curriculum === selectedCurriculum,
    );
    return [
      ALL_CLASSES,
      ...new Set(curriculumItems.map((item) => item.classId).filter(Boolean)),
    ];
  }, [items, selectedCurriculum]);

  useEffect(() => {
    if (selectedClass !== ALL_CLASSES && !classes.includes(selectedClass)) {
      setSelectedClass(ALL_CLASSES);
    }
  }, [classes, selectedClass]);

  const visibleItems = useMemo(
    () =>
      items
        .filter(
          (item) =>
            !selectedCurriculum || item.curriculum === selectedCurriculum,
        )
        .filter(
          (item) =>
            selectedClass === ALL_CLASSES || item.classId === selectedClass,
        ),
    [items, selectedClass, selectedCurriculum],
  );

  const { kpi, barData, lineData, alertHistory, keywordCloud, signalData } =
    useMemo(() => buildDashboardView(visibleItems), [visibleItems]);

  const totalPages = Math.max(1, Math.ceil(alertHistory.length / PAGE_SIZE));
  const pagedAlertHistory = useMemo(
    () =>
      alertHistory.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE,
      ),
    [alertHistory, currentPage],
  );

  useEffect(() => {
    setCurrentPage(1);
    setSelectedAlert(null);
    setSelectedKeyword("");
    setKeywordReport(null);
    setKeywordReportError("");
  }, [date, selectedCurriculum, selectedClass, items]);

  const handleKeywordClick = useCallback(
    async (keyword) => {
      setSelectedKeyword(keyword);
      setKeywordReport(null);
      setKeywordReportError("");
      setKeywordReportLoading(true);

      try {
        const data = await getKeywordReport({
          date,
          keyword,
          curriculum: selectedCurriculum,
          classId: selectedClass === ALL_CLASSES ? "" : selectedClass,
        });
        setKeywordReport(data);
      } catch (fetchError) {
        setKeywordReportError(
          `키워드 리포트를 불러오지 못했습니다. (${fetchError.message})`,
        );
      } finally {
        setKeywordReportLoading(false);
      }
    },
    [date, selectedClass, selectedCurriculum],
  );

  const handleCreateCurriculum = useCallback(
    async (name) => {
      await createCurriculum(name);
      await loadCurriculums();
    },
    [loadCurriculums],
  );

  const handleDeleteCurriculum = useCallback(
    async (curriculum) => {
      await deleteCurriculum(curriculum.id);
      await loadCurriculums();
      await fetchData();
    },
    [fetchData, loadCurriculums],
  );

  const handleOpenAiCoaching = useCallback(async () => {
    setShowAiCoachingModal(true);
    setAiCoachingLoading(true);
    setAiCoachingError("");
    setAiCoaching(null);

    try {
      const dashboardData = await getDashboardAiCoachingData({
        date,
        curriculum: selectedCurriculum,
        classId: selectedClass === ALL_CLASSES ? "" : selectedClass,
      });
      const coaching = await requestDashboardAiCoaching(dashboardData);
      setAiCoaching(coaching);
    } catch (fetchError) {
      setAiCoachingError(
        `AI 코칭 결과를 불러오지 못했습니다. (${fetchError.message})`,
      );
    } finally {
      setAiCoachingLoading(false);
    }
  }, [date, selectedClass, selectedCurriculum]);

  if (!pinPassed) {
    return <PinModal onSuccess={() => setPinPassed(true)} />;
  }

  return (
    <div className="page-wrapper">
      <AlertDetailModal
        alert={selectedAlert}
        onClose={() => setSelectedAlert(null)}
      />
      <KeywordReportModal
        keyword={selectedKeyword}
        report={keywordReport}
        loading={keywordReportLoading}
        error={keywordReportError}
        onClose={() => {
          setSelectedKeyword("");
          setKeywordReport(null);
          setKeywordReportError("");
        }}
      />
      <CurriculumManagerModal
        open={showCurriculumModal}
        curriculums={curriculums}
        loading={curriculumLoading}
        error={curriculumError}
        onCreate={handleCreateCurriculum}
        onDelete={handleDeleteCurriculum}
        onClose={() => setShowCurriculumModal(false)}
      />
      <AiCoachingModal
        open={showAiCoachingModal}
        loading={aiCoachingLoading}
        error={aiCoachingError}
        coaching={aiCoaching}
        onClose={() => {
          setShowAiCoachingModal(false);
          setAiCoachingError("");
        }}
      />

      <div className="top-bar">
        <div className="top-bar-left">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              className="btn btn-outline"
              style={{ padding: "8px", fontSize: 16 }}
              onClick={() => setSidebarOpen((prev) => !prev)}
            >
              <BsLayoutSidebar />
            </button>
            <h2 style={{ fontSize: 18 }}>대시보드</h2>
            <p style={{ fontSize: 14 }}>
              커리큘럼과 반을 선택해 알림 추이와 주요 키워드를 확인할 수
              있습니다.
            </p>
          </div>
        </div>
        <div className="top-bar-right">
          <label
            style={{
              fontSize: 14,
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>기준일</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "6px 10px",
                fontSize: 13,
                background: "#fff",
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
            />
          </label>
          <button
            className="btn btn-outline"
            style={{ fontSize: 14 }}
            onClick={() => setShowCurriculumModal(true)}
          >
            커리큘럼 관리
          </button>
          <button
            className="btn btn-outline"
            onClick={() => {
              void fetchData();
            }}
            disabled={loading}
            style={{ fontSize: 14 }}
          >
            {loading ? "불러오는 중..." : "새로고침"}
          </button>
        </div>
      </div>

      {(error || curriculumError) && (
        <div
          style={{
            padding: "10px 24px",
            background: "#fff8f0",
            borderBottom: "1px solid #fed7aa",
            fontSize: 12,
            color: "#92400e",
          }}
        >
          안내: {error || curriculumError}
        </div>
      )}

      <div
        className={`dashboard-layout ${sidebarOpen ? "sidebar-open" : "sidebar-collapsed"}`}
      >
        {sidebarOpen && (
          <aside className="dashboard-sidebar">
            <div className="card dashboard-sidebar-card">
              <div className="section-divider" style={{ marginBottom: 12 }}>
                <p className="card-title" style={{ marginBottom: 0 }}>
                  커리큘럼
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {curriculums.length === 0 && !curriculumLoading && (
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    등록된 커리큘럼이 없습니다.
                  </div>
                )}
                {curriculums.map((curriculum) => (
                  <button
                    key={curriculum.id}
                    className={`tab-btn ${selectedCurriculum === curriculum.name ? "active" : ""}`}
                    onClick={() => {
                      setSelectedCurriculum(curriculum.name);
                      setSelectedClass(ALL_CLASSES);
                    }}
                    style={{
                      width: "100%",
                      justifyContent: "flex-start",
                      textAlign: "left",
                    }}
                  >
                    {curriculum.name}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        )}

        <main className="dashboard-main">
          <div className="card">
            <div className="section-divider" style={{ marginBottom: 14 }}>
              <div>
                <p className="card-title" style={{ marginBottom: 4 }}>
                  반 선택
                </p>
                <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                  현재 커리큘럼: {selectedCurriculum || "-"}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                style={{ fontSize: 14 }}
                onClick={() => {
                  void handleOpenAiCoaching();
                }}
              >
                AI 코칭
              </button>
            </div>
            <div className="tab-group">
              {classes.map((className) => (
                <button
                  key={className}
                  className={`tab-btn ${selectedClass === className ? "active" : ""}`}
                  onClick={() => setSelectedClass(className)}
                >
                  {className}
                </button>
              ))}
            </div>
          </div>

          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-val">{kpi.sessions}</div>
              <div className="kpi-label">선택된 반 수</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-val red">{kpi.alerts}</div>
              <div className="kpi-label">총 알림 발생</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-val" style={{ color: "#357DD2" }}>
                {kpi.avgConfusion}%
              </div>
              <div className="kpi-label">평균 이해 어려움 정도</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-val">{kpi.students}</div>
              <div className="kpi-label">참여 학생 수</div>
            </div>
          </div>

          <div className="two-col">
            <div className="card">
              <p className="card-title">반별 알림 발생 횟수</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={barData}
                  margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                >
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                    formatter={(value) => [value, "알림 수"]}
                  />
                  <Bar dataKey="count" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <p className="card-title">시간대별 이해 어려움 추이</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart
                  data={lineData}
                  margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ec" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                    formatter={(value) => [`${value}%`, "이해 어려움 정도"]}
                  />
                  <ReferenceLine
                    y={50}
                    stroke="#ef4444"
                    strokeDasharray="5 5"
                  />
                  <Line
                    type="monotone"
                    dataKey="confusion"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <div
                style={{
                  textAlign: "center",
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  marginTop: 4,
                }}
              >
                빨간 점선은 기준값 50%를 뜻합니다.
              </div>
            </div>
          </div>

          <div
            className="card"
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            <div className="section-divider" style={{ marginBottom: 14 }}>
              <div>
                <h3>이해도 저하 신호 비율</h3>
                <div
                  style={{
                    fontSize: 14,
                    color: "var(--text-secondary)",
                    marginTop: 10,
                  }}
                >
                  표정 기반 불안정, 시선 이탈, 학생 직접 반응 신호를 비율로
                  보여줍니다.
                </div>
              </div>
              <span className="text-muted text-sm">
                총 {signalData.reduce((sum, item) => sum + item.count, 0)}건
              </span>
            </div>
            {signalData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={signalData}
                  layout="vertical"
                  margin={{ top: 4, right: 12, left: 36, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ec" />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fontSize: 12 }}
                    unit="%"
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fontSize: 14 }}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 14, borderRadius: 6 }}
                    formatter={(value, _name, item) => [
                      `${value}%`,
                      `발생 ${item?.payload?.count ?? 0}건`,
                    ]}
                  />
                  <Bar
                    dataKey="ratioPct"
                    fill="#51A2FF"
                    radius={[0, 6, 6, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div
                style={{
                  padding: "36px 0",
                  textAlign: "center",
                  fontSize: 14,
                  color: "var(--text-secondary)",
                }}
              >
                아직 집계된 이해도 저하 신호가 없습니다.
              </div>
            )}
          </div>

          <div className="card">
            <div className="section-divider" style={{ marginBottom: 14 }}>
              <div>
                <h3>주요 키워드 워드 클라우드</h3>
                <div
                  style={{
                    fontSize: 14,
                    color: "var(--text-secondary)",
                    marginTop: 10,
                  }}
                >
                  많이 등장한 키워드일수록 더 크게 표시됩니다.
                </div>
              </div>
            </div>
            <KeywordCloudPanel
              items={keywordCloud}
              onKeywordClick={(keyword) => {
                void handleKeywordClick(keyword);
              }}
            />
          </div>
          <div className="card" style={{ minHeight: "230px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 14,
              }}
            >
              <p className="card-title">알림 이력</p>
              <span
                className="text-muted text-sm"
                style={{ marginBottom: "15px" }}
              >
                &#40;총 {alertHistory.length}건&#41;
              </span>
            </div>
            <table
              className="data-table"
              style={{ tableLayout: "fixed", width: "100%" }}
            >
              <thead>
                <tr>
                  <th style={{ width: "12%" }}>시각</th>
                  <th style={{ width: "12%" }}>반</th>
                  <th style={{ width: "32%" }}>헷갈린 내용</th>
                  <th style={{ width: "32%" }}>보충할 내용</th>
                  <th style={{ width: "12%", textAlign: "right" }}>
                    이해 어려움 정도
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedAlertHistory.map((alert) => (
                  <tr
                    key={alert.id}
                    onClick={() => setSelectedAlert(alert)}
                    style={{ cursor: "pointer" }}
                  >
                    <td>{alert.time}</td>
                    <td>
                      <span
                        className="badge badge-blue"
                        style={{ fontSize: 11, padding: "2px 8px" }}
                      >
                        {alert.classTag}
                      </span>
                    </td>
                    <EllipsisCell value={alert.topic} accent />
                    <EllipsisCell value={alert.reason} />
                    <td style={{ textAlign: "right" }}>
                      <span className="text-red" style={{ fontWeight: 600 }}>
                        {alert.confusion}%
                      </span>
                    </td>
                  </tr>
                ))}
                {alertHistory.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        textAlign: "center",
                        color: "var(--text-secondary)",
                        padding: 24,
                      }}
                    >
                      {loading
                        ? "데이터를 불러오는 중..."
                        : "선택한 조건의 알림이 없습니다."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {alertHistory.length > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 20,
                }}
              >
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ fontSize: 20, padding: "6px" }}
                  disabled={currentPage === 1}
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(1, prev - 1))
                  }
                >
                  <GoChevronLeft />
                </button>
                <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ fontSize: 20, padding: "6px" }}
                  disabled={currentPage === totalPages}
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                  }
                >
                  <GoChevronRight />
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
