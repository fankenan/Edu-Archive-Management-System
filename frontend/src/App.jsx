import { useState, createContext, useContext, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DocumentList from './pages/DocumentList';
import DocumentDetail from './pages/DocumentDetail';
import FieldWorkList from './pages/FieldWorkList';
import FieldWorkDetail from './pages/FieldWorkDetail';
import UploadPage from './pages/UploadPage';
import UserManage from './pages/UserManage';
import ProjectTypeManage from './pages/ProjectTypeManage';
import FileCategoryManage from './pages/FileCategoryManage';
import LogList from './pages/LogList';

const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

const PAGE_TITLES = {
  '/dashboard': '工作台',
  '/documents': '收文落实',
  '/field-works': '现场工作',
  '/uploads': '资料上传',
  '/users': '用户管理',
  '/project-types': '项目类型',
  '/file-categories': '资料分类',
  '/logs': '操作日志',
};

function getTitle(pathname) {
  for (const [key, title] of Object.entries(PAGE_TITLES)) {
    if (pathname.startsWith(key)) return title;
  }
  if (pathname.startsWith('/documents/')) return '收文详情';
  if (pathname.startsWith('/field-works/')) return '工作详情';
  return '体卫艺科档案管理';
}

function getActiveKey(pathname) {
  if (pathname.startsWith('/documents')) return pathname === '/documents' ? 'documents' : 'docDetail';
  if (pathname.startsWith('/field-works')) return pathname === '/field-works' ? 'fieldWork' : 'fieldWorkDetail';
  if (pathname.startsWith('/uploads')) return 'uploads';
  if (pathname.startsWith('/users')) return 'users';
  if (pathname.startsWith('/project-types')) return 'projectTypes';
  if (pathname.startsWith('/file-categories')) return 'fileCategories';
  if (pathname.startsWith('/logs')) return 'logs';
  return 'dashboard';
}

const PAGE_MAP = {
  dashboard: '/dashboard',
  documents: '/documents',
  fieldWork: '/field-works',
  uploads: '/uploads',
  users: '/users',
  projectTypes: '/project-types',
  fileCategories: '/file-categories',
  logs: '/logs',
};

function Layout({ children }) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const title = getTitle(location.pathname);
  const activeKey = getActiveKey(location.pathname);

  const handleNavigate = (page) => {
    const path = PAGE_MAP[page] || '/dashboard';
    navigate(path);
  };

  return (
    <div className="layout">
      <Sidebar user={user} currentPage={activeKey} onNavigate={handleNavigate} onLogout={logout} />
      <div className="main-content">
        <Topbar title={title} />
        <div className="page-content">
          {children}
        </div>
      </div>
    </div>
  );
}

function ProtectedRoute({ children, adminOnly = false }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return children;
}

function DocDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  return <DocumentDetail id={parseInt(id)} onNavigate={(page, props) => {
    if (page === 'documents') navigate('/documents');
    else if (page === 'fieldWorkDetail') navigate(`/field-works/${props.id}`);
  }} />;
}

function FieldWorkDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  return <FieldWorkDetail id={parseInt(id)} onNavigate={(page, props) => {
    if (page === 'fieldWork') navigate('/field-works');
    else if (page === 'docDetail') navigate(`/documents/${props.id}`);
  }} />;
}

function DashboardPage() {
  const navigate = useNavigate();
  return <Dashboard user={useAuth().user} onNavigate={(page) => navigate(PAGE_MAP[page] || '/dashboard')} />;
}

function DocumentsPage() {
  const navigate = useNavigate();
  return <DocumentList user={useAuth().user} onNavigate={(page, props) => {
    if (page === 'docDetail') navigate(`/documents/${props.id}`);
  }} />;
}

function FieldWorksPage() {
  const navigate = useNavigate();
  return <FieldWorkList user={useAuth().user} onNavigate={(page, props) => {
    if (page === 'fieldWorkDetail') navigate(`/field-works/${props.id}`);
  }} />;
}

function UploadsPage() {
  return <UploadPage user={useAuth().user} />;
}

function AppInner() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user');
      const token = localStorage.getItem('token');
      return saved && token ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const login = (loggedInUser) => {
    setUser(loggedInUser);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const location = useLocation();
  const isLoginPage = location.pathname === '/login';

  if (!user && !isLoginPage) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login onLogin={login} />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<ProtectedRoute><Layout><DashboardPage /></Layout></ProtectedRoute>} />
        <Route path="/documents" element={<ProtectedRoute><Layout><DocumentsPage /></Layout></ProtectedRoute>} />
        <Route path="/documents/:id" element={<ProtectedRoute><Layout><DocDetailPage /></Layout></ProtectedRoute>} />
        <Route path="/field-works" element={<ProtectedRoute><Layout><FieldWorksPage /></Layout></ProtectedRoute>} />
        <Route path="/field-works/:id" element={<ProtectedRoute><Layout><FieldWorkDetailPage /></Layout></ProtectedRoute>} />
        <Route path="/uploads" element={<ProtectedRoute><Layout><UploadsPage /></Layout></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute adminOnly><Layout><UserManage /></Layout></ProtectedRoute>} />
        <Route path="/project-types" element={<ProtectedRoute adminOnly><Layout><ProjectTypeManage /></Layout></ProtectedRoute>} />
        <Route path="/file-categories" element={<ProtectedRoute adminOnly><Layout><FileCategoryManage /></Layout></ProtectedRoute>} />
        <Route path="/logs" element={<ProtectedRoute adminOnly><Layout><LogList /></Layout></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthContext.Provider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}
