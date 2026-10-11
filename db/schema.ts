import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

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
    originalAmountMinor: integer("original_amount_minor"),
    discountAmountMinor: integer("discount_amount_minor"),
    finalAmountMinor: integer("final_amount_minor"),
    currency: text("currency").notNull(),
    status: text("status").notNull(),
    provider: text("provider").notNull(),
    promoCodeId: text("promo_code_id"),
    campaignId: text("campaign_id"),
    pricingSnapshotJson: text("pricing_snapshot_json"),
    idempotencyPayloadJson: text("idempotency_payload_json"),
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
    promoCodeId: text("promo_code_id"),
    campaignId: text("campaign_id"),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "number" }),
    expiresAt: integer("expires_at", { mode: "number" }),
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

/**
 * New T-Skills onboarding is intentionally separate from the assessment
 * response stream. This keeps the pairwise core extensible without adding
 * legacy/Core60 fields or the removed "basic values" block.
 */
export const assessmentOnboarding = sqliteTable(
  "assessment_onboarding",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id").notNull().references(() => assessments.id),
    userId: text("user_id").notNull().references(() => users.id),
    age: integer("age").notNull(),
    educationLevel: text("education_level").notNull(),
    favoriteSubjectsJson: text("favorite_subjects_json").notNull(),
    extensionsJson: text("extensions_json").notNull().default("{}"),
    version: text("version").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("assessment_onboarding_assessment_unique").on(table.assessmentId),
    index("assessment_onboarding_user_idx").on(table.userId, table.updatedAt),
  ],
);

/**
 * Versioned facts for T-Skills v5. Base and final profiles are kept together
 * so clarification evidence can be audited without rebuilding the result.
 */
export const tSkillsTraitProfiles = sqliteTable(
  "t_skills_trait_profiles",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id").notNull().references(() => assessments.id),
    baseJson: text("base_json").notNull(),
    finalJson: text("final_json").notNull(),
    clarificationAnswersJson: text("clarification_answers_json").notNull().default("[]"),
    scoringVersion: text("scoring_version").notNull(),
    uncertaintyVersion: text("uncertainty_version").notNull(),
    clarificationVersion: text("clarification_version").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("t_skills_trait_profiles_assessment_unique").on(table.assessmentId),
    index("t_skills_trait_profiles_updated_idx").on(table.updatedAt),
  ],
);

/** Immutable uncertainty decision used to select prepared clarifications. */
export const tSkillsUncertaintySnapshots = sqliteTable(
  "t_skills_uncertainty_snapshots",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id").notNull().references(() => assessments.id),
    payloadJson: text("payload_json").notNull(),
    uncertaintyVersion: text("uncertainty_version").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [index("t_skills_uncertainty_assessment_idx").on(table.assessmentId, table.createdAt)],
);

/** Prepared trait clarification questions selected by the uncertainty engine. */
export const tSkillsClarificationQuestions = sqliteTable(
  "t_skills_clarification_questions",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id").notNull().references(() => assessments.id),
    questionId: text("question_id").notNull(),
    type: text("type").notNull(),
    payloadJson: text("payload_json").notNull(),
    selectionReasonJson: text("selection_reason_json").notNull().default("{}"),
    position: integer("position").notNull(),
    clarificationVersion: text("clarification_version").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("t_skills_clarification_question_unique").on(table.assessmentId, table.questionId),
    index("t_skills_clarification_question_assessment_idx").on(table.assessmentId, table.position),
  ],
);

/** Five-point answers for prepared trait clarification items. */
export const tSkillsClarificationAnswers = sqliteTable(
  "t_skills_clarification_answers",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id").notNull().references(() => assessments.id),
    questionId: text("question_id").notNull(),
    responseValue: integer("response_value").notNull(),
    responseTimeMs: integer("response_time_ms").notNull().default(0),
    clientSeq: integer("client_seq").notNull(),
    idempotencyKey: text("idempotency_key"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("t_skills_clarification_answer_question_unique").on(table.assessmentId, table.questionId),
    uniqueIndex("t_skills_clarification_answer_idempotency_unique").on(table.assessmentId, table.idempotencyKey),
    index("t_skills_clarification_answer_assessment_idx").on(table.assessmentId),
  ],
);

