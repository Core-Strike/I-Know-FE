const STAGES = [
  { max: 16, color: '#0f2d4e', label: '매우 낮음', badge: '1' },
  { max: 32, color: '#174d80', label: '낮음', badge: '2' },
  { max: 48, color: '#2d83d3', label: '보통', badge: '3' },
  { max: 64, color: '#2fbe53', label: '양호', badge: '4' },
  { max: 80, color: '#ffb300', label: '높음', badge: '5' },
  { max: 100, color: '#ff6a00', label: '매우 높음', badge: '6' },
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getStage(value) {
  return STAGES.find((stage) => value <= stage.max) ?? STAGES[STAGES.length - 1];
}

export default function UnderstandingDifficultyGauge({
  value = 0,
  title = '평균 이해도',
  helperText = '학생 평균 이해도를 6단계로 표시합니다.',
}) {
  const normalizedValue = clamp(Number.isFinite(value) ? value : 0, 0, 100);
  const stage = getStage(normalizedValue);

  return (
    <div
      style={{
        padding: '18px 18px 16px',
        borderRadius: 18,
        background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
        border: '1px solid #e5edf5',
        boxShadow: '0 10px 24px rgba(15, 23, 42, 0.06)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 10,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#1f2937' }}>{title}</span>
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1.5px solid #f59e0b',
                color: '#f59e0b',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              i
            </span>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
            {helperText}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: stage.color }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 34, lineHeight: 1, fontWeight: 900 }}>{normalizedValue}%</div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{stage.label}</div>
          </div>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              border: `2px solid ${stage.color}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              fontWeight: 900,
              background: '#fff',
              boxShadow: `0 6px 18px ${stage.color}22`,
            }}
          >
            {stage.badge}
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', paddingTop: 22 }}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: `${clamp(normalizedValue, 6, 94)}%`,
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            color: '#94a3b8',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          <span>현재 값</span>
          <span
            style={{
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '9px solid #cbd5e1',
            }}
          />
        </div>

        <div
          style={{
            height: 22,
            borderRadius: 999,
            background: '#e9eef4',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${normalizedValue}%`,
              minWidth: normalizedValue > 0 ? 22 : 0,
              height: '100%',
              borderRadius: 999,
              background: `linear-gradient(90deg, ${stage.color} 0%, ${stage.color}dd 100%)`,
              boxShadow: `inset 0 -1px 0 ${stage.color}44`,
              transition: 'width 220ms ease, background 220ms ease',
            }}
          />
        </div>
      </div>

      <div
        style={{
          marginTop: 10,
          display: 'grid',
          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
          gap: 6,
          fontSize: 11,
          color: '#94a3b8',
          textAlign: 'center',
        }}
      >
        {STAGES.map((item, index) => (
          <div key={item.max} style={{ fontWeight: 700 }}>
            {index + 1}단계
          </div>
        ))}
      </div>
    </div>
  );
}
