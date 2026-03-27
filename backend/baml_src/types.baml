// ─── Persona & Context ───

class Persona {
  label string @description("short name like 'Junior Designer'")
  role string
  goals string[]
  frustrations string[]
  context string @description("their daily reality relevant to this problem")
  influencers string[] @description("who/what shapes their decisions")
}

class Constraint {
  statement string
  type "hard" | "soft" | "assumption"
  challengeRationale string? @description("if type is assumption, why it might not be fixed")
}

class ProblemContext {
  domain string
  persona Persona
  constraints Constraint[]
  priorContext string? @description("any additional context the user provided")
}

// ─── Stage 2: Analysis ───

class HMWAnalysis {
  originalStatement string
  implicitUser string @description("who this HMW assumes as the target")
  embeddedAssumptions string[]
  scopeLevel "too_narrow" | "too_broad" | "well_scoped"
  solutionBias string? @description("if the HMW accidentally prescribes a solution")
  underlyingTension string @description("the real conflict or insight beneath the surface")
  initialReframing string @description("a first pass at a better version, before full expansion")
}

// ─── Stage 3 & 4: Variants ───

class HMWVariant {
  statement string
  move "narrowed" | "broadened" | "shifted_user" | "reframed_constraint" | "elevated_abstraction" | "inverted" | "combined" | "decomposed"
  rationale string @description("why this reframing opens up better solution space")
}

class HMWExpansion {
  variants HMWVariant[]
  emergentTheme string? @description("pattern BAML notices across the variants it generated")
}

// ─── Session State ───

enum CandidateStatus {
  GENERATED
  SELECTED
  EDITED
  SKIPPED
  CLIPPED
}

class HMWCandidate {
  id string
  variant HMWVariant
  status CandidateStatus
  userEdits string? @description("if edited, what the user changed it to")
}

class HMWSession {
  context ProblemContext
  analysis HMWAnalysis?
  candidates HMWCandidate[]
  clippedIds string[] @description("IDs of candidates saved to final list")
  iterationCount int
}

// ─── Stage 4: Refinement Output ───

class HMWRefinement {
  newVariants HMWVariant[]
  tensions string[] @description("interesting conflicts between selected framings")
  recommendation string? @description("which framings work best together and why")
  suggestedNextMove string? @description("what kind of exploration might be most productive next")
}