/** Deterministic career matching snapshots and final recommendations. */
export const tSkillsCareerResults = sqliteTable(
  "t_skills_career_results",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id").notNull().references(() => assessments.id),
    phase: text("phase").notNull(),
    candidatesJson: text("candidates_json").notNull(),
    recommendationsJson: text("recommendations_json").notNull().default("[]"),
    careerCatalogVersion: text("career_catalog_version").notNull(),
    careerMatchingVersion: text("career_matching_version").notNull(),
    careerTiebreakVersion: text("career_tiebreak_version").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [index("t_skills_career_results_assessment_idx").on(table.assessmentId, table.createdAt)],
);

/** Versioned, server-owned profession catalog used by the v5 matcher. */
export const tSkillsProfessions = sqliteTable(
  "t_skills_professions",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    traitWeightsJson: text("trait_weights_json").notNull(),
    subjectTagsJson: text("subject_tags_json").notNull().default("[]"),
    dimensionsJson: text("dimensions_json").notNull().default("{}"),
    rulesJson: text("rules_json").notNull().default("[]"),
    roadmapJson: text("roadmap_json").notNull(),
    active: integer("active").notNull().default(0),
    version: text("version").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("t_skills_professions_active_version_idx").on(table.active, table.version),
    index("t_skills_professions_updated_idx").on(table.updatedAt),
  ],
);

/** Optional prepared career tie-break answers. */
export const tSkillsCareerTiebreakAnswers = sqliteTable(
  "t_skills_career_tiebreak_answers",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id").notNull().references(() => assessments.id),
    questionId: text("question_id").notNull(),
    optionId: text("option_id").notNull(),
    responseTimeMs: integer("response_time_ms").notNull().default(0),
    clientSeq: integer("client_seq").notNull(),
    idempotencyKey: text("idempotency_key"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("t_skills_career_tiebreak_question_unique").on(table.assessmentId, table.questionId),
    uniqueIndex("t_skills_career_tiebreak_idempotency_unique").on(table.assessmentId, table.idempotencyKey),
    index("t_skills_career_tiebreak_assessment_idx").on(table.assessmentId),
  ],
);

/** Stores the exact narrative input/output versions after math is locked. */
export const tSkillsNarratives = sqliteTable(
  "t_skills_narratives",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id").notNull().references(() => assessments.id),
    inputJson: text("input_json").notNull(),
    outputJson: text("output_json").notNull(),
    narrativePromptVersion: text("narrative_prompt_version").notNull(),
    reportVersion: text("report_version").notNull(),
    provider: text("provider").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [uniqueIndex("t_skills_narratives_assessment_unique").on(table.assessmentId)],
);

/** Server-snapshotted A/B/C/D questions for the new career layer. */
export const careerAdaptiveQuestions = sqliteTable(
  "career_adaptive_questions",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id").notNull().references(() => assessments.id),
    questionId: text("question_id").notNull(),
    prompt: text("prompt").notNull(),
    optionsJson: text("options_json").notNull(),
    rationaleInternal: text("rationale_internal"),
    source: text("source").notNull(),
    provider: text("provider"),
    modelId: text("model_id"),
    promptVersion: text("prompt_version").notNull(),
    adaptiveVersion: text("adaptive_version").notNull(),
    validationStatus: text("validation_status").notNull(),
    questionHash: text("question_hash").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("career_adaptive_questions_assessment_question_unique").on(table.assessmentId, table.questionId),
    index("career_adaptive_questions_assessment_idx").on(table.assessmentId),
  ],
);

