// Mock SSE streaming data for RefineHMW
// Simulates BAML's structured streaming for the refinement loop

import type { HMWVariant } from '../../src/lib/stores/session';

interface HMWRefinement {
	newVariants: HMWVariant[];
	tensions: string[];
	recommendation?: string;
	suggestedNextMove?: string;
}

export const mockRefinementPartials: Partial<HMWRefinement>[] = [
	{
		newVariants: [
			{
				statement:
					'How might we give junior designers a "pre-flight checklist" for HMW questions that builds their intuition over time?',
				move: 'narrowed',
				rationale:
					'Combines the preparation focus with skill-building — the checklist is a scaffold that eventually becomes internalized.'
			}
		]
	},
	{
		newVariants: [
			{
				statement:
					'How might we give junior designers a "pre-flight checklist" for HMW questions that builds their intuition over time?',
				move: 'narrowed',
				rationale:
					'Combines the preparation focus with skill-building — the checklist is a scaffold that eventually becomes internalized.'
			},
			{
				statement:
					'How might we make it easy for the whole product team to practice HMW framing outside of formal workshops?',
				move: 'broadened',
				rationale:
					'Builds on the team capability theme — if everyone practices, the facilitator burden drops naturally.'
			},
			{
				statement:
					'How might we help junior designers see the connection between their HMW questions and the quality of ideas they generate?',
				move: 'combined',
				rationale:
					'Merges the feedback loop idea with the junior designer focus — makes learning concrete.'
			}
		],
		tensions: [
			'The "pre-flight checklist" framing assumes preparation time exists, but the "real-time detection" framing assumes it doesn\'t — which constraint is real?'
		]
	},
	{
		newVariants: [
			{
				statement:
					'How might we give junior designers a "pre-flight checklist" for HMW questions that builds their intuition over time?',
				move: 'narrowed',
				rationale:
					'Combines the preparation focus with skill-building — the checklist is a scaffold that eventually becomes internalized.'
			},
			{
				statement:
					'How might we make it easy for the whole product team to practice HMW framing outside of formal workshops?',
				move: 'broadened',
				rationale:
					'Builds on the team capability theme — if everyone practices, the facilitator burden drops naturally.'
			},
			{
				statement:
					'How might we help junior designers see the connection between their HMW questions and the quality of ideas they generate?',
				move: 'combined',
				rationale:
					'Merges the feedback loop idea with the junior designer focus — makes learning concrete.'
			}
		],
		tensions: [
			'The "pre-flight checklist" framing assumes preparation time exists, but the "real-time detection" framing assumes it doesn\'t — which constraint is real?',
			'Team capability vs. individual tool — these pull in different directions for product scope.'
		],
		recommendation:
			'The decomposed framing (separating question-writing from facilitation) pairs well with the feedback loop framing. Together they suggest a tool that helps with question prep and shows impact over time.',
		suggestedNextMove:
			'Try exploring the "preparation vs. real-time" tension — what if the tool served both moments?'
	}
];

export const mockRefinementFinal: HMWRefinement =
	mockRefinementPartials[mockRefinementPartials.length - 1] as HMWRefinement;

export function refinementSSEStream(): string[] {
	return [
		...mockRefinementPartials.map((r) => `data: ${JSON.stringify(r)}`),
		'data: [DONE]'
	];
}
