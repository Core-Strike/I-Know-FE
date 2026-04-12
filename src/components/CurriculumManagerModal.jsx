import { useEffect, useState } from 'react';

export default function CurriculumManagerModal({
  open,
  curriculums = [],
  loading = false,
  error = '',
  onCreate,
  onDelete,
  onClose,
}) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open) {
      setName('');
      setSubmitting(false);
      setDeletingId(null);
      setLocalError('');
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const handleCreate = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError('커리큘럼 이름을 입력해 주세요.');
      return;
    }

    setSubmitting(true);
    setLocalError('');
    try {
      await onCreate(trimmed);
      setName('');
    } catch (createError) {
      setLocalError(createError.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (curriculum) => {
    setDeletingId(curriculum.id);
    setLocalError('');
    try {
      await onDelete(curriculum);
    } catch (deleteError) {
      setLocalError(deleteError.message);
    } finally {
      setDeletingId(null);
    }
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
        padding: 24,
        zIndex: 1200,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: 'min(640px, 100%)',
          maxHeight: 'min(720px, calc(100vh - 48px))',
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
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>커리큘럼 관리</h3>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              수업 시작과 대시보드에서 사용할 커리큘럼을 관리합니다.
            </div>
          </div>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            닫기
          </button>
        </div>

        <div style={{ padding: 22, overflowY: 'auto', minHeight: 0 }}>
          <form onSubmit={handleCreate} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 260px' }}>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="새 커리큘럼 이름"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={submitting || loading}>
              {submitting ? '추가 중...' : '커리큘럼 추가'}
            </button>
          </form>

          {(error || localError) && (
            <div style={{ marginBottom: 16, fontSize: 12, color: '#b91c1c' }}>
              {localError || error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {curriculums.length === 0 && !loading && (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                등록된 커리큘럼이 없습니다.
              </div>
            )}

            {curriculums.map((curriculum) => (
              <div
                key={curriculum.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '14px 16px',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  background: '#fff',
                }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{curriculum.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    ID {curriculum.id}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ color: '#b91c1c', borderColor: '#fecaca' }}
                  disabled={deletingId === curriculum.id}
                  onClick={() => { void handleDelete(curriculum); }}
                >
                  {deletingId === curriculum.id ? '삭제 중...' : '삭제'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
