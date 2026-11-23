import { z } from "zod";
import {
  applicationKind,
  assignmentSchema,
  compatibilitySchema,
  configValuesSchema,
  digest,
  epochMs,
  identifier,
  targetContextSchema,
} from "./assignment";

export const maximumReleaseBytes = 1_500_000;

export const revisionRefSchema = z
  .object({
    system: z.enum(["EMS", "PLMS", "RMS", "QMS", "MES", "CMMS"]),
    object: identifier,
    revision: identifier,
    digest: digest.optional(),
  })
  .strict();

export const releaseManifestSchema = z
  .object({
    version: z.literal(1),
    id: identifier,
    siteId: identifier,
    kind: applicationKind,
    studio: z
      .object({ workspace: identifier, revision: z.number().int().positive(), appId: identifier })
      .strict(),
    compatibility: compatibilitySchema,
    dependencies: z.array(revisionRefSchema).max(128),
    validationDigest: digest,
    approvalEvidence: z.array(identifier).min(1).max(10),
    publishedAt: epochMs,
    stateSchema: identifier,
    rollbackFromSchemas: z.array(identifier).max(8),
    offlinePolicy: z.enum(["online-required", "read-only-offline", "bounded-offline"]),
    maximumOfflineMs: z.number().int().min(0).max(28_800_000),
    application: z.unknown().refine((value) => value !== undefined),
  })
  .strict()
  .refine(({ offlinePolicy, maximumOfflineMs }) =>
    offlinePolicy === "bounded-offline" ? maximumOfflineMs > 0 : maximumOfflineMs === 0,
  );

export const deploymentSchema = z
  .object({
    version: z.literal(1),
    id: identifier,
    generation: z.number().int().positive().safe(),
    nodeId: identifier,
    context: targetContextSchema,
    assignment: assignmentSchema,
    issuedAt: epochMs,
    expiresAt: epochMs,
  })
  .strict()
  .refine(({ issuedAt, expiresAt }) => expiresAt > issuedAt && expiresAt - issuedAt <= 86_400_000);

export const activationSchema = z
  .object({
    version: z.literal(1),
    id: identifier,
    deploymentId: identifier,
    nodeId: identifier,
    siteId: identifier,
    releaseDigest: digest,
    action: z.enum(["activate", "rollback"]),
    issuedAt: epochMs,
    expiresAt: epochMs,
  })
  .strict()
  .refine(({ issuedAt, expiresAt }) => expiresAt > issuedAt && expiresAt - issuedAt <= 900_000);

export const runGrantSchema = z
  .object({
    version: z.literal(1),
    id: identifier,
    actor: identifier,
    deploymentId: identifier,
    releaseDigest: digest,
    nodeId: identifier,
    siteId: identifier,
    kind: applicationKind,
    authorization: z.enum(["online", "offline"]),
    issuedAt: epochMs,
    expiresAt: epochMs,
    qualityValidUntil: epochMs,
    allowedEvidence: z.array(identifier).max(64),
    references: z.array(revisionRefSchema).max(64),
  })
  .strict()
  .refine(
    ({ issuedAt, expiresAt, qualityValidUntil }) =>
      expiresAt > issuedAt && expiresAt - issuedAt <= 28_800_000 && qualityValidUntil > issuedAt,
  );

export const evidenceSchema = z
  .object({
    id: identifier,
    runId: identifier,
    category: identifier,
    observedAt: epochMs,
    values: configValuesSchema,
  })
  .strict();

export const evidenceAckSchema = z
  .object({
    version: z.literal(1),
    evidenceId: identifier,
    evidenceDigest: digest,
    nodeId: identifier,
    siteId: identifier,
    receivedAt: epochMs,
  })
  .strict();

export const deviceReadbackSchema = z
  .object({
    version: z.literal(1),
    siteId: identifier,
    nodeId: identifier,
    sequence: z.number().int().positive().safe(),
    observedAt: epochMs,
    slots: z
      .array(
        z
          .object({
            kind: applicationKind,
            status: z.enum([
              "UNKNOWN",
              "STAGED",
              "ACTIVATION_PENDING",
              "DEFERRED",
              "ACTIVE",
              "HEALTH_VERIFIED",
              "REJECTED",
              "FAILED",
              "ROLLED_BACK",
              "STALE",
            ]),
            deploymentId: identifier.nullable(),
            activeDeploymentId: identifier.nullable(),
            activeReleaseDigest: digest.nullable(),
            pendingReleaseDigest: digest.nullable(),
            activeConfigRevision: identifier.nullable(),
            inFlightRuns: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .length(2),
    unsyncedEvidence: z.number().int().nonnegative(),
  })
  .strict();

export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;
export type Deployment = z.infer<typeof deploymentSchema>;
export type Activation = z.infer<typeof activationSchema>;
export type RunGrant = z.infer<typeof runGrantSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type EvidenceAck = z.infer<typeof evidenceAckSchema>;
export type DeviceReadback = z.infer<typeof deviceReadbackSchema>;
