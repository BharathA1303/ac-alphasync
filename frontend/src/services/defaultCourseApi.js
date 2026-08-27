// defaultCourseApi.js — AI-generated default courses (every role except student)
import api from './api';

const defaultCourseApi = {
    listCourses() {
        return api.get('/default-courses/courses');
    },

    getCourse(courseId) {
        return api.get(`/default-courses/courses/${courseId}`);
    },

    markLessonComplete(courseId, lessonId) {
        return api.post(`/default-courses/courses/${courseId}/lessons/${lessonId}/complete`);
    },

    startAssessment(courseId, assessmentId) {
        return api.get(`/default-courses/courses/${courseId}/assessments/${assessmentId}/take`);
    },

    submitAssessment(courseId, assessmentId, payload) {
        return api.post(`/default-courses/courses/${courseId}/assessments/${assessmentId}/submit`, payload);
    },
};

export default defaultCourseApi;
