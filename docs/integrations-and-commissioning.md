# Integrations and commissioning

The established AMS issuer advertises ES256 and S256. Its site/action and OAuth contracts are integrated as a candidate. Live EMS sign-in remains a release gate.

| System | Required exchange | Current evidence |
| --- | --- | --- |
| PLMS | Released product, specification, BOM and change pointers | Companion contract required |
| RMS | Exact recipe and parameter references | Companion contract required |
| QMS | Release rules, quality holds and evidence decisions | Companion contract required |
| MES | Adopt exact package, execution context and acknowledgements | Copied screens remain disconnected |
| APS | Resource capabilities, route revisions and planning impact | Companion contract required |
| OMS | Authorized order context and change impact | Companion contract required |
| WMS | Material, lot and location crosswalks | WMS layout reference inspected |
| CMMS | Physical asset, calibration and maintenance status | Companion contract required |
| Edge | Exact activation, devices, signal and evidence adapters | Isolated SQLite kiosk and signed readback verified |

The native outbox separates HTTP delivery and business adoption. Configured, explicitly enabled peers use a dedicated endpoint and token. Retries preserve event IDs, use expiring leases, and stop after eight failures. Peer acknowledgements use separate HMAC keys and echo event, release, scope, package digest and consumer. A single transaction records the inbox result and changes the business status. The sandbox transport and live publishers are disabled by default.

Production owner acceptance requires exact approved endpoint versions, identity/credential scope, contract tests, owner sample exchanges, retention and reconciliation. Preserve dead-letter evidence. Review receiving state before resetting an existing event for controlled replay. No dashboard field establishes adoption by itself.

For physical commissioning, verify equipment identity, adapter firmware and capabilities, units, protocol ownership, interlocks, safety policy, calibrated reference measurements, acceptance owners, evidence freshness, exact app/configuration readback, and interruption/recovery on the authorized site. Document evidence and sign-offs separately. Confirm uncertain command and print outcomes with the authority holding actual state. The software fixture exercises package and offline mechanics without physical commissioning.
