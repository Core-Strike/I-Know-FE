import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, CartesianGrid,
} from 'recharts';
import { getDashboardClasses } from '../api';
import PinModal from '../components/PinModal';
import { CURRICULUM_OPTIONS, DEFAULT_CURRICULUM } from '../constants/curriculum';
import { formatSeoulClock, getSeoulDate } from '../utils/seoulTime';

const ALL_CLASSES = '전체 반';
const PAGE_SIZE = 5;
const todayStr = () => getSeoulDate();

function normalizeCurriculum(value) {
  return CURRICULUM_OPTIONS.includes(value) ? value : DEFAULT_CURRICULUM;
}

function normalizeResponse(dataArray) {
  if (!Array.isArray(dataArray)) {
    throw new Error('응답 형식이 올바르지 않습니다.');
  }

  return dataArray.map((item) => ({
    curriculum: normalizeCurriculum(item.curriculum ?? item.curriculumName),
    classId: item.classId ?? '-',
    alertCount: item.alertCount ?? 0,
    participantCount: item.participantCount ?? 0,
    avgConfusedScore: item.avgConfusedScore ?? 0,
    recentAlerts: (item.recentAlerts ?? []).map((alert, index) => ({
      id: alert.id ?? `${item.classId}-${index}`,
      capturedAt: alert.capturedAt ?? alert.createdAt ?? '',
      time: formatSeoulClock(alert.capturedAt ?? alert.createdAt, false),
      topic: alert.lectureSummary ?? alert.unclearTopic ?? '-',
      reason: alert.reason ?? '',
      keywords: Array.isArray(alert.keywords) ? alert.keywords : [],
      confusion: alert.totalStudentCount > 0
        ? Math.round(((alert.studentCount ?? 0) / alert.totalStudentCount) * 100)
        : Math.round((alert.confusedScore ?? 0) * 100),
    })),
  }));
}

