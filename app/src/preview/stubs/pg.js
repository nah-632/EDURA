// Stub for unit bundles: the modules under test must never reach the database.
export class Pool {
  constructor() { throw new Error("pg stub: database access attempted in a unit test"); }
}
export default { Pool };
