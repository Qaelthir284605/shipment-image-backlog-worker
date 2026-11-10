import express from "express";
import { ZodError } from "zod";
import { InfraiError, infrai, shipmentQueue } from "./infrai_client.js";
import { decideShipment, shipmentBatchSchema, stableKey } from "./shipment_domain.js";

export const service = express();
service.use(express.json({ limit: "256kb" }));

service.post("/shipment-batches", async (request, response) => {
  try {
    const batch = shipmentBatchSchema.parse(request.body);
    const decision = decideShipment(batch);
    if (decision.state === "exception") {
      response.status(422).json({ shipmentId: batch.shipmentId, ...decision });
      return;
    }
    const queueJob = { shipment: batch, imageIds: decision.imageIds };
    const queued = await infrai.queue.publish(
      { queue: shipmentQueue, payload: queueJob },
      stableKey("shipment-queue", batch.shipmentId)
    );
    response.status(202).json({
      shipmentId: batch.shipmentId,
      state: "queued",
      messageId: queued.message_id
    });
  } catch (error) {
    if (error instanceof ZodError) {
      response.status(400).json({ error: "invalid_request", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.status(status).json({ error: error.code, details: error.details });
      return;
    }
    response.status(502).json({ error: "upstream_transport" });
  }
});

if (process.argv[1]?.endsWith("shipment_service.ts")) {
  const port = Number(process.env.PORT ?? 3000);
  service.listen(port, () => console.log(`Shipment intake listening on http://127.0.0.1:${port}`));
}
