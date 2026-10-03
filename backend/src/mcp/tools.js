import { z } from 'zod';
import { getUserSettings } from '../controllers/userController.js';
import { getSavedDeals, getSavedDealById } from '../controllers/dealsController.js';
import {
  getCrmToday,
  getCrmSearch,
  getDealActivities,
  postQuickFollowUp
} from '../controllers/crmController.js';
import { getCrmTasksFiltered, postQuickAddTask, postDealNoteRich } from '../controllers/crmOrganizeController.js';
import { getDealDd } from '../controllers/ddController.js';
import {
  listDealAnswers,
  searchTeamAnswers,
  createDealAnswer,
  updateDealAnswer
} from '../services/ddAnswerService.js';
import { listMarketDeals, getMarketDeal } from '../routes/marketDeals.js';
import { READ_TOOLS, WRITE_TOOLS, assertToolScope, normalizeScopes } from '../lib/mcpOauth.js';
import { recordToolCall } from '../services/mcpTokenService.js';
import { buyBoxCanSearch, marketQueryFromBuyBox } from './buyBoxQuery.js';
import { currentMcp } from './context.js';
import { runHandler } from './runHandler.js';
import { compactJson, trimBuyBoxes, trimChecklist } from './trim.js';

const optStr = z.string().optional();
const optNum = z.number().optional();

export const TOOL_DEFS = [
  {
    name: 'get_buy_boxes',
    title: 'Get buy boxes',
    description:
      'Read all four buy-box slots, the active slot, criteria, exclude keywords, and search lists. Does not change them.',
    inputSchema: {},
    readOnly: true
  },
  {
    name: 'search_market_deals',
    title: 'Search market deals',
    description:
      'Search the deal feed. Set use_buy_box to apply the active buy box (price, revenue, profit, states, industries, feed search, exclude keywords). Pass explicit filters to override. Always paginated. excludeStates on the buy box are returned by get_buy_boxes but are not applied by this search.',
    inputSchema: {
      use_buy_box: z.boolean().optional().describe('Apply the active buy box'),
      search: optStr,
      source: optStr,
      state: optStr,
      min_price: optNum,
      max_price: optNum,
      min_revenue: optNum,
      max_revenue: optNum,
      min_profit: optNum,
      max_profit: optNum,
      industry: optStr,
      min_years: optNum,
      max_years: optNum,
      franchise: z.enum(['yes', 'no']).optional(),
      remote: z.enum(['yes', 'no']).optional(),
      exclude_keywords: z.array(z.string()).optional(),
      first_seen_after: optStr,
      first_seen_before: optStr,
      page: z.number().int().min(1).optional(),
      per_page: z.number().int().min(1).max(50).optional()
    },
    readOnly: true
  },
  {
    name: 'get_market_deal',
    title: 'Get a market listing',
    description: 'Read one active market listing by its numeric id.',
    inputSchema: { id: z.number().int().positive() },
    readOnly: true
  },
  {
    name: 'list_saved_deals',
    title: 'List saved deals',
    description: 'List CRM deals the user can see (personal and team). Optional stage filter.',
    inputSchema: {
      stage: optStr,
      scope: z.enum(['all', 'personal', 'team']).optional(),
      teamId: z.number().int().positive().optional()
    },
    readOnly: true
  },
  {
    name: 'attention_brief',
    title: 'Attention brief',
    description:
      'Overdue and due tasks, diligence deadlines, milestones, dormant deals, nudges, and unread alert count. Use this for a scheduled check-in. Email stays in the bot.',
    inputSchema: {},
    readOnly: true
  },
  {
    name: 'search_crm',
    title: 'Search CRM',
    description: 'Search saved deals, contacts, and tasks the user can see.',
    inputSchema: { q: z.string().min(1).max(120) },
    readOnly: true
  },
  {
    name: 'list_tasks',
    title: 'List tasks',
    description: 'List CRM tasks. Defaults to open tasks.',
    inputSchema: {
      status: z.enum(['open', 'done', 'all']).optional(),
      assignee: optStr
    },
    readOnly: true
  },
  {
    name: 'get_deal',
    title: 'Get a saved deal',
    description: 'Read one saved deal and recent notes and activities logged in Vettr.',
    inputSchema: { savedDealId: z.number().int().positive() },
    readOnly: true
  },
  {
    name: 'get_deal_dd',
    title: 'Get due diligence',
    description: 'Read the due diligence checklist, item status, and milestones for a saved deal.',
    inputSchema: { savedDealId: z.number().int().positive() },
    readOnly: true
  },
  {
    name: 'search_dd_answers',
    title: 'Search due diligence answers',
    description:
      'Search answered questions on one saved deal, or across a team. Pass savedDealId or teamId.',
    inputSchema: {
      savedDealId: z.number().int().positive().optional(),
      teamId: z.number().int().positive().optional(),
      q: optStr,
      category: optStr,
      itemId: z.number().int().positive().optional()
    },
    readOnly: true
  },
  {
    name: 'add_note',
    title: 'Add a note',
    description: 'Add a note on a saved deal. Does not send email.',
    inputSchema: {
      savedDealId: z.number().int().positive(),
      body: z.string().min(1),
      title: optStr
    },
    readOnly: false
  },
  {
    name: 'add_task',
    title: 'Add a task',
    description: 'Add a task on a saved deal. Include savedDealId, or name the deal in the text as “on DealName”.',
    inputSchema: {
      text: z.string().min(1),
      savedDealId: z.number().int().positive().optional(),
      dueAt: optStr
    },
    readOnly: false
  },
  {
    name: 'add_follow_up',
    title: 'Add a follow-up',
    description: 'Add a follow-up task. preset is tomorrow, 3days, or 1week.',
    inputSchema: {
      savedDealId: z.number().int().positive(),
      preset: z.enum(['tomorrow', '3days', '1week']).optional(),
      title: optStr,
      dueAt: optStr
    },
    readOnly: false
  },
  {
    name: 'add_dd_answer',
    title: 'Add a due diligence answer',
    description: 'Record a question and answer on a saved deal. Does not delete anything.',
    inputSchema: {
      savedDealId: z.number().int().positive(),
      question: z.string().min(1),
      answer: z.string().min(1),
      category: optStr,
      itemId: z.number().int().positive().optional(),
      source: optStr
    },
    readOnly: false
  },
  {
    name: 'update_dd_answer',
    title: 'Update a due diligence answer',
    description: 'Correct an existing due diligence answer. Does not delete it.',
    inputSchema: {
      savedDealId: z.number().int().positive(),
      answerId: z.number().int().positive(),
      answer: optStr,
      question: optStr,
      category: optStr,
      source: optStr
    },
    readOnly: false
  }
];

