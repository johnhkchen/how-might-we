// Mock SSE streaming data for RefinePersona
// Simulates BAML's structured streaming — fields fill in progressively

import type { Persona } from '../../src/lib/stores/session';

export const mockPersonaPartials: Partial<Persona>[] = [
	{
		label: 'Junior Designer'
	},
	{
		label: 'Junior Designer',
		role: 'Product Designer'
	},
	{
		label: 'Junior Designer',
		role: 'Product Designer',
		goals: ['Run effective workshops']
	},
	{
		label: 'Junior Designer',
		role: 'Product Designer',
		goals: ['Run effective workshops', 'Earn trust from senior stakeholders']
	},
	{
		label: 'Junior Designer',
		role: 'Product Designer',
		goals: [
			'Run effective workshops',
			'Earn trust from senior stakeholders',
			'Generate actionable insights from research'
		],
		frustrations: ['Workshops feel unfocused']
	},
	{
		label: 'Junior Designer',
		role: 'Product Designer',
		goals: [
			'Run effective workshops',
			'Earn trust from senior stakeholders',
			'Generate actionable insights from research'
		],
		frustrations: [
			'Workshops feel unfocused',
			'HMW questions always drift into solutions',
			"Doesn't know if the questions are 'good enough'"
		],
		context:
			'Works at a mid-size SaaS company (50-200 employees). Only designer on their product team. Runs workshops 2-3 times per quarter.',
		influencers: [
			'Product manager (sets priorities)',
			'Engineering lead (judges feasibility)',
			'Design Twitter / community posts'
		]
	}
];

export const mockPersonaFinal: Persona = mockPersonaPartials[mockPersonaPartials.length - 1] as Persona;

export function personaSSEStream(): string[] {
	return [
		...mockPersonaPartials.map((p) => `data: ${JSON.stringify(p)}`),
		'data: [DONE]'
	];
}
