function AnalyzeHMW(statement: string, context: ProblemContext) -> HMWAnalysis {
  client Claude
  prompt #"
    Analyze this "How Might We" question for a design thinking exercise.
    Identify what's working and what's not about its framing.

    Persona: {{ context.persona.label }} — {{ context.persona.role }}
    Domain: {{ context.domain }}
    Constraints: {% for c in context.constraints %}
      - {{ c.statement }} ({{ c.type }}){% endfor %}

    HMW Statement: {{ statement }}

    {{ ctx.output_format }}
  "#
}
