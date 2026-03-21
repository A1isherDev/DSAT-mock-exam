"use client";
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { adminApi, examsApi } from '@/lib/api';
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

type Tab = 'users' | 'tests' | 'modules' | 'questions' | 'assignments';

// ─── Inline Form Row ──────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{label}</label>
            {children}
        </div>
    );
}

const INPUT = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all";
const BTN_PRIMARY = "flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg shadow transition-all";
const BTN_GHOST = "flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 px-3 py-2 rounded-lg hover:bg-slate-100 transition-all";
const BTN_DANGER = "flex items-center gap-1 text-[11px] font-bold text-red-500 hover:text-red-700 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-all";

export default function AdminPage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<Tab>('tests');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState('');

    // Data
    const [users, setUsers] = useState<any[]>([]);
    const [mockExams, setMockExams] = useState<any[]>([]);
    const [practiceTests, setPracticeTests] = useState<any[]>([]);
    const [modules, setModules] = useState<any[]>([]);
    const [questions, setQuestions] = useState<any[]>([]);

    // Selection
    const [selectedMockId, setSelectedMockId] = useState<number | null>(null);
    const [selectedPracticeTestId, setSelectedPracticeTestId] = useState<number | null>(null);
    const [selectedModuleId, setSelectedModuleId] = useState<number | null>(null);

    // Forms
    const [userForm, setUserForm] = useState({ first_name: '', last_name: '', username: '', email: '', password: '', is_admin: false, role: 'STUDENT' });
    const [mockForm, setMockForm] = useState({ title: '', practice_date: '', is_active: true });
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

    const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

    // Fetch
    const fetchUsers = useCallback(async () => { try { setUsers(await adminApi.getUsers()); } catch(e){} }, []);
    
    const fetchMockExams = useCallback(async () => {
        try {
            const data = await adminApi.getMockExams();
            setMockExams(data);
            if (data.length > 0 && !selectedMockId) setSelectedMockId(data[0].id);
            const init: Record<number, number[]> = {};
            data.forEach((m: any) => { init[m.id] = m.assigned_users || []; });
            setAssignments(init);
        } catch(e) {}
    }, [selectedMockId]);

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

    useEffect(() => { fetchMockExams(); fetchUsers(); }, []);
    
    useEffect(() => {
        if (selectedMockId) {
            const mock = mockExams.find(m => m.id === selectedMockId);
            if (mock && mock.tests) {
                setPracticeTests(mock.tests);
                if (mock.tests.length > 0) {
                    setSelectedPracticeTestId(mock.tests[0].id);
                } else {
                    setSelectedPracticeTestId(null);
                    setModules([]);
                    setSelectedModuleId(null);
                }
            }
        }
    }, [selectedMockId, mockExams]);

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
            if (editingUser?.id) { await adminApi.updateUser(editingUser.id, userForm); }
            else { await adminApi.createUser(userForm); }
            await fetchUsers();
            setEditingUser(null);
            setUserForm({ first_name: '', last_name: '', username: '', email: '', password: '', is_admin: false, role: 'STUDENT' });
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
            setMockForm({ title: '', practice_date: '', is_active: true });
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
            const currentTest = practiceTests.find(t => t.id === selectedPracticeTestId);
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
            if (optionAImage) formData.append('option_a_image', optionAImage);
            if (optionBImage) formData.append('option_b_image', optionBImage);
            if (optionCImage) formData.append('option_c_image', optionCImage);
            if (optionDImage) formData.append('option_d_image', optionDImage);

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
            showToast('Question saved ✓');
        } catch (e: any) { alert('Error: ' + (e?.response?.status === 404 ? '404 - Endpoint not found or IDs mismatch' : (e?.message || 'Invalid'))); }
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
        setBulkAssignUsers([]);
        setBulkAssignType('FULL');
        setBulkAssignFormType('');
        setBulkTestSearch('');
        setBulkUserSearch('');
    };

    const handleBulkAssign = async () => {
        if (bulkAssignExams.length === 0 || bulkAssignUsers.length === 0) {
            showToast("Select at least one exam and one user");
            return;
        }
        setSaving(true);
        try {
            await adminApi.bulkAssignStudents(bulkAssignExams, bulkAssignUsers, bulkAssignType, bulkAssignFormType || undefined);
            showToast(`Successfully assigned ${bulkAssignExams.length} exams (Type: ${bulkAssignType}${bulkAssignFormType ? `, Form: ${bulkAssignFormType}` : ''}) to ${bulkAssignUsers.length} users!`);
            setSelectedMockId(bulkAssignExams[0]);
            closeBulkModal();
            fetchMockExams();
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
    const currentTest = practiceTests.find(t => t.id === selectedPracticeTestId);
    const moduleScoreSum = questions.reduce((sum, q) => sum + (q.score || 0), 0);
    const budget = (currentTest && currentModule) ? getModuleBudget(currentTest.subject, currentModule.module_order) : 0;
    const base = (currentTest && currentModule) ? getModuleBase(currentTest.subject, currentModule.module_order) : 0;
    
    const maxQuestions = currentTest?.subject === 'MATH' ? 22 : 27;
    const isAtLimit = questions.length >= maxQuestions;
    const predictedSum = editingQuestion !== null ? (moduleScoreSum - (editingQuestion.id ? (questions.find(q => q.id === editingQuestion.id)?.score || 0) : 0) + (questionForm.score || 0)) : moduleScoreSum;
    const isOverBudget = predictedSum > budget;

    const navItems: { key: Tab; label: string; icon: React.ReactNode }[] = [
        { key: 'tests', label: 'Mock Exams', icon: <BookOpen className="w-4 h-4" /> },
        { key: 'questions', label: 'Questions', icon: <HelpCircle className="w-4 h-4" /> },
        { key: 'assignments', label: 'Assignments', icon: <CheckSquare className="w-4 h-4" /> },
        { key: 'users', label: 'Users', icon: <Users className="w-4 h-4" /> },
    ];

    return (
        <AuthGuard adminOnly={true}>
            <div className="min-h-screen bg-[#f8f9fb] flex flex-col">
                {toast && (
                    <div className="fixed top-4 right-4 z-[999] bg-emerald-600 text-white text-sm font-bold px-5 py-3 rounded-xl shadow-xl animate-in slide-in-from-right-4">
                        {toast}
                    </div>
                )}

                <header className="bg-slate-900 px-8 py-4 flex items-center justify-between sticky top-0 z-50">
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
                    <aside className="w-52 bg-white border-r border-slate-200 flex flex-col py-4 gap-1 px-2 shrink-0">
                        {navItems.map(item => (
                            <button
                                key={item.key}
                                onClick={() => setActiveTab(item.key)}
                                className={`w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === item.key ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                                {item.icon} {item.label}
                            </button>
                        ))}
                    </aside>

                    <main className="flex-1 p-8 overflow-y-auto">
                        {activeTab === 'tests' && (
                            <div className="space-y-6 max-w-4xl">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-xl font-bold text-slate-900">Manage Mock Exams</h2>
                                    <div className="flex gap-2">
                                        <button className={BTN_GHOST} onClick={() => setShowBulkModal(true)}>
                                            <Users className="w-4 h-4" /> Bulk Assign Users
                                        </button>
                                        <button className={BTN_PRIMARY} onClick={() => { setEditingMock({}); setMockForm({ title: '', practice_date: '', is_active: true }); }}>
                                            <Plus className="w-4 h-4" /> New Mock Exam
                                        </button>
                                    </div>
                                </div>
                                {editingMock !== null && (
                                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm grid grid-cols-2 gap-4">
                                        <Field label="Title"><input className={INPUT} value={mockForm.title} onChange={e => setMockForm({ ...mockForm, title: e.target.value })} placeholder="e.g. Mock SAT #1" /></Field>
                                        <Field label="Practice Date"><input type="date" className={INPUT} value={mockForm.practice_date} onChange={e => setMockForm({ ...mockForm, practice_date: e.target.value })} /></Field>
                                        <div className="flex items-center gap-2 mt-4"><input type="checkbox" id="act" checked={mockForm.is_active} onChange={e => setMockForm({ ...mockForm, is_active: e.target.checked })} /><label htmlFor="act" className="text-sm font-bold text-slate-600">Is Active</label></div>
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
                                                    <p className="text-[11px] text-slate-400 uppercase tracking-wider font-bold">{mock.practice_date || 'No date'} · {mock.tests?.length || 0} Sections</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button className={BTN_GHOST + " bg-white shadow-sm border border-slate-100"} onClick={e => { e.stopPropagation(); setEditingMock(mock); setMockForm({ title: mock.title, practice_date: mock.practice_date || '', is_active: !!mock.is_active }); }}><Pencil className="w-3.5 h-3.5" /> Edit</button>
                                                    <button className={BTN_DANGER + " bg-white shadow-sm border border-slate-100"} onClick={e => { e.stopPropagation(); handleDeleteMock(mock.id); }}><Trash2 className="w-3.5 h-3.5" /> Delete</button>
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
                                                        <button onClick={(e) => { e.stopPropagation(); handleRemoveTest(t.id, mock.id); }} className="text-slate-300 hover:text-red-500 transition-colors"><X className="w-3.5 h-3.5" /></button>
                                                    </div>
                                                ))}
                                                
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
                                                        <button onClick={(e) => { e.stopPropagation(); handleAddTest('READING_WRITING', mock.id); }} className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-blue-100 bg-blue-50/50 text-blue-600 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-blue-100 transition-all"><Plus className="w-3 h-3" /> English</button>
                                                        <button onClick={(e) => { e.stopPropagation(); handleAddTest('MATH', mock.id); }} className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-emerald-100 bg-emerald-50/50 text-emerald-600 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-100 transition-all"><Plus className="w-3 h-3" /> Mathematics</button>
                                                    </div>
                                                </div>
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
                                        <select className={INPUT + ' !w-auto'} value={selectedMockId || ''} onChange={e => { setSelectedMockId(Number(e.target.value)); setSelectedPracticeTestId(null); setSelectedModuleId(null); }}>
                                            <option value="">Select Mock Exam</option>
                                            {mockExams.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                                        </select>
                                        <select className={INPUT + ' !w-auto'} value={selectedPracticeTestId || ''} onChange={e => { setSelectedPracticeTestId(Number(e.target.value)); setSelectedModuleId(null); }}>
                                            <option value="">Select Test</option>
                                            {practiceTests.map(t => (
                                                <option key={t.id} value={t.id}>
                                                    {t.subject === 'MATH' ? 'Math' : 'English'} 
                                                    {t.label ? ` [${t.label}]` : ''} 
                                                    ({t.form_type === 'US' ? 'US' : 'Intl'})
                                                </option>
                                            ))}
                                        </select>
                                        <select className={INPUT + ' !w-auto'} value={selectedModuleId || ''} onChange={e => setSelectedModuleId(Number(e.target.value))}>
                                            <option value="">Select Module</option>
                                            {modules.map(m => <option key={m.id} value={m.id}>{`Module ${m.module_order}`}</option>)}
                                        </select>
                                        <button className={BTN_PRIMARY} disabled={!selectedModuleId || (isAtLimit && !editingQuestion?.id)} onClick={() => { 
                                            const currentTest = practiceTests.find(t => t.id === selectedPracticeTestId);
                                            setEditingQuestion({}); 
                                            setQuestionForm({ 
                                                question_text: '', question_prompt: '', 
                                                option_a: '', option_b: '', option_c: '', option_d: '',
                                                correct_answer: 'A', score: 10, question_type: (currentTest?.subject === 'MATH' ? 'MATH' : 'READING'), is_math_input: (currentTest?.subject === 'MATH') 
                                            }); 
                                        }}>
                                            <Plus className="w-4 h-4" /> Add Question
                                        </button>
                                        <button 
                                            className={`${BTN_PRIMARY} !bg-indigo-600 hover:!bg-indigo-700 disabled:!bg-slate-300 disabled:!text-slate-500`} 
                                            disabled={!selectedModuleId || !isAtLimit || moduleScoreSum !== budget} 
                                            onClick={() => {
                                                setToast('✅ Module constraints verified and saved successfully!');
                                                setTimeout(() => setToast(''), 3000);
                                            }}
                                        >
                                            <Save className="w-4 h-4" /> Save Module
                                        </button>
                                    </div>
                                </div>

                                {editingQuestion !== null && (
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
                                                <div className="space-y-2">
                                                    <RichTextEditor label="Option A" value={questionForm.option_a} onChange={val => setQuestionForm({...questionForm, option_a: val})} />
                                                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
                                                        <ImageIcon className="w-3 h-3" /> {optionAImage ? optionAImage.name : editingQuestion?.option_a_image ? 'Has existing image' : 'No image'}
                                                        <label className="ml-2 px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded cursor-pointer transition-colors border border-slate-200">
                                                            {optionAImage || editingQuestion?.option_a_image ? 'Change' : 'Upload Image'}
                                                            <input type="file" className="hidden" accept="image/*" onChange={e => setOptionAImage(e.target.files?.[0] || null)} />
                                                        </label>
                                                        {(optionAImage || editingQuestion?.option_a_image) && <button onClick={() => setOptionAImage(null)} className="text-red-500 hover:underline ml-2">Clear</button>}
                                                    </div>
                                                </div>
                                                
                                                <div className="space-y-2">
                                                    <RichTextEditor label="Option B" value={questionForm.option_b} onChange={val => setQuestionForm({...questionForm, option_b: val})} />
                                                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
                                                        <ImageIcon className="w-3 h-3" /> {optionBImage ? optionBImage.name : editingQuestion?.option_b_image ? 'Has existing image' : 'No image'}
                                                        <label className="ml-2 px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded cursor-pointer transition-colors border border-slate-200">
                                                            {optionBImage || editingQuestion?.option_b_image ? 'Change' : 'Upload Image'}
                                                            <input type="file" className="hidden" accept="image/*" onChange={e => setOptionBImage(e.target.files?.[0] || null)} />
                                                        </label>
                                                        {(optionBImage || editingQuestion?.option_b_image) && <button onClick={() => setOptionBImage(null)} className="text-red-500 hover:underline ml-2">Clear</button>}
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <RichTextEditor label="Option C" value={questionForm.option_c} onChange={val => setQuestionForm({...questionForm, option_c: val})} />
                                                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
                                                        <ImageIcon className="w-3 h-3" /> {optionCImage ? optionCImage.name : editingQuestion?.option_c_image ? 'Has existing image' : 'No image'}
                                                        <label className="ml-2 px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded cursor-pointer transition-colors border border-slate-200">
                                                            {optionCImage || editingQuestion?.option_c_image ? 'Change' : 'Upload Image'}
                                                            <input type="file" className="hidden" accept="image/*" onChange={e => setOptionCImage(e.target.files?.[0] || null)} />
                                                        </label>
                                                        {(optionCImage || editingQuestion?.option_c_image) && <button onClick={() => setOptionCImage(null)} className="text-red-500 hover:underline ml-2">Clear</button>}
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <RichTextEditor label="Option D" value={questionForm.option_d} onChange={val => setQuestionForm({...questionForm, option_d: val})} />
                                                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
                                                        <ImageIcon className="w-3 h-3" /> {optionDImage ? optionDImage.name : editingQuestion?.option_d_image ? 'Has existing image' : 'No image'}
                                                        <label className="ml-2 px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded cursor-pointer transition-colors border border-slate-200">
                                                            {optionDImage || editingQuestion?.option_d_image ? 'Change' : 'Upload Image'}
                                                            <input type="file" className="hidden" accept="image/*" onChange={e => setOptionDImage(e.target.files?.[0] || null)} />
                                                        </label>
                                                        {(optionDImage || editingQuestion?.option_d_image) && <button onClick={() => setOptionDImage(null)} className="text-red-500 hover:underline ml-2">Clear</button>}
                                                    </div>
                                                </div>
                                            </div>
                                            <Field label="Question Image">
                                                <div className="flex items-center gap-3">
                                                    <label className="flex-1 border-2 border-dashed border-slate-200 rounded-lg p-2 flex items-center justify-center gap-2 cursor-pointer hover:bg-slate-50 transition-colors">
                                                        <Upload className="w-4 h-4 text-slate-400" />
                                                        <span className="text-xs text-slate-500 font-bold">{questionImage ? questionImage.name : 'Choose File'}</span>
                                                        <input type="file" className="hidden" accept="image/*" onChange={e => setQuestionImage(e.target.files?.[0] || null)} />
                                                    </label>
                                                    {questionImage && <button onClick={() => setQuestionImage(null)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg"><X className="w-4 h-4" /></button>}
                                                </div>
                                            </Field>
                                            {practiceTests.find(t => t.id === selectedPracticeTestId)?.subject === 'READING_WRITING' && (
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

                                            {practiceTests.find(t => t.id === selectedPracticeTestId)?.subject === 'MATH' && (
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
                                                    <div className="flex flex-col gap-0.5 mr-2">
                                                        <button disabled={idx === 0} onClick={() => handleReorderQuestion(q.id, 'up')} className={`p-1 rounded hover:bg-slate-200 text-slate-400 ${idx === 0 ? 'opacity-20 cursor-not-allowed' : 'hover:text-indigo-600'}`}><ArrowUp className="w-3 h-3" /></button>
                                                        <button disabled={idx === questions.length - 1} onClick={() => handleReorderQuestion(q.id, 'down')} className={`p-1 rounded hover:bg-slate-200 text-slate-400 ${idx === questions.length - 1 ? 'opacity-20 cursor-not-allowed' : 'hover:text-indigo-600'}`}><ArrowDown className="w-3 h-3" /></button>
                                                    </div>
                                                    <button className={BTN_GHOST} onClick={() => {
                                                        setEditingQuestion(q);
                                                        setQuestionForm({
                                                            question_text: q.question_text || '', question_prompt: q.question_prompt || '',
                                                            option_a: q.option_a || '', option_b: q.option_b || '', option_c: q.option_c || '', option_d: q.option_d || '',
                                                            correct_answer: q.correct_answer, score: q.score || 10,
                                                            question_type: q.question_type || 'MATH', is_math_input: q.is_math_input || false
                                                        });
                                                    }}><Pencil className="w-3.5 h-3.5" /></button>
                                                    <button className={BTN_DANGER} onClick={() => handleDeleteQuestion(q.id)}><Trash2 className="w-3.5 h-3.5" /></button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'assignments' && (
                            <div className="space-y-6 max-w-3xl">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-xl font-bold text-slate-900">Assign Users to Mock Exam</h2>
                                    <button className={BTN_PRIMARY} onClick={() => selectedMockId && handleSaveAssignment(selectedMockId)} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save</button>
                                </div>
                                <div className="flex gap-3 flex-wrap">
                                    {mockExams.map(m => (
                                        <button key={m.id} onClick={() => setSelectedMockId(m.id)} className={`text-xs font-bold px-4 py-2 rounded-lg border transition-all ${selectedMockId === m.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>{m.title}</button>
                                    ))}
                                </div>
                                <div className="relative"><Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><input className={INPUT + ' pl-9'} placeholder="Search users..." value={userSearch} onChange={e => setUserSearch(e.target.value)} /></div>
                                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                                    {users.filter(u => (u.email + u.first_name + u.last_name + u.username).toLowerCase().includes(userSearch.toLowerCase())).map(user => {
                                        const isAssigned = (assignments[selectedMockId!] || []).includes(user.id);
                                        return (
                                            <div key={user.id} className="p-4 border-b last:border-0 flex items-center justify-between hover:bg-slate-50 cursor-pointer" onClick={() => {
                                                const current = assignments[selectedMockId!] || [];
                                                const updated = isAssigned ? current.filter(id => id !== user.id) : [...current, user.id];
                                                setAssignments({ ...assignments, [selectedMockId!]: updated });
                                            }}>
                                                <div className="flex items-center gap-3">
                                                    {isAssigned ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4 text-slate-300" />}
                                                    <div><p className="font-bold text-sm text-slate-900">{user.first_name} {user.last_name}</p><p className="text-[11px] text-slate-400">{user.email} · @{user.username}</p></div>
                                                </div>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${user.role === 'ADMIN' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>{user.role}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {activeTab === 'users' && (
                            <div className="space-y-6 max-w-4xl">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-xl font-bold text-slate-900">User Management</h2>
                                    <button className={BTN_PRIMARY} onClick={() => { setEditingUser({}); setUserForm({ first_name: '', last_name: '', username: '', email: '', password: '', is_admin: false, role: 'STUDENT' }); }}>
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
                                            <select 
                                                className={INPUT} 
                                                value={userForm.role} 
                                                onChange={e => {
                                                    const newRole = e.target.value;
                                                    setUserForm({ ...userForm, role: newRole, is_admin: newRole === 'ADMIN' });
                                                }}
                                            >
                                                <option value="STUDENT">Student (Standard User)</option>
                                                <option value="ADMIN">Administrator</option>
                                            </select>
                                        </Field>
                                        <div className="flex items-center gap-2 mt-4">
                                            <input 
                                                type="checkbox" 
                                                id="adm" 
                                                checked={!!userForm.is_admin} 
                                                onChange={e => {
                                                    const checked = e.target.checked;
                                                    setUserForm({ ...userForm, is_admin: checked, role: checked ? 'ADMIN' : 'STUDENT' });
                                                }} 
                                            />
                                            <label htmlFor="adm" className="text-sm font-bold text-slate-600">Admin Privileges (Mirror Role)</label>
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
                                                <div><p className="font-bold text-sm text-slate-900">{user.first_name} {user.last_name} {user.is_admin && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded ml-1">ADMIN</span>}</p><p className="text-[11px] text-slate-400">{user.email} · @{user.username}</p></div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button className={BTN_GHOST} onClick={() => { setEditingUser(user); setUserForm({ first_name: user.first_name, last_name: user.last_name, username: user.username, email: user.email, password: '', is_admin: !!user.is_admin, role: user.role || 'STUDENT' }); }}><Pencil className="w-3.5 h-3.5" /></button>
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
                                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">Select multiple exams and students</p>
                                </div>
                                <button onClick={closeBulkModal} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-5 h-5 text-slate-400" /></button>
                            </div>
                            
                            <div className="flex-1 overflow-hidden grid grid-cols-2">
                                <div className="border-r border-slate-100 flex flex-col">
                                    <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                                        <span className="text-xs font-extrabold text-slate-500 uppercase">Step 1: Select Exams ({bulkAssignExams.length})</span>
                                        <button onClick={() => setBulkAssignExams(bulkAssignExams.length === mockExams.length ? [] : mockExams.map(m => m.id))} className="text-[10px] font-bold text-blue-600 hover:underline">
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
                                </div>
                                
                                <div className="flex flex-col bg-slate-50/30">
                                    <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                                        <span className="text-xs font-extrabold text-slate-500 uppercase">Step 2: Select Users ({bulkAssignUsers.length})</span>
                                        <button onClick={() => setBulkAssignUsers(bulkAssignUsers.length === users.filter(u => u.role !== 'ADMIN').length ? [] : users.filter(u => u.role !== 'ADMIN').map(u => u.id))} className="text-[10px] font-bold text-blue-600 hover:underline">
                                            {bulkAssignUsers.length === users.filter(u => u.role !== 'ADMIN').length ? 'Deselect All' : 'Select All'}
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
                                        {users.filter(u => u.role !== 'ADMIN' && (u.first_name + ' ' + u.last_name + ' ' + u.username).toLowerCase().includes(bulkUserSearch.toLowerCase())).map(user => (
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
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Step 3: Assignment Type</span>
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
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Step 4: Form Type</span>
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
                                        Granting <span className="font-bold text-slate-900">{bulkAssignUsers.length}</span> students <span className="font-bold text-blue-600">{bulkAssignType}</span> {bulkAssignFormType && <span className="text-indigo-600">({bulkAssignFormType})</span>} access to <span className="font-bold text-slate-900">{bulkAssignExams.length}</span> exams.
                                    </div>
                                    <div className="flex gap-3">
                                        <button onClick={closeBulkModal} className={BTN_GHOST}>Cancel</button>
                                        <button 
                                            onClick={handleBulkAssign} 
                                            disabled={saving || !bulkAssignExams.length || !bulkAssignUsers.length}
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
