"use client";
import React, { useState, useEffect, memo, useCallback, Suspense } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { examsApi } from '@/lib/api';
import AuthGuard from '@/components/AuthGuard';
import { Bookmark, ChevronDown, Highlighter, ZoomIn, Calculator, ChevronUp, X, Eye, EyeOff, MinusCircle, Info, Eye as EyeIcon, Play, Pause, ChevronLeft, ChevronRight, AlertCircle, BookOpen, Trash2, MoreVertical, Save } from 'lucide-react';
// Fix for image URL if it's relative
const getImageUrl = (path: string | null | undefined) => {
    if (!path) return undefined;
    if (path.startsWith('http')) return path;
    const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';
    return `${baseUrl}${path}`;
};

const formatFraction = (ans: string | undefined | null) => {
    if (!ans) return 'Omit';
    if (ans.includes('/')) {
        const parts = ans.split('/');
        if (parts.length === 2) {
            return `$$ \\frac{${parts[0]}}{${parts[1]}} $$`;
        }
    }
    return ans;
};

const SprFraction = ({ text }: { text: string }) => {
    if (!text) return null;
    if (text.includes('/')) {
        const [num, den] = text.split('/');
        return (
            <div className="inline-flex flex-col items-center justify-center leading-none align-middle font-black mx-1 transition-all">
                <span className="border-b-[2.5px] border-slate-900 px-[2px] pb-[1px]">{num}</span>
                <span className="px-[2px] pt-[1px]">{den}</span>
            </div>
        );
    }
    return <span>{text}</span>;
};

const QuestionPane = memo(({ currentQuestion, zoomLevel, highlighterActive, passageHtml, handleShowPopover }: any) => {
    // Fix for image URL if it's relative
    return (
        <div
            className="w-1/2 p-10 overflow-y-auto border-r border-slate-200"
            style={{ fontSize: `${16 * zoomLevel}px` }}
            onMouseUp={(e) => highlighterActive && handleShowPopover('passage', e)}
        >
            <div
                id="passage-content"
                className={`prose prose-slate max-w-none leading-relaxed font-sans text-slate-800 ${highlighterActive ? 'cursor-text' : ''}`}
            >
                {currentQuestion.question_image && (
                    <div className="mb-6 rounded-lg overflow-hidden border border-slate-100 bg-slate-50 flex justify-center p-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={getImageUrl(currentQuestion.question_image)} alt="Question figure" className="max-w-full h-auto max-h-[400px] object-contain" />
                    </div>
                )}
                <div
                    id="passage-text-container"
                    className="leading-relaxed font-[Georgia] font-medium mathjax-process"
                    style={{ fontSize: `${16 * zoomLevel * 1.2}px` }}
                    dangerouslySetInnerHTML={{ __html: passageHtml || currentQuestion.question_text?.replace(/\n/g, '<br/>') || 'Question text goes here...' }}
                />
            </div>
        </div>
    );
});

QuestionPane.displayName = 'QuestionPane';

