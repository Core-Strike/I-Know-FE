import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function HomePage() {
  const [sessionId, setSessionId] = useState('');
  const [name, setName]           = useState('');
  const [error, setError]         = useState('');
  const navigate = useNavigate();

  const handleJoin = (e) => {
    e.preventDefault();
    const trimmedId   = sessionId.trim();
    const trimmedName = name.trim();

    if (!trimmedId) {
      setError('수업 ID를 입력해 주세요.');
      return;
    }
    if (!/^\d{6}$/.test(trimmedId)) {
      setError('수업 ID는 6자리 숫자여야 합니다.');
      return;
    }
    if (!trimmedName) {
      setError('이름을 입력해 주세요.');
      return;
    }

    navigate(`/student/${encodeURIComponent(trimmedId)}?name=${encodeURIComponent(trimmedName)}`);
  };

  const handleSessionIdChange = (e) => {
    // 숫자만 허용, 최대 6자리
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setSessionId(val);
    setError('');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
      }}
    >
      <div
        className="card"
        style={{ width: 360, padding: '36px 32px', textAlign: 'center' }}
      >
        {/* 로고 영역 */}
        <div style={{ marginBottom: 8, fontSize: 28 }}>📚</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          iKnow
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 28 }}>
          강사님이 알려준 수업 ID를 입력해 수업에 참가하세요
        </p>

        <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="text"
            inputMode="numeric"
            placeholder="수업 ID (6자리 숫자)"
            value={sessionId}
            onChange={handleSessionIdChange}
            maxLength={6}
            style={{
              width: '100%',
              padding: '10px 14px',
              border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
              borderRadius: 8,
              fontSize: 20,
              textAlign: 'center',
              outline: 'none',
              letterSpacing: 6,
              fontFamily: 'monospace',
              fontWeight: 700,
            }}
            autoFocus
          />
          <input
            type="text"
            placeholder="이름 입력 (예: 홍길동)"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            style={{
              width: '100%',
              padding: '10px 14px',
              border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
              borderRadius: 8,
              fontSize: 14,
              textAlign: 'center',
              outline: 'none',
            }}
          />
          {error && (
            <p style={{ fontSize: 12, color: 'var(--red)', marginTop: -4 }}>{error}</p>
          )}
          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '10px' }}>
            수업 참가
          </button>
        </form>

        <p style={{ marginTop: 20, fontSize: 12, color: 'var(--text-secondary)' }}>
          강사라면 →{' '}
          <a
            href="/instructor"
            style={{ color: 'var(--blue)', textDecoration: 'underline' }}
          >
            강사 페이지
          </a>
        </p>
      </div>
    </div>
  );
}
