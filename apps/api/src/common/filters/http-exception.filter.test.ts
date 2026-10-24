// An oversized or malformed body is rejected by the body parser with an http-errors error: it must reach the caller as a 4xx,
// never as a 500 (found by the 1 MB phone check in tests/e2e/zz-market-api.spec.ts, TC-VM-S.12).
import { test } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { HttpExceptionFilter, clientErrorStatus } from "./http-exception.filter";

function run(exception: unknown) {
  let status = 0;
  let body: Record<string, unknown> = {};
  const res = { status: (s: number) => { status = s; return { json: (b: Record<string, unknown>) => { body = b; } }; } };
  const host = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ method: "POST", url: "/x" }) }) };
  new HttpExceptionFilter().catch(exception, host as never);
  return { status, body };
}

test("a body-parser 413 stays a 413 with a plain message", () => {
  const tooLarge = Object.assign(new Error("request entity too large"), { status: 413, statusCode: 413, expose: true, type: "entity.too.large" });
  const r = run(tooLarge);
  assert.equal(r.status, 413);
  assert.equal(r.body.message, "Request body too large");
});

test("a malformed JSON body is a 400, an unknown error is still a 500 without details", () => {
  assert.equal(run(Object.assign(new SyntaxError("Unexpected token"), { status: 400, expose: true })).status, 400);
  const r = run(new Error("db password is hunter2"));
  assert.equal(r.status, 500);
  assert.equal(r.body.message, "Internal server error");
});

test("only exposed 4xx errors are treated as client errors", () => {
  assert.equal(clientErrorStatus({ status: 500, expose: true }), null);
  assert.equal(clientErrorStatus({ status: 413 }), null);
  assert.equal(clientErrorStatus({ status: 413.5, expose: true }), null);
  assert.equal(clientErrorStatus(null), null);
  assert.equal(clientErrorStatus("x"), null);
  assert.equal(run(new BadRequestException("nope")).status, 400);
});
