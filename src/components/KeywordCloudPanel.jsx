import { useEffect, useMemo, useRef, useState } from 'react';
import cloud from 'd3-cloud';

const CLOUD_WIDTH = 520;
const CLOUD_HEIGHT = 280;
const PALETTE = ['#2563eb', '#0f766e', '#1d4ed8', '#0f766e', '#475569', '#0369a1'];

function buildWords(items) {
  if (!items.length) {
    return [];
  }

  const max = items[0]?.count ?? 1;
  const min = items[items.length - 1]?.count ?? 1;
  const gap = Math.max(max - min, 1);

  return items.map((item, index) => {
    const ratio = (item.count - min) / gap;
    return {
      text: item.keyword,
      count: item.count,
      size: 18 + Math.round(ratio * 24),
      rotate: index % 5 === 0 ? 90 : 0,
      color: PALETTE[index % PALETTE.length],
    };
  });
}

function GaugeItem({ rank, keyword, count, maxCount }) {
  const percent = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;

  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 14,
        border: '1px solid #dbe4f0',
        background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>TOP {rank}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{keyword}</div>
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#2563eb' }}>{count}</div>
      </div>
      <div
        style={{
          height: 10,
          borderRadius: 999,
          background: '#e2e8f0',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: '100%',
            borderRadius: 999,
            background: 'linear-gradient(90deg, #60a5fa 0%, #2563eb 100%)',
          }}
        />
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>최다 키워드 대비 {percent}%</div>
    </div>
  );
}

export default function KeywordCloudPanel({ items }) {
  const [layoutWords, setLayoutWords] = useState([]);
  const mountedRef = useRef(true);

  const words = useMemo(() => buildWords(items), [items]);
  const topKeywords = useMemo(() => items.slice(0, 3), [items]);
  const maxCount = items[0]?.count ?? 0;

  useEffect(() => {
    mountedRef.current = true;
    if (!words.length) {
      setLayoutWords([]);
      return () => {
        mountedRef.current = false;
      };
    }

    const layout = cloud()
      .size([CLOUD_WIDTH, CLOUD_HEIGHT])
      .words(words.map((word) => ({ ...word })))
      .padding(10)
      .rotate((word) => word.rotate)
      .font('Pretendard, Apple SD Gothic Neo, sans-serif')
      .fontSize((word) => word.size)
      .on('end', (computedWords) => {
        if (mountedRef.current) {
          setLayoutWords(computedWords);
        }
      });

    layout.start();

    return () => {
      mountedRef.current = false;
      layout.stop();
    };
  }, [words]);

  if (!items.length) {
    return (
      <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
        아직 표시할 주요 키워드가 없습니다.
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 20,
        alignItems: 'stretch',
      }}
    >
      <div
        style={{
          flex: '1 1 420px',
          minHeight: CLOUD_HEIGHT,
          borderRadius: 18,
          border: '1px solid #dbe4f0',
          background: 'radial-gradient(circle at top, #f8fbff 0%, #eef5ff 45%, #ffffff 100%)',
          padding: 12,
          overflow: 'hidden',
        }}
      >
        <svg viewBox={`0 0 ${CLOUD_WIDTH} ${CLOUD_HEIGHT}`} width="100%" height="100%" role="img" aria-label="주요 키워드 워드 클라우드">
          <g transform={`translate(${CLOUD_WIDTH / 2}, ${CLOUD_HEIGHT / 2})`}>
            {layoutWords.map((word) => (
              <text
                key={`${word.text}-${word.x}-${word.y}`}
                textAnchor="middle"
                transform={`translate(${word.x}, ${word.y}) rotate(${word.rotate})`}
                style={{
                  fontSize: `${word.size}px`,
                  fontWeight: word.count === maxCount ? 800 : 700,
                  fill: word.color,
                  letterSpacing: '-0.02em',
                }}
              >
                {word.text}
              </text>
            ))}
          </g>
        </svg>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: '0 1 300px', minWidth: 240 }}>
        <div style={{ fontSize: 13, color: '#475569', fontWeight: 700 }}>상위 3개 키워드</div>
        {topKeywords.map((item, index) => (
          <GaugeItem
            key={item.keyword}
            rank={index + 1}
            keyword={item.keyword}
            count={item.count}
            maxCount={maxCount}
          />
        ))}
      </div>
    </div>
  );
}
