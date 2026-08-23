// facultyApi.js — Faculty course-builder endpoints (own courses only)
import api from './api';

const facultyApi = {
    getDashboard() {
        return api.get('/faculty/dashboard');
    },

    getAssessmentAiStatus() {
        return api.get('/faculty/assessment-ai-status');
    },

    listCourses(params = {}) {
        return api.get('/faculty/courses', { params });
    },

    getCourse(courseId) {
        return api.get(`/faculty/courses/${courseId}`);
    },

    createCourse(payload) {
        return api.post('/faculty/courses', payload);
    },

    updateCourse(courseId, payload) {
        return api.patch(`/faculty/courses/${courseId}`, payload);
    },

    deleteCourse(courseId) {
        return api.delete(`/faculty/courses/${courseId}`);
    },

    // ── Lessons ──────────────────────────────────────────────
    addLesson(courseId, payload) {
        return api.post(`/faculty/courses/${courseId}/lessons`, payload);
    },

    updateLesson(courseId, lessonId, payload) {
        return api.patch(`/faculty/courses/${courseId}/lessons/${lessonId}`, payload);
    },

    uploadLessonMaterial(courseId, lessonId, file) {
        const formData = new FormData();
        formData.append('file', file);
        return api.post(`/faculty/courses/${courseId}/lessons/${lessonId}/material`, formData, {
            headers: { 'Content-Type': undefined },
        });
    },

    deleteLessonMaterial(courseId, lessonId) {
        return api.delete(`/faculty/courses/${courseId}/lessons/${lessonId}/material`);
    },

    deleteLesson(courseId, lessonId) {
        return api.delete(`/faculty/courses/${courseId}/lessons/${lessonId}`);
    },

    // ── Assessments ──────────────────────────────────────────
    addAssessment(courseId, payload) {
        return api.post(`/faculty/courses/${courseId}/assessments`, payload);
    },

    updateAssessment(courseId, assessmentId, payload) {
        return api.patch(`/faculty/courses/${courseId}/assessments/${assessmentId}`, payload);
    },

    deleteAssessment(courseId, assessmentId) {
        return api.delete(`/faculty/courses/${courseId}/assessments/${assessmentId}`);
    },

    listQuestions(courseId, assessmentId) {
        return api.get(`/faculty/courses/${courseId}/assessments/${assessmentId}/questions`);
    },

    addManualQuestion(courseId, assessmentId, payload) {
        return api.post(`/faculty/courses/${courseId}/assessments/${assessmentId}/questions`, payload);
    },

    deleteQuestion(courseId, assessmentId, questionId) {
        return api.delete(`/faculty/courses/${courseId}/assessments/${assessmentId}/questions/${questionId}`);
    },

    generateQuestionsWithAi(courseId, assessmentId) {
        return api.post(`/faculty/courses/${courseId}/assessments/${assessmentId}/generate`);
    },
};

export default facultyApi;
