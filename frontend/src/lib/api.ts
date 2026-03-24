import axios from 'axios';
import Cookies from 'js-cookie';

const API_URL = '/api';
const IS_PROD = process.env.NODE_ENV === 'production';

const api = axios.create({
    baseURL: API_URL,
});

api.interceptors.request.use((config) => {
    const token = Cookies.get('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 403 && error.response?.data?.detail) {
            if (typeof window !== 'undefined') {
                alert(error.response.data.detail);
            }
        }
        if (error.response?.status === 401) {
            Cookies.remove('access_token');
            Cookies.remove('refresh_token');
            if (typeof window !== 'undefined') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export const authApi = {
    register: async (firstName: string, lastName: string, username: string, email: string, password: string) => {
        const response = await api.post('/users/register/', { 
            first_name: firstName,
            last_name: lastName,
            username: username,
            email, 
            password
        });
        return response.data;
    },
    login: async (email: string, password: string, rememberMe = true) => {
        const response = await api.post('/auth/login/', { email, password });
        const cookieOptions = {
            secure: IS_PROD,
            sameSite: 'strict' as const,
            expires: rememberMe ? 7 : undefined
        };
        Cookies.set('access_token', response.data.access, cookieOptions);
        Cookies.set('refresh_token', response.data.refresh, cookieOptions);
        Cookies.set('is_admin', response.data.is_admin ? 'true' : 'false', cookieOptions);
        Cookies.set('is_frozen', response.data.is_frozen ? 'true' : 'false', cookieOptions);
        Cookies.set('role', response.data.role || 'STUDENT', cookieOptions);
        return response.data;
    },
    googleAuth: async (credential: string, profile?: { first_name?: string; last_name?: string; username?: string }, rememberMe = true) => {
        const response = await api.post('/users/google/', { credential, ...(profile || {}) });
        const cookieOptions = {
            secure: IS_PROD,
            sameSite: 'strict' as const,
            expires: rememberMe ? 7 : undefined
        };
        Cookies.set('access_token', response.data.access, cookieOptions);
        Cookies.set('refresh_token', response.data.refresh, cookieOptions);
        Cookies.set('is_admin', response.data.is_admin ? 'true' : 'false', cookieOptions);
        Cookies.set('is_frozen', response.data.is_frozen ? 'true' : 'false', cookieOptions);
        Cookies.set('role', response.data.role || 'STUDENT', cookieOptions);
        return response.data;
    },
    logout: () => {
        Cookies.remove('access_token');
        Cookies.remove('refresh_token');
        Cookies.remove('is_admin');
        Cookies.remove('is_frozen');
        Cookies.remove('role');
        window.location.href = '/login';
    }
};

export const examsApi = {
    getMockExams: async () => {
        const res = await api.get('/exams/mock-exams/');
        return res.data;
    },
    getMockExam: async (id: number) => {
        const res = await api.get(`/exams/mock-exams/${id}/`);
        return res.data;
    },
    getAttempts: async () => {
        const res = await api.get('/exams/attempts/');
        return res.data;
    },
    startTest: async (testId: number) => {
        const res = await api.post('/exams/attempts/', { practice_test: testId });
        return res.data;
    },
    startModule: async (attemptId: number, moduleId: number) => {
        const res = await api.post(`/exams/attempts/${attemptId}/start_module/`, { module_id: moduleId });
        return res.data;
    },
    getAttemptStatus: async (attemptId: number) => {
        const res = await api.get(`/exams/attempts/${attemptId}/`);
        return res.data;
    },
    submitModule: async (attemptId: number, answers: object, flagged: number[] = []) => {
        const res = await api.post(`/exams/attempts/${attemptId}/submit_module/`, { answers, flagged });
        return res.data;
    },
    saveAttempt: async (attemptId: number, answers: object, flagged: number[] = []) => {
        const res = await api.post(`/exams/attempts/${attemptId}/save_attempt/`, { answers, flagged });
        return res.data;
    },
    getReview: async (attemptId: number, moduleId?: number) => {
        const url = moduleId
            ? `/exams/attempts/${attemptId}/review/?module_id=${moduleId}`
            : `/exams/attempts/${attemptId}/review/`;
        const res = await api.get(url);
        return res.data;
    }
};

export const adminApi = {
    // Users
    getUsers: async () => { const r = await api.get('/users/'); return r.data; },
    createUser: async (data: object) => { const r = await api.post('/users/create/', data); return r.data; },
    updateUser: async (id: number, data: object) => { const r = await api.patch(`/users/${id}/update/`, data); return r.data; },
    deleteUser: async (id: number) => { await api.delete(`/users/${id}/delete/`); },

    // Mock Exams (top-level grouping)
    getMockExams: async () => { const r = await api.get('/exams/admin/mock-exams/'); return r.data; },
    createMockExam: async (data: object) => { const r = await api.post('/exams/admin/mock-exams/', data); return r.data; },
    updateMockExam: async (id: number, data: object) => { const r = await api.patch(`/exams/admin/mock-exams/${id}/`, data); return r.data; },
    deleteMockExam: async (id: number) => { await api.delete(`/exams/admin/mock-exams/${id}/`); },
    addTestToExam: async (examId: number, subject: string, label: string = '', formType: string = 'INTERNATIONAL') => {
        const r = await api.post(`/exams/admin/mock-exams/${examId}/add_test/`, { subject, label, form_type: formType });
        return r.data;
    },
    removeTestFromExam: async (examId: number, testId: number) => {
        const r = await api.delete(`/exams/admin/mock-exams/${examId}/remove_test/`, { data: { test_id: testId } });
        return r.data;
    },
    assignStudentsToExam: async (examId: number, userIds: number[]) => {
        const r = await api.post(`/exams/admin/mock-exams/${examId}/assign_users/`, { user_ids: userIds });
        return r.data;
    },
    bulkAssignStudents: async (examIds: number[], userIds: number[], assignmentType: string = 'FULL', formType?: string) => {
        const payload: any = { 
            exam_ids: examIds, 
            user_ids: userIds,
            assignment_type: assignmentType 
        };
        if (formType) payload.form_type = formType;
        const res = await api.post('/exams/bulk_assign/', payload);
        return res.data;
    },

    // Modules
    getModules: async (testId: number) => { const r = await api.get(`/exams/admin/tests/${testId}/modules/`); return r.data; },
    updateModule: async (testId: number, moduleId: number, data: object) => { const r = await api.patch(`/exams/admin/tests/${testId}/modules/${moduleId}/`, data); return r.data; },

    // Questions
    getQuestions: async (testId: number, moduleId: number) => { const r = await api.get(`/exams/admin/tests/${testId}/modules/${moduleId}/questions/`); return r.data; },
    createQuestion: async (testId: number, moduleId: number, data: FormData | object, isFormData = false) => {
        const r = await api.post(`/exams/admin/tests/${testId}/modules/${moduleId}/questions/`, data, isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {});
        return r.data;
    },
    updateQuestion: async (testId: number, moduleId: number, questionId: number, data: FormData | object, isFormData = false) => {
        const r = await api.patch(`/exams/admin/tests/${testId}/modules/${moduleId}/questions/${questionId}/`, data, isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {});
        return r.data;
    },
    deleteQuestion: async (testId: number, moduleId: number, questionId: number) => {
        await api.delete(`/exams/admin/tests/${testId}/modules/${moduleId}/questions/${questionId}/`);
    },
    reorderQuestion: async (testId: number, moduleId: number, questionId: number, action: 'up' | 'down') => {
        const r = await api.post(`/exams/admin/tests/${testId}/modules/${moduleId}/questions/${questionId}/reorder/`, { action });
        return r.data;
    },
};

export default api;
