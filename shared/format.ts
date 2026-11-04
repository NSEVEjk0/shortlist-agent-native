export function money(minor: number | null, currency = "USD") {
  if (minor === null) return "Not confirmed";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100);
}

export function moneyInput(value: string): number {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value)) throw new Error("Enter an amount with at most two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function dateLabel(date: string | null) {
  if (!date) return "Not confirmed";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(date + "T12:00:00Z"));
}

export const FIELD_LABELS = {
  quantity: "Quantity",
  unitMinor: "Unit price",
  shippingMinor: "Shipping",
  taxMinor: "Tax",
  currency: "Currency",
  deliveryDate: "Delivery date",
} as const;
