export function formatPrice(price) {
  if (typeof price !== "number") {
    return "Price unavailable";
  }

  return `₹${price.toLocaleString("en-IN")} / night`;
}
