import { useState } from 'react';
import { CURRICULUM_OPTIONS, DEFAULT_CURRICULUM } from '../constants/curriculum';

export default function SessionSettingsModal({ onConfirm, onCancel }) {
  const [thresholdPct, setThresholdPct] = useState(45);
  const [curriculum, setCurriculum] = useState(DEFAULT_CURRICULUM);
  const [classId, setClassId] = useState('class-1');

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm({
      thresholdPct,
      curriculum,
      classId: classId.trim() || 'class-1',
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 900,
      }}
    >
      <div className="card" style={{ width: 420, padding: '32px 28px' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>세션 시작 설정</h2>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 24 }}>
          세션 생성 전에 기본 옵션을 설정합니다.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
              커리큘럼
            </label>
            <select
              value={curriculum}
              onChange={(e) => setCurriculum(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '9px 12px',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 13,
                outline: 'none',
                background: '#fff',
              }}
            >
              {CURRICULUM_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
              반 ID
            </label>
            <input
              type="text"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              placeholder="예: class-1"
              style={{
                width: '100%',
                padding: '9px 12px',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
              이해 못한 교육생 비율 기준
              <span
                style={{
                  marginLeft: 10,
                  fontSize: 16,
                  fontWeight: 800,
                  color: thresholdPct > 60 ? 'var(--red)' : thresholdPct > 40 ? '#f59e0b' : 'var(--blue)',
                }}
              >
                {thresholdPct}%
              </span>
            </label>
            <input
              type="range"
              min={10}
              max={90}
              step={5}
              value={thresholdPct}
              onChange={(e) => setThresholdPct(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--blue)' }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11,
                color: 'var(--text-secondary)',
                marginTop: 2,
              }}
            >
              <span>10% (민감)</span>
              <span>90% (둔감)</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn btn-outline" onClick={onCancel}>
              취소
            </button>
            <button type="submit" className="btn btn-primary">
              세션 시작
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
