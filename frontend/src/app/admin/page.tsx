"use client";
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { adminApi } from '@/lib/api';
import {
    can,
    canManageMockExamShell,
    canCreateTestForSubject,
    canEditQuestionsForSubject,
    canDeletePracticeTestFromMock,
} from '@/lib/permissions';

const getImageUrl = (path: string | null | undefined) => {
    if (!path) return '';
    if (path.startsWith('http') || path.startsWith('blob:')) return path;
    const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';
    return `${baseUrl}${path}`;
};
import {
    Users, BookOpen, ShieldCheck, LogOut, Plus, Pencil, Trash2, Save,
    X, Loader2, ChevronRight, CheckSquare, Square, Layers, HelpCircle, Search, Upload, Image as ImageIcon, ArrowUp, ArrowDown,
    Bold as BoldIcon, Italic as ItalicIcon, Underline as UnderlineIcon, Sigma, Percent, Variable
} from 'lucide-react';

// KaTeX dynamic import for rendering math in previews
const MathRenderer = ({ html, id = 'math-preview' }: { html: string, id?: string }) => {
    useEffect(() => {
        const render = () => {
            // KaTeX
            if (typeof window !== 'undefined' && (window as any).renderMathInElement) {
                const el = document.getElementById(id);
                if (el) {
                    (window as any).renderMathInElement(el, {
                        delimiters: [
                            {left: '$$', right: '$$', display: true},
                            {left: '\\(', right: '\\)', display: false},
                            {left: '\\[', right: '\\]', display: true}
                        ],
                        throwOnError: false
                    });
                }
            }
            // MathJax 3
            if (typeof window !== 'undefined' && (window as any).MathJax && (window as any).MathJax.typesetPromise) {
                (window as any).MathJax.typesetPromise([document.getElementById(id)]);
            }
        };
        render();
        const timer = setTimeout(render, 1000);
        return () => clearTimeout(timer);
    }, [html, id]);

    // AUTO-DELIMIT HEURISTIC: If text contains LaTeX commands but no delimiters, wrap it for the preview.
    let processedHtml = html;
    if (html.includes('\\') && 
        /\\(frac|sqrt|alpha|beta|gamma|delta|theta|lambda|pi|omega|sum|int|infty|approx|times|div|pm|mp|le|ge|ne|equiv|subset|supset|cup|cap|in|ni|forall|exists|nabla|partial|rightarrow|leftarrow|up|down|leftrightarrow|underline|overline|^{| _{)/i.test(html) && 
        !html.includes('\\(') && !html.includes('\\[')) {
        processedHtml = `\\( ${html} \\)`;
    }

    return (
        <div 
            id={id}
            className="p-5 bg-indigo-50/30 rounded-2xl border border-indigo-100 text-sm min-h-[60px] prose prose-indigo max-w-none text-slate-800 leading-relaxed transition-all shadow-inner mathjax-process"
            dangerouslySetInnerHTML={{ __html: processedHtml.replace(/\n/g, '<br/>') || '<span class="text-slate-300 italic">Example: The value of \\( x^2 \\) is...</span>' }}
        />
    );
};

const RichTextEditor = ({ value, onChange, label, placeholder = "" }: { value: string, onChange: (val: string) => void, label: string, placeholder?: string }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [showPreview, setShowPreview] = useState(true);
    const id = useRef(`math-preview-${Math.random().toString(36).substr(2, 9)}`).current;

    const handleInsert = (syntax: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const before = value.substring(0, start);
        const selection = value.substring(start, end);
        const after = value.substring(end);

        let newText = "";
        let newCursorPos = 0;

        // If something is selected and it's a wrap-tag (like <b></b> or \( \))
        if (selection && (syntax.includes('><') || syntax.includes('  '))) {
            const parts = syntax.includes('><') ? syntax.split('><') : syntax.split('  ');
            const left = parts[0] + (syntax.includes('><') ? '>' : '');
            const right = (syntax.includes('><') ? '<' : '') + parts[1];
            newText = before + left + selection + right + after;
            newCursorPos = end + left.length + right.length;
        } else {
            // Standard insertion or empty tag
            newText = before + syntax + after;
            // Place cursor inside if it's a tag pair
            if (syntax.includes('><')) {
                newCursorPos = start + syntax.indexOf('><') + 1;
            } else if (syntax.includes('  ')) {
                newCursorPos = start + syntax.indexOf('  ') + 1;
            } else {
                newCursorPos = start + syntax.length;
            }
        }

        onChange(newText);
        
        // Return focus and set cursor
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 10);
    };

    const tools = [
        { label: 'Bold', icon: <BoldIcon className="w-3.5 h-3.5" />, syntax: '<b></b>' },
        { label: 'Italic', icon: <ItalicIcon className="w-3.5 h-3.5" />, syntax: '<i></i>' },
        { label: 'Underline', icon: <UnderlineIcon className="w-3.5 h-3.5" />, syntax: '<u></u>' },
        { label: 'Bullets', icon: <span className="text-xs font-bold">•</span>, syntax: '<ul class="big-dot-list"><li></li></ul>' },
        { label: 'Formula', icon: <Sigma className="w-3.5 h-3.5" />, syntax: '\\(  \\)' },
        { label: 'Sqrt', icon: <span className="text-xs font-bold font-serif">√</span>, syntax: '\\sqrt{ }' },
        { label: 'Frac', icon: <span className="text-xs font-bold">½</span>, syntax: '\\frac{ }{ }' },
        { label: 'Power', icon: <span className="text-xs font-bold">x²</span>, syntax: '^{ }' },
        { label: 'Sub', icon: <span className="text-xs font-bold">xᵢ</span>, syntax: '_{ }' },
        { label: 'Degree', icon: <span className="text-xs font-bold">°</span>, syntax: '°' },
        { label: 'Pi', icon: <span className="text-xs font-bold italic">π</span>, syntax: 'π' },
        { label: 'Less', icon: <span className="text-xs font-bold">{'<'}</span>, syntax: '<' },
        { label: 'Greater', icon: <span className="text-xs font-bold">{'>'}</span>, syntax: '>' },
        { label: 'LE', icon: <span className="text-xs font-bold">≤</span>, syntax: '\\le ' },
        { label: 'GE', icon: <span className="text-xs font-bold">≥</span>, syntax: '\\ge ' },
    ];

    return (
        <div className="flex flex-col gap-1 w-full group/editor">
            <div className="flex items-center justify-between mb-1 px-1">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
                <button 
                    onClick={(e) => { e.preventDefault(); setShowPreview(!showPreview); }}
                    className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md border transition-all ${showPreview ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
                >
                    {showPreview ? 'Preview: On' : 'Preview: Off'}
                </button>
            </div>
            
            <div className="flex flex-wrap gap-1 p-1 bg-slate-50 rounded-t-xl border border-slate-200 border-b-0">
                {tools.map((t, i) => (
                    <button
                        key={i}
                        onClick={(e) => { e.preventDefault(); handleInsert(t.syntax); }}
                        className="p-1 px-2.5 bg-white hover:bg-indigo-50 hover:text-indigo-600 text-slate-500 rounded-lg border border-slate-200 shadow-sm flex items-center gap-1.5 transition-all active:scale-90"
                        title={t.label}
                    >
                        {t.icon}
                        <span className="text-[10px] font-black uppercase tracking-tighter sm:inline hidden">{t.label}</span>
                    </button>
                ))}
            </div>
            
            <textarea
                ref={textareaRef}
                className={INPUT + ' min-h-[120px] font-mono !rounded-t-none border-t border-slate-100 placeholder:text-slate-300'}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
            />

            {showPreview && (
                <div className="mt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1 ml-1 flex items-center gap-2">
                        <Variable className="w-2.5 h-2.5" /> Live Render Preview
                    </p>
                    <MathRenderer html={value} id={id} />
                </div>
            )}
        </div>
    );
};

type Tab = 'users' | 'pastpapers' | 'mocks' | 'modules' | 'questions' | 'assignments';

// ─── Inline Form Row ──────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{label}</label>
            {children}
        </div>
    );
}

const INPUT = "input-modern";
const BTN_PRIMARY = "btn-primary text-xs";
const BTN_GHOST = "btn-secondary text-xs !px-3 !py-2";
const BTN_DANGER = "flex items-center gap-1 text-[11px] font-bold text-red-500 hover:text-red-700 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-all";

const STAFF_ROLE_OPTIONS: { value: string; label: string }[] = [
    { value: 'STUDENT', label: 'Student' },
    { value: 'ADMIN', label: 'Administrator' },
    { value: 'SUPER_ADMIN', label: 'Super administrator' },
    { value: 'TEST_ADMIN', label: 'Test author (create only)' },
    { value: 'ENGLISH_ADMIN', label: 'English / R&W tests only' },
    { value: 'MATH_ADMIN', label: 'Math tests only' },
];

