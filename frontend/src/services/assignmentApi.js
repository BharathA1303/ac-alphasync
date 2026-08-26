// assignmentApi.js — API client for Faculty and Student Trading Assignments
import api from './api';

const assignmentApi = {
    // ── Faculty Endpoints ─────────────────────────────────────────
    listFacultyAssignments(params = {}) {
        return api.get('/faculty/assignments', { params });
    },

    getFacultyAssignment(assignmentId) {
        return api.get(`/faculty/assignments/${assignmentId}`);
    },

    createFacultyAssignment(payload) {
        return api.post('/faculty/assignments', payload);
    },

    updateFacultyAssignment(assignmentId, payload) {
        return api.patch(`/faculty/assignments/${assignmentId}`, payload);
    },

    deleteFacultyAssignment(assignmentId) {
        return api.delete(`/faculty/assignments/${assignmentId}`);
    },

    gradeSubmission(assignmentId, submissionId, payload) {
        return api.post(`/faculty/assignments/${assignmentId}/submissions/${submissionId}/grade`, payload);
    },

    // ── Student Endpoints ─────────────────────────────────────────
    listStudentAssignments() {
        return api.get('/student/assignments');
    },

    getStudentAssignment(assignmentId) {
        return api.get(`/student/assignments/${assignmentId}`);
    },

    evaluateStudentAssignment(assignmentId) {
        return api.post(`/student/assignments/${assignmentId}/evaluate`);
    },

    submitStudentAssignment(assignmentId, payload = {}) {
        return api.post(`/student/assignments/${assignmentId}/submit`, payload);
    },
};

export default assignmentApi;
