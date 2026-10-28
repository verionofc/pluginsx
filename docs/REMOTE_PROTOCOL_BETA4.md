# SpawnerX remote protocol 1 — beta.4

The existing Ed25519 installation identity, activation credential, Better Auth
session and license ownership remain authoritative. Trial keys do not grant
remote administration. Browser routes use the LicenseServer record `id`; the
installation's persistent `serverId` remains part of signed plugin requests.

## Signed plugin requests

`POST /remote/spawnerx/plugin/{connect,poll,confirm,result,disconnect}` uses the
existing signed envelope and `Authorization: Bearer <activationCredential>`.
Every payload includes `{activationId, serverId, requestId}` from activation.
The signature includes the exact POST path, timestamp, nonce and payload digest.
The remote envelope supports at most 262144 UTF-8 characters; snapshots and
schema trees are bounded again before persistence.

- `connect`: `{actor:{executionType:"PLAYER",uuid,username},snapshot}` →
  `{sessionId,code,url,expiresAt,state:"PENDING",pollSeconds:2}`.
- `poll`: `{sessionId,operational:true,uptimeSeconds?,snapshot?}` →
  `{sessionId,state,expiresAt,leaseExpiresAt,pollSeconds:2,confirmationToken?,
  requestedBy?,operation?}`.
- `confirm`: `{sessionId,playerUuid,confirmationToken,decision:"confirm"|"reject",
  snapshot?}` → session state.
- `result`: `{sessionId,operationId,status:"APPLIED"|"AWAITING_RELOAD"|
  "RESTART_REQUIRED"|"FAILED"|"CONFLICT",message,snapshot?,backupId?}` →
  `{accepted:true,state}`. A successful result requires a fresh snapshot.
- `disconnect`: `{sessionId}` → `{state:"REVOKED"}` (explicit cancellation is
  final; a transient loss of the operational lease uses DISCONNECTED).

A snapshot is `{configHash,documents:{config,shop},capabilities,capturedAt?}`.
`configHash` is the SHA-256 digest calculated by the plugin from its actual
files. Credentials and the entire `license` subtree are never exported.
Capabilities are `{schemaVersion:1,pluginVersion,operations:["APPLY",
"PLUGIN_RELOAD","SYNC","RESTORE"],schema:{config:Node,shop:Node},defaults:
{config,shop}}`. A schema Node contains `type` (object, array, string, number,
boolean), `title`, `description`, `default`, `properties`,
`additionalProperties` (Node or false), `items`, `enum`, `minimum`, `maximum`,
`integer` and `reload` (RELOAD or RESTART), when relevant. Dynamic object keys
must match `^[A-Za-z0-9_-]{1,64}$`. The API and plugin validate both documents.

The link carries the random connection token only in its fragment:
`/server/{recordId}/spawnerx/connect#request={sessionId}&token={token}`.
Only its SHA-256 hash is stored. Opening the link grants no permissions. An
authenticated owner consumes it through explicit website approval within five
minutes. The game confirmation is bound to the original session, player UUID
and deadline using a domain-separated server HMAC; only its hash is persisted,
and signed polls can retrieve it again without creating a new code. It cannot
authorize the website and is consumed by confirmation/rejection.

## Website requests

All routes start with `/remote/spawnerx/servers/:recordId`. Session ownership
is derived from Better Auth. Mutations additionally require a trusted Origin.

- `GET /`: `{server,session,online,manageable,reason,capabilities,snapshot,draft,
  revisions,operations,history}`. `snapshot` is `{hash,documents,capturedAt}`;
  session is `{id,state,code,requestedAt,expiresAt,lastSeenAt,leaseExpiresAt,
  actor,authorizedBy?}`. Neither connection token nor game token is returned.
- `POST /authorize`: `{requestId,token,decision:"approve"|"reject"}` → `{session}`.
- `POST /draft`: `{expectedRevision:string|null,expectedHash,documents}` →
  `{revision}`. Saving is permitted only during a live authorized channel.
- `POST /operations`: `{kind:"APPLY"|"PLUGIN_RELOAD"|"SYNC"|"RESTORE",
  expectedHash,revisionId?,confirmed:true}` → `{operation}`.
- `POST /disconnect`: `{confirmed:true}` → `{session}`.
- `GET /revisions` and `GET /history` return their corresponding lists.

Revisions expose `{id,documents,baseHash,createdAt,actorId,status}`. Operations
expose `{id,kind,status,message,createdAt,completedAt?,backupId?}`. A delivered
operation includes `{id,kind,expectedHash,documents?,expiresAt}`. The only
allowed administrative commands are these four operation kinds.

## Availability and delivery

The plugin initiates HTTPS polls every two seconds; it needs no inbound port.
Only operational polls advance the ten-second management lease. A usable
license, active server authorization, matching installation credential and
current owner are revalidated at every boundary. Administrative sessions last
at most 24 hours with an eight-hour idle expiry renewed by authenticated polls.
After an expired lease, unsent operations expire and sent operations become
UNKNOWN, preserving the last confirmed state. They are never replayed after
reconnection. An already-authorized session can resume only through a fresh
operational authenticated poll; expiry/revocation requires a new handshake.

Operations have UUIDs, one in-flight operation per server, a thirty-second
delivery deadline, a snapshot hash precondition and a durable plugin journal.
The plugin backs up both files, validates, writes atomically and acknowledges
the actual result. A lost acknowledgment is retried with the same operation
ID; it does not run the action again. Acknowledgment after disconnection cannot
turn an expired operation into a claimed success. History remains readable
offline; administrative mutations are blocked.
