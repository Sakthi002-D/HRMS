import test from "node:test";
import assert from "node:assert/strict";
import { isDatabaseBusyError } from "./dbErrors.js";

test("pool and pooler exhaustion are recognised", () => {
    assert.equal(isDatabaseBusyError(new Error("timeout exceeded when trying to connect")), true);
    assert.equal(isDatabaseBusyError(new Error("(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15")), true);
    assert.equal(isDatabaseBusyError(Object.assign(new Error("sorry, too many clients already"), { code: "53300" })), true);
    assert.equal(isDatabaseBusyError(new Error("remaining connection slots are reserved for non-replication superuser connections")), true);
});

test("ordinary errors are not treated as busy", () => {
    assert.equal(isDatabaseBusyError(new Error('relation "shifts" does not exist')), false);
    assert.equal(isDatabaseBusyError(Object.assign(new Error("duplicate key"), { code: "23505" })), false);
    assert.equal(isDatabaseBusyError(null), false);
});
