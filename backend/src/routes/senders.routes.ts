import { Router } from 'express';
import { z } from 'zod';
import { logger } from '../lib/clients.js';
import { HttpError } from '../lib/http-error.js';
import { getAuthUserId } from '../middleware/require-auth.js';
import {
  addExistingEtherealSender,
  createEtherealSender,
  listSendersWithUsage,
  toPublicSender,
} from '../services/sender.service.js';

export const sendersRouter = Router();

sendersRouter.get('/', async (req, res) => {
  res.json({ items: await listSendersWithUsage(getAuthUserId(req)) });
});

// name = display name in the From header. email + password = an existing Ethereal account;
// leave both out to have a brand-new Ethereal account generated.
const createSenderSchema = z
  .object({
    name: z.string().trim().min(1, { error: 'Name is required' }).max(100).default('Ethereal sender'),
    email: z.email({ error: 'Enter a valid email address' }).optional(),
    password: z.string().min(1).optional(),
  })
  .refine((body) => Boolean(body.email) === Boolean(body.password), {
    error: 'Enter both the Ethereal address and its password',
    path: ['password'],
  })
  // We only connect to Ethereal's SMTP server, so other providers' addresses can never log in.
  .refine((body) => !body.email || body.email.toLowerCase().endsWith('@ethereal.email'), {
    error: 'Must be an @ethereal.email address',
    path: ['email'],
  });

// 201 with the new sender. Each sender has its own hourly limit and send gap.
sendersRouter.post('/', async (req, res) => {
  const userId = getAuthUserId(req);
  // `?? {}` so an empty POST (no JSON body) still gets the default name.
  const { name, email, password } = createSenderSchema.parse(req.body ?? {});

  if (email && password) {
    const sender = await addExistingEtherealSender(userId, name, email, password);
    res.status(201).json({ sender: toPublicSender(sender) });
    return;
  }

  try {
    const sender = await createEtherealSender(userId, name);
    res.status(201).json({ sender: toPublicSender(sender) });
  } catch (err) {
    logger.error({ err, userId }, 'Failed to create Ethereal sender');
    // 502: the failure is in the upstream Ethereal service, not in the request.
    throw new HttpError(502, 'Could not create an Ethereal account right now, please retry');
  }
});
