import { EmailStatus } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { paginationSchema } from '../lib/pagination.js';
import { getAuthUserId } from '../middleware/require-auth.js';
import { getEmailDetail, getEmailStats, listEmails, TAB_STATUSES } from '../services/email.service.js';
import { searchEmails } from '../services/search.service.js';

export const emailsRouter = Router();

// Optional status filter, e.g. ?tab=sent&status=FAILED. It must be one of the tab's statuses.
const tabFilter = {
  tab: z.enum(['scheduled', 'sent']).default('scheduled'),
  status: z.enum(EmailStatus).optional(),
};
const statusMatchesTab = (query: { tab: 'scheduled' | 'sent'; status?: EmailStatus }) =>
  !query.status || TAB_STATUSES[query.tab].includes(query.status);
const statusError = { error: 'status does not belong to this tab', path: ['status'] };

const listQuerySchema = paginationSchema.extend(tabFilter).refine(statusMatchesTab, statusError);

emailsRouter.get('/', async (req, res) => {
  const { tab, status, ...pagination } = listQuerySchema.parse(req.query);
  res.json(await listEmails(getAuthUserId(req), tab, pagination, status));
});

emailsRouter.get('/stats', async (req, res) => {
  res.json(await getEmailStats(getAuthUserId(req)));
});

// tab is optional here: without it, search covers both scheduled and sent emails.
const searchQuerySchema = paginationSchema
  .extend({
    q: z.string({ error: 'q (search text) is required' }).trim().min(1, { error: 'q (search text) is required' }).max(200),
    tab: z.enum(['scheduled', 'sent']).optional(),
    status: z.enum(EmailStatus).optional(),
  })
  .refine((query) => !query.status || !query.tab || TAB_STATUSES[query.tab].includes(query.status), statusError);

emailsRouter.get('/search', async (req, res) => {
  res.json(await searchEmails(getAuthUserId(req), searchQuerySchema.parse(req.query)));
});

// Registered after /stats and /search, so those paths aren't mistaken for an id.
emailsRouter.get('/:id', async (req, res) => {
  res.json({ email: await getEmailDetail(getAuthUserId(req), req.params.id) });
});
