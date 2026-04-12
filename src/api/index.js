import axios from 'axios';

const apiBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/$/, '');
const aiBaseUrl = (import.meta.env.VITE_AI_URL || 'http://localhost:8000').replace(/\/$/, '');

const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080',
  timeout: 10000,
});

const ai = axios.create({
  baseURL: `${aiBaseUrl}/ai-api`,
  timeout: 15000,
});

export const createSession = (data) =>
  http.post('/api/sessions', data).then((r) => r.data);

export const endSession = (id) =>
  http.post(`/api/sessions/${id}/terminate`).then((r) => r.data);

export const endSessionOnUnload = (id) => {
  const url = `${apiBaseUrl}/api/sessions/${encodeURIComponent(id)}/terminate`;

  if (navigator.sendBeacon) {
    const ok = navigator.sendBeacon(url, new Blob([], { type: 'application/json' }));
    if (ok) {
      return;
    }
  }

  fetch(url, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
  }).catch(() => {});
};

export const getSession = (id) =>
  http.get(`/api/sessions/${id}`).then((r) => r.data);

export const joinSessionParticipant = ({ sessionId, studentId, studentName }) =>
  http.post(`/api/sessions/${encodeURIComponent(sessionId)}/participants/join`, { studentId, studentName }).then((r) => r.data);

export const leaveSessionParticipant = ({ sessionId, studentId, studentName }) =>
  http.post(`/api/sessions/${encodeURIComponent(sessionId)}/participants/leave`, { studentId, studentName }).then((r) => r.data);

export const leaveSessionParticipantOnUnload = ({ sessionId, studentId, studentName }) => {
  const url = `${apiBaseUrl}/api/sessions/${encodeURIComponent(sessionId)}/participants/leave`;
  const body = JSON.stringify({ studentId, studentName });

  if (navigator.sendBeacon) {
    const ok = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
    if (ok) {
      return;
    }
  }

  fetch(url, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch(() => {});
};

export const getSessionAlerts = (id) =>
  http.get(`/api/sessions/${id}/alerts`).then((r) => r.data);

export const getConfusedEvents = (id) =>
  http.get(`/api/sessions/${id}/confused-events`).then((r) => r.data);

export const getDashboardClasses = (date) =>
  http.get('/api/dashboard/classes', { params: { date } }).then((r) => r.data);

export const getCurriculums = () =>
  http.get('/api/curriculums').then((r) => r.data);

export const createCurriculum = (name) =>
  http.post('/api/curriculums', { name }).then((r) => r.data);

export const deleteCurriculum = (curriculumId) =>
  http.delete(`/api/curriculums/${curriculumId}`).then((r) => r.data);

export const getKeywordReport = ({ date, keyword, curriculum, classId }) =>
  http.get('/api/dashboard/keyword-report', {
    params: {
      date,
      keyword,
      curriculum,
      classId,
    },
  }).then((r) => r.data);

export const analyzeFrame = (blob, studentId) => {
  const form = new FormData();
  form.append('file', blob, 'frame.jpg');
  return ai.post(`/analyze/${encodeURIComponent(studentId)}`, form).then((r) => r.data);
};

export const postConfusedEvent = (data) =>
  http.post('/api/confused-events', data).then((r) => r.data);

export const sendLectureChunk = (data) =>
  http.post('/api/lecture-chunk', data).then((r) => r.data);

export const deleteAlert = (alertId) =>
  http.delete(`/api/alerts/${alertId}`).then((r) => r.data);

export const postLectureSummary = async ({ alertId, audioText }) => {
  const aiRes = await ai.post('/summarize', { audioText }).then((r) => r.data);
  const summary = aiRes.summary ?? '';
  const recommendedConcept = aiRes.recommendedConcept ?? '';
  const keywords = Array.isArray(aiRes.keywords) ? aiRes.keywords : [];

  await http.post('/api/lecture-summary', { alertId, summary, recommendedConcept, keywords });
  return { summary, recommendedConcept, keywords };
};

export const saveLectureSummary = ({ alertId, summary, recommendedConcept, keywords = [] }) =>
  http.post('/api/lecture-summary', { alertId, summary, recommendedConcept, keywords }).then((r) => r.data);

export const getLectureSummary = (alertId) =>
  http.get(`/api/alerts/${alertId}/summary`).then((r) => r.data);
