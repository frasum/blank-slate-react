// BK2 — GoCardless BAD API-Client (server-only).
//
// Token-Cache OHNE Timer: Modulvariablen + lazy Prüfung beim Zugriff.
// Cloudflare Workers sind zustandslos, setTimeout wäre nicht verlässlich.
// Der Cache lebt so lange, wie die Worker-Instanz lebt; verfällt sie,
// startet der nächste Aufruf mit einem frischen Token.

const BASE_URL = "https://bankaccountdata.gocardless.com/api/v2";

type CachedToken = { token: string; expiresAt: number };
let cachedToken: CachedToken | null = null;

function readCreds(): { secretId: string; secretKey: string } {
  const secretId = process.env.GOCARDLESS_BAD_SECRET_ID;
  const secretKey = process.env.GOCARDLESS_BAD_SECRET_KEY;
  if (!secretId || !secretKey) {
    throw new Error(
      "GoCardless-BAD-Credentials fehlen — bitte GOCARDLESS_BAD_SECRET_ID und GOCARDLESS_BAD_SECRET_KEY in der Lovable-Secrets-UI setzen.",
    );
  }
  return { secretId, secretKey };
}

async function fetchAccessToken(): Promise<CachedToken> {
  const { secretId, secretKey } = readCreds();
  const res = await fetch(`${BASE_URL}/token/new/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ secret_id: secretId, secret_key: secretKey }),
  });
  if (!res.ok) {
    throw new Error(`GoCardless-Token-Anforderung fehlgeschlagen (${res.status}).`);
  }
  const j = (await res.json()) as { access?: string; access_expires?: number };
  if (!j.access) throw new Error("GoCardless-Token-Antwort ohne 'access'-Feld.");
  // access_expires ist in Sekunden. 60s Puffer, damit ein Aufruf nicht mit
  // einem bereits abgelaufenen Token in die API läuft.
  const ttlSec = typeof j.access_expires === "number" && j.access_expires > 120 ? j.access_expires : 3600;
  return { token: j.access, expiresAt: Date.now() + (ttlSec - 60) * 1000 };
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;
  cachedToken = await fetchAccessToken();
  return cachedToken.token;
}

async function gcFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (res.status === 401) {
    // Token evtl. hart abgelaufen — einmal neu holen und nachversuchen.
    cachedToken = null;
    const retryToken = await getAccessToken();
    return fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${retryToken}`,
        Accept: "application/json",
      },
    });
  }
  return res;
}

async function gcJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await gcFetch(path, init);
  if (res.status === 429) throw new Error("GoCardless-Rate-Limit erreicht (429). Bitte später erneut versuchen.");
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      // egal
    }
    throw new Error(`GoCardless-Request fehlgeschlagen (${res.status}): ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

// ---- API-Kapseln --------------------------------------------------------

export type Institution = { id: string; name: string; bic?: string | null; countries?: string[] };

export async function listInstitutions(country = "DE"): Promise<Institution[]> {
  return gcJson<Institution[]>(`/institutions/?country=${encodeURIComponent(country)}`);
}

export type Agreement = {
  id: string;
  institution_id: string;
  max_historical_days: number;
  access_valid_for_days: number;
  access_scope: string[];
};

export async function createAgreement(institutionId: string): Promise<Agreement> {
  return gcJson<Agreement>(`/agreements/enduser/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      institution_id: institutionId,
      max_historical_days: 90,
      access_valid_for_days: 90,
      access_scope: ["balances", "details", "transactions"],
    }),
  });
}

export type Requisition = {
  id: string;
  status: string;
  institution_id: string;
  link: string;
  redirect: string;
  reference: string;
  agreement: string | null;
  accounts: string[];
};

export async function createRequisition(input: {
  institutionId: string;
  agreementId: string;
  redirectUrl: string;
  reference?: string;
}): Promise<Requisition> {
  return gcJson<Requisition>(`/requisitions/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      institution_id: input.institutionId,
      redirect: input.redirectUrl,
      agreement: input.agreementId,
      reference: input.reference ?? `bk2-${Date.now()}`,
      user_language: "DE",
    }),
  });
}

export async function getRequisition(id: string): Promise<Requisition> {
  return gcJson<Requisition>(`/requisitions/${encodeURIComponent(id)}/`);
}

export type AccountDetails = {
  account: {
    iban?: string | null;
    name?: string | null;
    ownerName?: string | null;
    currency?: string | null;
  };
};

export async function getAccountDetails(accountId: string): Promise<AccountDetails> {
  return gcJson<AccountDetails>(`/accounts/${encodeURIComponent(accountId)}/details/`);
}

export async function getAccountTransactions(
  accountId: string,
  dateFromIso: string,
): Promise<import("./gocardless-map").GcTransactionsResponse> {
  return gcJson<import("./gocardless-map").GcTransactionsResponse>(
    `/accounts/${encodeURIComponent(accountId)}/transactions/?date_from=${encodeURIComponent(dateFromIso)}`,
  );
}