/** A/B/C/D answers are text identifiers, not numeric personality scores. */
export const careerAdaptiveAnswers = sqliteTable(
  "career_adaptive_answers",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id").notNull().references(() => assessments.id),
    questionId: text("question_id").notNull(),
    answerId: text("answer_id").notNull(),
    responseTimeMs: integer("response_time_ms").notNull().default(0),
    clientSeq: integer("client_seq").notNull(),
    idempotencyKey: text("idempotency_key"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("career_adaptive_answers_assessment_question_unique").on(table.assessmentId, table.questionId),
    uniqueIndex("career_adaptive_answers_idempotency_unique").on(table.assessmentId, table.idempotencyKey),
    index("career_adaptive_answers_assessment_idx").on(table.assessmentId),
  ],
);

/** Initial/final deterministic career shortlist snapshots. */
export const careerMatchSnapshots = sqliteTable(
  "career_match_snapshots",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id").notNull().references(() => assessments.id),
    phase: text("phase").notNull(),
    candidatesJson: text("candidates_json").notNull(),
    matchingVersion: text("matching_version").notNull(),
    careerCatalogVersion: text("career_catalog_version").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("career_match_snapshots_assessment_idx").on(table.assessmentId, table.createdAt),
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
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadataJson: text("metadata_json"),
    reason: text("reason"),
    requestId: text("request_id"),
    ipHash: text("ip_hash"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("audit_events_entity_idx").on(table.entityType, table.entityId),
    index("audit_events_created_idx").on(table.createdAt),
  ],
);

/** Server-owned admin roles. Permission names are allowlisted in code. */
export const adminRoles = sqliteTable(
  "admin_roles",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [uniqueIndex("admin_roles_name_unique").on(table.name)],
);

export const adminRoleAssignments = sqliteTable(
  "admin_role_assignments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    roleId: text("role_id").notNull().references(() => adminRoles.id),
    assignedBy: text("assigned_by").references(() => users.id),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    disabledAt: integer("disabled_at", { mode: "number" }),
  },
  (table) => [
    // SQLite considers every NULL distinct in a normal unique index.  The
    // partial index is the actual invariant: a user may hold a role once
    // while it is active, and may receive it again after revocation.
    uniqueIndex("admin_role_assignments_one_active_unique").on(table.userId, table.roleId).where(sql`${table.disabledAt} IS NULL`),
    index("admin_role_assignments_user_idx").on(table.userId, table.disabledAt),
  ],
);

export const promoCodes = sqliteTable(
  "promo_codes",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    discountType: text("discount_type").notNull(),
    discountValue: integer("discount_value").notNull(),
    currency: text("currency").notNull(),
    maxTotalUses: integer("max_total_uses"),
    maxUsesPerUser: integer("max_uses_per_user"),
    validFrom: integer("valid_from", { mode: "number" }),
    validUntil: integer("valid_until", { mode: "number" }),
    minimumOrderAmount: integer("minimum_order_amount"),
    newUsersOnly: integer("new_users_only").notNull().default(0),
    allowedTestIdsJson: text("allowed_test_ids_json").notNull().default("[]"),
    allowedEmailDomainsJson: text("allowed_email_domains_json").notNull().default("[]"),
    allowedUserIdsJson: text("allowed_user_ids_json").notNull().default("[]"),
    campaignId: text("campaign_id"),
    status: text("status").notNull().default("ACTIVE"),
    createdBy: text("created_by").notNull().references(() => users.id),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedBy: text("updated_by").notNull().references(() => users.id),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("promo_codes_code_unique").on(table.code),
    index("promo_codes_status_idx").on(table.status, table.validFrom, table.validUntil),
    index("promo_codes_campaign_idx").on(table.campaignId),
  ],
);

export const campaigns = sqliteTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    clientName: text("client_name").notNull(),
    clientType: text("client_type").notNull(),
    internalNotes: text("internal_notes").notNull().default(""),
    status: text("status").notNull().default("ACTIVE"),
    seatLimit: integer("seat_limit").notNull(),
    seatUsagePolicy: text("seat_usage_policy").notNull().default("ONE_PER_USER"),
    validFrom: integer("valid_from", { mode: "number" }),
    validUntil: integer("valid_until", { mode: "number" }),
    defaultTestId: text("default_test_id").notNull(),
    createdBy: text("created_by").notNull().references(() => users.id),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("campaigns_status_idx").on(table.status, table.validFrom, table.validUntil),
    index("campaigns_client_idx").on(table.clientName),
  ],
);

