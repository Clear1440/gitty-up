import { http } from './client.js';

export const repositoriesApi = {
  list: () => http.get('/repositories'),
  get: (repositoryId) => http.get(`/repositories/${repositoryId}`),
  link: (path) => http.post('/repositories', { path }),
  unlink: (repositoryId) => http.delete(`/repositories/${repositoryId}`),
  addStub: (url) => http.post('/repositories/stubs', { url }),
  clone: (repositoryId, parentPath) =>
    http.post(`/repositories/${repositoryId}/clone`, { parentPath }),
  locate: (repositoryId, path) => http.post(`/repositories/${repositoryId}/locate`, { path }),
};