function buildDashboardView(items) {
  const totalAlerts = items.reduce((sum, item) => sum + item.alertCount, 0);
  const avgConfusedPct = items.length
    ? Math.round(items.reduce((sum, item) => sum + item.avgConfusedScore, 0) / items.length * 100)
    : 0;

  const kpi = {
    sessions: items.length,
    alerts: totalAlerts,
    avgConfusion: avgConfusedPct,
    students: items.reduce((sum, item) => sum + (item.participantCount ?? 0), 0),
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

  const lineData = alertHistory
    .slice()
    .sort((a, b) => (a.capturedAt ?? '').localeCompare(b.capturedAt ?? ''))
    .map((item) => ({ time: item.time, confusion: item.confusion }));

  const latestAlertHistory = alertHistory
    .slice()
    .sort((a, b) => (b.capturedAt ?? '').localeCompare(a.capturedAt ?? ''));

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

  return { kpi, barData, lineData, alertHistory: latestAlertHistory, keywordCloud };
}

function keywordStyle(count, maxCount) {
  const ratio = maxCount > 0 ? count / maxCount : 0;
  const fontSize = 14 + Math.round(ratio * 18);
  const opacity = 0.55 + ratio * 0.45;
  const bg = ratio > 0.66 ? '#dbeafe' : ratio > 0.33 ? '#eff6ff' : '#f8fafc';

  return {
    fontSize,
    opacity,
    background: bg,
    color: '#1e3a8a',
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid #bfdbfe',
    fontWeight: ratio > 0.66 ? 700 : 600,
    lineHeight: 1.2,
  };
}

function EllipsisCell({ value, accent = false }) {
  return (
    <td
      style={{
        color: accent ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontWeight: accent ? 500 : 400,
        maxWidth: 0,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {value || '-'}
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
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 1100,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: 'min(720px, 100%)',
          height: 'min(640px, calc(100vh - 48px))',
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '20px 22px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
          }}
        >
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>알림 상세</h3>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {alert.time} · {alert.classTag} · 이해 어려움 {alert.confusion}%
            </div>
          </div>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            닫기
          </button>
        </div>

        <div style={{ padding: 22, overflowY: 'auto', minHeight: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, fontSize: 13, marginBottom: 20 }}>
            <div style={{ color: 'var(--text-secondary)' }}>커리큘럼</div>
            <div>{alert.curriculum || '-'}</div>
            <div style={{ color: 'var(--text-secondary)' }}>반</div>
            <div>{alert.classTag}</div>
            <div style={{ color: 'var(--text-secondary)' }}>발생 시각</div>
            <div>{alert.time}</div>
            <div style={{ color: 'var(--text-secondary)' }}>이해 어려움 정도</div>
            <div>{alert.confusion}%</div>
          </div>

          {alert.keywords?.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)' }}>주요 키워드</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {alert.keywords.map((keyword) => (
                  <span key={keyword} className="badge badge-green">{keyword}</span>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)' }}>헷갈린 내용</div>
            <div
              style={{
                background: '#fafaf7',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '14px 16px',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.7,
                fontSize: 14,
              }}
            >
              {alert.topic || '-'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)' }}>보충할 내용</div>
            <div
              style={{
                background: '#fafaf7',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '14px 16px',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.7,
                fontSize: 14,
              }}
            >
              {alert.reason || '-'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [pinPassed, setPinPassed] = useState(false);
  const [date, setDate] = useState(todayStr());
  const [items, setItems] = useState([]);
  const [selectedCurriculum, setSelectedCurriculum] = useState(DEFAULT_CURRICULUM);
  const [selectedClass, setSelectedClass] = useState(ALL_CLASSES);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedAlert, setSelectedAlert] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const raw = await getDashboardClasses(date);
      const normalized = normalizeResponse(raw);
      setItems(normalized);
      setSelectedCurriculum(normalizeCurriculum(normalized[0]?.curriculum));
      setSelectedClass(ALL_CLASSES);
    } catch (e) {
      setError(`서버 연결에 실패했습니다. (${e.message})`);
      setItems([]);
      setSelectedCurriculum(DEFAULT_CURRICULUM);
      setSelectedClass(ALL_CLASSES);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const curriculums = CURRICULUM_OPTIONS;

  const curriculumItems = useMemo(
    () => items.filter((item) => normalizeCurriculum(item.curriculum) === selectedCurriculum),
    [items, selectedCurriculum],
  );

  const classes = useMemo(
    () => [ALL_CLASSES, ...new Set(curriculumItems.map((item) => item.classId).filter(Boolean))],
    [curriculumItems],
  );

  useEffect(() => {
    if (!curriculums.includes(selectedCurriculum)) {
      setSelectedCurriculum(DEFAULT_CURRICULUM);
    }
  }, [curriculums, selectedCurriculum]);

  useEffect(() => {
    if (!classes.includes(selectedClass)) {
      setSelectedClass(ALL_CLASSES);
    }
  }, [classes, selectedClass]);

  const visibleItems = selectedClass === ALL_CLASSES
    ? curriculumItems
    : curriculumItems.filter((item) => item.classId === selectedClass);

  const { kpi, barData, lineData, alertHistory, keywordCloud } = useMemo(
    () => buildDashboardView(visibleItems),
    [visibleItems],
  );

  const maxKeywordCount = keywordCloud[0]?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(alertHistory.length / PAGE_SIZE));
  const pagedAlertHistory = useMemo(
    () => alertHistory.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [alertHistory, currentPage],
  );

  useEffect(() => {
    setCurrentPage(1);
    setSelectedAlert(null);
  }, [date, selectedCurriculum, selectedClass, items]);

  if (!pinPassed) {
    return <PinModal onSuccess={() => setPinPassed(true)} />;
  }

  return (
    <div className="page-wrapper">
      <AlertDetailModal alert={selectedAlert} onClose={() => setSelectedAlert(null)} />

      <div className="top-bar">
        <div className="top-bar-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="btn btn-outline"
              style={{ padding: '6px 10px', fontSize: 12 }}
              onClick={() => setSidebarOpen((prev) => !prev)}
            >
              {sidebarOpen ? '접기' : '펼치기'}
            </button>
            <h2>대시보드</h2>
          </div>
          <p>커리큘럼과 반을 선택해 알림 추이와 주요 키워드를 확인할 수 있습니다.</p>
        </div>
        <div className="top-bar-right">
          <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>기준일</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: 13,
                background: '#fff',
                color: 'var(--text-primary)',
              }}
            />
          </label>
          <button
            className="btn btn-outline"
            onClick={fetchData}
            disabled={loading}
            style={{ fontSize: 12 }}
          >
            {loading ? '불러오는 중...' : '새로고침'}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '10px 24px',
            background: '#fff8f0',
            borderBottom: '1px solid #fed7aa',
            fontSize: 12,
            color: '#92400e',
          }}
        >
          안내: {error}
        </div>
      )}

      <div className={`dashboard-layout ${sidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'}`}>
        {sidebarOpen && (
          <aside className="dashboard-sidebar">
            <div className="card dashboard-sidebar-card">
              <p className="card-title">커리큘럼</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {curriculums.map((curriculum) => (
                  <button
                    key={curriculum}
                    className={`tab-btn ${selectedCurriculum === curriculum ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedCurriculum(curriculum);
                      setSelectedClass(ALL_CLASSES);
                    }}
                    style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left' }}
                  >
                    {curriculum}
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
                <p className="card-title" style={{ marginBottom: 4 }}>반 선택</p>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  현재 커리큘럼: {selectedCurriculum}
                </div>
              </div>
            </div>
            <div className="tab-group">
              {classes.map((className) => (
                <button
                  key={className}
                  className={`tab-btn ${selectedClass === className ? 'active' : ''}`}
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
              <div className="kpi-val">{kpi.avgConfusion}%</div>
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
                <BarChart data={barData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                    formatter={(value) => [value, '알림 수']}
                  />
                  <Bar dataKey="count" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <p className="card-title">시간대별 이해 어려움 추이</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={lineData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ec" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                    formatter={(value) => [`${value}%`, '이해 어려움 정도']}
                  />
                  <ReferenceLine y={50} stroke="#ef4444" strokeDasharray="5 5" />
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
              <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                빨간 점선은 기준값 50%를 뜻합니다.
              </div>
            </div>
          </div>

          <div className="card">
            <div className="section-divider" style={{ marginBottom: 14 }}>
              <div>
                <h3>주요 키워드 워드 클라우드</h3>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  많이 등장한 키워드일수록 더 크게 표시됩니다.
                </div>
              </div>
            </div>
            {keywordCloud.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                {keywordCloud.map(({ keyword, count }) => (
                  <span key={keyword} style={keywordStyle(count, maxKeywordCount)}>
                    {keyword}
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                아직 표시할 주요 키워드가 없습니다.
              </div>
            )}
          </div>

          <div className="card">
            <div className="section-divider" style={{ marginBottom: 14 }}>
              <h3>알림 이력</h3>
              <span className="text-muted text-sm">{alertHistory.length}건</span>
            </div>
            <table className="data-table" style={{ tableLayout: 'fixed', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '12%' }}>시각</th>
                  <th style={{ width: '12%' }}>반</th>
                  <th style={{ width: '32%' }}>헷갈린 내용</th>
                  <th style={{ width: '32%' }}>보충할 내용</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>이해 어려움 정도</th>
                </tr>
              </thead>
              <tbody>
                {pagedAlertHistory.map((alert) => (
                  <tr
                    key={alert.id}
                    onClick={() => setSelectedAlert(alert)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>{alert.time}</td>
                    <td>
                      <span className="badge badge-red" style={{ fontSize: 11, padding: '2px 8px' }}>
                        {alert.classTag}
                      </span>
                    </td>
                    <EllipsisCell value={alert.topic} accent />
                    <EllipsisCell value={alert.reason} />
                    <td style={{ textAlign: 'right' }}>
                      <span className="text-red" style={{ fontWeight: 600 }}>{alert.confusion}%</span>
                    </td>
                  </tr>
                ))}
                {alertHistory.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>
                      {loading ? '데이터를 불러오는 중...' : '선택한 조건의 알림이 없습니다.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {alertHistory.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 14,
                }}
              >
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ fontSize: 12, padding: '4px 10px' }}
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                >
                  이전
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ fontSize: 12, padding: '4px 10px' }}
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  다음
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
