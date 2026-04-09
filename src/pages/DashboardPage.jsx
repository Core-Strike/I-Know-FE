import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, CartesianGrid, Legend,
} from 'recharts';
import { getDashboardClasses } from '../api';

// ── 목 데이터 ────────────────────────────────────────────────
const MOCK_KPI = { sessions: 3, alerts: 12, avgConfusion: 58, students: 84 };

const MOCK_BAR = [
  { name: '1반', count: 4 },
  { name: '2반', count: 3 },
  { name: '3반', count: 5 },
];

const MOCK_LINE = [
  { time: '13:30', confusion: 42 },
  { time: '13:45', confusion: 55 },
  { time: '14:00', confusion: 50 },
  { time: '14:15', confusion: 62 },
  { time: '14:30', confusion: 57 },
  { time: '14:45', confusion: 65 },
  { time: '15:00', confusion: 53 },
];

const MOCK_TAGS = ['트랜잭션 격리 수준', 'dirty read', 'JVM 힙 메모리', '인덱스 구조', '동시성 제어', 'B+Tree'];

const MOCK_ALERTS = [
  { id: 1, time: '14:15', classTag: '3반', topic: '트랜잭션 격리 수준', reason: '표정·시선 불안정',  confusion: 57 },
  { id: 2, time: '14:02', classTag: '3반', topic: 'dirty read 개념',    reason: '집중도 저하 감지',  confusion: 56 },
  { id: 3, time: '13:44', classTag: '1반', topic: 'JVM 힙 메모리',      reason: '불안한 표정 다수',  confusion: 52 },
];

// ── 컴포넌트 ─────────────────────────────────────────────────
export default function DashboardPage() {
  const [selectedClass, setSelectedClass] = useState('전체 반');
  const [date] = useState('2026-04-07');
  const [kpi, setKpi] = useState(MOCK_KPI);
  const [barData, setBarData] = useState(MOCK_BAR);
  const [lineData, setLineData] = useState(MOCK_LINE);
  const [alerts, setAlerts] = useState(MOCK_ALERTS);
  const [tags, setTags] = useState(MOCK_TAGS);

  useEffect(() => {
    getDashboardClasses()
      .then((data) => {
        if (data) {
          setKpi(data.kpi ?? MOCK_KPI);
          setBarData(data.barData ?? MOCK_BAR);
          setLineData(data.lineData ?? MOCK_LINE);
          setAlerts(data.alerts ?? MOCK_ALERTS);
          setTags(data.unclearTopics ?? MOCK_TAGS);
        }
      })
      .catch(() => {/* 서버 미연결 시 목 데이터 유지 */});
  }, []);

  const classes = ['전체 반', '1반', '2반', '3반'];

  // 반 필터
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
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>기간 {date}</span>
        </div>
      </div>

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
          {/* 반별 알림 발생 횟수 */}
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
            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
              BarChart (recharts)
            </div>
          </div>

          {/* 세션 타임라인 — 혼란도 추이 */}
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
              LineChart · 빨간 점선 = threshold 50%
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
          <div className="section-divider">
            <h3>알림 이력</h3>
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
                    해당 반의 알림이 없습니다
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
