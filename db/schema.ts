import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    fullName: text("full_name"),
    role: text("role").notNull().default("user"),
    status: text("status").notNull().default("active"),
    locale: text("locale").notNull().default("ru"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
    deletedAt: integer("deleted_at", { mode: "number" }),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    testId: text("test_id").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull(),
    provider: text("provider").notNull(),
    providerCheckoutId: text("provider_checkout_id"),
    providerCheckoutUrl: text("provider_checkout_url"),
    providerPaymentId: text("provider_payment_id"),
    providerEventId: text("provider_event_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("orders_user_idempotency_unique").on(table.userId, table.idempotencyKey),
    index("orders_user_status_idx").on(table.userId, table.status),
    index("orders_provider_checkout_idx").on(table.providerCheckoutId),
  ],
);

export const authCredentials = sqliteTable(
  "auth_credentials",
  {
    userId: text("user_id").primaryKey().references(() => users.id),
    passwordHash: text("password_hash").notNull(),
    passwordAlgorithm: text("password_algorithm").notNull(),
    emailVerifiedAt: integer("email_verified_at", { mode: "number" }),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: integer("locked_until", { mode: "number" }),
    termsAcceptedAt: integer("terms_accepted_at", { mode: "number" }),
    privacyAcceptedAt: integer("privacy_accepted_at", { mode: "number" }),
    legalVersion: text("legal_version"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [index("auth_credentials_verified_idx").on(table.emailVerifiedAt)],
);

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "number" }).notNull(),
    expiresAt: integer("expires_at", { mode: "number" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "number" }),
  },
  (table) => [index("auth_sessions_user_idx").on(table.userId, table.expiresAt)],
);

export const authTokens = sqliteTable(
  "auth_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    type: text("type").notNull(),
    expiresAt: integer("expires_at", { mode: "number" }).notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    usedAt: integer("used_at", { mode: "number" }),
    consumptionNonce: text("consumption_nonce"),
  },
  (table) => [index("auth_tokens_user_type_idx").on(table.userId, table.type, table.expiresAt)],
);

export const authInvites = sqliteTable(
  "auth_invites",
  {
    tokenHash: text("token_hash").primaryKey(),
    email: text("email").notNull(),
    createdBy: text("created_by").notNull().references(() => users.id),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    expiresAt: integer("expires_at", { mode: "number" }).notNull(),
    usedAt: integer("used_at", { mode: "number" }),
  },
  (table) => [index("auth_invites_email_idx").on(table.email, table.expiresAt)],
);

export const entitlements = sqliteTable(
  "entitlements",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").references(() => orders.id),
    userId: text("user_id").notNull().references(() => users.id),
    testId: text("test_id").notNull(),
    grantSource: text("grant_source").notNull().default("stripe"),
    grantReference: text("grant_reference"),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "number" }),
  },
  (table) => [
    uniqueIndex("entitlements_order_unique").on(table.orderId),
    uniqueIndex("entitlements_grant_reference_unique").on(table.grantReference),
    index("entitlements_user_status_idx").on(table.userId, table.status),
  ],
);

export const assessments = sqliteTable(
  "assessments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    entitlementId: text("entitlement_id").references(() => entitlements.id),
    testId: text("test_id").notNull(),
    locale: text("locale").notNull().default("ru"),
    state: text("state").notNull(),
    versionsJson: text("versions_json").notNull(),
    adaptiveItemIdsJson: text("adaptive_item_ids_json").notNull().default("[]"),
    selectionMode: text("selection_mode"),
    adaptiveGenerationStatus: text("adaptive_generation_status").notNull().default("NOT_STARTED"),
    adaptiveProvider: text("adaptive_provider"),
    adaptiveModel: text("adaptive_model"),
    adaptivePromptVersion: text("adaptive_prompt_version"),
    adaptiveGeneratedAt: integer("adaptive_generated_at", { mode: "number" }),
    adaptiveFallbackUsed: integer("adaptive_fallback_used").notNull().default(0),
    adaptiveGenerationLock: integer("adaptive_generation_lock").notNull().default(0),
    adaptiveGenerationAttempts: integer("adaptive_generation_attempts").notNull().default(0),
    preliminaryScoreJson: text("preliminary_score_json"),
    finalScoreJson: text("final_score_json"),
    reportId: text("report_id"),
    clientSeq: integer("client_seq").notNull().default(0),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    consentedAt: integer("consented_at", { mode: "number" }),
    completedAt: integer("completed_at", { mode: "number" }),
    purgeState: text("purge_state").notNull().default("ACTIVE"),
    purgeAfter: integer("purge_after", { mode: "number" }),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("assessments_user_updated_idx").on(table.userId, table.updatedAt),
    index("assessments_state_idx").on(table.state),
    index("assessments_purge_due_idx").on(table.purgeState, table.purgeAfter),
    uniqueIndex("assessments_entitlement_unique").on(table.entitlementId),
    uniqueIndex("assessments_report_unique").on(table.reportId),
  ],
);

export const consents = sqliteTable(
  "consents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    assessmentId: text("assessment_id").notNull().references(() => assessments.id),
    consentType: text("consent_type").notNull(),
    textVersion: text("text_version").notNull(),
    privacyNoticeVersion: text("privacy_notice_version").notNull().default("privacy-2026-09"),
    purpose: text("purpose").notNull().default("developmental-assessment"),
    granted: integer("granted").notNull(),
    decidedAt: integer("decided_at", { mode: "number" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "number" }),
  },
  (table) => [
    uniqueIndex("consents_assessment_type_unique").on(table.assessmentId, table.consentType),
    index("consents_user_type_idx").on(table.userId, table.consentType, table.decidedAt),
  ],
);

