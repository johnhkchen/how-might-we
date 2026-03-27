// Mock SSE streaming data for ExpandHMW
// Simulates BAML's structured streaming — variants appear one at a time

import type { HMWVariant } from '../../src/lib/stores/session';

interface HMWExpansion {
	variants: HMWVariant[];
	emergentTheme?: string;
}

export const mockExpansionPartials: Partial<HMWExpansion>[] = [
	{
		variants: [
			{
				statement:
					'How might we help junior designers identify when an HMW question is too broad before the workshop starts?',
				move: 'narrowed',
				rationale:
					'Shifts the intervention point to preparation rather than facilitation, where the designer has more control.'
			}
		]
	},
	{
		variants: [
			{
				statement:
					'How might we help junior designers identify when an HMW question is too broad before the workshop starts?',
				move: 'narrowed',
				rationale:
					'Shifts the intervention point to preparation rather than facilitation, where the designer has more control.'
			},
			{
				statement:
					'How might we make the quality of HMW questions visible to the whole team, not just the facilitator?',
				move: 'shifted_user',
				rationale:
					'Distributes the burden of question quality across the team instead of putting it all on the junior designer.'
			}
		]
	},
	{
		variants: [
			{
				statement:
					'How might we help junior designers identify when an HMW question is too broad before the workshop starts?',
				move: 'narrowed',
				rationale:
					'Shifts the intervention point to preparation rather than facilitation, where the designer has more control.'
			},
			{
				statement:
					'How might we make the quality of HMW questions visible to the whole team, not just the facilitator?',
				move: 'shifted_user',
				rationale:
					'Distributes the burden of question quality across the team instead of putting it all on the junior designer.'
			},
			{
				statement:
					'How might we turn the constraint of being a solo designer into an advantage for workshop preparation?',
				move: 'reframed_constraint',
				rationale:
					'Reframes "only designer" from limitation to opportunity — solo designers can iterate faster without design-by-committee.'
			}
		]
	},
	{
		variants: [
			{
				statement:
					'How might we help junior designers identify when an HMW question is too broad before the workshop starts?',
				move: 'narrowed',
				rationale:
					'Shifts the intervention point to preparation rather than facilitation, where the designer has more control.'
			},
			{
				statement:
					'How might we make the quality of HMW questions visible to the whole team, not just the facilitator?',
				move: 'shifted_user',
				rationale:
					'Distributes the burden of question quality across the team instead of putting it all on the junior designer.'
			},
			{
				statement:
					'How might we turn the constraint of being a solo designer into an advantage for workshop preparation?',
				move: 'reframed_constraint',
				rationale:
					'Reframes "only designer" from limitation to opportunity — solo designers can iterate faster without design-by-committee.'
			},
			{
				statement:
					'How might we separate the skill of "writing good HMW questions" from the skill of "facilitating a good workshop"?',
				move: 'decomposed',
				rationale:
					'These are actually two different skills bundled together — a junior designer might be great at one but not the other.'
			},
			{
				statement:
					'How might we help workshop participants recognize solution-disguised-as-question HMWs in real time?',
				move: 'inverted',
				rationale:
					'Instead of the facilitator preventing bad questions, participants learn to spot them — building team capability.'
			},
			{
				statement:
					'How might we create a feedback loop between HMW question quality and ideation outcomes?',
				move: 'elevated_abstraction',
				rationale:
					'Connects question quality to downstream results, making the abstract "is this a good question" concrete and measurable.'
			}
		],
		emergentTheme:
			'Several framings shift responsibility away from the solo facilitator — suggesting the real leverage point is team capability, not individual skill.'
	}
];

export const mockExpansionFinal: HMWExpansion =
	mockExpansionPartials[mockExpansionPartials.length - 1] as HMWExpansion;

export function expansionSSEStream(): string[] {
	return [
		...mockExpansionPartials.map((e) => `data: ${JSON.stringify(e)}`),
		'data: [DONE]'
	];
}
