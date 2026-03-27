function RefinePersona(rawInput: string) -> Persona {
  client Claude
  prompt #"
    The user described a persona in rough terms. Turn this into a structured
    persona useful for design thinking exercises. Infer reasonable details
    from context but don't fabricate specifics the user didn't imply.

    Raw input: {{ rawInput }}

    {{ ctx.output_format }}
  "#
}

test TestRefinePersona {
  functions [RefinePersona]
  args {
    rawInput "A junior product designer at a mid-size SaaS company who feels overwhelmed running workshops"
  }
}
