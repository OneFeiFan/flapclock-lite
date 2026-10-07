/* 推荐方案：首次使用时方案库是空的，用户可以一键加入推荐的 18 级方案，再按需修改 */
import api from './api';

export function addRecommendedScheme() {
  return api.get('/api/schemes/recommended').then(function (r) {
    return api.post('/api/schemes', { name: r.name, levels: r.levels, endMode: r.endMode });
  });
}
