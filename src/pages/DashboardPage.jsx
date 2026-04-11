import { useCallback, useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, CartesianGrid,
} from 'recharts';
import { getDashboardClasses } from '../api';

// 오늘 날짜 YYYY-MM-DD
const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * 명세 응답: Array of { classId, alertCount, avgConfusedScore, topTopics, recentAlerts }
 * recentAlerts 항목: { id, sessionId, studentId, capturedAt, confusedScore, reason, unclearTopic, createdAt }
 */
function normalizeResponse(dataArray) {
  if (!Array.isArray(dataArray)) {
    throw new Error('응답이 배열 형식이 아닙니다');
  }

  // KPI
  const totalAlerts   = dataArray.reduce((s, c) => s + (c.alertCount ?? 0), 0);
  const avgConfusedPct = dataArray.length
    ? Math.round(
        dataArray.reduce((s, c) => s + (c.avgConfusedScore ?? 0), 0)
        / dataArray.length * 100
      )
    : 0;

  const kpi = {
    sessions:     dataArray.length,  // 반 수를 세션 수 대용으로 표시
    alerts:       totalAlerts,
    avgConfusion: avgConfusedPct,
    students:     0,                 // 이 API에서는 학생 수 미제공
  };

  // BarChart: 반별 알림 수
  const barData = dataArray.map((c) => ({
    name:  c.classId   ?? '?',
    count: c.alertCount ?? 0,
  }));

  // unclearTopics: 전체 반의 topTopics 합집합
  const unclearTopics = [
    ...new Set(dataArray.flatMap((c) => c.topTopics ?? [])),
  ];

  // alertHistory: 전체 반의 recentAlerts를 펼쳐 표 형식으로 변환
  const alertHistory = dataArray.flatMap((c) =>
    (c.recentAlerts ?? []).map((r, i) => ({
      id:       r.id            ?? `${c.classId}-${i}`,
      time:     r.capturedAt?.slice(11, 16) ?? r.createdAt?.slice(11, 16) ?? '-',
      classTag: c.classId       ?? '-',
      topic:    r.unclearTopic  ?? '-',
      reason:   r.reason        ?? '',
      confusion:Math.round((r.confusedScore ?? 0) * 100),
    }))
  );

  // lineData: 이 API에서 타임라인 미제공 → recentAlerts capturedAt 기반으로 생성
  const lineData = alertHistory
    .slice()
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((a) => ({ time: a.time, confusion: a.confusion }));

  return { kpi, barData, lineData, unclearTopics, alertHistory };
}

// ── 목 데이터 (서버 미연결 시 폴백) ────────────────────────
const MOCK = {
  kpi: { sessions: 3, alerts: 12, avgConfusion: 58, students: 84 },
  barData: [{ name: '1반', count: 4 }, { name: '2반', count: 3 }, { name: '3반', count: 5 }],
  lineData: [
    { time: '13:30', confusion: 42 }, { time: '13:45', confusion: 55 },
    { time: '14:00', confusion: 50 }, { time: '14:15', confusion: 62 },
    { time: '14:30', confusion: 57 }, { time: '14:45', confusion: 65 },
    { time: '15:00', confusion: 53 },
  ],
  unclearTopics: ['트랜잭션 격리 수준', 'dirty read', 'JVM 힙 메모리', '인덱스 구조', '동시성 제어', 'B+Tree'],
  alertHistory: [
    { id: 1, time: '14:15', classTag: '3반', topic: '트랜잭션 격리 수준', reason: '표정·시선 불안정', confusion: 57 },
    { id: 2, time: '14:02', classTag: '3반', topic: 'dirty read 개념',    reason: '집중도 저하 감지', confusion: 56 },
    { id: 3, time: '13:44', classTag: '1반', topic: 'JVM 힙 메모리',      reason: '불안한 표정 다수', confusion: 52 },
  ],
};

