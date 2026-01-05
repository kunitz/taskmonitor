import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  CheckCircle2, 
  Search, 
  Calendar, 
  BarChart3, 
  Settings, 
  Download, 
  RefreshCw, 
  Filter, 
  ChevronDown, 
  ChevronUp,
  LayoutDashboard,
  ListTodo,
  LogOut,
  AlertTriangle,
  Loader2,
  X
} from 'lucide-react';

/**
 * --- APP CONFIGURATION & TYPES ---
 */

type TaskStatus = 'needsAction' | 'completed';

interface GoogleTask {
  id: string;
  title: string;
  status: TaskStatus;
  completed?: string; // ISO Date string
  updated: string;
  notes?: string;
  listId: string; // Helper property we add for aggregation
  listName?: string; // Helper property
}

interface TaskList {
  id: string;
  title: string;
}

// --- MOCK DATA GENERATOR ---
const generateMockData = (): { lists: TaskList[], tasks: GoogleTask[] } => {
  const lists: TaskList[] = [
    { id: '1', title: 'My Tasks' },
    { id: '2', title: 'Work Projects' },
    { id: '3', title: 'Groceries' },
    { id: '4', title: 'House Maintenance' },
  ];

  const tasks: GoogleTask[] = [];
  const now = new Date();
  
  // Generate 200 mock tasks scattered over the last year
  for (let i = 0; i < 200; i++) {
    const isCompleted = Math.random() > 0.2; // 80% completed
    const daysAgo = Math.floor(Math.random() * 365);
    const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    const list = lists[Math.floor(Math.random() * lists.length)];
    
    tasks.push({
      id: `task-${i}`,
      title: [
        'Review quarterly report', 'Buy milk', 'Call mom', 'Update website', 
        'Fix navbar bug', 'Schedule dentist', 'Team meeting', 'Pay bills',
        'Clean garage', 'Read documentation', 'Reply to emails', 'Plan vacation'
      ][Math.floor(Math.random() * 12)] + ` ${i}`,
      status: isCompleted ? 'completed' : 'needsAction',
      completed: isCompleted ? date.toISOString() : undefined,
      updated: date.toISOString(),
      listId: list.id,
      listName: list.title
    });
  }

  // Sort by completed date descending
  return { 
    lists, 
    tasks: tasks.sort((a, b) => 
      new Date(b.completed || 0).getTime() - new Date(a.completed || 0).getTime()
    ) 
  };
};

/**
 * --- COMPONENTS ---
 */

// 1. STAT CARD
const StatCard = ({ title, value, icon: Icon, colorClass }: any) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
    <div className={`p-3 rounded-lg ${colorClass} bg-opacity-10`}>
      <Icon className={`w-6 h-6 ${colorClass.replace('bg-', 'text-')}`} />
    </div>
    <div>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
    </div>
  </div>
);

