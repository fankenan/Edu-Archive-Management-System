import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const login = (username, password) => api.post('/auth/login', { username, password });
export const verifyToken = () => api.get('/auth/verify');
export const changePassword = (oldPassword, newPassword) => api.put('/auth/password', { oldPassword, newPassword });

// Dashboard
export const getDashboardStats = () => api.get('/dashboard/stats');

// Documents
export const getDocuments = (params) => api.get('/documents', { params });
export const getDocument = (id) => api.get(`/documents/${id}`);
export const createDocument = (data) => {
  if (data.files && data.files.length > 0) {
    const fd = buildFormData(data);
    data.files.forEach(f => fd.append('files', f));
    return api.post('/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  }
  return api.post('/documents', data);
};
export const updateDocument = (id, data) => {
  if (data.files && data.files.length > 0) {
    const fd = buildFormData(data);
    data.files.forEach(f => fd.append('files', f));
    return api.put(`/documents/${id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  }
  return api.put(`/documents/${id}`, data);
};
export const deleteDocument = (id) => api.delete(`/documents/${id}`);
export const getDocumentsDropdown = () => api.get('/documents/dropdown');

// Field Works
export const getFieldWorks = (params) => api.get('/field-works', { params });
export const getFieldWork = (id) => api.get(`/field-works/${id}`);
export const createFieldWork = (data) => {
  if (data.files && data.files.length > 0) {
    const fd = buildFormData(data);
    data.files.forEach(f => fd.append('files', f));
    return api.post('/field-works', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  }
  return api.post('/field-works', data);
};
export const updateFieldWork = (id, data) => {
  if (data.files && data.files.length > 0) {
    const fd = buildFormData(data);
    data.files.forEach(f => fd.append('files', f));
    return api.put(`/field-works/${id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  }
  return api.put(`/field-works/${id}`, data);
};
export const deleteFieldWork = (id) => api.delete(`/field-works/${id}`);

// Users (admin)
export const getUsers = () => api.get('/users');
export const createUser = (data) => api.post('/users', data);
export const updateUser = (id, data) => api.put(`/users/${id}`, data);
export const deleteUser = (id) => api.delete(`/users/${id}`);

// Project Types
export const getProjectTypes = () => api.get('/project-types');
export const createProjectType = (data) => api.post('/project-types', data);
export const updateProjectType = (id, data) => api.put(`/project-types/${id}`, data);
export const deleteProjectType = (id) => api.delete(`/project-types/${id}`);

// File Categories
export const getFileCategories = () => api.get('/file-categories');
export const createFileCategory = (data) => api.post('/file-categories', data);
export const updateFileCategory = (id, data) => api.put(`/file-categories/${id}`, data);
export const deleteFileCategory = (id) => api.delete(`/file-categories/${id}`);

// Uploaded Files
export const getUploadedFiles = (params) => api.get('/uploaded-files', { params });
export const uploadFiles = (data) => {
  const fd = new FormData();
  fd.append('category_id', data.category_id);
  if (data.is_internal) fd.append('is_internal', 'true');
  data.files.forEach(f => fd.append('files', f));
  return api.post('/uploaded-files', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
};
export const deleteUploadedFile = (id) => api.delete(`/uploaded-files/${id}`);

// Logs
export const getLogs = (params) => api.get('/logs', { params });

// Helper
function buildFormData(data) {
  const fd = new FormData();
  Object.entries(data).forEach(([k, v]) => {
    if (k !== 'file' && k !== 'files' && v != null && v !== undefined) fd.append(k, v);
  });
  if (data.file) fd.append('file', data.file);
  return fd;
}

// Preview - server-side PDF conversion for iframe display
export const getPreviewUrl = (filename, action = 'preview') =>
  api.post('/convert/preview', { filename, action }, { timeout: 120000 });

// Preview - server-side image conversion for weak devices / old browsers
export const getPreviewImages = (filename) =>
  api.post('/convert/preview/images', { filename }, { timeout: 120000 });

export function withToken(url) {
  if (!url) return url;
  const token = localStorage.getItem('token');
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${token}`;
}

export default api;
