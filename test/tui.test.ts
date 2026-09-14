import { expect, test } from "bun:test"
import { label } from "../src/tui"

test("renders a compact in-progress reviewer status", () => {
  const status = label({
    reviewID: "review_test",
    rootSessionID: "ses_test",
    action: "shell",
  })

  expect(status).toBe("reviewer: reviewing shell")
})
