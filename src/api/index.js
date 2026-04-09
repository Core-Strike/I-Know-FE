import axios from 'axios';

const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080',
  timeout: 10000,
});

// ─── Sessions ──────────────────────────────────────────────
export const createSession = (data) =>
  http.post('/api/sessions', data).then((r) => r.data);

export const endSession = (id) =>
  http.patch(`/api/sessions/${id}/end`).then((r) => r.data);

// ─── Alerts ────────────────────────────────────────────────
export const getSessionAlerts = (id) =>
  http.get(`/api/sessions/${id}/alerts`).then((r) => r.data);

export const getConfusedEvents = (id) =>
  http.get(`/api/sessions/${id}/confused-events`).then((r) => r.data);

// ─── Dashboard ─────────────────────────────────────────────
export const getDashboardClasses = () =>
  http.get('/api/dashboard/classes').then((r) => r.data);

// ─── FastAPI (AI) ──────────────────────────────────────────
const ai = axios.create({
  baseURL: import.meta.env.VITE_AI_URL || 'http://localhost:8000',
  timeout: 15000,
});

export const analyzeFrame = (blob, studentId) => {
  const form = new FormData();
  form.append('file', blob, 'frame.jpg');
  form.append('student_id', String(studentId));
  return ai.post('/ai-api/analyze', form).then((r) => r.data);
};

// ─── Lecture chunk (STT 텍스트 전송, optional) ─────────────
export const sendLectureChunk = (data) =>
  http.post('/app/lecture-chunk', data).then((r) => r.data);
