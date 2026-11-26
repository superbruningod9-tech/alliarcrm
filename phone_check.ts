import { normalizePhoneForDialer } from "./src/lib/whatsapp";
const nums = [
  "51988887777",
  "051988887777",
  "005551988887777",
  "+5551988887777",
  "5551988887777",
];
console.log(nums.map(n => ({ input: n, result: normalizePhoneForDialer(n) })));
