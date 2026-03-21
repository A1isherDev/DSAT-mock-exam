"use client";
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { examsApi } from '@/lib/api';
import { BookOpen, Calculator, CheckCircle2, ArrowLeft, Play, RotateCcw, Eye } from 'lucide-react';
import Cookies from 'js-cookie';

export default function MockExamDetailPage() {
  const { id } = useParams();
  const [mockExam, setMockExam] = useState<any>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingModuleId, setStartingModuleId] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = Cookies.get('access_token');
        const examData = await examsApi.getMockExam(Number(id));
        setMockExam(examData);
        if (token) {
          const attemptsData = await examsApi.getAttempts();
          setAttempts(attemptsData);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const getOrCreateAttempt = async (testId: number) => {
    let attempt = attempts.find(a => a.practice_test === testId && !a.is_expired && !a.is_completed);
    if (!attempt) {
      attempt = await examsApi.startTest(testId);
      setAttempts([...attempts, attempt]);
    }
    return attempt;
  };

  const handleStartModule = async (testId: number, moduleId: number) => {
    setStartingModuleId(moduleId);
    try {
      const attempt = await getOrCreateAttempt(testId);
      await examsApi.startModule(attempt.id, moduleId);
      router.push(`/exam/${attempt.id}`);
    } catch (e) {
      console.error('Failed to start module', e);
      setStartingModuleId(null);
    }
  };

  const handleRetake = async (testId: number, moduleId: number) => {
    setStartingModuleId(moduleId);
    try {
      const newAttempt = await examsApi.startTest(testId);
      setAttempts(prev => [...prev.filter(a => a.practice_test !== testId), newAttempt]);
      await examsApi.startModule(newAttempt.id, moduleId);
      router.push(`/exam/${newAttempt.id}`);
    } catch (e) {
      console.error('Failed to retake', e);
      setStartingModuleId(null);
    }
  };

  const renderTestCard = (test: any) => {
    if (!test) return null;
    const isRW = test.subject === 'READING_WRITING';
    const Icon = isRW ? BookOpen : Calculator;
    const label = isRW ? 'Reading & Writing' : 'Mathematics';
    const modules = test.modules || [];
    const attempt = attempts
      .filter(a => a.practice_test === test.id)
      .sort((a, b) => (b.id || 0) - (a.id || 0))[0];

    return (
      <div key={test.id} className={`p-8 rounded-3xl border-2 transition-all ${isRW ? 'border-blue-100 bg-white hover:border-blue-400' : 'border-emerald-100 bg-white hover:border-emerald-400'} shadow-sm hover:shadow-xl`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-5">
            <div className={`p-4 rounded-2xl ${isRW ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'}`}>
              <Icon className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-900 leading-tight">{label}</h3>
              <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-1">
                {modules.length} Modules • {modules.reduce((acc: number, m: any) => acc + m.time_limit_minutes, 0)}m Total Time
              </p>
            </div>
          </div>
          {attempt?.is_completed && (
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-full border border-emerald-200 w-fit">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-xs font-black uppercase tracking-wider">Exam Completed</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4">
          {attempt?.is_completed ? (
            <div className="flex gap-3">
              <button 
                onClick={() => router.push(`/review/${attempt.id}`)}
                className="flex-1 flex items-center justify-center gap-3 bg-slate-900 hover:bg-black text-white py-5 rounded-2xl font-black transition-all shadow-lg active:scale-[0.98]"
              >
                <Eye className="w-5 h-5" /> REVIEW RESULTS
              </button>
              <button 
                onClick={() => handleRetake(test.id, modules[0]?.id)}
                className="flex items-center justify-center gap-3 bg-white border-2 border-slate-200 hover:border-slate-800 text-slate-800 px-8 rounded-2xl font-black transition-all active:scale-[0.98]"
                disabled={startingModuleId !== null}
              >
                <RotateCcw className={`w-5 h-5 ${startingModuleId === modules[0]?.id ? 'animate-spin' : ''}`} />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => handleStartModule(test.id, modules[0]?.id)}
              disabled={startingModuleId !== null}
              className={`w-full flex items-center justify-center gap-3 ${isRW ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white py-5 rounded-2xl font-black transition-all shadow-lg active:scale-[0.98]`}
            >
              {startingModuleId === modules[0]?.id ? (
                <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <><Play className="w-5 h-5 fill-current" /> {attempt ? 'RESUME EXAM' : 'START EXAM'}</>
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#f8f9fb]">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
            <button onClick={() => router.push('/')} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-bold transition-colors">
              <ArrowLeft className="w-5 h-5" /> Back to Dashboard
            </button>
            <div className="text-right">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">{mockExam?.title}</h1>
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Active MasterSAT Session</p>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-6 py-12">
          <div className="mb-12">
            <h2 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">Available Sections</h2>
            <p className="text-slate-500 font-medium text-lg max-w-2xl">
              Complete both sections to receive your full predicted score. You can pause and resume each section independently.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {mockExam?.tests?.sort((a: any, b: any) => a.subject === 'READING_WRITING' ? -1 : 1).map((test: any) => renderTestCard(test))}
            {(!mockExam?.tests || mockExam.tests.length === 0) && (
                <div className="col-span-full py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center">
                    <p className="text-slate-400 font-bold">No sections available for this mock exam yet.</p>
                </div>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
