// One function, three providers. Pick with LLM_PROVIDER = snowflake | anthropic | mock.
//
//   complete({ system, messages, context }) -> string
//
// `messages` is [{ role: 'user' | 'assistant', content: string }].
// `context` (the parsed event summary) is only used by the mock provider.
// API keys stay on the server: never put them in the React app.

const PROVIDER = (process.env.LLM_PROVIDER || 'mock').toLowerCase();
const TIMEOUT_MS = 30_000;
const MAX_TOKENS = 700;

export const providerName = () => PROVIDER;

export async function complete({ system, messages, context }) {
  switch (PROVIDER) {
    case 'snowflake': return snowflake({ system, messages });
    case 'anthropic': return anthropic({ system, messages });
    case 'mock': return mock({ messages, context });
    default: throw new Error(`Unknown LLM_PROVIDER "${PROVIDER}". Use snowflake, anthropic or mock.`);
  }
}

async function post(url, headers, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LLM request failed (${res.status}): ${text.slice(0, 300)}`);
  return text;
}

// ---------- Snowflake Cortex REST (POST /api/v2/cortex/inference:complete) ----------
// Auth: a programmatic access token (PAT) is the quickest for a hackathon.
//   Snowsight > your user > Settings > Authentication > Programmatic access tokens.
async function snowflake({ system, messages }) {
  const account = process.env.SNOWFLAKE_ACCOUNT;      // e.g. myorg-myaccount (the one you use for Snowsight)
  const token = process.env.SNOWFLAKE_TOKEN;
  if (!account || !token) throw new Error('Set SNOWFLAKE_ACCOUNT and SNOWFLAKE_TOKEN in finance/.env');

  const host = account.includes('.snowflakecomputing.com') ? account : `${account}.snowflakecomputing.com`;
  const tokenType = process.env.SNOWFLAKE_TOKEN_TYPE || 'PROGRAMMATIC_ACCESS_TOKEN'; // or KEYPAIR_JWT / OAUTH
  const text = await post(
    `https://${host}/api/v2/cortex/inference:complete`,
    { Authorization: `Bearer ${token}`, 'X-Snowflake-Authorization-Token-Type': tokenType },
    {
      model: process.env.CORTEX_MODEL || 'llama3.3-70b',
      messages: [{ role: 'system', content: system }, ...messages],
      max_tokens: MAX_TOKENS,
      temperature: 0.3,
      stream: false,
    },
  );
  return parseCortex(text);
}

// Non-streaming replies are JSON with choices[0].message.content. If Snowflake streams anyway,
// the body is server-sent events ("data: {...}" lines), so handle both.
function parseCortex(raw) {
  const pull = (obj) => obj?.choices?.[0]?.message?.content ?? obj?.choices?.[0]?.delta?.content ?? '';
  try {
    const out = pull(JSON.parse(raw));
    if (out) return out.trim();
  } catch { /* not plain JSON, try SSE below */ }

  let out = '';
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try { out += pull(JSON.parse(payload)); } catch { /* skip malformed chunk */ }
  }
  if (!out.trim()) throw new Error(`Cortex returned no text: ${raw.slice(0, 200)}`);
  return out.trim();
}

// ---------- Anthropic Messages API (plain fetch, no SDK) ----------
async function anthropic({ system, messages }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Set ANTHROPIC_API_KEY in finance/.env');
  const text = await post(
    'https://api.anthropic.com/v1/messages',
    { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    { model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6', max_tokens: MAX_TOKENS, system, messages },
  );
  const out = (JSON.parse(text).content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  if (!out) throw new Error('Anthropic returned no text');
  return out;
}

// ---------- mock: no keys needed, answers from the numbers it was given ----------
const usd = (n) => `$${Number(n || 0).toFixed(2)}`;

function mock({ messages, context }) {
  const events = Array.isArray(context?.events) ? context.events : [];
  const focus = events.find((e) => e.id === context?.focusEventId) || events.find((e) => e.status === 'past') || events[0];
  const q = String(messages[messages.length - 1]?.content || '').toLowerCase();

  if (!focus) return '[mock] I do not have any event data yet. Create an event and record some sales, then ask again.';

  const tag = '[mock answer built from your numbers, no AI model called]';
  const sold = focus.sales?.units ?? 0;
  const top = (focus.topProducts || []).slice(0, 3);
  const unsold = focus.unsoldItems || [];

  if (/reprice|price|markdown/.test(q)) {
    if (!unsold.length) return `${tag}\n\nEverything for ${focus.name} sold or has no price data, so there is nothing to reprice.`;
    const list = unsold.slice(0, 5).map((i) => `- ${i.title} (${usd(i.price)})`).join('\n');
    return `${tag}\n\nUnsold at ${focus.name}:\n${list}\n\nThese are the first candidates to discount or bundle.`;
  }
  if (/bring|next time|stock|inventory/.test(q)) {
    const bestType = focus.byGarmentType?.[0];
    return `${tag}\n\nAt ${focus.name} you sold ${sold} item(s). ` +
      (bestType ? `${bestType.label} earned the most (${usd(bestType.revenue)}), so bring more of that. ` : '') +
      (top.length ? `Top sellers: ${top.map((p) => p.title).join(', ')}.` : 'No product data yet.');
  }
  return `${tag}\n\n${focus.name}: ${focus.sales?.orders ?? 0} order(s), ${sold} item(s), ${usd(focus.sales?.revenue)} revenue` +
    (focus.vendorFee ? ` (vendor fee ${usd(focus.vendorFee)}; revenue is not profit)` : '') + '. ' +
    (focus.sellThrough != null ? `Sell-through was ${Math.round(focus.sellThrough * 100)}%. ` : '') +
    'Ask me what to bring next time or which items to reprice.';
}
