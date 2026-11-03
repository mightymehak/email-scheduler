import { Router } from 'express';
import { paginationSchema } from '../lib/pagination.js';
import { getAuthUserId } from '../middleware/require-auth.js';
import { listCampaigns, scheduleCampaign, scheduleCampaignSchema } from '../services/campaign.service.js';

export const campaignsRouter = Router();

// zod .parse() throws a ZodError on bad input, which the error handler turns into a 400.
campaignsRouter.post('/schedule', async (req, res) => {
  const input = scheduleCampaignSchema.parse(req.body);
  const result = await scheduleCampaign(getAuthUserId(req), input);
  res.status(201).json(result);
});

campaignsRouter.get('/', async (req, res) => {
  const pagination = paginationSchema.parse(req.query);
  res.json(await listCampaigns(getAuthUserId(req), pagination));
});
