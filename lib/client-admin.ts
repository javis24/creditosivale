export function canPermanentlyDeleteClient(paymentCount: unknown) {
  const count = Number(paymentCount);
  return Number.isInteger(count) && count === 0;
}
