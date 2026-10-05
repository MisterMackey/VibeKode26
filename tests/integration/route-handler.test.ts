import { NextResponse } from "next/server";
import { expect, test } from "vitest";

// Smoke test: a route-handler-shaped function runs against real Request/Response
// objects in the node environment. Replace with real route tests once routes exist.
async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name") ?? "world";
  return NextResponse.json({ hello: name });
}

test("route handlers can be called directly with a Request", async () => {
  const response = await GET(
    new Request("http://localhost/api/hello?name=cat"),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ hello: "cat" });
});