export const campaignMembers = sqliteTable(
  "campaign_members",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").notNull().references(() => campaigns.id),
    userId: text("user_id").notNull().references(() => users.id),
    entitlementId: text("entitlement_id").references(() => entitlements.id),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("campaign_members_campaign_user_unique").on(table.campaignId, table.userId),
    index("campaign_members_user_idx").on(table.userId, table.createdAt),
  ],
);

export const campaignSeatReservations = sqliteTable(
  "campaign_seat_reservations",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").notNull().references(() => campaigns.id),
    userId: text("user_id").notNull().references(() => users.id),
    orderId: text("order_id").notNull().references(() => orders.id),
    checkoutSessionId: text("checkout_session_id"),
    status: text("status").notNull().default("RESERVED"),
    reservedAt: integer("reserved_at", { mode: "number" }).notNull(),
    expiresAt: integer("expires_at", { mode: "number" }).notNull(),
    claimedAt: integer("claimed_at", { mode: "number" }),
    releasedAt: integer("released_at", { mode: "number" }),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("campaign_seat_reservations_order_unique").on(table.orderId),
    index("campaign_seat_reservations_campaign_status_idx").on(table.campaignId, table.status, table.expiresAt),
    index("campaign_seat_reservations_user_campaign_idx").on(table.userId, table.campaignId),
    index("campaign_seat_reservations_checkout_session_idx").on(table.checkoutSessionId),
  ],
);

export const promoRedemptions = sqliteTable(
  "promo_redemptions",
  {
    id: text("id").primaryKey(),
    promoCodeId: text("promo_code_id").notNull().references(() => promoCodes.id),
    userId: text("user_id").notNull().references(() => users.id),
    orderId: text("order_id").notNull().references(() => orders.id),
    campaignId: text("campaign_id"),
    originalAmountMinor: integer("original_amount_minor").notNull(),
    discountAmountMinor: integer("discount_amount_minor").notNull(),
    finalAmountMinor: integer("final_amount_minor").notNull(),
    currency: text("currency").notNull(),
    // A paid checkout reserves a code first.  It is redeemed only after a
    // verified payment event; failed/abandoned sessions release it.
    reservedAt: integer("reserved_at", { mode: "number" }),
    reservationExpiresAt: integer("reservation_expires_at", { mode: "number" }),
    releasedAt: integer("released_at", { mode: "number" }),
    redeemedAt: integer("redeemed_at", { mode: "number" }).notNull(),
    status: text("status").notNull().default("REDEEMED"),
  },
  (table) => [
    uniqueIndex("promo_redemptions_order_unique").on(table.promoCodeId, table.orderId),
    index("promo_redemptions_promo_date_idx").on(table.promoCodeId, table.redeemedAt),
    index("promo_redemptions_reservation_idx").on(table.promoCodeId, table.status, table.reservationExpiresAt),
    index("promo_redemptions_user_idx").on(table.userId, table.redeemedAt),
  ],
);

export const contentEntries = sqliteTable(
  "content_entries",
  {
    id: text("id").primaryKey(),
    contentKey: text("content_key").notNull(),
    locale: text("locale").notNull(),
    currentVersion: integer("current_version").notNull().default(0),
    publishedVersion: integer("published_version"),
    updatedBy: text("updated_by").notNull().references(() => users.id),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("content_entries_key_locale_unique").on(table.contentKey, table.locale),
    index("content_entries_locale_idx").on(table.locale),
  ],
);

export const contentVersions = sqliteTable(
  "content_versions",
  {
    id: text("id").primaryKey(),
    contentKey: text("content_key").notNull(),
    locale: text("locale").notNull(),
    version: integer("version").notNull(),
    payloadJson: text("payload_json").notNull(),
    status: text("status").notNull().default("DRAFT"),
    createdBy: text("created_by").notNull().references(() => users.id),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    publishedBy: text("published_by").references(() => users.id),
    publishedAt: integer("published_at", { mode: "number" }),
  },
  (table) => [
    uniqueIndex("content_versions_key_locale_version_unique").on(table.contentKey, table.locale, table.version),
    index("content_versions_status_idx").on(table.status, table.createdAt),
  ],
);

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    testId: text("test_id").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    updatedBy: text("updated_by").notNull().references(() => users.id),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [uniqueIndex("products_test_unique").on(table.testId)],
);

