import { useAuthStore } from '../stores/auth.store';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function doFetch(path: string, token: string | null, tenantSlug: string | null, options: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token)      headers['Authorization'] = `Bearer ${token}`;
  if (tenantSlug) headers['X-Tenant-Slug'] = tenantSlug;
  return fetch(`${BASE}${path}`, { ...options, headers });
}

async function tryRefresh(): Promise<string | null> {
  const { refreshToken, tenant, user, setAuth, clearAuth } = useAuthStore.getState();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${BASE}/api/v1/auth/refresh`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refreshToken }),
    });
    if (!res.ok) { clearAuth(); return null; }
    const data: LoginResult = await res.json();
    setAuth({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: user ?? data.user, tenant: tenant ?? data.tenant });
    return data.accessToken;
  } catch {
    clearAuth();
    return null;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean } = {},
): Promise<T> {
  const { skipAuth, ...init } = options;
  const { accessToken, tenantSlug } = useAuthStore.getState();

  let res = await doFetch(path, skipAuth ? null : accessToken, tenantSlug, init);

  // Token expirado — intentar refresh y reintentar una vez
  if (res.status === 401 && !skipAuth) {
    const newToken = await tryRefresh();
    if (newToken) {
      res = await doFetch(path, newToken, useAuthStore.getState().tenantSlug, init);
    }
  }

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({ message: res.statusText }));

  if (!res.ok) {
    throw new ApiError(res.status, body.message ?? `HTTP ${res.status}`);
  }

  return body as T;
}

// --- Auth ---
export const authApi = {
  login: (email: string, password: string, tenantSlug: string) =>
    apiFetch<LoginResult>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, tenantSlug }),
      skipAuth: true,
    }),
  refresh: (refreshToken: string) =>
    apiFetch<LoginResult>('/api/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
      skipAuth: true,
    }),
  logout: (refreshToken: string) =>
    apiFetch('/api/v1/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
};

// --- Customers ---
export const customersApi = {
  search: (q: string) =>
    apiFetch<CustomerSnapshot[]>(`/api/v1/customers?q=${encodeURIComponent(q)}&limit=10`),
};

// --- Catalog ---
export const catalogApi = {
  list: () => apiFetch<CatalogItemSnapshot[]>('/api/v1/catalog'),
};

// --- Orders ---
export const ordersApi = {
  create:  (body: CreateOrderBody)  => apiFetch<{ orderId: string; orderNumber: string; total: number }>('/api/v1/orders', { method: 'POST', body: JSON.stringify(body) }),
  confirm: (orderId: string)        => apiFetch(`/api/v1/orders/${orderId}/confirm`, { method: 'POST' }),
  cancel:  (orderId: string, reason: string) => apiFetch(`/api/v1/orders/${orderId}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  list:    (params?: string)        => apiFetch<OrderSummary[]>(`/api/v1/orders${params ? `?${params}` : ''}`),
};

// --- Billing ---
export const billingApi = {
  issueInvoice: (body: IssueInvoiceBody) =>
    apiFetch<{ invoiceId: string; invoiceNumber: string; ncf: string; total: number }>('/api/v1/billing/invoices', { method: 'POST', body: JSON.stringify(body) }),
  recordPayment: (invoiceId: string, body: RecordPaymentBody) =>
    apiFetch<{ paymentId: string; totalPaid: number; status: string }>(`/api/v1/billing/invoices/${invoiceId}/payments`, { method: 'POST', body: JSON.stringify(body) }),
};

// --- Cash ---
export const cashApi = {
  openSession: (body: OpenSessionBody) =>
    apiFetch<{ sessionId: string }>('/api/v1/cash/sessions', { method: 'POST', body: JSON.stringify(body) }),
  currentSession: (terminalId: string) =>
    apiFetch<CashSessionSnapshot>(`/api/v1/cash/sessions/current?terminalId=${terminalId}`),
  closeSession: (sessionId: string, body: CloseSessionBody) =>
    apiFetch<{ expectedCash: number; closingBalance: number; difference: number }>(`/api/v1/cash/sessions/${sessionId}/close`, { method: 'POST', body: JSON.stringify(body) }),
};

// ---- Types ----

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: { userId: string; email: string; fullName: string; mfaRequired: boolean };
  tenant: { tenantId: string; slug: string };
}

export interface CustomerSnapshot {
  customerId: string;
  customerCode: string;
  customerType: string;
  firstName?: string;
  lastName?: string;
  businessName?: string;
  phone?: string;
  email?: string;
  status: string;
}

export interface CatalogItemSnapshot {
  itemId: string;
  code: string;
  name: string;
  category?: string;
  itemType: string;
  pricingModel: { kind: string; price?: number; unitPrice?: number; pricePerKg?: number; packagePrice?: number };
  unitOfMeasure: string;
  taxRate: number;
  taxIncluded: boolean;
  active: boolean;
}

export interface OrderSummary {
  orderId:       string;
  orderNumber:   string;
  customerId:    string;
  branchId:      string;
  status:        string;
  priority:      string;
  total:         number;
  paidAmount:    number;
  paymentStatus: string;
  receivedAt:    string;
  confirmedAt?:  string;
  readyAt?:      string;
  promisedAt?:   string;
}

export interface CreateOrderBody {
  customerId: string;
  branchId: string;
  fulfillmentType?: string;
  priority?: string;
  notes?: string;
  promisedAt?: string;
  lines: Array<{
    catalogItemId: string;
    description: string;
    quantity: number;
    unitOfMeasure: string;
    unitPrice: number;
    taxRate: number;
    discount?: number;
  }>;
}

export interface IssueInvoiceBody {
  orderId: string;
  customerId: string;
  branchId: string;
  ncfType: string;
  lines: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
    taxRate: number;
  }>;
}

export interface RecordPaymentBody {
  amount: number;
  method: string;
  reference?: string;
}

export interface OpenSessionBody {
  terminalId: string;
  branchId: string;
  openingBalance: number;
  openingDenominations?: Record<string, number>;
}

export interface CloseSessionBody {
  closingBalance: number;
  differenceReason?: string;
}

export interface CashSessionSnapshot {
  sessionId: string;
  terminalId: string;
  branchId: string;
  cashierId: string;
  status: string;
  openedAt: string;
  openingBalance: number;
}
