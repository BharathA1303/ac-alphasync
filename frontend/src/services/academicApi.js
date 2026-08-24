// academicApi.js — Super Admin + Institution Admin academic endpoints
import api from './api';

const academicApi = {
    // ── Super Admin: institutions ──────────────────────────────────
    listInstitutions() {
        return api.get('/admin/academic/institutions');
    },

    getInstitution(institutionId) {
        return api.get(`/admin/academic/institutions/${institutionId}`);
    },

    createInstitution(payload) {
        return api.post('/admin/academic/institutions', payload);
    },

    updateInstitution(institutionId, payload) {
        return api.patch(`/admin/academic/institutions/${institutionId}`, payload);
    },

    createInstitutionAdminInvite(payload) {
        return api.post('/admin/academic/invite-link', payload);
    },

    listInstitutionAdminInvites(institutionId) {
        return api.get(`/admin/academic/institutions/${institutionId}/invite-links`);
    },

    deleteInstitutionAdminInvite(institutionId, linkId) {
        return api.delete(`/admin/academic/institutions/${institutionId}/invite-links/${linkId}`);
    },

    listAcademicUsers(params = {}) {
        return api.get('/admin/academic/users', { params });
    },

    // ── Institution Admin workspace ────────────────────────────────
    getInstitutionDashboard() {
        return api.get('/institution/dashboard');
    },

    createMemberInvite(payload) {
        return api.post('/institution/invite-link', payload);
    },

    listMemberInvites(params = {}) {
        return api.get('/institution/invite-links', { params });
    },

    deleteMemberInvite(linkId) {
        return api.delete(`/institution/invite-links/${linkId}`);
    },

    listInstitutionMembers(params = {}) {
        return api.get('/institution/members', { params });
    },

    getStudentStats(studentId) {
        return api.get(`/institution/student-stats/${studentId}`);
    },

    grantAssessmentRetake(memberId, assessmentId) {
        return api.post(`/institution/members/${memberId}/grant-retake`, { assessment_id: assessmentId });
    },

    removeMember(memberId) {
        return api.delete(`/institution/members/${memberId}`);
    },

    // ── Institution Admin: course approval (this institution only) ──
    listInstitutionCourses(params = {}) {
        return api.get('/institution/courses', { params });
    },

    approveCourse(courseId, payload = {}) {
        return api.post(`/institution/courses/${courseId}/approve`, payload);
    },

    rejectCourse(courseId, payload = {}) {
        return api.post(`/institution/courses/${courseId}/reject`, payload);
    },

    deleteInstitutionCourse(courseId) {
        return api.delete(`/institution/courses/${courseId}`);
    },

    // ── Public invite lookup (registration banner) ─────────────────
    getInviteInfo(token) {
        return api.get('/auth/invite-info', { params: { token } });
    },
};

export default academicApi;
