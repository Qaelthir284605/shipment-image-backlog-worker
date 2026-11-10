import { createHash } from "node:crypto";
import { z } from "zod";

export const shipmentBatchSchema = z.object({
  shipmentId: z.string().min(1),
  events: z.array(z.object({
    type: z.enum(["picked_up", "out_for_delivery", "delivered", "exception"]),
    occurredAt: z.string().datetime()
  })).min(1),
  proofFiles: z.array(z.object({
    imageId: z.string().min(1),
    kind: z.enum(["doorstep", "signature", "label"])
  })).min(1)
}).strict();

export type ShipmentBatch = z.infer<typeof shipmentBatchSchema>;

export type ShipmentDecision =
  | { state: "ready"; imageIds: string[] }
  | { state: "exception"; reason: string };

export function decideShipment(batch: ShipmentBatch): ShipmentDecision {
  const latest = [...batch.events].sort((a, b) =>
    Date.parse(b.occurredAt) - Date.parse(a.occurredAt)
  )[0];
  if (latest.type === "exception") {
    return { state: "exception", reason: "latest shipment event is an exception" };
  }
  if (latest.type === "delivered" && !batch.proofFiles.some((file) => file.kind === "doorstep")) {
    return { state: "exception", reason: "delivered shipment has no doorstep proof" };
  }
  return { state: "ready", imageIds: batch.proofFiles.map((file) => file.imageId) };
}

export function stableKey(scope: string, shipmentId: string): string {
  return createHash("sha256").update(`${scope}:${shipmentId}`).digest("hex");
}
