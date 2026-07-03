import { describe, it, expect } from "vitest";
import {
  extensionForMime,
  isStaffDocumentPathAllowed,
  sanitizeDocumentFileName,
  staffDocumentFolder,
} from "./staff-document-path";

const ORG_A = "00000000-0000-0000-0000-0000000000a1";
const ORG_B = "00000000-0000-0000-0000-0000000000b1";
const STAFF_1 = "11111111-1111-1111-1111-111111111111";
const STAFF_2 = "22222222-2222-2222-2222-222222222222";

describe("staffDocumentFolder", () => {
  it("baut den Pfad korrekt", () => {
    expect(staffDocumentFolder(ORG_A, STAFF_1, "passport")).toBe(
      `${ORG_A}/${STAFF_1}/passport`,
    );
  });
});

describe("isStaffDocumentPathAllowed", () => {
  it("erlaubt gültigen Pfad", () => {
    expect(
      isStaffDocumentPathAllowed(`${ORG_A}/${STAFF_1}/passport/abc.pdf`, ORG_A, STAFF_1),
    ).toBe(true);
  });
  it("verbietet fremde staff_id", () => {
    expect(
      isStaffDocumentPathAllowed(`${ORG_A}/${STAFF_2}/passport/abc.pdf`, ORG_A, STAFF_1),
    ).toBe(false);
  });
  it("verbietet fremde org_id", () => {
    expect(
      isStaffDocumentPathAllowed(`${ORG_B}/${STAFF_1}/passport/abc.pdf`, ORG_A, STAFF_1),
    ).toBe(false);
  });
  it("verbietet .. und Backslash", () => {
    expect(
      isStaffDocumentPathAllowed(`${ORG_A}/${STAFF_1}/../x/abc.pdf`, ORG_A, STAFF_1),
    ).toBe(false);
    expect(
      isStaffDocumentPathAllowed(`${ORG_A}\\${STAFF_1}/passport/abc.pdf`, ORG_A, STAFF_1),
    ).toBe(false);
  });
  it("verbietet führenden Slash und //", () => {
    expect(
      isStaffDocumentPathAllowed(`/${ORG_A}/${STAFF_1}/passport/abc.pdf`, ORG_A, STAFF_1),
    ).toBe(false);
    expect(
      isStaffDocumentPathAllowed(`${ORG_A}//${STAFF_1}/passport/abc.pdf`, ORG_A, STAFF_1),
    ).toBe(false);
  });
  it("verbietet unbekannten doc_type", () => {
    expect(
      isStaffDocumentPathAllowed(`${ORG_A}/${STAFF_1}/secret/abc.pdf`, ORG_A, STAFF_1),
    ).toBe(false);
  });
  it("verbietet weiteres Unterverzeichnis nach doc_type", () => {
    expect(
      isStaffDocumentPathAllowed(`${ORG_A}/${STAFF_1}/passport/sub/abc.pdf`, ORG_A, STAFF_1),
    ).toBe(false);
  });
});

describe("sanitizeDocumentFileName", () => {
  it("lässt gültigen Namen durch", () => {
    expect(sanitizeDocumentFileName("Pass_2026.pdf")).toBe("Pass_2026.pdf");
  });
  it("lehnt Pfadtrenner und .. ab", () => {
    expect(sanitizeDocumentFileName("a/b")).toBeNull();
    expect(sanitizeDocumentFileName("a\\b")).toBeNull();
    expect(sanitizeDocumentFileName("../x")).toBeNull();
  });
  it("lehnt Punkt-Start und Leere ab", () => {
    expect(sanitizeDocumentFileName("")).toBeNull();
    expect(sanitizeDocumentFileName(".env")).toBeNull();
  });
});

describe("extensionForMime", () => {
  it("mappt bekannte Mimes", () => {
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("application/pdf")).toBe("pdf");
  });
  it("weist unbekannte Mimes ab", () => {
    expect(extensionForMime("text/html")).toBeNull();
  });
});