// academyApi.js — Student Academy endpoints (approved courses for their institution)
import api from './api';

const academyApi = {
    listCourses() {
        return api.get('/academy/courses');
    },

    getCourse(courseId) {
        return api.get(`/academy/courses/${courseId}`);
    },

    markLessonComplete(courseId, lessonId) {
        return api.post(`/academy/courses/${courseId}/lessons/${lessonId}/complete`);
    },

    startAssessment(courseId, assessmentId) {
        return api.get(`/academy/courses/${courseId}/assessments/${assessmentId}/take`);
    },

    submitAssessment(courseId, assessmentId, payload) {
        return api.post(`/academy/courses/${courseId}/assessments/${assessmentId}/submit`, payload);
    },
};

export default academyApi;
