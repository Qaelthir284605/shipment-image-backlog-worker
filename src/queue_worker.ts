import { infrai, shipmentQueue } from "./infrai_client.js";
import { shipmentBatchSchema, stableKey } from "./shipment_domain.js";

const messageSchema = shipmentBatchSchema.pick({ shipmentId: true }).extend({
  shipment: shipmentBatchSchema,
  imageIds: shipmentBatchSchema.shape.proofFiles.element.shape.imageId.array().min(1)
}).omit({ shipmentId: true });

export async function drainOnce() {
  const delivery = await infrai.queue.consume(shipmentQueue, 10, 120);
  const started = [];
  for (const message of delivery.messages) {
    const job = messageSchema.parse(message.payload);
    const batch = await infrai.image.batch.submit(
      job.imageIds.map((image_id) => ({ image_id })),
      stableKey("image-batch", job.shipment.shipmentId)
    );
    const status = await infrai.image.batch.status(batch.id);
    started.push({
      shipmentId: job.shipment.shipmentId,
      messageId: message.message_id,
      imageIds: job.imageIds,
      batchId: batch.id,
      status: status.status
    });
  }
  return started;
}

if (process.argv[1]?.endsWith("queue_worker.ts")) {
  console.log(JSON.stringify(await drainOnce(), null, 2));
}
