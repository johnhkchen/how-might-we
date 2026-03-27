function RefineHMW(session: HMWSession) -> HMWRefinement {
  client Claude
  prompt #"
    The user is iterating on HMW questions. Look at what they've selected,
    edited, and skipped to understand their direction.

    Persona: {{ session.context.persona.label }}
    Domain: {{ session.context.domain }}

    Selected/edited candidates (what resonated):
    {% for c in session.candidates %}{% if c.status == "SELECTED" or c.status == "EDITED" %}
      - {{ c.userEdits if c.userEdits else c.variant.statement }} (move: {{ c.variant.moveType }})
    {% endif %}{% endfor %}

    Skipped candidates (what didn't land):
    {% for c in session.candidates %}{% if c.status == "SKIPPED" %}
      - {{ c.variant.statement }} (move: {{ c.variant.moveType }})
    {% endif %}{% endfor %}

    Already clipped (keeper list):
    {% for c in session.candidates %}{% if c.status == "CLIPPED" %}
      - {{ c.userEdits if c.userEdits else c.variant.statement }}
    {% endif %}{% endfor %}

    Iteration: {{ session.iterationCount }}

    Generate new variants that push further in the direction the user
    is gravitating. Also note tensions between their selected framings
    and suggest which combinations would be most generative.

    {{ ctx.output_format }}
  "#
}
