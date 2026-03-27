// HMW Session store — single source of truth for workshop state
// See docs/specification.md for type definitions

export interface Persona {
	label: string;
	role: string;
	goals: string[];
	frustrations: string[];
	context: string;
	influencers: string[];
}

export interface Constraint {
	statement: string;
	type: 'hard' | 'soft' | 'assumption';
	challengeRationale?: string;
}

export interface ProblemContext {
	domain: string;
	persona: Persona;
	constraints: Constraint[];
	priorContext?: string;
}

export interface HMWAnalysis {
	originalStatement: string;
	implicitUser: string;
	embeddedAssumptions: string[];
	scopeLevel: 'too_narrow' | 'too_broad' | 'well_scoped';
	solutionBias?: string;
	underlyingTension: string;
	initialReframing: string;
}

export type MoveType =
	| 'narrowed'
	| 'broadened'
	| 'shifted_user'
	| 'reframed_constraint'
	| 'elevated_abstraction'
	| 'inverted'
	| 'combined'
	| 'decomposed';

export interface HMWVariant {
	statement: string;
	move: MoveType;
	rationale: string;
}

export type CandidateStatus = 'generated' | 'selected' | 'edited' | 'skipped' | 'clipped';

export interface HMWCandidate {
	id: string;
	variant: HMWVariant;
	status: CandidateStatus;
	userEdits?: string;
}

export interface SessionState {
	persona: Persona | null;
	problemContext: ProblemContext | null;
	analysis: HMWAnalysis | null;
	candidates: HMWCandidate[];
	clippedIds: Set<string>;
	iterationCount: number;
	isStreaming: boolean;
}

// TODO: implement Svelte 5 runes-based store
