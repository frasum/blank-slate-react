/**
 * §3b-Feiertagssatz nach Original (sfnRates): 150 % nur am 1. Mai,
 * 25.12. und 26.12.; sonst 125 %.
 */
export function bavarianHolidaySurchargeRate(businessDate: string): 1.25 | 1.5 {
  const mmdd = businessDate.slice(5); // "MM-DD"
  return mmdd === "05-01" || mmdd === "12-25" || mmdd === "12-26" ? 1.5 : 1.25;
}