export const pricingVersions = sqliteTable(
  "pricing_versions",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull().references(() => products.id),
    version: integer("version").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull().default("CURRENT"),
    createdBy: text("created_by").notNull().references(() => users.id),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [uniqueIndex("pricing_versions_product_version_unique").on(table.productId, table.version)],
);

export const assessmentVersions = sqliteTable(
  "assessment_versions",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    version: text("version").notNull(),
    status: text("status").notNull(),
    publishedAt: integer("published_at", { mode: "number" }),
    retiredAt: integer("retired_at", { mode: "number" }),
    scoringVersion: text("scoring_version").notNull(),
    contentVersion: text("content_version").notNull(),
    careerModelVersion: text("career_model_version").notNull(),
    reportVersion: text("report_version").notNull(),
    adaptiveVersion: text("adaptive_version"),
    itemCount: integer("item_count").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("assessment_versions_product_version_unique").on(table.productId, table.version),
    index("assessment_versions_status_idx").on(table.productId, table.status, table.publishedAt),
  ],
);

export const careerModelVersions = sqliteTable(
  "career_model_versions",
  {
    id: text("id").primaryKey(),
    version: text("version").notNull(),
    status: text("status").notNull().default("DRAFT"),
    configJson: text("config_json").notNull(),
    createdBy: text("created_by").notNull().references(() => users.id),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    publishedAt: integer("published_at", { mode: "number" }),
  },
  (table) => [uniqueIndex("career_model_versions_version_unique").on(table.version)],
);

export const careerCatalogVersions = sqliteTable(
  "career_catalog_versions",
  {
    id: text("id").primaryKey(),
    version: text("version").notNull(),
    status: text("status").notNull().default("DRAFT"),
    createdBy: text("created_by").notNull().references(() => users.id),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    publishedAt: integer("published_at", { mode: "number" }),
  },
  (table) => [uniqueIndex("career_catalog_versions_version_unique").on(table.version)],
);

export const careerCatalogEntries = sqliteTable(
  "career_catalog_entries",
  {
    id: text("id").primaryKey(),
    catalogVersion: text("catalog_version").notNull(),
    slug: text("slug").notNull(),
    status: text("status").notNull().default("DRAFT"),
    titleRu: text("title_ru").notNull(),
    titleKk: text("title_kk").notNull(),
    descriptionRu: text("description_ru").notNull(),
    descriptionKk: text("description_kk").notNull(),
    category: text("category").notNull(),
    educationPathsJson: text("education_paths_json").notNull().default("[]"),
    workEnvironment: text("work_environment").notNull().default(""),
    careerTagsJson: text("career_tags_json").notNull().default("[]"),
    matchingConfigJson: text("matching_config_json").notNull().default("{}"),
    sourceVersion: text("source_version").notNull(),
    createdBy: text("created_by").notNull().references(() => users.id),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("career_catalog_entries_version_slug_unique").on(table.catalogVersion, table.slug),
    index("career_catalog_entries_status_idx").on(table.catalogVersion, table.status),
  ],
);

export const featureFlags = sqliteTable(
  "feature_flags",
  {
    key: text("key").primaryKey(),
    enabled: integer("enabled").notNull().default(0),
    danger: integer("danger").notNull().default(0),
    description: text("description").notNull().default(""),
    updatedBy: text("updated_by").notNull().references(() => users.id),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
);

export const systemSettings = sqliteTable(
  "system_settings",
  {
    key: text("key").primaryKey(),
    valueJson: text("value_json").notNull(),
    description: text("description").notNull().default(""),
    updatedBy: text("updated_by").notNull().references(() => users.id),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
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