// 2. HEATMAP COMPONENT
const ActivityHeatmap = ({ tasks }: { tasks: GoogleTask[] }) => {
  // Generate last 365 days map
  const today = new Date();
  const days = useMemo(() => {
    const map = new Map<string, number>();
    tasks.forEach(t => {
      if (t.completed) {
        const dateStr = t.completed.split('T')[0];
        map.set(dateStr, (map.get(dateStr) || 0) + 1);
      }
    });

    const result = [];
    for (let i = 364; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      result.push({
        date: dateStr,
        count: map.get(dateStr) || 0
      });
    }
    return result;
  }, [tasks]);

  const getColor = (count: number) => {
    if (count === 0) return 'bg-slate-100';
    if (count <= 2) return 'bg-emerald-200';
    if (count <= 4) return 'bg-emerald-300';
    if (count <= 6) return 'bg-emerald-400';
    return 'bg-emerald-600';
  };

  return (
    <div className="w-full overflow-x-auto pb-2">
      <div className="flex space-x-1 min-w-[max-content]">
        {days.map((day, i) => (
          <div 
            key={day.date}
            title={`${day.date}: ${day.count} tasks`}
            className={`w-3 h-8 rounded-sm ${getColor(day.count)} transition-all hover:opacity-80`}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs text-slate-400 mt-2 px-1">
        <span>1 year ago</span>
        <span>Today</span>
      </div>
    </div>
  );
};

// 3. MAIN APP COMPONENT
export default function GoogleTasksMonitor() {
  // --- STATE ---
  const [mode, setMode] = useState<'mock' | 'live'>('mock');
  const [apiKey, setApiKey] = useState('');
  const [clientId, setClientId] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  
  const [allTasks, setAllTasks] = useState<GoogleTask[]>([]);
  const [allLists, setAllLists] = useState<TaskList[]>([]);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedListId, setSelectedListId] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'all' | '7days' | '30days' | 'year'>('all');

  // Navigation
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'settings'>('dashboard');

  // --- INITIALIZATION ---
  useEffect(() => {
    if (mode === 'mock') {
      const { lists, tasks } = generateMockData();
      setAllLists(lists);
      setAllTasks(tasks);
      setIsAuthenticated(true);
    } else {
      // Reset for live mode
      setAllTasks([]);
      setAllLists([]);
      setIsAuthenticated(false);
    }
  }, [mode]);

  // --- GOOGLE API INTEGRATION (LIVE MODE) ---
  const loadGapi = () => {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      window.gapi.load('client', initClient);
    };
    document.body.appendChild(script);
  };

  const loadGis = () => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => {
      // GIS loaded
    };
    document.body.appendChild(script);
  };

  const initClient = async () => {
    if (!apiKey || !clientId) return;
    try {
      await window.gapi.client.init({
        apiKey: apiKey,
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/tasks/v1/rest'],
      });
      // In a real scenario, we would setup the TokenClient here using GIS
      // For this single-file demo, we'll prompt the user if they try to connect
    } catch (err) {
      console.error('Error initializing GAPI client', err);
    }
  };

  const handleLiveConnect = async () => {
    if (!window.google) {
      loadGis(); 
      loadGapi();
      alert("Loading Google Scripts... please click Connect again in a moment.");
      return;
    }
    
    setIsLoading(true);
    setLoadingText('Requesting authorization...');

    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/tasks.readonly',
        callback: async (resp: any) => {
          if (resp.error) {
            throw resp;
          }
          await fetchRealData();
        },
      });
      tokenClient.requestAccessToken();
    } catch (err) {
      console.error(err);
      setIsLoading(false);
      alert('Authentication failed or popup blocked. See console for details.');
    }
  };

  const fetchRealData = async () => {
    setLoadingText('Fetching Task Lists...');
    try {
      // 1. Get Lists
      const listsResp = await window.gapi.client.tasks.tasklists.list();
      const lists = listsResp.result.items || [];
      setAllLists(lists);

      // 2. Get Tasks for each list
      const fetchedTasks: GoogleTask[] = [];
      let processed = 0;

      for (const list of lists) {
        setLoadingText(`Scanning list: ${list.title}...`);
        
        let pageToken = null;
        do {
          const tasksResp: any = await window.gapi.client.tasks.tasks.list({
            tasklist: list.id,
            showCompleted: true,
            showHidden: true,
            maxResults: 100, // Max allowed by API
            pageToken: pageToken
          });

          const items = tasksResp.result.items || [];
          items.forEach((t: any) => {
            fetchedTasks.push({
              ...t,
              listId: list.id,
              listName: list.title
            });
          });

          pageToken = tasksResp.result.nextPageToken;
        } while (pageToken);
        
        processed++;
      }

      setAllTasks(fetchedTasks.sort((a, b) => 
        new Date(b.completed || 0).getTime() - new Date(a.completed || 0).getTime()
      ));
      setIsAuthenticated(true);
    } catch (err) {
      console.error('Error fetching data', err);
      alert('Failed to fetch data. Check API Quotas or Console.');
    } finally {
      setIsLoading(false);
    }
  };

  // --- FILTERING LOGIC ---
  const filteredTasks = useMemo(() => {
    return allTasks.filter(task => {
      // 1. Status Filter (Always show completed for history purposes, or both)
      // For this app, we focus on completed mostly, but let's show all matching the search
      
      // 2. List Filter
      if (selectedListId !== 'all' && task.listId !== selectedListId) return false;

      // 3. Search Filter
      const q = searchQuery.toLowerCase();
      if (q && !task.title.toLowerCase().includes(q)) return false;

      // 4. Date Filter
      if (task.completed) {
        const completedDate = new Date(task.completed);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - completedDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (dateRange === '7days' && diffDays > 7) return false;
        if (dateRange === '30days' && diffDays > 30) return false;
        if (dateRange === 'year' && diffDays > 365) return false;
      } else if (dateRange !== 'all') {
        // If filtering by date but task isn't completed, decide behavior.
        // Usually we only show completed in history view.
        return false;
      }

      return true;
    });
  }, [allTasks, selectedListId, searchQuery, dateRange]);

  const stats = useMemo(() => {
    const completed = allTasks.filter(t => t.status === 'completed');
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return {
      total: allTasks.length,
      completedTotal: completed.length,
      completedWeek: completed.filter(t => t.completed && new Date(t.completed) > oneWeekAgo).length,
      completedMonth: completed.filter(t => t.completed && new Date(t.completed) > thisMonth).length,
    };
  }, [allTasks]);

  // --- EXPORT ---
  const handleExport = () => {
    const headers = ['Task ID', 'List Name', 'Title', 'Status', 'Completed Date', 'Notes'];
    const csvContent = [
      headers.join(','),
      ...filteredTasks.map(t => [
        t.id,
        `"${t.listName || ''}"`,
        `"${t.title.replace(/"/g, '""')}"`,
        t.status,
        t.completed || '',
        `"${(t.notes || '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `google_tasks_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // --- RENDER HELPERS ---
  const LoadingOverlay = () => (
    <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
      <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
      <h3 className="text-xl font-semibold text-slate-800">{loadingText}</h3>
      <p className="text-slate-500 mt-2">Connecting to Google Tasks API...</p>
    </div>
  );

  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {isLoading && <LoadingOverlay />}

      {/* SIDEBAR */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 z-20">
        <div className="p-6 flex items-center space-x-3 border-b border-slate-100">
          <div className="bg-blue-600 p-2 rounded-lg">
            <CheckCircle2 className="w-6 h-6 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight">TaskMonitor</span>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>Dashboard</span>
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'history' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <ListTodo className="w-5 h-5" />
            <span>Task History</span>
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Settings className="w-5 h-5" />
            <span>Connection</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-100 bg-slate-50">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span className="font-semibold uppercase tracking-wider">Current Mode</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${mode === 'mock' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
              {mode}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            {mode === 'mock' ? 'Using generated sample data.' : 'Connected to real API.'}
          </p>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto">
        <header className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {activeTab === 'dashboard' && 'Productivity Overview'}
              {activeTab === 'history' && 'Search History'}
              {activeTab === 'settings' && 'App Settings'}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {activeTab === 'dashboard' && `Welcome back. You've completed ${stats.completedWeek} tasks this week.`}
              {activeTab === 'history' && 'Filter and export your completed tasks.'}
              {activeTab === 'settings' && 'Configure API keys and connection modes.'}
            </p>
          </div>
          
          {activeTab === 'history' && (
            <div className="flex items-center space-x-3">
              <button 
                onClick={handleExport}
                className="flex items-center space-x-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Export CSV</span>
              </button>
            </div>
          )}
        </header>

        <div className="p-8">
          
          {/* --- DASHBOARD VIEW --- */}
          {activeTab === 'dashboard' && (
            <div className="space-y-8 animate-in fade-in duration-500">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard 
                  title="Total Completed" 
                  value={stats.completedTotal} 
                  icon={CheckCircle2} 
                  colorClass="bg-green-500" 
                />
                <StatCard 
                  title="This Week" 
                  value={stats.completedWeek} 
                  icon={Calendar} 
                  colorClass="bg-blue-500" 
                />
                <StatCard 
                  title="This Month" 
                  value={stats.completedMonth} 
                  icon={BarChart3} 
                  colorClass="bg-purple-500" 
                />
                <StatCard 
                  title="Completion Rate" 
                  value={`${allTasks.length ? Math.round((stats.completedTotal / allTasks.length) * 100) : 0}%`} 
                  icon={RefreshCw} 
                  colorClass="bg-orange-500" 
                />
              </div>

              {/* Heatmap Section */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-lg text-slate-800">Activity Heatmap</h3>
                  <div className="flex items-center text-sm text-slate-500 space-x-2">
                    <div className="w-3 h-3 bg-slate-100 rounded-sm"></div>
                    <span>Less</span>
                    <div className="w-3 h-3 bg-emerald-600 rounded-sm"></div>
                    <span>More</span>
                  </div>
                </div>
                <ActivityHeatmap tasks={allTasks} />
              </div>

              {/* Recent Tasks */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-bold text-lg text-slate-800">Recently Completed</h3>
                  <button 
                    onClick={() => setActiveTab('history')}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    View All
                  </button>
                </div>
                <div className="divide-y divide-slate-100">
                  {allTasks.filter(t => t.status === 'completed').slice(0, 5).map(task => (
                    <div key={task.id} className="p-4 flex items-center space-x-4 hover:bg-slate-50 transition-colors">
                      <div className="flex-shrink-0">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{task.title}</p>
                        <p className="text-xs text-slate-500 truncate">{task.listName} • {new Date(task.completed || '').toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                  {allTasks.length === 0 && (
                    <div className="p-8 text-center text-slate-500">
                      No completed tasks found.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* --- HISTORY VIEW --- */}
          {activeTab === 'history' && (
            <div className="space-y-6 animate-in fade-in duration-500">
              
              {/* Filters Toolbar */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input 
                    type="text"
                    placeholder="Search tasks..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>
                
                <div className="flex items-center space-x-3 overflow-x-auto pb-2 md:pb-0">
                  <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <Filter className="w-4 h-4 text-slate-500" />
                    <select 
                      value={selectedListId}
                      onChange={(e) => setSelectedListId(e.target.value)}
                      className="bg-transparent text-sm font-medium text-slate-700 focus:outline-none cursor-pointer"
                    >
                      <option value="all">All Lists</option>
                      {allLists.map(list => (
                        <option key={list.id} value={list.id}>{list.title}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <Calendar className="w-4 h-4 text-slate-500" />
                    <select 
                      value={dateRange}
                      onChange={(e) => setDateRange(e.target.value as any)}
                      className="bg-transparent text-sm font-medium text-slate-700 focus:outline-none cursor-pointer"
                    >
                      <option value="all">All Time</option>
                      <option value="7days">Last 7 Days</option>
                      <option value="30days">Last 30 Days</option>
                      <option value="year">Last Year</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Task List */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Task</th>
                        <th className="px-6 py-4">List</th>
                        <th className="px-6 py-4">Completed On</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTasks.map((task) => (
                        <tr key={task.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-6 py-4 w-16">
                            {task.status === 'completed' ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            ) : (
                              <div className="w-5 h-5 rounded-full border-2 border-slate-300" />
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-sm font-medium ${task.status === 'completed' ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-800'}`}>
                              {task.title}
                            </span>
                            {task.notes && (
                              <p className="text-xs text-slate-400 mt-1 line-clamp-1">{task.notes}</p>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                              {task.listName}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500 tabular-nums">
                            {task.completed ? new Date(task.completed).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            }) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredTasks.length === 0 && (
                  <div className="p-12 text-center">
                    <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Search className="w-8 h-8 text-slate-300" />
                    </div>
                    <h3 className="text-lg font-medium text-slate-900">No tasks found</h3>
                    <p className="text-slate-500 mt-1">Try adjusting your filters or search query.</p>
                  </div>
                )}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 text-xs text-slate-500 flex justify-between">
                  <span>Showing {filteredTasks.length} tasks</span>
                  {mode === 'mock' && <span>Mock Data Mode</span>}
                </div>
              </div>
            </div>
          )}

          {/* --- SETTINGS VIEW --- */}
          {activeTab === 'settings' && (
            <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-500">
              
              <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100">
                <div className="flex items-start gap-4">
                  <div className="bg-blue-100 p-3 rounded-full">
                    <Settings className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">Connection Settings</h2>
                    <p className="text-slate-500 mt-1">
                      Choose between viewing sample data or connecting to your real Google Tasks account.
                    </p>
                  </div>
                </div>

                <div className="mt-8 space-y-6">
                  {/* Mode Toggle */}
                  <div className="bg-slate-50 p-1 rounded-lg flex">
                    <button
                      onClick={() => setMode('mock')}
                      className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all ${mode === 'mock' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      Mock Mode (Demo)
                    </button>
                    <button
                      onClick={() => setMode('live')}
                      className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all ${mode === 'live' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      Live API Mode
                    </button>
                  </div>

                  {mode === 'mock' ? (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 flex gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-semibold text-emerald-800">Demo Mode Active</h4>
                        <p className="text-sm text-emerald-700 mt-1">
                          You are viewing generated sample data. This allows you to test the filtering, search, and export features without needing API credentials.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 flex gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-sm text-amber-800">
                          <strong>Important:</strong> To use Live Mode, you must have a Google Cloud Project with the <code>Tasks API</code> enabled.
                          <br /><br />
                          If you are running this in a sandbox/iframe, Google Auth may be blocked due to origin restrictions. Export this code to run locally if that happens.
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Client ID</label>
                        <input 
                          type="text" 
                          value={clientId}
                          onChange={(e) => setClientId(e.target.value)}
                          placeholder="e.g., 123456789-abc.apps.googleusercontent.com"
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">API Key</label>
                        <input 
                          type="password" 
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder="AIzaSy..."
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>

                      <button 
                        onClick={handleLiveConnect}
                        disabled={!clientId || !apiKey || isLoading}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg shadow-sm transition-all flex justify-center items-center space-x-2"
                      >
                        {isAuthenticated ? (
                          <>
                            <RefreshCw className="w-4 h-4" />
                            <span>Refresh Data</span>
                          </>
                        ) : (
                          <>
                            <LogOut className="w-4 h-4" />
                            <span>Authenticate & Fetch</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}