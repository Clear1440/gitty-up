import { http } from './client.js';

export const repositoriesApi = {
  list: () => http.get('/repositories'),
  get: (repositoryId) => http.get(`/repositories/${repositoryId}`),
  link: (path) => http.post('/repositories', { path }),
  unlink: (repositoryId) => http.delete(`/repositories/${repositoryId}`),
};
