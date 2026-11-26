import { normalizePhoneForDialer } from "./src/lib/whatsapp.ts";

const numbers = [
  "51988887777",
  "051988887777",
  "005551988887777",
  "+5551988887777",
  "5551988887777",
];

const results = numbers.map((n) => ({ input: n, result: normalizePhoneForDialer(n) }));
console.log(JSON.stringify(results, null, 2));
