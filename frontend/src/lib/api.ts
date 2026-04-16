import axios from 'axios';
import Cookies from 'js-cookie';

const API_URL = '/api';
const IS_PROD = process.env.NODE_ENV === 'production';

function cookieDomain(): string | undefined {
    if (typeof window === "undefined") return undefined;
    const host = window.location.hostname.toLowerCase();
    // Share auth cookies across subdomains in production.
    if (host.endsWith("mastersat.uz")) return ".mastersat.uz";
    return undefined;
}

const AUTH_COOKIE_NAMES = [
    "access_token",
    "refresh_token",
    "is_admin",
    "is_frozen",
    "role",
    "lms_permissions",
    "lms_scope",
    "lms_user",
] as const;

function clearAuthCookiesEverywhere() {
    if (typeof window === "undefined") return;
    const host = window.location.hostname;
    const sharedDomain = cookieDomain();
    const domains = [undefined, host, sharedDomain].filter(Boolean) as (string | undefined)[];
    const paths = ["/"];

    for (const name of AUTH_COOKIE_NAMES) {
        for (const path of paths) {
            Cookies.remove(name, { path });
            for (const domain of domains) {
                Cookies.remove(name, { path, domain });
            }
        }
    }
}

async function persistMeCookie(rememberMe: boolean) {
    try {
        const me = await usersApi.getMe();
        const cookieOptions = {
            secure: IS_PROD,
            sameSite: "strict" as const,
            expires: rememberMe ? 7 : undefined,
            domain: IS_PROD ? cookieDomain() : undefined,
            path: "/",
        };
        Cookies.set(
            "lms_user",
            JSON.stringify({
                id: me?.id,
                email: me?.email,
                username: me?.username,
                first_name: me?.first_name,
                last_name: me?.last_name,
            }),
            cookieOptions,
        );
    } catch {
        // best-effort; UI will fall back to role-only if this fails
    }
}

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
                // Avoid blocking alerts (and leaking backend detail strings) in production UX.
                console.warn("Forbidden:", error.response.data.detail);
            }
        }
        if (error.response?.status === 401) {
            clearAuthCookiesEverywhere();
            if (typeof window !== 'undefined') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export const usersApi = {
    getMe: async () => {
        const r = await api.get('/users/me/');
        return r.data;
    },
    patchMe: async (data: FormData | Record<string, unknown>) => {
        const r = await api.patch('/users/me/', data);
        return r.data;
    },
    /** Public: Telegram widget bot username when TELEGRAM_BOT_TOKEN is set (uses getMe if TELEGRAM_BOT_USERNAME unset). */
    getTelegramWidgetConfig: async (): Promise<{ enabled: boolean; bot_username: string | null }> => {
        const r = await api.get('/users/telegram/config/');
        return r.data;
    },
    /** Link Telegram to the logged-in user (profile). */
    linkTelegram: async (payload: Record<string, unknown>) => {
        const r = await api.post('/users/telegram/link/', payload);
        return r.data;
    },
    /** Active SAT/exam dates for profile dropdown (admin-managed). */
    listExamDates: async () => {
        const r = await api.get('/users/exam-dates/');
        return r.data;
    },
};

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
        // Avoid "sticky sessions" when old host-only + shared-domain cookies both exist.
        clearAuthCookiesEverywhere();
        const response = await api.post('/auth/login/', { email, password });
        const cookieOptions = {
            secure: IS_PROD,
            sameSite: 'strict' as const,
            expires: rememberMe ? 7 : undefined,
            domain: IS_PROD ? cookieDomain() : undefined,
            path: "/",
        };
        Cookies.set('access_token', response.data.access, cookieOptions);
        Cookies.set('refresh_token', response.data.refresh, cookieOptions);
        Cookies.set('is_admin', response.data.is_admin ? 'true' : 'false', cookieOptions);
        Cookies.set('is_frozen', response.data.is_frozen ? 'true' : 'false', cookieOptions);
        Cookies.set('role', String(response.data.role || 'student').toLowerCase(), cookieOptions);
        if (Array.isArray(response.data.permissions)) {
            Cookies.set('lms_permissions', JSON.stringify(response.data.permissions), cookieOptions);
        }
        if (Array.isArray(response.data.scope)) {
            Cookies.set('lms_scope', JSON.stringify(response.data.scope), cookieOptions);
        }
        await persistMeCookie(rememberMe);
        return response.data;
    },
    googleAuth: async (credential: string, profile?: { first_name?: string; last_name?: string; username?: string }, rememberMe = true) => {
        clearAuthCookiesEverywhere();
        const response = await api.post('/users/google/', { credential, ...(profile || {}) });
        const cookieOptions = {
            secure: IS_PROD,
            sameSite: 'strict' as const,
            expires: rememberMe ? 7 : undefined,
            domain: IS_PROD ? cookieDomain() : undefined,
            path: "/",
        };
        Cookies.set('access_token', response.data.access, cookieOptions);
        Cookies.set('refresh_token', response.data.refresh, cookieOptions);
        Cookies.set('is_admin', response.data.is_admin ? 'true' : 'false', cookieOptions);
        Cookies.set('is_frozen', response.data.is_frozen ? 'true' : 'false', cookieOptions);
        Cookies.set('role', String(response.data.role || 'student').toLowerCase(), cookieOptions);
        if (Array.isArray(response.data.permissions)) {
            Cookies.set('lms_permissions', JSON.stringify(response.data.permissions), cookieOptions);
        }
        if (Array.isArray(response.data.scope)) {
            Cookies.set('lms_scope', JSON.stringify(response.data.scope), cookieOptions);
        }
        await persistMeCookie(rememberMe);
        return response.data;
    },
    telegramAuth: async (
        payload: Record<string, unknown> & {
            id: number;
            auth_date: number;
            hash: string;
        },
        rememberMe = true
    ) => {
        clearAuthCookiesEverywhere();
        const response = await api.post('/users/telegram/', payload);
        const cookieOptions = {
            secure: IS_PROD,
            sameSite: 'strict' as const,
            expires: rememberMe ? 7 : undefined,
            domain: IS_PROD ? cookieDomain() : undefined,
            path: "/",
        };
        Cookies.set('access_token', response.data.access, cookieOptions);
        Cookies.set('refresh_token', response.data.refresh, cookieOptions);
        Cookies.set('is_admin', response.data.is_admin ? 'true' : 'false', cookieOptions);
        Cookies.set('is_frozen', response.data.is_frozen ? 'true' : 'false', cookieOptions);
        Cookies.set('role', String(response.data.role || 'student').toLowerCase(), cookieOptions);
        if (Array.isArray(response.data.permissions)) {
            Cookies.set('lms_permissions', JSON.stringify(response.data.permissions), cookieOptions);
        }
        if (Array.isArray(response.data.scope)) {
            Cookies.set('lms_scope', JSON.stringify(response.data.scope), cookieOptions);
        }
        await persistMeCookie(rememberMe);
        return response.data;
    },
    logout: () => {
        clearAuthCookiesEverywhere();
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
    /** Pastpaper practice library only (standalone tests). Timed mocks: mock-exams APIs + /mock/:id. */
    getPracticeTests: async () => {
        const res = await api.get('/exams/');
        return res.data;
    },
    getPracticeTest: async (id: number) => {
        const res = await api.get(`/exams/${id}/`);
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

export const classesApi = {
    list: async () => { const r = await api.get('/classes/'); return r.data; },
    /** Single classroom (member only); 404 if not enrolled or invalid id. */
    get: async (classId: number) => {
        const r = await api.get(`/classes/${classId}/`);
        return r.data;
    },
    create: async (data: { name: string; subject: 'ENGLISH' | 'MATH'; lesson_days: 'ODD' | 'EVEN'; lesson_time?: string; lesson_hours?: number; start_date?: string; room_number?: string; telegram_chat_id?: string; teacher?: number; max_students?: number; is_active?: boolean }) => {
        const r = await api.post('/classes/', data);
        return r.data;
    },
    update: async (classId: number, data: Record<string, unknown>) => {
        const r = await api.patch(`/classes/${classId}/`, data);
        return r.data;
    },
    join: async (join_code: string) => {
        const r = await api.post('/classes/join/', { join_code });
        return r.data;
    },
    regenerateCode: async (classId: number) => {
        const r = await api.post(`/classes/${classId}/regenerate_code/`);
        return r.data;
    },
    people: async (classId: number) => {
        const r = await api.get(`/classes/${classId}/people/`);
        return r.data;
    },
    getLeaderboard: async (classId: number) => {
        const r = await api.get(`/classes/${classId}/leaderboard/`);
        return r.data;
    },
    /** Class teacher: mock exams + pastpaper tests for homework form (same visibility as portal lists). */
    getAssignmentOptions: async (classId: number) => {
        const r = await api.get(`/classes/${classId}/assignment-options/`);
        return r.data;
    },
    // Stream
    listPosts: async (classId: number) => {
        const r = await api.get(`/classes/${classId}/posts/`);
        return r.data;
    },
    createPost: async (classId: number, data: { content: string }) => {
        const r = await api.post(`/classes/${classId}/posts/`, data);
        return r.data;
    },
    // Assignments
    listAssignments: async (classId: number) => {
        const r = await api.get(`/classes/${classId}/assignments/`);
        return r.data;
    },
    createAssignment: async (classId: number, data: any, isFormData = false) => {
        const r = await api.post(`/classes/${classId}/assignments/`, data, isFormData ? {} : {});
        return r.data;
    },
    updateAssignment: async (classId: number, assignmentId: number, data: Record<string, unknown>) => {
        const r = await api.patch(`/classes/${classId}/assignments/${assignmentId}/`, data);
        return r.data;
    },
    deleteAssignment: async (classId: number, assignmentId: number) => {
        await api.delete(`/classes/${classId}/assignments/${assignmentId}/`);
    },
    submitAssignment: async (classId: number, assignmentId: number, payload: any, isFormData = true) => {
        const r = await api.post(`/classes/${classId}/assignments/${assignmentId}/submit/`, payload, isFormData ? {} : {});
        return r.data;
    },
    getMySubmission: async (classId: number, assignmentId: number) => {
        const r = await api.get(`/classes/${classId}/assignments/${assignmentId}/my-submission/`);
        return r.data;
    },
    // Admin grading
    listSubmissions: async (classId: number, assignmentId: number) => {
        const r = await api.get(`/classes/${classId}/assignments/${assignmentId}/submissions/`);
        return r.data;
    },
    gradeSubmission: async (submissionId: number, payload: { score?: string | number | null; feedback?: string }) => {
        const r = await api.post(`/classes/submissions/${submissionId}/grade/`, payload);
        return r.data;
    },
};

export const adminApi = {
    // Users
    getUsers: async () => { const r = await api.get('/users/'); return r.data; },
    createUser: async (data: object) => { const r = await api.post('/users/create/', data); return r.data; },
    updateUser: async (id: number, data: object) => { const r = await api.patch(`/users/${id}/update/`, data); return r.data; },
    deleteUser: async (id: number) => { await api.delete(`/users/${id}/delete/`); },

    listExamDatesAdmin: async () => {
        const r = await api.get('/users/admin/exam-dates/');
        return r.data;
    },
    createExamDate: async (data: {
        exam_date: string;
        label?: string;
        is_active?: boolean;
        sort_order?: number;
    }) => {
        const r = await api.post('/users/admin/exam-dates/', data);
        return r.data;
    },
    updateExamDate: async (
        id: number,
        data: Partial<{ exam_date: string; label: string; is_active: boolean; sort_order: number }>
    ) => {
        const r = await api.patch(`/users/admin/exam-dates/${id}/`, data);
        return r.data;
    },
    deleteExamDate: async (id: number) => {
        await api.delete(`/users/admin/exam-dates/${id}/`);
    },

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
    publishMockExam: async (examId: number) => {
        const r = await api.post(`/exams/admin/mock-exams/${examId}/publish/`);
        return r.data;
    },
    unpublishMockExam: async (examId: number) => {
        const r = await api.post(`/exams/admin/mock-exams/${examId}/unpublish/`);
        return r.data;
    },
    bulkAssignStudents: async (
        examIds: number[],
        userIds: number[],
        assignmentType: string = 'FULL',
        formType?: string,
        practiceTestIds?: number[]
    ) => {
        const payload: any = {
            exam_ids: examIds,
            user_ids: userIds,
            assignment_type: assignmentType,
        };
        if (formType) payload.form_type = formType;
        if (practiceTestIds?.length) payload.practice_test_ids = practiceTestIds;
        const res = await api.post('/exams/bulk_assign/', payload);
        return res.data;
    },

    getPastpaperPacks: async () => {
        const r = await api.get('/exams/admin/pastpaper-packs/');
        return r.data;
    },
    createPastpaperPack: async (data: object) => {
        const r = await api.post('/exams/admin/pastpaper-packs/', data);
        return r.data;
    },
    updatePastpaperPack: async (id: number, data: object) => {
        const r = await api.patch(`/exams/admin/pastpaper-packs/${id}/`, data);
        return r.data;
    },
    deletePastpaperPack: async (id: number) => {
        await api.delete(`/exams/admin/pastpaper-packs/${id}/`);
    },
    addPastpaperPackSection: async (packId: number, subject: 'READING_WRITING' | 'MATH') => {
        const r = await api.post(`/exams/admin/pastpaper-packs/${packId}/add_section/`, { subject });
        return r.data;
    },

    getPracticeTestsAdmin: async (standaloneOnly?: boolean) => {
        const r = await api.get('/exams/admin/tests/', {
            params: standaloneOnly ? { standalone: '1' } : undefined,
        });
        return r.data;
    },
    createPracticeTest: async (data: Record<string, unknown>) => {
        const r = await api.post('/exams/admin/tests/', { mock_exam: null, ...data });
        return r.data;
    },
    updatePracticeTest: async (id: number, data: object) => {
        const r = await api.patch(`/exams/admin/tests/${id}/`, data);
        return r.data;
    },
    deletePracticeTest: async (id: number) => {
        await api.delete(`/exams/admin/tests/${id}/`);
    },

    // Modules
    getModules: async (testId: number) => { const r = await api.get(`/exams/admin/tests/${testId}/modules/`); return r.data; },
    updateModule: async (testId: number, moduleId: number, data: object) => { const r = await api.patch(`/exams/admin/tests/${testId}/modules/${moduleId}/`, data); return r.data; },

    // Questions
    getQuestions: async (testId: number, moduleId: number) => { const r = await api.get(`/exams/admin/tests/${testId}/modules/${moduleId}/questions/`); return r.data; },
    createQuestion: async (testId: number, moduleId: number, data: FormData | object, isFormData = false) => {
        // Let axios set multipart boundary; a bare Content-Type breaks file uploads.
        const r = await api.post(`/exams/admin/tests/${testId}/modules/${moduleId}/questions/`, data, isFormData ? {} : {});
        return r.data;
    },
    updateQuestion: async (testId: number, moduleId: number, questionId: number, data: FormData | object, isFormData = false) => {
        const r = await api.patch(`/exams/admin/tests/${testId}/modules/${moduleId}/questions/${questionId}/`, data, isFormData ? {} : {});
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