const RightPane = memo(({
    currentQuestion,
    currentQuestionIndex,
    attempt,
    zoomLevel,
    highlighterActive,
    handleShowPopover,
    questionHighlights,
    questionPromptHighlights,
    optionHighlights,
    answers,
    setAnswers,
    eliminatedOptions,
    setEliminatedOptions,
    isEliminationMode,
    setIsEliminationMode,
    flagged,
    setFlagged,
    showCalculator,
}: any) => {

    const toggleFlag = useCallback(() => {
        const qId = currentQuestion.id;
        setFlagged((prev: number[]) => prev.includes(qId) ? prev.filter(id => id !== qId) : [...prev, qId]);
    }, [currentQuestion.id, setFlagged]);

    const handleOptionSelect = useCallback((optionKey: string) => {
        setAnswers((prev: any) => ({ ...prev, [currentQuestion.id]: optionKey }));
    }, [currentQuestion.id, setAnswers]);

    const toggleElimination = useCallback((optionKey: string) => {
        const qId = currentQuestion.id;

        // Deselect if currently selected as answer
        setAnswers((prev: any) => {
            if (prev[qId] === optionKey) {
                const next = { ...prev };
                delete next[qId];
                return next;
            }
            return prev;
        });

        setEliminatedOptions((prev: any) => {
            const current = prev[qId] || [];
            if (current.includes(optionKey)) {
                return { ...prev, [qId]: current.filter((o: string) => o !== optionKey) };
            } else {
                return { ...prev, [qId]: [...current, optionKey] };
            }
        });
    }, [currentQuestion.id, setEliminatedOptions, setAnswers]);

    return (
        <div
            className={`overflow-y-auto bg-white pb-8 ${((attempt.practice_test_details.subject === 'READING_WRITING' && !showCalculator) || currentQuestion.is_math_input) ? 'w-1/2' : 'w-full'} flex justify-center transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${(showCalculator && !currentQuestion.is_math_input) ? 'translate-x-[12vw] translate-y-0' : 'translate-x-0 translate-y-0'} ${
                attempt.practice_test_details.subject === 'READING_WRITING' || currentQuestion.is_math_input
                    ? 'p-10' : ''
            }`}
            style={{ fontSize: `${15 * zoomLevel}px` }}
        >
            <div className={
                attempt.practice_test_details.subject === 'READING_WRITING' 
                    ? 'w-full px-10' // English equalized 50/50 proportion
                    : (attempt.practice_test_details.subject !== 'READING_WRITING' && !currentQuestion.is_math_input && !showCalculator 
                        ? 'w-full max-w-2xl px-10 py-10' // Plain Math
                        : 'w-full max-w-3xl') // Math SPR or Math with Calculator
            }>
                {/* Question header bar: number + Mark for Review */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-6">
                        <div className="bg-slate-900 text-white px-3 py-1.5 rounded-md flex items-center justify-center">
                            <span className="text-sm font-bold tracking-tight">{currentQuestionIndex + 1}</span>
                        </div>
                        <button
                            onClick={toggleFlag}
                            className={`flex items-center text-xs font-bold transition-colors ${flagged.includes(currentQuestion.id) ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
                        >
                            <div className="w-5 h-5 mr-1.5 border border-slate-400 rounded-sm flex items-center justify-center">
                                <Bookmark className={`w-3.5 h-3.5 ${flagged.includes(currentQuestion.id) ? 'text-slate-900 fill-slate-900' : 'text-slate-400'}`} />
                            </div>
                            Mark for Review
                        </button>
                    </div>

                    <button
                        onClick={() => setIsEliminationMode(!isEliminationMode)}
                        className={`flex items-center justify-center gap-1 p-1 px-1.5 border-2 rounded-md transition-all ${isEliminationMode ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-600 hover:border-slate-400'}`}
                        title="Eliminate Answer"
                    >
                        <div className="relative">
                            <span className="text-[10px] font-black italic tracking-tighter">ABC</span>
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[1.5px] bg-current rotate-[15deg]" />
                        </div>
                    </button>
                </div>
                <div className="w-full h-[3px] mb-8 opacity-100" style={{ background: 'repeating-linear-gradient(to right, #b91c1c 0, #b91c1c 48px, transparent 48px, transparent 54px, #ca8a04 54px, #ca8a04 102px, transparent 102px, transparent 108px, #15803d 108px, #15803d 156px, transparent 156px, transparent 162px, #0f172a 162px, #0f172a 210px, transparent 210px, transparent 216px)' }} />

                {/* Image above question text */}
                {currentQuestion.question_image && attempt.practice_test_details.subject !== 'READING_WRITING' && (
                    <div className="mb-6 flex justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={getImageUrl(currentQuestion.question_image)}
                            alt="Question figure"
                            className="max-w-full h-auto max-h-[320px] object-contain border border-slate-100 rounded-lg bg-slate-50 p-2"
                        />
                    </div>
                )}

                {/* Prompt (Question Context) - Hidden for Math as requested */}
                {currentQuestion.question_prompt && !currentQuestion.is_math_input && (
                    <div
                        id="question-prompt-content"
                        className={`mb-8 font-[Georgia] font-medium text-slate-900 leading-relaxed mathjax-process ${highlighterActive ? 'cursor-text' : ''}`}
                        style={{ fontSize: `${16 * zoomLevel * 1.2}px` }}
                        onMouseUp={(e) => highlighterActive && handleShowPopover('question-prompt', e)}
                        dangerouslySetInnerHTML={{ __html: questionPromptHighlights[currentQuestion.id] || currentQuestion.question_prompt.replace(/\n/g, '<br/>') }}
                    />
                )}

                {attempt.practice_test_details.subject !== 'READING_WRITING' && (
                    <div
                        id="question-content"
                        className={`mb-8 font-[Georgia] font-medium text-slate-900 leading-relaxed mathjax-process ${highlighterActive ? 'cursor-text' : ''}`}
                        style={{ fontSize: `${16 * zoomLevel * 1.2}px` }}
                        onMouseUp={(e) => highlighterActive && handleShowPopover('question', e)}
                        dangerouslySetInnerHTML={{ __html: questionHighlights[currentQuestion.id] || currentQuestion.question_text?.replace(/\n/g, '<br/>') || 'Question text goes here...' }}
                    />
                )}

                {/* SPR input */}
                {currentQuestion.is_math_input ? (
                    <div className="mt-6">
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Your Answer</p>
                        <input
                            type="text"
                            placeholder="Enter your answer"
                            maxLength={5}
                            className="w-full max-w-xs text-xl font-[Georgia] font-bold p-3 px-4 border-2 border-slate-300 rounded-lg hover:border-slate-400 focus:border-blue-600 focus:outline outline-2 outline-blue-600 outline-offset-1 transition-all shadow-sm text-center tracking-widest"
                            value={answers[currentQuestion.id] || ''}
                            onChange={(e) => {
                                const val = e.target.value.slice(0, 5);
                                if (/^[-0-9./]*$/.test(val)) {
                                    handleOptionSelect(val);
                                }
                            }}
                        />
                        <div className="mt-3 flex items-center justify-start gap-2 max-w-xs">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Recorded Answer:</span>
                            <span className="text-sm font-[Georgia] font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 min-w-[30px] min-h-[30px] flex items-center justify-center text-center">
                                <SprFraction text={answers[currentQuestion.id] || ''} />
                            </span>
                        </div>
                    </div>
                ) : (
                    /* Multiple choice options */
                    <div className="space-y-4 w-full">
                        {(currentQuestion.options ? Object.entries(currentQuestion.options) : [['A', ''], ['B', ''], ['C', ''], ['D', '']]).map(([key, val]) => {
                            const isSelected = answers[currentQuestion.id] === key;
                            const isEliminated = (eliminatedOptions[currentQuestion.id] || []).includes(key);
                            return (
                                <div key={key} className="relative group flex items-center gap-3">
                                    <button
                                        onClick={() => !isEliminated && handleOptionSelect(key)}
                                        className={`flex-1 flex p-3 px-4 rounded-xl border-2 transition-all min-h-[50px] items-center ${
                                            isSelected
                                                ? 'border-blue-600 outline outline-2 outline-blue-600 outline-offset-1 bg-blue-50/20'
                                                : isEliminated
                                                    ? 'border-slate-100 opacity-50 cursor-not-allowed grayscale'
                                                    : 'border-slate-300 hover:border-slate-400 bg-white'
                                        }`}
                                    >
                                        <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center font-[Georgia] font-bold text-sm shrink-0 ${
                                            isSelected ? 'border-blue-600 bg-blue-600 text-white' : isEliminated ? 'border-slate-300 text-slate-400' : 'border-slate-400 text-slate-800'
                                        }`}>
                                            {key}
                                        </div>
                                        <div className={`ml-4 text-left font-[Georgia] text-[15px] text-slate-800 w-full ${isEliminated ? 'line-through decoration-slate-400' : ''}`}>
                                            <div
                                                key={`option-inner-${key}-${isEliminated}`}
                                                id={`option-content-${key}`}
                                                className={`w-full mathjax-process ${highlighterActive ? 'cursor-text' : ''}`}
                                                onMouseUp={(e) => highlighterActive && handleShowPopover(`option-${key}`, e)}
                                            >
                                                {typeof val === 'object' && val !== null && (val as any).image ? (
                                                    <div className="py-2">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img 
                                                            src={getImageUrl((val as any).image)} 
                                                            alt={`Option ${key}`} 
                                                            className="max-w-full h-auto max-h-[200px] object-contain rounded-lg border border-slate-100 shadow-sm" 
                                                        />
                                                    </div>
                                                ) : (
                                                    <div dangerouslySetInnerHTML={{ __html: optionHighlights[key] || (typeof val === 'object' && val !== null ? (val as any).text : (val as string))?.replace(/\n/g, '<br/>') }} />
                                                )}
                                            </div>
                                        </div>
                                    </button>

                                    {isEliminationMode && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); toggleElimination(key); }}
                                            className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center transition-all shrink-0 ${
                                                isEliminated
                                                    ? 'bg-red-50 border-red-300 text-red-600 shadow-sm'
                                                    : 'border-slate-200 text-slate-400 hover:border-red-400 hover:text-red-500'
                                            }`}
                                            title={isEliminated ? 'Restore' : 'Eliminate'}
                                        >
                                            <div className="relative">
                                                <span className="text-[11px] font-black">{key}</span>
                                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-0.5 bg-current rotate-45" />
                                            </div>
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
});

RightPane.displayName = 'RightPane';

function ExamPlayerInner() {
    const { attemptId } = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const mockFlow = searchParams.get('mockFlow') === '1';
    const [midtermMode, setMidtermMode] = useState(() => searchParams.get('midterm') === '1');
    const [attempt, setAttempt] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [flagged, setFlagged] = useState<number[]>([]);

    const [showNavigation, setShowNavigation] = useState(false);
    const [eliminatedOptions, setEliminatedOptions] = useState<Record<string, string[]>>({});
    const [zoomLevel, setZoomLevel] = useState(1.0);
    const [showCalculator, setShowCalculator] = useState(false);
    const [calcSize, setCalcSize] = useState({ w: 450, h: 600 });
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [showDirections, setShowDirections] = useState(false);
    const [calculatorPos, setCalculatorPos] = useState({ x: typeof window !== 'undefined' ? window.innerWidth - 480 : 100, y: 100 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [highlighterActive, setHighlighterActive] = useState(false);
    const [isEliminationMode, setIsEliminationMode] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [showTimer, setShowTimer] = useState(true);
    const [passageHighlights, setPassageHighlights] = useState<Record<number, string>>({});
    const [questionHighlights, setQuestionHighlights] = useState<Record<number, string>>({});
    const [questionPromptHighlights, setQuestionPromptHighlights] = useState<Record<number, string>>({});
    const [optionHighlights, setOptionHighlights] = useState<Record<string, string>>({});
    const [annotationPopover, setAnnotationPopover] = useState<{
        visible: boolean;
        x: number;
        y: number;
        range?: Range | null;
        targetId?: string;
        markElement?: HTMLElement | null;
    }>({ visible: false, x: 0, y: 0 });

    const [isFullscreen, setIsFullscreen] = useState(false);
    const [fullscreenWarningCountdown, setFullscreenWarningCountdown] = useState<number | null>(null);
    const [showAnswerPreview, setShowAnswerPreview] = useState(false);
    const [showReferenceSheet, setShowReferenceSheet] = useState(false);
    const [referencePos, setReferencePos] = useState({ x: 150, y: 150 });
    const [isRefDragging, setIsRefDragging] = useState(false);
    const [refDragOffset, setRefDragOffset] = useState({ x: 0, y: 0 });
    const [isNavigating, setIsNavigating] = useState(false);
    const [showFiveMinuteWarning, setShowFiveMinuteWarning] = useState(false);
    const [warningShownForModule, setWarningShownForModule] = useState<number | null>(null);

    const { current_module_details } = attempt || {};
    const questions = current_module_details?.questions || [];
    const currentQuestion = questions?.[currentQuestionIndex];

    useEffect(() => {
        const fetchAttempt = async () => {
            try {
                const data = await examsApi.getAttemptStatus(Number(attemptId));
                setAttempt(data);
                // Set uniform zoom level to 100% (1.0) for both Math and English
                setZoomLevel(1.0);
                
                if (data.is_completed) {
                    router.push(`/review/${attemptId}`);
                    return;
                }
                if (data.is_expired) {
                    router.push('/');
                    return;
                }
                setLoading(false);
            } catch (err) {
                console.error(err);
            }
        };
        fetchAttempt();
    }, [attemptId, router]);

    useEffect(() => {
        if (searchParams.get('midterm') === '1') setMidtermMode(true);
    }, [searchParams]);

    useEffect(() => {
        if (attempt?.practice_test_details?.mock_kind === 'MIDTERM') {
            setMidtermMode(true);
        }
    }, [attempt?.practice_test_details?.mock_kind]);

    useEffect(() => {
        if (midtermMode) {
            setShowCalculator(false);
            setShowReferenceSheet(false);
        }
    }, [midtermMode]);

    useEffect(() => {
        if (mockFlow) setIsPaused(false);
    }, [mockFlow]);

    // Robust Math Rendering Logic
    const renderMath = useCallback(() => {
        if (typeof window === 'undefined') return;
        
        const tryRender = () => {
            const container = document.body;
            if (!container) return;
            container.classList.add('mathjax-process');

            // KaTeX Auto-render
            if ((window as any).renderMathInElement) {
                try {
                    (window as any).renderMathInElement(container, {
                        delimiters: [
                            {left: '$$', right: '$$', display: true},
                            {left: '\\(', right: '\\)', display: false},
                            {left: '\\[', right: '\\]', display: true}
                        ],
                        throwOnError: false
                    });
                } catch (e) {
                    console.error("KaTeX render error:", e);
                }
            }
            
            // MathJax 3
            if ((window as any).MathJax && (window as any).MathJax.typesetPromise) {
                try {
                    // (window as any).MathJax.typesetClear([container]); 
                    (window as any).MathJax.typesetPromise([container]).catch((err: any) => {
                        // console.debug("MathJax process error (likely interrupted):", err);
                    });
                } catch (e) {}
            }
        };

        // Execute multiple times to ensure rendering happens after React DOM updates
        // and after external scripts (KaTeX/MathJax) are fully loaded.
        tryRender();
        const timers = [50, 200, 500, 1000, 2500].map(ms => setTimeout(tryRender, ms));
        return () => timers.forEach(t => clearTimeout(t));
    }, []);

    useEffect(() => {
        if (!loading) {
            const cleanup = renderMath();
            return cleanup;
        }
    }, [
        currentQuestionIndex, 
        loading, 
        attempt?.current_module_details?.id, 
        showAnswerPreview, 
        renderMath, 
        answers[currentQuestion?.id],
        zoomLevel,
        highlighterActive,
        flagged,
        eliminatedOptions,
        passageHighlights[currentQuestion?.id],
        questionHighlights[currentQuestion?.id],
        questionPromptHighlights[currentQuestion?.id],
        optionHighlights[currentQuestion?.id],
        showCalculator,
        showReferenceSheet,
        showNavigation,
        isEliminationMode
    ]);

    // Fullscreen behavior listeners
    useEffect(() => {
        const handleFullscreenChange = () => {
            if (!document.fullscreenElement) {
                setIsFullscreen(false);
                setFullscreenWarningCountdown(10);
            } else {
                setIsFullscreen(true);
                setFullscreenWarningCountdown(null);
            }
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // Warn countdown and kick
    useEffect(() => {
        if (fullscreenWarningCountdown === null) return;
        if (fullscreenWarningCountdown <= 0) {
            router.push('/');
            return;
        }
        const timer = setTimeout(() => {
            setFullscreenWarningCountdown(prev => prev! - 1);
        }, 1000);
        return () => clearTimeout(timer);
    }, [fullscreenWarningCountdown, router]);

    const [timeLeft, setTimeLeft] = useState<number>(0);

    const zoomIn = () => setZoomLevel(prev => Math.min(1.5, prev + 0.1));
    const zoomOut = () => setZoomLevel(prev => Math.max(0.7, prev - 0.1));

    const handleShowPopover = useCallback((targetId: string, e?: React.MouseEvent) => {
        if (!highlighterActive) return;
        const selection = window.getSelection();
        const target = e?.target as HTMLElement;

        if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            setAnnotationPopover({
                visible: true,
                x: rect.left + rect.width / 2,
                y: rect.top - 10,
                range: range.cloneRange(),
                targetId,
                markElement: null
            });
        } else if (target && target.tagName === 'MARK') {
            const rect = target.getBoundingClientRect();
            setAnnotationPopover({
                visible: true,
                x: rect.left + rect.width / 2,
                y: rect.top - 10,
                range: null,
                targetId,
                markElement: target
            });
        } else {
            setAnnotationPopover(prev => ({ ...prev, visible: false }));
        }
    }, [highlighterActive]);

    const applyAnnotation = (style: 'yellow' | 'blue' | 'pink' | 'underline' | 'clear') => {
        if (!annotationPopover.targetId) return;

        let containerId = '';
        if (annotationPopover.targetId === 'passage') containerId = 'passage-text-container';
        else if (annotationPopover.targetId === 'question') containerId = 'question-content';
        else if (annotationPopover.targetId === 'question-prompt') containerId = 'question-prompt-content';
        else if (annotationPopover.targetId.startsWith('option-')) containerId = `option-content-${annotationPopover.targetId.split('-')[1]}`;

        const container = document.getElementById(containerId);
        if (!container) return;

        if (annotationPopover.markElement) {
            const markNode = annotationPopover.markElement;
            if (style === 'clear') {
                const parent = markNode.parentNode;
                if (parent) {
                    while (markNode.firstChild) parent.insertBefore(markNode.firstChild, markNode);
                    parent.removeChild(markNode);
                }
            } else {
                markNode.className = `annot-${style}`;
                if (style === 'yellow') { markNode.style.cssText = 'background-color: #faed7d; color: #000; text-decoration: none;'; }
                if (style === 'blue') { markNode.style.cssText = 'background-color: #d0e6f5; color: #000; text-decoration: none;'; }
                if (style === 'pink') { markNode.style.cssText = 'background-color: #fae0e0; color: #000; text-decoration: none;'; }
                if (style === 'underline') {
                    markNode.style.cssText = 'background-color: transparent; text-decoration: underline; text-decoration-color: #3b82f6; text-decoration-thickness: 2px;';
                }
            }
        } else if (annotationPopover.range) {
            if (style === 'clear') return;
            const targetRange = annotationPopover.range;

            if (!container.contains(targetRange.commonAncestorContainer)) {
                setAnnotationPopover(prev => ({ ...prev, visible: false }));
                return;
            }

            const mark = document.createElement('mark');
            mark.className = `annot-${style}`;
            if (style === 'yellow') { mark.style.cssText = 'background-color: #faed7d; color: #000; text-decoration: none;'; }
            if (style === 'blue') { mark.style.cssText = 'background-color: #d0e6f5; color: #000; text-decoration: none;'; }
            if (style === 'pink') { mark.style.cssText = 'background-color: #fae0e0; color: #000; text-decoration: none;'; }
            if (style === 'underline') {
                mark.style.cssText = 'background-color: transparent; text-decoration: underline; text-decoration-color: #3b82f6; text-decoration-thickness: 2px;';
            }
            try {
                const fragment = targetRange.extractContents();
                mark.appendChild(fragment);
                targetRange.insertNode(mark);
            } catch (e) {
                console.error('Annotation failed:', e);
            }
        }

        if (annotationPopover.targetId === 'passage') {
            setPassageHighlights(prev => ({ ...prev, [currentQuestion.id]: container.innerHTML }));
        } else if (annotationPopover.targetId === 'question') {
            setQuestionHighlights(prev => ({ ...prev, [currentQuestion.id]: container.innerHTML }));
        } else if (annotationPopover.targetId === 'question-prompt') {
            setQuestionPromptHighlights(prev => ({ ...prev, [currentQuestion.id]: container.innerHTML }));
        } else if (annotationPopover.targetId.startsWith('option-')) {
            const optionId = annotationPopover.targetId.split('-')[1];
            setOptionHighlights(prev => ({ ...prev, [optionId]: container.innerHTML }));
        }

        const currentSelection = window.getSelection();
        if (currentSelection) currentSelection.removeAllRanges();
        setAnnotationPopover(prev => ({ ...prev, visible: false }));
    };

    const handleAnnotate = () => {
        // Legacy handleAnnotate removed in favor of handleShowPopover
    };

    const clearHighlights = () => {
        setQuestionHighlights(prev => {
            const newState = { ...prev };
            delete newState[currentQuestion.id];
            return newState;
        });
        setPassageHighlights(prev => {
            const newState = { ...prev };
            delete newState[currentQuestion.id];
            return newState;
        });
        setQuestionPromptHighlights(prev => {
            const newState = { ...prev };
            delete newState[currentQuestion.id];
            return newState;
        });
        setOptionHighlights(prev => {
            const newState = { ...prev };
            currentQuestion.options?.forEach((opt: any) => {
                delete newState[opt.id];
            });
            return newState;
        });
    };

    const handleCalcMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - calculatorPos.x,
            y: e.clientY - calculatorPos.y
        });
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging) {
                setCalculatorPos({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
            }
            if (isRefDragging) {
                setReferencePos({ x: e.clientX - refDragOffset.x, y: e.clientY - refDragOffset.y });
            }
        };
        const handleMouseUp = () => {
            setIsDragging(false);
            setIsRefDragging(false);
        };

        if (isDragging || isRefDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragOffset, isRefDragging, refDragOffset]);

    const handleSubmitModule = useCallback(async () => {
        if (!attempt || !attempt.current_module_details) return;
        setLoading(true);
        try {
            await examsApi.submitModule(attempt.id, answers, flagged);
            const updatedAttempt = await examsApi.getAttemptStatus(Number(attemptId));
            if (updatedAttempt.is_completed) {
                const meid = searchParams.get('mockExamId');
                const subj = updatedAttempt.practice_test_details?.subject;
                if (mockFlow && meid && subj === 'READING_WRITING') {
                    router.push(`/mock/${meid}/break?rwAttempt=${attemptId}`);
                    return;
                }
                if (mockFlow && meid && subj === 'MATH') {
                    const rw = searchParams.get('rwAttempt');
                    const qs =
                        rw && rw.length > 0
                            ? `?rwAttempt=${encodeURIComponent(rw)}&mathAttempt=${attemptId}`
                            : `?mathAttempt=${attemptId}`;
                    router.push(`/mock/${meid}/results${qs}`);
                    return;
                }
                router.push(`/review/${attemptId}`);
            } else {
                setAttempt(updatedAttempt);
                setCurrentQuestionIndex(0);
                setAnswers({});
                setFlagged([]);
                setEliminatedOptions({});
                setQuestionHighlights({});
                setShowAnswerPreview(false);
                setLoading(false);
            }
        } catch (err) {
            console.error(err);
            setLoading(false);
        }
    }, [attempt, attemptId, answers, flagged, router, mockFlow, searchParams]);

    useEffect(() => {
        if (attempt?.current_module_details && attempt?.current_module_start_time) {
            const updateTimer = () => {
                const limit = attempt.current_module_details.time_limit_minutes * 60;
                const start = new Date(attempt.current_module_start_time).getTime();
                const now = new Date().getTime();
                const elapsed = Math.floor((now - start) / 1000);
                const remaining = Math.max(0, limit - elapsed);
                setTimeLeft(remaining);
            };
            updateTimer();
        }
    }, [attempt]);

    useEffect(() => {
        if (timeLeft <= 0 || (isPaused && !mockFlow)) return;
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    handleSubmitModule();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [timeLeft, isPaused, mockFlow, handleSubmitModule]);

    useEffect(() => {
        const moduleId = attempt?.current_module_details?.id;
        if (!moduleId) return;
        if (timeLeft <= 300 && timeLeft > 0 && warningShownForModule !== moduleId) {
            setShowFiveMinuteWarning(true);
            setWarningShownForModule(moduleId);
            const t = setTimeout(() => setShowFiveMinuteWarning(false), 5000);
            return () => clearTimeout(t);
        }
    }, [timeLeft, attempt?.current_module_details?.id, warningShownForModule]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (loading || !attempt || !attempt.current_module_details) {
        return <div className="min-h-screen flex items-center justify-center bg-white"><div className="animate-spin text-blue-600 w-8 h-8"><Pause className="w-full h-full" /></div></div>;
    }

    const goNext = () => {
        if (isNavigating) return;
        if (currentQuestionIndex < questions.length - 1) {
            setIsNavigating(true);
            setTimeout(() => {
                setCurrentQuestionIndex(currentQuestionIndex + 1);
                setTimeout(() => setIsNavigating(false), 50);
            }, 100);
        }
    };

    const goBack = () => {
        if (isNavigating) return;
        if (currentQuestionIndex > 0) {
            setIsNavigating(true);
            setTimeout(() => {
                setCurrentQuestionIndex(currentQuestionIndex - 1);
                setTimeout(() => setIsNavigating(false), 50);
            }, 100);
        }
    };

    const handleSaveAndExit = async () => {
        try {
            setLoading(true);
            await examsApi.saveAttempt(Number(attemptId), answers, flagged);
            router.push('/');
        } catch (err) {
            console.error(err);
            setLoading(false);
        }
    };

    const enterFullScreen = async () => {
        try {
            await document.documentElement.requestFullscreen();
            setIsFullscreen(true);
        } catch (e) {
            console.error(e);
        }
    };

    if (!isFullscreen && loading === false && !attempt.is_completed) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 px-10 text-center relative overflow-hidden">
                {/* Visual Kick Warning overlay */}
                {fullscreenWarningCountdown !== null && (
                    <div className="absolute inset-0 bg-red-600/10 flex items-center justify-center backdrop-blur-sm z-50">
                        <div className="bg-white p-10 rounded-2xl shadow-2xl max-w-lg border border-red-200 animate-in zoom-in-95">
                            <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-6" />
                            <h2 className="text-2xl font-black text-slate-900 mb-3">You left full-screen!</h2>
                            <p className="text-slate-600 font-medium mb-8 text-lg">
                                The exam requires full-screen mode to prevent distractions. You will be removed from the exam in <span className="font-black text-red-600 px-2 py-1 bg-red-100 rounded-lg">{fullscreenWarningCountdown}s</span> if you do not return.
                            </p>
                            <button
                                onClick={enterFullScreen}
                                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl shadow-lg transition-colors text-lg"
                            >
                                Return to Full Screen Now
                            </button>
                        </div>
                    </div>
                )}

                <div className="max-w-xl w-full">
                    <div className="bg-white p-12 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200">
                        <BookOpen className="w-16 h-16 text-blue-600 mx-auto mb-8" />
                        <h1 className="text-3xl font-extrabold text-slate-900 mb-4 tracking-tight">Ready to begin?</h1>
                        <p className="text-slate-500 font-medium text-lg leading-relaxed mb-10">
                            This exam must be taken in full-screen mode to simulate standard testing conditions.
                        </p>
                        <button
                            onClick={enterFullScreen}
                            className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition-all text-white font-bold py-5 rounded-2xl text-lg shadow-lg shadow-blue-600/20"
                        >
                            Enter Full Screen & Start
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <AuthGuard>
            {/* Removed zoom: 1.5 to prevent layout breaking/scrolling, scaling fonts via Tailwind instead */}
            <div className={`min-h-screen bg-white flex flex-col font-sans text-slate-900 overflow-hidden relative ${highlighterActive ? 'annotate-mode' : ''}`}>
                <header className="flex items-start justify-between px-6 py-2 bg-white relative z-10 w-full shadow-sm" style={{ zoom: 1.15 }}>
                    <div className="flex-1 flex items-center gap-4">
                        <img src="/images/logo.png" alt="Master SAT" className="w-9 h-9 object-contain" />
                        <div>
                            <h1 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1">
                                Section {attempt.practice_test_details.subject === 'READING_WRITING' ? '1' : '2'}, Module {attempt.current_module_details?.module_order || 1}: {attempt.practice_test_details.subject === 'READING_WRITING' ? 'Reading and Writing' : 'Math'}
                            </h1>
                            <button className="text-[11px] font-bold text-slate-700 flex items-center mt-1 border-b border-transparent hover:border-slate-800 pb-0.5">
                                Directions <ChevronDown className="w-3 h-3 ml-1 stroke-[3px]" />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col items-center">
                        {showTimer ? (
                            <div className="flex flex-col items-center">
                                <span className={`text-lg font-bold font-mono tracking-tight ${isPaused ? 'opacity-40' : ''}`}>
                                    {formatTime(timeLeft)}
                                </span>
                                <div className="flex items-center gap-2 mt-0.5">
                                    {!mockFlow && (
                                    <button
                                        onClick={() => setIsPaused(!isPaused)}
                                        className="text-[10px] font-bold text-slate-600 border border-slate-300 rounded-full px-3 py-0.5 hover:bg-slate-50 transition-colors flex items-center gap-1"
                                    >
                                        {isPaused ? <><Play className="w-2.5 h-2.5 inline" /> Resume</> : <><Pause className="w-2.5 h-2.5 inline" /> Pause</>}
                                    </button>
                                    )}
                                    <button
                                        onClick={() => setShowTimer(false)}
                                        className="text-[10px] font-bold text-slate-600 border border-slate-300 rounded-full px-3 py-0.5 hover:bg-slate-50 transition-colors"
                                    >
                                        Hide
                                    </button>
                                </div>
                                {showFiveMinuteWarning && (
                                    <div className="mt-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-full px-3 py-1">
                                        Warning: Only 5 minutes left.
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center">
                                <button className="p-1 mb-1" onClick={() => setShowTimer(true)}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                </button>
                                <button
                                    onClick={() => setShowTimer(true)}
                                    className="text-[10px] font-bold text-slate-600 border border-slate-300 rounded-full px-3 py-0.5 hover:bg-slate-50 transition-colors"
                                >
                                    Show
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 flex justify-end items-start gap-4 pt-1">
                        <button
                            onClick={zoomOut}
                            disabled={zoomLevel <= 0.7}
                            className={`flex flex-col items-center gap-1 transition-all ${zoomLevel <= 0.7 ? 'text-slate-300' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            <span className="w-5 h-5 flex items-center justify-center border-2 border-current rounded font-bold text-xs">-</span>
                            <span className="text-[9px] font-bold uppercase tracking-wider">Zoom Out</span>
                        </button>
                        <div className="flex flex-col items-center justify-center">
                            <span className="text-[10px] font-bold text-slate-400 mt-0.5">{Math.round(zoomLevel * 100)}%</span>
                        </div>
                        <button
                            onClick={zoomIn}
                            disabled={zoomLevel >= 1.5}
                            className={`flex flex-col items-center gap-1 transition-all ${zoomLevel >= 1.5 ? 'text-slate-300' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            <span className="w-5 h-5 flex items-center justify-center border-2 border-current rounded font-bold text-xs">+</span>
                            <span className="text-[9px] font-bold uppercase tracking-wider">Zoom In</span>
                        </button>

                        <div className="w-px h-8 bg-slate-100 mx-1" />

                        <button
                            onClick={() => {
                                const sel = window.getSelection();
                                if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
                                    handleAnnotate();
                                } else {
                                    setHighlighterActive(!highlighterActive);
                                    setIsEliminationMode(false);
                                }
                            }}
                            className={`flex flex-col items-center gap-1 transition-all ${highlighterActive ? 'text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            <Highlighter className="w-5 h-5 mx-auto stroke-2" />
                            <span className="text-[9px] font-bold uppercase tracking-wider">Annotate</span>
                        </button>

                        {!midtermMode && attempt.practice_test_details.subject === 'MATH' && (
                            <>
                                <button onClick={() => {
                                    if (!showCalculator) {
                                        setCalculatorPos({ x: 80, y: 100 });
                                    }
                                    setShowCalculator(!showCalculator);
                                }} className={`flex flex-col items-center gap-1 transition-all ${showCalculator ? 'text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}>
                                    <Calculator className="w-5 h-5 mx-auto stroke-2" />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Calculator</span>
                                </button>
                                <button onClick={() => setShowReferenceSheet(true)} className="flex flex-col items-center gap-1 text-slate-600 hover:text-slate-900 transition-all">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Reference</span>
                                </button>
                            </>
                        )}
                        
                        <div className="relative">
                            <button
                                onClick={() => setShowMoreMenu(!showMoreMenu)}
                                className="flex flex-col items-center gap-1 text-slate-600 hover:text-slate-900 transition-all ml-2"
                            >
                                <MoreVertical className="w-5 h-5 mx-auto stroke-2" />
                                <span className="text-[9px] font-bold uppercase tracking-wider">More</span>
                            </button>
                            
                            {showMoreMenu && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
                                    <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden py-1">
                                        <button 
                                            onClick={handleSaveAndExit}
                                            className="w-full flex items-center px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                                        >
                                            <Save className="w-4 h-4 mr-3 text-slate-400" />
                                            Save and Exit
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </header>
                <div className="w-full h-[3px] opacity-100 shrink-0" style={{ background: 'repeating-linear-gradient(to right, #b91c1c 0, #b91c1c 24px, transparent 24px, transparent 28px, #ca8a04 28px, #ca8a04 52px, transparent 52px, transparent 56px, #15803d 56px, #15803d 80px, transparent 80px, transparent 84px, #0f172a 84px, #0f172a 108px, transparent 108px, transparent 112px)' }} />

                {/* Main Content — adaptive layout based on question type */}
                {currentQuestion && (
                    <main className={`flex-1 flex overflow-hidden relative transition-all duration-300 ${isNavigating ? 'opacity-0 scale-[0.99]' : 'opacity-100 scale-100'}`}>

                        {/* LEFT PANE:
                            - Reading/Writing: passage text
                            - SPR (Math input): directions panel
                            - Plain Math: no left pane
                        */}
                        {!showCalculator && attempt.practice_test_details.subject === 'READING_WRITING' ? (                                            
                            <QuestionPane
                                currentQuestion={currentQuestion}
                                zoomLevel={zoomLevel}
                                                highlighterActive={highlighterActive}
                                                passageHtml={passageHighlights[currentQuestion.id]}
                                                handleShowPopover={handleShowPopover}
                                            />
                        ) : currentQuestion.is_math_input ? (
                            <div className="w-1/2 p-0 overflow-hidden border-r border-slate-200 bg-white flex flex-col justify-start shrink-0">
                                <div className="p-4 bg-slate-50 border-b border-slate-200">
                                    <h3 className="text-sm font-bold text-slate-900">Student-Produced Response Directions</h3>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src="/images/spr_directions.png" alt="SPR Directions" className="max-w-full h-auto" />
                                </div>
                            </div>
                        ) : null}
                        {/* RIGHT PANE: always shown, full-width for plain Math */}
                        <RightPane
                            currentQuestion={currentQuestion}
                            currentQuestionIndex={currentQuestionIndex}
                            attempt={attempt}
                            zoomLevel={zoomLevel}
                            highlighterActive={highlighterActive}
                            handleShowPopover={handleShowPopover}
                            questionHighlights={questionHighlights}
                            questionPromptHighlights={questionPromptHighlights}
                            optionHighlights={optionHighlights}
                            answers={answers}
                            setAnswers={setAnswers}
                            eliminatedOptions={eliminatedOptions}
                            setEliminatedOptions={setEliminatedOptions}
                            isEliminationMode={isEliminationMode}
                            setIsEliminationMode={setIsEliminationMode}
                            flagged={flagged}
                            setFlagged={setFlagged}
                            showCalculator={showCalculator}
                        />
                    </main>

                )}


                {/* Question Navigation Drawer */}
                {showNavigation && (
                    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/5 backdrop-blur-[1px] p-4 text-slate-900">
                        <div className="mb-16 mx-auto bg-white max-w-xl w-full rounded-2xl shadow-[0_2px_40px_rgb(0,0,0,0.3)] border border-slate-200 border-t-[6px] border-t-slate-800 overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
                            <div className="px-6 py-4 flex justify-between items-center bg-white border-b border-slate-200">
                                <h2 className="text-base font-bold text-slate-900">
                                    Section 1, Module {attempt.current_module_details.module_order}: {attempt.practice_test_details.subject === 'READING_WRITING' ? 'Reading and Writing' : 'Math'} Questions
                                </h2>
                                <button onClick={() => setShowNavigation(false)} className="text-slate-500 hover:text-slate-800">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            
                            <div className="px-6 py-3 bg-white border-b border-slate-200 flex justify-center gap-8 text-[11px] font-bold text-slate-600">
                                <div className="flex items-center gap-1.5">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"/></svg>
                                    Current
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-3.5 h-3.5 border-2 border-dashed border-slate-400 bg-white" />
                                    Unanswered
                                </div>

                                <div className="flex items-center gap-1.5">
                                    <Bookmark className="w-3.5 h-3.5 text-red-600 fill-red-600" />
                                    For Review
                                </div>
                            </div>

                            <div className="p-8 max-h-[50vh] overflow-y-auto">
                                <div className="flex flex-wrap gap-[6px] justify-center">
                                    {questions.map((q: any, idx: number) => {
                                        const isAnswered = answers[q.id] !== undefined;
                                        const isFlagged = flagged.includes(q.id);
                                        const isCurrent = currentQuestionIndex === idx;

                                        return (
                                            <div key={q.id} className="relative group">
                                                {isCurrent && (
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="absolute -top-3 -left-1 text-slate-900 z-10"><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>
                                                )}
                                                {isFlagged && (
                                                    <Bookmark className="absolute -top-1 -right-1 w-4 h-4 text-red-600 fill-red-600 z-10" />
                                                )}
                                                <button
                                                    onClick={() => {
                                                        setCurrentQuestionIndex(idx);
                                                        setShowNavigation(false);
                                                    }}
                                                    className={`w-10 h-10 flex flex-col items-center justify-center font-bold text-sm ${isAnswered
                                                        ? 'bg-[#3b5998] text-white border-none'
                                                        : 'bg-white text-[#3b5998] border-[1.5px] border-dashed border-[#3b5998]'
                                                    }`}
                                                >
                                                    {idx + 1}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                                
                                <div className="mt-8 flex justify-center">
                                    <button 
                                        onClick={() => setShowAnswerPreview(true)}
                                        className="border border-blue-600 text-blue-800 font-bold px-8 py-2 rounded-full hover:bg-blue-50 transition-colors text-sm"
                                    >
                                        Go to Review Page
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Answer Preview Modal Before Submit */}
                {showAnswerPreview && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6 animate-in fade-in duration-200">
                        <div className="bg-white w-full max-w-5xl h-[80vh] flex flex-col rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                            <div className="px-10 py-8 border-b border-slate-100 flex justify-between items-center bg-white relative z-10">
                                <div>
                                    <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Answer Preview</h2>
                                    <p className="text-slate-500 font-medium mt-2">
                                        Review your selected answers before finishing the module. Click any question to return to it.
                                    </p>
                                </div>
                                <button onClick={() => setShowAnswerPreview(false)} className="p-3 rounded-2xl hover:bg-slate-100 transition-colors border border-slate-200">
                                    <X className="w-6 h-6 text-slate-600" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-10 bg-slate-50/50">
                                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-10 gap-4">
                                    {questions.map((q: any, idx: number) => {
                                        const isAnswered = answers[q.id];
                                        const isFlagged = flagged.includes(q.id);

                                        return (
                                            <button
                                                key={q.id}
                                                onClick={() => {
                                                    setCurrentQuestionIndex(idx);
                                                    setShowAnswerPreview(false);
                                                }}
                                                className={`relative flex flex-col items-center justify-center h-20 rounded-2xl border-2 transition-all group hover:-translate-y-1 hover:shadow-lg ${isAnswered
                                                    ? 'border-slate-800 bg-slate-800 text-white'
                                                    : 'border-white bg-white hover:border-blue-200 text-slate-600 shadow-sm'
                                                }`}
                                            >
                                                <span className="text-lg font-bold">{idx + 1}</span>
                                                <span className={`text-[12px] font-bold tracking-widest mt-1 opacity-90 ${!isAnswered ? 'text-slate-400' : ''}`}>
                                                    {isAnswered ? (
                                                        q.is_math_input ? (
                                                            <SprFraction text={isAnswered} />
                                                        ) : isAnswered
                                                    ) : 'Omit'}
                                                </span>
                                                {isFlagged && (
                                                    <Bookmark className="absolute -top-2 -right-2 w-5 h-5 fill-red-500 text-red-500 drop-shadow" />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="px-10 py-6 bg-white border-t border-slate-100 flex justify-between items-center z-10">
                                <div className="flex gap-8">
                                    <div className="flex items-center text-xs font-bold uppercase tracking-widest text-slate-500">
                                        <div className="w-3 h-3 bg-slate-800 rounded mr-2" /> Answered
                                    </div>
                                    <div className="flex items-center text-xs font-bold uppercase tracking-widest text-slate-500">
                                        <div className="w-3 h-3 bg-white border border-slate-200 rounded mr-2" /> Omitted
                                    </div>
                                    <div className="flex items-center text-xs font-bold uppercase tracking-widest text-slate-500">
                                        <Bookmark className="w-3 h-3 text-red-500 fill-red-500 mr-2" /> Flagged
                                    </div>
                                </div>
                                <button
                                    onClick={handleSubmitModule}
                                    className="bg-emerald-600 text-white font-bold px-10 py-4 rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-500/20 active:scale-95 text-lg flex items-center gap-3"
                                >
                                    Confirm Submission
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Draggable Calculator Modal */}
                {showCalculator && !midtermMode && (
                    <div
                        style={{ position: 'fixed', left: `${calculatorPos.x}px`, top: `${calculatorPos.y}px`, width: `${calcSize.w}px`, height: `${calcSize.h}px`, zIndex: 60, minWidth: '350px', minHeight: '400px', resize: 'both', overflow: 'hidden' }}
                        className="bg-white rounded-2xl shadow-2xl flex flex-col border border-slate-300 pb-3 pr-3"
                        onMouseUp={(e) => {
                            // Track if resize handles are used
                            const target = e.currentTarget as HTMLDivElement;
                            if (target.style.width && target.style.height) {
                                setCalcSize({ w: parseInt(target.style.width), h: parseInt(target.style.height) });
                            }
                        }}
                    >
                        <div
                            onMouseDown={handleCalcMouseDown}
                            className="px-4 py-3 flex justify-between items-center bg-[#222] text-white cursor-move"
                        >
                            <div className="flex items-center gap-2">
                                <Calculator className="w-4 h-4 text-white/80" />
                                <span className="text-sm font-bold tracking-wide">Desmos Calculator</span>
                            </div>
                            <button onClick={() => setShowCalculator(false)} className="px-3 py-1 bg-transparent border border-slate-600 rounded text-[11px] font-bold hover:bg-slate-800 transition-colors flex items-center gap-1.5">
                                Close
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <div className="flex-1 bg-white relative w-full h-full">
                            <iframe
                                src="https://www.desmos.com/testing/cb-digital-sat/graphing"
                                className="absolute inset-0 w-full h-full border-none rounded-b-xl"
                                title="Calculator"
                                style={{ pointerEvents: isDragging ? 'none' : 'auto' }}
                            />
                        </div>
                    </div>
                )}

                {/* Reference Sheet Modal */}
                {showReferenceSheet && !midtermMode && (
                    <div
                        style={{ position: 'fixed', left: `${referencePos.x}px`, top: `${referencePos.y}px`, width: '800px', zIndex: 60 }}
                        className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-300"
                    >
                        <div
                            onMouseDown={(e: React.MouseEvent) => {
                                setIsRefDragging(true);
                                setRefDragOffset({ x: e.clientX - referencePos.x, y: e.clientY - referencePos.y });
                            }}
                            className="px-4 py-3 flex justify-between items-center bg-[#222] text-white cursor-move"
                        >
                            <span className="text-sm font-bold tracking-wide">Reference Sheet</span>
                            <button onClick={() => setShowReferenceSheet(false)} className="px-3 py-1 bg-transparent border border-slate-600 rounded text-[11px] font-bold hover:bg-slate-800 transition-colors flex items-center gap-1.5">
                                Collapse
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <div className="p-4 max-h-[800px] overflow-y-auto bg-white flex justify-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/images/reference_sheet.png" alt="Reference Sheet" className="max-w-full h-auto" />
                        </div>
                    </div>
                )}

                {/* Annotation Popover */}
                {annotationPopover.visible && highlighterActive && (
                    <div 
                        onMouseDown={(e) => e.preventDefault()}
                        className="fixed z-[100] bg-[#ebf0f7] p-2 rounded-xl shadow-[0_5px_20px_rgba(0,0,0,0.15)] flex items-center gap-2 border border-slate-300 animate-in fade-in zoom-in-95 duration-150"
                        style={{ 
                            left: `${annotationPopover.x}px`, 
                            top: `${annotationPopover.y}px`,
                            transform: 'translate(-50%, -100%)'
                        }}
                    >
                        <button onClick={() => applyAnnotation('yellow')} className="w-8 h-8 rounded-full bg-[#faed7d] border border-slate-400/30 shadow-inner hover:scale-110 transition-transform" />
                        <button onClick={() => applyAnnotation('blue')} className="w-8 h-8 rounded-full bg-[#d0e6f5] border border-slate-400/30 shadow-inner hover:scale-110 transition-transform" />
                        <button onClick={() => applyAnnotation('pink')} className="w-8 h-8 rounded-full bg-[#fae0e0] border border-slate-400/30 shadow-inner hover:scale-110 transition-transform" />
                        
                        <div className="w-[1px] h-6 bg-slate-300 mx-1" />
                        
                        <button 
                            onClick={() => applyAnnotation('underline')}
                            className="p-1 px-2.5 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1 font-bold text-xs"
                        >
                            <span className="underline text-base leading-none">U</span>
                        </button>

                        <button 
                            onClick={() => applyAnnotation('clear')}
                            className="p-2 bg-white border border-slate-300 rounded-lg text-slate-400 hover:text-red-500 hover:border-red-200 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Footer Controls */}
                <footer className="h-11 bg-white relative px-8 flex items-center justify-between border-t border-slate-200 sticky bottom-0 z-10 w-full overflow-hidden" style={{ zoom: 1.15 }}>
                    {/* Decorative Color Bar - Dashed Pattern */}
                    <div 
                        className="absolute top-0 left-0 right-0 h-[3px] w-full" 
                        style={{ 
                            background: 'repeating-linear-gradient(to right, #b91c1c 0, #b91c1c 48px, transparent 48px, transparent 54px, #ca8a04 54px, #ca8a04 102px, transparent 102px, transparent 108px, #15803d 108px, #15803d 156px, transparent 156px, transparent 162px, #0f172a 162px, #0f172a 210px, transparent 210px, transparent 216px)' 
                        }}
                    ></div>

                    <div className="flex-1 flex items-center">
                        <span className="text-sm font-bold text-black uppercase tracking-tight">
                            {attempt?.student_details?.first_name} {attempt?.student_details?.last_name || attempt?.student_name}
                        </span>
                    </div>

                    {/* Nav Pill — moved to bottom */}
                    <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
                        {currentQuestion && (
                            <button
                                onClick={() => setShowNavigation(true)}
                                className="flex items-center gap-2 bg-[#222] text-white px-6 py-1.5 rounded-[4px] font-bold text-xs hover:bg-[#333] transition-all shadow-[0_2px_10px_rgb(0,0,0,0.15)] tracking-wide"
                            >
                                Question {currentQuestionIndex + 1} of {questions.length}
                                <ChevronUp className="w-3.5 h-3.5 stroke-[3px]" />
                            </button>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 flex-1">
                        {currentQuestionIndex > 0 && (
                            <button
                                onClick={goBack}
                                disabled={isNavigating}
                                className={`flex items-center gap-1 font-bold px-6 py-1.5 rounded-full border-2 border-slate-800 text-blue-900 bg-white hover:bg-slate-100 transition-all text-xs active:scale-[0.92] ${isNavigating ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                                Back
                            </button>
                        )}

                        {currentQuestionIndex < questions.length - 1 ? (
                            <button
                                onClick={goNext}
                                disabled={isNavigating}
                                className={`flex items-center gap-1 bg-[#2563eb] text-white font-bold px-6 py-1.5 rounded-full hover:bg-blue-700 transition-all shadow text-xs active:scale-[0.92] ${isNavigating ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                                Next
                            </button>
                        ) : (
                            <button
                                onClick={() => setShowAnswerPreview(true)}
                                className={`bg-[#2563eb] text-white font-bold px-6 py-1.5 rounded-full hover:bg-blue-700 transition-all shadow text-xs active:scale-[0.92] ${isNavigating ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                                Finish Module
                            </button>
                        )}
                    </div>
                </footer>
            </div>

            <style jsx global>{`
                .annot-yellow { background-color: #faed7d !important; color: #000 !important; }
                .annot-blue { background-color: #d0e6f5 !important; color: #000 !important; }
                .annot-pink { background-color: #fae0e0 !important; color: #000 !important; }
                .annot-underline { 
                    background-color: transparent !important; 
                    text-decoration: underline !important; 
                    text-decoration-color: #3b82f6 !important;
                    text-decoration-thickness: 2px !important;
                    text-underline-offset: 3px !important;
                }
                .annotate-mode *::selection { background-color: #3b82f640; }
            `}</style>
        </AuthGuard>
    );
}

export default function ExamPlayerPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen flex items-center justify-center bg-white">
                    <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
            }
        >
            <ExamPlayerInner />
        </Suspense>
    );
}
