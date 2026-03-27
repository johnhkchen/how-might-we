// Mock SSE streaming data for AnalyzeHMW
// Simulates BAML's structured streaming — fields build progressively

import type { HMWAnalysis } from '../../src/lib/stores/session.svelte';

export const mockAnalysisPartials: Partial<HMWAnalysis>[] = [
	{
		originalStatement: 'How might we make workshops more productive?'
	},
	{
		originalStatement: 'How might we make workshops more productive?',
		implicitUser: 'Workshop facilitator (likely the designer themselves)'
	},
	{
		originalStatement: 'How might we make workshops more productive?',
		implicitUser: 'Workshop facilitator (likely the designer themselves)',
		embeddedAssumptions: ['Workshops are currently unproductive']
	},
	{
		originalStatement: 'How might we make workshops more productive?',
		implicitUser: 'Workshop facilitator (likely the designer themselves)',
		embeddedAssumptions: [
			'Workshops are currently unproductive',
			'Productivity is the right measure (vs. creativity, alignment, etc.)',
			'The problem is the workshop format, not what happens before/after'
		],
		scopeLevel: 'too_broad'
	},
	{
		originalStatement: 'How might we make workshops more productive?',
		implicitUser: 'Workshop facilitator (likely the designer themselves)',
		embeddedAssumptions: [
			'Workshops are currently unproductive',
			'Productivity is the right measure (vs. creativity, alignment, etc.)',
			'The problem is the workshop format, not what happens before/after'
		],
		scopeLevel: 'too_broad',
		solutionBias: undefined,
		underlyingTension:
			'The facilitator needs to appear competent while learning on the job — the real problem may be confidence in the process, not the process itself.',
		initialReframing:
			'How might we help junior facilitators feel confident that their HMW questions will generate useful ideation?'
	}
];

export const mockAnalysisFinal: HMWAnalysis = mockAnalysisPartials[
	mockAnalysisPartials.length - 1
] as HMWAnalysis;

export function analysisSSEStream(): string[] {
	return [...mockAnalysisPartials.map((a) => `data: ${JSON.stringify(a)}`), 'data: [DONE]'];
}
