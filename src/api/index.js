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

// 명세: POST /analyze/{student_id}  multipart/form-data  body: file
export const analyzeFrame = (blob, studentId) => {
  const form = new FormData();
  form.append('file', blob, 'frame.jpg');
  // student_id 는 path parameter — body 에 포함하지 않음
  return ai.post(`/analyze/${encodeURIComponent(studentId)}`, form).then((r) => r.data);
};

// ─── Confused 이벤트 전송 (교육생 → Spring) ────────────────
export const postConfusedEvent = (data) =>
  http.post('/api/confused-events', data).then((r) => r.data);

// ─── Lecture chunk ──────────────────────────────────────────
export const sendLectureChunk = (data) =>
  http.post('/api/lecture-chunk', data).then((r) => r.data);
