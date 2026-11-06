import { http } from './client.js';

export const repositoriesApi = {
  list: () => http.get('/repositories'),
  get: (repositoryId) => http.get(`/repositories/${repositoryId}`),
  link: (path) => http.post('/repositories', { path }),
  linkMany: ({ paths, groupName }) => http.post('/repositories/bulk', { paths, groupName }),
  unlink: (repositoryId) => http.delete(`/repositories/${repositoryId}`),
  addStub: (url) => http.post('/repositories/stubs', { url }),
  clone: (repositoryId, parentPath) =>
    http.post(`/repositories/${repositoryId}/clone`, { parentPath }),
  locate: (repositoryId, path) => http.post(`/repositories/${repositoryId}/locate`, { path }),
  setGroup: (repositoryId, groupId) =>
    http.put(`/repositories/${repositoryId}/group`, { groupId }),
  listGroups: () => http.get('/repositories/groups'),
  createGroup: (name) => http.post('/repositories/groups', { name }),
  renameGroup: (groupId, name) => http.patch(`/repositories/groups/${groupId}`, { name }),
  deleteGroup: (groupId) => http.delete(`/repositories/groups/${groupId}`),
};
