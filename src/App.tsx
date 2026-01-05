import { useState, useEffect, useMemo } from 'react';
import { 
  CheckCircle2, 
  Search, 
  Calendar, 
  Settings, 
  LayoutDashboard,
  ListTodo,
  Loader2,
  Repeat,
  Archive,
  Clock,
  ShieldAlert,
  Save,
  CloudCog
} from 'lucide-react';

/**
 * --- TYPESCRIPT DECLARATIONS ---
 */
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

/**
 * --- APP CONFIGURATION & TYPES ---
 */

type TaskStatus = 'needsAction' | 'completed';

interface GoogleTask {
  id: string;
  title: string;
  status: TaskStatus;
  completed?: string; // ISO Date string
  due?: string; // ISO Date string (RFC 3339)
  updated: string;
  notes?: string;
  listId: string; // Helper property
  listName?: string; // Helper property
  isArchived?: boolean; // Flag for locally preserved history
  isRecurring?: boolean; // Flag if we detect it's a recurring task
  recurrenceInterval?: string; // Mock field (API doesn't standardize this easily)
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
  ];

  const tasks: GoogleTask[] = [];
  const now = new Date();
  
  // Generate mock tasks
  for (let i = 0; i < 50; i++) {
    const isCompleted = Math.random() > 0.3;
    const daysOffset = Math.floor(Math.random() * 60) - 30; // +/- 30 days
    const date = new Date(now.getTime() - daysOffset * 24 * 60 * 60 * 1000);
    const dueDate = new Date(now.getTime() + (Math.random() * 10) * 24 * 60 * 60 * 1000);
    
    // Simulate some recurring tasks
    const isRecurring = i % 5 === 0;
    
    tasks.push({
      id: `task-${i}`,
      title: isRecurring 
        ? `Submit Timesheet (Recurring) ${i}` 
        : `Task ${i} - ${['Review document', 'Email client', 'Update styles', 'Fix bug'][i % 4]} with a very long description that might break the layout if we are not careful about css classes`,
      status: isCompleted ? 'completed' : 'needsAction',
      completed: isCompleted ? date.toISOString() : undefined,
      due: dueDate.toISOString(),
      updated: date.toISOString(),
      listId: lists[i % lists.length].id,
      listName: lists[i % lists.length].title,
      isRecurring: isRecurring,
      recurrenceInterval: isRecurring ? 'Weekly' : undefined
    });
  }

  return { lists, tasks };
};

/**
 * --- COMPONENTS ---
 */

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

