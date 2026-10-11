// Thin client for Capital One's Nessie hackathon API.
// The API key stays on the server: never put it in the React app.

const BASE = process.env.NESSIE_BASE_URL || 'https://prod-api.nessieisreal.com';
const KEY = process.env.NESSIE_API_KEY;

async function call(method, path, body) {
  if (!KEY) throw new Error('NESSIE_API_KEY is not set');
  const res = await fetch(`${BASE}${path}?key=${KEY}`, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    // Nessie explains bad fields in the body, so keep it in the error
    throw new Error(`Nessie ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

// POST responses wrap the new record as { code, message, objectCreated: {...} }
export const idOf = (r) => r?.objectCreated?._id ?? r?._id ?? null;

export const hasKey = () => Boolean(KEY);

export const createCustomer = (customer) => call('POST', '/customers', customer);
export const createAccount = (customerId, account) => call('POST', `/customers/${customerId}/accounts`, account);
export const getAccount = (accountId) => call('GET', `/accounts/${accountId}`);

export const listMerchants = () => call('GET', '/merchants');

export const createDeposit = (accountId, deposit) => call('POST', `/accounts/${accountId}/deposits`, deposit);
export const createPurchase = (accountId, purchase) => call('POST', `/accounts/${accountId}/purchases`, purchase);

export const listDeposits = (accountId) => call('GET', `/accounts/${accountId}/deposits`);
export const listPurchases = (accountId) => call('GET', `/accounts/${accountId}/purchases`);