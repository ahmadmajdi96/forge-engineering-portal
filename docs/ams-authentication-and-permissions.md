# AMS authentication and permissions

EMS catalog code `ems` maps to the Forge Engineering Portal system key in the inspected AMS seed source. Signed client identity comes from a registered confidential client plus fixed HTTPS callback `/api/ems/auth/callback`. Production deployment must confirm the issuer, actual resource catalog, site IDs, callback registration, and a representative user grant.

The application stores state, nonce and PKCE verifier for five minutes, binds the callback to an HTTP-only browser cookie, and consumes the state before exchange. It verifies ES256 against AMS JWKS, exact issuer, distinct ID/client and access/EMS audiences, expiry, time, subject, session and nonce. Access bearer values are encrypted in PostgreSQL, associated with a stable local actor and an opaque hashed browser-session token. The session ends at the earlier token expiry. A new sign-in is required after expiry. The local logout closes only the EMS session.

Each request resolves the mapped site and current exact action through AMS v2 access. There is no permission cache. The app checks the returned system and subject, and production requests fail closed while AMS is unreachable or declines access. HTTP writes require the configured exact public Origin. IAM configuration and grants are injected at runtime.

Required action keys:

| Surface | Actions |
| --- | --- |
| Factory layout | `ems.factory_layout.view`, `ems.factory_layout.edit` |
| Process design | `ems.factory_process.view`, `ems.factory_process.edit` |
| Application Studio | `ems.application_studio.view`, `ems.application_studio.edit`, `ems.application_studio.validate` |
| Releases | `ems.factory_releases.view`, `ems.factory_releases.submit`, `ems.factory_releases.approve`, `ems.factory_releases.publish` |
| Assignments | `ems.factory_assignments.view`, `ems.factory_assignments.edit` |
| Admin QA | `ems.admin_qa.view` |

Site permissions apply to the entire mapped factory partition. Use only site-wide grants for this EMS candidate. A line-level authority contract and row boundary must be implemented before granting partial-site access. Existing Supabase role rules are confined to the legacy sandbox.

The AMS candidate from the QMS thread adds nonce support. Live EMS nonce echo, account revocation and key-rotation interop require the registered client and verified deployment. Approve/publish additionally require fresh, one-use AMS evidence bound to exact hashed content, application, site, action, and reason. Production transitions remain gated until that contract is available. See the [OIDC evidence](https://openid.net/specs/openid-connect-core-1_0.html) and [live AMS discovery](https://ams.manuqube.com/.well-known/openid-configuration).
