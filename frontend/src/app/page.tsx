"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { examsApi, authApi } from '@/lib/api';
import { Play, LogOut, BookOpen, Calculator, FileText, Search, X, CheckCircle2, ArrowRight, UserCircle } from 'lucide-react';
import Cookies from 'js-cookie';

export default function DashboardPage() {
  const [mockExams, setMockExams] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [startingModuleId, setStartingModuleId] = useState<number | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const token = Cookies.get('access_token');
    setIsLoggedIn(!!token);

    const fetchData = async () => {
      try {
        const mockExamsData = await examsApi.getMockExams();
        setMockExams(mockExamsData);
        if (token) {
          const attemptsData = await examsApi.getAttempts();
          setAttempts(attemptsData);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
  }, []);

  const getOrCreateAttempt = async (testId: number) => {
    let attempt = attempts.find(a => a.practice_test === testId && !a.is_expired && !a.is_completed);
    if (!attempt) {
      attempt = await examsApi.startTest(testId);
      setAttempts([...attempts, attempt]);
    }
    return attempt;
  };

  const handleRetake = async (testId: number, moduleId: number) => {
    if (!isLoggedIn) { router.push('/login'); return; }
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

  const handleStartModule = async (testId: number, moduleId: number) => {
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }
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

  const handleLogout = () => {
    authApi.logout();
  };

  const getModuleStatus = (testId: number, moduleId: number) => {
    const attempt = attempts.find(a => a.practice_test === testId);
    if (!attempt) return 'Not Started';
    if (attempt.completed_modules.includes(moduleId)) return 'Completed';
    // If test is not completed and this module is not in completed_modules, it might be in progress
    // but the backend doesn't explicitly track "in progress" per module in the simple way we have it here.
    // For now, keep it simple.
    return 'Not Started';
  };

  const getAvailableDates = () => {
    const dates = new Set<string>();
    mockExams.forEach((exam: any) => {
      if (exam.practice_date) {
        const monthYear = exam.practice_date.substring(0, 7);
        dates.add(monthYear);
      }
    });
    return Array.from(dates).sort().reverse();
  };

  const formatDateLabel = (yearMonth: string) => {
    const [year, month] = yearMonth.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const [expandedExams, setExpandedExams] = useState<Set<string>>(new Set());

  const toggleExpand = (title: string) => {
    const newSet = new Set(expandedExams);
    if (newSet.has(title)) newSet.delete(title);
    else newSet.add(title);
    setExpandedExams(newSet);
  };

  // The mockExams from the API already have .tests[] nested
  const groupedExams = mockExams;

  const renderTestSubCard = (test: any, type: 'READING_WRITING' | 'MATH') => {
    if (!test) return null;
    const isReading = type === 'READING_WRITING';
    const Icon = isReading ? BookOpen : Calculator;
    const label = isReading ? 'Reading & Writing' : 'Mathematics';
    const modules = test.modules || [];
    const attempt = attempts
      .filter(a => a.practice_test === test.id)
      .sort((a, b) => (b.id || 0) - (a.id || 0))[0];

    return (
      <div key={test.id} className={`p-4 rounded-2xl border transition-all ${isReading ? 'border-blue-100 bg-blue-50/50 hover:border-blue-300' : 'border-emerald-100 bg-emerald-50/50 hover:border-emerald-300'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isReading ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 leading-tight">{label}</h4>
              <p className="text-[11px] text-slate-500 font-medium">({modules.length} Modules) {modules.reduce((acc: number, m: any) => acc + m.time_limit_minutes, 0)}m Total</p>
            </div>
          </div>
          {attempt?.is_completed && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full border border-emerald-200 w-fit">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Completed</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {attempt?.is_completed ? (
            <div className="flex gap-2">
              <button
                onClick={() => router.push(`/review/${attempt.id}`)}
                className="flex-[2] flex items-center justify-center gap-2 font-bold py-2.5 px-3 rounded-xl transition-all text-xs uppercase tracking-wider bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-blue-600 shadow-sm"
              >
                <ArrowRight className="w-4 h-4" />
                Review
              </button>
              <button
                disabled={startingModuleId !== null}
                onClick={() => {
                  const firstModule = modules.sort((a: any, b: any) => a.module_order - b.module_order)[0];
                  if (firstModule) handleRetake(test.id, firstModule.id);
                }}
                className="flex-1 flex items-center justify-center gap-2 font-bold py-2.5 px-3 rounded-xl transition-all text-xs uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 shadow-sm"
              >
                <Play className="w-3.5 h-3.5" />
                Retake
              </button>
            </div>
          ) : attempt?.is_expired ? (
            <button
              disabled={startingModuleId !== null}
              onClick={() => {
                const firstModule = modules.sort((a: any, b: any) => a.module_order - b.module_order)[0];
                if (firstModule) handleRetake(test.id, firstModule.id);
              }}
              className="w-full flex items-center justify-center gap-2 font-bold py-2.5 px-4 rounded-xl transition-all text-xs uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 shadow-sm"
            >
              {startingModuleId !== null ? (
                <div className="w-4 h-4 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  Retake Exam
                </>
              )}
            </button>
          ) : (
            <button
              disabled={startingModuleId !== null}
              onClick={() => {
                const firstModule = modules.sort((a: any, b: any) => a.module_order - b.module_order).find((m: any) => !attempt?.completed_modules?.includes(m.id)) || modules[0];
                if (firstModule) handleStartModule(test.id, firstModule.id);
              }}
              className={`w-full flex items-center justify-center gap-2 font-bold py-2.5 px-4 rounded-xl transition-all text-xs uppercase tracking-wider bg-white border shadow-sm hover:shadow-md ${isReading ? 'text-blue-700 border-blue-200 hover:border-blue-400' : 'text-emerald-700 border-emerald-200 hover:border-emerald-400'}`}
            >
              {startingModuleId !== null ? (
                <div className={`w-4 h-4 border-2 rounded-full animate-spin ${isReading ? 'border-blue-200 border-t-blue-600' : 'border-emerald-200 border-t-emerald-600'}`} />
              ) : !isLoggedIn ? (
                <>
                  <UserCircle className="w-4 h-4 opacity-60" />
                  Sign in
                </>
              ) : attempt && attempt.current_module ? (
                <>
                  <Play className="w-3.5 h-3.5" />
                  Resume
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  Start
                </>
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <AuthGuard isOptional={true}>
      <div className="min-h-screen bg-slate-50 relative pb-20">
        <header className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-center shadow-sm sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <BookOpen className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">MasterSAT</h1>
          </div>
          {isLoggedIn ? (
            <button onClick={handleLogout} className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-red-600 transition-colors uppercase tracking-wider px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50">
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          ) : (
            <button onClick={() => router.push('/login')} className="flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all uppercase tracking-wider px-5 py-2.5 rounded-lg shadow-lg shadow-blue-100">
              <UserCircle className="w-4 h-4" />
              Sign In
            </button>
          )}
        </header>

        <main className="max-w-7xl mx-auto px-8 py-12">
          <div className="mb-12">
            <div className="flex items-center gap-2 mb-3">
              <span className="h-1 w-12 bg-blue-600 rounded-full"></span>
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest block">Student Dashboard</span>
            </div>
            <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-4">MasterSAT Portal</h2>
            <p className="text-slate-500 font-medium max-w-2xl leading-relaxed text-lg">
              Enhance your preparation with our rigorous SAT mock modules. Focus on specific domains independently and track your progress through detailed analytics.
            </p>
          </div>

          {/* Controls Section */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-10">
            <div className="w-full md:w-auto relative group flex items-center gap-2">
              <div className="relative flex-1 md:w-64">
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-[18px] text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-100 focus:bg-white focus:border-blue-400 transition-all appearance-none cursor-pointer shadow-sm"
                >
                  <option value="">All Available Dates</option>
                  {getAvailableDates().map(dateStr => (
                    <option key={dateStr} value={dateStr}>
                      {formatDateLabel(dateStr)}
                    </option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <CheckCircle2 className="w-4 h-4 opacity-0" />
                </div>
              </div>
              {dateFilter && (
                <button onClick={() => setDateFilter('')} className="p-3 text-slate-400 hover:text-slate-600 bg-white border border-slate-200 rounded-[14px] hover:bg-slate-50 transition-colors shadow-sm">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="relative w-full md:w-96 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
              <input
                type="text"
                placeholder="Search practice tests..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-10 py-3 bg-white border border-slate-200 rounded-[18px] text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-100 focus:bg-white focus:border-blue-400 transition-all shadow-sm"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {groupedExams
              .filter((group: any) =>
                group.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (group.practice_date && group.practice_date.includes(searchQuery))
              )
              .filter((group: any) => !dateFilter || (group.practice_date && group.practice_date.startsWith(dateFilter)))
              .map((group: any, index: number) => {
                const formatDate = (dateStr: string) => {
                  if (!dateStr) return 'No Date';
                  try {
                    const date = new Date(dateStr);
                    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                  } catch (e) {
                    return dateStr;
                  }
                };

                const isExpanded = expandedExams.has(group.title);

                return (
                  <div key={group.id} className="bg-white rounded-[28px] shadow-sm overflow-hidden flex flex-col border border-slate-200 hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300">
                    <div className="p-8 pb-6 relative overflow-hidden transition-colors bg-slate-50/50">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border shadow-sm bg-white text-slate-600 border-slate-200">
                          {formatDate(group.practice_date)}
                        </span>
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex justify-center items-center text-blue-600">
                           <BookOpen className="w-4 h-4" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-slate-900 transition-colors mb-2">
                        {group.title}
                      </h3>
                      <p className="text-[13px] text-slate-500 font-medium">Digital SAT System mock exam matching modern College Board formats.</p>
                    </div>

                    <div className="p-6 bg-white flex flex-col justify-center flex-1">
                      <button
                        onClick={() => router.push(`/mock/${group.id}`)}
                        className="group/btn w-full flex items-center justify-center gap-3 font-black py-4 px-6 rounded-2xl transition-all text-sm uppercase tracking-widest bg-slate-900 text-white hover:bg-blue-600 shadow-xl shadow-slate-200 hover:shadow-blue-200 active:scale-[0.98]"
                      >
                        Enter Mock Exam <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-1 transition-transform" />
                      </button>
                    </div>
                  </div>
                );
              })}

            {groupedExams.length === 0 && (
              <div className="col-span-full py-32 text-center rounded-[40px] border-2 border-dashed border-slate-200 bg-white/50 transition-all">
                <Search className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">No available examinations found</p>
                <p className="text-slate-300 text-xs mt-2 uppercase tracking-widest">Try adjusting filters or checking back later.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