const ActivityHeatmap = ({ tasks }: { tasks: GoogleTask[] }) => {
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
        {days.map((day) => (
          <div 
            key={day.date}
            title={`${day.date}: ${day.count} tasks`}
            className={`w-3 h-8 rounded-sm ${getColor(day.count)}`}
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

export default function GoogleTasksMonitor() {
  // --- ENVIRONMENT CHECK ---
  const isDev = useMemo(() => {
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  }, []);

  // --- STATE ---
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gTasks_apiKey') || '');
  const [clientId, setClientId] = useState(() => localStorage.getItem('gTasks_clientId') || '');
  
  const [mode, setMode] = useState<'mock' | 'live'>('live');
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  
  const [allTasks, setAllTasks] = useState<GoogleTask[]>([]);
  const [allLists, setAllLists] = useState<TaskList[]>([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedListId, setSelectedListId] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'all' | '7days' | '30days' | 'year'>('all');

  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'settings'>('dashboard');

  // --- PERSISTENCE HELPERS ---
  const STORAGE_KEY_TASKS = 'gTasks_monitor_tasks';
  const STORAGE_KEY_LISTS = 'gTasks_monitor_lists';

  const saveToLocal = (tasks: GoogleTask[], lists: TaskList[]) => {
    localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
    localStorage.setItem(STORAGE_KEY_LISTS, JSON.stringify(lists));
  };

  // FIX: Explicitly typed return value so TS knows it's not {}
  const loadFromLocal = (): { tasks: GoogleTask[], lists: TaskList[] } => {
    const t = localStorage.getItem(STORAGE_KEY_TASKS);
    const l = localStorage.getItem(STORAGE_KEY_LISTS);
    return {
      tasks: t ? JSON.parse(t) : [],
      lists: l ? JSON.parse(l) : []
    };
  };

  // --- EFFECT: CREDENTIAL PERSISTENCE & INITIAL REDIRECT ---
  useEffect(() => {
    localStorage.setItem('gTasks_apiKey', apiKey);
    localStorage.setItem('gTasks_clientId', clientId);
  }, [apiKey, clientId]);

  useEffect(() => {
    if (mode === 'live' && (!apiKey || !clientId)) {
      setActiveTab('settings');
    }
  }, [mode, apiKey, clientId]);

  // --- INITIALIZATION ---
  useEffect(() => {
    if (mode === 'mock') {
      const { lists, tasks } = generateMockData();
      setAllLists(lists);
      setAllTasks(tasks);
      setIsAuthenticated(true);
    } else {
      const { tasks, lists } = loadFromLocal();
      if (tasks.length > 0) {
        setAllTasks(tasks);
        setAllLists(lists);
      }
      setIsAuthenticated(false);

      if (apiKey && clientId) {
        loadGis();
        loadGapi();
      }
    }
  }, [mode]);

  // --- GOOGLE API INTEGRATION ---
  const loadGapi = () => {
    if (window.gapi) {
      initClient();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => window.gapi.load('client', initClient);
    document.body.appendChild(script);
  };

  const loadGis = () => {
    if (window.google) return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    document.body.appendChild(script);
  };

  const initClient = async () => {
    if (!apiKey || !clientId) return;
    try {
      await window.gapi.client.init({
        apiKey: apiKey,
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/tasks/v1/rest'],
      });
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
        scope: 'https://www.googleapis.com/auth/tasks',
        callback: async (resp: any) => {
          if (resp.error) throw resp;
          await fetchRealData();
        },
      });
      tokenClient.requestAccessToken();
    } catch (err) {
      console.error(err);
      setIsLoading(false);
      alert('Authentication failed. Check console.');
    }
  };

  // --- ARCHIVE LOGIC ---
  const archiveTaskRemote = async (task: GoogleTask) => {
    try {
      await window.gapi.client.tasks.tasks.insert({
        tasklist: task.listId,
        resource: {
          title: task.title, 
          status: 'completed',
          completed: task.completed, 
          notes: (task.notes || "") + "\n[Archived History of Recurring Task]",
          deleted: false,
          hidden: false
        }
      });
      console.log(`Archived recurring task: ${task.title}`);
      return true;
    } catch (error) {
      console.error("Failed to archive task remote", error);
      return false;
    }
  };

  // --- RACE CONDITION MITIGATION ---
  const isDuplicateArchive = (localTask: GoogleTask, allRemoteTasks: GoogleTask[]) => {
    return allRemoteTasks.some(remote => {
      if (remote.status !== 'completed') return false;
      if (remote.title !== localTask.title) return false;
      if (!remote.notes?.includes('[Archived History of Recurring Task]')) return false;
      
      if (!remote.completed || !localTask.completed) return false;
      
      const remoteTime = new Date(remote.completed).getTime();
      const localTime = new Date(localTask.completed).getTime();
      
      return Math.abs(remoteTime - localTime) < 60000; 
    });
  };

  const fetchRealData = async () => {
    setLoadingText('Fetching Lists...');
    try {
      const listsResp = await window.gapi.client.tasks.tasklists.list();
      const lists = listsResp.result.items || [];
      setAllLists(lists);

      const fetchedTasks: GoogleTask[] = [];

      for (const list of lists) {
        setLoadingText(`Scanning: ${list.title}`);
        let pageToken = null;
        do {
          const tasksResp: any = await window.gapi.client.tasks.tasks.list({
            tasklist: list.id,
            showCompleted: true,
            showHidden: true,
            maxResults: 100,
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
      }

      // --- SMART ARCHIVE LOGIC ---
      setLoadingText('Analyzing history...');
      const localData = loadFromLocal();
      
      // FIX: Explicitly type the map to avoid TS errors about '{}'
      const localTasksMap = new Map<string, GoogleTask>();
      if (localData.tasks) {
        localData.tasks.forEach(t => localTasksMap.set(t.id, t));
      }

      const tasksToArchive: GoogleTask[] = [];

      // Detect Rollovers
      for (const fetchedTask of fetchedTasks) {
        const localTask = localTasksMap.get(fetchedTask.id);
        
        // CONDITION: Local says 'completed', Remote says 'needsAction'
        if (localTask && localTask.status === 'completed' && fetchedTask.status === 'needsAction') {
          
          // DEDUPLICATION CHECK
          const alreadyExists = isDuplicateArchive(localTask, fetchedTasks);
          
          if (!alreadyExists) {
             tasksToArchive.push(localTask);
          } else {
             console.log(`Skipping archive for '${localTask.title}' - already exists on server.`);
          }
        }
      }

      // Execute Writes to Google
      if (tasksToArchive.length > 0) {
        setLoadingText(`Archiving ${tasksToArchive.length} recurring tasks to Google History...`);
        await Promise.all(tasksToArchive.map(archiveTaskRemote));
      }

      fetchedTasks.sort((a, b) => 
        new Date(b.completed || b.updated || 0).getTime() - new Date(a.completed || a.updated || 0).getTime()
      );

      setAllTasks(fetchedTasks);
      saveToLocal(fetchedTasks, lists);
      setIsAuthenticated(true);

    } catch (err) {
      console.error('Fetch Error', err);
      alert('Failed to fetch. Check console.');
    } finally {
      setIsLoading(false);
    }
  };

  // --- FILTERING ---
  const filteredTasks = useMemo(() => {
    return allTasks.filter(task => {
      if (selectedListId !== 'all' && task.listId !== selectedListId) return false;
      
      const q = searchQuery.toLowerCase();
      if (q && !task.title.toLowerCase().includes(q)) return false;

      if (dateRange !== 'all') {
        const refDate = task.completed ? new Date(task.completed) : new Date(task.updated);
        const now = new Date();
        const diffDays = Math.ceil(Math.abs(now.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (dateRange === '7days' && diffDays > 7) return false;
        if (dateRange === '30days' && diffDays > 30) return false;
        if (dateRange === 'year' && diffDays > 365) return false;
      }

      return true;
    });
  }, [allTasks, selectedListId, searchQuery, dateRange]);

  const stats = useMemo(() => {
    const completed = allTasks.filter(t => t.status === 'completed');
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return {
      total: allTasks.length,
      completedTotal: completed.length,
      completedWeek: completed.filter(t => t.completed && new Date(t.completed) > oneWeekAgo).length,
      recurringCount: allTasks.filter(t => t.isRecurring).length
    };
  }, [allTasks]);

  // --- RENDER HELPERS ---
  const LoadingOverlay = () => (
    <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
      <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
      <h3 className="text-xl font-semibold text-slate-800">{loadingText}</h3>
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
          <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}>
            <LayoutDashboard className="w-5 h-5" />
            <span>Dashboard</span>
          </button>
          <button onClick={() => setActiveTab('history')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'history' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}>
            <ListTodo className="w-5 h-5" />
            <span>Task History</span>
          </button>
          <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}>
            <Settings className="w-5 h-5" />
            <span>Connection</span>
          </button>
        </nav>
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
          </div>
        </header>

        <div className="p-8">
          
          {/* DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Total Stored" value={stats.total} icon={Archive} colorClass="bg-slate-500" />
                <StatCard title="Completed (All Time)" value={stats.completedTotal} icon={CheckCircle2} colorClass="bg-green-500" />
                <StatCard title="Completed (7 Days)" value={stats.completedWeek} icon={Calendar} colorClass="bg-blue-500" />
                <StatCard title="Recurring Tracked" value={stats.recurringCount} icon={Repeat} colorClass="bg-purple-500" />
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <h3 className="font-bold text-lg text-slate-800 mb-6">Activity Heatmap</h3>
                <ActivityHeatmap tasks={allTasks} />
              </div>
            </div>
          )}

          {/* HISTORY VIEW */}
          {activeTab === 'history' && (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input 
                    type="text"
                    placeholder="Search by title..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div className="flex gap-2">
                  <select value={selectedListId} onChange={(e) => setSelectedListId(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm">
                    <option value="all">All Lists</option>
                    {allLists.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                  </select>
                  <select value={dateRange} onChange={(e) => setDateRange(e.target.value as any)} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm">
                    <option value="all">All Time</option>
                    <option value="7days">Last 7 Days</option>
                    <option value="30days">Last 30 Days</option>
                  </select>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse table-fixed">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                        <th className="px-4 py-4 w-12 text-center">Status</th>
                        <th className="px-4 py-4 w-[40%]">Task Description</th>
                        <th className="px-4 py-4 w-28">List</th>
                        <th className="px-4 py-4 w-32">Due Date</th>
                        <th className="px-4 py-4 w-32">Completed On</th>
                        <th className="px-4 py-4 w-16 text-center">Repeat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTasks.map((task) => (
                        <tr key={task.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-4 py-4 text-center">
                            {task.status === 'completed' ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto" />
                            ) : (
                              <div className="w-4 h-4 rounded-full border-2 border-slate-300 mx-auto" />
                            )}
                          </td>
                          
                          {/* Title with truncation */}
                          <td className="px-4 py-4 overflow-hidden">
                            <div className="flex flex-col">
                              <span 
                                title={task.title}
                                className={`text-sm font-medium truncate ${task.status === 'completed' ? 'text-slate-500 line-through' : 'text-slate-800'}`}
                              >
                                {task.title}
                              </span>
                              {task.notes && (
                                <span className="text-xs text-slate-400 truncate mt-0.5">{task.notes}</span>
                              )}
                              {task.isArchived && (
                                <span className="inline-flex mt-1 items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 w-fit">
                                  <Archive className="w-3 h-3 mr-1" />
                                  Archived History
                                </span>
                              )}
                            </div>
                          </td>

                          {/* List */}
                          <td className="px-4 py-4">
                            <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-600 truncate max-w-full">
                              {task.listName}
                            </span>
                          </td>

                          {/* Due Date */}
                          <td className="px-4 py-4 text-sm text-slate-600">
                            {task.due ? (
                              <div className={`flex items-center space-x-1 ${new Date(task.due) < new Date() && task.status !== 'completed' ? 'text-red-600 font-medium' : ''}`}>
                                <Clock className="w-3 h-3" />
                                <span>{new Date(task.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                              </div>
                            ) : '-'}
                          </td>

                          {/* Completed Date */}
                          <td className="px-4 py-4 text-sm text-slate-500">
                            {task.completed ? new Date(task.completed).toLocaleDateString(undefined, {
                              year: '2-digit',
                              month: 'numeric',
                              day: 'numeric'
                            }) : '-'}
                          </td>

                          {/* Recurrence */}
                          <td className="px-4 py-4 text-center">
                            {task.isRecurring && (
                              <div className="flex justify-center" title={task.recurrenceInterval || "Recurring Task"}>
                                <Repeat className="w-4 h-4 text-blue-500" />
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* SETTINGS VIEW */}
          {activeTab === 'settings' && (
             <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-500">
             <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100">
               <h2 className="text-xl font-bold text-slate-800 mb-6">Connection Settings</h2>
               
               <div className="space-y-6">
                 
                 {/* Mock Mode Toggle: Only shown in Dev Mode */}
                 {isDev && (
                   <div className="flex gap-2 bg-slate-50 p-1 rounded-lg">
                     <button onClick={() => setMode('mock')} className={`flex-1 py-2 text-sm font-medium rounded ${mode === 'mock' ? 'bg-white shadow' : 'text-slate-500'}`}>Mock Mode (Dev Only)</button>
                     <button onClick={() => setMode('live')} className={`flex-1 py-2 text-sm font-medium rounded ${mode === 'live' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Live API</button>
                   </div>
                 )}

                 {mode === 'live' && (
                   <>
                     {!isAuthenticated && (
                       <div className="bg-blue-50 p-4 rounded-lg flex gap-3">
                         <ShieldAlert className="w-5 h-5 text-blue-600 shrink-0" />
                         <div className="text-sm text-blue-800">
                           <p className="font-semibold mb-1">Credentials Required</p>
                           <p>Please enter your Google Cloud credentials below. They will be saved to your browser's local storage.</p>
                         </div>
                       </div>
                     )}

                     <div className="bg-emerald-50 p-4 rounded-lg flex gap-3 border border-emerald-100">
                        <CloudCog className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div className="text-sm text-emerald-800">
                          <p className="font-semibold mb-1">Auto-Archive Enabled</p>
                          <p>When a recurring task is completed and resets, this app will now create a permanent "History" copy in your Google Tasks account automatically.</p>
                        </div>
                     </div>

                     <div>
                       <label className="block text-sm font-medium mb-1 text-slate-700">Client ID</label>
                       <input 
                         type="text" 
                         value={clientId} 
                         onChange={(e) => setClientId(e.target.value)} 
                         placeholder="12345...apps.googleusercontent.com"
                         className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                       />
                     </div>
                     <div>
                       <label className="block text-sm font-medium mb-1 text-slate-700">API Key</label>
                       <input 
                         type="password" 
                         value={apiKey} 
                         onChange={(e) => setApiKey(e.target.value)} 
                         placeholder="AIza..."
                         className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                       />
                     </div>
                     
                     <div className="pt-2">
                        <button 
                          onClick={handleLiveConnect} 
                          disabled={!clientId || !apiKey}
                          className="w-full py-3 bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex justify-center items-center gap-2"
                        >
                          {isAuthenticated ? (
                            <>
                              <Save className="w-4 h-4" />
                              <span>Refresh Data & Update Keys</span>
                            </>
                          ) : (
                            <>
                              <ShieldAlert className="w-4 h-4" />
                              <span>Connect to Google Tasks</span>
                            </>
                          )}
                        </button>
                        <p className="text-center text-xs text-slate-400 mt-3">
                          Keys are saved locally. You may need to click Connect again if your session expires.
                        </p>
                     </div>
                   </>
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