import { http } from './client.js';

export const filesystemApi = {
  listDirectories: (path) => http.get('/filesystem/directories', { path }),
};