export default function AdminPage() {
    const router = useRouter();
    const didInitMockSelection = useRef(false);
    const [activeTab, setActiveTab] = useState<Tab>('pastpapers');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState('');

    // Data
    const [users, setUsers] = useState<any[]>([]);
    const [mockExams, setMockExams] = useState<any[]>([]);
    const [standaloneTests, setStandaloneTests] = useState<any[]>([]);
    const [modules, setModules] = useState<any[]>([]);
    const [questions, setQuestions] = useState<any[]>([]);

    // Selection
    const [selectedMockId, setSelectedMockId] = useState<number | null>(null);
    const [selectedPracticeTestId, setSelectedPracticeTestId] = useState<number | null>(null);
    const [selectedModuleId, setSelectedModuleId] = useState<number | null>(null);

    // Forms
    const [userForm, setUserForm] = useState({ first_name: '', last_name: '', username: '', email: '', password: '', role: 'STUDENT', is_active: true, is_frozen: false });
    const [mockForm, setMockForm] = useState({
        title: '',
        practice_date: '',
        is_active: true,
        kind: 'MOCK_SAT' as string,
        midterm_subject: 'READING_WRITING',
        midterm_module_count: 2,
        midterm_module1_minutes: 60,
        midterm_module2_minutes: 60,
    });
    const [questionForm, setQuestionForm] = useState({ 
        question_text: '', question_prompt: '', 
        option_a: '', option_b: '', option_c: '', option_d: '',
        correct_answer: 'A', score: 10, question_type: 'MATH', is_math_input: false 
    });
    const [questionImage, setQuestionImage] = useState<File | null>(null);
    const [optionAImage, setOptionAImage] = useState<File | null>(null);
    const [optionBImage, setOptionBImage] = useState<File | null>(null);
    const [optionCImage, setOptionCImage] = useState<File | null>(null);
    const [optionDImage, setOptionDImage] = useState<File | null>(null);
    const [clearQuestionImage, setClearQuestionImage] = useState(false);
    const [clearOptionAImage, setClearOptionAImage] = useState(false);
    const [clearOptionBImage, setClearOptionBImage] = useState(false);
    const [clearOptionCImage, setClearOptionCImage] = useState(false);
    const [clearOptionDImage, setClearOptionDImage] = useState(false);
    const [assignments, setAssignments] = useState<Record<number, number[]>>({});
    const [userSearch, setUserSearch] = useState('');

    // Editing
    const [editingUser, setEditingUser] = useState<any>(null);
    const [editingMock, setEditingMock] = useState<any>(null);
    const [editingQuestion, setEditingQuestion] = useState<any>(null);
    const [bulkAssignExams, setBulkAssignExams] = useState<number[]>([]);
    const [bulkAssignUsers, setBulkAssignUsers] = useState<number[]>([]);
    const [bulkAssignType, setBulkAssignType] = useState<string>('FULL');
    const [bulkAssignFormType, setBulkAssignFormType] = useState<string>(''); // empty means all
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [bulkTestSearch, setBulkTestSearch] = useState('');
    const [bulkUserSearch, setBulkUserSearch] = useState('');

    // New Test Creation State (per mock id)
    const [newTestLabels, setNewTestLabels] = useState<Record<number, string>>({});
    const [newTestFormTypes, setNewTestFormTypes] = useState<Record<number, string>>({});
    const [editingPastpaper, setEditingPastpaper] = useState<any>(null);
    const [pastpaperForm, setPastpaperForm] = useState({
        title: '',
        subject: 'READING_WRITING' as 'READING_WRITING' | 'MATH',
        label: '',
        form_type: 'INTERNATIONAL',
    });
    const [pastpaperAssignments, setPastpaperAssignments] = useState<Record<number, number[]>>({});
    const [assignmentsFocus, setAssignmentsFocus] = useState<'mock' | 'pastpaper'>('mock');
    const [bulkAssignPracticeTests, setBulkAssignPracticeTests] = useState<number[]>([]);

    const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

    // Fetch
    const fetchUsers = useCallback(async () => { try { setUsers(await adminApi.getUsers()); } catch(e){} }, []);
    
    const fetchMockExams = useCallback(async () => {
        try {
            const data = await adminApi.getMockExams();
            setMockExams(data);
            if (data.length > 0 && !didInitMockSelection.current) {
                didInitMockSelection.current = true;
                setSelectedMockId((prev) => prev ?? data[0].id);
            }
            const init: Record<number, number[]> = {};
            data.forEach((m: any) => { init[m.id] = m.assigned_users || []; });
            setAssignments(init);
        } catch(e) {}
    }, []);

    const fetchStandaloneTests = useCallback(async () => {
        try {
            const data = await adminApi.getPracticeTestsAdmin(true);
            setStandaloneTests(data);
            const init: Record<number, number[]> = {};
            data.forEach((t: any) => { init[t.id] = t.assigned_users || []; });
            setPastpaperAssignments(init);
        } catch (e) { /* ignore */ }
    }, []);

    const fetchModules = useCallback(async () => {
        if (!selectedPracticeTestId) return [];
        try {
            const data = await adminApi.getModules(selectedPracticeTestId);
            setModules(data);
            return data;
        } catch(e) { return []; }
    }, [selectedPracticeTestId]);

    const fetchQuestions = useCallback(async () => {
        if (!selectedPracticeTestId || !selectedModuleId) return;
        try { setQuestions(await adminApi.getQuestions(selectedPracticeTestId, selectedModuleId)); } catch(e) {}
    }, [selectedPracticeTestId, selectedModuleId]);

    useEffect(() => { fetchMockExams(); fetchStandaloneTests(); fetchUsers(); }, [fetchMockExams, fetchStandaloneTests, fetchUsers]);

    const allSelectableTests = useMemo(() => {
        const rows: any[] = [];
        standaloneTests.forEach((t) => rows.push({ ...t, _group: 'pastpaper' as const }));
        mockExams.forEach((m) =>
            (m.tests || []).forEach((t: any) =>
                rows.push({ ...t, _group: 'mock' as const, _mockTitle: m.title, _mockId: m.id })
            )
        );
        return rows;
    }, [standaloneTests, mockExams]);

    const mockParentForSelectedTest = useMemo(() => {
        if (!selectedPracticeTestId) return null;
        const t = allSelectableTests.find((x) => x.id === selectedPracticeTestId);
        const mid = t?.mock_exam;
        if (mid == null || mid === undefined) return null;
        const mockPk = typeof mid === 'object' ? mid.id : mid;
        return mockExams.find((m) => m.id === mockPk) || null;
    }, [selectedPracticeTestId, allSelectableTests, mockExams]);

    useEffect(() => { 
        if (selectedPracticeTestId) {
            fetchModules().then(data => {
                if (data && data.length > 0) setSelectedModuleId(data[0].id);
                else setSelectedModuleId(null);
            });
        }
    }, [selectedPracticeTestId, fetchModules]);

    useEffect(() => { 
        if (selectedPracticeTestId && selectedModuleId) fetchQuestions(); 
    }, [selectedModuleId, selectedPracticeTestId, fetchQuestions]);

    // ── User CRUD
    const handleSaveUser = async () => {
        setSaving(true);
        try {
            const payload: Record<string, unknown> = {
                first_name: userForm.first_name,
                last_name: userForm.last_name,
                username: userForm.username,
                email: userForm.email,
                is_active: userForm.is_active,
                is_frozen: userForm.is_frozen,
            };
            if (can('manage_roles')) {
                payload.role = userForm.role;
            }
            if (userForm.password?.trim()) {
                payload.password = userForm.password;
            }
            if (editingUser?.id) {
                await adminApi.updateUser(editingUser.id, payload);
            } else {
                await adminApi.createUser({ ...payload, password: userForm.password || '' });
            }
            await fetchUsers();
            setEditingUser(null);
            setUserForm({ first_name: '', last_name: '', username: '', email: '', password: '', role: 'STUDENT', is_active: true, is_frozen: false });
            showToast('User saved ✓');
        } finally { setSaving(false); }
    };
    const handleDeleteUser = async (id: number) => {
        if (!confirm('Delete this user?')) return;
        await adminApi.deleteUser(id); await fetchUsers(); showToast('User deleted');
    };

    // ── Mock Exam CRUD
    const handleSaveMock = async () => {
        setSaving(true);
        try {
            if (editingMock?.id) { await adminApi.updateMockExam(editingMock.id, mockForm); }
            else { await adminApi.createMockExam(mockForm); }
            await fetchMockExams();
            setEditingMock(null);
            setMockForm({
                title: '',
                practice_date: '',
                is_active: true,
                kind: 'MOCK_SAT',
                midterm_subject: 'READING_WRITING',
                midterm_module_count: 2,
                midterm_module1_minutes: 60,
                midterm_module2_minutes: 60,
            });
            showToast('Mock Exam saved ✓');
        } finally { setSaving(false); }
    };
    const handleDeleteMock = async (id: number) => {
        if (!confirm('Delete this mock exam and all its tests?')) return;
        await adminApi.deleteMockExam(id); await fetchMockExams(); showToast('Mock Exam deleted');
    };

    const handleAddTest = async (subject: 'READING_WRITING' | 'MATH', mockId?: number) => {
        const targetMockId = mockId || selectedMockId;
        if (!targetMockId) return;

        const label = newTestLabels[targetMockId] || '';
        const formType = newTestFormTypes[targetMockId] || 'INTERNATIONAL';

        setSaving(true);
        try {
            await adminApi.addTestToExam(targetMockId, subject, label, formType);
            await fetchMockExams();
            showToast(`${subject === 'READING_WRITING' ? 'English' : 'Math'} test added ✓`);
            
            // Reset only for this mock
            setNewTestLabels(prev => ({ ...prev, [targetMockId]: '' }));
        } finally { setSaving(false); }
    };

    const handleRemoveTest = async (testId: number, mockId?: number) => {
        const targetMockId = mockId || selectedMockId;
        if (!targetMockId || !confirm('Remove this test?')) return;
        setSaving(true);
        try {
            await adminApi.removeTestFromExam(targetMockId, testId);
            await fetchMockExams();
            showToast('Test removed');
        } finally { setSaving(false); }
    };

    const handleSavePastpaper = async () => {
        if (!editingPastpaper?.id && !canCreateTestForSubject(pastpaperForm.subject)) return;
        if (editingPastpaper?.id && !canEditQuestionsForSubject(pastpaperForm.subject)) return;
        setSaving(true);
        try {
            const payload = {
                title: pastpaperForm.title.trim(),
                subject: pastpaperForm.subject,
                label: pastpaperForm.label.trim(),
                form_type: pastpaperForm.form_type,
            };
            if (editingPastpaper?.id) {
                await adminApi.updatePracticeTest(editingPastpaper.id, payload);
            } else {
                await adminApi.createPracticeTest(payload);
            }
            await fetchStandaloneTests();
            setEditingPastpaper(null);
            setPastpaperForm({ title: '', subject: 'READING_WRITING', label: '', form_type: 'INTERNATIONAL' });
            showToast('Pastpaper practice test saved ✓');
        } finally {
            setSaving(false);
        }
    };

    const handleDeletePastpaper = async (id: number) => {
        const t = standaloneTests.find((x) => x.id === id);
        if (!t || !canDeletePracticeTestFromMock(t.subject)) return;
        if (!confirm('Delete this pastpaper practice test and all modules/questions?')) return;
        setSaving(true);
        try {
            await adminApi.deletePracticeTest(id);
            if (selectedPracticeTestId === id) {
                setSelectedPracticeTestId(null);
                setSelectedModuleId(null);
            }
            await fetchStandaloneTests();
            showToast('Deleted');
        } finally {
            setSaving(false);
        }
    };

    const handleSavePastpaperAssignments = async (testId: number) => {
        try {
            await adminApi.updatePracticeTest(testId, { assigned_users: pastpaperAssignments[testId] || [] });
            showToast('Assignments saved');
        } catch (e) {
            console.error(e);
        }
    };

    // ── Module CRUD (now within a specific PracticeTest)
    const handleSaveModule = async (moduleId?: number, data?: any) => {
        if (!selectedPracticeTestId) return;
        setSaving(true);
        try {
            await adminApi.updateModule(selectedPracticeTestId, moduleId!, data);
            await fetchModules();
            showToast('Module updated ✓');
        } finally { setSaving(false); }
    };

    // ── Question CRUD
    const handleSaveQuestion = async () => {
        if (!selectedPracticeTestId || !selectedModuleId) return;
        setSaving(true);
        try {
            const formData = new FormData();
            
            // Auto-set question_type if it's MATH
            const currentTest = allSelectableTests.find(t => t.id === selectedPracticeTestId);
            const finalForm = { ...questionForm };
            if (currentTest?.subject === 'MATH') {
                finalForm.question_type = 'MATH';
            }

            Object.entries(finalForm).forEach(([key, val]) => {
                formData.append(key, String(val));
            });
            if (questionImage) {
                formData.append('question_image', questionImage);
            }
            if (clearQuestionImage) formData.append('clear_question_image', 'true');
            if (optionAImage) formData.append('option_a_image', optionAImage);
            if (optionBImage) formData.append('option_b_image', optionBImage);
            if (optionCImage) formData.append('option_c_image', optionCImage);
            if (optionDImage) formData.append('option_d_image', optionDImage);
            if (clearOptionAImage) formData.append('clear_option_a_image', 'true');
            if (clearOptionBImage) formData.append('clear_option_b_image', 'true');
            if (clearOptionCImage) formData.append('clear_option_c_image', 'true');
            if (clearOptionDImage) formData.append('clear_option_d_image', 'true');

            if (editingQuestion?.id) { 
                await adminApi.updateQuestion(selectedPracticeTestId, selectedModuleId, editingQuestion.id, formData, true); 
            }
            else { 
                await adminApi.createQuestion(selectedPracticeTestId, selectedModuleId, formData, true); 
            }
            await fetchQuestions();
            setEditingQuestion(null);
            setQuestionForm({ 
                question_text: '', question_prompt: '', 
                option_a: '', option_b: '', option_c: '', option_d: '',
                correct_answer: 'A', score: 10, question_type: (currentTest?.subject === 'MATH' ? 'MATH' : 'READING'), is_math_input: (currentTest?.subject === 'MATH')
            });
            setQuestionImage(null);
            setOptionAImage(null);
            setOptionBImage(null);
            setOptionCImage(null);
            setOptionDImage(null);
            setClearQuestionImage(false);
            setClearOptionAImage(false);
            setClearOptionBImage(false);
            setClearOptionCImage(false);
            setClearOptionDImage(false);
            showToast('Question saved ✓');
        } catch (e: any) {
            const details = e?.response?.data;
            const detailText = typeof details?.detail === 'string'
                ? details.detail
                : (typeof details === 'string'
                    ? details
                    : (details ? JSON.stringify(details) : null));
            alert('Error: ' + (e?.response?.status === 404
                ? '404 - Endpoint not found or IDs mismatch'
                : (detailText || e?.message || 'Invalid')));
        }
        finally { setSaving(false); }
    };
    const handleReorderQuestion = async (id: number, action: 'up' | 'down') => {
        if (!selectedPracticeTestId || !selectedModuleId) return;
        try {
            await adminApi.reorderQuestion(selectedPracticeTestId, selectedModuleId, id, action);
            fetchQuestions();
        } catch (e: any) { showToast('Cannot move further'); }
    };
    const handleDeleteQuestion = async (qId: number) => {
        if (!selectedPracticeTestId || !selectedModuleId) return;
        if (!confirm('Delete this question?')) return;
        await adminApi.deleteQuestion(selectedPracticeTestId, selectedModuleId, qId);
        await fetchQuestions(); showToast('Question deleted');
    };

    // ── Assignments
    const handleSaveAssignment = async (examId: number) => {
        try {
            await adminApi.assignStudentsToExam(examId, assignments[examId] || []);
            showToast("Assignments saved!");
        } catch (e) { console.error(e); }
    };

    const closeBulkModal = () => {
        setShowBulkModal(false);
        setBulkAssignExams([]);
        setBulkAssignPracticeTests([]);
        setBulkAssignUsers([]);
        setBulkAssignType('FULL');
        setBulkAssignFormType('');
        setBulkTestSearch('');
        setBulkUserSearch('');
    };

    const handleBulkAssign = async () => {
        if (bulkAssignUsers.length === 0) {
            showToast("Select at least one user");
            return;
        }
        if (bulkAssignExams.length === 0 && bulkAssignPracticeTests.length === 0) {
            showToast("Select at least one mock exam or pastpaper test");
            return;
        }
        setSaving(true);
        try {
            await adminApi.bulkAssignStudents(
                bulkAssignExams,
                bulkAssignUsers,
                bulkAssignType,
                bulkAssignFormType || undefined,
                bulkAssignPracticeTests.length ? bulkAssignPracticeTests : undefined
            );
            showToast(`Assigned access to ${bulkAssignUsers.length} user(s).`);
            if (bulkAssignExams.length) setSelectedMockId(bulkAssignExams[0]);
            closeBulkModal();
            fetchMockExams();
            fetchStandaloneTests();
        } catch (e) {
            console.error(e);
            showToast("Failed to perform bulk assignment");
        } finally {
            setSaving(false);
        }
    };

    // Score Budgeting Logic
    const getModuleBudget = (subject: string, order: number) => {
        if (subject === 'READING_WRITING') return order === 1 ? 330 : 270;
        return order === 1 ? 380 : 220;
    };
    const getModuleBase = (subject: string, order: number) => {
        return order === 1 ? 200 : 0;
    };

    const currentModule = modules.find(m => m.id === selectedModuleId);
    const currentTest = allSelectableTests.find((t) => t.id === selectedPracticeTestId);
    const isMidtermExamContext = mockParentForSelectedTest?.kind === 'MIDTERM';
    const moduleScoreSum = questions.reduce((sum, q) => sum + (q.score || 0), 0);
    const budget = (currentTest && currentModule)
        ? (isMidtermExamContext ? 9_999_999 : getModuleBudget(currentTest.subject, currentModule.module_order))
        : 0;
    const base = (currentTest && currentModule) ? getModuleBase(currentTest.subject, currentModule.module_order) : 0;
    
    const maxQuestions = isMidtermExamContext ? 999 : (currentTest?.subject === 'MATH' ? 22 : 27);
    const selectedPracticeSubject = currentTest?.subject as string | undefined;
    const canEditCurrentQuestions = canEditQuestionsForSubject(selectedPracticeSubject);
    const isAtLimit = questions.length >= maxQuestions;
    const predictedSum = editingQuestion !== null ? (moduleScoreSum - (editingQuestion.id ? (questions.find(q => q.id === editingQuestion.id)?.score || 0) : 0) + (questionForm.score || 0)) : moduleScoreSum;
    const isOverBudget = predictedSum > budget;

    const navItems: { key: Tab; label: string; icon: React.ReactNode }[] = useMemo(() => {
        const all: { key: Tab; label: string; icon: React.ReactNode }[] = [
            { key: 'pastpapers', label: 'Pastpaper tests', icon: <BookOpen className="w-4 h-4" /> },
            { key: 'mocks', label: 'Mock exams', icon: <Layers className="w-4 h-4" /> },
            { key: 'questions', label: 'Questions', icon: <HelpCircle className="w-4 h-4" /> },
            { key: 'assignments', label: 'Assignments', icon: <CheckSquare className="w-4 h-4" /> },
            { key: 'users', label: 'Users', icon: <Users className="w-4 h-4" /> },
        ];
        const testArea =
            can('*') ||
            can('view_all_tests') ||
            can('view_english_tests') ||
            can('view_math_tests') ||
            can('create_test') ||
            can('edit_test') ||
            can('delete_test');
        const filtered = all.filter((item) => {
            if (item.key === 'users') return can('manage_users');
            if (item.key === 'assignments') return can('assign_test_access');
            return testArea;
        });
        return filtered.length ? filtered : all.filter((i) => i.key === 'pastpapers');
    }, []);

    useEffect(() => {
        const keys = navItems.map((i) => i.key);
        if (!keys.includes(activeTab)) {
            setActiveTab((keys[0] || 'pastpapers') as Tab);
        }
    }, [navItems, activeTab]);

    return (
        <AuthGuard adminOnly={true}>
            <div className="min-h-screen app-bg flex flex-col">
                {toast && (
                    <div className="fixed top-4 right-4 z-[999] bg-emerald-600 text-white text-sm font-bold px-5 py-3 rounded-xl shadow-xl animate-in slide-in-from-right-4">
                        {toast}
                    </div>
                )}

                <header className="bg-slate-900/95 backdrop-blur-xl px-8 py-4 flex items-center justify-between sticky top-0 z-50 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
                            <ShieldCheck className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-white font-bold text-lg tracking-tight">MasterSAT Admin</span>
                    </div>
                    <button onClick={() => router.push('/')} className="flex items-center gap-2 text-slate-400 hover:text-white text-xs font-bold transition-colors">
                        <LogOut className="w-4 h-4" /> Exit
                    </button>
                </header>

                <div className="flex flex-1 overflow-hidden">
                    <aside className="w-56 bg-white/85 backdrop-blur-xl border-r border-slate-200/90 flex flex-col py-4 gap-1 px-2 shrink-0">
                        {navItems.map(item => (
                            <button
                                key={item.key}
                                onClick={() => setActiveTab(item.key)}
                                className={`w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === item.key ? 'bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                                {item.icon} {item.label}
                            </button>
                        ))}
                    </aside>

                    <main className="flex-1 p-8 overflow-y-auto">
                        {activeTab === 'pastpapers' && (
                            <div className="space-y-6 max-w-4xl">
                                <div className="flex items-center justify-between gap-4 flex-wrap">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-900">Pastpaper practice tests</h2>
                                        <p className="text-xs text-slate-500 mt-1 max-w-xl">
                                            Past papers and sectional drills as standalone tests. These are not timed mock exams; use <strong>Mock exams</strong> for full SAT / midterm flows.
                                        </p>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        {can('assign_test_access') && (
                                            <button className={BTN_GHOST} onClick={() => setShowBulkModal(true)}>
                                                <Users className="w-4 h-4" /> Bulk assign
                                            </button>
                                        )}
                                        {(canCreateTestForSubject('READING_WRITING') || canCreateTestForSubject('MATH')) && (
                                            <button className={BTN_PRIMARY} onClick={() => { setEditingPastpaper({}); setPastpaperForm({ title: '', subject: 'READING_WRITING', label: '', form_type: 'INTERNATIONAL' }); }}>
                                                <Plus className="w-4 h-4" /> New pastpaper test
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {editingPastpaper !== null && (
                                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm grid grid-cols-2 gap-4">
                                        <Field label="Title (pastpaper name)"><input className={INPUT} value={pastpaperForm.title} onChange={e => setPastpaperForm({ ...pastpaperForm, title: e.target.value })} placeholder="e.g. December 2025 Form C — English" /></Field>
                                        <Field label="Section">
                                            <select className={INPUT} value={pastpaperForm.subject} onChange={e => setPastpaperForm({ ...pastpaperForm, subject: e.target.value as 'READING_WRITING' | 'MATH' })}>
                                                <option value="READING_WRITING">Reading &amp; Writing</option>
                                                <option value="MATH">Math</option>
                                            </select>
                                        </Field>
                                        <Field label="Form label (e.g. A, B)"><input className={INPUT} value={pastpaperForm.label} onChange={e => setPastpaperForm({ ...pastpaperForm, label: e.target.value })} placeholder="Optional" /></Field>
                                        <Field label="Form type">
                                            <select className={INPUT} value={pastpaperForm.form_type} onChange={e => setPastpaperForm({ ...pastpaperForm, form_type: e.target.value })}>
                                                <option value="INTERNATIONAL">International</option>
                                                <option value="US">US</option>
                                            </select>
                                        </Field>
                                        <div className="col-span-2 flex justify-end gap-2">
                                            <button className={BTN_GHOST} onClick={() => setEditingPastpaper(null)}><X className="w-4 h-4" /> Cancel</button>
                                            <button className={BTN_PRIMARY} onClick={() => void handleSavePastpaper()} disabled={saving || (!editingPastpaper?.id && !canCreateTestForSubject(pastpaperForm.subject)) || (!!editingPastpaper?.id && !canEditQuestionsForSubject(pastpaperForm.subject))}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save</button>
                                        </div>
                                    </div>
                                )}
                                <div className="space-y-4">
                                    {standaloneTests.length === 0 && (
                                        <p className="text-sm text-slate-500 bg-white rounded-2xl border border-slate-200 p-6">No pastpaper tests yet. Create one, then add questions under the Questions tab.</p>
                                    )}
                                    {standaloneTests.map((t) => (
                                        <div key={t.id} className={`bg-white rounded-2xl border border-slate-200 p-5 shadow-sm ${selectedPracticeTestId === t.id ? 'ring-2 ring-indigo-500' : ''}`}>
                                            <div className="flex items-start justify-between gap-4">
                                                <button type="button" className="text-left flex-1 min-w-0" onClick={() => { setSelectedPracticeTestId(t.id); setSelectedMockId(null); }}>
                                                    <p className="font-bold text-slate-900">{t.title?.trim() || `${t.subject === 'MATH' ? 'Math' : 'Reading & Writing'} · ${t.form_type === 'US' ? 'US' : 'International'}${t.label ? ` (${t.label})` : ''}`}</p>
                                                    <p className="text-[11px] text-slate-400 uppercase tracking-wider font-bold mt-1">Pastpaper · {(t.modules?.length ?? 0)} module(s)</p>
                                                </button>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button type="button" className={BTN_GHOST} onClick={() => { setActiveTab('questions'); setSelectedPracticeTestId(t.id); setSelectedMockId(null); }}>Questions</button>
                                                    {can('edit_test') && canEditQuestionsForSubject(t.subject) && (
                                                        <button type="button" className={BTN_GHOST} onClick={() => { setEditingPastpaper(t); setPastpaperForm({ title: t.title || '', subject: t.subject, label: t.label || '', form_type: t.form_type || 'INTERNATIONAL' }); }}><Pencil className="w-3.5 h-3.5" /> Edit</button>
                                                    )}
                                                    {canDeletePracticeTestFromMock(t.subject) && (
                                                        <button type="button" className={BTN_DANGER} onClick={() => void handleDeletePastpaper(t.id)}><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'mocks' && (
                            <div className="space-y-6 max-w-4xl">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-900">Timed mock exams</h2>
                                        <p className="text-xs text-slate-500 mt-1">Full SAT or midterm flows, publish to the student mock portal, and assign access.</p>
                                    </div>
                                    <div className="flex gap-2">
                                        {can('assign_test_access') && (
                                            <button className={BTN_GHOST} onClick={() => setShowBulkModal(true)}>
                                                <Users className="w-4 h-4" /> Bulk assign
                                            </button>
                                        )}
                                        {canManageMockExamShell() && (
                                            <button className={BTN_PRIMARY} onClick={() => { setEditingMock({}); setMockForm({
                                                title: '',
                                                practice_date: '',
                                                is_active: true,
                                                kind: 'MOCK_SAT',
                                                midterm_subject: 'READING_WRITING',
                                                midterm_module_count: 2,
                                                midterm_module1_minutes: 60,
                                                midterm_module2_minutes: 60,
                                            }); }}>
                                                <Plus className="w-4 h-4" /> New mock exam
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {editingMock !== null && (
                                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm grid grid-cols-2 gap-4">
                                        <Field label="Title"><input className={INPUT} value={mockForm.title} onChange={e => setMockForm({ ...mockForm, title: e.target.value })} placeholder="e.g. Mock SAT #1" /></Field>
                                        <Field label="Practice Date"><input type="date" className={INPUT} value={mockForm.practice_date} onChange={e => setMockForm({ ...mockForm, practice_date: e.target.value })} /></Field>
                                        <Field label="Exam type">
                                            <select
                                                className={INPUT}
                                                value={mockForm.kind}
                                                disabled={!!editingMock?.id}
                                                onChange={e => setMockForm({ ...mockForm, kind: e.target.value })}
                                            >
                                                <option value="MOCK_SAT">SAT mock (add R&amp;W / Math sections below)</option>
                                                <option value="MIDTERM">Midterm (1 subject, 1–2 modules, custom time)</option>
                                            </select>
                                        </Field>
                                        {mockForm.kind === 'MIDTERM' && !editingMock?.id && (
                                            <>
                                                <Field label="Midterm subject">
                                                    <select className={INPUT} value={mockForm.midterm_subject} onChange={e => setMockForm({ ...mockForm, midterm_subject: e.target.value })}>
                                                        <option value="READING_WRITING">Reading &amp; Writing</option>
                                                        <option value="MATH">Math</option>
                                                    </select>
                                                </Field>
                                                <Field label="Number of modules">
                                                    <select className={INPUT} value={mockForm.midterm_module_count} onChange={e => setMockForm({ ...mockForm, midterm_module_count: Number(e.target.value) })}>
                                                        <option value={1}>1 module</option>
                                                        <option value={2}>2 modules</option>
                                                    </select>
                                                </Field>
                                                <Field label="Module 1 (minutes)"><input type="number" min={1} className={INPUT} value={mockForm.midterm_module1_minutes} onChange={e => setMockForm({ ...mockForm, midterm_module1_minutes: Number(e.target.value) })} /></Field>
                                                <Field label="Module 2 (minutes)"><input type="number" min={1} className={INPUT} disabled={mockForm.midterm_module_count < 2} value={mockForm.midterm_module2_minutes} onChange={e => setMockForm({ ...mockForm, midterm_module2_minutes: Number(e.target.value) })} /></Field>
                                            </>
                                        )}
                                        <div className="flex items-center gap-2 mt-4 col-span-2"><input type="checkbox" id="act" checked={mockForm.is_active} onChange={e => setMockForm({ ...mockForm, is_active: e.target.checked })} /><label htmlFor="act" className="text-sm font-bold text-slate-600">Is Active</label></div>
                                        <div className="col-span-2 flex justify-end gap-2">
                                            <button className={BTN_GHOST} onClick={() => setEditingMock(null)}><X className="w-4 h-4" /> Cancel</button>
                                            <button className={BTN_PRIMARY} onClick={handleSaveMock} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save</button>
                                        </div>
                                    </div>
                                )}
                                <div className="space-y-4">
                                    {mockExams.map(mock => (
                                        <div key={mock.id} className={`bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow ${selectedMockId === mock.id ? 'ring-2 ring-indigo-500' : ''}`} onClick={() => setSelectedMockId(mock.id)}>
                                            <div className="p-5 flex items-center justify-between bg-slate-50/50">
                                                <div>
                                                    <p className="font-bold text-base text-slate-900">{mock.title}</p>
                                                    <p className="text-[11px] text-slate-400 uppercase tracking-wider font-bold">
                                                        <span className={mock.is_published ? "text-emerald-600" : "text-amber-600"}>
                                                            {mock.is_published ? "Published · " : "Draft · "}
                                                        </span>
                                                        {mock.kind === "MIDTERM" ? "Midterm · " : "SAT mock · "}
                                                        {mock.practice_date || "No date"} · {mock.tests?.length || 0} Sections
                                                    </p>
                                                    {!mock.is_published && mock.publish_block_reason ? (
                                                        <p className="text-[10px] text-amber-800 mt-1 max-w-xl leading-snug">{mock.publish_block_reason}</p>
                                                    ) : null}
                                                    {canManageMockExamShell() && (
                                                        <div className="flex flex-wrap gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                                                            {mock.publish_ready && !mock.is_published ? (
                                                                <button
                                                                    type="button"
                                                                    className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                                                                    onClick={async (e) => {
                                                                        e.stopPropagation();
                                                                        try {
                                                                            await adminApi.publishMockExam(mock.id);
                                                                            await fetchMockExams();
                                                                            showToast("Published. Assign students on the portal row or Assign users.");
                                                                        } catch (er: any) {
                                                                            showToast(er?.response?.data?.detail || "Publish failed");
                                                                        }
                                                                    }}
                                                                >
                                                                    Publish to students
                                                                </button>
                                                            ) : null}
                                                            {mock.is_published ? (
                                                                <button
                                                                    type="button"
                                                                    className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
                                                                    onClick={async (e) => {
                                                                        e.stopPropagation();
                                                                        if (!confirm("Unpublish? Students will no longer see this mock.")) return;
                                                                        try {
                                                                            await adminApi.unpublishMockExam(mock.id);
                                                                            await fetchMockExams();
                                                                            showToast("Unpublished");
                                                                        } catch (er: any) {
                                                                            showToast(er?.response?.data?.detail || "Unpublish failed");
                                                                        }
                                                                    }}
                                                                >
                                                                    Unpublish
                                                                </button>
                                                            ) : null}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {canManageMockExamShell() && (
                                                        <button className={BTN_GHOST + " bg-white shadow-sm border border-slate-100"} onClick={e => { e.stopPropagation(); setEditingMock(mock); setMockForm({
                                                            title: mock.title,
                                                            practice_date: mock.practice_date || '',
                                                            is_active: !!mock.is_active,
                                                            kind: mock.kind || 'MOCK_SAT',
                                                            midterm_subject: mock.midterm_subject || 'READING_WRITING',
                                                            midterm_module_count: mock.midterm_module_count ?? 2,
                                                            midterm_module1_minutes: mock.midterm_module1_minutes ?? 60,
                                                            midterm_module2_minutes: mock.midterm_module2_minutes ?? 60,
                                                        }); }}><Pencil className="w-3.5 h-3.5" /> Edit</button>
                                                    )}
                                                    {canManageMockExamShell() && (
                                                        <button className={BTN_DANGER + " bg-white shadow-sm border border-slate-100"} onClick={e => { e.stopPropagation(); handleDeleteMock(mock.id); }}><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="p-4 border-t border-slate-100 bg-white grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {(mock.tests || []).map((t: any) => (
                                                    <div key={t.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50/50 flex items-center justify-between">
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-2 h-2 rounded-full ${t.subject === 'MATH' ? 'bg-emerald-500' : 'bg-blue-500 shadow-sm shadow-blue-200'}`} />
                                                                <span className="text-[12px] font-black text-slate-800 uppercase tracking-wider">{t.subject === 'MATH' ? 'Mathematics' : 'Reading & Writing'}</span>
                                                                {t.label && <span className="text-[10px] font-black bg-slate-900 text-white px-2 py-0.5 rounded-lg shadow-sm">{t.label}</span>}
                                                            </div>
                                                            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest ml-5">{t.form_type === 'US' ? 'US Standard' : 'International Form'}</span>
                                                        </div>
                                                        {canDeletePracticeTestFromMock(t.subject) && (
                                                            <button onClick={(e) => { e.stopPropagation(); handleRemoveTest(t.id, mock.id); }} className="text-slate-300 hover:text-red-500 transition-colors"><X className="w-3.5 h-3.5" /></button>
                                                        )}
                                                    </div>
                                                ))}
                                                
                                                {mock.kind !== 'MIDTERM' && !(mock.kind === 'MOCK_SAT' && (mock.tests || []).some((t: any) => t.subject === 'READING_WRITING') && (mock.tests || []).some((t: any) => t.subject === 'MATH')) && (canCreateTestForSubject('READING_WRITING') || canCreateTestForSubject('MATH')) && (
                                                <div className="md:col-span-2 mt-2 pt-3 border-t border-slate-50 space-y-3">
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">Test Label (e.g. A, B)</span>
                                                            <input 
                                                                value={newTestLabels[mock.id] || ''} 
                                                                onChange={e => setNewTestLabels({ ...newTestLabels, [mock.id]: e.target.value })} 
                                                                placeholder="Optional label"
                                                                className={INPUT + " !py-1.5 !text-xs"}
                                                                onClick={e => e.stopPropagation()}
                                                            />
                                                        </div>
                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">Form Type</span>
                                                            <select 
                                                                value={newTestFormTypes[mock.id] || 'INTERNATIONAL'} 
                                                                onChange={e => setNewTestFormTypes({ ...newTestFormTypes, [mock.id]: e.target.value })}
                                                                className={INPUT + " !py-1.5 !text-xs"}
                                                                onClick={e => e.stopPropagation()}
                                                            >
                                                                <option value="INTERNATIONAL">International Form</option>
                                                                <option value="US">US Form</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        {canCreateTestForSubject('READING_WRITING') && (
                                                        <button onClick={(e) => { e.stopPropagation(); handleAddTest('READING_WRITING', mock.id); }} className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-blue-100 bg-blue-50/50 text-blue-600 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-blue-100 transition-all"><Plus className="w-3 h-3" /> English</button>
                                                        )}
                                                        {canCreateTestForSubject('MATH') && (
                                                        <button onClick={(e) => { e.stopPropagation(); handleAddTest('MATH', mock.id); }} className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-emerald-100 bg-emerald-50/50 text-emerald-600 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-100 transition-all"><Plus className="w-3 h-3" /> Mathematics</button>
                                                        )}
                                                    </div>
                                                </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'modules' && (
                            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200 border-dashed">
                                <Layers className="w-12 h-12 text-slate-200 mb-4" />
                                <h3 className="text-lg font-bold text-slate-400">Modules are now auto-created.</h3>
                                <p className="text-sm text-slate-300">Select a test in the Questions tab to manage its questions.</p>
                            </div>
                        )}

                        {activeTab === 'questions' && (
                            <div className="space-y-6 max-w-4xl">
                                <div className="flex items-center justify-between flex-wrap gap-3">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-900">Questions</h2>
                                        <div className="flex flex-col mt-1">
                                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                                Module Budget: <span className={moduleScoreSum > budget ? "text-red-600" : "text-emerald-600"}>{moduleScoreSum}</span> / {budget} points
                                                <span className="mx-2 text-slate-300">|</span>
                                                Questions: <span className={isAtLimit ? "text-red-600" : "text-emerald-600"}>{questions.length}</span> / {maxQuestions} limit
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 flex-wrap">
                                        <select
                                            className={INPUT + ' !min-w-[280px]'}
                                            value={selectedPracticeTestId || ''}
                                            onChange={(e) => {
                                                const id = Number(e.target.value);
                                                setSelectedPracticeTestId(id || null);
                                                setSelectedModuleId(null);
                                                const row = allSelectableTests.find((x) => x.id === id);
                                                if (row?._mockId) setSelectedMockId(row._mockId);
                                                else setSelectedMockId(null);
                                            }}
                                        >
                                            <option value="">Select practice test</option>
                                            <optgroup label="Pastpaper practice tests">
                                                {standaloneTests.map((t) => (
                                                    <option key={t.id} value={t.id}>
                                                        {(t.title?.trim() || `${t.subject === 'MATH' ? 'Math' : 'English'}`) +
                                                            (t.label ? ` [${t.label}]` : '')}
                                                    </option>
                                                ))}
                                            </optgroup>
                                            <optgroup label="Mock exam sections">
                                                {mockExams.flatMap((m) =>
                                                    (m.tests || []).map((t: any) => (
                                                        <option key={t.id} value={t.id}>
                                                            {m.title} — {t.subject === 'MATH' ? 'Math' : 'English'}
                                                            {t.label ? ` [${t.label}]` : ''}
                                                        </option>
                                                    ))
                                                )}
                                            </optgroup>
                                        </select>
                                        <select className={INPUT + ' !w-auto'} value={selectedModuleId || ''} onChange={e => setSelectedModuleId(Number(e.target.value))}>
                                            <option value="">Select Module</option>
                                            {modules.map(m => <option key={m.id} value={m.id}>{`Module ${m.module_order}`}</option>)}
                                        </select>
                                        <button className={BTN_PRIMARY} disabled={!canEditCurrentQuestions || !selectedModuleId || (isAtLimit && !editingQuestion?.id)} onClick={() => { 
                                            const currentTest = allSelectableTests.find(t => t.id === selectedPracticeTestId);
                                            setEditingQuestion({}); 
                                            setQuestionForm({ 
                                                question_text: '', question_prompt: '', 
                                                option_a: '', option_b: '', option_c: '', option_d: '',
                                                correct_answer: 'A', score: 10, question_type: (currentTest?.subject === 'MATH' ? 'MATH' : 'READING'), is_math_input: (currentTest?.subject === 'MATH') 
                                            });
                                            setQuestionImage(null);
                                            setOptionAImage(null);
                                            setOptionBImage(null);
                                            setOptionCImage(null);
                                            setOptionDImage(null);
                                            setClearQuestionImage(false);
                                            setClearOptionAImage(false);
                                            setClearOptionBImage(false);
                                            setClearOptionCImage(false);
                                            setClearOptionDImage(false);
                                        }}>
                                            <Plus className="w-4 h-4" /> Add Question
                                        </button>
                                        <button 
                                            className={`${BTN_PRIMARY} !bg-indigo-600 hover:!bg-indigo-700 disabled:!bg-slate-300 disabled:!text-slate-500`} 
                                            disabled={!canEditCurrentQuestions || !selectedModuleId || !isAtLimit || moduleScoreSum !== budget} 
                                            onClick={() => {
                                                setToast('✅ Module constraints verified and saved successfully!');
                                                setTimeout(() => setToast(''), 3000);
                                            }}
                                        >
                                            <Save className="w-4 h-4" /> Save Module
                                        </button>
                                    </div>
                                </div>

                                {editingQuestion !== null && canEditCurrentQuestions && (
                                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="col-span-2">
                                                <RichTextEditor 
                                                    label="Question Content (HTML & Math supported)" 
                                                    value={questionForm.question_text} 
                                                    onChange={val => setQuestionForm({ ...questionForm, question_text: val })}
                                                    placeholder="Focus here and use the toolbar above to format or add math..."
                                                />
                                            </div>
                                            {questionForm.question_type !== 'MATH' && (
                                                <div className="col-span-2">
                                                    <RichTextEditor 
                                                        label="Passage / Directions" 
                                                        value={questionForm.question_prompt} 
                                                        onChange={val => setQuestionForm({ ...questionForm, question_prompt: val })}
                                                    />
                                                </div>
                                            )}
                                            <div className="col-span-2 grid grid-cols-1 gap-6">
                                                {/* Option A */}
                                                <div className="space-y-2">
                                                    <RichTextEditor label="Option A" value={questionForm.option_a} onChange={val => setQuestionForm({...questionForm, option_a: val})} />
                                                    <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
                                                        <div className="flex items-center gap-2">
                                                            <ImageIcon className="w-3 h-3" /> {optionAImage ? optionAImage.name : editingQuestion?.option_a_image ? 'Has existing image' : 'No image'}
                                                        </div>
                                                        <label className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded cursor-pointer transition-colors border border-slate-200">
                                                            {optionAImage || editingQuestion?.option_a_image ? 'Change' : 'Upload Image'}
                                                            <input type="file" className="hidden" accept="image/*" onChange={e => {
                                                                const file = e.target.files?.[0] || null;
                                                                setOptionAImage(file);
                                                                if (file) setClearOptionAImage(false);
                                                                if (file) setQuestionForm({...questionForm, option_a: ''});
                                                            }} />
                                                        </label>
                                                        {(optionAImage || editingQuestion?.option_a_image) && <button onClick={() => { setOptionAImage(null); if (editingQuestion?.option_a_image) setClearOptionAImage(true); }} className="text-red-500 hover:underline">Clear</button>}
                                                        {(optionAImage || editingQuestion?.option_a_image) && (
                                                            <div className="w-8 h-8 rounded border border-slate-200 overflow-hidden bg-slate-50 ml-auto mr-4">
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img src={optionAImage ? URL.createObjectURL(optionAImage) : getImageUrl(editingQuestion?.option_a_image)} className="w-full h-full object-contain" alt="" />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Option B */}
                                                <div className="space-y-2">
                                                    <RichTextEditor label="Option B" value={questionForm.option_b} onChange={val => setQuestionForm({...questionForm, option_b: val})} />
                                                    <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
                                                        <div className="flex items-center gap-2">
                                                            <ImageIcon className="w-3 h-3" /> {optionBImage ? optionBImage.name : editingQuestion?.option_b_image ? 'Has existing image' : 'No image'}
                                                        </div>
                                                        <label className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded cursor-pointer transition-colors border border-slate-200">
                                                            {optionBImage || editingQuestion?.option_b_image ? 'Change' : 'Upload Image'}
                                                            <input type="file" className="hidden" accept="image/*" onChange={e => {
                                                                const file = e.target.files?.[0] || null;
                                                                setOptionBImage(file);
                                                                if (file) setClearOptionBImage(false);
                                                                if (file) setQuestionForm({...questionForm, option_b: ''});
                                                            }} />
                                                        </label>
                                                        {(optionBImage || editingQuestion?.option_b_image) && <button onClick={() => { setOptionBImage(null); if (editingQuestion?.option_b_image) setClearOptionBImage(true); }} className="text-red-500 hover:underline">Clear</button>}
                                                        {(optionBImage || editingQuestion?.option_b_image) && (
                                                            <div className="w-8 h-8 rounded border border-slate-200 overflow-hidden bg-slate-50 ml-auto mr-4">
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img src={optionBImage ? URL.createObjectURL(optionBImage) : getImageUrl(editingQuestion?.option_b_image)} className="w-full h-full object-contain" alt="" />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Option C */}
                                                <div className="space-y-2">
                                                    <RichTextEditor label="Option C" value={questionForm.option_c} onChange={val => setQuestionForm({...questionForm, option_c: val})} />
                                                    <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
                                                        <div className="flex items-center gap-2">
                                                            <ImageIcon className="w-3 h-3" /> {optionCImage ? optionCImage.name : editingQuestion?.option_c_image ? 'Has existing image' : 'No image'}
                                                        </div>
                                                        <label className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded cursor-pointer transition-colors border border-slate-200">
                                                            {optionCImage || editingQuestion?.option_c_image ? 'Change' : 'Upload Image'}
                                                            <input type="file" className="hidden" accept="image/*" onChange={e => {
                                                                const file = e.target.files?.[0] || null;
                                                                setOptionCImage(file);
                                                                if (file) setClearOptionCImage(false);
                                                                if (file) setQuestionForm({...questionForm, option_c: ''});
                                                            }} />
                                                        </label>
                                                        {(optionCImage || editingQuestion?.option_c_image) && <button onClick={() => { setOptionCImage(null); if (editingQuestion?.option_c_image) setClearOptionCImage(true); }} className="text-red-500 hover:underline">Clear</button>}
                                                        {(optionCImage || editingQuestion?.option_c_image) && (
                                                            <div className="w-8 h-8 rounded border border-slate-200 overflow-hidden bg-slate-50 ml-auto mr-4">
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img src={optionCImage ? URL.createObjectURL(optionCImage) : getImageUrl(editingQuestion?.option_c_image)} className="w-full h-full object-contain" alt="" />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Option D */}
                                                <div className="space-y-2">
                                                    <RichTextEditor label="Option D" value={questionForm.option_d} onChange={val => setQuestionForm({...questionForm, option_d: val})} />
                                                    <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
                                                        <div className="flex items-center gap-2">
                                                            <ImageIcon className="w-3 h-3" /> {optionDImage ? optionDImage.name : editingQuestion?.option_d_image ? 'Has existing image' : 'No image'}
                                                        </div>
                                                        <label className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded cursor-pointer transition-colors border border-slate-200">
                                                            {optionDImage || editingQuestion?.option_d_image ? 'Change' : 'Upload Image'}
                                                            <input type="file" className="hidden" accept="image/*" onChange={e => {
                                                                const file = e.target.files?.[0] || null;
                                                                setOptionDImage(file);
                                                                if (file) setClearOptionDImage(false);
                                                                if (file) setQuestionForm({...questionForm, option_d: ''});
                                                            }} />
                                                        </label>
                                                        {(optionDImage || editingQuestion?.option_d_image) && <button onClick={() => { setOptionDImage(null); if (editingQuestion?.option_d_image) setClearOptionDImage(true); }} className="text-red-500 hover:underline">Clear</button>}
                                                        {(optionDImage || editingQuestion?.option_d_image) && (
                                                            <div className="w-8 h-8 rounded border border-slate-200 overflow-hidden bg-slate-50 ml-auto mr-4">
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img src={optionDImage ? URL.createObjectURL(optionDImage) : getImageUrl(editingQuestion?.option_d_image)} className="w-full h-full object-contain" alt="" />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <Field label="Question Image">
                                                <div className="flex items-center gap-3">
                                                    <label className="flex-1 border-2 border-dashed border-slate-200 rounded-lg p-2 flex items-center justify-center gap-2 cursor-pointer hover:bg-slate-50 transition-colors">
                                                        <Upload className="w-4 h-4 text-slate-400" />
                                                        <span className="text-xs text-slate-500 font-bold">{questionImage ? questionImage.name : (editingQuestion?.question_image ? 'Has existing image' : 'Choose File')}</span>
                                                        <input type="file" className="hidden" accept="image/*" onChange={e => { const f = e.target.files?.[0] || null; setQuestionImage(f); if (f) setClearQuestionImage(false); }} />
                                                    </label>
                                                    {(questionImage || editingQuestion?.question_image) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => { setQuestionImage(null); if (editingQuestion?.question_image) setClearQuestionImage(true); }}
                                                            className="text-red-500 hover:bg-red-50 p-2 rounded-lg"
                                                            title="Remove image"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </Field>
                                            {allSelectableTests.find(t => t.id === selectedPracticeTestId)?.subject === 'READING_WRITING' && (
                                                <Field label="Type">
                                                    <select className={INPUT} value={questionForm.question_type} onChange={e => setQuestionForm({ ...questionForm, question_type: e.target.value })}>
                                                        <option value="READING">Reading</option><option value="WRITING">Writing</option>
                                                    </select>
                                                </Field>
                                            )}
                                            <Field label="Score (Subject to Logic)">
                                                <select className={INPUT} value={questionForm.score} onChange={e => setQuestionForm({...questionForm, score: Number(e.target.value)})}>
                                                    <option value={10}>10</option><option value={20}>20</option><option value={40}>40</option>
                                                </select>
                                            </Field>
                                            <Field label="Correct Answer">
                                                {questionForm.is_math_input ? (
                                                    <div>
                                                        <input 
                                                            className={INPUT} 
                                                            value={questionForm.correct_answer} 
                                                            onChange={e => setQuestionForm({ ...questionForm, correct_answer: e.target.value })} 
                                                            placeholder="e.g. 2/3, 0.666, 0.667" 
                                                        />
                                                        <p className="text-[10px] text-slate-400 mt-1">Separate multiple correct versions with a comma.</p>
                                                    </div>
                                                ) : (
                                                    <select className={INPUT} value={questionForm.correct_answer} onChange={e => setQuestionForm({ ...questionForm, correct_answer: e.target.value })}>
                                                        <option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option>
                                                    </select>
                                                )}
                                            </Field>

                                            {allSelectableTests.find(t => t.id === selectedPracticeTestId)?.subject === 'MATH' && (
                                                <div className="col-span-2 flex items-center gap-2">
                                                    <input type="checkbox" id="spr" checked={questionForm.is_math_input} onChange={e => setQuestionForm({ ...questionForm, is_math_input: e.target.checked })} className="w-4 h-4 rounded border-slate-300" />
                                                    <label htmlFor="spr" className="text-xs font-bold text-slate-600 uppercase tracking-wide cursor-pointer">Student-Produced Response (SPR)</label>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 items-center">
                                            <button className={BTN_GHOST} onClick={() => {
                                                setEditingQuestion(null);
                                                setOptionAImage(null);
                                                setOptionBImage(null);
                                                setOptionCImage(null);
                                                setOptionDImage(null);
                                            }}><X className="w-4 h-4" /> Cancel</button>
                                            <div className="flex items-center gap-3">
                                                {isOverBudget && <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest bg-red-50 px-2 py-1 rounded">Score Budget Exceeded ({predictedSum}/{budget})</span>}
                                                <button className={BTN_PRIMARY} onClick={handleSaveQuestion} disabled={saving || isOverBudget}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Question</button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                                    {questions.map((q, idx) => (
                                        <div key={q.id} className="p-4 border-b last:border-0 hover:bg-slate-50">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="inline-block bg-slate-900 text-white text-[10px] font-bold w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-sm">{idx + 1}</span>
                                                        <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${q.is_math_input ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'}`}>{q.is_math_input ? 'SPR' : 'MCQ'}</span>
                                                        <span className="text-[9px] font-bold text-slate-400 ml-1">CORECT: {q.correct_answer} · SCORE: {q.score}</span>
                                                        {q.question_image && <ImageIcon className="w-3 h-3 text-indigo-400" />}
                                                    </div>
                                                    <p className="text-sm text-slate-800 line-clamp-2">{q.question_text || q.question_prompt || '—'}</p>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {canEditCurrentQuestions && (
                                                    <div className="flex flex-col gap-0.5 mr-2">
                                                        <button disabled={idx === 0} onClick={() => handleReorderQuestion(q.id, 'up')} className={`p-1 rounded hover:bg-slate-200 text-slate-400 ${idx === 0 ? 'opacity-20 cursor-not-allowed' : 'hover:text-indigo-600'}`}><ArrowUp className="w-3 h-3" /></button>
                                                        <button disabled={idx === questions.length - 1} onClick={() => handleReorderQuestion(q.id, 'down')} className={`p-1 rounded hover:bg-slate-200 text-slate-400 ${idx === questions.length - 1 ? 'opacity-20 cursor-not-allowed' : 'hover:text-indigo-600'}`}><ArrowDown className="w-3 h-3" /></button>
                                                    </div>
                                                    )}
                                                    {canEditCurrentQuestions && (
                                                    <button className={BTN_GHOST} onClick={() => {
                                                        setEditingQuestion(q);
                                                        setQuestionForm({
                                                            question_text: q.question_text || '', question_prompt: q.question_prompt || '',
                                                            option_a: q.option_a || '', option_b: q.option_b || '', option_c: q.option_c || '', option_d: q.option_d || '',
                                                            correct_answer: q.correct_answer, score: q.score || 10,
                                                            question_type: q.question_type || 'MATH', is_math_input: q.is_math_input || false
                                                        });
                                                        setQuestionImage(null);
                                                        setOptionAImage(null);
                                                        setOptionBImage(null);
                                                        setOptionCImage(null);
                                                        setOptionDImage(null);
                                                        setClearQuestionImage(false);
                                                        setClearOptionAImage(false);
                                                        setClearOptionBImage(false);
                                                        setClearOptionCImage(false);
                                                        setClearOptionDImage(false);
                                                    }}><Pencil className="w-3.5 h-3.5" /></button>
                                                    )}
                                                    {canEditCurrentQuestions && (
                                                    <button className={BTN_DANGER} onClick={() => handleDeleteQuestion(q.id)}><Trash2 className="w-3.5 h-3.5" /></button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'assignments' && (
                            <div className="space-y-6 max-w-3xl">
                                <div className="flex items-center justify-between flex-wrap gap-3">
                                    <h2 className="text-xl font-bold text-slate-900">Assignments</h2>
                                    <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                                        <button
                                            type="button"
                                            className={`px-4 py-2 text-xs font-bold ${assignmentsFocus === 'mock' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}
                                            onClick={() => setAssignmentsFocus('mock')}
                                        >
                                            Mock exams
                                        </button>
                                        <button
                                            type="button"
                                            className={`px-4 py-2 text-xs font-bold ${assignmentsFocus === 'pastpaper' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}
                                            onClick={() => setAssignmentsFocus('pastpaper')}
                                        >
                                            Pastpaper tests
                                        </button>
                                    </div>
                                </div>

                                {assignmentsFocus === 'mock' && (
                                    <>
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm text-slate-600">Assign users to a timed mock (portal + sections).</p>
                                            {can('assign_test_access') && (
                                                <button className={BTN_PRIMARY} onClick={() => selectedMockId && handleSaveAssignment(selectedMockId)} disabled={saving || !selectedMockId}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save</button>
                                            )}
                                        </div>
                                        <div className="flex gap-3 flex-wrap">
                                            {mockExams.map(m => (
                                                <button key={m.id} type="button" onClick={() => setSelectedMockId(m.id)} className={`text-xs font-bold px-4 py-2 rounded-lg border transition-all ${selectedMockId === m.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>{m.title}</button>
                                            ))}
                                        </div>
                                        <div className="relative"><Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><input className={INPUT + ' pl-9'} placeholder="Search users..." value={userSearch} onChange={e => setUserSearch(e.target.value)} /></div>
                                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                                            {users.filter(u => (u.email + u.first_name + u.last_name + u.username).toLowerCase().includes(userSearch.toLowerCase())).map(user => {
                                                const isAssigned = (assignments[selectedMockId!] || []).includes(user.id);
                                                return (
                                                    <div key={user.id} className="p-4 border-b last:border-0 flex items-center justify-between hover:bg-slate-50 cursor-pointer" onClick={() => {
                                                        if (!selectedMockId) return;
                                                        const current = assignments[selectedMockId] || [];
                                                        const updated = isAssigned ? current.filter(id => id !== user.id) : [...current, user.id];
                                                        setAssignments({ ...assignments, [selectedMockId]: updated });
                                                    }}>
                                                        <div className="flex items-center gap-3">
                                                            {isAssigned ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4 text-slate-300" />}
                                                            <div><p className="font-bold text-sm text-slate-900">{user.first_name} {user.last_name}</p><p className="text-[11px] text-slate-400">{user.email} · @{user.username}</p></div>
                                                        </div>
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${user.role === 'STUDENT' ? 'bg-emerald-100 text-emerald-800' : user.role === 'SUPER_ADMIN' ? 'bg-violet-100 text-violet-800' : 'bg-indigo-100 text-indigo-800'}`}>{user.role}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}

                                {assignmentsFocus === 'pastpaper' && (
                                    <>
                                        <p className="text-sm text-slate-600">Who can see each pastpaper in Practice Tests.</p>
                                        <div className="flex gap-3 flex-wrap">
                                            {standaloneTests.map((t) => (
                                                <button
                                                    key={t.id}
                                                    type="button"
                                                    onClick={() => setSelectedPracticeTestId(t.id)}
                                                    className={`text-xs font-bold px-4 py-2 rounded-lg border transition-all ${selectedPracticeTestId === t.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                                                >
                                                    {t.title?.trim() || `${t.subject === 'MATH' ? 'Math' : 'R&W'}${t.label ? ` (${t.label})` : ''}`}
                                                </button>
                                            ))}
                                        </div>
                                        {standaloneTests.length === 0 ? (
                                            <p className="text-sm text-slate-500">Create pastpaper tests in the Pastpaper tab first.</p>
                                        ) : (
                                            <>
                                                <div className="flex items-center justify-between">
                                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                                        {(() => {
                                                            const st = standaloneTests.find((s) => s.id === selectedPracticeTestId);
                                                            const label = st?.title?.trim() || (st ? `${st.subject === 'MATH' ? 'Math' : 'R&W'}${st.label ? ` (${st.label})` : ''}` : null);
                                                            return label ? `Editing: ${label}` : 'Select a pastpaper test above';
                                                        })()}
                                                    </p>
                                                    {can('assign_test_access') && selectedPracticeTestId && standaloneTests.some((s) => s.id === selectedPracticeTestId) && (
                                                        <button className={BTN_PRIMARY} onClick={() => void handleSavePastpaperAssignments(selectedPracticeTestId)} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save</button>
                                                    )}
                                                </div>
                                                <div className="relative"><Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><input className={INPUT + ' pl-9'} placeholder="Search users..." value={userSearch} onChange={e => setUserSearch(e.target.value)} /></div>
                                                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                                                    {users.filter(u => (u.email + u.first_name + u.last_name + u.username).toLowerCase().includes(userSearch.toLowerCase())).map((user) => {
                                                        const tid = selectedPracticeTestId;
                                                        const isAssigned = tid ? (pastpaperAssignments[tid] || []).includes(user.id) : false;
                                                        return (
                                                            <div key={user.id} className="p-4 border-b last:border-0 flex items-center justify-between hover:bg-slate-50 cursor-pointer" onClick={() => {
                                                                if (!tid || !standaloneTests.some((s) => s.id === tid)) return;
                                                                const current = pastpaperAssignments[tid] || [];
                                                                const updated = isAssigned ? current.filter((id) => id !== user.id) : [...current, user.id];
                                                                setPastpaperAssignments({ ...pastpaperAssignments, [tid]: updated });
                                                            }}>
                                                                <div className="flex items-center gap-3">
                                                                    {isAssigned ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4 text-slate-300" />}
                                                                    <div><p className="font-bold text-sm text-slate-900">{user.first_name} {user.last_name}</p><p className="text-[11px] text-slate-400">{user.email} · @{user.username}</p></div>
                                                                </div>
                                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${user.role === 'STUDENT' ? 'bg-emerald-100 text-emerald-800' : user.role === 'SUPER_ADMIN' ? 'bg-violet-100 text-violet-800' : 'bg-indigo-100 text-indigo-800'}`}>{user.role}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        {activeTab === 'users' && (
                            <div className="space-y-6 max-w-4xl">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-xl font-bold text-slate-900">User Management</h2>
                                    <button className={BTN_PRIMARY} onClick={() => { setEditingUser({}); setUserForm({ first_name: '', last_name: '', username: '', email: '', password: '', role: 'STUDENT', is_active: true, is_frozen: false }); }}>
                                        <Plus className="w-4 h-4" /> New User
                                    </button>
                                </div>
                                {editingUser !== null && (
                                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm grid grid-cols-2 gap-4">
                                        <Field label="First Name"><input className={INPUT} value={userForm.first_name || ''} onChange={e => setUserForm({ ...userForm, first_name: e.target.value })} /></Field>
                                        <Field label="Last Name"><input className={INPUT} value={userForm.last_name || ''} onChange={e => setUserForm({ ...userForm, last_name: e.target.value })} /></Field>
                                        <Field label="Username"><input className={INPUT} value={userForm.username || ''} onChange={e => setUserForm({ ...userForm, username: e.target.value })} /></Field>
                                        <Field label="Email"><input className={INPUT} value={userForm.email || ''} onChange={e => setUserForm({ ...userForm, email: e.target.value })} /></Field>
                                        <Field label="Password"><input className={INPUT} type="password" value={userForm.password || ''} onChange={e => setUserForm({ ...userForm, password: e.target.value })} placeholder={editingUser.id ? "Leave blank to keep current" : "Set password"} /></Field>
                                        <Field label="User Role">
                                            {can('manage_roles') ? (
                                                <select
                                                    className={INPUT}
                                                    value={userForm.role}
                                                    onChange={e => setUserForm({ ...userForm, role: e.target.value })}
                                                >
                                                    {STAFF_ROLE_OPTIONS.map((o) => (
                                                        <option key={o.value} value={o.value}>{o.label}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <p className="text-sm font-bold text-slate-600 py-2">
                                                    {editingUser?.id ? userForm.role : 'Student (default)'}
                                                </p>
                                            )}
                                        </Field>
                                        <div className="flex items-center gap-6 mt-2">
                                            <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
                                                <input type="checkbox" checked={!!userForm.is_active} onChange={e => setUserForm({ ...userForm, is_active: e.target.checked })} />
                                                Active
                                            </label>
                                            <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
                                                <input type="checkbox" checked={!!userForm.is_frozen} onChange={e => setUserForm({ ...userForm, is_frozen: e.target.checked })} />
                                                Frozen
                                            </label>
                                        </div>
                                        <div className="col-span-2 flex justify-end gap-2">
                                            <button className={BTN_GHOST} onClick={() => setEditingUser(null)}><X className="w-4 h-4" /> Cancel</button>
                                            <button className={BTN_PRIMARY} onClick={handleSaveUser} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save User</button>
                                        </div>
                                    </div>
                                )}
                                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                                    {users.map(user => (
                                        <div key={user.id} className="p-4 border-b last:border-0 flex items-center justify-between hover:bg-slate-50">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-500">{user.first_name?.[0]}{user.last_name?.[0]}</div>
                                                <div><p className="font-bold text-sm text-slate-900">{user.first_name} {user.last_name} {user.role && user.role !== 'STUDENT' && <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded ml-1">{user.role}</span>} {user.is_frozen && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded ml-1">FROZEN</span>} {!user.is_active && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded ml-1">INACTIVE</span>}</p><p className="text-[11px] text-slate-400">{user.email} · @{user.username}</p></div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button className={BTN_GHOST} onClick={() => { setEditingUser(user); setUserForm({ first_name: user.first_name, last_name: user.last_name, username: user.username, email: user.email, password: '', role: user.role || 'STUDENT', is_active: user.is_active !== false, is_frozen: !!user.is_frozen }); }}><Pencil className="w-3.5 h-3.5" /></button>
                                                <button className={BTN_DANGER} onClick={() => handleDeleteUser(user.id)}><Trash2 className="w-3.5 h-3.5" /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </main>
                </div>
                {/* Bulk Assignment Modal */}
                {showBulkModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900">Bulk Assign Students</h2>
                                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">Mock exams and/or pastpaper tests + students</p>
                                </div>
                                <button onClick={closeBulkModal} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-5 h-5 text-slate-400" /></button>
                            </div>
                            
                            <div className="flex-1 overflow-hidden grid grid-cols-2">
                                <div className="border-r border-slate-100 flex flex-col">
                                    <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                                        <span className="text-xs font-extrabold text-slate-500 uppercase">Mock exams ({bulkAssignExams.length})</span>
                                        <button type="button" onClick={() => setBulkAssignExams(bulkAssignExams.length === mockExams.length ? [] : mockExams.map(m => m.id))} className="text-[10px] font-bold text-blue-600 hover:underline">
                                            {bulkAssignExams.length === mockExams.length ? 'Deselect All' : 'Select All'}
                                        </button>
                                    </div>
                                    <div className="p-3 border-b border-slate-100 bg-white">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                            <input 
                                                className={INPUT + ' pl-9 !py-1.5 !text-[11px]'} 
                                                placeholder="Search exams..." 
                                                value={bulkTestSearch}
                                                onChange={e => setBulkTestSearch(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                        {mockExams.filter(m => m.title.toLowerCase().includes(bulkTestSearch.toLowerCase())).map(mock => (
                                            <label key={mock.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-blue-50/50 cursor-pointer transition-colors border border-transparent hover:border-blue-100">
                                                <input 
                                                    type="checkbox" 
                                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" 
                                                    checked={bulkAssignExams.includes(mock.id)}
                                                    onChange={e => {
                                                        if (e.target.checked) setBulkAssignExams([...bulkAssignExams, mock.id]);
                                                        else setBulkAssignExams(bulkAssignExams.filter(id => id !== mock.id));
                                                    }}
                                                />
                                                <div>
                                                    <p className="text-sm font-bold text-slate-800">{mock.title}</p>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase">{mock.practice_date}</p>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                    <div className="p-3 bg-slate-100/90 border-y border-slate-200 flex justify-between items-center shrink-0">
                                        <span className="text-xs font-extrabold text-slate-500 uppercase">Pastpaper tests ({bulkAssignPracticeTests.length})</span>
                                        <button type="button" onClick={() => setBulkAssignPracticeTests(bulkAssignPracticeTests.length === standaloneTests.length ? [] : standaloneTests.map((t) => t.id))} className="text-[10px] font-bold text-blue-600 hover:underline">
                                            {bulkAssignPracticeTests.length === standaloneTests.length ? 'Deselect All' : 'Select All'}
                                        </button>
                                    </div>
                                    <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
                                        {standaloneTests.length === 0 && (
                                            <p className="text-[11px] text-slate-400 p-2">No pastpaper tests.</p>
                                        )}
                                        {standaloneTests.filter((t) => (t.title || '').toLowerCase().includes(bulkTestSearch.toLowerCase()) || `${t.subject}`.toLowerCase().includes(bulkTestSearch.toLowerCase())).map((t) => (
                                            <label key={t.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-emerald-50/50 cursor-pointer transition-colors border border-transparent hover:border-emerald-100">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                                    checked={bulkAssignPracticeTests.includes(t.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setBulkAssignPracticeTests([...bulkAssignPracticeTests, t.id]);
                                                        else setBulkAssignPracticeTests(bulkAssignPracticeTests.filter((id) => id !== t.id));
                                                    }}
                                                />
                                                <div>
                                                    <p className="text-sm font-bold text-slate-800">{t.title?.trim() || `${t.subject === 'MATH' ? 'Math' : 'Reading & Writing'}`}</p>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase">{t.form_type === 'US' ? 'US' : 'International'}{t.label ? ` · ${t.label}` : ''}</p>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                
                                <div className="flex flex-col bg-slate-50/30">
                                    <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                                        <span className="text-xs font-extrabold text-slate-500 uppercase">Step 2: Users ({bulkAssignUsers.length})</span>
                                        <button onClick={() => setBulkAssignUsers(bulkAssignUsers.length === users.filter(u => u.role === 'STUDENT').length ? [] : users.filter(u => u.role === 'STUDENT').map(u => u.id))} className="text-[10px] font-bold text-blue-600 hover:underline">
                                            {bulkAssignUsers.length === users.filter(u => u.role === 'STUDENT').length ? 'Deselect All' : 'Select All'}
                                        </button>
                                    </div>
                                    <div className="p-3 border-b border-slate-100 bg-white">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                            <input 
                                                className={INPUT + ' pl-9 !py-1.5 !text-[11px]'} 
                                                placeholder="Search students..." 
                                                value={bulkUserSearch}
                                                onChange={e => setBulkUserSearch(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                        {users.filter(u => u.role === 'STUDENT' && (u.first_name + ' ' + u.last_name + ' ' + u.username).toLowerCase().includes(bulkUserSearch.toLowerCase())).map(user => (
                                            <label key={user.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-indigo-50/50 cursor-pointer transition-colors border border-transparent hover:border-indigo-100">
                                                <input 
                                                    type="checkbox" 
                                                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" 
                                                    checked={bulkAssignUsers.includes(user.id)}
                                                    onChange={e => {
                                                        if (e.target.checked) setBulkAssignUsers([...bulkAssignUsers, user.id]);
                                                        else setBulkAssignUsers(bulkAssignUsers.filter(id => id !== user.id));
                                                    }}
                                                />
                                                <div>
                                                    <p className="text-sm font-bold text-slate-800">{user.first_name} {user.last_name}</p>
                                                    <p className="text-[10px] text-slate-400 font-medium">@{user.username}</p>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="p-8 bg-white border-t border-slate-100 flex flex-col gap-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Mock sections: assignment type</span>
                                        <div className="flex bg-slate-100 p-1 rounded-2xl">
                                            {[
                                                { id: 'FULL', label: 'Full Exam' },
                                                { id: 'MATH', label: 'Math Only' },
                                                { id: 'ENGLISH', label: 'English Only' }
                                            ].map(t => (
                                                <button 
                                                    key={t.id}
                                                    onClick={() => setBulkAssignType(t.id)}
                                                    className={`flex-1 py-3 px-4 rounded-xl text-xs font-black transition-all ${bulkAssignType === t.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                                >
                                                    {t.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Mock sections: form filter</span>
                                        <div className="flex bg-slate-100 p-1 rounded-2xl">
                                            {[
                                                { id: '', label: 'All Forms' },
                                                { id: 'INTERNATIONAL', label: 'Intl' },
                                                { id: 'US', label: 'US' }
                                            ].map(t => (
                                                <button 
                                                    key={t.id}
                                                    onClick={() => setBulkAssignFormType(t.id)}
                                                    className={`flex-1 py-3 px-4 rounded-xl text-xs font-black transition-all ${bulkAssignFormType === t.id ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                                >
                                                    {t.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                                    <div className="text-xs text-slate-500 font-medium">
                                        Granting <span className="font-bold text-slate-900">{bulkAssignUsers.length}</span> students access to <span className="font-bold text-slate-900">{bulkAssignExams.length}</span> mock(s) and <span className="font-bold text-slate-900">{bulkAssignPracticeTests.length}</span> pastpaper test(s). Mock options: <span className="font-bold text-blue-600">{bulkAssignType}</span>{bulkAssignFormType ? <span className="text-indigo-600"> ({bulkAssignFormType})</span> : null}.
                                    </div>
                                    <div className="flex gap-3">
                                        <button onClick={closeBulkModal} className={BTN_GHOST}>Cancel</button>
                                        <button 
                                            onClick={handleBulkAssign} 
                                            disabled={saving || (!bulkAssignExams.length && !bulkAssignPracticeTests.length) || !bulkAssignUsers.length}
                                            className={`${BTN_PRIMARY} !px-8 !py-3 !text-sm h-12 shadow-xl shadow-blue-200/50 disabled:opacity-50 disabled:shadow-none`}
                                        >
                                            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                                            {saving ? 'Processing...' : 'Confirm Bulk Assignment'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                )}
            </div>
        </AuthGuard>
    );
}
