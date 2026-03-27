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
	moveType: MoveType;
	rationale: string;
}

export type CandidateStatus = 'generated' | 'selected' | 'edited' | 'skipped' | 'clipped';

export interface HMWCandidate {
	id: string;
	variant: HMWVariant;
	status: CandidateStatus;
	userEdits?: string;
	iteration: number;
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

class SessionStore {
	persona = $state<Persona | null>(null);
	problemContext = $state<ProblemContext | null>(null);
	analysis = $state<HMWAnalysis | null>(null);
	candidates = $state<HMWCandidate[]>([]);
	iterationCount = $state(0);
	isStreaming = $state(false);

	clippedIds = $derived(
		new Set(this.candidates.filter((c) => c.status === 'clipped').map((c) => c.id))
	);

	clippedCandidates = $derived(this.candidates.filter((c) => c.status === 'clipped'));

	setPersona(persona: Persona): void {
		this.persona = persona;
	}

	updatePersona(updates: Partial<Persona>): void {
		if (this.persona) {
			this.persona = { ...this.persona, ...updates };
		}
	}

	setContext(context: ProblemContext): void {
		this.problemContext = context;
	}

	setAnalysis(analysis: HMWAnalysis): void {
		this.analysis = analysis;
	}

	addCandidates(variants: HMWVariant[], iteration: number = 0): void {
		const newCandidates: HMWCandidate[] = variants.map((variant) => ({
			id: crypto.randomUUID(),
			variant,
			status: 'generated' as CandidateStatus,
			iteration
		}));
		this.candidates = [...this.candidates, ...newCandidates];
	}

	updateCandidateStatus(id: string, status: CandidateStatus, userEdits?: string): void {
		this.candidates = this.candidates.map((c) =>
			c.id === id ? { ...c, status, ...(userEdits !== undefined ? { userEdits } : {}) } : c
		);
	}

	clipCandidate(id: string): void {
		this.updateCandidateStatus(id, 'clipped');
	}

	incrementIteration(): void {
		this.iterationCount++;
	}

	startStreaming(): void {
		this.isStreaming = true;
	}

	stopStreaming(): void {
		this.isStreaming = false;
	}

	reset(): void {
		this.persona = null;
		this.problemContext = null;
		this.analysis = null;
		this.candidates = [];
		this.iterationCount = 0;
		this.isStreaming = false;
	}

	restore(data: {
		persona: Persona | null;
		problemContext: ProblemContext | null;
		analysis: HMWAnalysis | null;
		candidates: HMWCandidate[];
		iterationCount: number;
	}): void {
		this.persona = data.persona;
		this.problemContext = data.problemContext;
		this.analysis = data.analysis;
		this.candidates = data.candidates;
		this.iterationCount = data.iterationCount;
	}
}

export const session = new SessionStore();
