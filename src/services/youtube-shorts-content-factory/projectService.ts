import api from "../api.js";
import type { Project, Short, ReportData } from '../../types/youtube-shorts-content-factory/types.js';

const projectService = {
  fetchProjects: async (): Promise<Project[]> => {
    const response = await api.get('/api/projects');
    return response.data;
  },

  saveProject: async (project: Project): Promise<Project> => {
    if (project.id) {
      // Update existing project
      const response = await api.put(`/api/projects/${project.id}`, project);
      return response.data;
    } else {
      // Create new project
      const response = await api.post('/api/projects', project);
      return response.data;
    }
  },

  deleteProject: async (projectId: string): Promise<void> => {
    await api.delete(`/api/projects/${projectId}`);
  },

  fetchShorts: async (projectId: string): Promise<Short[]> => {
    const response = await api.get(`/api/projects/${projectId}/shorts`);
    return response.data;
  },

  saveShort: async (projectId: string, short: Short): Promise<Short> => {
    if (short.id) {
      // Update existing short
      const response = await api.put(`/api/projects/${projectId}/shorts/${short.id}`, short);
      return response.data;
    } else {
      // Create new short
      const response = await api.post(`/api/projects/${projectId}/shorts`, short);
      return response.data;
    }
  },

  deleteShort: async (projectId: string, shortId: string): Promise<void> => {
    await api.delete(`/api/projects/${projectId}/shorts/${shortId}`);
  },

  fetchShortsReport: async (projectId: string, shortId: string): Promise<ReportData> => {
    const response = await api.get(`/api/projects/${projectId}/shorts/${shortId}/report`);
    return response.data;
  }
};

export default projectService;
