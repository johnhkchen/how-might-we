function ExpandHMW(analysis: HMWAnalysis, context: ProblemContext) -> HMWExpansion {
  client Claude
  prompt #"
    Generate a diverse set of reframed "How Might We" questions based on
    this analysis. Each variant should make a clear, different "move" —
    don't just rephrase, genuinely shift the framing.

    The persona is {{ context.persona.label }}: {{ context.persona.context }}
    Their key frustrations: {% for f in context.persona.frustrations %}
      - {{ f }}{% endfor %}

    Original statement: {{ analysis.originalStatement }}
    Underlying tension: {{ analysis.underlyingTension }}
    {% if analysis.solutionBias %}Solution bias to avoid: {{ analysis.solutionBias }}{% endif %}

    Generate 6-8 variants with diverse moves. Prioritize framings that
    would generate genuinely different solution spaces in a brainstorm.

    {{ ctx.output_format }}
  "#
}
