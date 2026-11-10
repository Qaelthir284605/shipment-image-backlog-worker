import assert from "node:assert/strict";
import test from "node:test";
import { decideShipment, shipmentBatchSchema } from "../src/shipment_domain.js";

test("routes a delivered shipment without doorstep proof to exception handling", () => {
  const shipment = shipmentBatchSchema.parse({
    shipmentId: "SHP-2048",
    events: [{ type: "delivered", occurredAt: "2026-09-13T08:30:00.000Z" }],
    proofFiles: [{ imageId: "img-signature-1", kind: "signature" }]
  });
  assert.deepEqual(decideShipment(shipment), {
    state: "exception",
    reason: "delivered shipment has no doorstep proof"
  });
});