export const assessmentResponses = sqliteTable(
  "assessment_responses",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id").notNull().references(() => assessments.id),
    itemId: text("item_id").notNull(),
    response: integer("response").notNull(),
    responseTimeMs: integer("response_time_ms").notNull().default(0),
    clientSeq: integer("client_seq").notNull(),
    idempotencyKey: text("idempotency_key"),
    responseSource: text("response_source").notNull().default("core"),
    presentationMetadataJson: text("presentation_metadata_json").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("assessment_responses_item_unique").on(table.assessmentId, table.itemId),
    uniqueIndex("assessment_responses_idempotency_unique").on(table.assessmentId, table.idempotencyKey),
    index("assessment_responses_assessment_idx").on(table.assessmentId),
  ],
);

export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id").notNull().references(() => assessments.id),
    userId: text("user_id").notNull().references(() => users.id),
    status: text("status").notNull(),
    scoreJson: text("score_json").notNull(),
    reportJson: text("report_json"),
    pdfKey: text("pdf_key"),
    provider: text("provider"),
    promptVersion: text("prompt_version"),
    modelId: text("model_id"),
    inputHash: text("input_hash"),
    outputHash: text("output_hash"),
    validationResult: text("validation_result"),
    errorCode: text("error_code"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("reports_assessment_unique").on(table.assessmentId),
    index("reports_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const adaptiveRuns = sqliteTable(
  "adaptive_runs",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id").notNull().references(() => assessments.id),
    selectorVersion: text("selector_version").notNull(),
    provider: text("provider").notNull(),
    modelId: text("model_id"),
    inputHash: text("input_hash").notNull(),
    outputHash: text("output_hash").notNull(),
    chosenIdsJson: text("chosen_ids_json").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    validationResult: text("validation_result").notNull(),
    fallbackReason: text("fallback_reason"),
    promptVersion: text("prompt_version").notNull().default("mercury-adaptive-v1"),
    adaptiveVersion: text("adaptive_version").notNull().default("mercury-generated-0.1"),
    providerRequestId: text("provider_request_id"),
    attemptCount: integer("attempt_count").notNull().default(0),
    promptTokens: integer("prompt_tokens"),
    outputTokens: integer("output_tokens"),
    generatedCount: integer("generated_count").notNull().default(0),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("adaptive_runs_assessment_unique").on(table.assessmentId),
    index("adaptive_runs_created_idx").on(table.createdAt),
  ],
);

export const adaptiveQuestions = sqliteTable(
  "adaptive_questions",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id").notNull().references(() => assessments.id),
    questionId: text("question_id").notNull(),
    format: text("format").notNull(),
    prompt: text("prompt").notNull(),
    optionsJson: text("options_json").notNull().default("[]"),
    targetTraitsJson: text("target_traits_json").notNull().default("[]"),
    reasonCode: text("reason_code").notNull(),
    semanticIntent: text("semantic_intent").notNull(),
    semanticCluster: text("semantic_cluster").notNull(),
    confidence: real("confidence"),
    provider: text("provider").notNull(),
    modelId: text("model_id"),
    providerRequestId: text("provider_request_id"),
    promptVersion: text("prompt_version").notNull(),
    adaptiveVersion: text("adaptive_version").notNull(),
    validationStatus: text("validation_status").notNull(),
    questionHash: text("question_hash").notNull(),
    generatedAt: integer("generated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("adaptive_questions_assessment_question_unique").on(table.assessmentId, table.questionId),
    index("adaptive_questions_assessment_idx").on(table.assessmentId),
    index("adaptive_questions_cluster_idx").on(table.semanticCluster),
  ],
);

export const paymentEvents = sqliteTable(
  "payment_events",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").references(() => orders.id),
    provider: text("provider").notNull(),
    eventType: text("event_type").notNull(),
    status: text("status").notNull(),
    payloadHash: text("payload_hash").notNull(),
    receivedAt: integer("received_at", { mode: "number" }).notNull(),
  },
  (table) => [index("payment_events_order_idx").on(table.orderId)],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadataJson: text("metadata_json"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("audit_events_entity_idx").on(table.entityType, table.entityId),
    index("audit_events_created_idx").on(table.createdAt),
  ],
);

export const telemetryEvents = sqliteTable(
  "telemetry_events",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    userId: text("user_id"),
    assessmentId: text("assessment_id"),
    metadataJson: text("metadata_json"),
    occurredAt: integer("occurred_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("telemetry_events_name_time_idx").on(table.name, table.occurredAt),
    index("telemetry_events_assessment_idx").on(table.assessmentId),
  ],
);

export const privacyRequests = sqliteTable(
  "privacy_requests",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    type: text("type").notNull(),
    status: text("status").notNull(),
    artifactKey: text("artifact_key"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    completedAt: integer("completed_at", { mode: "number" }),
  },
  (table) => [
    index("privacy_requests_user_idx").on(table.userId, table.createdAt),
  ],
);

export const rateLimits = sqliteTable(
  "rate_limits",
  {
    bucketKey: text("bucket_key").primaryKey(),
    windowStartedAt: integer("window_started_at", { mode: "number" }).notNull(),
    requestCount: integer("request_count").notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [index("rate_limits_updated_idx").on(table.updatedAt)],
);

export const purgeJobs = sqliteTable(
  "purge_jobs",
  {
    id: text("id").primaryKey(),
    targetId: text("target_id").notNull(),
    status: text("status").notNull(),
    jobVersion: text("job_version").notNull(),
    countsJson: text("counts_json").notNull().default("{}"),
    errorClass: text("error_class"),
    startedAt: integer("started_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
    completedAt: integer("completed_at", { mode: "number" }),
  },
  (table) => [
    uniqueIndex("purge_jobs_target_unique").on(table.targetId),
    index("purge_jobs_status_updated_idx").on(table.status, table.updatedAt),
  ],
);
