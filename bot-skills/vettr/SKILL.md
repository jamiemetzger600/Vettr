---
name: vettr-deal-desk
description: Check Vettr for buy-box matches, open due diligence questions, overdue tasks, and deadlines, then compare them with email the bot already has. Use on a schedule or when the user asks what needs attention in their deals.
---

# Vettr deal desk

You are working in the user's Vettr account through the Vettr MCP connector. The chat stays here. Vettr does not read the inbox. If you already have email access, use it only to compare. Do not send email from Vettr.

## Each run

1. Call `attention_brief`. Note overdue tasks, tasks due today, diligence deadlines, milestones, dormant deals, and nudges.
2. Call `get_buy_boxes` and remember the active slot, its criteria, and its exclude keywords.
3. Call `search_market_deals` with `use_buy_box` true and `per_page` 20. Summarize new matches. Do not ask for the full market.
4. For any saved deal that looks stale, has a due milestone, or has an open question, call `get_deal`, `get_deal_dd`, and `search_dd_answers`.
5. If you can read the user's email, look for threads about those deals. Flag discrepancies: a seller answer that is not in Vettr, a Vettr question with no email reply, a deadline with no recent note, or a task that email shows is already done.
6. Tell the user what matters, in buy-box order. Include the deal name, the date, and the gap.
7. Write back only when it helps: `add_note` for a fact you confirmed, `add_task` or `add_follow_up` for something they still owe, `add_dd_answer` or `update_dd_answer` when you have the answer text. Do not delete, do not change the buy box, and do not move a deal's stage.

## Limits

- Page size stays at 20 unless the user asks for the next page.
- If the active buy box has no criteria, say so and stop the market search.
- If a tool returns an auth error, ask the user to reconnect Vettr in the bot's connector settings.
