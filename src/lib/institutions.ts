/**
 * Bangladeshi banks and mobile financial services.
 *
 * Reference data, not schema. The account form asks what *kind* of thing is
 * being added before it asks anything else, because "Checking / Savings /
 * Digital wallet" is the ledger's vocabulary, not the user's — someone adding
 * bKash should pick bKash, not work out that it maps to DIGITAL_WALLET.
 *
 * `type` on each entry is that mapping, so the form can stay in the user's
 * language and still send the enum `createAccountSchema` expects.
 */

/** The question the form opens with. */
export type AccountKind =
  "BANK" | "MOBILE_BANKING" | "CASH" | "CARD" | "INVESTMENT" | "LOAN" | "OTHER";

export const ACCOUNT_KINDS: Array<{
  kind: AccountKind;
  label: string;
  hint: string;
}> = [
  { kind: "BANK", label: "Bank account", hint: "Savings or current account" },
  { kind: "MOBILE_BANKING", label: "Mobile banking", hint: "bKash, Nagad, Rocket" },
  { kind: "CASH", label: "Cash", hint: "Wallet, drawer, petty cash" },
  { kind: "CARD", label: "Card", hint: "Credit, debit or prepaid" },
  { kind: "INVESTMENT", label: "Investment", hint: "DPS, shares, funds" },
  { kind: "LOAN", label: "Loan or liability", hint: "Money you owe" },
  { kind: "OTHER", label: "Something else", hint: "Anything that doesn't fit" },
];

/** Scheduled commercial banks operating in Bangladesh, alphabetical. */
export const BD_BANKS = [
  "AB Bank",
  "Agrani Bank",
  "Al-Arafah Islami Bank",
  "Bangladesh Commerce Bank",
  "Bank Asia",
  "BASIC Bank",
  "Bengal Commercial Bank",
  "BRAC Bank",
  "Citizens Bank",
  "City Bank",
  "Community Bank Bangladesh",
  "Dhaka Bank",
  "Dutch-Bangla Bank",
  "Eastern Bank (EBL)",
  "EXIM Bank",
  "First Security Islami Bank",
  "Global Islami Bank",
  "HSBC Bangladesh",
  "IFIC Bank",
  "Islami Bank Bangladesh",
  "Jamuna Bank",
  "Janata Bank",
  "Meghna Bank",
  "Mercantile Bank",
  "Midland Bank",
  "Modhumoti Bank",
  "Mutual Trust Bank (MTB)",
  "National Bank",
  "NCC Bank",
  "NRB Bank",
  "NRBC Bank",
  "One Bank",
  "Padma Bank",
  "Premier Bank",
  "Prime Bank",
  "Pubali Bank",
  "Rupali Bank",
  "Shahjalal Islami Bank",
  "Shimanto Bank",
  "Social Islami Bank",
  "Sonali Bank",
  "Southeast Bank",
  "Standard Bank",
  "Standard Chartered Bangladesh",
  "Trust Bank",
  "Union Bank",
  "United Commercial Bank (UCB)",
  "Uttara Bank",
  "Woori Bank Bangladesh",
];

/** Mobile financial services, most-used first — this list is picked from, not read. */
export const BD_MOBILE_BANKING = [
  { name: "bKash", operator: "BRAC Bank" },
  { name: "Nagad", operator: "Bangladesh Post Office" },
  { name: "Rocket", operator: "Dutch-Bangla Bank" },
  { name: "Upay", operator: "UCB" },
  { name: "tap", operator: "Trust Axiata" },
  { name: "mCash", operator: "Islami Bank" },
  { name: "MyCash", operator: "Mercantile Bank" },
  { name: "OK Wallet", operator: "One Bank" },
  { name: "SureCash", operator: "Rupali Bank" },
  { name: "TeleCash", operator: "Southeast Bank" },
  { name: "Islamic Wallet", operator: "Al-Arafah Islami Bank" },
  { name: "Meghna Pay", operator: "Meghna Bank" },
];

/** Value used in a select when the list does not have the institution. */
export const OTHER_OPTION = "__other__";

/**
 * Which ledger account types a kind can be.
 *
 * A kind with a single entry skips the follow-up question entirely — asking
 * someone adding cash to choose between one option is noise.
 */
export const TYPES_FOR_KIND: Record<AccountKind, Array<[type: string, label: string]>> = {
  BANK: [
    ["SAVINGS", "Savings account"],
    ["CHECKING", "Current account"],
  ],
  MOBILE_BANKING: [["DIGITAL_WALLET", "Mobile wallet"]],
  CASH: [["CASH", "Cash"]],
  CARD: [
    ["CREDIT_CARD", "Credit card"],
    ["DEBIT_CARD", "Debit card"],
    ["PREPAID", "Prepaid card"],
  ],
  INVESTMENT: [["INVESTMENT", "Investment"]],
  LOAN: [
    ["LOAN", "Loan"],
    ["LIABILITY", "Other liability"],
  ],
  OTHER: [["OTHER", "Other"]],
};

/** Kinds whose institution is chosen from the bank list. */
export const KINDS_WITH_BANK_LIST: ReadonlySet<AccountKind> = new Set(["BANK", "CARD", "LOAN"]);

/** Bangladeshi institutions bill in taka; offering USD first would be wrong. */
export const BD_KINDS: ReadonlySet<AccountKind> = new Set(["BANK", "MOBILE_BANKING", "CARD"]);
