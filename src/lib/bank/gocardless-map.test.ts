import { describe, expect, it } from "vitest";
import { mapGcTransactionsResponse, type GcTransactionsResponse } from "./gocardless-map";

function tx(over: Partial<GcTransactionsResponse["transactions"] extends infer T ? T extends { booked?: (infer U)[] | null } ? U : never : never>) {
  return over as never;
}

describe("mapGcTransactionsResponse", () => {
  it("verarbeitet nur booked, verwirft pending (skippedPending zählt)", () => {
    const res = mapGcTransactionsResponse({
      transactions: {
        booked: [
          {
            transactionId: "tx-1",
            bookingDate: "2026-01-02",
            valueDate: "2026-01-03",
            transactionAmount: { amount: "-52.30", currency: "EUR" },
            creditorName: "KAO GmbH",
            remittanceInformationUnstructured: "Rechnung 123",
          },
        ],
        pending: [
          {
            transactionId: "tx-p1",
            bookingDate: "2026-01-02",
            transactionAmount: { amount: "10.00", currency: "EUR" },
          },
        ],
      },
    });
    expect(res.rows).toHaveLength(1);
    expect(res.skippedPending).toBe(1);
    expect(res.rows[0]).toEqual({
      externalTxId: "tx-1",
      buchungstag: "2026-01-02",
      wertstellungstag: "2026-01-03",
      betragCents: -5230,
      gegenpartei: "KAO GmbH",
      verwendungszweck: "Rechnung 123",
    });
  });

  it("überspringt Zeilen ohne transactionId UND ohne internalTransactionId (skippedNoId)", () => {
    const res = mapGcTransactionsResponse({
      transactions: {
        booked: [
          {
            bookingDate: "2026-01-05",
            transactionAmount: { amount: "1.00", currency: "EUR" },
          },
          {
            internalTransactionId: "int-9",
            bookingDate: "2026-01-06",
            transactionAmount: { amount: "2.00", currency: "EUR" },
          },
        ],
      },
    });
    expect(res.skippedNoId).toBe(1);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].externalTxId).toBe("int-9");
  });

  it("verwirft Nicht-EUR und filtert stummen NaN-Betrag", () => {
    const res = mapGcTransactionsResponse({
      transactions: {
        booked: [
          {
            transactionId: "usd-1",
            bookingDate: "2026-01-02",
            transactionAmount: { amount: "10.00", currency: "USD" },
          },
          {
            transactionId: "nan-1",
            bookingDate: "2026-01-02",
            transactionAmount: { amount: "abc", currency: "EUR" },
          },
        ],
      },
    });
    expect(res.rows).toHaveLength(0);
    expect(res.skippedNoEur).toBe(2);
  });

  it("fallback Gegenpartei: creditorName → debtorName → remittanceUnstructuredArray[0]", () => {
    const res = mapGcTransactionsResponse({
      transactions: {
        booked: [
          {
            transactionId: "a",
            bookingDate: "2026-01-02",
            transactionAmount: { amount: "1.00", currency: "EUR" },
            debtorName: "Kunde X",
          },
          {
            transactionId: "b",
            bookingDate: "2026-01-02",
            transactionAmount: { amount: "1.00", currency: "EUR" },
            remittanceInformationUnstructuredArray: ["Absender Y", "Zweckzeile"],
          },
        ],
      },
    });
    expect(res.rows[0].gegenpartei).toBe("Kunde X");
    expect(res.rows[1].gegenpartei).toBe("Absender Y");
    expect(res.rows[1].verwendungszweck).toBe("Absender Y · Zweckzeile");
  });

  it("bevorzugt transactionId über internalTransactionId", () => {
    const res = mapGcTransactionsResponse({
      transactions: {
        booked: [
          {
            transactionId: "TX",
            internalTransactionId: "INT",
            bookingDate: "2026-01-02",
            transactionAmount: { amount: "1.00", currency: "EUR" },
          },
        ],
      },
    });
    expect(res.rows[0].externalTxId).toBe("TX");
  });
});