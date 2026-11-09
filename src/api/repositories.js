import { http } from './client.js';

export const repositoriesApi = {
  list: () => http.get('/repositories'),
  get: (repositoryId) => http.get(`/repositories/${repositoryId}`),
  link: (path) => http.post('/repositories', { path }),
  linkMany: ({ paths, groupName }) => http.post('/repositories/bulk', { paths, groupName }),
  fetchAll: () => http.post('/repositories/fetch'),
  unlink: (repositoryId) => http.delete(`/repositories/${repositoryId}`),
  addStub: (url) => http.post('/repositories/stubs', { url }),
  clone: (repositoryId, parentPath) =>
    http.post(`/repositories/${repositoryId}/clone`, { parentPath }),
  locate: (repositoryId, path) => http.post(`/repositories/${repositoryId}/locate`, { path }),
  setGroups: (repositoryId, groupIds) =>
    http.put(`/repositories/${repositoryId}/groups`, { groupIds }),
  setColor: (repositoryId, color) => http.put(`/repositories/${repositoryId}/color`, { color }),
  listGroups: () => http.get('/repositories/groups'),
  reorderGroups: (ids) => http.put('/repositories/groups/order', { ids }),
  createGroup: (name) => http.post('/repositories/groups', { name }),
  renameGroup: (groupId, name) => http.patch(`/repositories/groups/${groupId}`, { name }),
  deleteGroup: (groupId) => http.delete(`/repositories/groups/${groupId}`),
  openMono: (groupId, branch) => http.post(`/repositories/groups/${groupId}/mono`, { branch }),
};
