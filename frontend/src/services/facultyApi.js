// facultyApi.js — Faculty course-builder endpoints (own courses only)
import api from './api';

const facultyApi = {
    getDashboard() {
        return api.get('/faculty/dashboard');
    },

    listCourses() {
        return api.get('/faculty/courses');
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

    addLesson(courseId, payload) {
        return api.post(`/faculty/courses/${courseId}/lessons`, payload);
    },

    deleteLesson(courseId, lessonId) {
        return api.delete(`/faculty/courses/${courseId}/lessons/${lessonId}`);
    },

    addAssessment(courseId, payload) {
        return api.post(`/faculty/courses/${courseId}/assessments`, payload);
    },

    deleteAssessment(courseId, assessmentId) {
        return api.delete(`/faculty/courses/${courseId}/assessments/${assessmentId}`);
    },
};

export default facultyApi;
