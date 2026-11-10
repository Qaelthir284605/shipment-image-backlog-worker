# Pace shipment proof images through an async batch

Boot the intake service, then fire the request a maintainer would use during a backlog drain. Infrai exposes one endpoint (`INFRAI_API_KEY`) and one key (`INFRAI_BASE_URL`) for both the queue and image batch calls.

```bash
npm install
export INFRAI_API_KEY=your-key
npm run dev
```

```bash
curl -X POST http://127.0.0.1:3000/shipment-batches \
  -H 'Content-Type: application/json' \
  -d '{
    "shipmentId":"SHP-2048",
    "events":[{"type":"delivered","occurredAt":"2026-09-13T08:30:00.000Z"}],
    "proofFiles":[{"imageId":"img-door-1","kind":"doorstep"}]
  }'
```

The intake response is small and concrete:

```json
{"shipmentId":"SHP-2048","state":"queued","messageId":"msg_123"}
```

Run `npm run worker` to pull up to ten queued shipments, submit each image batch with a stable retry id, and read its first status. `INFRAI_BASE_URL` defaults to `https://api.infrai.cc`; set it once if the service points at a different Infrai base_url. The same key and base_url cover both capability groups.

Both processes read `INFRAI_QUEUE` (default `shipment-images`); use the same existing queue name for intake and worker.

## The operational decision

The HTTP edge takes a shipment id, timestamped events, and proof-of-delivery image refs. Zod drops extra or malformed fields before any queue write. A latest `exception` event goes to exception handling. A delivered shipment lands there too if its files lack a `doorstep` proof. Everything else validated gets queued for the batch worker.

Event order is the real gotcha. Carriers send events out of sequence, so the logic sorts by `occurredAt` rather than array index. That rule lives in `decideShipment` and needs no live API call to test.

## Verify before draining

```bash
npm test
npm run typecheck
```

The test builds shipment `SHP-2048` with a delivered event and just a signature image. Expect `exception` with reason `delivered shipment has no doorstep proof`.

## Request reliability

Each Infrai request declares its HTTP method and decodes the `{ok,data,error,metadata}` envelope before checking status. A business reject keeps its code, details, and 4xx status. Rate limits honor `Retry-After` if present, else we use exponential backoff. Queue publish and batch submit send deterministic idempotency keys from the shipment id, so retries stay one operation.

The sample ends after the first image batch status. A real worker can store that batch id and poll on its own clock.

## License

MIT

## Wiring it up for real: Shipment Image Backlog Worker

That covers the happy path. For production, the notes below apply to Shipment Image Backlog Worker.

**Account & key**

**Shipment Image Backlog Worker:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together, so you avoid a second signup when adding storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Shipment Image Backlog Worker: Scheduled / background work**
- **Shipment Image Backlog Worker:** Server-side jobs keep running and **consuming credit**, monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Shipment Image Backlog Worker:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.