export default function DashboardPage() {
  const [selectedClass, setSelectedClass] = useState('전체 반');
  const [date, setDate] = useState(todayStr());
  const [kpi, setKpi]               = useState(MOCK.kpi);
  const [barData, setBarData]       = useState(MOCK.barData);
  const [lineData, setLineData]     = useState(MOCK.lineData);
  const [tags, setTags]             = useState(MOCK.unclearTopics);
  const [alerts, setAlerts]         = useState(MOCK.alertHistory);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [isMock, setIsMock]         = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const raw = await getDashboardClasses();
      if (raw) {
        const n = normalizeResponse(raw);
        setKpi(n.kpi);
        setBarData(n.barData.length ? n.barData : MOCK.barData);
        setLineData(n.lineData.length ? n.lineData : MOCK.lineData);
        setTags(n.unclearTopics.length ? n.unclearTopics : MOCK.unclearTopics);
        setAlerts(n.alertHistory.length ? n.alertHistory : MOCK.alertHistory);
        setIsMock(false);
        setDate(todayStr());
      }
    } catch (e) {
      setError(`서버 연결 실패 — 목 데이터를 표시합니다 (${e.message})`);
      setIsMock(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const classes = ['전체 반', ...new Set(alerts.map((a) => a.classTag).filter(Boolean))];

  const filteredAlerts = selectedClass === '전체 반'
    ? alerts
    : alerts.filter((a) => a.classTag === selectedClass);

  return (
    <div className="page-wrapper">
      {/* 헤더 */}
      <div className="top-bar">
        <div className="top-bar-left">
          <h2>관리자 대시보드 — 반별 통계 및 알림 이력</h2>
        </div>
        <div className="top-bar-right">
          {isMock && (
            <span className="badge badge-gray">목 데이터</span>
          )}
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>기간 {date}</span>
          <button
            className="btn btn-outline"
            onClick={fetchData}
            disabled={loading}
            style={{ fontSize: 12 }}
          >
            {loading ? '로딩 중...' : '↻ 새로고침'}
          </button>
        </div>
      </div>

      {/* 에러 배너 */}
      {error && (
        <div style={{
          padding: '10px 24px', background: '#fff8f0',
          borderBottom: '1px solid #fed7aa', fontSize: 12, color: '#92400e',
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* 반 탭 + 본문 */}
      <div className="page-body" style={{ gap: 16 }}>
        {/* 탭 */}
        <div className="tab-group">
          {classes.map((c) => (
            <button
              key={c}
              className={`tab-btn ${selectedClass === c ? 'active' : ''}`}
              onClick={() => setSelectedClass(c)}
            >
              {c}
            </button>
          ))}
        </div>

        {/* KPI */}
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-val">{kpi.sessions}</div>
            <div className="kpi-label">오늘 진행 세션</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-val red">{kpi.alerts}</div>
            <div className="kpi-label">총 알림 발생</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-val">{kpi.avgConfusion}%</div>
            <div className="kpi-label">평균 혼란도</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-val">{kpi.students}</div>
            <div className="kpi-label">참여 교육생 수</div>
          </div>
        </div>

        {/* 차트 2개 */}
        <div className="two-col">
          <div className="card">
            <p className="card-title">반별 알림 발생 횟수</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={barData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6 }}
                  formatter={(v) => [v, '알림']}
                />
                <Bar dataKey="count" fill="#93c5fd" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <p className="card-title">세션 타임라인 — 혼란도 추이</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={lineData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ec" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6 }}
                  formatter={(v) => [`${v}%`, '혼란도']}
                />
                <ReferenceLine y={50} stroke="#ef4444" strokeDasharray="5 5" />
                <Line
                  type="monotone" dataKey="confusion"
                  stroke="#3b82f6" strokeWidth={2}
                  dot={{ r: 3 }} activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
              빨간 점선 = threshold 50%
            </div>
          </div>
        </div>

        {/* 자주 언급된 모르는 내용 */}
        <div className="card">
          <p className="card-title">자주 언급된 모르는 내용 (unclearTopic)</p>
          <div>
            {tags.map((t) => <span className="tag" key={t}>{t}</span>)}
          </div>
        </div>

        {/* 알림 이력 */}
        <div className="card">
          <div className="section-divider" style={{ marginBottom: 14 }}>
            <h3>알림 이력</h3>
            <span className="text-muted text-sm">{filteredAlerts.length}건</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>시각</th>
                <th>반</th>
                <th>모르는 내용</th>
                <th>GPT reason</th>
                <th style={{ textAlign: 'right' }}>혼란도</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlerts.map((a) => (
                <tr key={a.id}>
                  <td>{a.time}</td>
                  <td>
                    <span className="badge badge-red" style={{ fontSize: 11, padding: '2px 8px' }}>
                      {a.classTag}
                    </span>
                  </td>
                  <td style={{ fontWeight: 500 }}>{a.topic}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{a.reason}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="text-red" style={{ fontWeight: 600 }}>{a.confusion}%</span>
                  </td>
                </tr>
              ))}
              {filteredAlerts.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>
                    {loading ? '데이터를 불러오는 중...' : '해당 반의 알림이 없습니다'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