function textResult(data) {
  return { content: [{ type: 'text', text: JSON.stringify(compactJson(data)) }] };
}

function errorResult(message) {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error: message }) }]
  };
}

const FILTER_KEYS = [
  'search', 'source', 'state', 'industry', 'franchise', 'remote',
  'min_price', 'max_price', 'min_revenue', 'max_revenue', 'min_profit', 'max_profit',
  'min_years', 'max_years', 'first_seen_after', 'first_seen_before', 'exclude_keywords'
];

function hasExplicitFilter(args) {
  return FILTER_KEYS.some((key) => {
    const value = args?.[key];
    if (value == null || value === '') return false;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  });
}

function dealIdFromArgs(args) {
  const raw = args?.savedDealId ?? args?.dealId ?? null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function call(handler, ctx, extra) {
  const result = await runHandler(handler, { user: ctx.user, ...extra });
  if (result.status >= 400) {
    const message = result.body?.error || `Request failed (${result.status})`;
    const err = new Error(message);
    err.status = result.status;
    throw err;
  }
  return result.body;
}

function queryFromArgs(args, base = {}) {
  const query = { ...base };
  const fields = [
    'search', 'source', 'state', 'industry', 'franchise', 'remote',
    'min_price', 'max_price', 'min_revenue', 'max_revenue', 'min_profit', 'max_profit',
    'min_years', 'max_years', 'first_seen_after', 'first_seen_before'
  ];
  for (const key of fields) {
    if (args[key] != null && args[key] !== '') query[key] = String(args[key]);
  }
  if (Array.isArray(args.exclude_keywords) && args.exclude_keywords.length && !query.exclude_keywords) {
    query.exclude_keywords = JSON.stringify(args.exclude_keywords.slice(0, 40));
  }
  query.page = String(args.page || 1);
  query.per_page = String(Math.min(Math.max(Number(args.per_page) || 20, 1), 50));
  return query;
}

async function runTool(name, args, ctx) {
  switch (name) {
    case 'get_buy_boxes': {
      const settings = await call(getUserSettings, ctx);
      return trimBuyBoxes(settings);
    }
    case 'search_market_deals': {
      let query = {};
      if (args.use_buy_box) {
        const settings = await call(getUserSettings, ctx);
        const boxes = settings.buyBoxes || [];
        const slot = boxes[settings.activeBuyBoxIndex] || boxes[0];
        if (!buyBoxCanSearch(slot) && !hasExplicitFilter(args)) {
          return {
            deals: [],
            warning: 'The active buy box has no match criteria. Add criteria in Vettr or pass explicit filters.'
          };
        }
        query = marketQueryFromBuyBox(slot || {});
      }
      query = queryFromArgs(args, query);
      const hasFilter = Object.entries(query).some(([key, value]) => {
        if (key === 'page' || key === 'per_page') return false;
        return value != null && value !== '';
      });
      if (!hasFilter) {
        return { error: 'Pass use_buy_box or at least one filter. The full market list is not returned.' };
      }
      const body = await call(listMarketDeals, ctx, { query });
      return compactJson(body, { maxArray: 50, maxString: 400 });
    }
    case 'get_market_deal':
      return compactJson(await call(getMarketDeal, ctx, { params: { id: String(args.id) } }), { maxString: 1200 });
    case 'list_saved_deals': {
      const query = { scope: args.scope || 'all' };
      if (args.teamId) query.teamId = String(args.teamId);
      const body = await call(getSavedDeals, ctx, { query });
      let deals = Array.isArray(body?.deals) ? body.deals : [];
      if (args.stage) {
        const stage = String(args.stage).toLowerCase();
        deals = deals.filter((deal) => String(deal.progress_stage || '').toLowerCase() === stage);
      }
      return compactJson({ total: deals.length, deals: deals.slice(0, 50) });
    }
    case 'attention_brief':
      return compactJson(await call(getCrmToday, ctx, { query: { scope: 'all' } }), { maxArray: 15, maxString: 280 });
    case 'search_crm':
      return compactJson(await call(getCrmSearch, ctx, { query: { q: args.q } }));
    case 'list_tasks':
      return compactJson(await call(getCrmTasksFiltered, ctx, {
        query: { status: args.status || 'open', assignee: args.assignee || '' }
      }));
    case 'get_deal': {
      const id = String(args.savedDealId);
      const [deal, activity] = await Promise.all([
        call(getSavedDealById, ctx, { params: { id } }),
        call(getDealActivities, ctx, { params: { id } })
      ]);
      return compactJson({ deal: deal?.deal || deal, activity });
    }
    case 'get_deal_dd': {
      const body = await call(getDealDd, ctx, { params: { id: String(args.savedDealId) } });
      return { checklist: trimChecklist(body?.checklist || null) };
    }
    case 'search_dd_answers': {
      if (args.savedDealId) {
        return compactJson(await listDealAnswers(ctx.user.userId, args.savedDealId, {
          q: args.q || null,
          category: args.category || null,
          itemId: args.itemId || null
        }));
      }
      if (args.teamId) {
        return compactJson(await searchTeamAnswers(ctx.user.userId, args.teamId, {
          q: args.q || null,
          category: args.category || null
        }));
      }
      return { error: 'Pass savedDealId or teamId.' };
    }
    case 'add_note':
      return compactJson(await call(postDealNoteRich, ctx, {
        params: { id: String(args.savedDealId) },
        body: { body: args.body, title: args.title || null }
      }));
    case 'add_task':
      return compactJson(await call(postQuickAddTask, ctx, {
        body: { text: args.text, savedDealId: args.savedDealId || null, dueAt: args.dueAt || null }
      }));
    case 'add_follow_up':
      return compactJson(await call(postQuickFollowUp, ctx, {
        params: { id: String(args.savedDealId) },
        body: { preset: args.preset || null, title: args.title || null, dueAt: args.dueAt || null }
      }));
    case 'add_dd_answer':
      return compactJson(await createDealAnswer(ctx.user.userId, args.savedDealId, {
        question: args.question,
        answer: args.answer,
        category: args.category || null,
        itemId: args.itemId || null,
        source: args.source || null
      }));
    case 'update_dd_answer':
      return compactJson(await updateDealAnswer(ctx.user.userId, args.savedDealId, args.answerId, {
        answer: args.answer,
        question: args.question,
        category: args.category,
        source: args.source
      }));
    default:
      return { error: 'Tool is not available' };
  }
}

export async function executeTool(name, args = {}) {
  const ctx = currentMcp();
  const scopes = normalizeScopes(ctx.scopes);
  const savedDealId = dealIdFromArgs(args);
  try {
    assertToolScope(name, scopes);
  } catch (err) {
    console.warn('[mcp] tool denied', { tool: name, userId: ctx.user.userId, reason: err.message });
    await recordToolCall({
      userId: ctx.user.userId,
      clientId: ctx.clientId,
      toolName: name,
      savedDealId,
      status: 'forbidden'
    });
    return errorResult(err.message);
  }

  try {
    const data = await runTool(name, args || {}, ctx);
    if (data && data.error && !data.deals) {
      console.warn('[mcp] tool rejected', { tool: name, userId: ctx.user.userId, error: data.error });
      await recordToolCall({
        userId: ctx.user.userId,
        clientId: ctx.clientId,
        toolName: name,
        savedDealId,
        status: 'error'
      });
      return errorResult(data.error);
    }
    console.log('[mcp] tool ok', { tool: name, userId: ctx.user.userId, clientId: ctx.clientId, savedDealId });
    await recordToolCall({
      userId: ctx.user.userId,
      clientId: ctx.clientId,
      toolName: name,
      savedDealId,
      status: 'ok'
    });
    return textResult(data);
  } catch (err) {
    console.error('[mcp] tool failed', { tool: name, userId: ctx.user.userId, message: err.message });
    await recordToolCall({
      userId: ctx.user.userId,
      clientId: ctx.clientId,
      toolName: name,
      savedDealId,
      status: 'error'
    });
    return errorResult(err.message || 'Tool failed');
  }
}

const catalogNames = new Set(TOOL_DEFS.map((tool) => tool.name));
for (const name of [...READ_TOOLS, ...WRITE_TOOLS]) {
  if (!catalogNames.has(name)) {
    throw new Error(`[mcp] tool catalog missing ${name}`);
  }
}
