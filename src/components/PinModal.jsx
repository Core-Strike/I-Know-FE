import { useState, useRef, useEffect } from 'react';

export default function PinModal({ onSuccess }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const correctPin = import.meta.env.VITE_INSTRUCTOR_PIN || '1234';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pin === correctPin) {
      onSuccess();
    } else {
      setError('인증 번호가 올바르지 않습니다.');
      setShake(true);
      setPin('');
      setTimeout(() => setShake(false), 500);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        className="card"
        style={{
          width: 360,
          padding: '36px 32px',
          textAlign: 'center',
          animation: shake ? 'shake 0.4s ease' : 'none',
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 8 }}>🔐</div>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>인증 번호 입력</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
          데모 버전이라 기본 인증 번호를 안내하고 있습니다.
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
          인증 번호는 <strong style={{ color: 'var(--text-primary)' }}>1234</strong>입니다.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            placeholder="인증 번호를 입력하세요"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setError('');
            }}
            style={{
              width: '100%',
              padding: '10px 14px',
              border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
              borderRadius: 8,
              fontSize: 22,
              textAlign: 'center',
              letterSpacing: 8,
              outline: 'none',
              fontFamily: 'monospace',
            }}
            autoComplete="off"
          />
          {error && (
            <p style={{ fontSize: 12, color: 'var(--red)', marginTop: -4 }}>{error}</p>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
          >
            확인
          </button>
        </form>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
