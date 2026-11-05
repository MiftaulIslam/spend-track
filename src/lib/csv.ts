/**
 * A small CSV reader.
 *
 * Bank exports are not well-behaved: descriptions contain commas, amounts
 * contain quotes, and Excel writes a BOM. This handles quoted fields, escaped
 * quotes (`""`), CRLF and the BOM, which covers every statement format I have
 * seen — and nothing more, because a full RFC-4180 parser is a dependency this
 * does not need.
 */

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export function parseCsv(input: string): ParsedCsv {
  const text = input.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;

    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  // Whatever is still buffered is the last field of the last row, unless the
  // file ended with a newline and there is nothing pending.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim() !== ""));
  const [headers = [], ...body] = nonEmpty;
  return { headers: headers.map((h) => h.trim()), rows: body };
}

/** Column roles the importer can fill. */
export type ColumnRole = "date" | "description" | "amount" | "debit" | "credit" | "ignore";

const PATTERNS: Array<[ColumnRole, RegExp]> = [
  ["date", /^(date|transaction date|posting date|value date|trans date|tarikh)/i],
  ["description", /^(description|details|narration|particulars|remarks|payee|merchant|memo)/i],
  ["debit", /^(debit|withdrawal|withdrawn|money out|paid out|dr)/i],
  ["credit", /^(credit|deposit|money in|paid in|cr)/i],
  ["amount", /^(amount|value|transaction amount|taka|bdt)/i],
];

/**
 * Guess what each column is from its header.
 *
 * A guess the user can see and correct beats a wizard that asks five questions
 * before showing anything. Debit/credit are matched before amount because a
 * statement with both is describing direction by column, not by sign.
 */
export function guessRoles(headers: string[]): ColumnRole[] {
  const used = new Set<ColumnRole>();
  return headers.map((header) => {
    for (const [role, pattern] of PATTERNS) {
      if (pattern.test(header.trim()) && !used.has(role)) {
        used.add(role);
        return role;
      }
    }
    return "ignore" as const;
  });
}

/** Strips currency symbols, thousands separators and accounting parentheses. */
export function parseCsvAmount(raw: string): { value: string; negative: boolean } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const parenthesised = /^\((.*)\)$/.exec(trimmed);
  const body = parenthesised ? parenthesised[1]! : trimmed;

  const cleaned = body.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (!cleaned || !/\d/.test(cleaned)) return null;

  const negative = parenthesised !== null || cleaned.startsWith("-");
  return { value: cleaned.replace(/^-/, ""), negative };
}

/** Accepts the orderings banks actually emit, preferring day-first. */
export function parseCsvDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const numeric = /^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/.exec(trimmed);
  if (numeric) {
    const [, a, b, c] = numeric;
    const first = Number(a);
    const second = Number(b);
    const third = Number(c);
    // A four-digit leading group is ISO; otherwise assume day-first, which is
    // what Bangladeshi, UK and EU statements use.
    const [year, month, day] =
      String(a).length === 4 ? [first, second, third] : [third, second, first];
    const date = new Date(Date.UTC(year!, month! - 1, day!));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
