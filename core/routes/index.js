import { register as auth } from './auth.js';
import { register as boards } from './boards.js';
import { register as threads } from './threads.js';
import { register as posts } from './posts.js';
import { register as search } from './search.js';
import { register as admin } from './admin.js';
import { register as upload } from './upload.js';
import { register as users } from './users.js';
import { register as notifications } from './notifications.js';
import { register as reports } from './reports.js';

export function registerRoutes(router) {
  auth(router);
  boards(router);
  threads(router);
  posts(router);
  search(router);
  admin(router);
  users(router);
  notifications(router);
  reports(router);
  upload(router);
}
