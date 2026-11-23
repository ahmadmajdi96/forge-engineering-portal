# EMS contracts

- [Factory and callback OpenAPI](ems.openapi.yaml)
- [Acknowledgement schema](acknowledgement.schema.json)
- [Edge control OpenAPI](edge-control.openapi.json)
- [Edge protocol definitions](../../src/lib/edge/protocol.ts)
- [Workspace and Studio schemas](../../src/lib/studio/model.ts)

For the acknowledgement signature, use HMAC-SHA-256 with the selected consumer's hex-decoded 32-byte key. Sign the ASCII prefix `EMS-ACK-v2\nCONSUMER\nUNIX_SECONDS\n` followed by the exact UTF-8 request bytes. Keep the timestamp within 300 seconds of the receiver. Set the matching consumer header, timestamp and lowercase hex signature. Match the release/package/scope data from the outbox event.

The published event contains `version=2`, `type=EngineeringAppPublished`, `event_id`, `site`, `release_id`, `content_hash`, and `consumer`. Retries preserve the event ID. The receiver must treat technical delivery separately from adoption, pin the exact package digest, and deduplicate its effect in a local transaction. Peer-specific transport endpoint and credentials require verified configuration.

The edge envelope uses Ed25519 with a role-specific key, documented canonical JSON, and a schema-enforced manifest. Controller requests are typed and expire. Commands with an uncertain outcome require reconciliation evidence before another physical request can be considered. Production controller adapters and alarm acknowledgement need an independently verified owning service.
