/* Shared test setup. Loads .env so integration tests find DATABASE_URL. */
import "dotenv/config";

// BigInt has no JSON representation; without this, a failing assertion that
// tries to serialise a Money value throws instead of showing the diff.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};
